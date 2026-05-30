# CLAUDE.md

Working notes for this repo. (User-facing intro lives in `README.md`; the ship
builder design write-up is in `docs/ship-builder.md`.)

## What this is

Tools for running **Mongoose Traveller 2nd Edition (MgT2)**, built as an Ink TUI
that runs both in a terminal and in the browser (xterm.js → GitHub Pages). The
flagship feature is a **ship builder** backed by a generic, builder-agnostic
rules engine.

## Monorepo layout (npm workspaces)

| Package         | Role                                                         | Depends on |
| --------------- | ------------------------------------------------------------ | ---------- |
| `packages/core` | Pure MgT2 rules engine. **No I/O.** Fully unit-tested.       | —          |
| `packages/tui`  | The Ink TUI. Exposes `mount(opts)` reused by terminal + web. | core       |
| `packages/web`  | xterm.js browser terminal hosting the TUI.                   | core, tui  |

Dependency direction is strict: **core knows nothing about tui/web**. Keep all
rules/data/maths in core; keep all rendering in tui.

## Commands

```
npm test            # vitest (run from repo root)
npm run lint        # eslint + prettier --check  (run before every push)
npm run build       # tsc --build (all packages)
npm run dev         # builds, then runs the TUI in this terminal (tsx)
npm run build:web   # builds, then vite-builds the web bundle
```

- `dev` / `dev:web` / `build:web` **chain `npm run build` first** on purpose: tui
  and web import core's compiled `dist/`, so a stale build breaks them.
- A **husky pre-commit hook** runs `eslint --fix` + `prettier --write` on staged
  files. Always get `lint`, `test`, and `build:web` green before pushing.

## The design engine (`packages/core/src/design/`)

Generic, not ship-specific (vehicles/robots are meant to reuse it):

- **`Chassis`** — provides resource capacities + base stats (the hull).
- **`ComponentDef`** — `resources(inst, ctx)` returns signed `ResourceDelta`
  (negative = consumes), optional `stats`, optional `describe(inst, ctx)` for the
  line-item name, optional `minTL`/`unique`.
- **`ResourceDef`** — `mode: 'capacity' | 'accumulate'`, `overflowSeverity`.
- **`summarize`** → per-resource usage + merged stats + `lineItems`.
  **`evaluate`** → summarize + `Rule[]` issues (over-capacity, requires, unique,
  minTL, plus custom).
- `InstalledComponent.options` is `Record<string, number | string | string[]>`
  (the `string[]` is e.g. a turret's fitted weapons).

## The ship domain (`packages/core/src/ships/ship.ts`)

Entry point: **`evaluateShip(params: ShipParams)`** → `{ summary, issues,
cargoTons, powerRequirements, crew, runningCosts }`. `makeShipDesign(params)`
turns params into the installed-component list; `SHIP_RULES` holds the
ship-specific validations.

Conventions that matter:

- **Numbers come from the MgT2 Core Rulebook (2022).** Per-line component costs
  match the book exactly. The printed **purchase price = component total × 0.9**
  (the standard-design discount, `params.standardDesign`); maintenance is
  0.1%/year of that. So the sheet's `TOTAL` (full) and `Buy` (discounted) differ
  on purpose.
- **Verified vs. derived.** Anything not in the Core text the user supplied
  (reinforced hull, etc. — these are High Guard) is flagged via an "unverified"
  mechanism and `evaluateShip` adds a _warning_. **Do not invent rule numbers** —
  ask the user for the book values; they're the authority and have caught several
  guesses. When unsure, flag it.
- **Carried craft** (`CarriedCraft`, `kind: 'ship' | 'vehicle'`): docking space =
  `ceil(craftTons × 1.1)` at MCr0.25/ton (Core). One level of nesting is
  supported (e.g. an ATV on a Launch) via `carryShip(def, count, nested)`.
- Built-ins (`BUILTIN_SHIPS`) and the vehicle catalogue (`VEHICLE_CATALOG`) are
  typed TS data (not JSON — `tsc` won't copy `.json` into `dist/`). A test asserts
  every built-in builds with no error-severity issues and non-negative cargo.
- Serialization (`library.ts`): a versioned JSON envelope; `parseShip` is
  tolerant (fills defaults, drops unknowns, accepts a legacy single `weapon`).

### Adding a component / system

1. Add the id to the relevant union (`SystemTypeId`, `SoftwareTypeId`, …) and the
   label record.
2. Add a `ComponentDef` to `SHIP_CATALOG` (resources/stats/describe).
3. If it's a new `ShipParams` field, update `DEFAULT_SHIP_PARAMS` +
   `normalizeParams` (library.ts), the test `baseParams`, and the TUI
   (`formValues`, a field/section, the `params` object in `ShipBuilder.tsx`).
4. Tonnage-based "systems" auto-appear in the builder's Systems list.

## TUI notes (`packages/tui`)

- **Raw-mode loop gotcha:** Ink re-subscribes `useInput` when its handler
  identity changes, which can churn the raw-mode effect into a "Maximum update
  depth" loop on a real TTY. `Field` and `ChoiceField` use a **stable
  `useCallback` handler that reads latest props from a ref**; `useForm` returns
  **stable per-field setters**. Preserve this pattern.
- `ChoiceField` sorts + filters its options and shows a short scrolling window
  (don't reintroduce a single wrapping row).
- `ShipSheet` sizes its name column to the terminal width (`useStdout`) and wraps
  long names.
- The builder is sectioned (Tab between sections, ↑/↓ within). Several real-Ink
  tests (`ship-builder.test.tsx`) count Tabs/Enters to reach a section/field —
  **adding fields/sections shifts those counts**, so update the tests. Tab-based
  navigation uses `gotoSection` (robust to field count); Enter-based stepping is
  linear across all rows (fragile).
- Tests drive the real Ink renderer via `testkit.tsx` (`renderInk`, `type`,
  `waitFor`, `frame`). `frame()` is ANSI-stripped; the harness terminal is narrow
  (~76 cols), so don't `waitFor` text that may truncate.

## Source material

Rules were transcribed from the user's Core Rulebook 2022 texts (spaceship
construction, common spacecraft, vehicles). If those uploads aren't available in
a session, ask the user to paste the relevant table rather than guessing.
