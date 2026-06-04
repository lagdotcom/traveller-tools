/**
 * Book-reconciliation harness (run: `npm run reconcile`).
 *
 * Compares every built-in weapon's *engine* output against the *book's printed
 * stat block* (transcribed below — errors and all) and prints an issue list of
 * the exact field-by-field differences. This is a diagnostic, not a pass/fail
 * test: the diffs are the point. Use them to decide, per difference, whether it's
 *   - a book error (the engine is right — leave a reconcile note),
 *   - a missing/general rule (something the book applies that the model doesn't),
 *   - or a bug to fix.
 *
 * BOOK_FIGURES is the editable list. Fill in `{}` stubs from the book; only the
 * fields you provide are compared, so partial entries are fine. `signature` is
 * "<kind> (<level>)", e.g. "physical (extreme)" / "emissions (low)". `traits`
 * lists only the distinctive ones you want checked (AP, Lo-Pen, Blast, …).
 */
import {
  BUILTIN_WEAPONS,
  type Credits,
  evaluateWeapon,
  formatDamage,
  type Kilograms,
  type Metres,
  type Traits,
  variantParams,
  type WeaponParams,
} from '@traveller-tools/core';

const EL = 'emissions (low)';
const EN = 'emissions (normal)';

const PL = 'physical (low)';
const PN = 'physical (normal)';

interface BookFigures {
  cost?: Credits;
  weight?: Kilograms;
  /** Reload price of the standard magazine. */
  reload?: Credits;
  /** e.g. '5D', '5D-3', '3D+5'. */
  damage?: string;
  range?: Metres;
  quickdraw?: number;
  auto?: number;
  penetration?: number;
  capacity?: number;
  /** '<kind> (<level>)', e.g. 'physical (extreme)'. */
  signature?: string;
  /** Only the distinctive traits to check (AP, Lo-Pen, Blast, …). */
  traits?: Record<string, number | string | boolean>;
  /**
   * Per-ammo figures for a multi-ammo (or multi-munition) weapon, keyed by the
   * ammo/munition label as it appears on the sheet (e.g. 'Explosive', 'Pellet').
   * Only the ammo-varying fields are compared against that loaded profile; the
   * top-level figures still cover the weapon as a whole (the primary ammo).
   */
  ammo?: Record<string, AmmoFigures>;
  /**
   * Per-warhead figures for a launcher, keyed by the warhead / missile id (the
   * `GrenadeTypeId` or `MissileWarheadId` the launcher loads — e.g.
   * 'gasIncapacitant', 'baton'). `weight` / `cost` are the *per-round* mass
   * and price of a single munition (not the loaded magazine). Only emitted when
   * the launcher loads more than one munition.
   */
  warheads?: Record<string, WarheadFigures>;
  /**
   * The under-barrel secondary weapon's stat block (a full figure set), for
   * weapons that mount one (e.g. the Ten-Six). Diffed against the engine's
   * `WeaponEvaluation.secondary` profile (+ reload) under a `secondary ·` prefix.
   */
  secondary?: BookFigures;
  /**
   * Power-pack / magazine options for an energy weapon, keyed by the pack label
   * (e.g. 'internal', 'belt pack'). Diffed (capacity + reload) against the engine's
   * `WeaponEvaluation.magazines`, matched by label then position.
   */
  packs?: Record<string, PackFigures>;
  /**
   * Per-variant figures, keyed by the variant name on the built-in's `variants`.
   * Each is a full figure set (a variant changes the whole profile) and may carry
   * its own `ammo` / `ignore`.
   */
  variants?: Record<string, BookFigures>;
  /**
   * Spot exceptions: field names to skip (a confirmed book error the engine is
   * right about). Use a `note` to record why. Field names match the report's
   * labels, e.g. 'damage', 'cost', 'trait Burn'. Per-ammo labels are prefixed,
   * e.g. 'Pellet · damage'.
   */
  ignore?: string[];
  /**
   * Book computation quirks to *reproduce* the printed stat block when the book's
   * own maths differs from the engine's at a breakdown step. Each names a step (by
   * label substring) and the cost/weight multiplier the book applied there,
   * *overriding* the engine's; the harness rescales the total by book÷engine for
   * that step before comparing, so the engine matches the (quirky) book figure
   * instead of flagging a diff. See `BookQuirk`.
   */
  quirks?: BookQuirk[];
  /** Free notes (page ref, "book error: …", etc.). */
  note?: string;
}

/**
 * One book-computation quirk: "at step X the book computed cost/weight differently
 * than the engine". Two shapes, both reproducing the book's printed figure so it
 * matches instead of flagging a diff:
 *
 *  - **Multiplicative step** (default): the book applied a different multiplier at
 *    a receiver-chain step. The engine's actual multiplier is recovered from the
 *    breakdown (running subtotal after ÷ before) and the baseline-derived total is
 *    rescaled by `override ÷ engine`. So `cost: 1` reproduces the book *omitting* a
 *    step (×1), `weight: 1.25` reproduces it *over-applying* one. (The whole
 *    baseline-derived total scales with it; flat-Cr add-ons are held aside.)
 *  - **Per-line** (`line: true`): the book scaled one additive component's own
 *    contribution (e.g. a secondary weapon at a different barrel weight). `cost`/
 *    `weight` multiply *that line's* value directly. Use this where a step rescale
 *    can't apply because the component is added, not multiplied in.
 */
interface BookQuirk {
  /** Substring matched against a cost/weight breakdown line-item label. */
  step: string;
  /** Cost multiplier: at the step (default) or of the line's value (`line`). */
  cost?: number;
  /** Weight multiplier: at the step (default) or of the line's value (`line`). */
  weight?: number;
  /** Scale the matched line's own contribution rather than a receiver step. */
  line?: boolean;
  /** Why — suspected book error, house ruling, etc. (shown in the report). */
  note?: string;
}

/** The ammo-varying fields of one loaded ammunition / munition type. */
interface AmmoFigures {
  damage?: string;
  range?: Metres;
  penetration?: number;
  /** Reload price of a magazine loaded with this ammo. */
  reload?: Credits;
  /** Per-round price of this ammo (reference; not yet diffed). */
  cost?: Credits;
  /** '<kind> (<level>)' for this ammo (reference; not yet diffed). */
  signature?: string;
  traits?: Record<string, number | string | boolean>;
  /** Field names (un-prefixed, e.g. 'damage') to skip for this ammo. */
  ignore?: string[];
}

/** Capacity / reload of one power-pack or magazine option of an energy weapon. */
interface PackFigures {
  capacity?: number;
  /** Reload price for this pack. */
  reload?: Credits;
}

/** The per-round figures of one loaded launcher munition (warhead / missile). */
interface WarheadFigures {
  damage?: string;
  range?: Metres;
  /** Per-round weight of a single munition. */
  weight?: Kilograms;
  /** Per-round cost of a single munition. */
  cost?: Credits;
  traits?: Record<string, number | string | boolean>;
  /** Field names (un-prefixed, e.g. 'damage') to skip for this warhead. */
  ignore?: string[];
}

