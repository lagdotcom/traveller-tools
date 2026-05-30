import type { ShipDefinition } from '@traveller-tools/core';
import type { ShipStore } from '@traveller-tools/tui';

const KEY = 'traveller-tools/ships';

/** A ShipStore backed by localStorage so saved ships survive page reloads. */
export function localStore(): ShipStore {
  const read = (): ShipDefinition[] => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? (data as ShipDefinition[]) : [];
    } catch {
      return [];
    }
  };
  const write = (ships: ShipDefinition[]): void => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ships));
    } catch {
      // storage unavailable (private mode / quota) — saving is best-effort
    }
  };
  return {
    list: read,
    save: (def) => write([...read().filter((s) => s.name !== def.name), def]),
    remove: (name) => write(read().filter((s) => s.name !== name)),
  };
}
