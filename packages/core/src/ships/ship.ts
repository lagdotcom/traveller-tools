import {
  type Catalog,
  type Chassis,
  type Design,
  type DesignSummary,
  evaluate,
  type Evaluation,
  type Issue,
  type ResourceDef,
  type Rule,
  summarize,
} from '../design/index.js';
import type {
  ArmourPoints,
  Credits,
  Fraction,
  HullPoints,
  MegaCredits,
  Multiplier,
  Parsecs,
  Power,
  Rate,
  TechLevel,
  Tons,
} from '../flavours.js';
import { jumpFuel } from '../jump.js';
import type { BookSource } from '../weapons/types.js';
import type { VehicleDefinition } from './vehicles.js';

/**
 * Ship domain on top of the builder-agnostic `design` engine, using MgT2 Core
 * Rulebook (2022) spacecraft-construction values.
 *
 * Thrust ratings run 1-9 (drive = Thrust% of hull); Jump 1-6 (drive =
 * Jump × 2.5% of hull, +5t, minimum 10t).
 */

export interface ShipStats extends Record<string, number> {
  hullPoints: HullPoints;
  thrust: number;
  jump: Parsecs;
  armour: ArmourPoints;
  staterooms: number;
  turrets: number;
  weapons: number;
}

export const SHIP_RESOURCES: ResourceDef[] = [
  { key: 'tons', label: 'Tons', mode: 'capacity' },
  // Power need not run every system at once (jump while manoeuvring is a bonus,
  // sensors/weapons can be off-lined), so an overdraw is a warning; the hard
  // "basic + manoeuvre" requirement is enforced by a ship rule below.
  {
    key: 'power',
    label: 'Power',
    mode: 'capacity',
    overflowSeverity: 'warning',
  },
  { key: 'hardpoints', label: 'Hardpoints', mode: 'capacity' },
  { key: 'cost', label: 'Cost (MCr)', mode: 'accumulate' },
];

// --- Core Rulebook tables ---------------------------------------------------

const HULL_COST_PER_TON: Rate<MegaCredits, Tons> = 0.05; // MCr (Cr50,000)
const HULL_POINTS_PER_TON: Rate<HullPoints, Tons> = 1 / 2.5; // 1 Hull Point per full 2.5 tons
const BASIC_SYSTEMS_POWER = 0.2; // 20% of hull tonnage
const DRIVE_POWER_PER_RATING = 0.1; // 10% of hull tonnage × rating

const M_DRIVE_HULL_PCT_PER_THRUST = 0.01; // % of hull = Thrust rating
const M_DRIVE_COST_PER_TON: Rate<MegaCredits, Tons> = 2; // MCr
const J_DRIVE_HULL_PCT_PER_JUMP = 0.025; // % of hull = Jump rating × 2.5 (+5t, min 10t)
const J_DRIVE_TON_BONUS: Tons = 5;
const J_DRIVE_MIN_TONS: Tons = 10;
const J_DRIVE_COST_PER_TON: Rate<MegaCredits, Tons> = 1.5; // MCr

// Carried craft / docking space (Core Rulebook): a docking space takes the
// docked craft's tonnage plus 10% (round up), at MCr0.25 per ton.
const HANGAR_TONS_MULT = 1.1;
const HANGAR_COST_PER_TON: Rate<MegaCredits, Tons> = 0.25; // MCr per ton of docking space

/** Minimum TL by Manoeuvre Drive Thrust rating (Thrust Potential table). */
const THRUST_TL: Record<number, TechLevel> = {
  1: 9,
  2: 10,
  3: 10,
  4: 11,
  5: 11,
  6: 12,
  7: 12,
  8: 13,
  9: 13,
};
/**
 * Minimum TL by Jump rating (Jump Potential table). Keyed by plain `number`: a
 * `Record` index must be `string | number | symbol`, so the `Parsecs` flavour
 * can't sit on the key (it lives on the `jump`/rating fields that look this up).
 */
const JUMP_TL: Record<number, TechLevel> = {
  1: 9,
  2: 11,
  3: 12,
  4: 13,
  5: 14,
  6: 15,
};
const MAX_THRUST = 9;
const MAX_JUMP: Parsecs = 6;

/** Hull configurations (Core Rulebook). Sphere/Reinforced are High Guard. */
export type HullConfigId = 'standard' | 'streamlined' | 'dispersed';
export interface HullConfig {
  id: HullConfigId;
  name: string;
  costMult: Multiplier;
  hullPointMult: Multiplier;
  armourAllowed: boolean;
}
export const HULL_CONFIGS: Record<HullConfigId, HullConfig> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    costMult: 1,
    hullPointMult: 1,
    armourAllowed: true,
  },
  streamlined: {
    id: 'streamlined',
    name: 'Streamlined',
    costMult: 1.2,
    hullPointMult: 1,
    armourAllowed: true,
  },
  dispersed: {
    id: 'dispersed',
    name: 'Dispersed Structure',
    costMult: 0.5,
    hullPointMult: 0.9,
    armourAllowed: false,
  },
};

/** Power plant types (Power Plant table). The plant type is a design choice. */
export type PowerPlantId = 'fusionTL8' | 'fusionTL12' | 'fusionTL15';
export interface PowerPlantType {
  id: PowerPlantId;
  name: string;
  powerPerTon: Rate<Power, Tons>;
  costPerTon: Rate<MegaCredits, Tons>;
  minTL: TechLevel;
}
export const POWER_PLANTS: Record<PowerPlantId, PowerPlantType> = {
  fusionTL8: {
    id: 'fusionTL8',
    name: 'Fusion (TL8)',
    powerPerTon: 10,
    costPerTon: 0.5,
    minTL: 8,
  },
  fusionTL12: {
    id: 'fusionTL12',
    name: 'Fusion (TL12)',
    powerPerTon: 15,
    costPerTon: 1,
    minTL: 12,
  },
  fusionTL15: {
    id: 'fusionTL15',
    name: 'Fusion (TL15)',
    powerPerTon: 20,
    costPerTon: 2,
    minTL: 15,
  },
};
const DEFAULT_PLANT: PowerPlantId = 'fusionTL12';

/** Armour types (Hull Armour table). Cost is a % of the hull's cost per point. */
export type ArmourTypeId = 'crystaliron' | 'bondedSuperdense';
export interface ArmourType {
  id: ArmourTypeId;
  name: string;
  minTL: TechLevel;
  tonsPctPerPoint: Rate<Fraction, ArmourPoints>;
  costPctOfHullPerPoint: Rate<Fraction, ArmourPoints>;
}
export const ARMOUR_TYPES: Record<ArmourTypeId, ArmourType> = {
  crystaliron: {
    id: 'crystaliron',
    name: 'Crystaliron',
    minTL: 10,
    tonsPctPerPoint: 0.0125,
    costPctOfHullPerPoint: 0.05,
  },
  bondedSuperdense: {
    id: 'bondedSuperdense',
    name: 'Bonded Superdense',
    minTL: 14,
    tonsPctPerPoint: 0.008,
    costPctOfHullPerPoint: 0.08,
  },
};
/** Maximum armour Protection: TL, or 13, whichever is less. */
const armourMax = (tl: TechLevel) => Math.min(tl, 13);

/** Computer models (Computers table). Computers consume no tonnage. */
export type ComputerId = '/5' | '/10' | '/15' | '/20' | '/25' | '/30' | '/35';
export const COMPUTERS: Record<
  ComputerId,
  { tl: TechLevel; cost: MegaCredits }
