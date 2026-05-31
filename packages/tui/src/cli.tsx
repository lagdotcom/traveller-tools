#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { shipFileStore, weaponFileStore } from './fsStore.js';
import { mount } from './mount.js';

mount({
  store: shipFileStore(),
  weaponStore: weaponFileStore(),
  files: {
    // Import reads a JSON file by path (terminals have no native picker).
    readFile: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
  },
});
