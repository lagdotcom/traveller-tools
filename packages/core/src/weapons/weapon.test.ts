import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WEAPONS,
  DEFAULT_WEAPON_PARAMS,
  evaluateWeapon,
  formatDamage,
  normalizeWeaponParams,
  parseWeapon,
  serializeWeapon,
  variantParams,
  type WeaponDefinition,
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
    // Gauss base Penetration +2 → AP 1 + 1/full die = AP 4 (3 dice), and the
    // table's −1 damage per 2 full dice turns the 3D+6 base into the printed 3D+5.
    expect(formatDamage(r.profile.damage)).toBe('3D+5');
    expect(r.profile.traits['AP']).toBe(4);
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

describe('play-time notes', () => {
  it('collects rule-text notes from accessories, furniture and features', () => {
    const r = evalNamed('Intruder');
    expect(r.notes?.some((n) => /Laser Pointer: DM\+1/.test(n))).toBe(true);
    expect(r.notes?.some((n) => /Long-Range Scope: reduces/.test(n))).toBe(
      true,
    );
    expect(
      r.notes?.some((n) => /Quickdraw: DM\+1 to attack under 25m/.test(n)),
    ).toBe(true);
  });

  it('a plain Scope adds no note (its effect is the Scope trait)', () => {
    const r = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      accessories: ['scope'],
    });
    expect(r.profile.traits['Scope']).toBe(true);
    expect(r.notes ?? []).toEqual([]);
  });
});

describe('multiple supported ammo types', () => {
  it('lists one profile per loaded ammo type, sharing the build', () => {
    // The Crunch Gun is shown firing ball / explosive / incendiary / advanced AP.
    const r = evalNamed('13mm Crunch Gun');
    expect(r.ammoProfiles?.map((a) => a.ammo)).toEqual([
      'ball',
      'explosive',
      'incendiary',
      'apAdvanced',
    ]);
    // Ball is the primary; explosive adds dice (+1D plus +1D/3 full dice) and a
    // pricier reload; advanced AP turns the +2 penetration into AP.
    const byAmmo = Object.fromEntries(r.ammoProfiles!.map((a) => [a.ammo, a]));
    expect(formatDamage(byAmmo.ball!.profile.damage)).toBe('5D');
    expect(formatDamage(byAmmo.explosive!.profile.damage)).toBe('7D');
    expect(byAmmo.explosive!.magazineCr).toBeGreaterThan(
      byAmmo.ball!.magazineCr,
    );
    expect(byAmmo.apAdvanced!.profile.traits['AP']).toBe(6);
  });

  it('treats out-of-TL loaded ammo as a warning, not an error', () => {
    // The TL4 Crunch Gun lists TL6/TL7 rounds — available later, not invalid.
    const r = evalNamed('13mm Crunch Gun');
    expect(
      r.issues.some(
        (i) =>
          i.severity === 'warning' &&
          /Explosive ammunition requires TL6/.test(i.message),
      ),
    ).toBe(true);
  });
});

describe('manufacturer metadata', () => {
  it('round-trips the manufacturer through serialize/parse', () => {
    const def = {
      name: 'GC-24',
      manufacturer: 'Anhur Industries',
      params: DEFAULT_WEAPON_PARAMS,
    };
    expect(parseWeapon(serializeWeapon(def)).manufacturer).toBe(
      'Anhur Industries',
    );
  });

  it('migrated the embedded makers off the built-in descriptions', () => {
    const gc24 = BUILTIN_WEAPONS.find((w) => w.name === 'GC-24')!;
    expect(gc24.manufacturer).toBe('Anhur Industries');
    expect(gc24.description).not.toMatch(/Anhur/);
  });
});