// ── The book stat blocks. Fill in the `{}` stubs from the Field Catalogue. ──────
const BOOK_FIGURES: Record<string, BookFigures> = {
  'Generic 6 Revolver': {
    range: 10,
    damage: '3D-3',
    weight: 0.75,
    cost: 150,
    capacity: 6,
    reload: 5,
    quickdraw: 8,
    signature: 'NOT GIVEN',
    traits: { 'Lo-Pen': 2 },
  },
  'Compact PDW': {
    range: 8,
    damage: '2D',
    weight: 0.67,
    cost: 485,
    capacity: 13,
    reload: 9,
    quickdraw: 6,
    signature: PL,
    traits: { Auto: 4, 'Lo-Pen': 2 },
  },
  'Civilian Shotgun': {
    range: 20,
    damage: '4D-4',
    weight: 4.5,
    cost: 130,
    // Book stat block prints "1 + 1" (one round per barrel, double-barrel) = 2.
    capacity: 2,
    reload: 2.5,
    quickdraw: -1,
    signature: PN,
    traits: { Inaccurate: -1, 'Lo-Pen': 4, Spread: 2 },
    variants: {
      'Sawed-Off': {
        range: 5,
        weight: 3,
        quickdraw: 1, // book: shorter/handier than the base shotgun's −1
        // weight reads ~0.5 kg light: inherits the base shotgun's longarm-receiver
        // quirk (worksheet 3 kg vs the rules' 2.5 kg) — with 3 kg it is exact.
        // explosive Lo-Pen: book 2 (calibre only); engine 3 adds explosive's −1 pen.
        note: "Sawed-Off weight/explosive-Lo-Pen residuals: see data.ts 'sawedOff' barrel + the longarm-receiver quirk.",
        ammo: {
          pellet: { traits: { 'Lo-Pen': 5, Spread: 3 } },
          explosive: { damage: '6D-4', traits: { 'Lo-Pen': 2 } },
        },
      },
    },
  },
  '13mm Crunch Gun': {
    range: 1250,
    damage: '5D',
    weight: 13.1,
    cost: 3130,
    capacity: 3,
    reload: 75,
    quickdraw: -8,
    signature: 'physical (extreme)',
    traits: { Bulky: true, Scope: true },
    // The worksheet prices the 3-round magazine as ammo only (3 × Cr25); the
    // engine now adds the FC standard-magazine cost (1% of Cr3130 ≈ Cr31 → Cr106),
    // which the worksheet omitted. Flagged rather than dropped from the engine.
    ignore: ['magazine'],
  },
  'Flintlock Jazail': {
    range: 125,
    damage: '3D-2',
    weight: 3.2,
    cost: 140,
    capacity: 1,
    reload: 0.25,
    quickdraw: 0,
    signature: 'physical (very high)',
    traits: { Inaccurate: -1, 'Lo-Pen': 3, 'Slow Loader': 12, Unreliable: 2 },
  },
  Adjudicator: {
    range: 12,
    damage: '3D-2',
    weight: 0.92,
    cost: 75,
    capacity: 5,
    reload: 5,
    quickdraw: 8,
    signature: 'physical (very high)',
    traits: { Bulky: true, Inaccurate: 1 },
  },
  'GA-100': {
    range: 50,
    damage: '3D+5',
    weight: 4.4,
    cost: 2200,
    capacity: 23,
    reload: 55,
    quickdraw: 8,
    signature: EL,
    traits: { AP: 4, Auto: 3, Spread: 3 },
  },
  'GC-24': {
    range: 10,
    damage: '3D',
    weight: 0.85,
    cost: 890,
    capacity: 24,
    reload: 27,
    quickdraw: 10,
    signature: EL,
    traits: { AP: 3, Auto: 4 },
    // The printed Cr890 = the receiver chain with neither cost applied (×1.25 ×1.2
    // → Cr1334 in the engine; 1334 / 1.5 ≈ 890). capacity (24 vs engine 18) and
    // magazine (27 vs 9) remain — they need the Small Gauss base-capacity bonus +
    // the gauss reload rate, not a quirk.
    quirks: [
      {
        step: 'Increased Auto',
        cost: 1, // book omitted the Increased-RoF cost increase
        note: 'book omitted the Increased-RoF cost increase',
      },
      {
        step: 'Capacity 120%',
        cost: 1, // book omitted the capacity-% cost increase
        note: 'book omitted the capacity-% cost increase',
      },
    ],
  },
  'GS-40': {
    range: 20,
    damage: '3D',
    weight: 1.2,
    cost: 450,
    capacity: 40,
    reload: 25,
    quickdraw: 8,
    signature: EL,
    traits: { AP: 3, Auto: 2 },
    // cost: engine Cr442.75 (Cr385 baseline + handgun barrel) is exact; the book
    // rounds it up to 450 (the prose works from the precise figure).
    ignore: ['cost'],
    variants: {
      'Navy Model': {
        range: 50,
        weight: 1.42,
        cost: 500,
        quickdraw: 4,
        traits: { AP: 4, Scope: true },
        // The prose confirms the engine's build exactly: assault barrel → Cr462 /
        // 1.3kg (engine: Cr385 baseline + 20%/30% = 462/1.3). Two book features the
        // engine can't reproduce remain:
        // • damage: book prints 3D; engine 3D-1 is the AP-4 penalty (net pen +2)
        //   that the book *does* apply to GA-100 (3D+5) — a book inconsistency.
        // • Scope / Quickdraw 4: the detachable stock that houses the holographic
        //   sight grants Scope + −2 Quickdraw and weighs 0.12kg vs the engine `full`
        //   stock's 0.10 — the FC gives this integrated stock+sight no general stats.
        //   The +0.02kg is reproduced by a line quirk scaling the stock weight ×1.2;
        //   Scope and Quickdraw stay ignored (no modelled component to derive them).
        ignore: ['damage', 'trait Scope', 'quickdraw'],
        quirks: [
          {
            step: 'Stock',
            line: true,
            weight: 1.2,
            note: 'detachable stock+sight 0.12kg vs the full stock 0.10',
          },
        ],
        note: 'Navy: book 3D omits the AP-4 penalty (vs GA-100 3D+5); a detachable stock houses a holographic sight (Scope, Quickdraw −2, 0.12kg) the FC does not stat generally.',
      },
    },
  },
  Stowaway: {
    range: 4,
    damage: '2D',
    weight: 0.63,
    cost: 240,
    capacity: 6,
    reload: 135,
    quickdraw: 10,
    signature: 'physical (minimal)',
    traits: { Auto: 2, 'Lo-Pen': 2, Stealth: 'extreme' },
  },
  Liberator: {
    range: 5,
    damage: '3D3-1',
    weight: 0.9,
    cost: 105,
    capacity: 4,
    reload: 4,
    quickdraw: 12,
    signature: 'physical (normal)',
    traits: { 'Slow Loader': 4 },
    ammo: {
      lowPenetration: {
        signature: 'physical (very high)',
        traits: { 'Lo-Pen': 3 },
      },
      heap: { reload: 40, signature: 'physical (extreme)' },
    },
    variants: {
      Defender: {
        range: 30,
        weight: 2,
        cost: 190,
        quickdraw: 6,
        ammo: {
          ball: { damage: '3D-1' },
          distraction: { reload: 40, traits: { Distraction: 'standard' } },
          explosive: { signature: 'physical (high)', traits: { 'Lo-Pen': 2 } },
        },
      },
    },
  },
  Bodyguard: {
    damage: '4D',
    weight: 4.1,
    cost: 260,
    capacity: 6,
    reload: 9,
    quickdraw: 0,
    signature: PN,
    traits: { Bulky: true, Inaccurate: 1 },
    ammo: {
      ball: { range: 100 },
      pellet: { range: 25, traits: { 'Lo-Pen': 4, Spread: 2 } },
    },
    variants: {
      Pointguard: {
        range: 12.5,
        weight: 3.25,
        cost: 180,
        capacity: 3,
        reload: 4.5,
        quickdraw: 2,
        traits: { 'Lo-Pen': 5, Spread: 2 },
      },
    },
  },
  Standard: {
    range: 135,
    damage: '2D',
    weight: 2.3,
    cost: 2260,
    capacity: 27,
    reload: 30,
    quickdraw: 2,
    signature: PN,
    traits: { Bulwark: 2 },
  },
  'Mk 1 Handgun': {
    range: 12,
    damage: '3D-1',
    weight: 1.1,
    cost: 240,
    capacity: 8,
    reload: 10,
    quickdraw: 8,
    signature: PN,
    variants: {
      suppressed: {
        cost: 415,
        quickdraw: 5,
        signature: 'physical (small)',
        traits: { 'Lo-Pen': 2 },
      },
    },
  },
  'Posi-9': {
    range: 12.5,
    damage: '3D-3',
    weight: 1.1,
    cost: 375,
    capacity: 15,
    reload: 15,
    quickdraw: 8,
    signature: PN,
    traits: { 'Lo-Pen': 2 },
    variants: {
      burst: { cost: 435, traits: { Auto: 2 } },
      auto: {
        cost: 435, // '+ conversion cost'
        traits: { Auto: 4 },
      },
    },
  },
  Crewmate: {
    range: 50,
    damage: '2D',
    weight: 1.1,
    cost: 465,
    capacity: 30,
    reload: 20,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 4, 'Lo-Pen': 2 },
  },
  Desperado: {
    range: 25,
    damage: '3D-3',
    weight: 2.8,
    cost: 400,
    capacity: 20,
    reload: 19,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 3, Inaccurate: 1 },
  },
  Eliminator: {
    range: 20,
    damage: '2D-3',
    weight: 2.81,
    cost: 965,
    capacity: 24,
    reload: 25,
    quickdraw: 4,
    signature: PN,
    ammo: {
      ball: { reload: 25 },
      apAdvanced: { reload: 68, traits: { AP: 3 } },
      enhancedWounding: {
        damage: '2D+1',
        reload: 39,
        traits: { 'Lo-Pen': 3 },
      },
    },
  },
  'IAW-12': {
    range: 50,
    damage: '3D-1',
    weight: 3.85,
    cost: 1750,
    capacity: 72,
    reload: 50,
    quickdraw: 6,
    signature: EN,
    traits: { AP: 4, Auto: 4 },
  },
  Planetsider: {
    range: 55,
    damage: '3D-1',
    weight: 5,
    cost: 1950,
    capacity: 28,
    reload: 48,
    quickdraw: 5,
    signature: PL,
    traits: { Auto: 3, Rugged: true },
  },
  'GR-80': {
    range: 540,
    damage: '4D',
    weight: 5.2,
    cost: 2220,
    capacity: 90,
    reload: 65,
    quickdraw: 0,
    signature: EL,
    traits: { AP: 3, Auto: 3, Scope: true },
    variants: {
      'GR-80A': {
        range: 600,
        cost: 3120,
        capacity: 150,
        reload: 100,
        quickdraw: -2,
      },
    },
  },
  AIWS: {
    range: 310,
    damage: '3D',
    weight: 3.9,
    cost: 1435,
    capacity: 42,
    reload: 35,
    quickdraw: 0,
    signature: PL,
    traits: { Auto: 3 },
    // Engine reports the nominal 43-round capacity; the book lists the 42 normally
    // loaded "to prevent misfeeds" (per the prose). Inherited by carbine/assault.
    ignore: ['capacity'],
    variants: {
      carbine: { range: 280, damage: '3D-1', weight: 3.6, cost: 1434 },
      // The book calls this the "support" configuration; the engine variant is
      // named lsw (light support weapon) — same weapon (heavy barrel + the 64-round
      // extended casket magazine).
      lsw: {
        weight: 5,
        cost: 1695,
        capacity: 64,
        reload: 70,
        quickdraw: -1,
      },
      assault: {
        range: 125,
        damage: '2D',
        weight: 3.4,
        cost: 1211,
        quickdraw: 2,
      },
    },
  },
  Intruder: {
    range: 225,
    damage: '3D',
    weight: 5.55,
    cost: 2085,
    capacity: 36,
    reload: 40,
    quickdraw: 3,
    signature: PN,
    // Book errors (engine is right): damage applied the carbine barrel's −10% range
    // (→225) but not its −1 damage (cf. the AIWS carbine, also 3D-1); Auto 3
    // (full-auto) and the long-range scope's Scope trait are omitted.
    ignore: ['damage', 'trait Auto', 'trait Scope'],
    // Two weight quirks reproduce the book's printed 5.55 kg exactly:
    //  - Bullpup: the book applied bullpup's +25% to weight as well as cost, but the
    //    FC bullpup is +25% cost / +2 Quickdraw only (the AIWS, same intermediate-
    //    rifle longarm without bullpup, reconciles at the lighter baseline).
    //  - Secondary: the book used the FULL secondary-barrel weight (×1.5 of the
    //    half-weight line), where the FC and the Ten-Six worked example halve an
    //    extra barrel.
    quirks: [
      { step: 'Bullpup', weight: 1.25, note: 'book: bullpup +25% weight' },
      {
        step: 'Secondary',
        line: true,
        weight: 1.5,
        note: 'book: full secondary-barrel weight (FC halves an extra barrel)',
      },
    ],
    secondary: {
      range: 5,
      damage: '4D',
      capacity: 3,
      reload: 5,
      signature: PN,
      traits: { 'Lo-Pen': 5, Spread: 4 },
      // Book omits the secondary's smoothbore Inaccurate −1 and the
      // standard-smoothbore-in-an-assault-receiver Very Bulky; both are correct.
      ignore: ['trait Inaccurate', 'trait Very Bulky'],
    },
  },
  Squadmate: {
    range: 300,
    damage: '3D+3',
    weight: 4,
    cost: 560,
    capacity: 24,
    reload: 28,
    quickdraw: 0,
    signature: PN,
    variants: {
      Marksman: { weight: 4.825, cost: 1280, traits: { Accurised: true } },
    },
  },
  Sentinel: {
    range: 250,
    damage: '3D-3',
    weight: 0.57,
    cost: 195,
    capacity: 4,
    reload: 8,
    quickdraw: 8,
    signature: PN,
    traits: { Inaccurate: -1, 'Zero-G': true },
    ammo: { explosive: { damage: '5D-3', cost: 160, reload: 48 } },
  },
  Shipmate: {
    range: 8,
    damage: '3D-3',
    weight: 1.4,
    cost: 560,
    capacity: 14,
    reload: 35,
    quickdraw: 6,
    signature: PN,
    traits: { Auto: 4, Inaccurate: -2, 'Lo-Pen': 3, 'Zero-G': true },
    variants: {
      'Assault Weapon': {
        range: 20,
        weight: 1.5,
        cost: 610,
        capacity: 20,
        reload: 50,
        quickdraw: 4,
        traits: { 'Lo-Pen': 0 },
      },
      Carbine: {
        range: 45,
        weight: 1.6,
        cost: 610,
        capacity: 20,
        reload: 50,
        quickdraw: 0,
        traits: { 'Lo-Pen': 0 },
      },
    },
  },
  'Ten-Six': {
    range: 5,
    damage: '3D-3',
    weight: 0.93,
    cost: 170,
    capacity: 5,
    reload: 12,
    quickdraw: 7,
    signature: PN,
    traits: { Inaccurate: -2, 'Lo-Pen': 3, 'Zero-G': true },
    secondary: {
      range: 2,
      damage: '4D-3',
      capacity: 1,
      reload: 1.25,
      signature: PN,
      traits: { Inaccurate: -1, 'Lo-Pen': 3, Spread: 4 },
    },
  },
  Guardian: {
    range: 250,
    damage: '4D',
    weight: 10.3,
    cost: 4520,
    capacity: 45,
    reload: 270,
    quickdraw: -4,
    signature: PN,
    traits: { Auto: 3, Inaccurate: -1, 'Zero-G': true },
    ammo: {
      ball: { range: 275 },
      explosive: { damage: '6D', reload: 1400 },
      heap: {
        reload: 2300,
        signature: 'physical (high)',
        traits: { AP: 4 },
      },
    },
  },
  Solo: {
    range: 715,
    damage: '5D-2',
    weight: 4.1,
    cost: 17525,
    capacity: 45,
    reload: 200,
    quickdraw: 0,
    signature: EL,
    traits: { AP: 6, Auto: 3, Scope: true },
    ammo: {
      ball: {},
      apAdvanced: { damage: '5D-5', reload: 275, traits: { AP: 15 } },
    },
  },
  Reliant: {
    range: 280,
    damage: '3D',
    weight: 6.4,
    capacity: 50,
    reload: 110,
    quickdraw: -5,
    signature: PL,
    traits: { Auto: 4, Scope: true },
    ammo: {
      ball: {},
      apAdvanced: { damage: '3D-1', reload: 180, traits: { AP: 4 } },
    },
  },
  'Jimpy-G': {
    range: 375,
    damage: '3D+3',
    weight: 14,
    cost: 3060,
    capacity: 50,
    reload: 50,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 3, 'Slow Loader': 4 },
  },
  'MF-61': {
    range: 30,
    damage: '5D',
    weight: 7.55,
    cost: 1400,
    capacity: 4,
    reload: 700,
    quickdraw: 0,
    signature: 'emissions (extreme)',
    traits: {
      Blast: 2,
      Bulwarked: 3,
      Burn: 'D3+1',
      Hazardous: -6,
      Incendiary: true,
    },
  },
  Cryojet: {
    range: 30,
    damage: '4D',
    weight: 20.41,
    cost: 1332,
    capacity: 9,
    reload: 2200,
    quickdraw: 2,
    signature: 'NOT GIVEN',
    traits: {
      Blast: 3,
      Bulky: true,
      Bulwarked: 3,
      Burn: 'D3+1',
      Hazardous: -6,
      Incendiary: true,
    },
    secondary: {
      range: 15,
      damage: '3D',
      capacity: 4,
      reload: 70,
      traits: {
        Blast: 0,
        Bulky: true,
        Inaccurate: 1,
        'Lo-Pen': 3,
      },
    },
    ignore: ['trait Burn', 'trait Incendiary'],
  },
  'BL-3': {
    range: 5,
    damage: '2D',
    weight: 0.5,
    cost: 415,
    capacity: 3,
    reload: 15,
    quickdraw: 10,
    signature: EN,
    traits: { Hazardous: -2, 'Lo-Pen': 4, 'Zero-G': true },
  },
  'M-84': {
    range: 225,
    damage: '4D+3',
    weight: 4.4,
    cost: 6750,
    capacity: 14,
    reload: 0, // builtin
    quickdraw: 0,
    signature: EN,
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
    packs: {
      internal: { capacity: 14, reload: 0 },
      'belt pack': { capacity: 140, reload: 1500 },
      'back pack': { capacity: 420, reload: 4500 },
    },
    variants: { rifle: { range: 250, damage: '5D+3', weight: 5 } },
  },
  Nefertem: {
    range: 50,
    damage: '3D',
    weight: 2.6 + 1,
    cost: 960,
    capacity: 100,
    reload: 1000,
    quickdraw: 6,
    signature: EN,
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
    // cost: the book lists the weapon at Cr960 *excluding* the belt pack (its
    // Cr1000 is the magazine); the engine bakes the loaded pack into the build (as
    // TES-12's book does), so it reads 1960 — reproduce by dropping the pack line.
    // weight: the book's own component table totals 1.95kg but the stat line prints
    // 2.6+1; the engine matches the table (1.95 + 1kg pack = 2.95). The 3.6 stat
    // line is internally inconsistent with the table, so it stays ignored.
    ignore: ['weight'],
    quirks: [
      {
        step: 'Powerpack',
        line: true,
        cost: 0,
        note: 'book counts the pack as the Cr1000 magazine, not in the weapon cost',
      },
    ],
  },
  'IP-2': {
    range: 500,
    damage: '2D',
    weight: 0.75,
    cost: 75,
    traits: { Blast: 15, Burn: 2, Incendiary: true },
  },
  'Spigot Mortar': {
    range: 500,
    damage: '10D',
    weight: 10,
    cost: 650,
    traits: { AP: 12, Blast: 4, Inaccurate: -2 },
  },
  'Light Munitions Launcher': {
    range: 200,
    warheads: {
      // Book key 'incapacitant gas' → engine GrenadeTypeId 'gasIncapacitant'.
      gasIncapacitant: { weight: 0.5, cost: 125, traits: { Blast: 3 } },
      baton: {
        damage: '1D',
        weight: 0.3,
        cost: 13,
        traits: { 'Lo-Pen': 3, Stun: true },
      },
      distraction: { weight: 0.3, cost: 30 },
      multipleProjectile: {
        damage: '5D',
        weight: 0.4,
        cost: 25,
        traits: { 'Lo-Pen': 3, Spread: 2 },
      },
    },
  },
  ASSW: {
    range: 200,
    weight: 0.5,
    warheads: {
      fragmentation: {
        range: 300,
        damage: '5D',
        cost: 90,
        traits: { Blast: 3, 'Lo-Pen': 2 },
      },
      multipleProjectile: {
        damage: '6D',
        weight: 0.9,
        cost: 40,
        traits: { 'Lo-Pen': 3, Spread: 4 },
      },
      distraction: {
        weight: 0.6,
        cost: 150,
        traits: { Distraction: 'potent' },
      },
      gasIncapacitant: { cost: 125, traits: { Blast: 3 } },
      baton: { cost: 25, traits: { Stun: '2D' } },
      stun: { cost: 75, traits: { Blast: 9, Stun: '3D' } },
    },
  },
  TMMS: {
    range: 1000,
    damage: '6D',
    weight: 6,
    cost: 12000,
    traits: { AP: 12, Blast: 4, Smart: true },
  },
  'MDD-15': {
    range: 550,
    damage: '5D',
    weight: 35.2,
    cost: 9050,
    capacity: 50,
    reload: 750,
    quickdraw: -9,
    traits: { Auto: 3, Bulky: true, Scope: true },
    // Book error (engine is right, per FC + the 13mm Crunch Gun): the MDD-15 stat
    // block omits the anti-materiel receiver surcharge (FC: +150% cost / +50%
    // weight) — its receiver totals read Cr3600/10kg (support × full-auto only).
    // The quirk reproduces that omission, so weight matches exactly (35.2). Cost
    // then lands on the book's own component sum (Cr8150 = 3600 receiver + 3600
    // barrel + 900 mount + 50 scope); the printed total Cr9050 is +900 over that —
    // a second, internal book inconsistency — so cost is flagged. quickdraw −10 vs
    // −9: the engine counts the long and heavy barrel QD separately where the book
    // lists −1 for the long-heavy barrel.
    ignore: ['cost', 'quickdraw'],
    quirks: [
      {
        step: 'Anti-Materiel',
        cost: 1,
        weight: 1,
        note: 'book omits the anti-materiel receiver surcharge (+150% cost/+50% weight)',
      },
    ],
    variants: {
      'Chain Gun': { weight: 56.7, cost: 28100, traits: { Auto: 4 } },
      'Twin Chain Gun': {
        damage: '7D',
        weight: 113.4,
        cost: 56200,
        traits: { Auto: 4 },
      },
    },
  },
  'MDS-15': {
    range: 550,
    damage: '5D-3',
    weight: 13.61,
    cost: 59720,
    capacity: 7,
    reload: 150,
    quickdraw: -9,
    // Rugged/Accurised are the feature traits; Scope the accessory; Bulky the
    // support-class receiver. (High Quality is a play-time DM note, not a trait.)
    traits: { Bulky: true, Rugged: true, Accurised: true, Scope: true },
    // Same book error as the MDD-15 (and confirmed by the user's component
    // breakdown): the MDS-15 stat block omits the anti-materiel receiver
    // surcharge (FC: +150% cost / +50% weight). Its receiver totals read
    // Cr26325/6.54kg — the feature chain off the plain support receiver with NO
    // anti-materiel cost/weight mult. The quirk reproduces that omission, so the
    // weight matches exactly (13.61). The printed cost total Cr59720 is +8775
    // over the book's own component sum (~Cr50945) — a second internal book
    // inconsistency, as on the MDD-15 — so cost is flagged. quickdraw −9 vs −13:
    // the engine charges the bipod (−4) the stat block omits (the 13mm Crunch
    // Gun worksheet does charge it). The Rugged/Accurised feature traits and the
    // top-level Scope are engine-derived but absent from the printed line.
    ignore: ['cost', 'quickdraw', 'weight'],
    quirks: [
      {
        step: 'Anti-Materiel',
        cost: 1,
        weight: 1,
        note: 'book omits the anti-materiel receiver surcharge (+150% cost/+50% weight)',
      },
    ],
    ammo: {
      ball: { traits: { Scope: true } },
      apAdvanced: {
        damage: '5D-5',
        reload: 480,
        traits: { AP: 6, Scope: true },
        // The book's reload prices carry a small flat empty-magazine component
        // (~Cr45–60) on top of the ammunition that is internally inconsistent
        // (ball implies +45, apAdvanced +60) and is far below the FC's
        // 1%-of-weapon-cost rule for an 84k-credit heavy weapon, so the engine
        // (ammo cost only) under-counts the non-primary rows; ignored.
        ignore: ['magazine'],
      },
    },
    variants: {
      'cut down': {
        range: 250,
        // Loads explosive (primary) + pellet; the explosive primary adds Lo-Pen
        // 2 on top of the inherited Bulky/Rugged/Accurised/Scope, and its
        // standard magazine (Cr650) is the headline reload.
        damage: '7D-3',
        traits: { 'Lo-Pen': 2 },
        reload: 650,
        weight: 10.76,
        cost: 47435,
        ignore: ['cost', 'weight', 'quickdraw'],
        quirks: [
          {
            step: 'Anti-Materiel',
            cost: 1,
            weight: 1,
            note: 'book omits the anti-materiel receiver surcharge',
          },
        ],
        ammo: {
          explosive: {
            damage: '7D-3',
            reload: 650,
            traits: { 'Lo-Pen': 2 },
          },
          pellet: {
            damage: '5D-3',
            reload: 150,
            traits: { 'Lo-Pen': 4, Spread: 3 },
            // Same flat empty-magazine component as the base apAdvanced row.
            ignore: ['magazine'],
          },
        },
      },
    },
  },
  'TES-12': {
    range: 625,
    damage: '8D',
    weight: 13.7,
    cost: 19500,
    capacity: 125,
    reload: 2500,
    quickdraw: -9,
    signature: EL,
    traits: { Bulky: true, 'Lo-Pen': 2, Scope: true, 'Zero-G': true },
    // Stat-line errors the worked component table contradicts (engine matches the
    // worksheet): damage 8D omits Improved Beam Focus's +3 (→ 8D+3); range 625
    // omits the Long barrel's +10% the worksheet applies (→ 688); quickdraw −9
    // omits the bipod's −4 (the worksheet lists no bipod QD, but the 13mm Crunch
    // Gun's worksheet does charge it, which the engine follows → −13).
    // Bulky now comes from the Large (support-class) receiver — the "bulk" the
    // gyrostabiliser note alludes to (it's a class, not a weight: Jimpy-G is 14kg
    // and not Bulky). (signature is suppressed globally — no derivable rule.)
    ignore: ['damage', 'range', 'quickdraw'],
    variants: {
      'TEA-12': {
        range: 450,
        weight: 10.01,
        cost: 17500,
        quickdraw: -4,
        // The "rifle-like" TEA-12 removes the bipod (its weight 10.01 matches the
        // build minus the 1.2kg bipod), but the book's cost still carries the
        // bipod's Cr937 — a stat-block slip (engine drops both), so cost diverges.
        ignore: ['cost'],
      },
    },
  },
};

