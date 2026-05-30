import {
  type Catalog,
  type Chassis,
  type Design,
  type DesignSummary,
  evaluate,
  type Issue,
  type ResourceDef,
  type Rule,
  summarize,
} from '../design/index.js';
import { jumpFuel } from '../jump.js';

/**
 * Ship domain on top of the builder-agnostic `design` engine, using MgT2 Core
 * Rulebook (2022) spacecraft-construction values.
 *
 * Thrust ratings run 1-9 (drive = Thrust% of hull); Jump 1-6 (drive =
 * Jump × 2.5% of hull, +5t, minimum 10t).
 */

export interface ShipStats extends Record<string, number> {
  hullPoints: number;
  thrust: number;
  jump: number;
  armour: number;
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

const HULL_COST_PER_TON = 0.05; // MCr (Cr50,000)
const HULL_POINTS_PER_TON = 1 / 2.5; // 1 Hull Point per full 2.5 tons
const BASIC_SYSTEMS_POWER = 0.2; // 20% of hull tonnage
const DRIVE_POWER_PER_RATING = 0.1; // 10% of hull tonnage × rating

const M_DRIVE_HULL_PCT_PER_THRUST = 0.01; // % of hull = Thrust rating
const M_DRIVE_COST_PER_TON = 2; // MCr
const J_DRIVE_HULL_PCT_PER_JUMP = 0.025; // % of hull = Jump rating × 2.5 (+5t, min 10t)
const J_DRIVE_TON_BONUS = 5;
const J_DRIVE_MIN_TONS = 10;
const J_DRIVE_COST_PER_TON = 1.5; // MCr

/** Minimum TL by Manoeuvre Drive Thrust rating (Thrust Potential table). */
const THRUST_TL: Record<number, number> = {
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
/** Minimum TL by Jump rating (Jump Potential table). */
const JUMP_TL: Record<number, number> = {
  1: 9,
  2: 11,
  3: 12,
  4: 13,
  5: 14,
  6: 15,
};
const MAX_THRUST = 9;
const MAX_JUMP = 6;

/** Hull configurations (Core Rulebook). Sphere/Reinforced are High Guard. */
export type HullConfigId = 'standard' | 'streamlined' | 'dispersed';
export interface HullConfig {
  id: HullConfigId;
  name: string;
  costMult: number;
  hullPointMult: number;
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
  powerPerTon: number;
  costPerTon: number;
  minTL: number;
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
  minTL: number;
  tonsPctPerPoint: number;
  costPctOfHullPerPoint: number;
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
const armourMax = (tl: number) => Math.min(tl, 13);

/** Computer models (Computers table). Computers consume no tonnage. */
export type ComputerId = '/5' | '/10' | '/15' | '/20' | '/25' | '/30' | '/35';
export const COMPUTERS: Record<ComputerId, { tl: number; cost: number }> = {
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
  tl: number;
  power: number;
  tons: number;
  cost: number;
}
export const SENSORS: Record<SensorId, SensorSuite> = {
  basic: { id: 'basic', name: 'Basic', tl: 0, power: 0, tons: 0, cost: 0 },
  civilian: {
    id: 'civilian',
    name: 'Civilian Grade',
    tl: 9,
    power: 0,
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
  | 'missileStorage';
export const SYSTEM_TYPES: Record<
  SystemTypeId,
  { id: SystemTypeId; label: string }
> = {
  fuelProcessor: { id: 'fuelProcessor', label: 'Fuel Processor' },
  probeDrones: { id: 'probeDrones', label: 'Probe Drones' },
  repairDrones: { id: 'repairDrones', label: 'Repair Drones' },
  miningDrones: { id: 'miningDrones', label: 'Mining Drones' },
  missileStorage: { id: 'missileStorage', label: 'Missile Storage' },
};
export interface SystemEntry {
  type: SystemTypeId;
  /** Tons allocated. */
  amount: number;
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
  | 'countermeasures'
  | 'library';
export const SOFTWARE_TYPES: Record<
  SoftwareTypeId,
  {
    id: SoftwareTypeId;
    label: string;
    costPerLevel: number;
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
  countermeasures: {
    id: 'countermeasures',
    label: 'Countermeasures',
    // Derived: electronic countermeasures program, priced near Fire Control.
    costPerLevel: 2,
    leveled: true,
    unverified: true,
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
    tons: number;
    cost: number;
    capacity: number;
    minTL: number;
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
    power: number;
    cost: number;
    minTL: number;
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
  weapon: WeaponId | 'none';
}

/** Bridge variants. Cockpit is for ships ≤50t; holographic adds +25% cost. */
export type BridgeId = 'standard' | 'cockpit' | 'holographic';

/** Bridge tonnage by ship size (Bridges table). */
function bridgeTons(hull: number): number {
  if (hull <= 50) return 3;
  if (hull <= 99) return 6;
  if (hull <= 200) return 10;
  if (hull <= 1000) return 20;
  if (hull <= 2000) return 40;
  return 60;
}

/** Hardpoints (≥100t) or firmpoints (<100t) available on a hull. */
function weaponMounts(hull: number): number {
  if (hull >= 100) return Math.floor(hull / 100);
  if (hull >= 71) return 3;
  if (hull >= 35) return 2;
  return 1;
}

/** Fuel for four weeks of power-plant operation: 10% of plant size, min 1t. */
function powerPlantFuel(plantTons: number): number {
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
    // rating = tons of fuel. No cost for fuel tankage.
    resources: (inst) => ({ tons: -(inst.rating ?? 0) }),
    describe: (inst) => `Fuel — ${inst.rating ?? 0} tons`,
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
    // options.mount (turret type) + options.weapon. A turret holds its
    // capacity of the weapon; a particle barbette is its own 5-ton mount.
    resources: (inst) => {
      const w = WEAPONS[inst.options?.weapon as WeaponId] ?? WEAPONS.beamLaser;
      if (w.barbette)
        return { tons: -5, power: -15, cost: w.cost, hardpoints: -1 };
      const mount = MOUNTS[inst.options?.mount as MountId] ?? MOUNTS.single;
      return {
        tons: -mount.tons,
        power: -(w.power * mount.capacity),
        cost: mount.cost + w.cost * mount.capacity,
        hardpoints: -1,
      };
    },
    stats: (inst) => {
      const w = WEAPONS[inst.options?.weapon as WeaponId] ?? WEAPONS.beamLaser;
      const cap = w.barbette
        ? 1
        : (MOUNTS[inst.options?.mount as MountId] ?? MOUNTS.single).capacity;
      return { turrets: 1, weapons: cap };
    },
    describe: (inst) => {
      const w = WEAPONS[inst.options?.weapon as WeaponId] ?? WEAPONS.beamLaser;
      if (w.barbette) return 'Particle Barbette';
      const m = MOUNTS[inst.options?.mount as MountId] ?? MOUNTS.single;
      return `${m.label} — ${w.label}${m.capacity > 1 ? ` ×${m.capacity}` : ''}`;
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
    // DERIVED (not Core): structural reinforcement. Each ton adds 1 Hull Point
    // and costs Cr50,000 — flagged as unverified by evaluateShip.
    resources: (inst) => {
      const t = inst.rating ?? 0;
      return { tons: -t, cost: 0.05 * t };
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
    // No tonnage; MCr1 (streamlined hulls have scoops built in, so are added
    // without this component).
    resources: () => ({ cost: 1 }),
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
  },
  missileStorage: {
    id: 'missileStorage',
    name: 'Missile Storage',
    category: 'missileStorage',
    // rating = tons of magazine (12 tons holds 144 missiles); no extra cost.
    resources: (inst) => ({ tons: -(inst.rating ?? 0) }),
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
};

// --- Assembly + rules -------------------------------------------------------

export type CrewType = 'commercial' | 'military';

export interface ShipParams {
  hullTons: number;
  tl: number;
  hullConfig: HullConfigId;
  thrust: number;
  jump: number;
  powerPlantType: PowerPlantId;
  powerPlantTons: number;
  fuelTons: number;
  bridge: BridgeId;
  armourType: ArmourTypeId;
  armourPoints: number;
  computer: ComputerId;
  computerBis: boolean;
  sensors: SensorId;
  staterooms: number;
  lowBerths: number;
  commonAreasTons: number;
  fuelScoop: boolean;
  /** Structural reinforcement, in tons (derived rules — see SHIP_RULES). */
  reinforcementTons: number;
  /** Optional tonnage-based systems (fuel processor, drones, …). */
  systems: SystemEntry[];
  /** Ship's software (cost only). */
  software: SoftwareEntry[];
  /** Weapon mounts (turret type + weapon). */
  weapons: WeaponEntry[];
  crewType: CrewType;
}

function shipHull(
  hullTons: number,
  tl: number,
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
    installed.push({ defId: 'fuel', rating: params.fuelTons });
  installed.push({ defId: 'bridge', options: { variant: params.bridge } });
  installed.push({
    defId: 'computer',
    options: { model: params.computer, bis: params.computerBis ? 1 : 0 },
  });
  installed.push({ defId: 'sensors', options: { grade: params.sensors } });
  for (const wpn of params.weapons) {
    if (wpn.weapon !== 'none')
      installed.push({
        defId: 'weapon',
        options: { mount: wpn.mount, weapon: wpn.weapon },
      });
  }
  // Streamlined hulls have fuel scoops built in (free), so only add the
  // component (MCr1) on other configurations.
  if (params.fuelScoop && params.hullConfig !== 'streamlined')
    installed.push({ defId: 'fuelScoop' });
  for (const sys of params.systems) {
    if (SYSTEM_TYPES[sys.type] && sys.amount > 0)
      installed.push({ defId: sys.type, rating: sys.amount });
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
      const w = WEAPONS[inst.options?.weapon as WeaponId];
      const m = MOUNTS[inst.options?.mount as MountId];
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
const CREW_SALARY: Record<string, number> = {
  Pilot: 6000,
  Astrogator: 5000,
  Engineer: 4000,
  Medic: 4000,
  Gunner: 2000,
  Steward: 2000,
};

export interface ShipEvaluation {
  summary: DesignSummary<ShipStats>;
  issues: Issue[];
  cargoTons: number;
  /** Power demand breakdown (for a book-style Power Requirements panel). */
  powerRequirements: {
    basic: number;
    manoeuvre: number;
    jump: number;
    sensors: number;
    fuelProcessor: number;
  };
  /** Operating crew (commercial or military). */
  crew: CrewMember[];
  /** Purchase price (MCr), monthly maintenance and crew salary (Cr). */
  runningCosts: {
    purchaseMCr: number;
    monthlyMaintenanceCr: number;
    monthlySalaryCr: number;
  };
}

/** Drive + power plant tonnage, used for the engineer crew requirement. */
function driveAndPlantTons(params: ShipParams): number {
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
 */
function crewRoster(params: ShipParams): CrewMember[] {
  const military = params.crewType === 'military';
  const roster: CrewMember[] = [{ role: 'Pilot', count: military ? 3 : 1 }];
  if (params.jump > 0) roster.push({ role: 'Astrogator', count: 1 });
  const engineers = Math.ceil(driveAndPlantTons(params) / 35);
  if (engineers > 0) roster.push({ role: 'Engineer', count: engineers });
  const guns = params.weapons.filter((w) => w.weapon !== 'none').length;
  if (guns > 0)
    roster.push({ role: 'Gunner', count: guns * (military ? 2 : 1) });

  const operating = roster.reduce((sum, c) => sum + c.count, 0);
  const passengers = Math.max(0, params.staterooms - operating);
  const medicBase = military ? operating : operating + passengers;
  const medics = Math.floor(medicBase / 120);
  if (medics > 0) roster.push({ role: 'Medic', count: medics });
  const stewards = Math.floor(passengers / 100); // Middle passengers
  if (stewards > 0) roster.push({ role: 'Steward', count: stewards });
  return roster;
}

const crewSalary = (crew: CrewMember[]): number =>
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
        fuelProcessor: 0,
      },
      crew: [],
      runningCosts: {
        purchaseMCr: 0,
        monthlyMaintenanceCr: 0,
        monthlySalaryCr: 0,
      },
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
  const unverified: string[] = [];
  if (params.reinforcementTons > 0) unverified.push('Reinforced Structure');
  if (params.software.some((s) => SOFTWARE_TYPES[s.type]?.unverified))
    unverified.push('Countermeasures');
  if (unverified.length > 0) {
    extra.push({
      severity: 'warning',
      message: `${unverified.join(' and ')} use derived rules (not from the Core Rulebook) and may be inaccurate.`,
    });
  }

  const purchaseMCr = summary.resources.cost?.used ?? 0;
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
  };
}
