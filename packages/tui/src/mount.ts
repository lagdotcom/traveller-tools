import { render, type RenderOptions } from 'ink';
import React from 'react';

import { App } from './app.js';
import { memoryStore, type ShipStore, StoreProvider } from './storage.js';

export { memoryStore, type ShipStore } from './storage.js';

export interface MountOptions extends RenderOptions {
  /** Persistence for the ship library. Defaults to an in-memory store. */
  store?: ShipStore;
}

/**
 * Mount the TUI against the given streams. The terminal entry point uses the
 * defaults (process.stdin/stdout); the browser build passes an xterm.js-backed
 * stdin/stdout pair so the exact same UI runs at a URL. A ShipStore can be
 * supplied to persist saved ships (file system on the CLI, localStorage on web).
 */
export function mount({ store, ...renderOptions }: MountOptions = {}) {
  return render(
    React.createElement(
      StoreProvider,
      { store: store ?? memoryStore() },
      React.createElement(App),
    ),
    renderOptions,
  );
}
