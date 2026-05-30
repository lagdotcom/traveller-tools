// Browser shim for `node:process` that provides the *named* exports Ink imports
// (cwd, env, platform, nextTick, …). The default vite-plugin-node-polyfills
// shim only exposes a default export, which breaks `import { cwd } from
// 'node:process'`. We pass real stdin/stdout into Ink ourselves, so the stream
// fields here are intentionally absent.

// FORCE_COLOR makes chalk (used by Ink and @inkjs/ui) emit colour even though
// our stream stand-ins report isTTY: false; xterm.js renders truecolor fine.
export const env: Record<string, string | undefined> = { FORCE_COLOR: '3' };
export const argv: string[] = ['browser'];
export const platform = 'browser';
export const arch = 'browser';
export const version = '';
export const versions: Record<string, string> = {};
export const pid = 0;
export const title = 'browser';
export const browser = true;

export function cwd(): string {
  return '/';
}

// Ink's actual output goes through the stdout/stdin we pass to render(). These
// stream stand-ins exist only so libraries that fall back to process.stdout /
// process.stderr (e.g. cli-cursor, which reads `.isTTY`) don't hit `undefined`.
// `isTTY: false` makes those fallbacks cleanly no-op.
const noopWrite = () => true;
export const stdout = { isTTY: false, columns: 80, rows: 24, write: noopWrite };
export const stderr = { isTTY: false, write: noopWrite };
export const stdin = { isTTY: false, read: () => null };

export function nextTick(
  callback: (...args: unknown[]) => void,
  ...args: unknown[]
): void {
  queueMicrotask(() => callback(...args));
}

function noop(): void {}

const process = {
  env,
  argv,
  platform,
  arch,
  version,
  versions,
  pid,
  title,
  browser,
  stdout,
  stderr,
  stdin,
  cwd,
  nextTick,
  on: noop,
  off: noop,
  once: noop,
  removeListener: noop,
  emit: noop,
  exit: noop,
};

export default process;
