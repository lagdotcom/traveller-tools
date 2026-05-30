import { describe, expect, it } from 'vitest';

import type { Catalog, Chassis, Design } from './component.js';
import { evaluate, summarize, validate } from './design.js';
import type { ResourceDef } from './resources.js';

// A synthetic catalog exercising the engine independently of any real ruleset.
interface TestStats extends Record<string, number> {
  hullPoints: number;
  thrust: number;
  jump: number;
  armour: number;
  weapons: number;
}

const RESOURCES: ResourceDef[] = [
  { key: 'tons', label: 'Tons', mode: 'capacity' },
  { key: 'power', label: 'Power', mode: 'capacity' },
  { key: 'hardpoints', label: 'Hardpoints', mode: 'capacity' },
  { key: 'cost', label: 'Cost (MCr)', mode: 'accumulate' },
];

const catalog: Catalog<TestStats> = {
  powerPlant: {
    id: 'powerPlant',
    name: 'Power Plant',
    category: 'power',
    unique: true,
    resources: () => ({ tons: -4, power: 60, cost: 8 }),
  },
  mDrive: {
    id: 'mDrive',
    name: 'M-Drive',
    category: 'mdrive',
    unique: true,
    resources: (inst) => ({
      tons: -2 * (inst.rating ?? 1),
      power: -10 * (inst.rating ?? 1),
      cost: 2 * (inst.rating ?? 1),
    }),
    stats: (inst) => ({ thrust: inst.rating ?? 1 }),
  },
  jDrive: {
    id: 'jDrive',
    name: 'J-Drive',
    category: 'jdrive',
    unique: true,
    requires: ['power'],
    minTL: 9,
    resources: (inst) => ({
      tons: -3 * (inst.rating ?? 1),
      power: -15 * (inst.rating ?? 1),
      cost: 5 * (inst.rating ?? 1),
    }),
    stats: (inst) => ({ jump: inst.rating ?? 1 }),
  },
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    category: 'bridge',
    unique: true,
    resources: () => ({ tons: -10, cost: 0.5 }),
  },
  turret: {
    id: 'turret',
    name: 'Turret',
    category: 'weapon',
    resources: () => ({ tons: -1, hardpoints: -1, cost: 0.5 }),
    stats: () => ({ weapons: 1 }),
  },
  armour: {
    id: 'armour',
    name: 'Armour',
    category: 'armour',
    resources: (inst) => ({ tons: -(inst.rating ?? 0), cost: 0.1 }),
    stats: (inst) => ({ armour: inst.rating ?? 0 }),
  },
};

const hull = (size = 100): Chassis<TestStats> => ({
  id: 'hull',
  name: 'Hull',
  size,
  tl: 12,
  provides: { tons: size, hardpoints: Math.floor(size / 100), cost: 2 },
  baseStats: { hullPoints: 40, thrust: 0, jump: 0, armour: 0, weapons: 0 },
});

const design = (
  installed: Design<TestStats>['installed'],
  tl?: number,
): Design<TestStats> => ({ chassis: hull(), installed, tl });

describe('summarize', () => {
  it('computes capacity usage and remaining', () => {
    const summary = summarize(
      design([
        { defId: 'powerPlant' },
        { defId: 'mDrive', rating: 2 },
        { defId: 'bridge' },
      ]),
      catalog,
      RESOURCES,
    );

    expect(summary.resources.tons).toMatchObject({
      provided: 100,
      used: 18, // 4 + 2*2 + 10
      remaining: 82,
      overCapacity: false,
    });
    expect(summary.resources.power).toMatchObject({
      provided: 60,
      used: 20, // 10 * 2
      remaining: 40,
    });
  });

  it('accumulates cost and merges stats', () => {
    const summary = summarize(
      design([
        { defId: 'mDrive', rating: 3 },
        { defId: 'armour', rating: 5 },
      ]),
      catalog,
      RESOURCES,
    );
    // cost = hull 2 + mDrive 2*3 + armour 0.1
    expect(summary.resources.cost.used).toBeCloseTo(8.1, 6);
    expect(summary.stats.thrust).toBe(3);
    expect(summary.stats.armour).toBe(5);
    expect(summary.stats.hullPoints).toBe(40); // from chassis base
  });

  it('scales contributions by quantity', () => {
    const summary = summarize(
      design([{ defId: 'turret', quantity: 3 }]),
      catalog,
      RESOURCES,
    );
    expect(summary.resources.hardpoints.used).toBe(3);
    expect(summary.resources.tons.used).toBe(3);
    expect(summary.stats.weapons).toBe(3);
  });

  it('produces a line item per chassis + component for a breakdown', () => {
    const summary = summarize(
      design([{ defId: 'powerPlant' }, { defId: 'turret', quantity: 2 }]),
      catalog,
      RESOURCES,
    );
    expect(summary.lineItems.map((l) => l.name)).toEqual([
      'Hull',
      'Power Plant',
      'Turret',
    ]);
    const turret = summary.lineItems[2]!;
    expect(turret.quantity).toBe(2);
    expect(turret.resources.tons).toBe(-2); // -1 each, scaled by quantity
  });

  it('throws on an unknown component id', () => {
    expect(() =>
      summarize(design([{ defId: 'nope' }]), catalog, RESOURCES),
    ).toThrow(/Unknown component/);
  });
});

describe('validate', () => {
  it('passes a balanced design', () => {
    const issues = validate(
      design([
        { defId: 'powerPlant' },
        { defId: 'mDrive', rating: 2 },
        { defId: 'bridge' },
      ]),
      catalog,
      RESOURCES,
    );
    expect(issues).toEqual([]);
  });

  it('flags over-capacity', () => {
    const issues = validate(
      design([{ defId: 'armour', rating: 110 }]),
      catalog,
      RESOURCES,
    );
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Tons exceeds capacity by 10 (110/100)',
    });
  });

  it('flags an unmet requirement', () => {
    const issues = validate(
      design([{ defId: 'jDrive', rating: 1 }, { defId: 'bridge' }]),
      catalog,
      RESOURCES,
    );
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'J-Drive requires a power component',
    });
  });

  it('flags duplicate unique components', () => {
    const issues = validate(
      design([{ defId: 'bridge' }, { defId: 'bridge' }]),
      catalog,
      RESOURCES,
    );
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Only one bridge is allowed (found 2)',
    });
  });

  it('flags components above the design tech level', () => {
    const issues = validate(
      design([{ defId: 'powerPlant' }, { defId: 'jDrive', rating: 1 }], 8),
      catalog,
      RESOURCES,
    );
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'J-Drive requires TL 9 (design is TL 8)',
    });
  });

  it('evaluate returns both summary and issues', () => {
    const { summary, issues } = evaluate(
      design([{ defId: 'turret', quantity: 2 }]),
      catalog,
      RESOURCES,
    );
    expect(summary.resources.hardpoints.used).toBe(2);
    // hull provides only 1 hardpoint -> over capacity error
    expect(issues.some((i) => i.message.startsWith('Hardpoints'))).toBe(true);
  });
});
