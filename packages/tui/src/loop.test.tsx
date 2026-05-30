import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mount } from './mount.js';

/**
 * Real (non-`debug`) Ink render against fake streams. ink-testing-library uses
 * debug mode, which masked an infinite render loop: an unstable onChange passed
 * to @inkjs/ui's TextInput re-fired its effect endlessly ("Maximum update depth
 * exceeded"). This drives the actual render path to guard against regressions.
 */
function fakeStreams() {
  const stdout = new EventEmitter() as never as NodeJS.WriteStream;
  Object.assign(stdout, {
    columns: 80,
    rows: 24,
    isTTY: true,
    write: () => true,
  });
  let pending: string | null = null;
  const stdin = new EventEmitter() as never as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode: () => stdin,
    setEncoding: () => stdin,
    resume: () => stdin,
    pause: () => stdin,
    ref: () => stdin,
    unref: () => stdin,
    read: () => {
      const data = pending;
      pending = null;
      return data;
    },
  });
  const type = (data: string) => {
    pending = data;
    stdin.emit('readable');
    stdin.emit('data', data);
  };
  return { stdin, stdout, type };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TextInput render stability', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('typing into a field does not trigger an update loop', async () => {
    const { stdin, stdout, type } = fakeStreams();
    const app = mount({
      stdin,
      stdout,
      stderr: stdout,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    await wait(80);
    type('\r'); // open Jump & Fuel
    await wait(80);
    type('2'); // type into the hull tonnage field
    await wait(150);

    app.unmount();

    const loopWarning = errorSpy.mock.calls.some((args) =>
      String(args[0]).includes('Maximum update depth exceeded'),
    );
    expect(loopWarning).toBe(false);
  });
});
