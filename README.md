# Traveller Tools

Interactive tools for running **Mongoose Traveller 2nd Edition (MgT2)**, built as
a terminal TUI that also runs in the browser.

The same [Ink](https://github.com/vadimdemedes/ink) TUI runs two ways:

- **In your terminal** via `npm run dev` (or the `traveller-tools` bin once built).
- **In the browser** via an [xterm.js](https://xtermjs.org/) terminal deployed to
  GitHub Pages, so you and your players can use it at a URL.

## Tools

- **Jump & Fuel** — jump fuel by hull tonnage and jump number, jump validity
  against the installed drive, and jump duration.
- **Travel time (velocity)** — flip-and-burn travel time and peak velocity for a
  distance (km/AU) at a given thrust (G).

More tools (ship / weapon / vehicle / robot builders) are planned; the rules
engine is structured so they slot in as new modules + screens.

## Project layout

This is an npm-workspaces monorepo:

| Package         | What it is                                                        |
| --------------- | ----------------------------------------------------------------- |
| `packages/core` | Pure MgT2 rules engine (no I/O), fully unit-tested.               |
| `packages/tui`  | The Ink TUI. Exposes `mount(streams)` reused by terminal and web. |
| `packages/web`  | xterm.js browser terminal that hosts the TUI (deployed to Pages). |

## Develop

```bash
npm install        # install all workspaces
npm run dev        # run the TUI in your terminal
npm test           # run the unit + TUI render tests
npm run lint       # eslint + prettier check
npm run build      # typecheck/build core + tui
```

### Web (browser terminal)

```bash
npm run build      # build core + tui first (web imports their dist)
npm run dev:web    # vite dev server
npm run build:web  # production build into packages/web/dist
npm run preview:web
```

Ink targets Node, so the web build shims Node built-ins
(`vite-plugin-node-polyfills`), loads Ink's WebAssembly layout engine
(`vite-plugin-wasm`), and provides a small `process` shim plus an `is-in-ci`
stub (see `packages/web/vite.config.ts`). The `packages/web/src/ptyAdapter.ts`
bridges xterm.js to the Node-style `stdin`/`stdout` that Ink's `render()` wants.

## Deploy (GitHub Pages)

Pushing to the default branch builds `packages/web` and publishes it via the
`.github/workflows/deploy.yml` workflow. **One-time setup:** in the repo,
**Settings → Pages → Build and deployment → Source → GitHub Actions**.

The site is served under the `/traveller-tools/` base path (configured in
`packages/web/vite.config.ts`); change `base` if you fork to a different repo
name.

## Rules reference

- **Jump fuel** = `0.1 × hull tonnage × jump number` tons. A jump takes
  `148 + 6D` hours (~1 week).
- **Travel time** (constant thrust, accelerate to the midpoint then decelerate)
  = `2 × √(distance / acceleration)`, with peak velocity `√(acceleration ×
distance)` reached at the midpoint. `1 G` defaults to `9.81 m/s²` and is
  configurable per calculation.
