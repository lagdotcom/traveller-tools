import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WEAPONS,
  DEFAULT_LAUNCHER_PARAMS,
  evaluateWeapon,
  type LauncherParams,
  normalizeWeaponParams,
  parseWeapon,
  serializeWeapon,
} from './index.js';

const launcher = (overrides: Partial<LauncherParams>): LauncherParams => ({
  ...DEFAULT_LAUNCHER_PARAMS,
  ...overrides,
});

describe('launcher — receiver + warhead', () => {
  it('TL6 single-shot light tube launcher with a frag cartridge', () => {
    const r = evaluateWeapon(
      launcher({ receiver: 'tubeSingleLight', warhead: 'fragmentation' }),
    );
    expect(r.totals.costCr).toBeCloseTo(200, 3);
    // 1.5kg receiver + 1 round × 0.5kg × 1 (cartridge) = 2.0kg loaded.
    expect(r.totals.weightKg).toBeCloseTo(2, 3);
    // Cartridge round = payload Cr30 × 2.5.
    expect(r.totals.magazineCr).toBeCloseTo(75, 3);
    expect(r.profile.damage.dice).toBe(5);
    expect(r.profile.range).toBe(200); // cartridge delivery range
    expect(r.profile.capacity).toBe(1);
    expect(r.profile.traits['Blast']).toBe(9);
    expect(r.profile.traits['Bulky']).toBe(true);
    expect(r.profile.recoil).toBe(0);
  });

  it('an RPG delivers a longer range, Inaccurate, and flags its larger warhead', () => {
    const r = evaluateWeapon(
      launcher({
        receiver: 'reuseSingleHeavy',
        warhead: 'antiArmour',
        delivery: 'rpg',
      }),
    );
    expect(r.profile.range).toBe(500); // RPG delivery range
    expect(r.profile.traits['Inaccurate']).toBe(-2);
    // payload Cr50 ×5, weight 0.5 ×5 = 2.5kg per round.
    expect(r.totals.magazineCr).toBeCloseTo(250, 3);
    expect(r.issues.some((i) => /larger warhead/.test(i.message))).toBe(true);
  });

  it('a guidance system adds 50% cost and the Smart trait', () => {
    const r = evaluateWeapon(launcher({ guidance: true }));
    expect(r.totals.costCr).toBeCloseTo(300, 3); // 200 × 1.5
    expect(r.profile.traits['Smart']).toBe(true);
  });

  it('a support launcher takes a variable magazine', () => {
    const r = evaluateWeapon(
      launcher({
        receiver: 'tubeSupportStandard',
        magazineSize: 5,
        warhead: 'fragmentation',
      }),
    );
    expect(r.profile.capacity).toBe(5);
    // 15kg receiver + 5 × 0.5kg × 1 (cartridge) rounds = 17.5kg.
    expect(r.totals.weightKg).toBeCloseTo(17.5, 3);
    // 5 × payload Cr30 × 2.5 (cartridge).
    expect(r.totals.magazineCr).toBeCloseTo(375, 3);
  });

  it('an effect-only warhead (smoke) has no damage dice', () => {
    const r = evaluateWeapon(launcher({ warhead: 'smoke' }));
    expect(r.profile.damage.dice).toBe(0);
    expect(r.profile.traits['Blast']).toBe(9);
  });

  it('builds the receiver firearm-style: features modify the baseline, then barrel + stock', () => {
    // Whaite Light Munition Launcher: Semi-Auto Light tube (Cr400/2.5kg) made
    // Lightweight (×1.5 cost / ×0.8 wt) + Bullpup (×1.25 cost) → Cr750/2.0kg
    // baseline, + Assault barrel (20%/30%) + full stock (10%/10%).
    const r = evaluateWeapon(
      launcher({
        receiver: 'tubeSemiLight',
        features: ['lightweight', 'bullpup'],
        barrel: 'assault',
        stock: 'full',
        warhead: 'fragmentation',
      }),
    );
    const totals = r.breakdown.find((l) => l.label === 'Receiver Totals')!;
    expect(totals.costCr).toBeCloseTo(750, 3);
    expect(totals.weightKg).toBeCloseTo(2, 3);
    // Empty (unloaded) weapon weight: 2.0 + 0.6 (barrel) + 0.2 (stock) = 2.8kg.
    const loaded = r.totals.weightKg;
    const munition = r.breakdown.find((l) =>
      /Munition/.test(l.label),
    )!.weightKg;
    expect(loaded - munition).toBeCloseTo(2.8, 3);
    // Barrel/stock are cost/weight only — the profile is the warhead's.
    expect(r.profile.damage.dice).toBe(5);
    expect(r.profile.range).toBe(200);
  });
});