// ── Runner ──────────────────────────────────────────────────────────────────
/**
 * Per-field rounding tolerance: a difference counts as "rounding" (not a real
 * issue) when |engine − book| ≤ max(abs, rel × |book|). The relative term absorbs
 * the book rounding prices to round numbers (e.g. 2190.24 → 2200) and printing
 * fewer decimals (13.1375 → 13.1); the absolute floor catches the tiny ones. It
 * scales correctly: 0.04kg is noise on a 13kg gun but a real diff on a 0.9kg one.
 * Fields with no entry (quickdraw / auto / capacity / penetration) are compared
 * EXACTLY — any difference there is meaningful. Pass `--rounding` to also list the
 * suppressed rounding diffs; tighten these to see more.
 */
const TOLERANCE: Record<string, { abs: number; rel: number }> = {
  cost: { abs: 1, rel: 0.01 },
  weight: { abs: 0.01, rel: 0.01 },
  magazine: { abs: 1, rel: 0.01 },
  range: { abs: 1, rel: 0 },
};
const SHOW_ROUNDING = process.argv.includes('--rounding');
// Signature is derived from the worked examples, not a rules table, and the book is
// wildly inconsistent about when it shifts (physical normal vs high/low, etc.) — no
// derivable rule reconciles it, so signature diffs are suppressed by default. Pass
// `--signature` to list them.
const SHOW_SIGNATURE = process.argv.includes('--signature');