> = {
  '/5': { tl: 7, cost: 0.03 },
  '/10': { tl: 9, cost: 0.16 },
  '/15': { tl: 11, cost: 2 },
  '/20': { tl: 12, cost: 5 },
  '/25': { tl: 13, cost: 10 },
  '/30': { tl: 14, cost: 20 },
  '/35': { tl: 15, cost: 30 },
};

/** Sensor suites (Sensors table). */
export type SensorId =
  | 'basic'
  | 'civilian'
  | 'military'
  | 'improved'
  | 'advanced';
export interface SensorSuite {
  id: SensorId;
  name: string;
  tl: TechLevel;
  power: Power;
  tons: Tons;
  cost: MegaCredits;
}
export const SENSORS: Record<SensorId, SensorSuite> = {
  basic: { id: 'basic', name: 'Basic', tl: 8, power: 0, tons: 0, cost: 0 },
  civilian: {
    id: 'civilian',
    name: 'Civilian Grade',
    tl: 9,
    power: 1,
    tons: 1,
    cost: 3,
  },
  military: {
    id: 'military',
    name: 'Military Grade',
    tl: 10,
    power: 2,
    tons: 2,
    cost: 4.1,
  },
  improved: {
    id: 'improved',
    name: 'Improved',
    tl: 12,
    power: 4,
    tons: 3,
    cost: 4.3,
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    tl: 15,
    power: 6,
    tons: 5,
    cost: 5.3,
  },
};

/**
 * Tonnage-based optional systems offered by the builder's Systems list. Each
 * entry's `type` matches the catalog component id, so they map directly.
 */
export type SystemTypeId =
  | 'fuelProcessor'
  | 'probeDrones'
  | 'repairDrones'
  | 'miningDrones'
  | 'missileStorage'
  | 'hangar'
  | 'cargoCrane'
  | 'laboratory'
  | 'libraryRoom'
  | 'workshop'
  | 'medicalBay'
  | 'multiEnvironment'
  | 'cabinSpace'
  | 'aerofins'
  | 'cargoScoop'
  | 'collapsibleFuel'
  | 'concealedCompartment'
  | 'sensorStation'
  | 'highStateroom'
  | 'luxuryStateroom';
export const SYSTEM_TYPES: Record<
  SystemTypeId,
  {
    id: SystemTypeId;
    label: string;
    /** Derived from non-Core (High Guard) material; flagged in the builder. */
    unverified?: boolean;
  }
> = {
  fuelProcessor: { id: 'fuelProcessor', label: 'Fuel Processor' },
  probeDrones: { id: 'probeDrones', label: 'Probe Drones' },
  repairDrones: { id: 'repairDrones', label: 'Repair Drones' },
  miningDrones: { id: 'miningDrones', label: 'Mining Drones' },
  missileStorage: { id: 'missileStorage', label: 'Missile Storage' },
  hangar: { id: 'hangar', label: 'Hangar / Docking Space' },
  cargoCrane: { id: 'cargoCrane', label: 'Cargo Crane' },
  laboratory: { id: 'laboratory', label: 'Laboratory' },
  libraryRoom: { id: 'libraryRoom', label: 'Library Room' },
  workshop: { id: 'workshop', label: 'Workshop' },
  medicalBay: { id: 'medicalBay', label: 'Medical Bay' },
  multiEnvironment: {
    id: 'multiEnvironment',
    label: 'Multi-Environment Space',
  },
  cabinSpace: { id: 'cabinSpace', label: 'Cabin Space' },
  aerofins: { id: 'aerofins', label: 'Aerofins' },
  cargoScoop: { id: 'cargoScoop', label: 'Cargo Scoop' },
  collapsibleFuel: { id: 'collapsibleFuel', label: 'Collapsible Fuel Tank' },
  concealedCompartment: {
    id: 'concealedCompartment',
    label: 'Concealed Compartment',
  },
  sensorStation: { id: 'sensorStation', label: 'Sensor Station' },
  highStateroom: { id: 'highStateroom', label: 'High Staterooms' },
  luxuryStateroom: { id: 'luxuryStateroom', label: 'Luxury Staterooms' },
};
export interface SystemEntry {
  type: SystemTypeId;
  /** Tons allocated. */
  amount: Tons;
}

/**
 * Ship's software (cost only, no tonnage). Leveled packages cost per level;
 * Library is a flat free package. (Bandwidth vs computer Processing isn't
 * modelled yet.)
 */
export type SoftwareTypeId =
  | 'jumpControl'
  | 'evade'
  | 'fireControl'
  | 'autoRepair'
  | 'manoeuvre'
  | 'intellect'
  | 'library';
export const SOFTWARE_TYPES: Record<
  SoftwareTypeId,
  {
    id: SoftwareTypeId;
    label: string;
    costPerLevel: MegaCredits;
    leveled: boolean;
    /** Derived from non-Core sources (High Guard); flagged in the builder. */
    unverified?: boolean;
  }
> = {
  jumpControl: {
    id: 'jumpControl',
    label: 'Jump Control',
    costPerLevel: 0.1,
    leveled: true,
  },
  evade: { id: 'evade', label: 'Evade', costPerLevel: 1, leveled: true },
  fireControl: {
    id: 'fireControl',
    label: 'Fire Control',
    costPerLevel: 2,
    leveled: true,
  },
  autoRepair: {
    id: 'autoRepair',
    label: 'Auto-Repair',
    costPerLevel: 5,
    leveled: true,
  },
  // Manoeuvre/0 and Intellect ship in every loadout at no listed cost in the
  // common-spacecraft examples.
  manoeuvre: {
    id: 'manoeuvre',
    label: 'Manoeuvre',
    costPerLevel: 0,
    leveled: false,
  },
  intellect: {
    id: 'intellect',
    label: 'Intellect',
    costPerLevel: 0,
    leveled: false,
  },
  library: { id: 'library', label: 'Library', costPerLevel: 0, leveled: false },
};
export interface SoftwareEntry {
  type: SoftwareTypeId;
  /** Program level (ignored for non-leveled packages). */
  level: number;
}

/** Turret / fixed mounts (Turrets and Fixed Mounts table). */
export type MountId = 'fixed' | 'single' | 'double' | 'triple';
export const MOUNTS: Record<
  MountId,
  {
    id: MountId;
    label: string;
    tons: Tons;
    cost: MegaCredits;
    capacity: number;
    minTL: TechLevel;
  }
> = {
  fixed: {
    id: 'fixed',
    label: 'Fixed Mount',
    tons: 0,
    cost: 0.1,
    capacity: 1,
    minTL: 0,
  },
  single: {
    id: 'single',
    label: 'Single Turret',
    tons: 1,
    cost: 0.2,
    capacity: 1,
    minTL: 7,
  },
  double: {
    id: 'double',
    label: 'Double Turret',
    tons: 1,
    cost: 0.5,
    capacity: 2,
    minTL: 8,
  },
  triple: {
    id: 'triple',
    label: 'Triple Turret',
    tons: 1,
    cost: 1,
    capacity: 3,
    minTL: 9,
  },
};

/** Turret weapons (Turret Weapons table). Particle barbette is a 5-ton mount. */
export type WeaponId =
  | 'beamLaser'
  | 'pulseLaser'
  | 'missileRack'
  | 'sandcaster'
  | 'particleBarbette';
export const WEAPONS: Record<
  WeaponId,
  {
    id: WeaponId;
    label: string;
    power: Power;
    cost: MegaCredits;
    minTL: TechLevel;
    barbette?: boolean;
  }