describe('magazine options', () => {
  it('overrides the standard magazine count/cost without touching the build', () => {
    // Reliant lists Mag 50 (a manual count the % rule wouldn't give), one per
    // ammo: ball Cr110, advanced AP Cr180.
    const r = evalNamed('Reliant');
    expect(r.profile.capacity).toBe(50);
    expect(r.totals.magazineCr).toBe(110);
    // A single absolute count without alternatives produces no extra rows.
    const single = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      magazines: [{ rounds: 42 }],
    });
    expect(single.profile.capacity).toBe(42);
    expect(single.magazines).toBeUndefined();
  });

  it('prices each magazine off the ammo it embeds', () => {
    // The embedded ammo also fixes that type's reload on the profile row.
    const r = evalNamed('Reliant');
    const byAmmo = Object.fromEntries(
      r.ammoProfiles!.map((a) => [a.ammo, a.magazineCr]),
    );
    expect(byAmmo.ball).toBe(110);
    expect(byAmmo.apAdvanced).toBe(180);
    expect(r.magazines?.map((m) => [m.label, m.magazineCr])).toEqual([
      ['Ball', 110],
      ['Armour-Piercing (Advanced)', 180],
    ]);
  });

  it('lists alternative magazines, scaling weight by the capacity rule', () => {
    const base = { ...DEFAULT_WEAPON_PARAMS, receiver: 'lsw' as const };
    const single = evaluateWeapon(base);
    const r = evaluateWeapon({
      ...base,
      magazines: [
        { pct: 100, label: 'Box' },
        { pct: 150, label: 'Drum' },
        { rounds: 10, label: 'Stick' },
      ],
    });
    expect(r.magazines?.map((m) => m.label)).toEqual(['Box', 'Drum', 'Stick']);
    const [box, drum] = r.magazines!;
    // The standard (first) row equals the headline build.
    expect(box!.primary).toBe(true);
    expect(box!.weightKg).toBeCloseTo(single.totals.weightKg, 3);
    // A 150% drum holds more and weighs more (capacity-% weight rule).
    expect(drum!.capacity).toBeGreaterThan(box!.capacity);
    expect(drum!.weightKg).toBeGreaterThan(box!.weightKg);
  });

  it('round-trips magazine options through serialization', () => {
    const params: WeaponParams = {
      ...DEFAULT_WEAPON_PARAMS,
      magazines: [{ pct: 100 }, { rounds: 50, costCr: 25, label: 'Drum' }],
    };
    const back = parseWeapon(serializeWeapon({ name: 'M', params })).params;
    if (back.kind !== 'firearm') throw new Error('expected firearm');
    expect(back.magazines).toEqual([
      { pct: 100 },
      { rounds: 50, costCr: 25, label: 'Drum' },
    ]);
  });
});

// The FC "Final Penetration" table maps net penetration → Lo-Pen / AP.
describe('penetration / Lo-Pen / AP (Final Penetration table)', () => {
  it('handgun-calibre weapons read Lo-Pen 2', () => {
    expect(evalNamed('Compact PDW').profile.traits['Lo-Pen']).toBe(2);
    expect(evalNamed('Stowaway').profile.traits['Lo-Pen']).toBe(2);
  });

  it('a snub revolver reads Lo-Pen 3 (−2 net penetration)', () => {
    // Ten-Six: snub (−1) + short barrel (−1) = −2 → Lo-Pen 3.
    expect(evalNamed('Ten-Six').profile.traits['Lo-Pen']).toBe(3);
  });

  it('gauss weapons turn their +2 base penetration into AP, scaled by dice', () => {
    // Small gauss (+2) − a barrel −1 = +1 → AP = full dice.
    expect(evalNamed('GC-24').profile.traits['AP']).toBe(3); // 3 dice
    // Gauss shotgun keeps +2 (no barrel loss on gauss) → AP 1 + 3 dice = 4.
    expect(evalNamed('GA-100').profile.traits['AP']).toBe(4);
    expect(evalNamed('GA-100').profile.traits['Lo-Pen']).toBeUndefined();
  });

  it('pellet spread (by barrel) drives penetration down to Lo-Pen', () => {
    // Small smoothbore (−1) + pellet spread; a deep negative clamps at Lo-Pen 5.
    const r = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'handgun',
      calibre: 'smallSmoothbore',
      mechanism: 'repeater',
      barrel: 'handgun',
      stock: 'none',
      ammo: ['pellet'],
    });
    expect(r.profile.traits['Spread']).toBe(4); // handgun-barrel spread
    expect(r.profile.traits['Lo-Pen']).toBe(5); // clamped
  });
});

describe('smoothbore Bulky (Recoil Effects table) & gauss signature', () => {
  it('a small-smoothbore handgun is Bulky; standard-smoothbore handgun is impossible', () => {
    expect(evalNamed('Adjudicator').profile.traits['Bulky']).toBe(true);
    expect(evalNamed('Bodyguard Shotgun').profile.traits['Bulky']).toBe(true);
    const bad = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'handgun',
      calibre: 'standardSmoothbore',
      barrel: 'handgun',
    });
    expect(
      bad.issues.some((i) => /can't be built on a Handgun/.test(i.message)),
    ).toBe(true);
  });

  it('gauss weapons read Emissions (low), unshifted by a short barrel', () => {
    expect(evalNamed('GC-24').profile.signatureKind).toBe('emissions'); // short barrel
    expect(evalNamed('GC-24').profile.signature).toBe('low');
    expect(evalNamed('GR-80').profile.signature).toBe('low');
  });
});

