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
  the firearm barrel/stock/furniture/accessory tables; launchers reuse the firearm
  `RECEIVER_FEATURES`/`BARRELS`/`STOCKS` to build their receiver (see below);
  projectors and grenades share nothing structural. Class-only tables live in
  `energyData.ts` / `projectorData.ts` / `launcherData.ts` / `grenadeData.ts`.
  Shared helpers (`round2`, `clampLevel`, `modPct`, `pctOf`, issue/trait helpers)
  are in `shared.ts` to avoid an import cycle with `weapon.ts`.
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
- **Gauss is implied by the calibre** (no separate `gauss` field): the gauss
  calibres carry a `gauss` flag, and `calibre.gauss` triggers the gauss ×2 cost /
  ×1.25 weight / ×3 capacity modifier and the TL12 gate. Gauss calibres carry base
  **Penetration +2** (intrinsic AP) which the Final Penetration table turns into an
  AP trait.
- **Final Penetration table** (`penetrationProfile` in `shared.ts`): a weapon's
  net penetration (clamped ±4) maps to **Lo-Pen** (−pen+1, so −1→Lo-Pen 2 … −4→5)
  or **AP** (positive pen → AP scaled by full damage dice, with a damage penalty).
  So AP is _derived from penetration_, not a separate field — gauss +2 → AP
  (GA-100: AP 4 + the 3D+6→3D+5 damage penalty). Pistol calibres are base pen 0
  (a handgun/short barrel's −1 nets Lo-Pen 2); smoothbores keep base −1 and a
  barrel's penetration penalty doesn't apply to them (low-velocity). Pellet/
  flechette reduce penetration by the barrel's **Pellet Spread** (`PELLET_SPREAD`).
- **Receiver features carry options** (ship-component style). `params.features` is
  a `ReceiverFeatureRef[]`: a bare id for a plain feature, or `{ id, level }` for a
  _leveled_ one (Armoured/Bulwarked/Recoil Comp/Disguised/Low Quality), so one id
  covers every level. A leveled `ReceiverFeatureDef` carries a `levels[]` table;
  `resolveFeature` (in `data.ts`) flattens the chosen level into a concrete def
  before the multiplicative chain runs. Use `resolveFeatures`/`hasFeature`/
  `refFeatureId` rather than touching `RECEIVER_FEATURES` directly.
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
  (`SecondaryWeaponParams` = a firearm minus `kind`/`secondary`). It's treated as a
  **complete extra barrel** (FC complete-multi-barrel rule, p.34): mounting adds
  10% of the **host receiver baseline** (cost & weight) plus the secondary's own
  barrel (full cost, half weight), and costs −1 Quickdraw. It keeps its own
  profile, surfaced as `WeaponEvaluation.secondary` (a second data line on the
  sheet). One level deep. (The Ten-Six worked example reproduces on cost this way.)
- **Adding a component:** add the id to the union + a row in the relevant
  `data.ts` (firearm) / `energyData.ts` / `projectorData.ts` / `launcherData.ts` /
  `grenadeData.ts` record; update the relevant
  `DEFAULT_*_PARAMS`/`normalizeWeaponParams` branch + the TUI
  (`labelMap`/`choiceMap`, a field or one of the add/remove lists in
  `WeaponBuilder.tsx`).
- **Signatures (derived from worked examples, not a rules table):** lasers/energy
  = Emissions (normal), unshifted by the barrel (a collimator, not a muzzle);
  projectors = Emissions (extreme) (from the MF-61 flame example — only flame is
  attested, cryo may differ); launchers = Physical (normal). Grenades have no
  attested signature (left flagged) and no thrown range (a thrower stat, set 0).
- **Launcher receivers are built firearm-style.** `LauncherParams` carries
  `features`/`barrel`/`stock`: `evaluateLauncher` starts from a base launcher
  receiver, applies a multiplicative feature chain (reusing `RECEIVER_FEATURES`) +
  optional guidance (+50%) to fix the modified-receiver baseline, then adds a
  barrel + stock as a % of it (reusing `BARRELS`/`STOCKS`). Unlike a firearm the
  barrel/stock are **cost/weight only** — the profile comes from the warhead +
  delivery, so no damage/range reshaping. Default `barrel:'minimal'` (0-cost,
  integral tube) + `stock:'none'`. The `Light Munition Launcher` built-in
  reproduces this (Cr750/2.0kg receiver baseline → 2.8kg); reconcile: barrel/stock
  %s match the worksheet weight exactly but over-count cost by ~Cr35 (flagged).
- **Launcher munitions** are a **payload × delivery** pair: the warhead supplies
  damage/blast/traits (the hand-grenade payload — "equivalent in effect" per the
  FC), and the delivery system (`DELIVERY_SYSTEMS`: cartridge / RAM / RPG) sets the
  **range** (200/300/500) and multiplies the round's cost/weight (×2.5 / ×3 / ×5).
  reconcile: the worked munition examples don't follow these multipliers uniformly
  (plasma RAM is priced ×1, the anti-armour RPG is a _larger_ warhead than the hand
  payload), so the profile matches the book but round cost/weight are the text
  multipliers, and `evaluateLauncher` flags only RPG/missile "larger warhead"
  damage as not-tabled. Don't invent the full munition table.
- The whole FC weapon-design chapter (firearms, energy, projectors, launchers,
  grenades) is now implemented; remaining FC content is non-weapon (armour, gear).

## TUI notes (`packages/tui`)

- **Raw-mode loop gotcha:** Ink re-subscribes `useInput` when its handler
  identity changes, which can churn the raw-mode effect into a "Maximum update
  depth" loop on a real TTY. `Field` and `ChoiceField` use a **stable
  `useCallback` handler that reads latest props from a ref**; `useForm` returns
  **stable per-field setters**. Preserve this pattern.
- `ChoiceField` sorts + filters its options and shows a scrolling **grid** —
  packing as many options per line as the terminal width allows (`useStdout`),
  snapped to whole rows. (Don't reintroduce a single wrapping row; the grid is a
  deliberate fixed-column layout.)
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
