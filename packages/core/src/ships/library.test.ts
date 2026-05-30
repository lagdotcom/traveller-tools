import { describe, expect, it } from 'vitest';

import { BUILTIN_SHIPS } from './builtins.js';
import {
  DEFAULT_SHIP_PARAMS,
  normalizeParams,
  parseShip,
  serializeShip,
  SHIP_FORMAT,
} from './library.js';
import { evaluateShip } from './ship.js';

describe('ship library', () => {
  it('round-trips a ship through serialize/parse', () => {
    const def = {
      name: 'Test Boat',
      description: 'A test.',
      params: { ...DEFAULT_SHIP_PARAMS, hullTons: 300, jump: 2 },
    };
    const text = serializeShip(def);
    expect(text).toContain(SHIP_FORMAT);
    const back = parseShip(text);
    expect(back.name).toBe('Test Boat');
    expect(back.description).toBe('A test.');
    expect(back.params.hullTons).toBe(300);
    expect(back.params.jump).toBe(2);
  });

  it('fills defaults for missing or malformed fields', () => {
    const p = normalizeParams({ hullTons: 'oops', jump: 3, bogus: true });
    expect(p.hullTons).toBe(DEFAULT_SHIP_PARAMS.hullTons); // bad value -> default
    expect(p.jump).toBe(3);
    expect(p.weapons).toEqual([]);
    expect(p.reinforcementTons).toBe(0);
  });

  it('rejects non-JSON input with a friendly error', () => {
    expect(() => parseShip('not json {')).toThrow(/JSON/);
  });

  it('accepts a bare params object and names it', () => {
    const def = parseShip(JSON.stringify({ hullTons: 100, thrust: 2 }));
    expect(def.name).toBe('Imported Ship');
    expect(def.params.thrust).toBe(2);
  });

  it('drops unknown systems/software/weapons on import', () => {
    const def = parseShip(
      JSON.stringify({
        name: 'Junk',
        params: {
          systems: [{ type: 'nope', amount: 5 }],
          weapons: [{ mount: 'single', weapon: 'beamLaser' }, { mount: 'x' }],
        },
      }),
    );
    expect(def.params.systems).toEqual([]);
    expect(def.params.weapons).toEqual([
      { mount: 'single', weapons: ['beamLaser'] },
    ]);
  });

  it('builds every built-in ship without error-severity issues', () => {
    expect(BUILTIN_SHIPS.length).toBeGreaterThan(0);
    for (const def of BUILTIN_SHIPS) {
      const { issues, cargoTons } = evaluateShip(def.params);
      const errors = issues.filter((i) => i.severity === 'error');
      expect(errors, `${def.name}: ${JSON.stringify(errors)}`).toEqual([]);
      expect(cargoTons, `${def.name} cargo`).toBeGreaterThanOrEqual(0);
    }
  });
});
