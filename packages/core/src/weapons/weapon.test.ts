import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WEAPONS,
  DEFAULT_WEAPON_PARAMS,
  evaluateWeapon,
  formatDamage,
  normalizeWeaponParams,
  parseWeapon,
  serializeWeapon,
  type WeaponParams,
} from './index.js';

const byName = (name: string): WeaponParams => {
  const def = BUILTIN_WEAPONS.find((w) => w.name === name);
  if (!def) throw new Error(`No builtin named ${name}`);
  return def.params;
};

const evalNamed = (name: string) => evaluateWeapon(byName(name));

describe('formatDamage', () => {
  it('formats dice, modifier and D3 dice', () => {
    expect(formatDamage({ dice: 3, die: 6, mod: 0 })).toBe('3D');
    expect(formatDamage({ dice: 3, die: 6, mod: -3 })).toBe('3D-3');
    expect(formatDamage({ dice: 3, die: 6, mod: 6 })).toBe('3D+6');
    expect(formatDamage({ dice: 3, die: 3, mod: 1 })).toBe('3D3+1');
    expect(formatDamage({ dice: 0, die: 6, mod: 1 })).toBe('1');
  });
});

// The six worked worksheets that use the rules-text base values reproduce
// exactly (receiver subtotal + grand total in Cr and kg, plus headline stats).
// The breakdown now itemises the receiver (a base line + one line per modifier),
// so breakdown[0] is the *base* receiver; the grand totals remain the oracle.
describe('worked examples — base receiver & grand totals', () => {
  it('Adjudicator (handgun · small smoothbore · repeater)', () => {
    const r = evalNamed('Adjudicator');
    expect(r.breakdown[0].costCr).toBeCloseTo(175, 3); // base handgun
    expect(r.breakdown[0].weightKg).toBeCloseTo(0.8, 3);
    expect(r.totals.costCr).toBeCloseTo(75.46875, 3);
    expect(r.profile.quickdraw).toBe(8);
    expect(r.profile.range).toBe(12);
    expect(formatDamage(r.profile.damage)).toBe('3D-2');
    expect(r.profile.capacity).toBe(4);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('Bodyguard Shotgun (longarm · standard smoothbore · repeater)', () => {
    const r = evalNamed('Bodyguard Shotgun');
    expect(r.breakdown[0].costCr).toBeCloseTo(400, 3); // base longarm
    expect(r.breakdown[0].weightKg).toBeCloseTo(2.5, 3);
    // Weight matches the worksheet exactly; the cost total differs only because
    // the worksheet prices the laser pointer at Cr50 where the rules say Cr200.
    expect(r.totals.weightKg).toBeCloseTo(4.1, 3);
    expect(r.profile.quickdraw).toBe(0);
    expect(r.profile.range).toBe(100);
    expect(formatDamage(r.profile.damage)).toBe('4D');
    expect(r.profile.capacity).toBe(6);
  });

  it('13mm Crunch Gun (LSW · anti-materiel · repeater · very long)', () => {
    const r = evalNamed('13mm Crunch Gun');
    expect(r.breakdown[0].costCr).toBeCloseTo(1500, 3); // base LSW
    expect(r.breakdown[0].weightKg).toBeCloseTo(5, 3);
    expect(r.totals.costCr).toBeCloseTo(3143.75, 3);
    expect(r.totals.weightKg).toBeCloseTo(13.1375, 3);
    expect(r.profile.quickdraw).toBe(-8);
    expect(r.profile.range).toBe(1250);
    expect(formatDamage(r.profile.damage)).toBe('5D');
  });

  it('GA-100 (gauss assault · gauss shotgun · bullpup)', () => {
    const r = evalNamed('GA-100');
    expect(r.breakdown[0].costCr).toBeCloseTo(300, 3); // base assault (pre-gauss)
    expect(r.breakdown[0].weightKg).toBeCloseTo(2, 4);
    expect(r.totals.costCr).toBeCloseTo(2190.24, 2);
    expect(r.totals.weightKg).toBeCloseTo(4.4275, 4);
    expect(r.profile.quickdraw).toBe(8);
    expect(r.profile.range).toBe(50);
    expect(formatDamage(r.profile.damage)).toBe('3D+6');
    expect(r.profile.auto).toBe(3);
    expect(r.profile.capacity).toBe(23);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('Stowaway (handgun · light handgun · extreme stealth)', () => {
    const r = evalNamed('Stowaway');
    expect(r.breakdown[0].costCr).toBeCloseTo(175, 3); // base handgun
    expect(r.breakdown[0].weightKg).toBeCloseTo(0.8, 4);
    expect(r.totals.costCr).toBeCloseTo(1358.28, 3);
    expect(r.totals.weightKg).toBeCloseTo(0.6336, 4);
    expect(r.profile.quickdraw).toBe(10);
    expect(r.profile.range).toBe(4);
    expect(formatDamage(r.profile.damage)).toBe('2D');
    expect(r.profile.capacity).toBe(6);
    expect(r.profile.signature).toBe('minimal');
    expect(r.profile.traits['Lo-Pen']).toBe(2);
  });

  it('Civilian Shotgun (single-shot double-barrel light smoothbore)', () => {
    const r = evalNamed('Civilian Shotgun');
    expect(r.breakdown[0].costCr).toBeCloseTo(400, 3); // base longarm
    expect(r.totals.costCr).toBeCloseTo(127.5, 3);
    expect(r.profile.quickdraw).toBe(-1);
    expect(r.profile.capacity).toBe(1);
  });
});

// Pistol-calibre + short barrel yields the worksheets' shown Lo-Pen 2.
describe('penetration / Lo-Pen', () => {
  it('handgun-calibre weapons read Lo-Pen 2', () => {
    expect(evalNamed('Compact PDW').profile.traits['Lo-Pen']).toBe(2);
    expect(evalNamed('Stowaway').profile.traits['Lo-Pen']).toBe(2);
  });
});

describe('Inaccurate trait', () => {
  it('smoothbores read Inaccurate −1, but snub (low-recoil) reads −2', () => {
    // Adjudicator is a small-smoothbore revolver.
    expect(evalNamed('Adjudicator').profile.traits['Inaccurate']).toBe(-1);
    const snub = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'handgun',
      calibre: 'snub',
      mechanism: 'semiAuto',
      barrel: 'handgun',
      stock: 'none',
    });
    expect(snub.profile.traits['Inaccurate']).toBe(-2);
  });
});

describe('breakdown presentation', () => {
  it('shows percentage mods and a Receiver Totals subtotal', () => {
    const r = evalNamed('GA-100');
    const gauss = r.breakdown.find((l) => l.label === 'Gauss')!;
    expect(gauss.costMod).toBe('+100%'); // ×2 cost
    expect(gauss.weightMod).toBe('+25%'); // ×1.25 weight
    const totals = r.breakdown.find((l) => l.label === 'Receiver Totals')!;
    expect(totals.costCr).toBeCloseTo(1684.8, 3); // raw subtotal, not a %
    expect(totals.costMod).toBeUndefined();
    const barrel = r.breakdown.find((l) => l.label.startsWith('Barrel'))!;
    expect(barrel.costMod).toBe('+20%'); // % of the receiver baseline
  });
});

describe('multi-barrel weapons', () => {
  it('a partial multi-barrel adds each barrel without a receiver surcharge', () => {
    // Hangul-style: handgun · heavy handgun · repeater · partial · minimal ·
    // 3 extra barrels. Cost = 175 ×1.2 ×0.5 = 105 (minimal barrels are free).
    const r = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      tl: 6,
      receiver: 'handgun',
      calibre: 'heavyHandgun',
      mechanism: 'repeater',
      features: ['partialMultiBarrel'],
      barrel: 'minimal',
      additionalBarrels: 3,
      stock: 'none',
    });
    expect(r.totals.costCr).toBeCloseTo(105, 3);
    // Weight: 0.8 handgun × 1.15 (heavy handgun +15%); minimal barrels weigh 0.
    expect(r.totals.weightKg).toBeCloseTo(0.92, 3);
    // Quickdraw: +4 handgun, +8 minimal barrel, −3 for the extra barrels.
    expect(r.profile.quickdraw).toBe(9);
  });

  it('a complete multi-barrel adds 10% of the receiver per extra barrel', () => {
    const base = evaluateWeapon({ ...DEFAULT_WEAPON_PARAMS });
    const twin = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      additionalBarrels: 1,
    });
    // One extra rifle barrel: +10% receiver + a full barrel + Quickdraw −1.
    expect(twin.totals.costCr).toBeGreaterThan(base.totals.costCr);
    expect(twin.profile.quickdraw).toBe(base.profile.quickdraw - 1);
  });
});

