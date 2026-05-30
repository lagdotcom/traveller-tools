import { describe, expect, it } from 'vitest';

import process, { stderr, stdout } from './process';

describe('process shim', () => {
  it('exposes named exports Ink imports', () => {
    expect(typeof process.cwd).toBe('function');
    expect(process.platform).toBe('browser');
    expect(typeof process.env).toBe('object');
  });

  it('provides stdout/stderr stand-ins so cli-cursor fallbacks do not crash', () => {
    // Reproduces cli-cursor's `hide(writableStream = process.stderr)`:
    //   if (!writableStream.isTTY) return;
    // which threw "Cannot read properties of undefined (reading 'isTTY')"
    // when process.stderr was undefined.
    for (const stream of [process.stdout, process.stderr]) {
      expect(stream).toBeDefined();
      expect(stream.isTTY).toBe(false); // falsy => cli-cursor cleanly no-ops
      expect(typeof stream.write).toBe('function');
    }
    expect(stdout.write('x')).toBe(true);
    expect(stderr.write('x')).toBe(true);
  });
});
