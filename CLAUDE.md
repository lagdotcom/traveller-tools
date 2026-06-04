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
npm run reconcile   # book-reconciliation report: every built-in vs its book stat block
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
- **`Evaluation` contract** (`design.ts`): the shared shape both engines satisfy —
  `{ issues: Issue[]; sources: string[] }`. `ShipEvaluation` and `WeaponEvaluation`
  both `extends Evaluation`, so cross-domain TUI bits (e.g. `SourcesPanel`) accept
  either. The additive `summarize` fold and the multiplicative weapon `runBuild`
  stay distinct paradigms; this is the thin contract they genuinely share.

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
- **Definition metadata.** `ShipDefinition`/`WeaponDefinition` carry `name`,
  optional `description` and optional **`manufacturer`** (round-tripped through
  serialize/parse; shown in the library list as `Name · Maker — description`).
  Both builders edit all three as ordinary text fields in a trailing **Identity**
  section (appended last so the position-sensitive nav tests don't shift); `Ctrl+S`
  saves directly using them (no save dialog). Built-in weapons pass the maker as
  the helper's 4th arg and **variants as the 5th**
  (`weapon(name, desc, overrides, mfr?, variants?)`, same for `energyWeapon` /
  `projector` / `launcher`); ships use `ship(name, desc, overrides, mfr?)`.
- **Weapon variants.** `WeaponDefinition.variants?: WeaponVariant[]` — named
  **partial overrides** of the base `params` (`variantParams(base, override)`
  shallow-merges, keeps the base `kind`, normalises). Round-trip through
  serialize/parse (`normalizeVariants`). The library flattens **both built-ins and
  saved designs** into loadable `Base · Variant` entries (resolved params) and
  loading one opens its base weapon positioned on that variant (App threads an
  `initialVariant` index to the builder); the reconcile harness checks each against
  `BookFigures.variants`. The builder edits one **target** (the main weapon or a
  variant): a banner + target list show the current one, `Ctrl+N` adds, `Ctrl+V`
  cycles, `Ctrl+B` returns to main, `Ctrl+R` removes; switching commits the live
  form (a variant's override = the diff vs base) and re-seeds via `useForm.reset` +
  `seedLists` (no remount, so the row-nav tests are untouched).
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
- **The pipeline kernel (`pipeline.ts`).** A build is a fold over typed ops on a
  `{cost, weight, baseCost, baseWeight, lines}` accumulator — **the breakdown is
  the op trace**, so lines can't drift from the maths. Ops: `base` (set + line),
  `step` (multiplicative, marginal line + %, no-op at ×1), `mul` (silent multiply
  — energy folds features/mods into one line), `baseline` (freeze the baseline +
  marker line), `pctComponent` (% of baseline, with %s), `component` (a thunk that
  builds a line from `baseCost`), plus `when`/`each`/`seq`/`noop`. The firearm,
  energy, launcher and projector evaluators all declare their cost/weight via
  `runBuild([...])`; grenade is a pure lookup (no pipeline). **`golden.test.ts`**
  snapshots every built-in's full evaluation — the refactor was byte-identical
  (only `notes: undefined` keys dropped); update it with `vitest -u` only when a
  rule genuinely changes.
- **Pipeline:** receiver baseline (gauss → mechanism → calibre → features →
  Increased-Auto → capacity %, all multiplicative) then Phase B (barrel / stock /
  furniture / feed / accessories as % of baseline, or flat Cr). Profile derivation
  (damage with the "running out of dice" rule, range, Auto, recoil, quickdraw,
  penetration→Lo-Pen, signature, traits) happens alongside; loaded ammo modifies
  the **profile only**, not the build cost.
- **Play-time notes.** A choice whose effect is a _rule_ (a situational DM, a
  special ability) rather than a stat/trait carries a `note` string on its def
  (`AccessoryDef`/`ReceiverFeatureDef`/`FurnitureDef`). `collectNotes(...)` gathers
  them (deduped) into `WeaponEvaluation.notes`, shown as a **Notes** panel on the
  sheet (like Sources). Things already expressed as a trait/number don't get a
  note (e.g. a plain Scope = the `Scope` trait, no note).
- **Multiple ammo types.** `FirearmParams.ammo` is a **list** — the build is fixed
  but each loaded type yields its own profile row (`WeaponEvaluation.ammoProfiles`,
  the first = the primary `profile`), each with its own reload price. The sheet
  shows a labelled row per type (the Crunch Gun lists ball / explosive /
  incendiary / advanced-AP). A loaded type below its TL is a **warning** (not an
  error) — it just isn't available yet; accessories built into the weapon stay
  errors.
- **Multiple magazines / power packs.** `FirearmParams.magazines?: MagazineSpec[]`
  (`{label?, ammo?, pct?, rounds?, costCr?}`): the **first** is the standard magazine
  baked into the build (its `pct` is the effective `capacityPct`); the rest are
  interchangeable alternatives, each a capacity / reload / loaded-weight row
  (`WeaponEvaluation.magazines`, emitted only when >1 option). A magazine **embeds an
  ammo type** (`ammo`, default the primary) — its reload prices off that ammo and it
  also fixes that type's reload on the matching `ammoProfiles` row, so per-ammo book
  prices (Guardian ball Cr270 / explosive Cr1400 / HEAP Cr2300; Solo & Reliant
  ball/advanced-AP) are exact. `rounds`/`costCr` override a **book-listed** count or
  magazine price the % rule can't derive (the count override doesn't touch the
  cost/weight chain).
  A reload price is the **empty feed device + the loaded ammunition** (the FC: ammo
  prices are "the price for a fully loaded magazine"). The empty magazine is a
  fraction of the weapon's purchase price — **1% standard, 2% extended, 5% drum**
  (`FeedDef.emptyMagCostPct`; fixed magazines and belts add 0) — added by
  `reloadFor`. This is the systemic fix for firearm reload under-costing (the engine
  used to price ammo only). A few worked worksheets priced their magazine ammo-only
  (e.g. the 13mm Crunch Gun's 3-round mag), so the engine is now _more_ complete than
  the book there (flagged in reconcile, not overridden).
  Energy weapons use one shape for both: the primary source is `EnergyParams.source:
PackSpec` (a `powerpack {kg, rating}` or `cartridge {count, rating, ejects?}`),
  baked into the build; `EnergyParams.packs?: PackSpec[]` are the alternatives beyond
  it. (Legacy flat `powerSource`/`powerpackKg`/`cartridge*` fields were folded into
  `source`; `parseWeapon` migrates them.) The FC gives **no per-round weight**
  — magazine mass is only the capacity-% weight adjustment, so alternative-mag
  weight scales by that rule and there's no standalone "base magazine weighs X".
  Both are editable in the builder: firearms get a **Magazines** section, energy a
  **Power Packs** section (compound list editors like the ship turret/craft rows —
  each entry has ammo/rounds/cost or kind/size/rating sub-rows, with a "✗ remove"
  choice). The standard magazine's size is still set by the Capacity % field.
- **Gauss is implied by the calibre** (no separate `gauss` field): the gauss
  calibres carry a `gauss` flag, and `calibre.gauss` triggers the gauss ×2 cost /
  ×1.25 weight / ×3 capacity modifier and the TL12 gate. Gauss calibres carry base
  **Penetration +2** (intrinsic AP) which the Final Penetration table turns into an
  AP trait.
- **Rapid-Fire / VRF** (`RAPID_FIRE` in `data.ts`, `params.rapidFire`): RF (needs
  Auto ≥4) multiplies receiver cost ×(Auto+2) / weight ×2, adds +1 die per 3 base
  dice, AP = base dice, Bulky; VRF (Auto ≥6) is ×5/×5, +1 die per 2 base dice,
  Very Bulky. Both feed the Heat rate (×2 / ×3 on the base dice). The AP is granted
  flat (max'd with any penetration-table AP). Validation flags an Auto score below
  the threshold.
- **Powered feed / twin mount** (`params.poweredFeed`, `params.mount`): the two
  ways the FC converts a weapon to RF/VRF besides a high Auto score — the
  MDD-15's Chain Gun and Twin Chain Gun. **Powered feed** (a chain gun) forces
  Auto to ≥4, adds Bulky, and — unlike `rapidFire` — adds **no** RF damage-die/AP
  (the printed chain-gun keeps 5D). The FC says it "triples the cost and weight of
  the receiver"; reproducing the stat block needs the RF cost rule (receiver
  ×(Auto+2)) with the powered-feed weight tripling (×3), applied to the **receiver
  only** — so it's a Phase-B `component` reading the frozen baseline (barrel/
  furniture, % of the original baseline, are unaffected), not a baseline-scaling
  step. Feasible only on longarm/LSW/heavy (validated). A **twin mount** (`mount:
'twin'`) doubles the whole weapon's cost/weight and adds a VRF damage die per two
  base dice (5D→7D) — its only changes from the single weapon are damage, cost and
  weight (it keeps the chain gun's Bulky). Both are book **variants**
  (prose-only, no component breakdown): the engine reproduces damage/Auto/traits
  exactly and cost/weight to ~3% (the printed figures are hand-authored), so
  reconcile ignores their cost (inherited from the base) and weight, flagged.
- **Weapon Heat** (FC heating table, `RECEIVER_HEAT` in `data.ts`): an autofiring
  firearm generates `(base dice × heat multiplier) + Auto` Heat per round (the
  multiplier is 1 / 2 / 3 for auto / RF / VRF); it dissipates per idle
  round by receiver class + a heavy barrel (+2) + extra barrels (+1 each) + a
  cooling system (`ReceiverFeatureDef.heatDissipation`: basic 2 / advanced 5). The
  profile carries `heat` / `heatDissipation` / `heatThreshold` (overheat). The
  `CHILL_CAN` (TL10 / 1kg / Cr50 / 100-Heat sink) pairs with Advanced Cooling.
  RF/VRF (which multiply the heat dice) aren't implemented yet.
- **Final Penetration table** (`penetrationProfile` in `shared.ts`): a weapon's
  net penetration (clamped ±4) maps to **Lo-Pen** (−pen+1, so −1→Lo-Pen 2 … −4→5)
  or **AP** (positive pen → AP scaled by full damage dice, with a damage penalty).
  So AP is _derived from penetration_, not a separate field — gauss +2 → AP
  (GA-100: AP 4 + the 3D+6→3D+5 damage penalty). Pistol calibres are base pen 0
  (a handgun/short barrel's −1 nets Lo-Pen 2); smoothbores keep base −1 and a
  barrel's penetration penalty doesn't apply to them (low-velocity). Pellet/
  flechette reduce penetration by the barrel's **Pellet Spread** (`PELLET_SPREAD`).
  A **spread (pellet/flechette) round uses the calibre's shorter `pelletRange`**
  (where given) as its range base instead of the solid `range` — so a pellet
  primary's profile range is the pellet figure, not the slug figure. The
  **`sawedOff`** barrel (a drastically shortened smoothbore, derived from the
  Civilian Shotgun's Sawed-Off variant: rangeMult 0.25, Pellet Spread 3) reproduces
  that variant; its ~0.5 kg weight gap is the documented longarm-receiver quirk, not
  a barrel bug (see the `BARRELS.sawedOff` comment).
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
- **Launcher munitions** are a **payload × delivery** pair: the warhead is a
  **Grenade Weapons table** payload (`GRENADES`, shared with thrown grenades),
  supplying damage/blast/traits. **`LauncherParams.warheads: LauncherWarhead[]` is
  a list** (the firearm-`ammo` analogue) of `{ type, delivery? }` at a shared
  `warheadSize: 'hand' | 'mini'` (mini falling back to hand when not made as a
  mini): the build is fixed and each warhead yields its own profile row
  (`WeaponEvaluation.munitionProfiles`, first = primary, each with its own reload
  price), emitted only when >1 is loaded. Each warhead's `delivery` overrides the
  launcher-level default, so one launcher can fire a RAM round + cartridge rounds
  (e.g. the ASSW); the delivery (`DELIVERY_SYSTEMS`: rifle-grenade / cartridge / RAM / RPG)
  sets the **range** (100/200/300/500) and multiplies the round's cost/weight
  (×2/×1.25 · ×2.5/×1 · ×3/×1 · ×5/×5). reconcile: the FC prose says a rifle
  grenade weighs +50% but the worked Anti-Armour Rifle Grenade is ×1.25 (0.625kg)
  — we follow the worksheet.
  (The old standalone `WARHEADS` table was the duplicated hand-grenade column and
  has been retired in favour of `GRENADES`.) **Missiles** (FC Support Weapons) are
  self-contained rounds, not grenade payloads: `LauncherParams.missiles?:
MissileWarheadId[]` loads them from `MISSILE_WARHEADS` (e.g. the AV-7) on a
  reusable/field launcher, overriding the grenade path (each missile is its own
  `munitionProfiles` row) — the round's own damage/range/traits/cost/weight govern
  (no delivery multiplier) and multi-mode missiles show the primary mode (flagged).
  Serialization migrates a legacy single `warhead`/`missile` into the lists.
  reconcile: the worked munition examples don't follow these multipliers uniformly
  (plasma RAM is priced ×1, the anti-armour RPG is a _larger_ warhead than the hand
  payload), so the profile matches the book but round cost/weight are the text
  multipliers, and `evaluateLauncher` flags only RPG/missile "larger warhead"
  damage as not-tabled. Don't invent the full munition table. Each
  `munitionProfiles` row carries a **`key`** (the warhead `GrenadeTypeId` / missile
  id) plus the **per-round `weightKg` / `costCr`** (a single munition, as the book
  lists), so the reconcile harness can match warheads by id (see below).
- The whole FC weapon-design chapter (firearms, energy, projectors, launchers,
  grenades) is now implemented. The FC has **no armour-design system** — armour is
  catalogue gear, not built. Remaining FC content is reference/catalogue, not a
  builder.
- **Book reconciliation** (`scripts/reconcile.ts`, `npm run reconcile`): a
  diagnostic that diffs every built-in's engine output against the **book's
  printed stat block** (transcribed in `BOOK_FIGURES`, errors and all) and prints
  the exact per-field differences. Not a pass/fail test — the issue list is used
  to classify each diff (book error / missing general rule / bug) and to fill the
  `{}` stubs from the book. A per-field **rounding tolerance** (`abs` floor + `rel`
  %, exact for integer stats) hides book rounding (13.1375≈13.1, 2190≈2200) so only
  real diffs show; `--rounding` reveals the suppressed ones. Distinct from
  `golden.test.ts` (which pins the engine's _current_ output); this pins the _book's_.
  Per-component figures: **`ammo`** (firearms) is keyed by the **ammo id** (matched
  against `ammoProfiles[].ammo`); **`warheads`** (launchers) is keyed by the
  **warhead/missile id** (matched against `munitionProfiles[].key`) with
  **per-round** `weightKg`/`costCr`; **`variants`** by the variant name.
  **Completeness check:** figures are treated as the whole stat block, so a field
  _or trait_ the engine produces but the book omits is reported as `book missing`
  (so engine-extra flags surface) — `auto`/`penetration` are exempt (the book
  expresses them as the `Auto`/`Lo-Pen`/`AP` traits, not as fields). The check runs
  everywhere by **compositing the partial figures onto their parent first**:
  variants via `compositeFigures(base, override)` (scalars/signature fall back to
  base, traits deep-merge, ammo/warheads replace, evaluated as base ← override via
  `variantParams`); per-ammo / per-warhead rows inherit the top-level
  damage/range/magazine/traits they don't restate (a warhead's per-round
  `weightKg`/`costCr` are a different scale, so they don't inherit).
  `TRAIT_KEY_ALIAS` folds book OCR variants (`Bulwark`→`Bulwarked`) onto the
  engine's canonical name before comparing.
- **`Traits` is strictly typed** (`types.ts`): three name unions — `FlagTraitName`
  (value `true`: Bulky, Scope, Zero-G, Rugged, …), `NumericTraitName` (a score: AP,
  Auto, Lo-Pen, Blast, …) and `ScoredTraitName` (a dice/level string: Stun '2D',
  Distraction 'potent', Stealth 'extreme'), plus the dual `Burn` (number|string) and
  `Incendiary` (number; `0` = bare). This catches key typos (`'Stealth (extreme)'`)
  and value-type slips (`Bulky: 2`) at compile time — add a name here when a new book
  needs one. `mergeTraits`/`addTrait` (shared.ts) do the only string-keyed writes
  (cast internally). Don't embed a score in the key (`'Stun (2D)'`); use `Stun: '2D'`.
- **Weapon-traits glossary** (`weaponTraits.ts`): the FC "Weapon Traits" chapter
  (the 13 FC-detailed traits — Burn, Corrosive, Lo-Pen, Spread, Hazardous, …) as
  `WEAPON_TRAITS` + `findWeaponTrait(key)`, with the Hazard/Flammability/Malfunction
  sub-tables. Core traits (AP, Blast, …) are Core-book, not here. Surfaced by the
  TUI's read-only **Weapon traits reference** screen (`screens/WeaponTraits.tsx`).

## TUI notes (`packages/tui`)

- **Raw-mode loop gotcha:** Ink re-subscribes `useInput` when its handler
  identity changes, which can churn the raw-mode effect into a "Maximum update
  depth" loop on a real TTY. `Field` and `ChoiceField` use a **stable
  `useCallback` handler that reads latest props from a ref**; `useForm` returns
  **stable per-field setters**. Preserve this pattern.
- `Field` steps a numeric value on Left/Right by its `step` prop (default 1,
  clamped at 0) — step-scaled fields pass the real increment (Capacity % and the
  magazine size-% override use `step: 10`, matching the FC's 10% capacity steps).
- `ChoiceField` sorts + filters its options and shows a scrolling **grid** —
  packing as many options per line as the terminal width allows (`useStdout`),
  snapped to whole rows. (Don't reintroduce a single wrapping row; the grid is a
  deliberate fixed-column layout.)
- `ShipSheet` sizes its name column to the terminal width (`useStdout`) and wraps
  long names.
- **Library screens** use `LibraryBrowser` (built-ins stacked above saved — a
  vertical split — on the presentational `FilterList`): **one filter** narrows
  both lists at once and the cursor flows across them. ↑/↓ + Enter loads,
  **Ctrl+O** imports, **Ctrl+X** deletes a saved entry, Esc clears the filter then
  backs out (letters feed the filter, so the commands are Ctrl-keyed). The
  selected entry's description shows on one truncated line below (so long
  descriptions don't bloat rows). Both libraries import via the shared
  `useFileImport` hook (picker-based: native `pickFile` on web, a typed-path
  fallback in the terminal). The main menu is `@inkjs/ui` `Select` with
  `visibleOptionCount` for scrolling.
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
