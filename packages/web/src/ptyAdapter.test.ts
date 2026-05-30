import { mount } from '@traveller-tools/tui';
import { describe, expect, it } from 'vitest';

import { createStreams } from './ptyAdapter';

/**
 * Minimal stand-in for an xterm.js Terminal: records everything Ink writes and
 * lets the test feed keystrokes back through the `onData` callback, exactly as
 * xterm would in the browser.
 */
class FakeTerminal {
  cols = 80;
  rows = 24;
  output = '';
  private dataCb?: (data: string) => void;

  write(data: string): void {
    this.output += data;
  }
  onData(cb: (data: string) => void) {
    this.dataCb = cb;
    return { dispose() {} };
  }
  onResize() {
    return { dispose() {} };
  }
  type(data: string): void {
    this.dataCb?.(data);
  }
}

/** Poll until `term.output` contains `text`, to avoid flaky fixed sleeps. */
async function waitForOutput(
  term: FakeTerminal,
  text: string,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!term.output.includes(text)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${JSON.stringify(text)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('xterm <-> Ink bridge', () => {
  it('boots the TUI through the adapter and reacts to input', async () => {
    const term = new FakeTerminal();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { stdin, stdout } = createStreams(term as any);

    const app = mount({
      stdin,
      stdout,
      stderr: stdout,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    // Ink rendered the menu out through term.write (proves yoga/layout + the
    // stdout side of the bridge work at runtime, not just at build time).
    await waitForOutput(term, 'Traveller Tools');
    expect(term.output).toContain('Jump & Fuel calculator');

    // Select the default-focused first option (Jump & Fuel). Ink attaches its
    // stdin listener in an effect just after the first paint, so we re-send
    // Enter until the screen actually changes — this proves keystrokes flow
    // term.onData -> stdin -> Ink and drive the UI, without racing setup.
    const deadline = Date.now() + 4000;
    // The Jump & Fuel *screen* subtitle is distinct from the menu item label.
    while (!term.output.includes('Fuel = 10% of hull tonnage')) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for the Jump & Fuel screen');
      }
      term.type('\r');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(term.output).toContain('Fuel = 10% of hull tonnage');
    app.unmount();
  });

  it('feeds synthetic keys (on-screen controls) into stdin', () => {
    const term = new FakeTerminal();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { stdin, sendKey } = createStreams(term as any);
    const seen: string[] = [];
    stdin.on('data', (d) => seen.push(String(d)));

    sendKey('\x1b[B'); // arrow down, as an on-screen button would send
    sendKey('\r'); // enter

    expect(seen).toEqual(['\x1b[B', '\r']);
  });
});
