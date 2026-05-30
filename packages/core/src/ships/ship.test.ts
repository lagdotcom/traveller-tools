import { describe, expect, it } from 'vitest';

import { evaluateShip, type ShipParams } from './ship.js';

const baseParams: ShipParams = {
  hullTons: 100,
  tl: 12,
  thrust: 1,
  jump: 1,
  powerPlantTons: 4,
  fuelTons: 12,
  staterooms: 2,
  turrets: 0,
};

describe('evaluateShip', () => {
  it('does not throw when hull tonnage is zero, and reports an issue', () => {
    // Regression: an empty hull field parses to 0; jumpFuel rejects non-positive
    // tonnage, which used to throw out of render and crash the builder.
    expect(() => evaluateShip({ ...baseParams, hullTons: 0 })).not.toThrow();
    const { issues } = evaluateShip({ ...baseParams, hullTons: 0 });
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Hull tonnage must be greater than 0',
    });
  });

  it('treats non-numeric (NaN) hull input as an empty hull, not a crash', () => {
    expect(() =>
      evaluateShip({ ...baseParams, hullTons: Number.NaN }),
    ).not.toThrow();
    const { issues, cargoTons } = evaluateShip({
      ...baseParams,
      hullTons: Number.NaN,
    });
    expect(cargoTons).toBe(0);
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Hull tonnage must be greater than 0',
    });
  });

  it('clamps negative component values and reports them', () => {
    const { summary, issues } = evaluateShip({
      ...baseParams,
      turrets: -5,
      powerPlantTons: -4,
    });
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Turrets cannot be negative',
    });
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Power plant tonnage cannot be negative',
    });
    // Clamped to 0, so budgets stay sane (no negative hardpoints/power used).
    expect(summary.resources.hardpoints.used).toBe(0);
  });

  it('flags insufficient jump fuel', () => {
    const { issues } = evaluateShip({ ...baseParams, jump: 2, fuelTons: 5 });
    expect(issues.some((i) => i.message.startsWith('Fuel: need'))).toBe(true);
  });

  it('flags a drive rating above the hull tech level', () => {
    const { issues } = evaluateShip({
      ...baseParams,
      tl: 9,
      jump: 3,
      fuelTons: 40,
    });
    // Jump-3 needs TL12.
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Jump-3 requires TL 12',
    });
  });

  it('caps Jump at 6 but allows Thrust up to 9', () => {
    expect(
      evaluateShip({ ...baseParams, jump: 7, fuelTons: 100 }).issues,
    ).toContainEqual({
      severity: 'error',
      message: 'Jump-7 exceeds the maximum of 6',
    });
    // Thrust 9 is allowed (no "exceeds the maximum" issue) at high TL.
    const thrust9 = evaluateShip({
      ...baseParams,
      tl: 15,
      thrust: 9,
      jump: 0,
      powerPlantTons: 30,
    });
    expect(
      thrust9.issues.some((i) => i.message.includes('Thrust-9 exceeds')),
    ).toBe(false);
  });

  it('matches Core Rulebook numbers for a 100-ton ship', () => {
    const { summary } = evaluateShip(baseParams);
    // 1 Hull Point per 2.5 tons -> 40.
    expect(summary.stats.hullPoints).toBe(40);
    // Power: plant 4t × 15 (TL12) = 60 provided.
    expect(summary.resources.power.provided).toBe(60);
    // Consumed: basic 20% (20) + Thrust-1 (10) + Jump-1 (10) = 40.
    expect(summary.resources.power.used).toBe(40);
  });

  it('reports remaining tonnage as cargo for a valid ship', () => {
    const { cargoTons, issues } = evaluateShip(baseParams);
    expect(issues).toEqual([]);
    // 100t hull − bridge 10 − power 4 − M-drive (1% × 100 = 1) − J-drive
    // (max(10, 2.5% × 100 + 5) = 10) − fuel 12 − staterooms 8 = 55.
    expect(cargoTons).toBe(55);
  });
});