/**
 * Trait-name aliases applied to the *book* key before comparing — the book
 * transcribes the same trait under more than one spelling (OCR). The engine emits
 * the canonical name on the right.
 */
const TRAIT_KEY_ALIAS: Record<string, string> = {
  // The Standard's stat block prints 'Bulwark'; MF-61 / Cryojet print 'Bulwarked'.
  Bulwark: 'Bulwarked',
};

/**
 * Trait-value normalizers applied to the *book* figure before comparing — for
 * traits the book transcribes inconsistently. Inaccurate is always a penalty, but
 * the book prints its sign at random (likely OCR), so force it negative.
 */
const TRAIT_NORMALIZE: Record<
  string,
  (v: number | string | boolean) => number | string | boolean
> = {
  // Inaccurate is always a penalty; the book prints its sign at random (OCR).
  Inaccurate: (v) => (typeof v === 'number' ? -Math.abs(v) : v),
  // "Incendiary" with no modifier means Incendiary 0 (Weapon Traits chapter).
  Incendiary: (v) => (v === true ? 0 : v),
};

const n = (v: number) => String(Math.round(v * 10000) / 10000);

type Kind = 'exact' | 'rounding' | 'diff';
function classifyNum(field: string, eng: number, bk: number): Kind {
  if (eng === bk) return 'exact';
  const t = TOLERANCE[field] ?? { abs: 0, rel: 0 };
  const tol = Math.max(t.abs, t.rel * Math.abs(bk));
  return Math.abs(eng - bk) <= tol ? 'rounding' : 'diff';
}

