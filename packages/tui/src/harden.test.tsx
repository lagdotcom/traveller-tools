import { afterEach, describe, expect, it } from 'vitest';

import {
  ARROW_DOWN,
  ENTER,
  ESC,
  type InkHarness,
  renderInk,
} from './testkit.js';

/**
 * End-to-end hardening of the TUI through *real* Ink (see testkit). Exercises
 * both screens across every field, navigation, and re-entry, asserting correct
 * computed output and — throughout — no React update-loop / console errors.
 */
describe('TUI hardening (real Ink)', () => {
  let ui: InkHarness;

  afterEach(() => {
    ui?.unmount();
    // Nothing in normal operation should log to console.error.
    expect(ui.errors()).toEqual([]);
  });

  it('shows the main menu', async () => {
    ui = renderInk();
    await ui.waitFor('Traveller Tools');
    expect(ui.frame()).toContain('Jump & Fuel calculator');
    expect(ui.frame()).toContain('Travel time');
  });

  it('Jump & Fuel: computes fuel, %, and duration across all fields', async () => {
    ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ENTER); // select Jump & Fuel
    await ui.waitFor('Fuel = 10% of hull tonnage');

    await ui.type('400'); // hull tonnage
    await ui.type(ENTER);
    await ui.type('3'); // jump distance
    await ui.type(ENTER);
    await ui.type('5'); // drive rating (>= jump, so valid)
    await ui.type(ENTER);

    // 400t @ Jump-3 => 120 tons, 30% of hull.
    await ui.waitFor('120 tons');
    expect(ui.frame()).toContain('30% of hull');
    expect(ui.frame()).toContain('154–184 hours');
  });

  it('Jump & Fuel: warns when the jump exceeds the installed drive', async () => {
    ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ENTER);
    await ui.waitFor('Fuel = 10% of hull tonnage');

    await ui.type('200');
    await ui.type(ENTER);
    await ui.type('4'); // jump distance
    await ui.type(ENTER);
    await ui.type('2'); // drive rating 2 < 4 => invalid
    await ui.type(ENTER);

    await ui.waitFor('exceeds the installed Jump-2 drive');
  });

  it('Travel: computes time and peak velocity, with unit + gravity override', async () => {
    ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ARROW_DOWN); // move to Travel
    await ui.type(ENTER);
    await ui.waitFor('Travel Time');

    await ui.type('100'); // distance
    await ui.type(ENTER);
    await ui.type('km'); // unit
    await ui.type(ENTER);
    await ui.type('1'); // thrust (G)
    await ui.type(ENTER);
    await ui.type('10'); // 1G = 10 m/s^2 override
    await ui.type(ENTER);

    // 100 km at 1G (g=10): t = 2*sqrt(100000/10) = 200s, peak = 1 km/s.
    await ui.waitFor('Peak velocity');
    expect(ui.frame()).toContain('3m 20s'); // 200 seconds
    expect(ui.frame()).toContain('1 km/s');
  });

  it('returns to the menu with Esc and can open another tool', async () => {
    ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ENTER); // open Jump & Fuel
    await ui.waitFor('Fuel = 10% of hull tonnage');

    await ui.type(ESC); // back to menu
    await ui.waitFor('Jump & Fuel calculator');

    await ui.type(ARROW_DOWN); // now open Travel
    await ui.type(ENTER);
    await ui.waitFor('Travel Time');
  });
});
