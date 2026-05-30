# Traveller Tools

Interactive tools for running **Mongoose Traveller 2nd Edition (MgT2)**, built as
a terminal TUI that also runs in the browser.

The same [Ink](https://github.com/vadimdemedes/ink) TUI runs two ways:

- **In your terminal** via `npm run dev` (or the `traveller-tools` bin once built).
- **In the browser** via an [xterm.js](https://xtermjs.org/) terminal deployed to
  GitHub Pages, so you and your players can use it at a URL.

## Tools

- **Ship builder** — design MgT2 ships component-by-component with live
  tonnage / power / cost / hardpoint budgets, a book-style sheet, derived stats,
  crew and running costs. Mounts (incl. mixed-weapon turrets), the full Core
  "spacecraft equipment" list, and carried craft — ships or catalogue vehicles,
  with one level of nesting (e.g. an ATV on a launch). `Ctrl+S/E/I` to
  save / export / import a design (JSON).
- **Ship library** — load any of the 24 built-in common spacecraft or your saved
  designs into the builder; import a design from pasted JSON.
- **Vehicle catalogue** — the Core Rulebook vehicles, with stat blocks, also
  selectable as carried craft.
- **Jump & Fuel** — jump fuel by hull tonnage and jump number, jump validity
  against the installed drive, and jump duration.
- **Travel time (velocity)** — flip-and-burn travel time and peak velocity for a
  distance (km/AU) at a given thrust (G).

Ship construction follows the **Core Rulebook (2022)**; non-Core (High Guard)
options are flagged, and the ship sheet lists which rulebooks a design needs.
Weapon and robot builders are planned; the rules engine is structured so they
slot in as new modules + screens.

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
npm run dev        # build the libs, then run the TUI in your terminal
npm test           # run the unit + TUI render tests
npm run lint       # eslint + prettier check
npm run build      # typecheck/build core + tui
```

`dev`, `dev:web`, and `build:web` all run `npm run build` first, since the TUI
and web app import the compiled `core`/`tui` packages — so a fresh checkout
works without a separate build step.

### Linting & pre-commit

ESLint runs with `@typescript-eslint` plus the React and React Hooks plugins —
`react-hooks/exhaustive-deps` in particular guards against unstable-callback
render loops. A **Husky** `pre-commit` hook runs **lint-staged**, which applies
`eslint --fix` and `prettier --write` to staged files. The hook installs
automatically via the `prepare` script on `npm install`.

### Web (browser terminal)

```bash
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
