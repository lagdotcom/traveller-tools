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
 * Ship domain on top of the builder-agnostic `design` engine.
 *
 * ⚠️ ALL NUMBERS BELOW ARE PLACEHOLDERS so the builder is usable end-to-end.
 * Replace them with MgT2 Core Rulebook values (search "PLACEHOLDER"). The shapes
 * and rules are what matter; only the table values are stubbed.
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
  { key: 'power', label: 'Power', mode: 'capacity' },
  { key: 'hardpoints', label: 'Hardpoints', mode: 'capacity' },
  { key: 'cost', label: 'Cost (MCr)', mode: 'accumulate' },
];

export const SHIP_CATALOG: Catalog<ShipStats> = {
  powerPlant: {
    id: 'powerPlant',
    name: 'Power Plant',
    category: 'power',
    unique: true,
    // rating = tons allocated to the plant.
    resources: (inst) => ({
      tons: -(inst.rating ?? 0),
      power: (inst.rating ?? 0) * 10, // PLACEHOLDER: power per ton
      cost: (inst.rating ?? 0) * 1, // PLACEHOLDER
    }),
  },
  mDrive: {
    id: 'mDrive',
    name: 'Manoeuvre Drive',
    category: 'mdrive',
    unique: true,
    requires: ['power'],
    // rating = Thrust.
    resources: (inst, ctx) => ({
      tons: -(ctx.chassisSize * 0.01 * (inst.rating ?? 0)), // PLACEHOLDER: 1% hull / Thrust
      power: -((inst.rating ?? 0) * 10), // PLACEHOLDER
      cost: ctx.chassisSize * 0.01 * (inst.rating ?? 0) * 2, // PLACEHOLDER
    }),
    stats: (inst) => ({ thrust: inst.rating ?? 0 }),
  },
  jDrive: {
    id: 'jDrive',
    name: 'Jump Drive',
    category: 'jdrive',
    unique: true,
    requires: ['power'],
    minTL: 9, // PLACEHOLDER
    // rating = Jump number.
    resources: (inst, ctx) => ({
      tons: -(ctx.chassisSize * 0.025 * (inst.rating ?? 0)), // PLACEHOLDER: 2.5% hull / Jump
      power: -((inst.rating ?? 0) * 10), // PLACEHOLDER
      cost: ctx.chassisSize * 0.025 * (inst.rating ?? 0) * 2, // PLACEHOLDER
    }),
    stats: (inst) => ({ jump: inst.rating ?? 0 }),
  },
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    category: 'bridge',
    unique: true,
    resources: () => ({ tons: -10, cost: 0.5 }), // PLACEHOLDER: bridge sizes by hull
  },
  fuel: {
    id: 'fuel',
    name: 'Fuel',
    category: 'fuel',
    // rating = tons of fuel.
    resources: (inst) => ({ tons: -(inst.rating ?? 0) }),
  },
  stateroom: {
    id: 'stateroom',
    name: 'Stateroom',
    category: 'stateroom',
    resources: () => ({ tons: -4, cost: 0.5 }), // PLACEHOLDER
    stats: () => ({ staterooms: 1 }),
  },
  turret: {
    id: 'turret',
    name: 'Turret',
    category: 'weapon',
    resources: () => ({ tons: -1, hardpoints: -1, cost: 0.2 }), // PLACEHOLDER
    stats: () => ({ turrets: 1 }),
  },
};

export interface ShipParams {
  hullTons: number;
  tl: number;
  thrust: number;
  jump: number;
  powerPlantTons: number;
  fuelTons: number;
  staterooms: number;
  turrets: number;
}

/** Build a hull chassis. PLACEHOLDER cost/hull-point formulas. */
function shipHull(hullTons: number, tl: number): Chassis<ShipStats> {
  return {
    id: `hull-${hullTons}`,
    name: `${hullTons}-ton hull`,
    size: hullTons,
    tl,
    provides: {
      tons: hullTons,
      hardpoints: Math.floor(hullTons / 100),
      cost: hullTons * 0.05, // PLACEHOLDER: MCr per ton
    },
    baseStats: {
      hullPoints: Math.round(hullTons * 0.4), // PLACEHOLDER
      thrust: 0,
      jump: 0,
      armour: 0,
      staterooms: 0,
      turrets: 0,
    },
  };
}

