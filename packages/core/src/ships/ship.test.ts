import { describe, expect, it } from 'vitest';

import { evaluateShip, type ShipParams } from './ship.js';

const baseParams: ShipParams = {
  hullTons: 100,
  tl: 12,
  hullConfig: 'standard',
  thrust: 1,
  jump: 1,
  powerPlantType: 'fusionTL12',
  powerPlantTons: 4,
  fuelTons: 12,
  armourType: 'crystaliron',
  armourPoints: 0,
  computer: '/5',
  computerBis: false,
  sensors: 'basic',
  staterooms: 2,
  lowBerths: 0,
  commonAreasTons: 0,
  fuelProcessorTons: 0,
  fuelScoop: false,
  probeDroneTons: 0,
  repairDroneTons: 0,
  turrets: 0,
  crewType: 'commercial',
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

  it('accepts the Free Trader, whose plant cannot power everything at once', () => {
    // Book Free Trader: 200t, Thrust-1, Jump-1, 5-ton plant (75 Power). Demand
    // is basic 40 + manoeuvre 20 + jump 20 = 80 > 75, which the rules allow
    // (jump-while-manoeuvring is only a bonus). So: no errors, one power warning.
    const { issues } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      thrust: 1,
      jump: 1,
      powerPlantTons: 5,
      fuelTons: 21,
      staterooms: 10,
    });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(
      issues.some(
        (i) => i.severity === 'warning' && i.message.includes('Power'),
      ),
    ).toBe(true);
  });

  it('errors when the plant cannot even run basic systems + manoeuvre', () => {
    // 200t Thrust-2 needs basic 40 + manoeuvre 40 = 80; a 2-ton plant gives 30.
    const { issues } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      thrust: 2,
      jump: 0,
      powerPlantTons: 2,
      fuelTons: 1,
      staterooms: 0,
    });
    expect(
      issues.some(
        (i) => i.severity === 'error' && i.message.includes('basic systems'),
      ),
    ).toBe(true);
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

  it('recreates the Scout armour and sensor line items', () => {
    // Streamlined 100t scout: Crystaliron Armour 4, Military Grade sensors.
    const { summary } = evaluateShip({
      ...baseParams,
      hullConfig: 'streamlined',
      armourType: 'crystaliron',
      armourPoints: 4,
      sensors: 'military',
    });
    const line = (id: string) => summary.lineItems.find((l) => l.id === id)!;
    // Armour: 100 × 1.25% × 4 = 5 tons; cost 5% of hull cost (6) × 4 = 1.2.
    expect(line('armour').resources.tons).toBeCloseTo(-5, 6);
    expect(line('armour').resources.cost).toBeCloseTo(1.2, 6);
    // Military Grade sensors: 2 tons, 2 Power, MCr4.1.
    expect(line('sensors').resources.tons).toBe(-2);
    expect(line('sensors').resources.cost).toBe(4.1);
  });

  it('computes minimum crew and monthly maintenance', () => {
    const { crew, runningCosts } = evaluateShip(baseParams);
    const roles = crew.map((c) => c.role);
    expect(roles).toContain('Pilot');
    expect(roles).toContain('Astrogator'); // has a jump drive
    expect(roles).toContain('Engineer'); // 15t drives+plant -> 1
    // Maintenance = purchase (MCr) / 1000 / 12, expressed in Credits.
    expect(runningCosts.monthlyMaintenanceCr).toBeCloseTo(
      (runningCosts.purchaseMCr * 1000) / 12,
      6,
    );
  });

  it('applies the commercial/military crew split', () => {
    const turreted = { ...baseParams, turrets: 2 };
    const commercial = evaluateShip({ ...turreted, crewType: 'commercial' });
    const military = evaluateShip({ ...turreted, crewType: 'military' });
    const count = (crew: { role: string; count: number }[], role: string) =>
      crew.find((c) => c.role === role)?.count ?? 0;
    expect(count(commercial.crew, 'Pilot')).toBe(1);
    expect(count(military.crew, 'Pilot')).toBe(3);
    expect(count(commercial.crew, 'Gunner')).toBe(2); // 1 per turret
    expect(count(military.crew, 'Gunner')).toBe(4); // 2 per turret
  });

  it('costs the /bis computer and fuel processor', () => {
    const line = (id: string, s: ReturnType<typeof evaluateShip>) =>
      s.summary.lineItems.find((l) => l.id === id)!;
    // Computer/5bis = 0.03 × 1.5 = 0.045.
    const bis = evaluateShip({
      ...baseParams,
      computer: '/5',
      computerBis: true,
    });
    expect(line('computer', bis).resources.cost).toBeCloseTo(0.045, 6);
    // Fuel processor 2t: -2 tons, -2 Power, MCr0.1.
    const fp = evaluateShip({ ...baseParams, fuelProcessorTons: 2 });
    expect(line('fuelProcessor', fp).resources.tons).toBe(-2);
    expect(line('fuelProcessor', fp).resources.cost).toBeCloseTo(0.1, 6);
  });

  it('reports remaining tonnage as cargo for a valid ship', () => {
    const { cargoTons, issues } = evaluateShip(baseParams);
    expect(issues).toEqual([]);
    // 100t hull − bridge 10 − power 4 − M-drive (1% × 100 = 1) − J-drive
    // (max(10, 2.5% × 100 + 5) = 10) − fuel 12 − staterooms 8 = 55.
    expect(cargoTons).toBe(55);
  });
});