describe('Rapid-Fire / VRF', () => {
  const lmg = {
    ...DEFAULT_WEAPON_PARAMS,
    receiver: 'lsw' as const,
    calibre: 'battleRifle' as const, // 3D+3 base (3 dice)
    mechanism: 'fullAuto' as const,
    barrel: 'rifle' as const,
  };

  it('RF adds a die per 3 base dice, AP = base dice, and the book Heat (Auto+2×dice)', () => {
    const r = evaluateWeapon({ ...lmg, autoIncrease: 1, rapidFire: 'rf' }); // Auto 4
    expect(r.profile.auto).toBe(4);
    expect(r.profile.damage.dice).toBe(4); // 3 + floor(3/3)
    expect(r.profile.traits['AP']).toBe(3); // base dice
    expect(r.profile.traits['Bulky']).toBe(true);
    expect(r.profile.heat).toBe(10); // 4 + 2×3 (FC worked example)
    // Cost multiplies the receiver by (Auto + 2).
    const recv = r.breakdown.find((l) => l.label === 'Receiver Totals')!;
    const rfLine = r.breakdown.find((l) => l.label === 'Rapid-Fire')!;
    expect(rfLine).toBeDefined();
    expect(recv.costCr).toBeGreaterThan(0);
  });

  it('VRF adds a die per 2 base dice, Very Bulky, and Heat Auto+3×dice', () => {
    const r = evaluateWeapon({ ...lmg, autoIncrease: 3, rapidFire: 'vrf' }); // Auto 6
    expect(r.profile.auto).toBe(6);
    expect(r.profile.damage.dice).toBe(4); // 3 + floor(3/2)
    expect(r.profile.traits['Very Bulky']).toBe(true);
    expect(r.profile.heat).toBe(15); // 6 + 3×3
  });

  it('flags RF below Auto 4', () => {
    const r = evaluateWeapon({ ...lmg, rapidFire: 'rf' }); // Auto 3
    expect(
      r.issues.some((i) => /Rapid-Fire needs Auto 4\+/.test(i.message)),
    ).toBe(true);
  });
});

describe('weapon Heat', () => {
  it('an autofiring weapon generates (dice + Auto) Heat and dissipates by class', () => {
    // Eliminator: assault receiver, 2 damage dice, Auto 4 → Heat 6/round;
    // assault dissipation 4, overheat threshold 15.
    const r = evalNamed('Eliminator');
    expect(r.profile.heat).toBe(r.profile.damage.dice + r.profile.auto);
    expect(r.profile.heatDissipation).toBe(4);
    expect(r.profile.heatThreshold).toBe(15);
  });

  it('a cooling system and a heavy barrel raise dissipation', () => {
    const r = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'lsw',
      mechanism: 'fullAuto',
      heavyBarrel: true,
      features: ['coolingAdvanced'],
    });
    // LSW base 8 + heavy barrel 2 + advanced cooling 5 = 15.
    expect(r.profile.heatDissipation).toBe(15);
  });

  it('a non-auto weapon generates no Heat', () => {
    expect(evalNamed('Adjudicator').profile.heat).toBe(0);
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

describe('leveled receiver features', () => {
  it('Recoil Compensation drops Recoil and damage, and costs +10%/+5% per point', () => {
    const base = evaluateWeapon({ ...DEFAULT_WEAPON_PARAMS });
    const comp = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      features: [{ id: 'recoilComp', level: 2 }],
    });
    // 2 points: damage −3, Recoil −2 vs the base build.
    expect(comp.profile.damage.mod).toBe(base.profile.damage.mod - 3);
    expect(comp.profile.recoil).toBe(Math.max(0, base.profile.recoil - 2));
    // Cost is the receiver baseline ×1.2 (the +20% modified-receiver line).
    const recvLine = comp.breakdown.find((l) => l.label === 'Receiver Totals')!;
    const baseRecv = base.breakdown.find((l) => l.label === 'Receiver Totals')!;
    expect(recvLine.costCr).toBeCloseTo(baseRecv.costCr * 1.2, 3);
  });

  it('Armoured surfaces a Protection trait and adds +10% cost/+5% weight per point', () => {
    const r = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      features: [{ id: 'armoured', level: 2 }],
    });
    expect(r.profile.traits['Armoured']).toBe(2);
    const recvLine = r.breakdown.find((l) => l.label === 'Receiver Totals')!;
    const base = evaluateWeapon({ ...DEFAULT_WEAPON_PARAMS }).breakdown.find(
      (l) => l.label === 'Receiver Totals',
    )!;
    expect(recvLine.costCr).toBeCloseTo(base.costCr * 1.2, 3);
    expect(recvLine.weightKg).toBeCloseTo(base.weightKg * 1.1, 3);
  });
});

