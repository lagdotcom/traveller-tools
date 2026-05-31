import { describe, expect, it } from 'vitest';

import {
  ARROW_DOWN,
  ENTER,
  type InkHarness,
  renderInk,
  TAB,
} from './testkit.js';

/** Drives the weapon builder through real Ink (see testkit). */
describe('Weapon builder (real Ink)', () => {
  async function openBuilder(): Promise<InkHarness> {
    const ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ARROW_DOWN); // Travel
    await ui.type(ARROW_DOWN); // Ship builder
    await ui.type(ARROW_DOWN); // Ship library
    await ui.type(ARROW_DOWN); // Weapon builder
    await ui.type(ENTER);
    await ui.waitFor('Weapon Builder');
    return ui;
  }

  it('opens with a derived profile and a cost/weight sheet', async () => {
    const ui = await openBuilder();
    expect(ui.frame()).toContain('Profile');
    expect(ui.frame()).toContain('Damage 3D');
    expect(ui.frame()).toContain('Components');
    expect(ui.frame()).toContain('TOTAL');
    expect(ui.frame()).toContain('No issues');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('switches sections with Tab', async () => {
    const ui = await openBuilder();
    expect(ui.frame()).toContain('Tech level');
    await ui.type(TAB);
    expect(ui.frame()).toContain('Mechanism');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('switches to the energy weapon class and shows energy fields', async () => {
    const ui = await openBuilder();
    // The Class choice is the first field; type to pick Energy.
    await ui.type('Energy');
    await ui.waitFor('Beam type');
    // Energy-specific sections replace the firearm ones.
    expect(ui.frame()).toContain('Damage dice');
    await ui.type(TAB); // Type -> Barrel
    await ui.type(TAB); // Barrel -> Furniture
    await ui.type(TAB); // Furniture -> Power
    expect(ui.frame()).toContain('Power source');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('switches to the projector class and shows projector fields', async () => {
    const ui = await openBuilder();
    await ui.type('Projector');
    await ui.waitFor('Frame');
    expect(ui.frame()).toContain('Propellant');
    await ui.type(TAB); // Type -> Payload
    expect(ui.frame()).toContain('Fuel (kg)');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('loads a built-in weapon from the library', async () => {
    const ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ARROW_DOWN); // Travel
    await ui.type(ARROW_DOWN); // Ship builder
    await ui.type(ARROW_DOWN); // Ship library
    await ui.type(ARROW_DOWN); // Weapon builder
    await ui.type(ARROW_DOWN); // Weapon library
    await ui.type(ENTER);
    await ui.waitFor('Weapon Library');
    await ui.type(ENTER); // load the first built-in (Generic 6 Revolver)
    await ui.waitFor('Weapon Builder — Generic 6 Revolver');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });
});
