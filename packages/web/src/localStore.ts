import type { NamedStore, ShipStore, WeaponStore } from '@traveller-tools/tui';

/** A {@link NamedStore} backed by localStorage so saved designs survive reloads. */
export function localStore<T extends { name: string }>(
  key: string,
): NamedStore<T> {
  const read = (): T[] => {
    try {
      const raw = window.localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? (data as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = (items: T[]): void => {
    try {
      window.localStorage.setItem(key, JSON.stringify(items));
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

/** localStorage-backed ship library. */
export const shipLocalStore = (): ShipStore =>
  localStore('traveller-tools/ships');

/** localStorage-backed weapon library. */
export const weaponLocalStore = (): WeaponStore =>
  localStore('traveller-tools/weapons');
