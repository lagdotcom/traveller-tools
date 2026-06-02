import { describe, expect, it } from 'vitest';

import { BUILTIN_SHIPS } from './builtins.js';
import { evaluateShip } from './ship.js';

/**
 * Golden master: the full evaluation of every built-in ship, frozen as a
 * snapshot (the additive-engine counterpart of weapons/golden.test.ts). Any
 * refactor of the ship engine must reproduce these byte-for-byte; `vitest -u`
 * is the only sanctioned way to change them, and only when a rule genuinely
 * changes.
 */
describe('golden master — built-in ship evaluations', () => {
  for (const def of BUILTIN_SHIPS) {
    it(`reproduces ${def.name}`, () => {
      expect(evaluateShip(def.params)).toMatchSnapshot();
    });
  }
});