interface Diff {
  field: string;
  engine: string;
  book: string;
  delta?: string;
  rounding?: boolean;
}

/**
 * Composite a partial override (a variant's figures) on top of a base figure so
 * the result is a *complete* stat block: scalars and `signature` fall back to the
 * base, `traits` deep-merge (override wins per key), `ammo`/`warheads` are replaced
 * wholesale when the override gives them (the engine swaps the whole list), `ignore`
 * unions, and `variants` is dropped (we're now at the leaf). This lets the
 * completeness checks run on variants too — every field is present, inherited or
 * overridden, so only genuine gaps and engine-extras are flagged.
 */
function compositeFigures(
  base: BookFigures,
  override: BookFigures,
): BookFigures {
  const merged: BookFigures = { ...base, ...override };
  if (base.traits || override.traits)
    merged.traits = { ...base.traits, ...override.traits };
  merged.ignore = [...(base.ignore ?? []), ...(override.ignore ?? [])];
  merged.quirks = [...(base.quirks ?? []), ...(override.quirks ?? [])];
  merged.note = override.note ?? base.note;
  delete merged.variants;
  return merged;
}

/**
 * Reproduce a book's computation quirks (see `BookQuirk`): walk the cost/weight
 * breakdown accumulating the running subtotal, and for each quirk whose `step`
 * matches a line, divide that step's multiplier (subtotal after ÷ before) back out
 * of the total — the book "forgot" to apply it. Returns the adjusted totals plus
 * any quirk steps that matched no line (a stale quirk, surfaced as a diff).
 */
