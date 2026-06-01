/**
 * A tiny build-pipeline kernel for the Field Catalogue cost/weight model.
 *
 * The FC model is "sequential-multiplicative off a modified-receiver baseline,
 * then percentage-of-baseline components" — i.e. an ordered list of operations
 * on a running cost/weight. This kernel makes that list *data*: an evaluator
 * declares its build as a sequence of `Op`s, and the engine folds them into the
 * accumulator. The line-item **breakdown is the execution trace** — emitted by
 * the ops themselves, so it can never drift from the maths.
 *
 * Two phases share one accumulator:
 *  - Phase A (`base` → `step`… → `baseline`) builds the receiver baseline by a
 *    multiplicative chain; `baseline` freezes the running total as the baseline
 *    every later component is a fraction of.
 *  - Phase B (`pctComponent` / `component`) adds components as a % of that frozen
 *    baseline (or a flat catalogue price).
 */
import { modPct, pctOf, round2 } from './shared.js';
import type { WeaponLineItem } from './types.js';

export interface Build {
  /** Running cost — full precision through Phase A, summed in Phase B. */
  cost: number;
  weight: number;
  /** The receiver baseline (rounded), frozen by `baseline`; Phase B scales off it. */
  baseCost: number;
  baseWeight: number;
  lines: WeaponLineItem[];
}

export type Op = (b: Build) => void;

/** A no-op, handy as the empty branch of a conditional `each`. */
export const noop: Op = () => {};

/** Run an op list over a fresh accumulator (optionally seeded with a baseline). */
export function runBuild(ops: Op[], seed?: Partial<Build>): Build {
  const b: Build = {
    cost: 0,
    weight: 0,
    baseCost: 0,
    baseWeight: 0,
    lines: [],
    ...seed,
  };
  for (const op of ops) op(b);
  return b;
}

// --- Control flow -----------------------------------------------------------

export const seq =
  (...ops: Op[]): Op =>
  (b) => {
    for (const op of ops) op(b);
  };

export const when = (cond: boolean, op: Op): Op => (cond ? op : noop);

export const each =
  <T>(items: readonly T[], fn: (item: T, index: number) => Op): Op =>
  (b) => {
    items.forEach((item, i) => fn(item, i)(b));
  };

// --- Phase A: the multiplicative receiver chain -----------------------------

/** Set the base cost/weight and emit the base line (no modifier shown). */
export const base =
  (label: string, cost: number, weight: number): Op =>
  (b) => {
    b.cost = cost;
    b.weight = weight;
    b.lines.push({ label, costCr: round2(cost), weightKg: round2(weight) });
  };

/**
 * A multiplicative step: multiplies the running cost/weight and emits a line
 * showing the marginal delta + the percentage modifier. A ×1/×1 step is a no-op
 * (it neither changes the total nor earns a line).
 */
export const step =
  (label: string, costMult: number, weightMult = 1): Op =>
  (b) => {
    if (costMult === 1 && weightMult === 1) return;
    b.lines.push({
      label,
      costCr: round2(b.cost * costMult - b.cost),
      weightKg: round2(b.weight * weightMult - b.weight),
      costMod: modPct(costMult),
      weightMod: modPct(weightMult),
    });
    b.cost *= costMult;
    b.weight *= weightMult;
  };

/** Freeze the running total as the baseline and emit a "totals" marker line. */
export const baseline =
  (label: string, notes?: string): Op =>
  (b) => {
    b.cost = round2(b.cost);
    b.weight = round2(b.weight);
    b.baseCost = b.cost;
    b.baseWeight = b.weight;
    b.lines.push({ label, costCr: b.cost, weightKg: b.weight, notes });
  };

// --- Phase B: components as a fraction of the baseline -----------------------

/** Add a fully-formed line computed from the current build (reads `baseCost`). */
export const component =
  (make: (b: Build) => WeaponLineItem | null): Op =>
  (b) => {
    const item = make(b);
    if (!item) return;
    b.cost += item.costCr;
    b.weight += item.weightKg;
    b.lines.push(item);
  };

/** A component priced as a percentage of the receiver baseline. */
export const pctComponent = (
  label: string,
  costFrac: number,
  weightFrac: number,
  notes?: string,
): Op =>
  component((b) => ({
    label,
    costCr: round2(b.baseCost * costFrac),
    weightKg: round2(b.baseWeight * weightFrac),
    costMod: pctOf(costFrac),
    weightMod: pctOf(weightFrac),
    notes,
  }));
