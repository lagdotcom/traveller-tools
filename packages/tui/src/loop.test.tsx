import { describe, expect, it } from 'vitest';

import { ENTER, renderInk } from './testkit.js';

/**
 * Regression test for the unstable-onChange render loop: typing into a field
 * used to re-fire @inkjs/ui TextInput's effect endlessly ("Maximum update depth
 * exceeded"). Driven through real (non-debug) Ink, which is where it surfaced.
 */
describe('TextInput render stability', () => {
  it('typing into a field does not trigger an update loop', async () => {
    const ui = renderInk();
    await ui.waitFor('Traveller Tools');
    await ui.type(ENTER); // open Jump & Fuel
    await ui.waitFor('Fuel = 10% of hull tonnage');
    await ui.type('2'); // type into the hull tonnage field
    await ui.type('0');
    await ui.type('0');

    const loopWarning = ui
      .errors()
      .some((message) => message.includes('Maximum update depth exceeded'));
    ui.unmount();
    expect(loopWarning).toBe(false);
  });
});
