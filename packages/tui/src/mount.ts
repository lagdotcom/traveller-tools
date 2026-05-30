import { render, type RenderOptions } from 'ink';
import React from 'react';

import { App } from './app.js';

/**
 * Mount the TUI against the given streams. The terminal entry point uses the
 * defaults (process.stdin/stdout); the browser build passes an xterm.js-backed
 * stdin/stdout pair so the exact same UI runs at a URL.
 */
export function mount(options: RenderOptions = {}) {
  return render(React.createElement(App), options);
}
