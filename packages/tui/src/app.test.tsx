import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { App } from './app.js';

const ARROW_DOWN = '[B';

describe('App', () => {
  /** Render the app, returning a `press` helper that flushes after each input. */
  function setup() {
    const api = render(<App />);
    const press = async (input: string) => {
      api.stdin.write(input);
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    return { ...api, press };
  }

  it('renders the main menu', async () => {
    const { lastFrame, press, unmount } = setup();
    await press(''); // let the first frame settle
    expect(lastFrame()).toContain('Traveller Tools');
    expect(lastFrame()).toContain('Jump & Fuel calculator');
    expect(lastFrame()).toContain('Travel time');
    unmount();
  });

  it('opens the Jump & Fuel screen and computes fuel', async () => {
    const { lastFrame, press, unmount } = setup();
    await press(''); // settle initial render
    await press('\r'); // select the first option (Jump & Fuel)
    expect(lastFrame()).toContain('Jump & Fuel');

    await press('200'); // hull tonnage
    await press('\r');
    await press('2'); // jump distance
    await press('\r');

    // 200t hull, Jump-2 => 40 tons (20% of hull)
    expect(lastFrame()).toContain('40 tons');
    expect(lastFrame()).toContain('20% of hull');
    unmount();
  });

  it('opens the Travel screen and computes travel time', async () => {
    const { lastFrame, press, unmount } = setup();
    await press(''); // settle initial render
    await press(ARROW_DOWN); // move to Travel
    await press('\r'); // select
    expect(lastFrame()).toContain('Travel Time');

    await press('1'); // distance
    await press('\r');
    await press('AU'); // unit
    await press('\r');
    await press('1'); // thrust (G)
    await press('\r');

    // 1 AU at 1 G: peak velocity ~1211 km/s
    expect(lastFrame()).toContain('Peak velocity');
    expect(lastFrame()).toContain('1,211');
    unmount();
  });

  it('opens the weapon traits reference', async () => {
    const { lastFrame, press, unmount } = setup();
    await press(''); // settle
    // Jump(0) → … → Weapon traits reference (index 6): six downs.
    for (let i = 0; i < 6; i++) await press(ARROW_DOWN);
    await press('\r');
    expect(lastFrame()).toContain('Weapon Traits');
    expect(lastFrame()).toContain('Lo-Pen');
    unmount();
  });
});
