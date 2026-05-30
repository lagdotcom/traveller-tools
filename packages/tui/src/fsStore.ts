import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { type ShipDefinition } from '@traveller-tools/core';

import type { ShipStore } from './storage.js';

/**
 * A ShipStore backed by a JSON file (default: ~/.traveller-tools/ships.json).
 * Used by the terminal entry so saved ships persist between runs.
 */
export function fileStore(
  path = join(homedir(), '.traveller-tools', 'ships.json'),
): ShipStore {
  const read = (): ShipDefinition[] => {
    try {
      if (!existsSync(path)) return [];
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return Array.isArray(data) ? (data as ShipDefinition[]) : [];
    } catch {
      return [];
    }
  };
  const write = (ships: ShipDefinition[]): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(ships, null, 2), 'utf8');
  };
  return {
    list: read,
    save: (def) => write([...read().filter((s) => s.name !== def.name), def]),
    remove: (name) => write(read().filter((s) => s.name !== name)),
  };
}
