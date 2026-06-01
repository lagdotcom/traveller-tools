# Weapon builder

Design notes for the MgT2 **weapon builder**. It builds five weapon classes from
the _Field Catalogue_ weapon-design rules — conventional firearms (slug throwers),
Directed Energy Weapons (lasers/microwave), projectors (flame/cryo), launchers
(grenade/rocket/missile) and thrown grenades — selected by a **Class** field at the
top of the builder. It lives beside the ship builder and reuses the same TUI
building blocks, but its rules engine is deliberately **not** the generic `design`
engine — see below.

`WeaponParams` is a discriminated union
(`kind: 'firearm' | 'energy' | 'projector' | 'launcher' | 'grenade'`) and
`evaluateWeapon` dispatches to the matching evaluator, all returning the same
`WeaponEvaluation` shape. Legacy documents with no `kind` normalise to firearms, so
older saved/built-in weapons keep working.

## Why a bespoke pipeline (not `summarize`)

The ship domain runs on the generic engine in `packages/core/src/design/`, which
sums **additive** signed resource deltas. The Field Catalogue cost/weight model
is **sequential-multiplicative off a "modified receiver" baseline**: the book is
explicit that "the weight or cost of a component is usually based on the weight or
cost of the receiver once it has been modified by any receiver features. This
baseline value determines what every further modification or accessory will add."

So `×0.75` (smoothbore), `×2` (gauss), `+25% of receiver` (a barrel) don't fit an
additive model. `evaluateWeapon` (`packages/core/src/weapons/weapon.ts`) instead
walks an explicit pipeline that yields the same _shape_ of result as
`evaluateShip` — `{ profile, breakdown, issues, totals, sources }` — reusing the
engine's `Issue` type and the `source`/provenance idea.

## The pipeline

`evaluateWeapon(params)`:

1. **Receiver baseline** — start from the receiver's base cost/weight/capacity,
   then multiply through, in order: gauss modifier (×2 cost / ×1.25 weight / ×3
   capacity) → mechanism (single shot ×0.25, repeater ×0.5, burst +10%, full-auto
   +20%) → calibre receiver modifiers → receiver features → Increased-Auto table →
   magazine-capacity adjustment (cost +10%/−5% per 10 %, weight ±5 % per 10 %).
   Because this is pure multiplication the order doesn't change the magnitude; the
   breakdown still lists it as one "Receiver" line.
2. **Phase B** — barrel, stock, furniture, feed and accessories each add a
   percentage **of that baseline** (or a flat Credit cost for catalogue items).
3. **Profile** — damage (with the barrel dice reductions and the "running out of
   dice" rule 1D→D3→1→0), range, Auto, Recoil, Quickdraw, Penetration (a negative
   value surfaces as `Lo-Pen`), Physical/Emissions Signature, Heat and the Traits
   list. The loaded ammunition type then modifies the profile (not the build cost).

`data.ts` holds every table as typed TS data tagged `source: 'Field Catalogue'`.

### Receiver features (including the leveled ones)

All FC receiver features live in the one `RECEIVER_FEATURES` table and are picked
from the builder's multi-select (shared by firearms, energy weapons and
launchers). A selected feature is a `ReceiverFeatureRef`: a **bare id** for a
plain feature, or an **`{ id, level }` object** for a _leveled_ feature — the same
idea as a ship `ComponentDef`'s options, so one id covers all its levels (no
`armoured1/2/3`). `resolveFeature` flattens the chosen level (from the def's
`levels` table) into a concrete def before the multiplicative chain runs; the TUI
expands each leveled feature into one labelled choice per level. The leveled
features (each in a mutually-exclusive `group`):

- **Recoil Compensation** (`recoil`, levels 1–2): +10% / +20% cost, +5% / +10%
  weight, reducing Recoil by 1 / 2 and damage by −1 / −3.
- **Disguised** (`disguise`, levels 1–4): +50% cost per −1 detection DM (the DM
  itself is a play stat, carried in the level label).
- **Low Quality** (`quality`, levels 1–5, shared with High Quality): −10% to −80%
  cost across the named degrees (Low Quality … Piece of Junk). Each leaves
  **Deficiency points** the design must satisfy with negative traits (Inaccurate /
  Unreliable / Ramshackle / Hazardous) — the player's choice per the FC, so
  `evaluateWeapon` flags the points as a warning rather than auto-applying a guess.
- **Armoured** (`armour`, levels 1–5): +10% cost / +5% weight per Protection point,
  surfaced as an `Armoured N` trait.
- **Bulwarked** (`bulwark`, levels 1–5): +20% cost / +10% weight per point (each
  grants Malfunction DM+1), surfaced as a `Bulwarked N` trait.

Armoured/Bulwarked are offered to 5 points; higher points follow the same
per-point formula (`LEVELED_POINTS` in `data.ts`).

## Validation oracle & the rules-vs-worksheet conflicts

The user supplied **eight worked worksheets**, shipped as `BUILTIN_WEAPONS` and
used as the test oracle (`weapon.test.ts`). Six of them use the **rules-text base
values**, which the data tables are seeded with, and reproduce exactly:

