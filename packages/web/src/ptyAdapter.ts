import type { Terminal } from '@xterm/xterm';
import { EventEmitter } from 'events';

/**
 * Bridge an xterm.js Terminal to the Node-style stdin/stdout streams that Ink's
 * `render()` expects.
 *
 * Ink writes ANSI to `stdout.write` (which xterm renders) and reads keystrokes
 * from `stdin` 'data' events (which xterm emits via `onData`). We provide just
 * enough of the ReadStream/WriteStream surface for Ink to drive the UI.
 */
export function createStreams(term: Terminal): {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
} {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream & {
    columns: number;
    rows: number;
  };
  stdout.columns = term.cols;
  stdout.rows = term.rows;
  stdout.isTTY = true;
  stdout.write = ((data: string | Uint8Array) => {
    term.write(
      typeof data === 'string' ? data : new TextDecoder().decode(data),
    );
    return true;
  }) as NodeJS.WriteStream['write'];

  // Ink reads input via the 'readable' event followed by `read()` (as well as
  // 'data'), so we mirror the contract ink-testing-library uses: stash the
  // latest chunk, emit both events, and hand it back from `read()`.
  let pending: string | null = null;
  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.setEncoding = () => stdin;
  stdin.resume = () => stdin;
  stdin.pause = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  stdin.read = (() => {
    const data = pending;
    pending = null;
    return data;
  }) as NodeJS.ReadStream['read'];

  term.onData((data) => {
    pending = data;
    stdin.emit('readable');
    stdin.emit('data', data);
  });
  term.onResize(({ cols, rows }) => {
    stdout.columns = cols;
    stdout.rows = rows;
    stdout.emit('resize');
  });

  return { stdin, stdout };
}