> = {
  beamLaser: {
    id: 'beamLaser',
    label: 'Beam Laser',
    power: 4,
    cost: 0.5,
    minTL: 10,
  },
  pulseLaser: {
    id: 'pulseLaser',
    label: 'Pulse Laser',
    power: 4,
    cost: 1,
    minTL: 9,
  },
  missileRack: {
    id: 'missileRack',
    label: 'Missile Rack',
    power: 0,
    cost: 0.75,
    minTL: 7,
  },
  sandcaster: {
    id: 'sandcaster',
    label: 'Sandcaster',
    power: 0,
    cost: 0.25,
    minTL: 9,
  },
  particleBarbette: {
    id: 'particleBarbette',
    label: 'Particle Barbette',
    power: 15,
    cost: 8,
    minTL: 11,
    barbette: true,
  },
};
export interface WeaponEntry {
  mount: MountId;
  /** Weapons fitted in the mount (0..mount capacity); mixed types allowed. */
  weapons: WeaponId[];
}

/** Bridge variants. Cockpit is for ships ≤50t; holographic adds +25% cost. */
export type BridgeId = 'standard' | 'cockpit' | 'holographic';

/** Bridge tonnage by ship size (Bridges table). */
function bridgeTons(hull: Tons): Tons {
  if (hull <= 50) return 3;
  if (hull <= 99) return 6;
  if (hull <= 200) return 10;
  if (hull <= 1000) return 20;
  if (hull <= 2000) return 40;
  return 60;
}

/** Hardpoints (≥100t) or firmpoints (<100t) available on a hull. */
function weaponMounts(hull: Tons): number {
  if (hull >= 100) return Math.floor(hull / 100);
  if (hull >= 71) return 3;
  if (hull >= 35) return 2;
  return 1;
}

/** Fuel for four weeks of power-plant operation: 10% of plant size, min 1t. */
function powerPlantFuel(plantTons: Tons): Tons {
  return plantTons > 0 ? Math.max(1, Math.ceil(plantTons * 0.1)) : 0;
}

// --- Catalog ----------------------------------------------------------------