describe('launcher — validation', () => {
  it('gates the receiver and the warhead by tech level', () => {
    const r = evaluateWeapon(
      launcher({ tl: 5, receiver: 'tubeSingleLight', warhead: 'plasma' }),
    );
    expect(
      r.issues.some((i) => /Single Shot, Light requires TL6/.test(i.message)),
    ).toBe(true);
    expect(
      r.issues.some((i) => /Plasma warhead requires TL12/.test(i.message)),
    ).toBe(true);
  });

  it('reads Physical (normal); a cartridge round is not flagged unverified', () => {
    const r = evaluateWeapon(launcher({}));
    expect(r.profile.signatureKind).toBe('physical');
    expect(r.profile.signature).toBe('normal');
    // Cartridge/RAM are "equivalent in effect" to the hand payload — no warning.
    expect(r.issues.some((i) => /larger warhead/.test(i.message))).toBe(false);
  });
});

describe('launcher — rifle-grenade delivery', () => {
  it('reproduces the worked Anti-Armour Rifle Grenade (Cr100 / 0.625kg / 100m)', () => {
    const r = evaluateWeapon(
      launcher({
        tl: 6,
        receiver: 'tubeSingleLight',
        warhead: 'antiArmour',
        delivery: 'rifleGrenade',
      }),
    );
    // Round = anti-armour hand payload (Cr50 / 0.5kg) × rifle-grenade (×2 / ×1.25).
    expect(r.totals.magazineCr).toBeCloseTo(100, 3);
    // 1.5kg receiver + 0.625kg loaded round.
    expect(r.totals.weightKg).toBeCloseTo(2.125, 3);
    expect(r.profile.range).toBe(100);
    expect(r.profile.damage.dice).toBe(4);
    expect(r.profile.traits.AP).toBe(8);
    expect(r.profile.traits.Blast).toBe(1);
    // A rifle grenade is "equivalent in effect" to the hand payload — not flagged.
    expect(r.issues.some((i) => /larger warhead/.test(i.message))).toBe(false);
  });
});

describe('launcher — missiles (self-contained rounds)', () => {
  it('fires a loaded missile with its own profile, overriding the grenade path', () => {
    // A reusable single-shot heavy launcher loaded with the AV-7 missile.
    const r = evaluateWeapon(
      launcher({ tl: 10, receiver: 'reuseSingleHeavy', missile: 'av7' }),
    );
    // Profile is the missile's primary (Contact) mode + its own range.
    expect(r.profile.damage.dice).toBe(6);
    expect(r.profile.range).toBe(1000);
    expect(r.profile.traits.AP).toBe(12);
    expect(r.profile.traits.Blast).toBe(4);
    expect(r.profile.traits.Smart).toBe(true);
    // Round cost/weight are the missile's own (no delivery multiplier): one
    // missile × Cr12000 / 6kg, the load weight added to the 15kg receiver.
    expect(r.totals.magazineCr).toBeCloseTo(12000, 3);
    expect(r.totals.weightKg).toBeCloseTo(21, 3);
    // The dual-mode missile shows the primary mode + flags the others.
    expect(r.issues.some((i) => /firing modes/.test(i.message))).toBe(true);
  });

  it('TL-gates the missile (AV-7 is TL10)', () => {
    const r = evaluateWeapon(
      launcher({ tl: 8, receiver: 'reuseSingleHeavy', missile: 'av7' }),
    );
    expect(
      r.issues.some((i) => /AV-7 Missile requires TL10/.test(i.message)),
    ).toBe(true);
  });
});

describe('launcher — serialization', () => {
  it('round-trips the built-in grenade launcher', () => {
    const def = BUILTIN_WEAPONS.find(
      (w) => w.name === 'Light Munitions Launcher',
    )!;
    const parsed = parseWeapon(serializeWeapon(def));
    expect(parsed.params).toEqual(def.params);
  });

  it('normalizes a kind:launcher document and tolerates garbage', () => {
    const params = normalizeWeaponParams({
      kind: 'launcher',
      receiver: 'nonsense',
      magazineSize: 'x',
    });
    expect(params.kind).toBe('launcher');
    expect(params.receiver).toBe(DEFAULT_LAUNCHER_PARAMS.receiver);
    expect(() => evaluateWeapon(params)).not.toThrow();
  });
});
