import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';

const root = fileURLToPath(new URL('.', import.meta.url));

const processShim = fileURLToPath(
  new URL('./src/shims/process.ts', import.meta.url),
);
const isInCiShim = fileURLToPath(
  new URL('./src/shims/is-in-ci.ts', import.meta.url),
);

/**
 * Resolve `process` / `node:process` to our own shim *before*
 * vite-plugin-node-polyfills can claim them. Ink imports named members
 * (cwd, env, …) which the default polyfill shim (default export only) cannot
 * satisfy. `is-in-ci` is stubbed for the same reason (and must report false so
 * Ink stays interactive).
 */
function inkBrowserShims(): Plugin {
  return {
    name: 'ink-browser-shims',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'process' || id === 'node:process') return processShim;
      if (id === 'is-in-ci') return isInCiShim;
      return null;
    },
  };
}

// Ink (the TUI's renderer) depends on Node built-ins and a WebAssembly layout
// engine (yoga-layout). The polyfills shim the Node globals/streams and the
// wasm plugin lets the layout engine load in the browser.
export default defineConfig({
  root,
  base: '/traveller-tools/',
  plugins: [
    inkBrowserShims(),
    wasm(),
    nodePolyfills({
      // Leave `process` to our own shim (see inkBrowserShims); polyfill the rest.
      exclude: ['process'],
      globals: { process: true, Buffer: true, global: true },
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
