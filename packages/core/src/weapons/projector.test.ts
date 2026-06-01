import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WEAPONS,
  DEFAULT_PROJECTOR_PARAMS,
  evaluateWeapon,
  normalizeWeaponParams,
  parseWeapon,
  type ProjectorParams,
  serializeWeapon,
} from './index.js';

const proj = (overrides: Partial<ProjectorParams>): ProjectorParams => ({
  ...DEFAULT_PROJECTOR_PARAMS,
  ...overrides,
});

describe('projector — frame, fuel & propellant maths', () => {
  it('TL5 Compact jellied flamethrower (the built-in)', () => {
    const r = evaluateWeapon(
      proj({
        structure: 'compact',
        propellant: 'compressed',
        fuel: 'jellied',
        fuelKg: 4,
        propellantKg: 2,
      }),
    );
    // payload 6kg; frame 0.2×6 = 1.2kg; total 7.2kg; cost 100/kg × 7.2 = 720.
    expect(r.totals.weightKg).toBeCloseTo(7.2, 3);
    expect(r.totals.costCr).toBeCloseTo(720, 3);
    // Reload: fuel 75×4 + propellant 100×2 = 500.
    expect(r.totals.magazineCr).toBeCloseTo(500, 3);
    // Attacks: min(fuel 4, propellant 2×4=8) = 4.
    expect(r.profile.capacity).toBe(4);
    expect(r.profile.damage.dice).toBe(4);
    expect(r.profile.range).toBe(20);
    expect(r.profile.traits['Blast']).toBe(2);
    expect(r.profile.traits['Hazardous']).toBe(-6);
    expect(r.profile.recoil).toBe(0);
  });

  it('MF-61 — Armoured + Bulwarked compact flame weapon (the built-in)', () => {
    const def = BUILTIN_WEAPONS.find((w) => w.name === 'MF-61')!;
    const r = evaluateWeapon(def.params);
    // Frame Cr528/5.28kg + generated machinery Cr200; Armoured 2 (×1.2/×1.1)
    // and Bulwarked 3 (×1.6/×1.3): 728×1.92 = 1397.76, 5.28×1.43 = 7.5504.
    expect(r.totals.costCr).toBeCloseTo(1397.76, 2);
    expect(r.totals.weightKg).toBeCloseTo(7.5504, 4);
    expect(r.profile.traits['Armoured']).toBe(2);
    expect(r.profile.traits['Bulwarked']).toBe(3);
  });

  it('generated gas adds one-off machinery and reaches 30m', () => {
    const r = evaluateWeapon(
      proj({
        tl: 10,
        structure: 'large',
        propellant: 'generated',
        fuel: 'advanced',
        fuelKg: 10,
        propellantKg: 2,
      }),
    );
    // Generated machinery = 500 × 2kg = 1000, on top of the frame cost.
    const frame = 50 * r.totals.weightKg; // large = Cr50/kg of total
    expect(r.totals.costCr).toBeCloseTo(frame + 1000, 3);
    expect(r.profile.range).toBe(30);
    // Attacks: min(fuel 10, propellant 2×10=20) = 10.
    expect(r.profile.capacity).toBe(10);
  });

  it('hand frames and suppressant fuel each halve range', () => {
    expect(
      evaluateWeapon(proj({ structure: 'hand', propellant: 'compressed' }))
        .profile.range,
    ).toBe(10);
    expect(
      evaluateWeapon(proj({ tl: 6, structure: 'compact', fuel: 'suppressant' }))
        .profile.range,
    ).toBe(10);
  });

  it('a non-damaging fuel (irritant) carries its effect trait', () => {
    const r = evaluateWeapon(proj({ tl: 6, fuel: 'irritant' }));
    expect(r.profile.damage.dice).toBe(0);
    expect(r.profile.traits['Incapacitant']).toBe(true);
  });
});

describe('projector — validation', () => {
  it('warns when the payload exceeds the frame maximum', () => {
    const r = evaluateWeapon(
      proj({ structure: 'large', fuelKg: 20, propellantKg: 10 }),
    );
    expect(
      r.issues.some((i) => /exceeds the Large frame/.test(i.message)),
    ).toBe(true);
  });

  it('gates fuel and propellant by tech level', () => {
    const r = evaluateWeapon(
      proj({ tl: 8, fuel: 'advanced', propellant: 'generated' }),
    );
    expect(
      r.issues.some((i) => /Advanced fuel requires TL9/.test(i.message)),
    ).toBe(true);
    expect(
      r.issues.some((i) => /Generated Gas requires TL9/.test(i.message)),
    ).toBe(true);
  });

  it('reads Emissions (extreme), per the MF-61 example', () => {
    const r = evaluateWeapon(proj({}));
    expect(r.profile.signatureKind).toBe('emissions');
    expect(r.profile.signature).toBe('extreme');
  });
});

describe('projector — serialization', () => {
  it('round-trips the built-in flamethrower', () => {
    const def = BUILTIN_WEAPONS.find((w) => w.name === 'MF-61')!;
    const parsed = parseWeapon(serializeWeapon(def));
    expect(parsed.params).toEqual(def.params);
  });

  it('normalizes a kind:projector document and tolerates garbage', () => {
    const params = normalizeWeaponParams({
      kind: 'projector',
      structure: 'nonsense',
      fuelKg: 'x',
    });
    expect(params.kind).toBe('projector');
    expect(params.structure).toBe(DEFAULT_PROJECTOR_PARAMS.structure);
    expect(() => evaluateWeapon(params)).not.toThrow();
  });
});