function applyQuirks(
  e: ReturnType<typeof evaluateWeapon>,
  quirks: BookQuirk[] | undefined,
): { cost: number; weight: number; unmatched: string[] } {
  if (!quirks || quirks.length === 0)
    return { cost: e.totals.cost, weight: e.totals.weight, unmatched: [] };
  // Flat add-ons (fixed-price accessories) don't scale with the receiver baseline,
  // so hold them aside and rescale only the baseline-derived remainder — a quirk
  // on a receiver-chain step otherwise wrongly inflates the flat lines too.
  let flatCost = 0;
  let flatWeight = 0;
  for (const line of e.breakdown)
    if (line.flat) {
      flatCost += line.cost ?? 0;
      flatWeight += line.weight ?? 0;
    }
  let cost = e.totals.cost - flatCost;
  let weight = e.totals.weight - flatWeight;
  const matched = new Set<BookQuirk>();
  // Pass 1 — per-line additive overrides: scale a single component's own
  // contribution (cost/weight ×factor), adjusting the baseline-derived sum by the
  // line's value × (factor − 1). For additive Phase-B components (e.g. a secondary
  // weapon) a multiplicative-step rescale doesn't apply. Done first so the step
  // pass below scales the corrected baseline.
  for (const line of e.breakdown) {
    for (const q of quirks) {
      if (!q.line || !line.label.includes(q.step)) continue;
      matched.add(q);
      if (q.cost !== undefined) cost += (line.cost ?? 0) * (q.cost - 1);
      if (q.weight !== undefined) weight += (line.weight ?? 0) * (q.weight - 1);
    }
  }
  // Pass 2 — multiplicative step overrides: rescale the baseline-derived total by
  // (book multiplier ÷ the engine's actual multiplier) for the step. Covers
  // omission (book ×1 → divide it out) and over-application (book ×1.25 where the
  // engine had none → multiply it in).
  let runCost = 0;
  let runWeight = 0;
  for (const line of e.breakdown) {
    const beforeCost = runCost;
    const beforeWeight = runWeight;
    runCost += line.cost ?? 0;
    runWeight += line.weight ?? 0;
    for (const q of quirks) {
      if (q.line || !line.label.includes(q.step)) continue;
      matched.add(q);
      if (q.cost !== undefined && beforeCost > 0)
        cost *= q.cost / (runCost / beforeCost);
      if (q.weight !== undefined && beforeWeight > 0)
        weight *= q.weight / (runWeight / beforeWeight);
    }
  }
  const unmatched = quirks.filter((q) => !matched.has(q)).map((q) => q.step);
  return { cost: cost + flatCost, weight: weight + flatWeight, unmatched };
}

