import { describe, expect, it } from 'vitest';

import {
  ARROW_DOWN,
  BACKSPACE,
  ENTER,
  type InkHarness,
  renderInk,
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

  it('opens with a live budget and derived stats', async () => {
    const ui = await openBuilder();
    expect(ui.frame()).toContain('Tons');
    expect(ui.frame()).toContain('Cargo');
    expect(ui.frame()).toContain('Thrust');
    // The default 100-ton loadout is within budget.
    expect(ui.frame()).toContain('No issues');
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
    // Advance to the Turrets field (8th field) and add more turrets than the
    // 100-ton hull's single hardpoint allows.
    for (let i = 0; i < 7; i++) await ui.type(ENTER);
    await ui.type('9');
    await ui.waitFor('Hardpoints exceeds capacity');
    ui.unmount();
    expect(ui.errors()).toEqual([]);
  });
});
