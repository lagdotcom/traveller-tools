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
  holographicHull: false,
  reinforcementTons: 0,
  systems: [],
  software: [],
  weapons: [],
  carried: [],
  crewType: 'commercial',
  standardDesign: true,
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
      weapons: [
        { mount: 'triple', weapons: ['beamLaser', 'beamLaser', 'beamLaser'] },
      ],
    });
    const line = one.summary.lineItems.find((l) => l.id === 'weapon')!;
    expect(line.resources.tons).toBe(-1);
    expect(line.resources.power).toBe(-12);
    expect(line.resources.cost).toBeCloseTo(2.5, 6);
    expect(line.name).toBe('Triple Turret — Beam Laser ×3');

    const two = evaluateShip({
      ...baseParams,
      weapons: [
        { mount: 'single', weapons: ['beamLaser'] },
        { mount: 'single', weapons: ['pulseLaser'] },
      ],
    });
    expect(two.issues.some((i) => i.message.startsWith('Hardpoints'))).toBe(
      true,
    );
  });

  it('reports weapon power draw and labels low berths with a quantity', () => {
    const { summary, powerRequirements } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      lowBerths: 20,
      weapons: [{ mount: 'triple', weapons: ['beamLaser', 'beamLaser'] }],
    });
    // Two beam lasers (power 4 each) -> 8 in the Power panel.
    expect(powerRequirements.weapons).toBe(8);
    // Low berths show their count in the line name.
    const lb = summary.lineItems.find((l) => l.id === 'lowBerth')!;
    expect(lb.name).toBe('Low Berths ×20');
  });

  it('shows drone and magazine counts in line names', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      systems: [
        { type: 'probeDrones', amount: 2 }, // 5/ton -> 10
        { type: 'miningDrones', amount: 10 }, // 5 per 10t -> 5
        { type: 'missileStorage', amount: 12 }, // 12/ton -> 144
      ],
    });
    const name = (id: string) =>
      summary.lineItems.find((l) => l.id === id)!.name;
    expect(name('probeDrones')).toBe('Probe Drones ×10');
    expect(name('miningDrones')).toBe('Mining Drones ×5');
    expect(name('missileStorage')).toBe('Missile Storage (144 missiles)');
  });

  it('lists craft nested inside a carried craft (e.g. an ATV on a launch)', () => {
    const launchWithAtv: ShipParams = {
      ...baseParams,
      hullTons: 20,
      jump: 0,
      bridge: 'standard',
      carried: [
        { kind: 'vehicle', name: 'ATV', tons: 4, cost: 0.155, count: 1 },
      ],
    };
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      carried: [
        {
          kind: 'ship',
          name: 'Launch',
          tons: 20,
          cost: 5,
          count: 1,
          ship: launchWithAtv,
        },
      ],
    });
    const line = summary.lineItems.find((l) => l.id === 'carriedCraft')!;
    expect(line.name).toContain('carrying ATV');
  });

  it('costs multi-environment space with equipment power and cost', () => {
    // 8 tons of space -> 1 ton of equipment: 8t consumed, MCr0.5, 1 Power.
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      systems: [{ type: 'multiEnvironment', amount: 8 }],
    });
    const line = summary.lineItems.find((l) => l.id === 'multiEnvironment')!;
    expect(line.resources.tons).toBe(-8);
    expect(line.resources.cost).toBeCloseTo(0.5, 6);
    expect(line.resources.power).toBe(-1);
  });

  it('labels fuel with jump number and weeks of plant operation', () => {
    // Scout: 100t, Jump-2 (20t), 4t plant (1t/4wks); 23t fuel -> 3t spare ->
    // 12 weeks.
    const { summary } = evaluateShip({
      ...baseParams,
      hullConfig: 'streamlined',
      jump: 2,
      powerPlantTons: 4,
      fuelTons: 23,
    });
    const fuel = summary.lineItems.find((l) => l.id === 'fuel')!;
    expect(fuel.name).toBe('Fuel — J-2, 12 weeks operation');
  });

  it('always lists the fuel scoop (free on streamlined, MCr1 otherwise)', () => {
    const streamlined = evaluateShip({
      ...baseParams,
      hullConfig: 'streamlined',
      fuelScoop: true,
    });
    const scoop = (s: ReturnType<typeof evaluateShip>) =>
      s.summary.lineItems.find((l) => l.id === 'fuelScoop');
    expect(scoop(streamlined)?.resources.cost ?? 0).toBe(0); // free, but listed
    const standard = evaluateShip({ ...baseParams, fuelScoop: true });
    expect(scoop(standard)?.resources.cost).toBe(1);
  });

  it('mounts mixed weapons in one turret', () => {
    // A double turret with a beam laser + a sandcaster: 1 ton, MCr0.5 (mount) +
    // 0.5 (beam) + 0.25 (sandcaster) = 1.25, power 4 (beam only).
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      weapons: [{ mount: 'double', weapons: ['beamLaser', 'sandcaster'] }],
    });
    const line = summary.lineItems.find((l) => l.id === 'weapon')!;
    expect(line.resources.tons).toBe(-1);
    expect(line.resources.cost).toBeCloseTo(1.25, 6);
    expect(line.resources.power).toBe(-4);
    expect(line.name).toBe('Double Turret — Beam Laser, Sandcaster');
  });

  it('rejects more weapons than a mount can hold', () => {
    const { issues } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      weapons: [
        { mount: 'single', weapons: ['beamLaser', 'sandcaster'] }, // cap 1
      ],
    });
    expect(
      issues.some(
        (i) => i.severity === 'error' && /holds at most/.test(i.message),
      ),
    ).toBe(true);
  });

  it('costs a particle barbette as a 5-ton mount', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      weapons: [{ mount: 'single', weapons: ['particleBarbette'] }],
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
        { mount: 'single', weapons: ['beamLaser'] },
        { mount: 'single', weapons: ['beamLaser'] },
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
    expect(line.resources.cost).toBeCloseTo(5, 6); // MCr0.5 per ton
    // Derived rules get a warning so the numbers aren't trusted blindly.
    expect(
      reinforced.issues.some(
        (i) => i.severity === 'warning' && /derived rules/.test(i.message),
      ),
    ).toBe(true);
  });

  it('costs systems by tonnage; verified ones do not warn', () => {
    const { summary, issues } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      systems: [
        { type: 'laboratory', amount: 4 }, // verified: MCr1 per 4 tons
        { type: 'cargoCrane', amount: 3 }, // verified: MCr1 per ton
      ],
    });
    const line = (id: string) => summary.lineItems.find((l) => l.id === id)!;
    expect(line('laboratory').resources.cost).toBeCloseTo(1, 6);
    expect(line('cargoCrane').resources.cost).toBeCloseTo(3, 6);
    expect(
      issues.some((i) => i.severity === 'warning' && /derived/.test(i.message)),
    ).toBe(false);
  });

  it('reports the source books a design needs', () => {
    // A plain Core ship needs only the Core Rulebook.
    expect(evaluateShip(baseParams).sources).toEqual(['Core Rulebook']);
    // Reinforced structure is a High Guard feature, so it adds that source.
    expect(
      evaluateShip({ ...baseParams, reinforcementTons: 10 }).sources,
    ).toEqual(['Core Rulebook', 'High Guard']);
  });

  it('costs a holographic hull by hull tonnage and draws power', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 200,
      holographicHull: true,
    });
    const line = summary.lineItems.find((l) => l.id === 'holographicHull')!;
    // Cr100,000/ton -> MCr20 on 200t; 1 Power per 2 tons -> 100; no tonnage.
    expect(line.resources.cost).toBeCloseTo(20, 6);
    expect(line.resources.power).toBe(-100);
    expect(line.resources.tons ?? 0).toBe(0);
    // Gated to TL10.
    expect(
      evaluateShip({
        ...baseParams,
        tl: 9,
        holographicHull: true,
      }).issues.some((i) => i.severity === 'error' && /TL/.test(i.message)),
    ).toBe(true);
  });

  it('keeps the Library room and the Library software distinct', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      systems: [{ type: 'libraryRoom', amount: 4 }], // 4t, MCr4
      software: [{ type: 'library', level: 0 }], // free program
    });
    const room = summary.lineItems.find((l) => l.id === 'libraryRoom')!;
    expect(room.name).toBe('Library Room');
    expect(room.resources.tons).toBe(-4);
    expect(room.resources.cost).toBeCloseTo(4, 6);
    const sw = summary.lineItems.find(
      (l) => l.id === 'software' && l.name === 'Library',
    )!;
    expect(sw.resources.tons ?? 0).toBe(0);
    expect(sw.resources.cost ?? 0).toBe(0);
  });

  it('implements the rest of the spacecraft-equipment list', () => {
    const { summary } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      systems: [
        { type: 'aerofins', amount: 20 }, // MCr0.1/ton
        { type: 'cargoScoop', amount: 2 }, // MCr0.25/ton -> 0.5
        { type: 'sensorStation', amount: 2 }, // MCr0.5/ton -> 1
        { type: 'luxuryStateroom', amount: 10 }, // MCr0.15/ton -> 1.5
        { type: 'medicalBay', amount: 4 }, // 1 Power per 4-ton bay
      ],
    });
    const line = (id: string) => summary.lineItems.find((l) => l.id === id)!;
    expect(line('aerofins').resources.cost).toBeCloseTo(2, 6);
    expect(line('cargoScoop').resources.cost).toBeCloseTo(0.5, 6);
    expect(line('sensorStation').resources.cost).toBeCloseTo(1, 6);
    expect(line('luxuryStateroom').resources.cost).toBeCloseTo(1.5, 6);
    expect(line('luxuryStateroom').name).toBe('Luxury Staterooms ×1');
    expect(line('medicalBay').resources.power).toBe(-1);
  });

  it('installs an empty turret (the mount, with no weapon)', () => {
    const { summary, issues } = evaluateShip({
      ...baseParams,
      weapons: [{ mount: 'double', weapons: [] }],
    });
    const line = summary.lineItems.find((l) => l.id === 'weapon')!;
    // Double turret: 1 ton, MCr0.5, no power draw, named "(empty)".
    expect(line.resources.tons).toBe(-1);
    expect(line.resources.cost).toBeCloseTo(0.5, 6);
    expect(line.resources.power ?? 0).toBeCloseTo(0, 6);
    expect(line.name).toBe('Double Turret (empty)');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('lets a small craft mount a turret (e.g. the Gig)', () => {
    const { issues } = evaluateShip({
      ...baseParams,
      hullTons: 20,
      tl: 12,
      jump: 0,
      thrust: 7,
      powerPlantTons: 2,
      fuelTons: 1,
      bridge: 'standard',
      staterooms: 0,
      weapons: [{ mount: 'single', weapons: [] }],
    });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('carries nested craft as Core docking space (craft tons + 10%)', () => {
    // Two 10-ton fighters (MCr3 each): docking space ceil(10×1.1)=11t each →
    // 22t, at MCr0.25/ton (5.5), plus the craft cost (MCr6).
    const { summary, issues } = evaluateShip({
      ...baseParams,
      hullTons: 400,
      carried: [
        { kind: 'ship', name: 'Light Fighter', tons: 10, cost: 3, count: 2 },
      ],
    });
    const line = summary.lineItems.find((l) => l.id === 'carriedCraft')!;
    expect(line.resources.tons).toBe(-22);
    expect(line.resources.cost).toBeCloseTo(2 * 3 + 22 * 0.25, 6);
    expect(line.name).toBe('2× Light Fighter (hangar 22t)');
    // Docking space is a Core feature, so it does not warn.
    expect(
      issues.some((i) => i.severity === 'warning' && /derived/.test(i.message)),
    ).toBe(false);
  });

  it('adds an embarked craft pilot to the carrier roster', () => {
    const count = (crew: { role: string; count: number }[], role: string) =>
      crew.find((c) => c.role === role)?.count ?? 0;
    // A small craft is flown by a single pilot; carrying two adds two pilots.
    const fighter: ShipParams = {
      ...baseParams,
      hullTons: 10,
      jump: 0,
      thrust: 6,
      powerPlantTons: 1,
      fuelTons: 1,
      bridge: 'cockpit',
      staterooms: 0,
      weapons: [{ mount: 'fixed', weapons: ['beamLaser'] }],
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
    expect(count(carrier.crew, 'Pilot')).toBe(count(bare.crew, 'Pilot') + 2);
    expect(carrier.runningCosts.monthlySalaryCr).toBeGreaterThan(
      bare.runningCosts.monthlySalaryCr,
    );
  });

  it('applies the 10% standard-design discount to the purchase price', () => {
    const std = evaluateShip({ ...baseParams, standardDesign: true });
    const custom = evaluateShip({ ...baseParams, standardDesign: false });
    // The component total (sheet TOTAL) is unchanged; only the purchase price is.
    expect(std.summary.resources.cost.used).toBeCloseTo(
      custom.summary.resources.cost.used,
      6,
    );
    expect(std.runningCosts.purchaseMCr).toBeCloseTo(
      custom.runningCosts.purchaseMCr * 0.9,
      6,
    );
    // Maintenance follows the discounted price.
    expect(std.runningCosts.monthlyMaintenanceCr).toBeCloseTo(
      (std.runningCosts.purchaseMCr * 1000) / 12,
      6,
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
