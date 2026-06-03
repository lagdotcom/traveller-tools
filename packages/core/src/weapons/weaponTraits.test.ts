import { describe, expect, it } from 'vitest';

import { findWeaponTrait, WEAPON_TRAITS } from './weaponTraits.js';

describe('weapon traits glossary', () => {
  it('covers the FC-detailed and Core combat traits with non-empty descriptions', () => {
    const fc = WEAPON_TRAITS.filter((t) => t.source === 'Field Catalogue');
    const core = WEAPON_TRAITS.filter((t) => t.source === 'Core Rulebook');
    expect(fc).toHaveLength(13); // the thirteen FC "Weapon Traits" entries
    expect(core).toHaveLength(10); // the Core combat traits the engine stamps
    expect(fc.length + core.length).toBe(WEAPON_TRAITS.length); // no other source
    for (const t of WEAPON_TRAITS) {
      expect(t.key).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(20);
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