| Weapon      | Receiver subtotal    | Confirms                                     |
| ----------- | -------------------- | -------------------------------------------- |
| Adjudicator | Cr65.625             | smoothbore −25 %, repeater ×0.5              |
| Bodyguard   | Cr150 / 4.1 kg       | longarm base, rifle barrel 30 %/50 %         |
| Crunch Gun  | Cr1406.25 / 5.625 kg | anti-materiel +150 %/+50 %, very-long barrel |
| GA-100      | Cr1684.8 / 3.1625 kg | gauss ×2/×1.25/×3, bullpup, high-capacity    |
| Stowaway    | Cr1234.8 / 0.576 kg  | full chain incl. extreme stealth ×3.5        |
| Civilian    | Cr127.5              | single-shot ×0.25, partial multi-barrel      |

### Flagged conflicts (the data carries `reconcile:` notes; not silently chosen)

- **Base receiver values.** Two early worksheets (Generic 6 Revolver, Compact PDW)
  use Handgun Cr200/0.5 kg and Assault 1 kg; the rules table and the other five use
  Handgun **Cr175/0.8 kg** and Assault **Cr300/2 kg**. We seed the rules-text
  values; the two early worksheets are the outliers.
- **Light-handgun ammo** reduces both cost and weight (rules + Stowaway); the PDW
  worksheet's cost-exclusion is the outlier.
- **Small-smoothbore weight** — the rules say −40 %, the Adjudicator worksheet
  shows no receiver-weight change; we follow the worksheet.
- **Pistol-calibre penetration** — the table prints "—", but three worksheets only
  yield their shown `Lo-Pen 2` with a base Penetration −1, so handgun calibres are
  seeded at −1.
- **Smoothbore base capacity** — seeded at 6 for a longarm (worksheets) rather than
  the rules' 10; single-shot weapons hold 1 round per barrel.
- **Laser pointer** is Cr200 (rules table + prose); the Bodyguard worksheet's Cr50
  is treated as a typo, so its weight matches but its cost total intentionally
  differs.

Damage/trait derivation for some **special-ammo rows** (pellet/explosive on
smoothbores) appears to use additional Core Rulebook shotgun rules not present in
the supplied text; those are computed per the documented Field Catalogue modifiers
and not asserted where the book's own example rows diverge.

## Directed Energy Weapons (`energy.ts` / `energyData.ts`)

Lasers and microwave guns. The FC says these share "receiver, barrel and stock"
with firearms, so the energy pipeline **reuses** the firearm barrel / stock /
furniture / accessory tables and the same "% of the modified receiver baseline"
cost model; only the energy-specific tables live in `energyData.ts`.

Key differences from a slug thrower:

- **Receiver** sets the power class (`Minimal`→Weak 2D, `Small`→Light 3D,
  `Medium`→Standard 5D, `Large`→Heavy 8D) and base range. The designer **buys
  damage in whole dice** up to that class; a short barrel caps it further (Rifle+
  uncapped, Carbine/Assault 4D, Handgun/Short 3D, Minimal 2D) — excess power is
  wasted (a warning, not an error).
- **Power source** — a powerpack (capacity = power-per-kg by TL ÷ damage dice, the
  pack costs Cr500–2500/kg by class) or disposable cartridges. An under-rated
  powerpack draws too hard → `Unreliable`; an over-powered cartridge stresses the
  weapon → `Unreliable`; an under-powered cartridge simply delivers fewer dice; a
  non-ejecting cartridge holder is `Hazardous -2`.
- **Modifications** (energy-exclusive, TL-gated): Efficient Beam Generation,
  Improved Beam Focus (+3 to a ≥2D laser), Intensified Pulse (Pen +1), Variable
  Intensity.
- All energy receivers grant **Zero-G** and base **Penetration −1**; recoil is 0.