describe('validation rules', () => {
  it('flags a gauss round in a non-gauss receiver', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      calibre: 'standardGauss',
      gauss: false,
      tl: 12,
    }).issues;
    expect(
      issues.some((i) => /requires a gauss receiver/.test(i.message)),
    ).toBe(true);
  });

  it('flags anti-materiel below a light support weapon', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'handgun',
      calibre: 'antiMateriel',
    }).issues;
    expect(
      issues.some((i) =>
        /requires at least a Light Support Weapon/.test(i.message),
      ),
    ).toBe(true);
  });

  it('flags incompatible size features and a stockless bullpup', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      features: ['compact', 'veryCompact', 'bullpup'],
      stock: 'none',
    }).issues;
    expect(issues.some((i) => /Incompatible features/.test(i.message))).toBe(
      true,
    );
    expect(issues.some((i) => /must have a full stock/.test(i.message))).toBe(
      true,
    );
  });

  it('gates ammunition and accessories by tech level', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      tl: 5,
      ammo: 'heap',
      accessories: ['multispectralScope'],
    }).issues;
    expect(
      issues.some((i) => /HEAP ammunition requires TL8/.test(i.message)),
    ).toBe(true);
    expect(
      issues.some((i) => /Multispectral Scope requires TL9/.test(i.message)),
    ).toBe(true);
  });
});

describe('robustness & serialization', () => {
  it('every builtin evaluates without throwing', () => {
    for (const def of BUILTIN_WEAPONS) {
      expect(() => evaluateWeapon(def.params)).not.toThrow();
    }
  });

  it('tolerates garbage input via normalizeWeaponParams', () => {
    const params = normalizeWeaponParams({
      receiver: 'nonsense',
      capacityPct: 'x',
    });
    expect(params.receiver).toBe(DEFAULT_WEAPON_PARAMS.receiver);
    expect(() => evaluateWeapon(params)).not.toThrow();
  });

  it('round-trips through serialize/parse', () => {
    const def = BUILTIN_WEAPONS.find((w) => w.name === 'GA-100')!;
    const parsed = parseWeapon(serializeWeapon(def));
    expect(parsed.params).toEqual(def.params);
  });
});
