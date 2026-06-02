import { describe, expect, it } from 'vitest';

import { findWeaponTrait, WEAPON_TRAITS } from './weaponTraits.js';

describe('weapon traits glossary', () => {
  it('covers the thirteen FC-detailed traits with non-empty descriptions', () => {
    expect(WEAPON_TRAITS).toHaveLength(13);
    for (const t of WEAPON_TRAITS) {
      expect(t.key).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.source).toBe('Field Catalogue');
      // The summary is a one-liner for the sheet's Notes list (matches the
      // length of the existing component notes, ~ up to one wrapped line).
      expect(t.summary.length).toBeGreaterThan(10);
      expect(t.summary.length).toBeLessThanOrEqual(80);
    }
  });

  it('looks a trait up by the key as written on a weapon profile', () => {
    const loPen = findWeaponTrait('Lo-Pen');
    expect(loPen?.label).toBe('Lo-Pen X');
    expect(loPen?.description).toMatch(/multiple applied to the target/);
    expect(findWeaponTrait('Nonexistent')).toBeUndefined();
  });

  it('attaches the reference sub-tables to the right traits', () => {
    expect(findWeaponTrait('Hazardous')?.table?.rows).toHaveLength(8);
    expect(findWeaponTrait('Incendiary')?.table?.rows).toHaveLength(5);
    expect(findWeaponTrait('Unreliable')?.table?.rows).toHaveLength(5);
    expect(findWeaponTrait('Burn')?.table).toBeUndefined();
  });
});
