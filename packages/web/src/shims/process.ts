// Browser shim for `node:process` that provides the *named* exports Ink imports
// (cwd, env, platform, nextTick, …). The default vite-plugin-node-polyfills
// shim only exposes a default export, which breaks `import { cwd } from
// 'node:process'`. We pass real stdin/stdout into Ink ourselves, so the stream
// fields here are intentionally absent.

export const env: Record<string, string | undefined> = {};
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
