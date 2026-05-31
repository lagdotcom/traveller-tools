# Weapon builder (conventional firearms)

Design notes for the MgT2 **weapon builder**, which builds conventional firearms
(slug throwers) from the _Field Catalogue_ weapon-design rules. It lives beside
the ship builder and reuses the same TUI building blocks, but its rules engine is
deliberately **not** the generic `design` engine — see below.

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

## Out of scope (future phases)

Directed-energy weapons (laser/microwave receivers, powerpacks/cartridges, beam
mods), projectors (flame/cryo), launchers & support weapons, and the
grenade/warhead/explosive catalogue. Each slots in as additional weapon classes +
catalogue tables, reusing this pipeline and the builder UI.
