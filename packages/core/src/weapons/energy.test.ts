import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WEAPONS,
  DEFAULT_ENERGY_PARAMS,
  type EnergyParams,
  evaluateWeapon,
  formatDamage,
  normalizeWeaponParams,
  parseWeapon,
  serializeWeapon,
} from './index.js';

const energy = (overrides: Partial<EnergyParams>): EnergyParams => ({
  ...DEFAULT_ENERGY_PARAMS,
  ...overrides,
});

const errors = (r: { issues: { severity: string; message: string }[] }) =>
  r.issues.filter((i) => i.severity === 'error');

describe('energy weapon — receiver baseline & totals', () => {
  it('TL12 Medium (Standard) laser rifle with improved focus', () => {
    const r = evaluateWeapon(
      energy({
        tl: 12,
        receiver: 'medium',
        damageDice: 5,
        barrel: 'rifle',
        stock: 'full',
        mods: ['improvedFocus'],
        powerSource: 'powerpack',
        powerpackKg: 2,
        powerpackRating: 'standard',
      }),
    );
    // Receiver 2500 × Improved Focus 1.25 = 3125; weight 3kg unchanged.
    expect(r.breakdown[0].costCr).toBeCloseTo(3125, 3);
    expect(r.breakdown[0].weightKg).toBeCloseTo(3, 3);
    // 3125 + barrel(0.3×3125=937.5) + stock(0.1×3125=312.5) + pack(1500×2=3000)
    expect(r.totals.costCr).toBeCloseTo(7375, 3);
    // 3 + barrel(0.5×3=1.5) + stock(0.1×3=0.3) + pack(2kg)
    expect(r.totals.weightKg).toBeCloseTo(6.8, 3);
    // Improved Beam Focus adds +3 to a ≥2D laser.
    expect(formatDamage(r.profile.damage)).toBe('5D+3');
    expect(r.profile.range).toBe(200);
    expect(r.profile.recoil).toBe(0);
    expect(r.profile.auto).toBe(0);
    expect(r.profile.traits['Zero-G']).toBe(true);
    expect(r.profile.traits['Lo-Pen']).toBe(1); // base Penetration −1
    // TL12 powerpack = 1000 power/kg × 2kg ÷ 5 power/shot = 400 shots.
    expect(r.profile.capacity).toBe(400);
    expect(errors(r)).toEqual([]);
  });
});

describe('energy weapon — power caps', () => {
  it('a short barrel wastes power above its cap', () => {
    const r = evaluateWeapon(
      energy({ receiver: 'medium', damageDice: 5, barrel: 'assault' }),
    );
    // Assault barrel caps lasers at 4D.
    expect(r.profile.damage.dice).toBe(4);
    expect(
      r.issues.some((i) => /limits this laser to 4D/.test(i.message)),
    ).toBe(true);
  });

  it('the receiver power class caps damage dice', () => {
    const r = evaluateWeapon(
      energy({ receiver: 'small', damageDice: 8, barrel: 'rifle' }),
    );
    // Small = Light = max 3D.
    expect(r.profile.damage.dice).toBe(3);
    expect(r.issues.some((i) => /caps output at 3D/.test(i.message))).toBe(
      true,
    );
  });
});

describe('energy weapon — power source mismatches', () => {
  it('an under-rated powerpack becomes Unreliable', () => {
    const r = evaluateWeapon(
      energy({
        tl: 12,
        receiver: 'large',
        damageDice: 8,
        barrel: 'rifle',
        powerSource: 'powerpack',
        powerpackRating: 'light',
        powerpackKg: 1,
      }),
    );
    // Light pack handles 3D; weapon draws 8D → Unreliable 5.
    expect(r.profile.traits['Unreliable']).toBe(5);
  });

  it('an over-powered cartridge becomes Unreliable; an under-powered one delivers less', () => {
    const over = evaluateWeapon(
      energy({
        tl: 12,
        receiver: 'medium',
        damageDice: 5,
        powerSource: 'cartridge',
        cartridgeRating: 'heavy',
        cartridgeCount: 10,
      }),
    );
    // Heavy cartridge (8D) in a 5D weapon → Unreliable 3.
    expect(over.profile.traits['Unreliable']).toBe(3);

    const under = evaluateWeapon(
      energy({
        tl: 12,
        receiver: 'medium',
        damageDice: 5,
        powerSource: 'cartridge',
        cartridgeRating: 'light',
        cartridgeCount: 10,
      }),
    );
    // Light cartridge (3D) only delivers 3D.
    expect(under.profile.damage.dice).toBe(3);
  });

  it('a non-ejecting cartridge holder is Hazardous −2', () => {
    const r = evaluateWeapon(
      energy({
        tl: 12,
        powerSource: 'cartridge',
        cartridgeEjects: false,
        cartridgeCount: 10,
      }),
    );
    expect(r.profile.traits['Hazardous']).toBe(-2);
  });
});

describe('energy weapon — tech-level gates', () => {
  it('powerpacks require TL8 and energy mods enforce their minTL', () => {
    const r = evaluateWeapon(
      energy({ tl: 7, powerSource: 'powerpack', mods: ['intensifiedPulse'] }),
    );
    expect(r.issues.some((i) => /powerpacks require TL8/.test(i.message))).toBe(
      true,
    );
    expect(
      r.issues.some((i) => /Intensified Pulse requires TL12/.test(i.message)),
    ).toBe(true);
  });

  it('cartridges require TL9', () => {
    const r = evaluateWeapon(
      energy({ tl: 8, powerSource: 'cartridge', cartridgeCount: 5 }),
    );
    expect(r.issues.some((i) => /cartridges require TL9/.test(i.message))).toBe(
      true,
    );
  });
});

describe('energy weapon — signature', () => {
  it('is Emissions (normal) and unshifted by the barrel', () => {
    // A minimal barrel would +2 a firearm's signature; a laser collimator does not.
    const r = evaluateWeapon(energy({ barrel: 'minimal', damageDice: 2 }));
    expect(r.profile.signatureKind).toBe('emissions');
    expect(r.profile.signature).toBe('normal');
    expect(r.issues.some((i) => /unverified/.test(i.message))).toBe(false);
  });
});

describe('energy weapon — serialization & built-ins', () => {
  it('round-trips an energy design through serialize/parse', () => {
    const def = BUILTIN_WEAPONS.find((w) => w.name === 'Laser Rifle')!;
    const parsed = parseWeapon(serializeWeapon(def));
    expect(parsed.params).toEqual(def.params);
  });

  it('normalizes a kind:energy document and tolerates garbage', () => {
    const params = normalizeWeaponParams({
      kind: 'energy',
      receiver: 'nonsense',
      damageDice: 'x',
    });
    expect(params.kind).toBe('energy');
    expect(params.receiver).toBe(DEFAULT_ENERGY_PARAMS.receiver);
    expect(() => evaluateWeapon(params)).not.toThrow();
  });
});