/** Map the builder's parameters to an engine `Design`. */
export function makeShipDesign(params: ShipParams): Design<ShipStats> {
  const installed: Design<ShipStats>['installed'] = [{ defId: 'bridge' }];
  if (params.powerPlantTons > 0)
    installed.push({ defId: 'powerPlant', rating: params.powerPlantTons });
  if (params.thrust > 0)
    installed.push({ defId: 'mDrive', rating: params.thrust });
  if (params.jump > 0) installed.push({ defId: 'jDrive', rating: params.jump });
  if (params.fuelTons > 0)
    installed.push({ defId: 'fuel', rating: params.fuelTons });
  if (params.staterooms > 0)
    installed.push({ defId: 'stateroom', quantity: params.staterooms });
  if (params.turrets > 0)
    installed.push({ defId: 'turret', quantity: params.turrets });

  return { chassis: shipHull(params.hullTons, params.tl), installed };
}

/** Ship-specific rules layered onto the generic validator. */
export const SHIP_RULES: Rule<ShipStats>[] = [
  // A ship that can move/jump needs a power plant (also covered by `requires`,
  // but this gives a friendlier message when nothing is installed).
  ({ design }) => {
    const hasPower = design.installed.some((c) => c.defId === 'powerPlant');
    const hasDrive = design.installed.some(
      (c) => c.defId === 'mDrive' || c.defId === 'jDrive',
    );
    return hasDrive && !hasPower
      ? [{ severity: 'error', message: 'Drives require a power plant' }]
      : [];
  },
];

export interface ShipEvaluation {
  summary: DesignSummary<ShipStats>;
  issues: Issue[];
  cargoTons: number;
}

const FIELD_LABELS: Record<keyof ShipParams, string> = {
  hullTons: 'Hull tonnage',
  tl: 'Tech level',
  thrust: 'Thrust',
  jump: 'Jump',
  powerPlantTons: 'Power plant tonnage',
  fuelTons: 'Fuel',
  staterooms: 'Staterooms',
  turrets: 'Turrets',
};

/**
 * Clamp out-of-range builder input to safe values and record an issue for each
 * adjustment. Non-numeric fields arrive here as NaN (the screen's parser falls
 * back to 0) and negatives are clamped to 0. Hull tonnage is handled separately
 * by `evaluateShip` so it gets a single clear message.
 */
function sanitizeParams(raw: ShipParams, issues: Issue[]): ShipParams {
  const out = { ...raw };
  for (const key of Object.keys(out) as Array<keyof ShipParams>) {
    if (key === 'hullTons') continue;
    let value = out[key];
    if (!Number.isFinite(value)) value = 0;
    if (value < 0) {
      issues.push({
        severity: 'error',
        message: `${FIELD_LABELS[key]} cannot be negative`,
      });
      value = 0;
    }
    out[key] = value;
  }
  return out;
}

/** Evaluate a ship from builder parameters: budgets, issues, and cargo space. */
export function evaluateShip(raw: ShipParams): ShipEvaluation {
  const inputIssues: Issue[] = [];
  const params = sanitizeParams(raw, inputIssues);

  // An empty / zero / negative / non-numeric hull can't be costed or budgeted;
  // short-circuit with a single clear message and an empty budget.
  if (!(params.hullTons > 0)) {
    const design: Design<ShipStats> = {
      chassis: shipHull(0, params.tl),
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

  const extra: Issue[] = [];
  if (params.jump > 0) {
    const needed = jumpFuel(params.hullTons, params.jump).fuelTons;
    if (params.fuelTons < needed) {
      extra.push({
        severity: 'error',
        message: `Jump-${params.jump} needs ${needed} tons of fuel (have ${params.fuelTons})`,
      });
    }
  }

  return {
    summary,
    issues: [...inputIssues, ...issues, ...extra],
    cargoTons: summary.resources.tons?.remaining ?? 0,
  };
}
