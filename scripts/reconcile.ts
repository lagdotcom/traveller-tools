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
  evaluateWeapon,
  formatDamage,
  type Traits,
  variantParams,
  type WeaponParams,
} from '@traveller-tools/core';

const EL = 'emissions (low)';
const EN = 'emissions (normal)';

const PL = 'physical (low)';
const PN = 'physical (normal)';

interface BookFigures {
  costCr?: number;
  weightKg?: number;
  /** Reload price of the standard magazine. */
  magazineCr?: number;
  /** e.g. '5D', '5D-3', '3D+5'. */
  damage?: string;
  range?: number;
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
   * 'gasIncapacitant', 'baton'). `weightKg` / `costCr` are the *per-round* mass
   * and price of a single munition (not the loaded magazine). Only emitted when
   * the launcher loads more than one munition.
   */
  warheads?: Record<string, WarheadFigures>;
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
   * own maths skipped a step. Each names a cost/weight breakdown step (by label
   * substring) and which of its multipliers the book left out; the harness divides
   * that factor back out of the total before comparing, so the engine matches the
   * (quirky) book figure instead of flagging a diff. See `BookQuirk`.
   */
  quirks?: BookQuirk[];
  /** Free notes (page ref, "book error: …", etc.). */
  note?: string;
}

/**
 * One book-computation quirk: "the book forgot to apply step X's cost/weight".
 * The step's multiplier is recovered from the breakdown (running subtotal after ÷
 * before) and divided back out. Assumes the step is a receiver-baseline multiplier
 * — so the whole printed total scales with it (barrel/stock/% accessories are a %
 * of the baseline); flat-Cr add-ons (rare) aren't re-derived.
 */
interface BookQuirk {
  /** Substring matched against a cost/weight breakdown line-item label. */
  step: string;
  /** Which of the step's multipliers the book omitted. */
  drop: ('cost' | 'weight')[];
  /** Why — suspected book error, house ruling, etc. (shown in the report). */
  note?: string;
}

/** The ammo-varying fields of one loaded ammunition / munition type. */
interface AmmoFigures {
  damage?: string;
  range?: number;
  penetration?: number;
  /** Reload price of a magazine loaded with this ammo. */
  magazineCr?: number;
  traits?: Record<string, number | string | boolean>;
  /** Field names (un-prefixed, e.g. 'damage') to skip for this ammo. */
  ignore?: string[];
}

/** The per-round figures of one loaded launcher munition (warhead / missile). */
interface WarheadFigures {
  damage?: string;
  range?: number;
  /** Per-round weight of a single munition. */
  weightKg?: number;
  /** Per-round cost of a single munition. */
  costCr?: number;
  traits?: Record<string, number | string | boolean>;
  /** Field names (un-prefixed, e.g. 'damage') to skip for this warhead. */
  ignore?: string[];
}

