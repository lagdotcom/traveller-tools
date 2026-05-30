# Ship Builder — design plan

Status: **planning**. Target ruleset: **MgT2 Core Rulebook** spacecraft design
(the simpler, self-contained subset; High Guard can extend it later). First
iteration scope: **Essentials**. Catalog numbers ship as **typed stubs** to be
filled from the book.

## Context & goal

A ship builder where you pick a hull and add components, and the tool tracks the
tonnage / power / cost / hardpoint budgets, computes derived stats (Thrust,
Jump, armour, hull points, cargo, crew), and flags rule violations.

This is the first of four builders (ship, weapon, vehicle, robot). They share a
shape: **a chassis with capped resources, plus components that consume/produce
those resources, contribute derived stats, and carry constraints.** So the plan
splits into a **builder-agnostic `design` core** and a **ship domain** on top of
it. Weapons/vehicles/robots later reuse the core and the builder UI shell,
supplying only their own catalogs, stat type, and extra rules.

## Architecture overview

```
packages/core/src/
  design/            # builder-agnostic engine (reused by all four builders)
    resources.ts     #   resource pools: capacity vs. accumulate, sum/compare
    component.ts     #   ComponentDef, InstalledComponent, DesignContext
    design.ts        #   summarize(design) + validate(design, rules)
    index.ts
  ships/             # ship domain (catalogs + rules) built on design/
    stats.ts         #   ShipStats type (thrust, jump, armour, hullPoints, cargo, crew…)
    hulls.ts         #   hull catalog            ← STUB values
    drives.ts        #   M-drive / J-drive / power plant   ← STUB values
    components.ts    #   bridge, computer, sensors, fuel, staterooms, common areas ← STUB
    weapons.ts       #   hardpoints + basic turrets   ← STUB values
    ship.ts          #   assembles a ShipDesign + ship-specific validation rules
    index.ts
packages/tui/src/
  components/
    BudgetBar.tsx    # reusable: tons/power/cost/hardpoints used-vs-cap (builder-agnostic)
    IssueList.tsx    # reusable: red errors / yellow warnings
  hooks/useDesign.ts # holds a Design, recomputes summary+validation on change
  screens/ship-builder/
    ShipBuilder.tsx  # sectioned builder shell (Hull → … → Summary)
    sections/*.tsx   # one small form per construction step
```

Reuses what already exists: `jumpFuel(hullTons, jumpNumber)` for jump-fuel, the
`travel`/thrust model for M-drive context, and the established
`useForm` / `Field` / `Select` patterns and core "typed-result + `validate*`"
style.

## The builder-agnostic `design` core

Resources are a named pool so each builder can use its own (ships:
`tons`, `power`, `cost`, `hardpoints`; robots later: `slots`, `power`,
`bandwidth`, `cost`; weapons: `mass`, `cost`). Each resource has a **mode**:

- `capacity` — the chassis _provides_ an amount; components _consume_ it; the
  engine checks `consumed ≤ provided` (tonnage, power, hardpoints).
- `accumulate` — just summed across everything (cost).

```ts
export type ResourceMode = 'capacity' | 'accumulate';
export interface ResourceDef {
  key: string;
  label: string;
  mode: ResourceMode;
}

// Context passed to component contribution functions, because most MgT2
// components size as a function of hull tonnage / TL / other components.
export interface DesignContext {
  chassisSize: number; // hull tonnage
  tl: number;
  installed: InstalledComponent[];
}

export interface ComponentDef<Stats> {
  id: string;
  name: string;
  category: string; // 'drive' | 'bridge' | 'weapon' | …
  unique?: boolean; // at most one (bridge, computer, each drive, power plant)
  requires?: string[]; // category ids that must also be present
  minTL?: number;
  // resource deltas: negative consumes a capacity, positive provides it
  resources: (
    inst: InstalledComponent,
    ctx: DesignContext,
  ) => Record<string, number>;
  // contributions to the builder's derived stats
  stats?: (inst: InstalledComponent, ctx: DesignContext) => Partial<Stats>;
}

export interface InstalledComponent {
  defId: string;
  quantity?: number;
  rating?: number; // drive Thrust/Jump code, armour points, etc.
  options?: Record<string, number | string>;
}

export interface Chassis<Stats> {
  id: string;
  size: number; // hull tonnage
  provides: Record<string, number>; // capacities (tons = size, hardpoints, base cost…)
  baseStats?: Partial<Stats>;
}

export interface Design<Stats> {
  chassis: Chassis<Stats>;
  installed: InstalledComponent[];
}
```

