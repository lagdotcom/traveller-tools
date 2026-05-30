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
 * Jump × 2.5% of hull, +5t, minimum 10t). Computer/sensors/armour are not yet
 * builder fields.
 */

export interface ShipStats extends Record<string, number> {
  hullPoints: number;
  thrust: number;
  jump: number;
  armour: number;
  staterooms: number;
  turrets: number;
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
  },
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    category: 'bridge',
    unique: true,
    resources: (_inst, ctx) => ({
      tons: -bridgeTons(ctx.chassisSize),
      cost: Math.ceil(ctx.chassisSize / 100) * 0.5, // MCr0.5 per 100t (or part)
    }),
  },
  fuel: {
    id: 'fuel',
    name: 'Fuel',
    category: 'fuel',
    // rating = tons of fuel. No cost for fuel tankage.
    resources: (inst) => ({ tons: -(inst.rating ?? 0) }),
  },
  stateroom: {
    id: 'stateroom',
    name: 'Stateroom',
    category: 'stateroom',
    resources: () => ({ tons: -4, cost: 0.5 }),
    stats: () => ({ staterooms: 1 }),
  },
  turret: {
    id: 'turret',
    name: 'Single Turret',
    category: 'weapon',
    minTL: 7,
    // A single turret mount; mounted weapons add their own power/cost.
    resources: () => ({ tons: -1, hardpoints: -1, power: -1, cost: 0.2 }),
    stats: () => ({ turrets: 1 }),
  },
};

// --- Assembly + rules -------------------------------------------------------

export interface ShipParams {
  hullTons: number;
  tl: number;
  hullConfig: HullConfigId;
  thrust: number;
  jump: number;
  powerPlantType: PowerPlantId;
  powerPlantTons: number;
  fuelTons: number;
  staterooms: number;
  turrets: number;
}

function shipHull(
  hullTons: number,
  tl: number,
  configId: HullConfigId,
): Chassis<ShipStats> {
  const config = HULL_CONFIGS[configId] ?? HULL_CONFIGS.standard;
  return {
    id: `hull-${hullTons}-${config.id}`,
    name: `${hullTons}-ton ${config.name} hull`,
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
    },
  };
}

export function makeShipDesign(params: ShipParams): Design<ShipStats> {
  const installed: Design<ShipStats>['installed'] = [{ defId: 'bridge' }];
  if (params.powerPlantTons > 0)
    installed.push({
      defId: 'powerPlant',
      rating: params.powerPlantTons,
      options: { type: params.powerPlantType },
    });
  if (params.thrust > 0)
    installed.push({ defId: 'mDrive', rating: params.thrust });
  if (params.jump > 0) installed.push({ defId: 'jDrive', rating: params.jump });
  if (params.fuelTons > 0)
    installed.push({ defId: 'fuel', rating: params.fuelTons });
  if (params.staterooms > 0)
    installed.push({ defId: 'stateroom', quantity: params.staterooms });
  if (params.turrets > 0)
    installed.push({ defId: 'turret', quantity: params.turrets });

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

export interface ShipEvaluation {
  summary: DesignSummary<ShipStats>;
  issues: Issue[];
  cargoTons: number;
}

const NUMERIC_FIELDS: Array<keyof ShipParams> = [
  'tl',
  'thrust',
  'jump',
  'powerPlantTons',
  'fuelTons',
  'staterooms',
  'turrets',
];
const FIELD_LABELS: Partial<Record<keyof ShipParams, string>> = {
  tl: 'Tech level',
  thrust: 'Thrust',
  jump: 'Jump',
  powerPlantTons: 'Power plant tonnage',
  fuelTons: 'Fuel',
  staterooms: 'Staterooms',
  turrets: 'Turrets',
};
const INTEGER_FIELDS: Array<keyof ShipParams> = [
  'tl',
  'thrust',
  'jump',
  'staterooms',
  'turrets',
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

  return {
    summary,
    issues: [...inputIssues, ...issues, ...extra],
    cargoTons: summary.resources.tons?.remaining ?? 0,
  };
}
