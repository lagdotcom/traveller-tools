import { render, type RenderOptions } from 'ink';
import React from 'react';

import { App } from './app.js';
import { type FileCapabilities, FilesProvider } from './files.js';
import { type ShipStore, StoreProvider, type WeaponStore } from './storage.js';

export { type FileCapabilities } from './files.js';
export {
  memoryStore,
  type NamedStore,
  type ShipStore,
  type WeaponStore,
} from './storage.js';

export interface MountOptions extends RenderOptions {
  /** Persistence for the ship library. Defaults to an in-memory store. */
  store?: ShipStore;
  /** Persistence for the weapon library. Defaults to an in-memory store. */
  weaponStore?: WeaponStore;
  /** Platform file access for importing a design (CLI: read path; web: picker). */
  files?: FileCapabilities;
}

/**
 * Mount the TUI against the given streams. The terminal entry point uses the
 * defaults (process.stdin/stdout); the browser build passes an xterm.js-backed
 * stdin/stdout pair so the exact same UI runs at a URL. The stores persist saved
 * ships/weapons, and FileCapabilities provide platform file import.
 */
export function mount({
  store,
  weaponStore,
  files,
  ...renderOptions
}: MountOptions = {}) {
  return render(
    React.createElement(
      FilesProvider,
      { files: files ?? {} },
      React.createElement(
        StoreProvider,
        { shipStore: store, weaponStore },
        React.createElement(App),
      ),
    ),
    renderOptions,
  );
}
