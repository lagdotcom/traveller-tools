# Weapon builder

Design notes for the MgT2 **weapon builder**. It builds two weapon classes from
the _Field Catalogue_ weapon-design rules — conventional firearms (slug throwers)
and Directed Energy Weapons (lasers/microwave) — selected by a **Class** field at
the top of the builder. It lives beside the ship builder and reuses the same TUI
building blocks, but its rules engine is deliberately **not** the generic `design`
engine — see below.

`WeaponParams` is a discriminated union (`kind: 'firearm' | 'energy'`) and
`evaluateWeapon(params)` dispatches to `evaluateFirearm` or `evaluateEnergyWeapon`,
both returning the same `WeaponEvaluation` shape. Legacy documents with no `kind`
normalise to firearms, so older saved/built-in weapons keep working.

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

`reconcile:` the fuel table lists Liquid as 4D / Cr75 (identical to Jellied); the
prose says 3D / Cr25, which keeps the TL damage progression, so the prose value is
seeded. **Signature** is again not given, so it is shown Physical but flagged
unverified. Built-in: `Flamethrower`; `projector.test.ts` checks the maths.

## Out of scope (future phases)

Launchers & support weapons (FC "Launchers"), and the grenade / warhead /
explosive catalogue. Each slots in as an additional weapon class + catalogue
tables, reusing this pipeline and the builder UI.
