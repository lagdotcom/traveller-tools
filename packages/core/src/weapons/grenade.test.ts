import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRENADE_PARAMS,
  evaluateWeapon,
  type GrenadeParams,
  normalizeWeaponParams,
  parseWeapon,
  serializeWeapon,
} from './index.js';

const grenade = (overrides: Partial<GrenadeParams>): GrenadeParams => ({
  ...DEFAULT_GRENADE_PARAMS,
  ...overrides,
});

describe('grenade — catalogue lookup', () => {
  it('a Hand fragmentation grenade', () => {
    const r = evaluateWeapon(grenade({ type: 'fragmentation', size: 'hand' }));
    expect(r.totals.costCr).toBe(30);
    expect(r.totals.weightKg).toBe(0.5);
    expect(r.profile.damage.dice).toBe(5);
    expect(r.profile.traits['Blast']).toBe(9);
    expect(r.profile.traits['Lo-Pen']).toBe(2);
    expect(r.profile.capacity).toBe(1);
  });

  it('the Mini size is cheaper/lighter where it exists', () => {
    const r = evaluateWeapon(grenade({ type: 'fragmentation', size: 'mini' }));
    expect(r.totals.costCr).toBe(20);
    expect(r.totals.weightKg).toBe(0.3);
    expect(r.profile.damage.dice).toBe(3);
    expect(r.profile.traits['Blast']).toBe(4);
  });

  it('an effect-only grenade (smoke) has no damage dice', () => {
    const r = evaluateWeapon(grenade({ type: 'smoke', size: 'hand' }));
    expect(r.profile.damage.dice).toBe(0);
    expect(r.profile.traits['Blast']).toBe(9);
  });
});

describe('grenade — validation', () => {
  it('errors and falls back to Hand when a mini is unavailable', () => {
    const r = evaluateWeapon(grenade({ type: 'plasma', size: 'mini', tl: 12 }));
    expect(
      r.issues.some((i) => /not available as a mini-grenade/.test(i.message)),
    ).toBe(true);
    // Falls back to the Hand plasma grenade (8D).
    expect(r.profile.damage.dice).toBe(8);
  });

  it('gates the payload by tech level', () => {
    const r = evaluateWeapon(grenade({ type: 'plasma', size: 'hand', tl: 9 }));
    expect(r.issues.some((i) => /Plasma requires TL12/.test(i.message))).toBe(
      true,
    );
  });
});

describe('grenade — serialization', () => {
  it('round-trips a fragmentation grenade design', () => {
    const def = {
      name: 'Fragmentation Grenade',
      params: {
        ...DEFAULT_GRENADE_PARAMS,
        type: 'fragmentation',
        size: 'hand',
      },
    } as const;
    const parsed = parseWeapon(serializeWeapon(def));
    expect(parsed.params).toEqual(def.params);
  });

  it('normalizes a kind:grenade document and tolerates garbage', () => {
    const params = normalizeWeaponParams({
      kind: 'grenade',
      type: 'nonsense',
      size: 'huge',
    }) as GrenadeParams;
    expect(params.kind).toBe('grenade');
    expect(params.type).toBe(DEFAULT_GRENADE_PARAMS.type);
    expect(params.size).toBe(DEFAULT_GRENADE_PARAMS.size);
    expect(() => evaluateWeapon(params)).not.toThrow();
  });
});