Engine functions (the heart, fully unit-tested independent of real catalogs):

```ts
export function summarize<S>(
  design: Design<S>,
  catalog,
  resources: ResourceDef[],
): DesignSummary<S>; // per-resource {provided, used, remaining}, accumulated cost, merged Stats

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
}
export function validate<S>(
  design,
  catalog,
  resources,
  rules: Rule<S>[],
): Issue[];
// generic rules: over-capacity, unmet `requires`, duplicate `unique`, minTL.
// ship rules are just additional Rule<ShipStats> functions.
```

## Ship domain (catalogs as stubs)

`ShipStats = { thrust, jump, armour, hullPoints, powerProduced, powerConsumed,
cargoTons, crew, … }`.

Catalog files export **typed tables with the right shape but placeholder
numbers**, each row tagged `// TODO verify: High Guard 2022 p.NN`. Example shape
(values illustrative, to be replaced):

```ts
// hulls.ts
export const HULLS: HullRow[] = [
  { size: 100, hullPoints: 0 /*TODO*/, costPerTonMCr: 0 /*TODO*/, configs: [...] },
  // …
];
// drives.ts — M/J drive sizing per the Core Rulebook tables
export const M_DRIVE = { tonsPctPerThrust: 0 /*TODO*/, powerPctPerThrust: 0 /*TODO*/, costPerTonMCr: 0 /*TODO*/ };
```

Ship-specific rules layered onto the generic validator: must have bridge +
power plant + M-drive; jump needs J-drive **and** enough jump fuel (via
`jumpFuel`); power produced ≥ power consumed in the highest-demand state; drive
ratings within the hull-size limits; hardpoints = ⌊tonnage/100⌋.

Filling stubs is just editing data rows — no engine changes — which is also how
a future "house rules" variant would work.

## TUI ship builder

A sectioned builder, not a flat form, with a persistent budget header:

```
 Tons 142/200  Power 95/120  Cost 41.2 MCr  Hardpoints 1/2     ← BudgetBar
 [Hull] [Armour] [M-Drive] [J-Drive] [Power] [Fuel] [Bridge] [Computer] …  Summary
 <active section: a small Field/Select form>
 ⚠ Power consumed exceeds output by 5                          ← IssueList
```

- `useDesign` holds the `Design`, recomputes `summarize`+`validate` on every
  change (memoised; stable handlers per the TextInput lesson).
- Each section is a small form using existing `Field`/`Select`/`useForm`.
- `BudgetBar` and `IssueList` are builder-agnostic and reused by later builders.
- Esc backs out to the menu; section nav via a `Select` or arrow keys.

Wire-up mirrors the existing pattern: add `'shipBuilder'` to the `Screen` union
and a menu option in `app.tsx`.

## Implementation phases

1. **`design` core + tests** — engine works against a synthetic catalog
   (capacity/accumulate math, over-capacity / requires / unique / minTL rules).
2. **Ship catalogs (stubs) + `ship.ts` + ship rules + tests** — derived stats
   and ship rules validated with placeholder numbers (tests marked to update
   when real values land).
3. **TUI** — `useDesign`, `BudgetBar`, `IssueList`, `ShipBuilder` + sections;
   menu wiring; real-Ink harness tests (pick hull, set Thrust, see budget move,
   force an over-tonnage / power-deficit error).
4. **Polish** — reuse `jumpFuel`; README; end-to-end verification.

## Verification

- `npm test` — engine unit tests; ship rule tests; TUI harness drives the
  builder and asserts budget/issue updates with no console errors.
- `npm run dev` — manually build a stock 200-ton trader and eyeball the budgets.
- `npm run build:web` — the builder renders in the browser terminal.

## To confirm before/while building

- The Core Rulebook drive/power sizing, hull costs, hull-point formula, bridge
  sizing, and component costs come from you (stub fill).
- Section ordering above follows the Core Rulebook sequence; easy to reorder.
