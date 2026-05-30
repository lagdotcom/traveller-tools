import { describe, expect, it } from 'vitest';

import { evaluateShip, type ShipParams } from './ship.js';

const baseParams: ShipParams = {
  hullTons: 100,
  tl: 12,
  thrust: 1,
  jump: 1,
  powerPlantTons: 4,
  fuelTons: 10,
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
    expect(issues.some((i) => i.message.includes('needs'))).toBe(true);
  });

  it('reports remaining tonnage as cargo for a valid ship', () => {
    const { cargoTons, issues } = evaluateShip(baseParams);
    expect(issues).toEqual([]);
    expect(cargoTons).toBeGreaterThan(0);
  });
});
