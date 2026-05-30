import { render, type RenderOptions } from 'ink';
import React from 'react';

import { App } from './app.js';
import { type FileCapabilities, FilesProvider } from './files.js';
import { memoryStore, type ShipStore, StoreProvider } from './storage.js';

export { type FileCapabilities } from './files.js';
export { memoryStore, type ShipStore } from './storage.js';

export interface MountOptions extends RenderOptions {
  /** Persistence for the ship library. Defaults to an in-memory store. */
  store?: ShipStore;
  /** Platform file access for importing a ship (CLI: read path; web: picker). */
  files?: FileCapabilities;
}

/**
 * Mount the TUI against the given streams. The terminal entry point uses the
 * defaults (process.stdin/stdout); the browser build passes an xterm.js-backed
 * stdin/stdout pair so the exact same UI runs at a URL. A ShipStore persists
 * saved ships, and FileCapabilities provide platform file import.
 */
export function mount({ store, files, ...renderOptions }: MountOptions = {}) {
  return render(
    React.createElement(
      FilesProvider,
      { files: files ?? {} },
      React.createElement(
        StoreProvider,
        { store: store ?? memoryStore() },
        React.createElement(App),
      ),
    ),
    renderOptions,
  );
}
