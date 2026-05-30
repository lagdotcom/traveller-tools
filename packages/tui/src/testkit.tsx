import { EventEmitter } from 'node:events';

import stripAnsi from 'strip-ansi';

import { mount } from './mount.js';

/**
 * Drives the TUI through *real* (non-`debug`) Ink against fake streams — the
 * same render path the terminal and browser use. ink-testing-library renders in
 * debug mode, which masks runtime-only issues (e.g. throttled-render loops), so
 * the hardening tests use this instead.
 *
 * Ink writes each frame as a single `stream.write(eraseLines + frame)` call,
 * sometimes followed by a bare cursor-control write, so the current frame is
 * the most recent write that still has visible text once ANSI is stripped.
 */

const ESC_CODE = 27;
const CSI = 0x5b; // '['

export const ARROW_DOWN = String.fromCharCode(ESC_CODE, CSI, 0x42); // ESC [ B
export const ARROW_UP = String.fromCharCode(ESC_CODE, CSI, 0x41); // ESC [ A
export const ENTER = '\r';
export const ESC = String.fromCharCode(ESC_CODE);
export const BACKSPACE = String.fromCharCode(127);
export const TAB = '\t';

export interface InkHarness {
  /** The current rendered frame (latest write with text, ANSI stripped). */
  frame: () => string;
  /** Send raw input as if typed; resolves after a render tick. */
  type: (data: string) => Promise<void>;
  /** Poll until the current frame contains `text` (throws on timeout). */
  waitFor: (text: string, timeoutMs?: number) => Promise<void>;
  /** console.error messages captured during the session. */
  errors: () => string[];
  unmount: () => void;
}

export function renderInk(): InkHarness {
  const writes: string[] = [];
  const stdout = new EventEmitter() as never as NodeJS.WriteStream;
  Object.assign(stdout, {
    columns: 80,
    rows: 24,
    isTTY: true,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
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

  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };

  const app = mount({
    stdin,
    stdout,
    stderr: stdout,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

  const frame = () => {
    for (let i = writes.length - 1; i >= 0; i--) {
      const text = stripAnsi(writes[i]!);
      if (text.trim().length > 0) return text;
    }
    return '';
  };

  // Ink subscribes to stdin's 'readable' event in an effect after the first
  // paint (App.js). Wait for that so the first keystroke isn't sent into the
  // void (the listener-attach race).
  const waitForInputReady = async () => {
    const start = Date.now();
    while (stdin.listenerCount('readable') === 0) {
      if (Date.now() - start > 2000) break;
      await tick();
    }
  };

  return {
    frame,
    async type(data: string) {
      await waitForInputReady();
      pending = data;
      stdin.emit('readable');
      stdin.emit('data', data);
      await tick();
    },
    async waitFor(text: string, timeoutMs = 3000) {
      const start = Date.now();
      while (!frame().includes(text)) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(
            `Timed out waiting for ${JSON.stringify(text)}.\nLast frame:\n${frame()}`,
          );
        }
        await tick();
      }
    },
    errors: () => errors,
    unmount() {
      app.unmount();
      console.error = originalError;
    },
  };
}
