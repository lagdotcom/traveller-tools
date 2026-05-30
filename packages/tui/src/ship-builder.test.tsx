import { describe, expect, it } from 'vitest';

import {
  ARROW_DOWN,
  ARROW_RIGHT,
  BACKSPACE,
  ENTER,
  type InkHarness,
  renderInk,
  TAB,
} from './testkit.js';

/** Drives the ship builder through real Ink (see testkit). */
describe('Ship builder (real Ink)', () => {
  async function openBuilder(): Promise<InkHarness> {
    const ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ARROW_DOWN); // Travel
    await ui.type(ARROW_DOWN); // Ship builder
    await ui.type(ENTER);
    await ui.waitFor('Ship Builder');
    return ui;
  }

  it('opens with a live budget and a book-style sheet', async () => {
    const ui = await openBuilder();
    expect(ui.frame()).toContain('Tons');
    // The book-style breakdown table and sidebars.
    expect(ui.frame()).toContain('COMPONENT');
    expect(ui.frame()).toContain('Power Plant');
    expect(ui.frame()).toContain('Cargo');
    expect(ui.frame()).toContain('Hull:');
    // The default 100-ton loadout is within budget.
    expect(ui.frame()).toContain('No issues');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('switches sections with Tab', async () => {
    const ui = await openBuilder();
    // Hull section is active first: its fields show, Drives fields do not.
    expect(ui.frame()).toContain('Hull tonnage');
    expect(ui.frame()).not.toContain('Thrust (M-drive)');
    await ui.type(TAB); // -> Drives & Power
    expect(ui.frame()).toContain('Thrust (M-drive)');
    expect(ui.frame()).not.toContain('Hull tonnage');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('picks a choice option by typing, without clearing first', async () => {
    const ui = await openBuilder();
    await ui.type(ENTER); // -> tech level
    await ui.type(ENTER); // -> hull config (still showing "standard")
    // Typing jumps to the closest match; no need to delete "standard" first.
    await ui.type('disp');
    await ui.waitFor('Dispersed'); // hull name reflects the dispersed config
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('toggles a yes/no option with an arrow key', async () => {
    const ui = await openBuilder();
    // Drives & Power section: thrust, jump, plant, power, fuel, scoop (idx 8).
    for (let i = 0; i < 8; i++) await ui.type(ENTER); // -> Fuel scoop
    await ui.type(ARROW_RIGHT); // no -> yes (one keypress)
    await ui.waitFor('Fuel Scoop'); // the component now appears in the sheet
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('adds a system from the Systems list', async () => {
    const ui = await openBuilder();
    // Tab to the Systems section (Hull→Drives→Defences→Accom→Weapons→Systems).
    for (let i = 0; i < 5; i++) await ui.type(TAB);
    // The "Add system" picker defaults to the first available type; Enter adds.
    await ui.type(ENTER);
    await ui.waitFor('Fuel Processor'); // now a line item in the sheet
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('adds software from the Software list', async () => {
    const ui = await openBuilder();
    // Tab to Software (Hull→Drives→Defences→Accom→Weapons→Systems→Software = 6).
    for (let i = 0; i < 6; i++) await ui.type(TAB);
    await ui.type(ENTER); // add the first available program (Jump Control)
    await ui.waitFor('Jump Control'); // now a line item in the sheet
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('steps a numeric field with the right arrow', async () => {
    const ui = await openBuilder();
    // Hull tonnage is the first field, default 100; Right arrow increments it.
    await ui.type(ARROW_RIGHT);
    await ui.waitFor('Hull — 101 tons');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });

  it('does not crash when the hull field is cleared', async () => {
    const ui = await openBuilder();
    // Hull is the first field, pre-filled "100"; clear it entirely.
    await ui.type(BACKSPACE);
    await ui.type(BACKSPACE);
    await ui.type(BACKSPACE);
    await ui.waitFor('Hull tonnage must be greater than 0');
    ui.unmount();
    expect(ui.errors()).toEqual([]); // no thrown render error captured
  });

  it('flags exceeding the hull hardpoints', async () => {
    const ui = await openBuilder();
    // Advance to the Turrets field (last field) and add more turrets than the
    // 100-ton hull's single hardpoint allows.
    for (let i = 0; i < 18; i++) await ui.type(ENTER);
    await ui.type('9');
    await ui.waitFor('Hardpoints exceeds capacity');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });
});