export const SHIP_CATALOG: Catalog<ShipStats> = {
  powerPlant: {
    id: 'powerPlant',
    name: 'Power Plant',
    category: 'power',
    unique: true,
    // rating = tons allocated; options.type = which fusion plant.
    resources: (inst) => {
      const plant =
        POWER_PLANTS[(inst.options?.type as PowerPlantId) ?? DEFAULT_PLANT] ??
        POWER_PLANTS[DEFAULT_PLANT];
      const tons = inst.rating ?? 0;
      return {
        tons: -tons,
        power: tons * plant.powerPerTon,
        cost: tons * plant.costPerTon,
      };
    },
    describe: (inst) => {
      const plant =
        POWER_PLANTS[(inst.options?.type as PowerPlantId) ?? DEFAULT_PLANT] ??
        POWER_PLANTS[DEFAULT_PLANT];
      return `Power Plant — Fusion, Power ${(inst.rating ?? 0) * plant.powerPerTon}`;
    },
  },
  mDrive: {
    id: 'mDrive',
    name: 'Manoeuvre Drive',
    category: 'mdrive',
    unique: true,
    requires: ['power'],
    // rating = Thrust.
    resources: (inst, ctx) => {
      const thrust = inst.rating ?? 0;
      const tons = ctx.chassisSize * M_DRIVE_HULL_PCT_PER_THRUST * thrust;
      return {
        tons: -tons,
        power: -(ctx.chassisSize * DRIVE_POWER_PER_RATING * thrust),
        cost: tons * M_DRIVE_COST_PER_TON,
      };
    },
    stats: (inst) => ({ thrust: inst.rating ?? 0 }),
    describe: (inst) => `Manoeuvre Drive — Thrust ${inst.rating ?? 0}`,
  },
  jDrive: {
    id: 'jDrive',
    name: 'Jump Drive',
    category: 'jdrive',
    unique: true,
    requires: ['power'],
    // rating = Jump number. Tonnage = hull% + 5t, minimum 10t.
    resources: (inst, ctx) => {
      const jump = inst.rating ?? 0;
      const tons = Math.max(
        J_DRIVE_MIN_TONS,
        ctx.chassisSize * J_DRIVE_HULL_PCT_PER_JUMP * jump + J_DRIVE_TON_BONUS,
      );
      return {
        tons: -tons,
        power: -(ctx.chassisSize * DRIVE_POWER_PER_RATING * jump),
        cost: tons * J_DRIVE_COST_PER_TON,
      };
    },
    stats: (inst) => ({ jump: inst.rating ?? 0 }),
    describe: (inst) => `Jump Drive — Jump-${inst.rating ?? 0}`,
  },
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    category: 'bridge',
    unique: true,
    // options.variant: standard | cockpit (≤50t) | holographic (+25% cost).
    resources: (inst, ctx) => {
      const variant = (inst.options?.variant as BridgeId) ?? 'standard';
      if (variant === 'cockpit') return { tons: -1.5, cost: 0.01 };
      const base = Math.ceil(ctx.chassisSize / 100) * 0.5; // MCr0.5 per 100t
      return {
        tons: -bridgeTons(ctx.chassisSize),
        cost: variant === 'holographic' ? base * 1.25 : base,
      };
    },
    describe: (inst) => {
      const v = (inst.options?.variant as BridgeId) ?? 'standard';
      if (v === 'cockpit') return 'Cockpit';
      return v === 'holographic' ? 'Bridge (Holographic)' : 'Bridge';
    },
  },
  fuel: {
    id: 'fuel',
    name: 'Fuel',
    category: 'fuel',
    // rating = tons of fuel. No cost for fuel tankage. options.jump and
    // options.plantTons let the label show "J-n, N weeks operation" — the jump
    // capacity and how long the leftover fuel runs the power plant.
    resources: (inst) => ({ tons: -(inst.rating ?? 0) }),
    describe: (inst, ctx) => {
      const fuel = inst.rating ?? 0;
      const jump = Number(inst.options?.jump ?? 0);
      const plantTons = Number(inst.options?.plantTons ?? 0);
      const jumpTons =
        jump > 0 && ctx.chassisSize > 0
          ? jumpFuel(ctx.chassisSize, jump).fuelTons
          : 0;
      const per4Weeks = powerPlantFuel(plantTons);
      const weeks = Math.max(0, Math.floor((fuel - jumpTons) / per4Weeks)) * 4;
      const jumpText = jump > 0 ? `J-${jump}, ` : '';
      return `Fuel — ${jumpText}${weeks} weeks operation`;
    },
  },
  stateroom: {
    id: 'stateroom',
    name: 'Stateroom',
    category: 'stateroom',
    resources: () => ({ tons: -4, cost: 0.5 }),
    stats: () => ({ staterooms: 1 }),
  },
  weapon: {
    id: 'weapon',
    name: 'Weapon',
    category: 'weapon',
    // options.mount (turret type) + options.weapons (0..capacity weapons, mixed
    // types allowed). An empty mount still costs its tonnage, price and a
    // hardpoint; a particle barbette is its own 5-ton mount.
    resources: (inst) => {
      const mount = MOUNTS[inst.options?.mount as MountId] ?? MOUNTS.single;
      const weapons = (
        Array.isArray(inst.options?.weapons)
          ? (inst.options.weapons as WeaponId[])
          : []
      )
        .map((id) => WEAPONS[id])
        .filter((w): w is (typeof WEAPONS)[WeaponId] => Boolean(w));
      const power = weapons.reduce((s, w) => s + w.power, 0);
      const weaponCost = weapons.reduce((s, w) => s + w.cost, 0);
      // A particle barbette replaces the turret with its own 5-ton mount.
      if (weapons.some((w) => w.barbette))
        return { tons: -5, power: -power, cost: weaponCost, hardpoints: -1 };
      return {
        tons: -mount.tons,
        power: -power,
        cost: mount.cost + weaponCost,
        hardpoints: -1,
      };
    },
    stats: (inst) => ({
      turrets: 1,
      weapons: (Array.isArray(inst.options?.weapons)
        ? (inst.options.weapons as WeaponId[])
        : []
      ).length,
    }),
    describe: (inst) => {
      const m = MOUNTS[inst.options?.mount as MountId] ?? MOUNTS.single;
      const weapons = Array.isArray(inst.options?.weapons)
        ? (inst.options.weapons as WeaponId[])
        : [];
      if (weapons.length === 0) return `${m.label} (empty)`;
      if (weapons.some((id) => WEAPONS[id]?.barbette))
        return 'Particle Barbette';
      // All the same weapon: "Triple Turret — Beam Laser ×3"; otherwise list.
      const unique = [...new Set(weapons)];
      const body =
        unique.length === 1
          ? `${WEAPONS[unique[0]!]!.label}${weapons.length > 1 ? ` ×${weapons.length}` : ''}`
          : weapons.map((id) => WEAPONS[id]?.label ?? id).join(', ');
      return `${m.label} — ${body}`;
    },
  },
  armour: {
    id: 'armour',
    name: 'Armour',
    category: 'armour',
    // rating = Protection points; options.type, options.hullCost (config-adjusted).
    resources: (inst, ctx) => {
      const type =
        ARMOUR_TYPES[inst.options?.type as ArmourTypeId] ??
        ARMOUR_TYPES.crystaliron;
      const points = inst.rating ?? 0;
      const hullCost = Number(inst.options?.hullCost ?? 0);
      return {
        tons: -(ctx.chassisSize * type.tonsPctPerPoint * points),
        cost: hullCost * type.costPctOfHullPerPoint * points,
      };
    },
    stats: (inst) => ({ armour: inst.rating ?? 0 }),
    describe: (inst) => {
      const type =
        ARMOUR_TYPES[inst.options?.type as ArmourTypeId] ??
        ARMOUR_TYPES.crystaliron;
      return `Armour — ${type.name} ${inst.rating ?? 0}`;
    },
  },
  reinforcement: {
    id: 'reinforcement',
    name: 'Reinforced Structure',
    category: 'reinforcement',
    unique: true,
    minTL: 9,
    source: 'High Guard',
    // From the common-spacecraft examples: reinforcement runs MCr0.5 per ton.
    // Each ton adds ~1 Hull Point here (the book's exact Hull-Point rule isn't in
    // the construction text, so this stays flagged as approximate).
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.5 * t };
    },
    stats: (inst) => ({ hullPoints: inst.rating ?? 0 }),
    describe: (inst) => `Reinforced Structure — +${inst.rating ?? 0} HP`,
  },
  computer: {
    id: 'computer',
    name: 'Computer',
    category: 'computer',
    unique: true,
    // No tonnage; options.model picks the model, options.bis adds +50% cost
    // (Jump Control Specialisation).
    resources: (inst) => {
      const base = (
        COMPUTERS[inst.options?.model as ComputerId] ?? COMPUTERS['/5']
      ).cost;
      return { cost: inst.options?.bis ? base * 1.5 : base };
    },
    describe: (inst) =>
      `Computer${(inst.options?.model as string) ?? '/5'}${inst.options?.bis ? 'bis' : ''}`,
  },
  sensors: {
    id: 'sensors',
    name: 'Sensors',
    category: 'sensors',
    unique: true,
    resources: (inst) => {
      const s = SENSORS[inst.options?.grade as SensorId] ?? SENSORS.basic;
      return { tons: -s.tons, power: -s.power, cost: s.cost };
    },
    describe: (inst) =>
      `Sensors — ${(SENSORS[inst.options?.grade as SensorId] ?? SENSORS.basic).name}`,
  },
  lowBerth: {
    id: 'lowBerth',
    name: 'Low Berths',
    category: 'lowBerth',
    // rating = number of berths: 0.5t & Cr50,000 each, 1 Power per 10 (or part).
    resources: (inst) => {
      const n = inst.rating ?? 0;
      return { tons: -(0.5 * n), cost: 0.05 * n, power: -Math.ceil(n / 10) };
    },
    describe: (inst) => `Low Berths ×${inst.rating ?? 0}`,
  },
  commonArea: {
    id: 'commonArea',
    name: 'Common Areas',
    category: 'commonArea',
    // rating = tons of common/living space at MCr0.1 per ton.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.1 * t };
    },
  },
  fuelProcessor: {
    id: 'fuelProcessor',
    name: 'Fuel Processor',
    category: 'fuelProcessor',
    // rating = tons: Cr50,000/ton, 1 Power/ton (processes 20t/day per ton).
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, power: -t, cost: 0.05 * t };
    },
    describe: (inst) => `Fuel Processor — ${(inst.rating ?? 0) * 20} tons/day`,
  },
  fuelScoop: {
    id: 'fuelScoop',
    name: 'Fuel Scoop',
    category: 'fuelScoop',
    unique: true,
    // No tonnage; MCr1, but free on streamlined hulls (built in). Shown as a
    // line item either way (options.free marks the streamlined case).
    resources: (inst) => ({ cost: inst.options?.free ? 0 : 1 }),
  },
  probeDrones: {
    id: 'probeDrones',
    name: 'Probe Drones',
    category: 'probeDrones',
    // rating = tons: 5 drones & MCr0.5 per ton.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.5 * t };
    },
    describe: (inst) => `Probe Drones ×${(inst.rating ?? 0) * 5}`,
  },
  repairDrones: {
    id: 'repairDrones',
    name: 'Repair Drones',
    category: 'repairDrones',
    // rating = tons: MCr0.2 per ton (1% of hull recommended, min 1t).
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.2 * t };
    },
  },
  miningDrones: {
    id: 'miningDrones',
    name: 'Mining Drones',
    category: 'miningDrones',
    // rating = tons: 5 drones & MCr1 per 10 tons.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.1 * t };
    },
    describe: (inst) =>
      `Mining Drones ×${Math.floor((inst.rating ?? 0) / 10) * 5}`,
  },
  missileStorage: {
    id: 'missileStorage',
    name: 'Missile Storage',
    category: 'missileStorage',
    // rating = tons of magazine (12 tons holds 144 missiles); no extra cost.
    resources: (inst) => ({ tons: -(inst.rating ?? 0) }),
    describe: (inst) => `Missile Storage (${(inst.rating ?? 0) * 12} missiles)`,
  },
  // rating = tons in every case. Most are Core "spacecraft equipment"; only the
  // Briefing Room and Detention Cells lack a source and are flagged.
  hangar: {
    id: 'hangar',
    name: 'Hangar / Docking Space',
    category: 'hangar',
    // Generic bay; MCr0.25 per ton (Core docking space). For a specific docked
    // craft, prefer the Craft list, which sizes the bay automatically.
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.25 * (inst.rating ?? 0),
    }),
    describe: (inst) => `Hangar / Docking Space — ${inst.rating ?? 0} tons`,
  },
  cargoCrane: {
    id: 'cargoCrane',
    name: 'Cargo Crane',
    category: 'cargoCrane',
    // MCr1 per ton (Free Trader: 3 tons, MCr3).
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 1 * (inst.rating ?? 0),
    }),
  },
  laboratory: {
    id: 'laboratory',
    name: 'Laboratory',
    category: 'laboratory',
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.25 * (inst.rating ?? 0),
    }),
  },
  libraryRoom: {
    id: 'libraryRoom',
    name: 'Library Room',
    category: 'libraryRoom',
    // A physical library: 4 tons & MCr4 (MCr1/ton) — distinct from the free
    // Library software program.
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 1 * (inst.rating ?? 0),
    }),
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    category: 'workshop',
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.15 * (inst.rating ?? 0),
    }),
  },
  medicalBay: {
    id: 'medicalBay',
    name: 'Medical Bay',
    category: 'medicalBay',
    // 4 tons, MCr2 and 1 Power per bay (MCr0.5/ton; 1 Power per 4 tons).
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.5 * t, power: -Math.ceil(t / 4) };
    },
  },
  multiEnvironment: {
    id: 'multiEnvironment',
    name: 'Multi-Environment Space',
    category: 'multiEnvironment',
    // rating = tons of space; 1 ton of equipment per 20 tons of space, at
    // MCr0.5 and 1 Power per equipment ton.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      const equipment = Math.ceil(t / 20);
      return { tons: -t, cost: 0.5 * equipment, power: -equipment };
    },
  },
  cabinSpace: {
    id: 'cabinSpace',
    name: 'Cabin Space',
    category: 'cabinSpace',
    // Small-craft accommodation: 1.5 tons & MCr0.075 per cabin (MCr0.05/ton).
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.05 * (inst.rating ?? 0),
    }),
  },
  aerofins: {
    id: 'aerofins',
    name: 'Aerofins',
    category: 'aerofins',
    // 5% of hull recommended; MCr0.1 per ton.
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.1 * (inst.rating ?? 0),
    }),
  },
  cargoScoop: {
    id: 'cargoScoop',
    name: 'Cargo Scoop',
    category: 'cargoScoop',
    // 2 tons, MCr0.5 (MCr0.25/ton).
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.25 * (inst.rating ?? 0),
    }),
  },
  collapsibleFuel: {
    id: 'collapsibleFuel',
    name: 'Collapsible Fuel Tank',
    category: 'collapsibleFuel',
    // Cr500 per ton (jump fuel cannot be drawn from these).
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.0005 * (inst.rating ?? 0),
    }),
  },
  concealedCompartment: {
    id: 'concealedCompartment',
    name: 'Concealed Compartment',
    category: 'concealedCompartment',
    // Up to 5% of hull; Cr20,000 per ton.
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.02 * (inst.rating ?? 0),
    }),
  },
  sensorStation: {
    id: 'sensorStation',
    name: 'Sensor Station',
    category: 'sensorStation',
    // 1 ton & MCr0.5 per station.
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      cost: 0.5 * (inst.rating ?? 0),
    }),
    describe: (inst) => `Sensor Station ×${inst.rating ?? 0}`,
  },
  highStateroom: {
    id: 'highStateroom',
    name: 'High Staterooms',
    category: 'highStateroom',
    // 6 tons & MCr0.8 per stateroom.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: (0.8 / 6) * t };
    },
    describe: (inst) =>
      `High Staterooms ×${Math.floor((inst.rating ?? 0) / 6)}`,
  },
  luxuryStateroom: {
    id: 'luxuryStateroom',
    name: 'Luxury Staterooms',
    category: 'luxuryStateroom',
    // 10 tons & MCr1.5 per stateroom.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.15 * t };
    },
    describe: (inst) =>
      `Luxury Staterooms ×${Math.floor((inst.rating ?? 0) / 10)}`,
  },
  software: {
    id: 'software',
    name: 'Software',
    category: 'software',
    // rating = level; options.type picks the package. Cost only, no tonnage.
    resources: (inst) => {
      const sw = SOFTWARE_TYPES[inst.options?.type as SoftwareTypeId];
      if (!sw) return { cost: 0 };
      return { cost: sw.costPerLevel * (sw.leveled ? (inst.rating ?? 0) : 1) };
    },
    describe: (inst) => {
      const sw = SOFTWARE_TYPES[inst.options?.type as SoftwareTypeId];
      if (!sw) return 'Software';
      return sw.leveled ? `${sw.label}/${inst.rating ?? 0}` : sw.label;
    },
  },
  // Holographic hull (TL10): no tonnage; Cr100,000 per ton of hull and 1 Power
  // for every two tons of hull.
  holographicHull: {
    id: 'holographicHull',
    name: 'Holographic Hull',
    category: 'holographicHull',
    unique: true,
    minTL: 10,
    resources: (_inst, ctx) => ({
      cost: 0.1 * ctx.chassisSize,
      power: -Math.ceil(ctx.chassisSize / 2),
    }),
  },
  // Carried craft (ship or vehicle): consumes Core docking space (craft tons +
  // 10%) and adds both the bay's cost and the craft's own purchase price.
  carriedCraft: {
    id: 'carriedCraft',
    name: 'Carried Craft',
    category: 'carriedCraft',
    resources: (inst) => {
      const count = Math.max(0, Number(inst.options?.count ?? 1));
      const tons = Math.max(0, Number(inst.options?.tons ?? 0));
      const craftCost = Math.max(0, Number(inst.options?.cost ?? 0));
      const bay = hangarTonsFor(tons);
      return {
        tons: -(count * bay),
        cost: count * (craftCost + bay * HANGAR_COST_PER_TON),
      };
    },
    describe: (inst) => {
      const count = Math.max(1, Number(inst.options?.count ?? 1));
      const name = String(inst.options?.name ?? 'Craft');
      const bay = hangarTonsFor(Math.max(0, Number(inst.options?.tons ?? 0)));
      const carries = Array.isArray(inst.options?.carries)
        ? (inst.options.carries as string[])
        : [];
      const carryText = carries.length
        ? ` — carrying ${carries.join(', ')}`
        : '';
      return `${count > 1 ? `${count}× ` : ''}${name} (hangar ${count * bay}t)${carryText}`;
    },
  },
};

