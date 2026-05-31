# CLAUDE.md

Working notes for this repo. (User-facing intro lives in `README.md`; design
write-ups are in `docs/ship-builder.md` and `docs/weapon-builder.md`.)

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
- **Provenance.** `ComponentDef.source` tags a non-base book (e.g.
  `'High Guard'`); `evaluateShip` collects these into `sources` and the sheet
  shows a "Sources" panel of the rulebooks a design needs. Orthogonal to the
  verified/derived warning (`source` = which book, warning = not yet confirmed).

### Adding a component / system

1. Add the id to the relevant union (`SystemTypeId`, `SoftwareTypeId`, …) and the
   label record.
2. Add a `ComponentDef` to `SHIP_CATALOG` (resources/stats/describe).
3. If it's a new `ShipParams` field, update `DEFAULT_SHIP_PARAMS` +
   `normalizeParams` (library.ts), the test `baseParams`, and the TUI
   (`formValues`, a field/section, the `params` object in `ShipBuilder.tsx`).
4. Tonnage-based "systems" auto-appear in the builder's Systems list.

## The weapon domain (`packages/core/src/weapons/`)

Field Catalogue weapons in five classes — conventional firearms (slug throwers),
directed-energy weapons (lasers/microwave), projectors (flame/cryo), launchers
(grenade/rocket/missile) and thrown grenades — design write-up in
`docs/weapon-builder.md`.

- **Five classes.** `WeaponParams` is a discriminated union on `kind: 'firearm' |
'energy' | 'projector' | 'launcher' | 'grenade'`. `evaluateWeapon(params)`
  (`weapon.ts`) dispatches to `evaluateFirearm`, `evaluateEnergyWeapon`
  (`energy.ts`), `evaluateProjector` (`projector.ts`), `evaluateLauncher`
  (`launcher.ts`) or `evaluateGrenade` (`grenade.ts`), all returning the same
  shape. Legacy docs with no `kind` normalise to firearms. Energy weapons reuse
  the firearm barrel/stock/furniture/accessory tables; projectors, launchers and
  grenades share nothing structural. Class-only tables live in `energyData.ts` /
  `projectorData.ts` / `launcherData.ts` / `grenadeData.ts`. Shared helpers
  (`round2`, `clampLevel`) are in `shared.ts` to avoid an import cycle with
  `weapon.ts`.
- **Deliberately NOT the generic engine.** The Field Catalogue cost/weight model
  is **sequential-multiplicative off a "modified receiver" baseline**, not the
  additive resource model `summarize` uses. So the evaluators
  walk an explicit pipeline returning the same _shape_ as
  `evaluateShip` — `{ profile, breakdown, issues, totals, sources }` — reusing the
  engine's `Issue` type and the `source` provenance idea, but **not** `summarize`.
- **Pipeline:** receiver baseline (gauss → mechanism → calibre → features →
  Increased-Auto → capacity %, all multiplicative) then Phase B (barrel / stock /
  furniture / feed / accessories as % of baseline, or flat Cr). Profile derivation
  (damage with the "running out of dice" rule, range, Auto, recoil, quickdraw,
  penetration→Lo-Pen, signature, traits) happens alongside; loaded ammo modifies
  the **profile only**, not the build cost.
- **All numbers come from the Field Catalogue** (`source: 'Field Catalogue'`). The
  user supplied **eight worked worksheets**, shipped as `BUILTIN_WEAPONS` and used
  as the test oracle. Six use the rules-text base values (seeded); the two early
  ones (Generic 6 Revolver, Compact PDW) are outliers. **Rules-vs-worksheet
  conflicts carry `reconcile:` notes in `data.ts` — do not silently override; the
  user is the authority.** Known conflicts: base receiver values, light-handgun
  cost/weight, small-smoothbore weight, pistol-calibre base penetration (−1),
  smoothbore capacity, laser-pointer price (kept at the rules' Cr200 over the
  Bodyguard worksheet's Cr50), heavy-handgun weight (+15% per the catalogue, not
  the prose's −15%), smoothbore Inaccurate (−1 per the examples, not the table's
  −2; snub keeps −2), snub ammo (Cr200 prose, not the table's Cr150) and snub
  capacity (no −20%, per the examples). Advanced Projectile adds +25% range. The
  Ten-Six worked example can't match on weight because the book inconsistently
  bases the handgun receiver at 0.75kg there vs the table's 0.8kg.
- **Secondary weapons.** `FirearmParams.secondary` is an under-barrel weapon
  (`SecondaryWeaponParams` = a firearm minus `kind`/`secondary`). Mounting it adds
  10% of its cost/weight to the host; it keeps its own profile, surfaced as
  `WeaponEvaluation.secondary` (a second data line on the sheet). One level deep.
- **Adding a component:** add the id to the union + a row in the relevant
  `data.ts` (firearm) / `energyData.ts` / `projectorData.ts` / `launcherData.ts` /
  `grenadeData.ts` record; update the relevant
  `DEFAULT_*_PARAMS`/`normalizeWeaponParams` branch + the TUI
  (`labelMap`/`choiceMap`, a field or one of the add/remove lists in
  `WeaponBuilder.tsx`).
- **Unverified caveats:** the supplied FC text gives **no base Signature** for
  energy weapons, projectors or grenades (shown but flagged); the launcher warhead
  values are the _thrown_ Hand-grenade figures (the launcher-calibre munition table
  isn't in the text, so `evaluateLauncher` flags the profile unverified); grenade
  thrown range isn't a weapon stat (set 0). Don't replace these with invented
  numbers — flag, don't guess.
- The whole FC weapon-design chapter (firearms, energy, projectors, launchers,
  grenades) is now implemented; remaining FC content is non-weapon (armour, gear).

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
