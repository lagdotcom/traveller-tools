import { describe, expect, it } from 'vitest';

import {
  ARROW_DOWN,
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

  it('selects a hull configuration by closest-match completion', async () => {
    const ui = await openBuilder();
    // Move to the Hull config choice field (hull, tl, config = 3rd field).
    await ui.type(ENTER); // -> tech level
    await ui.type(ENTER); // -> hull config
    // Clear the default "standard" then type a prefix and submit; it should
    // snap to the canonical "streamlined" option.
    for (let i = 0; i < 'standard'.length; i++) await ui.type(BACKSPACE);
    await ui.type('stream');
    await ui.type(ENTER);
    // Streamlined hull on 100t costs 6 MCr (100 × 0.05 × 1.2).
    await ui.waitFor('Streamlined');
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
    for (let i = 0; i < 20; i++) await ui.type(ENTER);
    await ui.type('9');
    await ui.waitFor('Hardpoints exceeds capacity');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });
});
