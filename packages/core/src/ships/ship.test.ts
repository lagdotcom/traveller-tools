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
