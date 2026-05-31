import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { NamedStore, ShipStore, WeaponStore } from './storage.js';

/**
 * A {@link NamedStore} backed by a JSON file. Used by the terminal entry so
 * saved designs persist between runs. Reads are tolerant: a missing or
 * malformed file reads as empty rather than throwing.
 */
export function fileStore<T extends { name: string }>(
  path: string,
): NamedStore<T> {
  const read = (): T[] => {
    try {
      if (!existsSync(path)) return [];
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return Array.isArray(data) ? (data as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = (items: T[]): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(items, null, 2), 'utf8');
  };
  return {
    list: read,
    save: (def) => write([...read().filter((s) => s.name !== def.name), def]),
    remove: (name) => write(read().filter((s) => s.name !== name)),
  };
}

const dir = (file: string) => join(homedir(), '.traveller-tools', file);

/** The default file-backed ship library (~/.traveller-tools/ships.json). */
export const shipFileStore = (path = dir('ships.json')): ShipStore =>
  fileStore(path);

/** The default file-backed weapon library (~/.traveller-tools/weapons.json). */
export const weaponFileStore = (path = dir('weapons.json')): WeaponStore =>
  fileStore(path);