// --- Assembly + rules -------------------------------------------------------

export type CrewType = 'commercial' | 'military';

/**
 * Something carried inside a hangar / docking space. Kept deliberately generic:
 * the hangar maths only needs `tons`, `cost`, `count` and `name`, which a
 * vehicle can supply just as well as a ship. The typed payload (`ship` now;
 * `vehicle` later) is optional and only lets the UI re-open the nested design.
 */
export type CarriedCraftKind = 'ship' | 'vehicle';
export interface CarriedCraft {
  kind: CarriedCraftKind;
  name: string;
  /** The craft's own displacement in tons (drives the hangar size). */
  tons: Tons;
  /** The craft's purchase cost in MCr (added to the carrier's price). */
  cost: MegaCredits;
  count: number;
  /** Full nested ship design (kind === 'ship'); lets the builder re-open it. */
  ship?: ShipParams;
  /** The catalogue vehicle (kind === 'vehicle'). */
  vehicle?: VehicleDefinition;
}

/** Hangar space a single craft of this size requires (Core: bay + 10%). */
export function hangarTonsFor(craftTons: Tons): Tons {
  return Math.ceil(craftTons * HANGAR_TONS_MULT);
}

export interface ShipParams {
  hullTons: Tons;
  tl: TechLevel;
  hullConfig: HullConfigId;
  thrust: number;
  jump: Parsecs;
  powerPlantType: PowerPlantId;
  powerPlantTons: Tons;
  fuelTons: Tons;
  bridge: BridgeId;
  armourType: ArmourTypeId;
  armourPoints: ArmourPoints;
  computer: ComputerId;
  computerBis: boolean;
  sensors: SensorId;
  staterooms: number;
  lowBerths: number;
  commonAreasTons: Tons;
  fuelScoop: boolean;
  /** Holographic hull skin (TL10): cosmetic, draws power, no tonnage. */
  holographicHull: boolean;
  /** Structural reinforcement, in tons (derived rules — see SHIP_RULES). */
  reinforcementTons: Tons;
  /** Optional tonnage-based systems (fuel processor, drones, …). */
  systems: SystemEntry[];
  /** Ship's software (cost only). */
  software: SoftwareEntry[];
  /** Weapon mounts (turret type + weapon). */
  weapons: WeaponEntry[];
  /** Small craft (and, later, vehicles) carried in hangars / docking space. */
  carried: CarriedCraft[];
  crewType: CrewType;
  /** Standard (production) design: 10% off the purchase price. */
  standardDesign: boolean;
}