// ── The book stat blocks. Fill in the `{}` stubs from the Field Catalogue. ──────
const BOOK_FIGURES: Record<string, BookFigures> = {
  'Generic 6 Revolver': {
    range: 10,
    damage: '3D-3',
    weightKg: 0.75,
    costCr: 150,
    capacity: 6,
    magazineCr: 5,
    quickdraw: 8,
    signature: 'NOT GIVEN',
    traits: { 'Lo-Pen': 2 },
  },
  'Compact PDW': {
    range: 8,
    damage: '2D',
    weightKg: 0.67,
    costCr: 485,
    capacity: 13,
    magazineCr: 9,
    quickdraw: 6,
    signature: PL,
    traits: { Auto: 4, 'Lo-Pen': 2 },
  },
  'Civilian Shotgun': {
    range: 20,
    damage: '4D-4',
    weightKg: 4.5,
    costCr: 130,
    // Book stat block prints "1 + 1" (one round per barrel, double-barrel) = 2.
    capacity: 2,
    magazineCr: 2.5,
    quickdraw: -1,
    signature: PN,
    traits: { Inaccurate: -1, 'Lo-Pen': 4, Spread: 2 },
    variants: {
      'Sawed-Off': {
        range: 5,
        weightKg: 3,
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
    weightKg: 13.1,
    costCr: 3130,
    capacity: 3,
    magazineCr: 75,
    quickdraw: -8,
    signature: 'physical (extreme)',
    traits: { Bulky: true, Scope: true },
  },
  'Flintlock Jazail': {
    range: 125,
    damage: '3D-2',
    weightKg: 3.2,
    costCr: 140,
    capacity: 1,
    magazineCr: 0.25,
    quickdraw: 0,
    signature: 'physical (very high)',
    traits: { Inaccurate: -1, 'Lo-Pen': 3, 'Slow Loader': 12, Unreliable: 2 },
  },
  Adjudicator: {
    range: 12,
    damage: '3D-2',
    weightKg: 0.92,
    costCr: 75,
    capacity: 5,
    magazineCr: 5,
    quickdraw: 8,
    signature: 'physical (very high)',
    traits: { Bulky: true, Inaccurate: 1 },
  },
  'GA-100': {
    range: 50,
    damage: '3D+5',
    weightKg: 4.4,
    costCr: 2200,
    capacity: 23,
    magazineCr: 55,
    quickdraw: 8,
    signature: EL,
    traits: { AP: 4, Auto: 3, Spread: 3 },
  },
  'GC-24': {
    range: 10,
    damage: '3D',
    weightKg: 0.85,
    costCr: 890,
    capacity: 24,
    magazineCr: 27,
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
        drop: ['cost'],
        note: 'book omitted the Increased-RoF cost increase',
      },
      {
        step: 'Capacity 120%',
        drop: ['cost'],
        note: 'book omitted the capacity-% cost increase',
      },
    ],
  },
  'GS-40': {
    range: 20,
    damage: '3D',
    weightKg: 1.2,
    costCr: 450,
    capacity: 40,
    magazineCr: 25,
    quickdraw: 8,
    signature: EL,
    traits: { AP: 3, Auto: 2 },
    // cost: engine Cr442.75 (Cr385 baseline + handgun barrel) is exact; the book
    // rounds it up to 450 (the prose works from the precise figure).
    ignore: ['cost'],
    variants: {
      'Navy Model': {
        range: 50,
        weightKg: 1.42,
        costCr: 500,
        quickdraw: 4,
        traits: { AP: 4, Scope: true },
        // The prose confirms the engine's build exactly: assault barrel → Cr462 /
        // 1.3kg (engine: Cr385 baseline + 20%/30% = 462/1.3). Two book features the
        // engine can't reproduce remain:
        // • damage: book prints 3D; engine 3D-1 is the AP-4 penalty (net pen +2)
        //   that the book *does* apply to GA-100 (3D+5) — a book inconsistency.
        // • Scope / Quickdraw 4 / +0.02kg: the detachable stock that houses the
        //   holographic sight adds Cr45 / 0.12kg (vs the engine `full` stock's
        //   38.5 / 0.10) and grants Scope + −2 Quickdraw. The FC gives this
        //   integrated stock+sight no general stats, so it isn't a modelled component.
        ignore: ['damage', 'trait Scope', 'quickdraw', 'weight'],
        note: 'Navy: book 3D omits the AP-4 penalty (vs GA-100 3D+5); a detachable stock houses a holographic sight (+Cr45/0.12kg, Scope, Quickdraw −2) the FC does not stat generally.',
      },
    },
  },
  Stowaway: {
    range: 4,
    damage: '2D',
    weightKg: 0.63,
    costCr: 240,
    capacity: 6,
    magazineCr: 135,
    quickdraw: 10,
    signature: 'physical (minimal)',
    traits: { Auto: 2, 'Lo-Pen': 2, Stealth: 'extreme' },
  },
  Liberator: {
    range: 5,
    damage: '3D3-1',
    weightKg: 0.9,
    costCr: 105,
    capacity: 4,
    magazineCr: 4,
    quickdraw: 12,
    signature: 'physical (normal)',
    traits: { 'Slow Loader': 4 },
    ammo: {
      lowPenetration: {
        signature: 'physical (very high)',
        traits: { 'Lo-Pen': 3 },
      },
      heap: { magazineCr: 40, signature: 'physical (extreme)' },
    },
    variants: {
      Defender: {
        range: 30,
        weightKg: 2,
        costCr: 190,
        quickdraw: 6,
        ammo: {
          ball: { damage: '3D-1' },
          distraction: { magazineCr: 40, traits: { Distraction: 'standard' } },
          explosive: { signature: 'physical (high)', traits: { 'Lo-Pen': 2 } },
        },
      },
    },
  },
  Bodyguard: {
    damage: '4D',
    weightKg: 4.1,
    costCr: 260,
    capacity: 6,
    magazineCr: 9,
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
        weightKg: 3.25,
        costCr: 180,
        capacity: 3,
        magazineCr: 4.5,
        quickdraw: 2,
        traits: { 'Lo-Pen': 5, Spread: 2 },
      },
    },
  },
  Standard: {
    range: 135,
    damage: '2D',
    weightKg: 2.3,
    costCr: 2260,
    capacity: 27,
    magazineCr: 30,
    quickdraw: 2,
    signature: PN,
    traits: { Bulwark: 2 },
  },
  'Mk 1 Handgun': {
    range: 12,
    damage: '3D-1',
    weightKg: 1.1,
    costCr: 240,
    capacity: 8,
    magazineCr: 10,
    quickdraw: 8,
    signature: PN,
    variants: {
      suppressed: {
        costCr: 415,
        quickdraw: 5,
        signature: 'physical (small)',
        traits: { 'Lo-Pen': 2 },
      },
    },
  },
  'Posi-9': {
    range: 12.5,
    damage: '3D-3',
    weightKg: 1.1,
    costCr: 375,
    capacity: 15,
    magazineCr: 15,
    quickdraw: 8,
    signature: PN,
    traits: { 'Lo-Pen': 2 },
    variants: {
      burst: { costCr: 435, traits: { Auto: 2 } },
      auto: {
        costCr: 435, // '+ conversion cost'
        traits: { Auto: 4 },
      },
    },
  },
  Crewmate: {
    range: 50,
    damage: '2D',
    weightKg: 1.1,
    costCr: 465,
    capacity: 30,
    magazineCr: 20,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 4, 'Lo-Pen': 2 },
  },
  Desperado: {
    range: 25,
    damage: '3D-3',
    weightKg: 2.8,
    costCr: 400,
    capacity: 20,
    magazineCr: 19,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 3, Inaccurate: 1 },
  },
  Eliminator: {
    range: 20,
    damage: '2D-3',
    weightKg: 2.81,
    costCr: 965,
    capacity: 24,
    magazineCr: 25,
    quickdraw: 4,
    signature: PN,
    ammo: {
      ball: { magazineCr: 25 },
      apAdvanced: { magazineCr: 68, traits: { AP: 3 } },
      enhancedWounding: {
        damage: '2D+1',
        magazineCr: 39,
        traits: { 'Lo-Pen': 3 },
      },
    },
  },
  'IAW-12': {
    range: 50,
    damage: '3D-1',
    weightKg: 3.85,
    costCr: 1750,
    capacity: 72,
    magazineCr: 50,
    quickdraw: 6,
    signature: EN,
    traits: { AP: 4, Auto: 4 },
  },
  Planetsider: {
    range: 55,
    damage: '3D-1',
    weightKg: 5,
    costCr: 1950,
    capacity: 28,
    magazineCr: 48,
    quickdraw: 5,
    signature: PL,
    traits: { Auto: 3, Rugged: true },
  },
  'GR-80': {
    range: 540,
    damage: '4D',
    weightKg: 5.2,
    costCr: 2220,
    capacity: 90,
    magazineCr: 65,
    quickdraw: 0,
    signature: EL,
    traits: { AP: 3, Auto: 3, Scope: true },
    variants: {
      'GR-80A': {
        range: 600,
        costCr: 3120,
        capacity: 150,
        magazineCr: 100,
        quickdraw: -2,
      },
    },
  },
  AIWS: {
    range: 310,
    damage: '3D',
    weightKg: 3.9,
    costCr: 1435,
    capacity: 42,
    magazineCr: 35,
    quickdraw: 0,
    signature: PL,
    traits: { Auto: 3 },
    variants: {
      carbine: { range: 280, damage: '3D-1', weightKg: 3.6, costCr: 1434 },
      support: {
        weightKg: 5,
        costCr: 1695,
        capacity: 64,
        magazineCr: 70,
        quickdraw: -1,
      },
      assault: {
        range: 125,
        damage: '2D',
        weightKg: 3.4,
        costCr: 1211,
        quickdraw: 2,
      },
    },
  },
  Intruder: {
    range: 225,
    damage: '3D',
    weightKg: 5.55,
    costCr: 2085,
    capacity: 36,
    magazineCr: 40,
    quickdraw: 3,
    signature: PN,
    secondary: {
      range: 5,
      damage: '4D',
      capacity: 3,
      magazineCr: 5,
      signature: PN,
      traits: { 'Lo-Pen': 5, Spread: 4 },
    },
  },
  Squadmate: {
    range: 300,
    damage: '3D+3',
    weightKg: 4,
    costCr: 560,
    capacity: 24,
    magazineCr: 28,
    quickdraw: 0,
    signature: PN,
    variants: {
      Marksman: { weightKg: 4.825, costCr: 1280, traits: { Accurised: true } },
    },
  },
  Sentinel: {
    range: 250,
    damage: '3D-3',
    weightKg: 0.57,
    costCr: 195,
    capacity: 4,
    magazineCr: 8,
    quickdraw: 8,
    signature: PN,
    traits: { Inaccurate: -1, 'Zero-G': true },
    ammo: { explosive: { damage: '5D-3', costCr: 160, magazineCr: 48 } },
  },
  Shipmate: {
    range: 8,
    damage: '3D-3',
    weightKg: 1.4,
    costCr: 560,
    capacity: 14,
    magazineCr: 35,
    quickdraw: 6,
    signature: PN,
    traits: { Auto: 4, Inaccurate: -2, 'Lo-Pen': 3, 'Zero-G': true },
    variants: {
      'Assault Weapon': {
        range: 20,
        weightKg: 1.5,
        costCr: 610,
        capacity: 20,
        magazineCr: 50,
        quickdraw: 4,
        traits: { 'Lo-Pen': 0 },
      },
      Carbine: {
        range: 45,
        weightKg: 1.6,
        costCr: 610,
        capacity: 20,
        magazineCr: 50,
        quickdraw: 0,
        traits: { 'Lo-Pen': 0 },
      },
    },
  },
  'Ten-Six': {
    range: 5,
    damage: '3D-3',
    weightKg: 0.93,
    costCr: 170,
    capacity: 5,
    magazineCr: 12,
    quickdraw: 7,
    signature: PN,
    traits: { Inaccurate: -2, 'Lo-Pen': 3, 'Zero-G': true },
    secondary: {
      range: 2,
      damage: '4D-3',
      capacity: 1,
      magazineCr: 1.25,
      signature: PN,
      traits: { Inaccurate: -1, 'Lo-Pen': 3, Spread: 4 },
    },
  },
  Guardian: {
    range: 250,
    damage: '4D',
    weightKg: 10.3,
    costCr: 4520,
    capacity: 45,
    magazineCr: 270,
    quickdraw: -4,
    signature: PN,
    traits: { Auto: 3, Inaccurate: -1, 'Zero-G': true },
    ammo: {
      ball: { range: 275 },
      explosive: { damage: '6D', magazineCr: 1400 },
      heap: {
        magazineCr: 2300,
        signature: 'physical (high)',
        traits: { AP: 4 },
      },
    },
  },
  Solo: {
    range: 715,
    damage: '5D-2',
    weightKg: 4.1,
    costCr: 17525,
    capacity: 45,
    magazineCr: 200,
    quickdraw: 0,
    signature: EL,
    traits: { AP: 6, Auto: 3, Scope: true },
    ammo: {
      ball: {},
      apAdvanced: { damage: '5D-5', magazineCr: 275, traits: { AP: 15 } },
    },
  },
  Reliant: {
    range: 280,
    damage: '3D',
    weightKg: 6.4,
    capacity: 50,
    magazineCr: 110,
    quickdraw: -5,
    signature: PL,
    traits: { Auto: 4, Scope: true },
    ammo: {
      ball: {},
      apAdvanced: { damage: '3D-1', magazineCr: 180, traits: { AP: 4 } },
    },
  },
  'Jimpy-G': {
    range: 375,
    damage: '3D+3',
    weightKg: 14,
    costCr: 3060,
    capacity: 50,
    magazineCr: 50,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 3, 'Slow Loader': 4 },
  },
  'MF-61': {
    range: 30,
    damage: '5D',
    weightKg: 7.55,
    costCr: 1400,
    capacity: 4,
    magazineCr: 700,
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
    weightKg: 20.41,
    costCr: 1332,
    capacity: 9,
    magazineCr: 2200,
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
      magazineCr: 70,
      traits: {
        Blast: 0,
        Bulky: true,
        Burn: undefined,
        Inaccurate: 1,
        Incendiary: undefined,
        'Lo-Pen': 3,
      },
    },
    ignore: ['trait Burn', 'trait Incendiary'],
  },
  'BL-3': {
    range: 5,
    damage: '2D',
    weightKg: 0.5,
    costCr: 415,
    capacity: 3,
    magazineCr: 15,
    quickdraw: 10,
    signature: EN,
    traits: { Hazardous: -2, 'Lo-Pen': 4, 'Zero-G': true },
  },
  'M-84': {
    range: 225,
    damage: '4D+3',
    weightKg: 4.4,
    costCr: 6750,
    capacity: 14,
    magazineCr: 0, // builtin
    quickdraw: 0,
    signature: EN,
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
    packs: {
      internal: { capacity: 14, magazineCr: 0 },
      'belt pack': { capacity: 140, magazineCr: 1500 },
      'back pack': { capacity: 420, magazineCr: 4500 },
    },
    variants: { rifle: { range: 250, damage: '5D+3', weightKg: 5 } },
  },
  Nefertem: {
    range: 50,
    damage: '3D',
    weightKg: 2.6 + 1,
    costCr: 960,
    capacity: 100,
    magazineCr: 1000,
    quickdraw: 6,
    signature: EN,
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
  },
  'IP-2': {
    range: 500,
    damage: '2D',
    weightKg: 0.75,
    costCr: 75,
    traits: { Blast: 15, Burn: 2, Incendiary: true },
  },
  'Spigot Mortar': {
    range: 500,
    damage: '10D',
    weightKg: 10,
    costCr: 650,
    traits: { AP: 12, Blast: 4, Inaccurate: -2 },
  },
  'Light Munitions Launcher': {
    range: 200,
    warheads: {
      // Book key 'incapacitant gas' → engine GrenadeTypeId 'gasIncapacitant'.
      gasIncapacitant: { weightKg: 0.5, costCr: 125, traits: { Blast: 3 } },
      baton: {
        damage: '1D',
        weightKg: 0.3,
        costCr: 13,
        traits: { 'Lo-Pen': 3, Stun: true },
      },
      distraction: { weightKg: 0.3, costCr: 30 },
      multipleProjectile: {
        damage: '5D',
        weightKg: 0.4,
        costCr: 25,
        traits: { 'Lo-Pen': 3, Spread: 2 },
      },
    },
  },
  ASSW: {
    range: 200,
    weightKg: 0.5,
    warheads: {
      fragmentation: {
        range: 300,
        damage: '5D',
        costCr: 90,
        traits: { Blast: 3, 'Lo-Pen': 2 },
      },
      multipleProjectile: {
        damage: '6D',
        weightKg: 0.9,
        costCr: 40,
        traits: { 'Lo-Pen': 3, Spread: 4 },
      },
      distraction: {
        weightKg: 0.6,
        costCr: 150,
        traits: { Distraction: 'potent' },
      },
      gasIncapacitant: { costCr: 125, traits: { Blast: 3 } },
      baton: { costCr: 25, traits: { Stun: '2D' } },
      stun: { costCr: 75, traits: { Blast: 9, Stun: '3D' } },
    },
  },
  TMMS: {
    range: 1000,
    damage: '6D',
    weightKg: 6,
    costCr: 12000,
    traits: { AP: 12, Blast: 4, Smart: true },
  },
  'MDD-15': {
    range: 550,
    damage: '5D',
    weightKg: 35.2,
    costCr: 9050,
    capacity: 50,
    magazineCr: 750,
    quickdraw: -9,
    traits: { Auto: 3, Bulky: true, Scope: true },
    variants: {
      'Chain Gun': { weightKg: 56.7, costCr: 28100, traits: { Auto: 4 } },
      'Twin Chain Gun': {
        damage: '7D',
        weightKg: 113.4,
        costCr: 56200,
        traits: { Auto: 4 },
      },
    },
  },
  'MDS-15': {
    range: 550,
    damage: '5D-3',
    weightKg: 13.61,
    costCr: 59720,
    capacity: 7,
    magazineCr: 150,
    quickdraw: -9,
    traits: { Bulky: true },
    ammo: {
      ball: { traits: { Scope: true } },
      apAdvanced: {
        damage: '5D-5',
        magazineCr: 480,
        traits: { AP: 6, Scope: true },
      },
    },
    variants: {
      'cut down': {
        range: 250,
        weightKg: 10.76,
        costCr: 47435,
        ammo: {
          explosive: {
            damage: '7D-3',
            magazineCr: 650,
            traits: { 'Lo-Pen': 2 },
          },
          pellet: {
            damage: '5D-3',
            magazineCr: 150,
            traits: { 'Lo-Pen': 4, Spread: 3 },
          },
        },
      },
    },
  },
  'TES-12': {
    range: 625,
    damage: '8D',
    weightKg: 13.7,
    costCr: 19500,
    capacity: 125,
    magazineCr: 2500,
    quickdraw: -9,
    signature: EL,
    traits: { Bulky: true, 'Lo-Pen': 2, Scope: true, 'Zero-G': true },
    // Book error: the table prints 8D but omits Improved Beam Focus's +3 (the
    // engine's 8D+3 is correct). Spot-ignored so it doesn't clutter the list.
    ignore: ['damage'],
    variants: {
      'TEA-12': { range: 450, weightKg: 10.01, costCr: 17500, quickdraw: -4 },
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
): { costCr: number; weightKg: number; unmatched: string[] } {
  let costCr = e.totals.costCr;
  let weightKg = e.totals.weightKg;
  if (!quirks || quirks.length === 0)
    return { costCr, weightKg, unmatched: [] };
  const matched = new Set<BookQuirk>();
  let runCost = 0;
  let runWeight = 0;
  for (const line of e.breakdown) {
    const beforeCost = runCost;
    const beforeWeight = runWeight;
    runCost += line.costCr ?? 0;
    runWeight += line.weightKg ?? 0;
    for (const q of quirks) {
      if (!line.label.includes(q.step)) continue;
      matched.add(q);
      if (q.drop.includes('cost') && beforeCost > 0)
        costCr /= runCost / beforeCost;
      if (q.drop.includes('weight') && beforeWeight > 0)
        weightKg /= runWeight / beforeWeight;
    }
  }
  const unmatched = quirks.filter((q) => !matched.has(q)).map((q) => q.step);
  return { costCr, weightKg, unmatched };
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
  cmpNum('cost', adj.costCr, book.costCr, '', true);
  cmpNum('weight', adj.weightKg, book.weightKg, '', true);
  cmpNum('magazine', e.totals.magazineCr, book.magazineCr, '', true);
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
    cmpNum('magazine', row.magazineCr, figs.magazineCr ?? book.magazineCr, prefix, true); // prettier-ignore
    // penetration is engine-internal (see above): compare only if the book gives one.
    cmpNum('penetration', row.profile.penetration, figs.penetration, prefix);
    cmpTraits(
      row.profile.traits,
      { ...book.traits, ...figs.traits },
      prefix,
      true,
    );
    for (const f of figs.ignore ?? []) ignore.add(prefix + f);
  }

  // Per-warhead rows (launchers): match each loaded munition by its warhead id.
  // `weightKg` / `costCr` are the *per-round* figures (a different scale from the
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
    cmpNum('weight', row.weightKg, figs.weightKg, prefix, true);
    cmpNum('cost', row.costCr, figs.costCr, prefix, true);
    cmpTraits(
      row.profile.traits,
      { ...book.traits, ...figs.traits },
      prefix,
      true,
    );
    for (const f of figs.ignore ?? []) ignore.add(prefix + f);
  }

  // Drop spot exceptions (confirmed book errors the engine is right about).
  return diffs.filter((d) => !ignore.has(d.field));
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
    for (const q of book.quirks ?? [])
      lines.push(
        `      quirk: dropped ${q.drop.join('+')} of '${q.step}'${q.note ? ` — ${q.note}` : ''}`,
      );
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
