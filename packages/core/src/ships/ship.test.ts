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
  bridge: 'standard',
  armourType: 'crystaliron',
  armourPoints: 0,
  computer: '/5',
  computerBis: false,
  sensors: 'basic',
  staterooms: 2,
  lowBerths: 0,
  commonAreasTons: 0,
  fuelScoop: false,
  reinforcementTons: 0,
  systems: [],
  software: [],
  weapons: [],
  carried: [],
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
      powerPlantTons: -4,
    });
    expect(issues).toContainEqual({
      severity: 'error',
      message: 'Power plant tonnage cannot be negative',
    });
    // Clamped to 0, so budgets stay sane (no negative power used).
    expect(summary.resources.power.provided).toBe(0);
  });

  it('builds turret weapons and limits them to the hull hardpoints', () => {
    // 100t hull = 1 hardpoint. A triple turret of beam lasers: 1t, power 12
    // (4×3), cost mount 1 + 0.5×3 = 2.5; two of them exceed the hardpoint.
    const one = evaluateShip({
      ...baseParams,
      weapons: [{ mount: 'triple', weapon: 'beamLaser' }],
    });
    const line = one.summary.lineItems.find((l) => l.id === 'weapon')!;
    expect(line.resources.tons).toBe(-1);
    expect(line.resources.power).toBe(-12);
    expect(line.resources.cost).toBeCloseTo(2.5, 6);
    expect(line.name).toBe('Triple Turret — Beam Laser ×3');

    const two = evaluateShip({
      ...baseParams,
      weapons: [
        { mount: 'single', weapon: 'beamLaser' },
        { mount: 'single', weapon: 'pulseLaser' },
      ],
    });
    expect(two.issues.some((i) => i.message.startsWith('Hardpoints'))).toBe(
      true,
    );
  });

  it('costs a particle barbette as a 5-ton mount', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      weapons: [{ mount: 'single', weapon: 'particleBarbette' }],
    });
    const line = summary.lineItems.find((l) => l.id === 'weapon')!;
    expect(line.resources.tons).toBe(-5);
    expect(line.resources.cost).toBe(8);
    expect(line.name).toBe('Particle Barbette');
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
    const turreted = {
      ...baseParams,
      hullTons: 200,
      weapons: [
        { mount: 'single' as const, weapon: 'beamLaser' as const },
        { mount: 'single' as const, weapon: 'beamLaser' as const },
      ],
    };
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
    // Fuel processor 2t (from the systems list): -2 tons, -2 Power, MCr0.1.
    const fp = evaluateShip({
      ...baseParams,
      systems: [{ type: 'fuelProcessor', amount: 2 }],
    });
    expect(line('fuelProcessor', fp).resources.tons).toBe(-2);
    expect(line('fuelProcessor', fp).resources.cost).toBeCloseTo(0.1, 6);
    // 1 Power per ton, and the sheet reports the daily refining capacity.
    expect(fp.powerRequirements.fuelProcessor).toBe(2);
    expect(line('fuelProcessor', fp).name).toBe('Fuel Processor — 40 tons/day');
  });

  it('costs ship software with no tonnage', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      software: [
        { type: 'jumpControl', level: 2 },
        { type: 'library', level: 0 },
      ],
    });
    const sw = summary.lineItems.filter((l) => l.id === 'software');
    expect(
      sw.find((l) => l.name === 'Jump Control/2')?.resources.cost,
    ).toBeCloseTo(0.2, 6);
    expect(sw.find((l) => l.name === 'Library')?.resources.cost ?? 0).toBe(0);
    expect(sw.every((l) => (l.resources.tons ?? 0) === 0)).toBe(true);
  });

  it('handles bridge variants and sensor power', () => {
    const line = (s: ReturnType<typeof evaluateShip>) =>
      s.summary.lineItems.find((l) => l.id === 'bridge')!;
    // Holographic bridge: 100t base cost 0.5 -> +25% = 0.625.
    const holo = evaluateShip({ ...baseParams, bridge: 'holographic' });
    expect(line(holo).resources.cost).toBeCloseTo(0.625, 6);
    // Cockpit is illegal on a 100t hull.
    expect(
      evaluateShip({ ...baseParams, bridge: 'cockpit' }).issues.some((i) =>
        i.message.includes('cockpit'),
      ),
    ).toBe(true);
    // Sensors power feeds the Power Requirements panel.
    expect(
      evaluateShip({ ...baseParams, sensors: 'military' }).powerRequirements
        .sensors,
    ).toBe(2);
  });

  it('adds reinforced-structure hull points and warns it is derived', () => {
    const base = evaluateShip(baseParams);
    const reinforced = evaluateShip({ ...baseParams, reinforcementTons: 10 });
    // +1 Hull Point per ton, and the structure shows as a line item.
    expect(reinforced.summary.stats.hullPoints).toBe(
      base.summary.stats.hullPoints + 10,
    );
    const line = reinforced.summary.lineItems.find(
      (l) => l.id === 'reinforcement',
    )!;
    expect(line.resources.tons).toBe(-10);
    expect(line.resources.cost).toBeCloseTo(0.5, 6);
    // Derived rules get a warning so the numbers aren't trusted blindly.
    expect(
      reinforced.issues.some(
        (i) => i.severity === 'warning' && /derived rules/.test(i.message),
      ),
    ).toBe(true);
  });

  it('costs derived systems by tonnage and warns they are unverified', () => {
    const { summary, issues } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      systems: [
        { type: 'hangar', amount: 20 },
        { type: 'laboratory', amount: 4 },
      ],
    });
    const line = (id: string) => summary.lineItems.find((l) => l.id === id)!;
    expect(line('hangar').resources.tons).toBe(-20);
    expect(line('hangar').resources.cost).toBeCloseTo(0.5, 6); // 0.025 × 20
    expect(line('laboratory').resources.tons).toBe(-4);
    expect(line('laboratory').resources.cost).toBeCloseTo(1, 6); // 0.25 × 4
    expect(
      issues.some(
        (i) =>
          i.severity === 'warning' &&
          i.message.includes('Hangar') &&
          i.message.includes('Laboratory'),
      ),
    ).toBe(true);
  });

  it('warns when unverified countermeasures software is installed', () => {
    const { issues } = evaluateShip({
      ...baseParams,
      software: [{ type: 'countermeasures', level: 1 }],
    });
    expect(
      issues.some(
        (i) => i.severity === 'warning' && /derived rules/.test(i.message),
      ),
    ).toBe(true);
  });

  it('lets small craft mount fixed weapons but not turrets', () => {
    // A 10-ton fighter has one firmpoint; a fixed weapon is fine.
    const fighter = evaluateShip({
      ...baseParams,
      hullTons: 10,
      tl: 12,
      jump: 0,
      thrust: 6,
      powerPlantTons: 1,
      fuelTons: 1,
      bridge: 'cockpit',
      staterooms: 0,
      weapons: [{ mount: 'fixed', weapon: 'beamLaser' }],
    });
    expect(fighter.issues.filter((i) => i.severity === 'error')).toEqual([]);
    // A turret on the same small craft is rejected.
    const turreted = evaluateShip({
      ...baseParams,
      hullTons: 10,
      tl: 12,
      jump: 0,
      thrust: 6,
      powerPlantTons: 1,
      fuelTons: 1,
      bridge: 'cockpit',
      staterooms: 0,
      weapons: [{ mount: 'triple', weapon: 'beamLaser' }],
    });
    expect(
      turreted.issues.some(
        (i) => i.severity === 'error' && /Small craft/.test(i.message),
      ),
    ).toBe(true);
  });

  it('carries nested craft, sizing the hangar and adding their cost', () => {
    // Two 10-ton fighters (cost MCr3 each) need a hangar of ceil(10×1.3)=13t
    // each → 26t, plus 26×0.025 = MCr0.65 of bay, plus the craft cost (MCr6).
    const { summary, issues } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      carried: [
        { kind: 'ship', name: 'Light Fighter', tons: 10, cost: 3, count: 2 },
      ],
    });
    const line = summary.lineItems.find((l) => l.id === 'carriedCraft')!;
    expect(line.resources.tons).toBe(-26);
    expect(line.resources.cost).toBeCloseTo(2 * 3 + 26 * 0.025, 6);
    expect(line.name).toBe('2× Light Fighter (hangar 26t)');
    // Hangars are a derived rule, so the build warns.
    expect(
      issues.some(
        (i) => i.severity === 'warning' && /derived rules/.test(i.message),
      ),
    ).toBe(true);
  });

  it('adds embarked small-craft crew to the carrier roster', () => {
    const count = (crew: { role: string; count: number }[], role: string) =>
      crew.find((c) => c.role === role)?.count ?? 0;
    // A carrier with two fighters that each need a pilot + gunner of their own.
    const fighter: ShipParams = {
      ...baseParams,
      hullTons: 10,
      jump: 0,
      thrust: 6,
      powerPlantTons: 1,
      fuelTons: 1,
      bridge: 'cockpit',
      staterooms: 0,
      weapons: [{ mount: 'fixed', weapon: 'beamLaser' }],
    };
    const bare = evaluateShip({ ...baseParams, hullTons: 400 });
    const carrier = evaluateShip({
      ...baseParams,
      hullTons: 400,
      carried: [
        {
          kind: 'ship',
          name: 'Light Fighter',
          tons: 10,
          cost: 3,
          count: 2,
          ship: fighter,
        },
      ],
    });
    // Two fighters add 2 pilots and 2 gunners on top of the carrier's own crew.
    expect(count(carrier.crew, 'Pilot')).toBe(count(bare.crew, 'Pilot') + 2);
    expect(count(carrier.crew, 'Gunner')).toBe(2);
    // Those extra crew are paid, too.
    expect(carrier.runningCosts.monthlySalaryCr).toBeGreaterThan(
      bare.runningCosts.monthlySalaryCr,
    );
  });

  it('reports remaining tonnage as cargo for a valid ship', () => {
    const { cargoTons, issues } = evaluateShip(baseParams);
    expect(issues).toEqual([]);
    // 100t hull − bridge 10 − power 4 − M-drive (1% × 100 = 1) − J-drive
    // (max(10, 2.5% × 100 + 5) = 10) − fuel 12 − staterooms 8 = 55.
    expect(cargoTons).toBe(55);
  });
});
