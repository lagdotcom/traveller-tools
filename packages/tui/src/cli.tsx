#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { fileStore } from './fsStore.js';
import { mount } from './mount.js';

mount({
  store: fileStore(),
  files: {
    // Import reads a ship JSON file by path (terminals have no native picker).
    readFile: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
  },
});