/**
 * Compare one weapon's engine output to its (complete) book figures. Every field
 * and trait is checked for equality; a field/trait the engine produces but the book
 * omits is reported as "book missing" (so engine-added flags surface), except the
 * engine-internal `auto`/`penetration` scalars (the book expresses those as the
 * `Auto`/`Lo-Pen`/`AP` traits). Per-ammo / per-warhead figures are composited onto
 * the top-level figure (shared fields inherit) before the same checks run on them.
 */
function diffParams(params: WeaponParams, book: BookFigures): Diff[] {
  const e = evaluateWeapon(params);
  const p = e.profile;
  const diffs: Diff[] = [];
  // `field` is the base name (used for tolerance); `prefix` labels per-ammo rows.
  // `reportMissing` (top-level fields only) flags a field the *book* omits but the
  // engine produces — so the now-complete figures are checked for completeness too.
  // A zero engine value counts as "not applicable" and is not flagged when omitted.
  const cmpNum = (
    field: string,
    eng: number,
    bk: number | undefined,
    prefix = '',
    reportMissing = false,
  ) => {
    if (bk === undefined) {
      if (reportMissing && eng !== 0)
        diffs.push({ field: prefix + field, engine: n(eng), book: 'missing' });
      return;
    }
    const kind = classifyNum(field, eng, bk);
    if (kind === 'exact') return;
    const sign = eng - bk >= 0 ? '+' : '';
    diffs.push({
      field: prefix + field,
      engine: n(eng),
      book: n(bk),
      delta: `Δ${sign}${n(eng - bk)}`,
      rounding: kind === 'rounding',
    });
  };
  const cmpStr = (
    field: string,
    eng: string,
    bk: string | undefined,
    prefix = '',
    reportMissing = false,
  ) => {
    if (bk === undefined) {
      if (reportMissing)
        diffs.push({ field: prefix + field, engine: eng, book: 'missing' });
      return;
    }
    if (eng !== bk)
      diffs.push({ field: prefix + field, engine: eng, book: bk });
  };
  const cmpTraits = (
    engT: Traits,
    bookT: Record<string, number | string | boolean> | undefined,
    prefix = '',
    reportExtra = false,
    // For per-ammo/per-warhead sub-rows: the engine's top-level traits. A trait
    // inherited from the parent unchanged is the weapon's, not the row's — it is
    // already completeness-checked at the top level, so don't re-flag it per row.
    parentEngT?: Traits,
  ) => {
    const bookKeys = new Set<string>();
    for (const [rawKey, raw] of Object.entries(bookT ?? {})) {
      const k = TRAIT_KEY_ALIAS[rawKey] ?? rawKey;
      bookKeys.add(k);
      const bv = TRAIT_NORMALIZE[k] ? TRAIT_NORMALIZE[k]!(raw) : raw;
      const ev = (engT as Record<string, number | string | true>)[k];
      const evStr = ev === undefined ? '—' : ev === true ? 'yes' : String(ev);
      const bvStr = bv === true ? 'yes' : String(bv);
      if (evStr !== bvStr)
        diffs.push({
          field: `${prefix}trait ${k}`,
          engine: evStr,
          book: bvStr,
        });
    }
    // The reverse direction: traits the engine emits that the book doesn't list.
    if (reportExtra)
      for (const [k, ev] of Object.entries(engT)) {
        if (bookKeys.has(k)) continue;
        // Inherited unchanged from the parent → already flagged at the top level.
        if (parentEngT && (parentEngT as Record<string, unknown>)[k] === ev)
          continue;
        diffs.push({
          field: `${prefix}trait ${k}`,
          engine: ev === true ? 'yes' : String(ev),
          book: 'missing',
        });
      }
  };
  // Apply any book-computation quirks (divide out steps the book skipped) before
  // comparing the build totals; a quirk that matched no step is a stale entry.
  const adj = applyQuirks(e, book.quirks);
  for (const step of adj.unmatched)
    diffs.push({
      field: `quirk '${step}'`,
      engine: 'no breakdown step matched',
      book: 'expected one',
    });
  cmpNum('cost', adj.cost, book.cost, '', true);
  cmpNum('weight', adj.weight, book.weight, '', true);
  cmpNum('magazine', e.totals.reload, book.reload, '', true);
  cmpStr('damage', formatDamage(p.damage), book.damage, '', true);
  cmpNum('range', p.range, book.range, '', true);
  cmpNum('quickdraw', p.quickdraw, book.quickdraw, '', true);
  // `auto` and `penetration` are engine-internal scalars the book never lists as
  // such — it expresses them as the `Auto` and `Lo-Pen`/`AP` traits — so they are
  // compared only when a figure is supplied, never reported as "book missing".
  cmpNum('auto', p.auto, book.auto);
  cmpNum('penetration', p.penetration, book.penetration);
  cmpNum('capacity', p.capacity, book.capacity, '', true);
  cmpStr(
    'signature',
    `${p.signatureKind} (${p.signature})`,
    book.signature,
    '',
    true,
  );
  cmpTraits(p.traits, book.traits, '', true);

  // Per-ammo rows (firearms): match each loaded profile by its ammo *id*. Each ammo
  // figure inherits the top-level (primary) damage/range/magazine/traits it doesn't
  // restate, so the completeness checks run against a full figure.
  const ignore = new Set(book.ignore ?? []);
  const ammoRows = e.ammoProfiles ?? [];
  for (const [id, figs] of Object.entries(book.ammo ?? {})) {
    const prefix = `${id} · `;
    const row = ammoRows.find((r) => r.ammo === id);
    if (!row) {
      diffs.push({ field: `${prefix}(loaded)`, engine: '—', book: 'expected' });
      continue;
    }
    cmpStr('damage', formatDamage(row.profile.damage), figs.damage ?? book.damage, prefix, true); // prettier-ignore
    cmpNum('range', row.profile.range, figs.range ?? book.range, prefix, true);
    cmpNum('magazine', row.reload, figs.reload ?? book.reload, prefix, true); // prettier-ignore
    // penetration is engine-internal (see above): compare only if the book gives one.
    cmpNum('penetration', row.profile.penetration, figs.penetration, prefix);
    cmpTraits(
      row.profile.traits,
      { ...book.traits, ...figs.traits },
      prefix,
      true,
      p.traits,
    );
    for (const f of figs.ignore ?? []) ignore.add(prefix + f);
  }

  // Per-warhead rows (launchers): match each loaded munition by its warhead id.
  // `weight` / `cost` are the *per-round* figures (a different scale from the
  // launcher's own weight/cost, so they don't inherit); damage/range/traits inherit
  // the launcher's top-level figure.
  const munitionRows = e.munitionProfiles ?? [];
  for (const [key, figs] of Object.entries(book.warheads ?? {})) {
    const prefix = `${key} · `;
    const row = munitionRows.find((r) => r.key === key);
    if (!row) {
      diffs.push({ field: `${prefix}(loaded)`, engine: '—', book: 'expected' });
      continue;
    }
    cmpStr('damage', formatDamage(row.profile.damage), figs.damage ?? book.damage, prefix, true); // prettier-ignore
    cmpNum('range', row.profile.range, figs.range ?? book.range, prefix, true);
    cmpNum('weight', row.weight, figs.weight, prefix, true);
    cmpNum('cost', row.cost, figs.cost, prefix, true);
    cmpTraits(
      row.profile.traits,
      { ...book.traits, ...figs.traits },
      prefix,
      true,
      p.traits,
    );
    for (const f of figs.ignore ?? []) ignore.add(prefix + f);
  }

  // Under-barrel secondary weapon: diff the book's secondary block against the
  // engine's secondary profile (+ its reload price).
  if (book.secondary) {
    const sec = e.secondary;
    if (!sec) {
      diffs.push({ field: 'secondary · (present)', engine: '—', book: 'expected' }); // prettier-ignore
    } else {
      const sb = book.secondary;
      const pfx = 'secondary · ';
      cmpStr('damage', formatDamage(sec.profile.damage), sb.damage, pfx, true);
      cmpNum('range', sec.profile.range, sb.range, pfx, true);
      cmpNum('capacity', sec.profile.capacity, sb.capacity, pfx, true);
      cmpNum('magazine', sec.reload, sb.reload, pfx, true);
      cmpStr('signature', `${sec.profile.signatureKind} (${sec.profile.signature})`, sb.signature, pfx, true); // prettier-ignore
      cmpTraits(sec.profile.traits, sb.traits, pfx, true);
      for (const f of sb.ignore ?? []) ignore.add(pfx + f);
    }
  }

  // Power-pack / magazine options (energy & multi-mag firearms): match each book
  // pack to the engine's magazine row by label, falling back to position (the
  // first book pack ≈ the standard/internal one whose label differs).
  const eMags = e.magazines ?? [];
  Object.entries(book.packs ?? {}).forEach(([label, figs], i) => {
    const row = eMags.find((m) => m.label === label) ?? eMags[i];
    const pfx = `${label} · `;
    if (!row) {
      diffs.push({ field: `${pfx}(present)`, engine: '—', book: 'expected' });
      return;
    }
    cmpNum('capacity', row.capacity, figs.capacity, pfx, true);
    cmpNum('magazine', row.reload, figs.reload, pfx, true);
  });

  // Drop spot exceptions (confirmed book errors the engine is right about).
  return diffs.filter((d) => {
    // Signature has no derivable rule (see SHOW_SIGNATURE) — drop those diffs unless
    // explicitly requested. Matches the top-level 'signature' and 'secondary · signature'.
    if (!SHOW_SIGNATURE && /(^|· )signature$/.test(d.field)) return false;
    return !ignore.has(d.field);
  });
}