**Unverified value.** The supplied FC text gives **no base Signature** for
directed-energy weapons, so `evaluateEnergyWeapon` shows an Emissions signature but
attaches a _warning_ that the level is unverified (the repo's standard "derived,
not in the book" convention) rather than inventing a confirmed number. Two
built-ins (`Laser Carbine`, `Laser Rifle`) seed `BUILTIN_WEAPONS`; `energy.test.ts`
checks the totals/caps/power-mismatch maths against the rules-text examples.

## Projectors (`projector.ts` / `projectorData.ts`)

Flamethrowers, cryo and chemical sprayers (`kind: 'projector'`). Built from three
pieces — a **Structure** (frame), a **Propellant** and a **Fuel** — with the
designer choosing how many kg of fuel and propellant to carry as payload.

- **Structure** (Large / Compact / Hand) sets the max payload (20 / 10 / 2 kg),
  the Blast level (3 / 2 / 1), Quickdraw, and the cost model: the frame weighs a
  fraction of the payload (30 / 20 / 10 %) and the whole loaded weapon costs a flat
  Cr/kg of its total weight (Cr50 / 100 / 25). A Hand frame halves range.
- **Propellant** sets attacks-per-kg and effective range (Compressed 4/kg @ 20 m,
  Supercompressed 6/kg @ 25 m, Generated 10/kg @ 30 m). Generated gas adds one-off
  machinery (Cr500/kg) on top of the consumable reagents (Cr200/kg).
- **Fuel** sets the damage/effect per attack (Liquid 3D, Jellied 4D, Advanced 5D,
  Cryogenic 4D, Suppressant 2D + half range, Irritant/Battlechem = effect only).
- **Attacks** (the "magazine") = whichever runs out first, fuel (1 kg = 1 attack)
  or propellant (kg × attacks-per-kg). Fuel + propellant are consumables, priced as
  the reload cost. All projectors carry **Hazardous −6** and the structure's Blast.
- **Hardening** — the Armoured (+10% cost/+5% weight per Protection point) and
  Bulwarked (+20% cost/+10% weight per point) capability features multiply the
  build cost and loaded weight. The `MF-61` built-in (compact, advanced fuel,
  generated gas, Armour 2, Bulwarked 3) reproduces the worksheet exactly:
  Cr1397.76 / 7.5504 kg.

`reconcile:` the fuel table lists Liquid as 4D / Cr75 (identical to Jellied); the
prose says 3D / Cr25, which keeps the TL damage progression, so the prose value is
seeded. **Signature** is again not given, so it is shown Physical but flagged
unverified. Built-in: `Flamethrower`; `projector.test.ts` checks the maths.

## Launchers (`launcher.ts` / `launcherData.ts`)

Grenade, rocket and missile launchers (`kind: 'launcher'`). The FC is explicit
that "warheads and payloads are not considered part of the weapon itself", so the
weapon is its **receiver** (built like a firearm) and the loaded **warhead** only
shapes the displayed profile (like a firearm's loaded ammo) — its price is the
reload cost, not part of the build.

- **Receiver, firearm-style** — start from one of 14 base tube/reusable/field
  receivers (each fixing cost, weight, base range, capacity and Bulky/Very Bulky),
  then apply a **multiplicative chain of receiver features** (Lightweight, Bullpup,
  …, reusing the firearm `RECEIVER_FEATURES` table) plus an optional **guidance
  system** (+50% cost). That fixes the **modified-receiver baseline**, off which a
  **barrel** and **stock** are added as a percentage — exactly as on a firearm. The
  Whaite Light Munition Launcher reproduces this way: Semi-Auto Light tube
  (Cr400/2.5kg) → Lightweight → Bullpup → Cr750/2.0kg baseline, + Assault barrel +
  full stock → 2.8kg. Support launchers have a "varies" capacity, so the builder
  exposes a magazine size for them.
- **Barrel/stock are cost/weight only.** A launcher's profile comes from its
  warhead (damage/traits) and delivery system (range), so — unlike a firearm — the
  barrel does not reshape damage/range/penetration. A bare tube's tube is integral,
  so the default barrel is the zero-cost `minimal` and the default stock is `none`.
- **Loaded weight** includes a full load of munitions (`launcher + capacity ×
warhead weight × delivery weight`), per the FC missile-launcher note.
- **Warhead × delivery** — the warhead (Fragmentation, Anti-Armour, Breacher,
  Plasma, Smoke, Gas, …) supplies the profile's damage, Blast and traits; the
  delivery system (cartridge / RAM / RPG) sets the range and multiplies the round's
  cost/weight.

`reconcile:` the warhead figures are the FC _thrown_ Hand-grenade values; the
launcher-calibre munition table ("see page 126") isn't in the supplied text. The
firearm-style barrel/stock percentages reproduce the worked launcher's **weight**
exactly but over-count its **cost** by ~Cr35 (Cr975 vs the worksheet's Cr940) — a
variance kept flagged in the `Light Munition Launcher` built-in rather than fudged.
Built-ins: `Grenade Launcher`, `Rocket Launcher`, `Light Munition Launcher`; tests
in `launcher.test.ts`.

## Grenades (`grenade.ts` / `grenadeData.ts`)

Thrown grenades (`kind: 'grenade'`). There's no construction — a grenade is a
catalogue item — so the "design" is just a **payload type** and a **size** (Mini
or Hand), and `evaluateGrenade` resolves the lookup to the standard profile.

- 23 payloads from the FC "Grenade Weapons" table (Fragmentation, Anti-Armour,
  Breacher, Plasma, Smoke, Gas, EMP, Cryogenic, Incendiary, Distraction, …), each
  with both size columns where the book provides them.
- A "—" Mini entry means that payload isn't made as a mini-grenade (`mini: null`);
  choosing Mini for one raises an error and falls back to the Hand stats.
- Cost/weight/damage and the Blast / AP / Lo-Pen / Incendiary / Burn / Stun traits
  come straight from the table. Thrown range isn't a weapon stat (it depends on the
  thrower) so it's 0, and Signature isn't given — both flagged. Built-ins:
  `Fragmentation Grenade`, `Smoke Grenade`; `grenade.test.ts` covers the lookup.

## Out of scope (future phases)

The remaining FC content is mostly non-weapon (armour, equipment). The weapon
design chapter — firearms, energy weapons, projectors, launchers and grenades — is
now fully implemented.
