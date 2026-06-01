import { describe, expect, it } from 'vitest';

import { BUILTIN_WEAPONS, evaluateWeapon } from './index.js';

/**
 * Golden master: the full evaluation of every built-in weapon, frozen as a
 * snapshot. Any refactor of the evaluators (e.g. the pipeline-DSL rewrite) must
 * reproduce these byte-for-byte — `vitest -u` is the only sanctioned way to
 * change them, and only when a rule genuinely changes.
 */
describe('golden master — built-in weapon evaluations', () => {
  for (const def of BUILTIN_WEAPONS) {
    it(`reproduces ${def.name}`, () => {
      expect(evaluateWeapon(def.params)).toMatchSnapshot();
    });
  }
});