function shipHull(
  hullTons: Tons,
  tl: TechLevel,
  configId: HullConfigId,
): Chassis<ShipStats> {
  const config = HULL_CONFIGS[configId] ?? HULL_CONFIGS.standard;
  return {
    id: `hull-${hullTons}-${config.id}`,
    name: `Hull — ${hullTons} tons, ${config.name}`,
    size: hullTons,
    tl,
    provides: {
      tons: hullTons,
      hardpoints: weaponMounts(hullTons),
      cost: hullTons * HULL_COST_PER_TON * config.costMult,
      power: -(hullTons * BASIC_SYSTEMS_POWER), // basic ship systems draw
    },
    baseStats: {
      hullPoints: Math.floor(
        hullTons * HULL_POINTS_PER_TON * config.hullPointMult,
      ),
      thrust: 0,
      jump: 0,
      armour: 0,
      staterooms: 0,
      turrets: 0,
      weapons: 0,
    },
  };
}

export function makeShipDesign(params: ShipParams): Design<ShipStats> {
  const config = HULL_CONFIGS[params.hullConfig] ?? HULL_CONFIGS.standard;
  const hullCost = params.hullTons * HULL_COST_PER_TON * config.costMult;

  // Installed in Core Rulebook sheet order (the hull chassis is listed first):
  // Armour, M-Drive, J-Drive, Power Plant, Fuel, Bridge, Computer, Sensors,
  // Weapons, Systems, Staterooms, Low Berths, Common Areas.
  const installed: Design<ShipStats>['installed'] = [];
  if (params.armourPoints > 0)
    installed.push({
      defId: 'armour',
      rating: params.armourPoints,
      options: { type: params.armourType, hullCost },
    });
  if (params.reinforcementTons > 0)
    installed.push({
      defId: 'reinforcement',
      rating: params.reinforcementTons,
    });
  if (params.thrust > 0)
    installed.push({ defId: 'mDrive', rating: params.thrust });
  if (params.jump > 0) installed.push({ defId: 'jDrive', rating: params.jump });
  if (params.powerPlantTons > 0)
    installed.push({
      defId: 'powerPlant',
      rating: params.powerPlantTons,
      options: { type: params.powerPlantType },
    });
  if (params.fuelTons > 0)
    installed.push({
      defId: 'fuel',
      rating: params.fuelTons,
      options: { jump: params.jump, plantTons: params.powerPlantTons },
    });
  installed.push({ defId: 'bridge', options: { variant: params.bridge } });
  installed.push({
    defId: 'computer',
    options: { model: params.computer, bis: params.computerBis ? 1 : 0 },
  });
  installed.push({ defId: 'sensors', options: { grade: params.sensors } });
  for (const wpn of params.weapons) {
    // Always install the mount; an empty mount still costs its tonnage, price
    // and hardpoint (e.g. an unarmed turret).
    installed.push({
      defId: 'weapon',
      options: { mount: wpn.mount, weapons: wpn.weapons },
    });
  }
  // Always list the fuel scoop; it's free on streamlined hulls (built in) and
  // MCr1 on other configurations.
  if (params.fuelScoop)
    installed.push({
      defId: 'fuelScoop',
      options: { free: params.hullConfig === 'streamlined' ? 1 : 0 },
    });
  if (params.holographicHull) installed.push({ defId: 'holographicHull' });
  for (const sys of params.systems) {
    if (SYSTEM_TYPES[sys.type] && sys.amount > 0)
      installed.push({ defId: sys.type, rating: sys.amount });
  }
  for (const craft of params.carried) {
    if (craft.count > 0 && craft.tons > 0)
      installed.push({
        defId: 'carriedCraft',
        options: {
          name: craft.name,
          tons: craft.tons,
          cost: craft.cost,
          count: craft.count,
          // Surface any craft nested inside (e.g. an ATV stored on a launch).
          carries: (craft.ship?.carried ?? []).map((c) => c.name),
        },
      });
  }
  for (const sw of params.software) {
    if (SOFTWARE_TYPES[sw.type])
      installed.push({
        defId: 'software',
        rating: sw.level,
        options: { type: sw.type },
      });
  }
  if (params.staterooms > 0)
    installed.push({ defId: 'stateroom', quantity: params.staterooms });
  if (params.lowBerths > 0)
    installed.push({ defId: 'lowBerth', rating: params.lowBerths });
  if (params.commonAreasTons > 0)
    installed.push({ defId: 'commonArea', rating: params.commonAreasTons });

  return {
    chassis: shipHull(params.hullTons, params.tl, params.hullConfig),
    installed,
  };
}