/**
 * Label a config as the book does: a title-case name is a separate *model*
 * (`Name › Model`), a lowercase name is a *config* of one weapon, which the book
 * brackets (`Name (config)`). `config` undefined → just the name (unnamed base).
 */
function configLabel(name: string, config?: string): string {
  if (!config) return name;
  return /^[a-z]/.test(config) ? `${name} (${config})` : `${name} › ${config}`;
}

function main() {
  const stubs: string[] = [];
  let reconciled = 0; // exact, or every diff within rounding tolerance
  let realDiffTotal = 0;
  let roundingTotal = 0;
  const lines: string[] = [];

  const row = (d: Diff) =>
    `      ${(d.rounding ? '≈ ' : '  ') + d.field.padEnd(14)} engine ${d.engine.padEnd(16)} book ${(d.book + ' ' + (d.delta ?? '')).trim()}`;

  // Report one params-vs-figures comparison (the figures are already a complete
  // stat block — composited from the base for a variant).
  const report = (label: string, params: WeaponParams, book: BookFigures) => {
    const all = diffParams(params, book);
    const real = all.filter((d) => !d.rounding);
    const rounding = all.filter((d) => d.rounding);
    roundingTotal += rounding.length;
    if (real.length === 0) {
      reconciled++;
      const tag = rounding.length
        ? ` (${rounding.length} within rounding)`
        : '';
      lines.push(`✓  ${label}${tag}`);
    } else {
      realDiffTotal += real.length;
      lines.push(`✗  ${label}`);
      for (const d of real) lines.push(row(d));
      if (book.note) lines.push(`      note: ${book.note}`);
    }
    // Surface applied book quirks (on ✓ and ✗) so the reproduction isn't silent.
    for (const q of book.quirks ?? []) {
      const over = [
        q.cost !== undefined ? `cost ×${q.cost}` : '',
        q.weight !== undefined ? `weight ×${q.weight}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      lines.push(
        `      quirk: ${q.line ? 'line ' : ''}'${q.step}' → ${over}${q.note ? ` — ${q.note}` : ''}`,
      );
    }
    if (SHOW_ROUNDING) for (const d of rounding) lines.push(row(d));
  };

  for (const def of BUILTIN_WEAPONS) {
    const book = BOOK_FIGURES[def.name];
    if (book === undefined) {
      lines.push(`?? ${def.name} — no entry in BOOK_FIGURES`);
      continue;
    }
    if (Object.keys(book).length === 0) {
      stubs.push(def.name);
      continue;
    }
    // A named config shows as a peer of its siblings. Title-case names are
    // separate *models* (`Name › Model`); lowercase names are *configs* of one
    // weapon, which the book brackets (`Name (config)`).
    report(configLabel(def.name, def.baseVariant), def.params, book);
    // Each variant is evaluated as base ← override; its figures are composited onto
    // the base so the same completeness checks apply (inherited fields fall back).
    for (const v of def.variants ?? []) {
      const vbook = book.variants?.[v.name];
      if (!vbook) {
        stubs.push(configLabel(def.name, v.name));
        continue;
      }
      report(
        configLabel(def.name, v.name),
        variantParams(def.params, v.override),
        compositeFigures(book, vbook),
      );
    }
  }

  console.log('\n=== Book reconciliation ===\n');
  console.log(lines.join('\n'));
  if (stubs.length > 0) {
    console.log(
      `\n--- Stubs (fill BOOK_FIGURES from the book) — ${stubs.length} ---`,
    );
    console.log(stubs.map((s) => `   ${s}`).join('\n'));
  }
  console.log(
    `\n${BUILTIN_WEAPONS.length} weapons · ${reconciled} reconcile (±rounding) · ${stubs.length} stubs · ${realDiffTotal} real diffs · ${roundingTotal} within rounding${SHOW_ROUNDING ? '' : ' (--rounding to show)'}\n`,
  );
}

main();