describe('secondary weapon', () => {
  // A full FirearmParams doubles as a secondary spec (its `kind` is ignored).
  const sec = {
    ...DEFAULT_WEAPON_PARAMS,
    receiver: 'handgun' as const,
    calibre: 'lightSmoothbore' as const,
    mechanism: 'singleShot' as const,
    barrel: 'short' as const,
    stock: 'none' as const,
    ammo: ['pellet'] as const,
  };

  it('adds a complete extra barrel (FC rule) and exposes its own profile', () => {
    const standalone = evaluateWeapon(sec);
    const primary = evaluateWeapon({ ...DEFAULT_WEAPON_PARAMS });
    const withSec = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      secondary: sec,
    });
    // Complete multi-barrel: +10% of the host receiver baseline, plus the
    // secondary's own barrel (short = 10% cost, 5% weight at half-weight).
    const baseline = primary.breakdown.find(
      (l) => l.label === 'Receiver Totals',
    )!;
    expect(withSec.totals.costCr).toBeCloseTo(
      primary.totals.costCr + baseline.costCr * (0.1 + 0.1),
      3,
    );
    expect(withSec.totals.weightKg).toBeCloseTo(
      primary.totals.weightKg + baseline.weightKg * (0.1 + 0.1 * 0.5),
      3,
    );
    // Each extra barrel costs a point of Quickdraw.
    expect(withSec.profile.quickdraw).toBe(primary.profile.quickdraw - 1);
    // The secondary keeps its own profile (a separate data line).
    expect(withSec.secondary?.profile.damage).toEqual(
      standalone.profile.damage,
    );
    expect(withSec.secondary?.magazineCr).toBe(standalone.totals.magazineCr);
  });

  it('round-trips a secondary through serialize/parse', () => {
    const def = {
      name: 'Twin',
      params: { ...DEFAULT_WEAPON_PARAMS, secondary: sec },
    };
    const parsed = parseWeapon(serializeWeapon(def));
    // The canonical form strips the secondary's redundant `kind`.
    expect(parsed.params).toEqual(normalizeWeaponParams(def.params));
    expect(
      (parsed.params as typeof DEFAULT_WEAPON_PARAMS).secondary?.calibre,
    ).toBe('lightSmoothbore');
  });
});

describe('validation rules', () => {
  it('implies gauss from the calibre and gates it at TL12', () => {
    // A gauss calibre below TL12 is flagged...
    const low = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'assault',
      calibre: 'standardGauss',
      tl: 10,
    });
    expect(
      low.issues.some((i) => /Gauss weapons require TL12/.test(i.message)),
    ).toBe(true);
    // ...and the gauss ×2 cost modifier is applied automatically (no separate flag).
    const ok = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      receiver: 'assault',
      calibre: 'standardGauss',
      tl: 13,
    });
    expect(ok.breakdown.some((l) => l.label === 'Gauss')).toBe(true);
    expect(ok.issues.filter((i) => i.severity === 'error')).toEqual([]);
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
    expect(
      issues.some((i) => /must have a fixed or full stock/.test(i.message)),
    ).toBe(true);
  });

  it('flags a Low-Quality weapon with its Deficiency points', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      features: [{ id: 'lowQuality', level: 2 }],
    }).issues;
    expect(
      issues.some((i) =>
        /Very Low Quality: apply 2 Deficiency/.test(i.message),
      ),
    ).toBe(true);
  });

  it('rejects two quality grades (High + Low) as incompatible', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      features: ['highQuality', { id: 'lowQuality', level: 1 }],
    }).issues;
    expect(issues.some((i) => /Incompatible features/.test(i.message))).toBe(
      true,
    );
  });

  it('gates ammunition and accessories by tech level', () => {
    const issues = evaluateWeapon({
      ...DEFAULT_WEAPON_PARAMS,
      tl: 5,
      ammo: ['heap'],
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

  it('resolves a variant as a shallow override of the base (kind kept)', () => {
    const base = byName('Bodyguard Shotgun'); // longarm, rifle barrel, full stock
    const v = variantParams(base, { barrel: 'short', stock: 'none' });
    expect(v.kind).toBe('firearm');
    expect((v as { barrel: string }).barrel).toBe('short');
    expect((v as { stock: string }).stock).toBe('none');
    // Untouched fields inherit from the base.
    expect((v as { calibre: string }).calibre).toBe(
      (base as { calibre: string }).calibre,
    );
    expect(() => evaluateWeapon(v)).not.toThrow();
  });

  it('round-trips variants through serialize/parse', () => {
    const def: WeaponDefinition = {
      name: 'WithVariant',
      params: DEFAULT_WEAPON_PARAMS,
      variants: [
        {
          name: 'Carbine',
          description: 'short',
          override: { barrel: 'carbine' },
        },
      ],
    };
    const parsed = parseWeapon(serializeWeapon(def));
    expect(parsed.variants).toEqual(def.variants);
  });
});