export const SHIP_RULES: Rule<ShipStats>[] = [
  // Friendlier message than the generic `requires` when nothing is installed.
  ({ design }) => {
    const hasPower = design.installed.some((c) => c.defId === 'powerPlant');
    const hasDrive = design.installed.some(
      (c) => c.defId === 'mDrive' || c.defId === 'jDrive',
    );
    return hasDrive && !hasPower
      ? [{ severity: 'error', message: 'Drives require a power plant' }]
      : [];
  },
  // Drives are gated by tech level and capped (Thrust 9, Jump 6).
  ({ design, context }) => {
    const issues: Issue[] = [];
    const check = (
      defId: string,
      label: string,
      table: Record<number, number>,
      max: number,
    ) => {
      const rating = design.installed.find((c) => c.defId === defId)?.rating;
      if (!rating) return;
      if (rating > max) {
        issues.push({
          severity: 'error',
          message: `${label}-${rating} exceeds the maximum of ${max}`,
        });
      } else if (table[rating] !== undefined && context.tl < table[rating]!) {
        issues.push({
          severity: 'error',
          message: `${label}-${rating} requires TL ${table[rating]}`,
        });
      }
    };
    check('mDrive', 'Thrust', THRUST_TL, MAX_THRUST);
    check('jDrive', 'Jump', JUMP_TL, MAX_JUMP);
    return issues;
  },
  // The power plant type is gated by tech level.
  ({ design, context }) => {
    const inst = design.installed.find((c) => c.defId === 'powerPlant');
    if (!inst) return [];
    const plant = POWER_PLANTS[inst.options?.type as PowerPlantId];
    return plant && context.tl < plant.minTL
      ? [
          {
            severity: 'error',
            message: `${plant.name} power plant requires TL ${plant.minTL}`,
          },
        ]
      : [];
  },
  // Computer, sensors and armour are gated by tech level; armour is also capped
  // and disallowed on dispersed-structure hulls.
  ({ design, context }) => {
    const issues: Issue[] = [];
    const find = (defId: string) =>
      design.installed.find((c) => c.defId === defId);

    const computer = find('computer');
    const model = COMPUTERS[computer?.options?.model as ComputerId];
    if (model && context.tl < model.tl) {
      issues.push({
        severity: 'error',
        message: `Computer${computer!.options!.model} requires TL ${model.tl}`,
      });
    }

    const sensors = find('sensors');
    const suite = SENSORS[sensors?.options?.grade as SensorId];
    if (suite && context.tl < suite.tl) {
      issues.push({
        severity: 'error',
        message: `${suite.name} sensors require TL ${suite.tl}`,
      });
    }

    const armour = find('armour');
    if (armour?.rating) {
      const type = ARMOUR_TYPES[armour.options?.type as ArmourTypeId];
      const dispersed = design.chassis.id.includes('dispersed');
      if (dispersed) {
        issues.push({
          severity: 'error',
          message: 'Dispersed-structure hulls cannot mount armour',
        });
      }
      if (type && context.tl < type.minTL) {
        issues.push({
          severity: 'error',
          message: `${type.name} armour requires TL ${type.minTL}`,
        });
      }
      if (armour.rating > armourMax(context.tl)) {
        issues.push({
          severity: 'error',
          message: `Armour Protection ${armour.rating} exceeds the maximum of ${armourMax(context.tl)}`,
        });
      }
    }
    return issues;
  },
  // Weapons (and their turret mounts) are gated by tech level.
  ({ design, context }) => {
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (const inst of design.installed) {
      if (inst.defId !== 'weapon') continue;
      const m = MOUNTS[inst.options?.mount as MountId];
      for (const id of Array.isArray(inst.options?.weapons)
        ? (inst.options.weapons as WeaponId[])
        : []) {
        const w = WEAPONS[id];
        if (!w) continue;
        const need = w.barbette ? w.minTL : Math.max(w.minTL, m?.minTL ?? 0);
        const tag = `${w.id}-${m?.id ?? ''}`;
        if (need > context.tl && !seen.has(tag)) {
          seen.add(tag);
          issues.push({
            severity: 'error',
            message: `${w.label}${w.barbette ? '' : ` (${m?.label})`} requires TL ${need}`,
          });
        }
      }
    }
    return issues;
  },
  // A mount cannot hold more weapons than its capacity (barbettes hold one).
  ({ design }) => {
    const issues: Issue[] = [];
    for (const inst of design.installed) {
      if (inst.defId !== 'weapon') continue;
      const m = MOUNTS[inst.options?.mount as MountId] ?? MOUNTS.single;
      const weapons = Array.isArray(inst.options?.weapons)
        ? (inst.options.weapons as WeaponId[])
        : [];
      const hasBarbette = weapons.some((id) => WEAPONS[id]?.barbette);
      const capacity = hasBarbette ? 1 : m.capacity;
      if (weapons.length > capacity) {
        issues.push({
          severity: 'error',
          message: `${m.label} holds at most ${capacity} weapon${capacity > 1 ? 's' : ''}`,
        });
      }
    }
    return issues;
  },
  // Hard power requirement: the plant must run basic systems + the manoeuvre
  // drive simultaneously. (Jump-at-the-same-time is only a bonus, so a total
  // overdraw is just a warning — see SHIP_RESOURCES.)
  ({ design, summary, context }) => {
    const thrust = design.installed.find((c) => c.defId === 'mDrive')?.rating;
    if (!thrust) return [];
    const required =
      context.chassisSize * BASIC_SYSTEMS_POWER +
      context.chassisSize * DRIVE_POWER_PER_RATING * thrust;
    const provided = summary.resources.power?.provided ?? 0;
    return provided < required
      ? [
          {
            severity: 'error',
            message: `Power plant must supply basic systems + manoeuvre (${required}); only ${provided} available`,
          },
        ]
      : [];
  },
];

export interface CrewMember {
  role: string;
  count: number;
}

/** Monthly salary in Credits for skill-level-1 crew (Crew Requirements table). */
const CREW_SALARY: Record<string, Credits> = {
  Pilot: 6000,
  Astrogator: 5000,
  Engineer: 4000,
  Medic: 4000,
  Gunner: 2000,
  Steward: 2000,
};

export interface ShipEvaluation extends Evaluation {
  summary: DesignSummary<ShipStats>;
  cargoTons: Tons;
  /** Power demand breakdown (for a book-style Power Requirements panel). */
  powerRequirements: {
    basic: Power;
    manoeuvre: Power;
    jump: Power;
    sensors: Power;
    weapons: Power;
    fuelProcessor: Power;
  };
  /** Operating crew (commercial or military). */
  crew: CrewMember[];
  /** Purchase price (MCr), monthly maintenance and crew salary (Cr). */
  runningCosts: {
    purchaseMCr: MegaCredits;
    monthlyMaintenanceCr: Credits;
    monthlySalaryCr: Credits;
  };
  /** Rulebooks a design draws on (always the Core Rulebook, plus any others). */
  sources: BookSource[];
}

/** The base rulebook every design uses; component `source` tags add to it. */
const BASE_SOURCE = 'Core Rulebook';

/** Books needed to build this design: the base plus any component sources. */
function designSources(design: Design<ShipStats>): BookSource[] {
  const set = new Set<BookSource>([BASE_SOURCE]);
  for (const inst of design.installed) {
    const src = SHIP_CATALOG[inst.defId]?.source;
    if (src) set.add(src);
  }
  return [...set];
}

/** Drive + power plant tonnage, used for the engineer crew requirement. */
function driveAndPlantTons(params: ShipParams): Tons {
  const m = params.hullTons * M_DRIVE_HULL_PCT_PER_THRUST * params.thrust;
  const j =
    params.jump > 0
      ? Math.max(
          J_DRIVE_MIN_TONS,
          params.hullTons * J_DRIVE_HULL_PCT_PER_JUMP * params.jump +
            J_DRIVE_TON_BONUS,
        )
      : 0;
  return m + j + params.powerPlantTons;
}

/**
 * Operating crew per the Crew Requirements table. Staterooms beyond the
 * operating crew are treated as (Middle) passengers for the medic/steward
 * counts; those formula minimums only add crew on large/passenger ships, so
 * book example sheets sometimes list a recommended medic/steward beyond this.
 *
 * Carried craft add their own crew (a fighter's pilot/gunner, etc.) on top,
 * merged by role; `depth` guards against pathological self-nesting.
 */
function crewRoster(params: ShipParams, depth = 0): CrewMember[] {
  const military = params.crewType === 'military';
  // Small craft (under 100 tons) are flown by a single pilot who covers
  // engineering and gunnery too.
  if (params.hullTons < 100) {
    const roster: CrewMember[] = [{ role: 'Pilot', count: 1 }];
    return roster;
  }
  const roster: CrewMember[] = [{ role: 'Pilot', count: military ? 3 : 1 }];
  if (params.jump > 0) roster.push({ role: 'Astrogator', count: 1 });
  const engineers = Math.ceil(driveAndPlantTons(params) / 35);
  if (engineers > 0) roster.push({ role: 'Engineer', count: engineers });
  const guns = params.weapons.filter((w) => w.weapons.length > 0).length;
  if (guns > 0)
    roster.push({ role: 'Gunner', count: guns * (military ? 2 : 1) });

  const operating = roster.reduce((sum, c) => sum + c.count, 0);
  const passengers = Math.max(0, params.staterooms - operating);
  const medicBase = military ? operating : operating + passengers;
  const medics = Math.floor(medicBase / 120);
  if (medics > 0) roster.push({ role: 'Medic', count: medics });
  const stewards = Math.floor(passengers / 100); // Middle passengers
  if (stewards > 0) roster.push({ role: 'Steward', count: stewards });

  // Crew for embarked small craft (merged by role onto the carrier's totals).
  const addCrew = (role: string, count: number) => {
    const existing = roster.find((c) => c.role === role);
    if (existing) existing.count += count;
    else roster.push({ role, count });
  };
  if (depth < 4) {
    for (const craft of params.carried) {
      if (craft.count <= 0 || !craft.ship) continue;
      // Only a full nested design adds dedicated crew; bare auxiliary entries
      // (air/rafts, vehicles) are operated by the existing crew.
      const sub = crewRoster(craft.ship, depth + 1);
      for (const member of sub)
        addCrew(member.role, member.count * craft.count);
    }
  }
  return roster;
}

const crewSalary = (crew: CrewMember[]): Credits =>
  crew.reduce((sum, c) => sum + c.count * (CREW_SALARY[c.role] ?? 0), 0);

const NUMERIC_FIELDS: Array<keyof ShipParams> = [
  'tl',
  'thrust',
  'jump',
  'powerPlantTons',
  'fuelTons',
  'armourPoints',
  'staterooms',
  'lowBerths',
  'commonAreasTons',
];
const FIELD_LABELS: Partial<Record<keyof ShipParams, string>> = {
  tl: 'Tech level',
  thrust: 'Thrust',
  jump: 'Jump',
  powerPlantTons: 'Power plant tonnage',
  fuelTons: 'Fuel',
  armourPoints: 'Armour',
  staterooms: 'Staterooms',
  lowBerths: 'Low berths',
  commonAreasTons: 'Common areas',
};
const INTEGER_FIELDS: Array<keyof ShipParams> = [
  'tl',
  'thrust',
  'jump',
  'armourPoints',
  'staterooms',
  'lowBerths',
];

/**
 * Clamp out-of-range numeric input to safe values and record an issue for each
 * adjustment. Non-numeric fields arrive as NaN (the screen falls back to 0);
 * negatives clamp to 0; integer fields are floored. Hull tonnage is handled
 * separately by `evaluateShip` so it gets a single clear message.
 */
function sanitizeParams(raw: ShipParams, issues: Issue[]): ShipParams {
  const out = { ...raw };
  for (const key of NUMERIC_FIELDS) {
    let value = out[key] as number;
    if (!Number.isFinite(value)) value = 0;
    if (value < 0) {
      issues.push({
        severity: 'error',
        message: `${FIELD_LABELS[key]} cannot be negative`,
      });
      value = 0;
    }
    if (INTEGER_FIELDS.includes(key)) value = Math.floor(value);
    (out[key] as number) = value;
  }
  return out;
}

/** Evaluate a ship from builder parameters: budgets, issues, and cargo space. */
export function evaluateShip(raw: ShipParams): ShipEvaluation {
  const inputIssues: Issue[] = [];
  const params = sanitizeParams(raw, inputIssues);

  // An empty / zero / negative / non-numeric hull can't be costed or budgeted.
  if (!(params.hullTons > 0)) {
    const design: Design<ShipStats> = {
      chassis: shipHull(0, params.tl, params.hullConfig),
      installed: [],
    };
    return {
      summary: summarize(design, SHIP_CATALOG, SHIP_RESOURCES),
      issues: [
        ...inputIssues,
        { severity: 'error', message: 'Hull tonnage must be greater than 0' },
      ],
      cargoTons: 0,
      powerRequirements: {
        basic: 0,
        manoeuvre: 0,
        jump: 0,
        sensors: 0,
        weapons: 0,
        fuelProcessor: 0,
      },
      crew: [],
      runningCosts: {
        purchaseMCr: 0,
        monthlyMaintenanceCr: 0,
        monthlySalaryCr: 0,
      },
      sources: [BASE_SOURCE],
    };
  }

  const design = makeShipDesign(params);
  const { summary, issues } = evaluate(
    design,
    SHIP_CATALOG,
    SHIP_RESOURCES,
    SHIP_RULES,
  );

  // Fuel must cover the jump plus four weeks of power-plant operation.
  const extra: Issue[] = [];
  const neededFuel =
    (params.jump > 0 ? jumpFuel(params.hullTons, params.jump).fuelTons : 0) +
    powerPlantFuel(params.powerPlantTons);
  if (neededFuel > 0 && params.fuelTons < neededFuel) {
    extra.push({
      severity: 'error',
      message: `Fuel: need ${neededFuel} tons (jump + power plant), have ${params.fuelTons}`,
    });
  }
  if (params.bridge === 'cockpit' && params.hullTons > 50) {
    extra.push({
      severity: 'error',
      message: 'A cockpit may only be used on ships of 50 tons or less',
    });
  }

  // Some options are derived from non-Core (High Guard) material we couldn't
  // verify; warn whenever one is in use so the numbers aren't trusted blindly.
  const unverified = new Set<string>();
  if (params.reinforcementTons > 0) unverified.add('Reinforced Structure');
  for (const s of params.software)
    if (SOFTWARE_TYPES[s.type]?.unverified)
      unverified.add(SOFTWARE_TYPES[s.type].label);
  for (const s of params.systems)
    if (s.amount > 0 && SYSTEM_TYPES[s.type]?.unverified)
      unverified.add(SYSTEM_TYPES[s.type].label);
  if (unverified.size > 0) {
    extra.push({
      severity: 'warning',
      message: `${[...unverified].join(', ')} use derived rules (not from the Core Rulebook) and may be inaccurate.`,
    });
  }

  // Standard (production) designs get a 10% discount off the printed purchase
  // price; the component table still shows full prices. Maintenance is 0.1% of
  // the (discounted) purchase price per year.
  const componentCost: MegaCredits = summary.resources.cost?.used ?? 0;
  const purchaseMCr: MegaCredits =
    componentCost * (params.standardDesign ? 0.9 : 1);
  const crew = crewRoster(params);
  return {
    summary,
    issues: [...inputIssues, ...issues, ...extra],
    cargoTons: summary.resources.tons?.remaining ?? 0,
    powerRequirements: {
      basic: params.hullTons * BASIC_SYSTEMS_POWER,
      manoeuvre: params.hullTons * DRIVE_POWER_PER_RATING * params.thrust,
      jump: params.hullTons * DRIVE_POWER_PER_RATING * params.jump,
      sensors: SENSORS[params.sensors]?.power ?? 0,
      // Total weapon power draw across all mounts.
      weapons: params.weapons.reduce(
        (sum, e) =>
          sum + e.weapons.reduce((s, w) => s + (WEAPONS[w]?.power ?? 0), 0),
        0,
      ),
      // Fuel processors draw 1 Power per ton installed.
      fuelProcessor: params.systems
        .filter((s) => s.type === 'fuelProcessor')
        .reduce((sum, s) => sum + Math.max(0, s.amount), 0),
    },
    crew,
    runningCosts: {
      purchaseMCr,
      // Maintenance: cost / 1000 per year, divided by 12 months (in Credits).
      monthlyMaintenanceCr: (purchaseMCr * 1000) / 12,
      monthlySalaryCr: crewSalary(crew),
    },
    sources: designSources(design),
  };
}
