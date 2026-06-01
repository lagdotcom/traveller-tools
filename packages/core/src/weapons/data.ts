/**
 * Field Catalogue conventional-firearm data tables. All values are transcribed
 * from the *Field Catalogue* weapon-design rules and calibrated against the
 * user's eight worked design worksheets (six of which corroborate the rules-text
 * base values). Where the rules text and a worksheet disagree, the chosen value
 * carries a `reconcile:` note and `evaluateWeapon` emits a warning so nothing is
 * silently invented.
 *
 * Cost/weight are sequential-multiplicative off the receiver baseline; the
 * multipliers below are applied in `weapon.ts`.
 */
import type {
  AccessoryId,
  AmmoTypeId,
  BarrelId,
  CalibreId,
  Damage,
  FeedId,
  FurnitureId,
  MechanismId,
  ReceiverFeatureId,
  ReceiverTypeId,
  SignatureKind,
  SignatureLevel,
  StockId,
  Traits,
} from './types.js';

export const SOURCE = 'Field Catalogue';

const d = (dice: number, mod = 0, die: 3 | 6 = 6): Damage => ({
  dice,
  die,
  mod,
});

// --- Receivers --------------------------------------------------------------

export interface ReceiverDef {
  label: string;
  baseCost: number;
  baseWeight: number;
  baseCapacity: number;
  quickdraw: number;
}

/**
 * reconcile: two early worksheets use Handgun Cr200/0.5kg and Assault 1kg; the
 * rules table and five later worksheets use these values, so we seed these.
 */
export const RECEIVERS: Record<ReceiverTypeId, ReceiverDef> = {
  handgun: {
    label: 'Handgun',
    baseCost: 175,
    baseWeight: 0.8,
    baseCapacity: 10,
    quickdraw: 4,
  },
  assault: {
    label: 'Assault Weapon',
    baseCost: 300,
    baseWeight: 2,
    baseCapacity: 20,
    quickdraw: 2,
  },
  longarm: {
    label: 'Longarm',
    baseCost: 400,
    baseWeight: 2.5,
    baseCapacity: 30,
    quickdraw: 0,
  },
  lsw: {
    label: 'Light Support Weapon',
    baseCost: 1500,
    baseWeight: 5,
    baseCapacity: 50,
    quickdraw: -4,
  },
  heavy: {
    label: 'Heavy Weapon',
    baseCost: 3000,
    baseWeight: 10,
    baseCapacity: 50,
    quickdraw: -8,
  },
};

/**
 * Large-calibre smoothbore base ammunition capacity by receiver (the rules give
 * 10/6/4 for longarm/assault/handgun; the worksheets use 6 for a longarm, which
 * we follow). reconcile: a smoothbore longarm here is 6, not the rules' 10.
 */
export const SMOOTHBORE_CAPACITY: Record<ReceiverTypeId, number> = {
  handgun: 4,
  assault: 6,
  longarm: 6,
  lsw: 10,
  heavy: 10,
};

/** Gauss is a receiver modifier, not a type: ×2 cost, ×1.25 weight, ×3 capacity. */
export const GAUSS_COST_MULT = 2;
export const GAUSS_WEIGHT_MULT = 1.25;
export const GAUSS_CAPACITY_MULT = 3;

// --- Mechanisms -------------------------------------------------------------

export interface MechanismDef {
  label: string;
  costMult: number;
  /** Capacity multiplier (repeater halves); disregarded for smoothbores. */
  capacityMult: number;
  /** Auto score granted (burst 2, full-auto 3). */
  auto: number;
}

export const MECHANISMS: Record<MechanismId, MechanismDef> = {
  singleShot: {
    label: 'Single Shot',
    costMult: 0.25,
    capacityMult: 1,
    auto: 0,
  },
  repeater: { label: 'Repeater', costMult: 0.5, capacityMult: 0.5, auto: 0 },
  semiAuto: { label: 'Semi-Automatic', costMult: 1, capacityMult: 1, auto: 0 },
  burst: { label: 'Burst-Capable', costMult: 1.1, capacityMult: 1, auto: 2 },
  fullAuto: {
    label: 'Fully-Automatic',
    costMult: 1.2,
    capacityMult: 1,
    auto: 3,
  },
};

/** Increased Auto Rate table: extra cost/weight per point of Auto added. */
export const INCREASED_AUTO: Array<{ cost: number; weight: number }> = [
  { cost: 1, weight: 1 }, // +0 (no increase)
  { cost: 1.1, weight: 1.05 }, // +1
  { cost: 1.25, weight: 1.1 }, // +2
  { cost: 1.5, weight: 1.2 }, // +3
  { cost: 2, weight: 1.4 }, // +4
  { cost: 3, weight: 1.6 }, // +5
  { cost: 4, weight: 1.8 }, // +6
];

// --- Calibres / ammunition --------------------------------------------------

export interface CalibreDef {
  label: string;
  damage: Damage;
  /** Cr per 100 rounds (a loaded magazine prices off this). */
  ammoCostPer100: number;
  /** Base range in metres (with a solid/ball projectile). */
  range: number;
  /** Pellet base range for smoothbores, if applicable. */
  pelletRange?: number;
  receiverCostMult: number;
  receiverWeightMult: number;
  /** Base-capacity multiplier from the calibre. */
  capacityMult: number;
  penetration: number;
  signatureKind: SignatureKind;
  signature: SignatureLevel;
  traits: Traits;
  /** Rifle-type rounds lose a die from short barrels. */
  highVelocity: boolean;
  /** Smoothbores ignore mechanism capacity limits and price off solid shot. */
  smoothbore?: boolean;
  /** Minimum receiver type (index into ['handgun','assault','longarm','lsw','heavy']). */
  minReceiver?: ReceiverTypeId;
  /** Electromagnetic round (forces a gauss receiver). */
  gauss?: boolean;
}

/**
 * reconcile: the rules table prints "—" for handgun-calibre penetration, but
 * three worksheets (revolver, PDW, Stowaway) only yield their shown Lo-Pen 2
 * with a base Penetration −1 for pistol rounds, matching the prose ("penetrate
 * armour very poorly"). Seeded as −1.
 */
export const CALIBRES: Record<CalibreId, CalibreDef> = {
  archaicPistol: {
    label: 'Archaic Pistol (Black Powder)',
    damage: d(2, -3),
    ammoCostPer100: 10,
    range: 20,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -2,
    signatureKind: 'physical',
    signature: 'very high',
    traits: { Unreliable: 2, 'Slow Loader': 6 },
    highVelocity: false,
  },
  archaicSmoothbore: {
    label: 'Archaic Smoothbore (Black Powder)',
    damage: d(3, -3),
    ammoCostPer100: 25,
    range: 40,
    pelletRange: 10,
    receiverCostMult: 0.75,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -2,
    signatureKind: 'physical',
    signature: 'very high',
    traits: { Unreliable: 2, 'Slow Loader': 8 },
    highVelocity: false,
    smoothbore: true,
  },
  archaicRifle: {
    label: 'Archaic Rifle (Black Powder)',
    damage: d(3, -3),
    ammoCostPer100: 25,
    range: 150,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -2,
    signatureKind: 'physical',
    signature: 'very high',
    traits: { Unreliable: 2, 'Slow Loader': 12 },
    highVelocity: false,
  },
  lightHandgun: {
    label: 'Light Handgun',
    damage: d(2),
    ammoCostPer100: 60,
    range: 40,
    receiverCostMult: 0.8,
    receiverWeightMult: 0.75,
    capacityMult: 1.2,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'low',
    traits: {},
    highVelocity: false,
  },
  mediumHandgun: {
    label: 'Medium Handgun',
    damage: d(3, -3),
    ammoCostPer100: 75,
    range: 50,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'normal',
    traits: {},
    highVelocity: false,
  },
  // reconcile: the handgun-calibre prose says heavy ammo "reduces weight by
  // 15%", but every heavy-handgun in the catalogue (and the Hangul Liberator
  // worksheet) shows +15% weight — and a reduction would put it below medium
  // handgun, which has no modifier. Seeded as +15%.
  heavyHandgun: {
    label: 'Heavy Handgun',
    damage: d(3, -1),
    ammoCostPer100: 100,
    range: 60,
    receiverCostMult: 1.2,
    receiverWeightMult: 1.15,
    capacityMult: 0.8,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'normal',
    traits: { Bulky: true },
    highVelocity: false,
  },
  // reconcile: the rules say small ammunition reduces weight 40%, but the
  // Adjudicator worksheet shows no receiver-weight change for small smoothbore.
  // reconcile: the Conventional Firearms trait table lists smoothbores at
  // Inaccurate (-2), but every smoothbore worked example shows Inaccurate (-1)
  // — only the low-recoil (snub) special-purpose round keeps -2 — so the
  // smoothbore calibres are seeded at -1.
  smallSmoothbore: {
    label: 'Small Smoothbore',
    damage: d(3, -2),
    ammoCostPer100: 100,
    range: 60,
    pelletRange: 15,
    receiverCostMult: 0.75,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'high',
    traits: { Inaccurate: -1 },
    highVelocity: false,
    smoothbore: true,
  },
  lightSmoothbore: {
    label: 'Light Smoothbore',
    damage: d(4, -4),
    ammoCostPer100: 125,
    range: 80,
    pelletRange: 20,
    receiverCostMult: 0.75,
    receiverWeightMult: 0.8,
    capacityMult: 1,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'high',
    traits: { Inaccurate: -1 },
    highVelocity: false,
    smoothbore: true,
  },
  standardSmoothbore: {
    label: 'Standard Smoothbore',
    damage: d(4),
    ammoCostPer100: 150,
    range: 100,
    pelletRange: 25,
    receiverCostMult: 0.75,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'high',
    traits: { Inaccurate: -1 },
    highVelocity: false,
    smoothbore: true,
  },
  heavySmoothbore: {
    label: 'Heavy Smoothbore',
    damage: d(4, 4),
    ammoCostPer100: 175,
    range: 120,
    pelletRange: 30,
    receiverCostMult: 0.75,
    receiverWeightMult: 1.2,
    capacityMult: 1,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'high',
    traits: { Inaccurate: -1 },
    highVelocity: false,
    smoothbore: true,
  },
  lightRifle: {
    label: 'Light Rifle',
    damage: d(2),
    ammoCostPer100: 40,
    range: 150,
    receiverCostMult: 1,
    receiverWeightMult: 0.6,
    capacityMult: 1.2,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'low',
    traits: {},
    highVelocity: true,
  },
  intermediateRifle: {
    label: 'Intermediate Rifle',
    damage: d(3),
    ammoCostPer100: 50,
    range: 250,
    receiverCostMult: 1,
    receiverWeightMult: 0.8,
    capacityMult: 1,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'normal',
    traits: {},
    highVelocity: true,
  },
  battleRifle: {
    label: 'Battle Rifle',
    damage: d(3, 3),
    ammoCostPer100: 100,
    range: 300,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 0.8,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'normal',
    traits: {},
    highVelocity: true,
  },
  heavyRifle: {
    label: 'Heavy Rifle',
    damage: d(4),
    ammoCostPer100: 250,
    range: 400,
    receiverCostMult: 1.25,
    receiverWeightMult: 1.1,
    capacityMult: 0.6,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'high',
    traits: {},
    highVelocity: true,
  },
  antiMateriel: {
    label: 'Anti-Materiel',
    damage: d(5),
    ammoCostPer100: 1500,
    range: 1000,
    receiverCostMult: 2.5,
    receiverWeightMult: 1.5,
    capacityMult: 0.4,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'extreme',
    traits: { Bulky: true },
    highVelocity: true,
    minReceiver: 'lsw',
  },
  heavyAntiMateriel: {
    label: 'Heavy Anti-Materiel',
    damage: d(6),
    ammoCostPer100: 3000,
    range: 1200,
    receiverCostMult: 3.5,
    receiverWeightMult: 2,
    capacityMult: 0.2,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'extreme',
    traits: { 'Very Bulky': true },
    highVelocity: true,
    minReceiver: 'heavy',
  },
  // reconcile: the Conventional Firearms table prints Cr150/100 for snub, but the
  // prose ("Cr200 per 100 rounds") and the Ten-Six worked example (Mag 6 = Cr12,
  // i.e. Cr2/round) both give Cr200; seeded at 200.
  // reconcile: the table also prints a −20% Base Capacity Variation for snub, but
  // no worked example applies it, so the capacity multiplier is seeded at 1.
  snub: {
    label: 'Snub (Low-Recoil)',
    damage: d(3, -3),
    ammoCostPer100: 200,
    range: 40,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: -1,
    signatureKind: 'physical',
    signature: 'normal',
    traits: { Inaccurate: -2, 'Zero-G': true },
    highVelocity: false,
  },
  rocket: {
    label: 'Rocket (Accelerator)',
    damage: d(3),
    ammoCostPer100: 120,
    range: 250,
    receiverCostMult: 1,
    receiverWeightMult: 0.5,
    capacityMult: 0.6,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'normal',
    traits: { Inaccurate: -1, 'Zero-G': true },
    highVelocity: false,
  },
  standardGauss: {
    label: 'Standard Gauss',
    damage: d(4),
    ammoCostPer100: 50,
    range: 600,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: 2,
    signatureKind: 'emissions',
    signature: 'normal',
    traits: {},
    highVelocity: false,
    gauss: true,
  },
  smallGauss: {
    label: 'Small Gauss',
    damage: d(3),
    ammoCostPer100: 50,
    range: 100,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: 2,
    signatureKind: 'emissions',
    signature: 'low',
    traits: {},
    highVelocity: false,
    gauss: true,
  },
  enhancedGauss: {
    label: 'Enhanced Gauss',
    damage: d(5),
    ammoCostPer100: 50,
    range: 650,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 1,
    penetration: 2,
    signatureKind: 'emissions',
    signature: 'high',
    traits: {},
    highVelocity: false,
    gauss: true,
  },
  gaussShotgun: {
    label: 'Gauss Shotgun',
    damage: d(3, 6),
    ammoCostPer100: 150,
    range: 100,
    receiverCostMult: 1,
    receiverWeightMult: 1,
    capacityMult: 0.25,
    penetration: 2,
    signatureKind: 'emissions',
    signature: 'low',
    traits: { Spread: 3 },
    highVelocity: false,
    gauss: true,
  },
};

// --- Barrels ----------------------------------------------------------------

export interface BarrelDef {
  label: string;
  /** Cost as a fraction of the receiver baseline. */
  costPct: number;
  /** Weight as a fraction of the receiver baseline. */
  weightPct: number;
  /** Range multiplier (minimal overrides to a flat 5 m). */
  rangeMult: number;
  /** Quickdraw bonus granted by a short barrel. */
  quickdraw: number;
  /** Penetration modifier. */
  penetration: number;
  /** Physical-signature levels added when fired. */
  signatureShift: number;
  /** Reduce high-velocity rounds by one die. */
  reduceHighVelocityDie?: boolean;
  /** Convert all damage dice to D3 (minimal barrel). */
  allDiceToD3?: boolean;
  /** Carbine: −1 per two full dice of base damage. */
  carbineReduction?: boolean;
}

export const BARRELS: Record<BarrelId, BarrelDef> = {
  minimal: {
    label: 'Minimal',
    costPct: 0,
    weightPct: 0,
    rangeMult: 0,
    quickdraw: 8,
    penetration: -2,
    signatureShift: 2,
    allDiceToD3: true,
  },
  short: {
    label: 'Short',
    costPct: 0.1,
    weightPct: 0.1,
    rangeMult: 0.1,
    quickdraw: 6,
    penetration: -1,
    signatureShift: 1,
    reduceHighVelocityDie: true,
  },
  handgun: {
    label: 'Handgun',
    costPct: 0.15,
    weightPct: 0.2,
    rangeMult: 0.2,
    quickdraw: 4,
    penetration: -1,
    signatureShift: 0,
    reduceHighVelocityDie: true,
  },
  assault: {
    label: 'Assault',
    costPct: 0.2,
    weightPct: 0.3,
    rangeMult: 0.5,
    quickdraw: 2,
    penetration: 0,
    signatureShift: 0,
    reduceHighVelocityDie: true,
  },
  carbine: {
    label: 'Carbine',
    costPct: 0.25,
    weightPct: 0.4,
    rangeMult: 0.9,
    quickdraw: 0,
    penetration: 0,
    signatureShift: 0,
    carbineReduction: true,
  },
  rifle: {
    label: 'Rifle',
    costPct: 0.3,
    weightPct: 0.5,
    rangeMult: 1,
    quickdraw: 0,
    penetration: 0,
    signatureShift: 0,
  },
  long: {
    label: 'Long',
    costPct: 0.5,
    weightPct: 0.75,
    rangeMult: 1.1,
    quickdraw: 0,
    penetration: 0,
    signatureShift: 0,
  },
  veryLong: {
    label: 'Very Long',
    costPct: 1,
    weightPct: 1,
    rangeMult: 1.25,
    quickdraw: 0,
    penetration: 0,
    signatureShift: 0,
  },
};

// --- Furniture (stocks + add-ons) -------------------------------------------

export interface StockDef {
  label: string;
  costPct: number;
  weightPct: number;
}

export const STOCKS: Record<StockId, StockDef> = {
  none: { label: 'No Stock', costPct: 0, weightPct: 0 },
  folding: { label: 'Folding Stock', costPct: 0.15, weightPct: 0.05 },
  full: { label: 'Full Stock', costPct: 0.1, weightPct: 0.1 },
};

export interface FurnitureDef {
  label: string;
  costPct: number;
  weightPct: number;
  quickdraw: number;
  minTL?: number;
}

export const FURNITURE: Record<FurnitureId, FurnitureDef> = {
  modularisation: {
    label: 'Modularisation',
    costPct: 0.2,
    weightPct: 0.1,
    quickdraw: 0,
  },
  bipod: { label: 'Bipod', costPct: 0.1, weightPct: 0.2, quickdraw: -4 },
  detachableBipod: {
    label: 'Detachable Bipod',
    costPct: 0.15,
    weightPct: 0.2,
    quickdraw: -4,
  },
  supportMount: {
    label: 'Support Mount',
    costPct: 0.25,
    weightPct: 1,
    quickdraw: 0,
  },
};

// --- Feed devices -----------------------------------------------------------

export interface FeedDef {
  label: string;
  costMult: number;
  weightMult: number;
  capacityMult: number;
  quickdraw: number;
  traits: Traits;
}

export const FEEDS: Record<FeedId, FeedDef> = {
  fixed: {
    label: 'Fixed Magazine',
    costMult: 0.9,
    weightMult: 0.9,
    capacityMult: 1,
    quickdraw: 0,
    traits: {},
  },
  standard: {
    label: 'Standard Magazine',
    costMult: 1,
    weightMult: 1,
    capacityMult: 1,
    quickdraw: 0,
    traits: {},
  },
  extended: {
    label: 'Extended Magazine',
    costMult: 1,
    weightMult: 1,
    capacityMult: 1.5,
    quickdraw: -2,
    traits: {},
  },
  drum: {
    label: 'Drum Magazine',
    costMult: 1,
    weightMult: 1,
    capacityMult: 2.5,
    quickdraw: -6,
    traits: { Inaccurate: -1, Hazardous: -1 },
  },
  belt: {
    label: 'Belt',
    costMult: 1,
    weightMult: 1,
    capacityMult: 1,
    quickdraw: -8,
    traits: { Inaccurate: -1 },
  },
};

// --- Receiver features ------------------------------------------------------

export interface ReceiverFeatureDef {
  label: string;
  costMult: number;
  weightMult: number;
  capacityMult: number;
  quickdraw: number;
  minTL?: number;
  signatureShift?: number;
  /** Range multiplier (Advanced Projectile is +25% → 1.25). */
  rangeMult?: number;
  /** Multiplier applied to ammunition cost (extreme stealth ×20). */
  ammoCostMult?: number;
  /** Flat damage modifier (Recoil Compensation: −1 at 1pt, −3 at 2pts). */
  damageMod?: number;
  /** Recoil modifier (Recoil Compensation reduces Recoil by up to 2). */
  recoilMod?: number;
  /** Low-Quality Deficiency points the design must satisfy (flagged, not auto-applied). */
  deficiency?: number;
  traits?: Traits;
  /** Mutually-exclusive group (only one feature per group). */
  group?: string;
}

export const RECEIVER_FEATURES: Record<ReceiverFeatureId, ReceiverFeatureDef> =
  {
    advancedProjectile: {
      label: 'Advanced Projectile',
      costMult: 1.25,
      weightMult: 0.9,
      capacityMult: 1,
      quickdraw: 0,
      minTL: 9,
      signatureShift: -1,
      rangeMult: 1.25, // "range is 25% further"
    },
    accurised: {
      label: 'Accurised',
      costMult: 2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
    },
    bullpup: {
      label: 'Bullpup',
      costMult: 1.25,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 2,
      group: 'layout',
    },
    semiBullpup: {
      label: 'Semi-Bullpup',
      costMult: 1.2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 2,
      group: 'layout',
    },
    compact: {
      label: 'Compact',
      costMult: 1.25,
      weightMult: 0.9,
      capacityMult: 0.75,
      quickdraw: 0,
      group: 'size',
    },
    veryCompact: {
      label: 'Very Compact',
      costMult: 1.4,
      weightMult: 0.8,
      capacityMult: 0.5,
      quickdraw: 0,
      group: 'size',
    },
    coolingBasic: {
      label: 'Cooling System (Basic)',
      costMult: 1.1,
      weightMult: 2,
      capacityMult: 1,
      quickdraw: 0,
      group: 'cooling',
    },
    coolingAdvanced: {
      label: 'Cooling System (Advanced)',
      costMult: 1.5,
      weightMult: 1.2,
      capacityMult: 1,
      quickdraw: 0,
      group: 'cooling',
    },
    highCapacity: {
      label: 'High Capacity',
      costMult: 1.2,
      weightMult: 1.1,
      capacityMult: 1.2,
      quickdraw: 0,
    },
    highQuality: {
      label: 'High Quality',
      costMult: 1.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'quality',
    },
    lightweight: {
      label: 'Lightweight',
      costMult: 1.5,
      weightMult: 0.8,
      capacityMult: 1,
      quickdraw: 0,
      group: 'weight',
    },
    extremeLightweight: {
      label: 'Extreme Lightweight',
      costMult: 3,
      weightMult: 0.6,
      capacityMult: 1,
      quickdraw: 0,
      group: 'weight',
    },
    quickdraw: {
      label: 'Quickdraw',
      costMult: 1.2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 2,
    },
    rugged: {
      label: 'Rugged',
      costMult: 1.3,
      weightMult: 1.1,
      capacityMult: 1,
      quickdraw: 0,
    },
    vacuum: {
      label: 'Vacuum',
      costMult: 1.2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
    },
    underwater: {
      label: 'Underwater',
      costMult: 2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
    },
    stealthBasic: {
      label: 'Stealth (Basic)',
      costMult: 1.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      signatureShift: -1,
      group: 'stealth',
    },
    stealthExtreme: {
      label: 'Stealth (Extreme)',
      costMult: 3.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      signatureShift: -3,
      ammoCostMult: 20,
      traits: { 'Stealth (extreme)': true },
      group: 'stealth',
    },
    partialMultiBarrel: {
      label: 'Partial Multi-Barrel',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
    },
    // --- Recoil Compensation (group 'recoil'): +10% cost / +5% wt per point;
    // reduces Recoil by up to 2 at the cost of −1 damage (1pt) / −3 (2pts). ---
    recoilComp1: {
      label: 'Recoil Compensation (1 pt)',
      costMult: 1.1,
      weightMult: 1.05,
      capacityMult: 1,
      quickdraw: 0,
      damageMod: -1,
      recoilMod: -1,
      group: 'recoil',
    },
    recoilComp2: {
      label: 'Recoil Compensation (2 pts)',
      costMult: 1.2,
      weightMult: 1.1,
      capacityMult: 1,
      quickdraw: 0,
      damageMod: -3,
      recoilMod: -2,
      group: 'recoil',
    },
    // --- Disguised (group 'disguise'): each −1 detection DM adds 50% cost. The
    // detection DM is a play stat, noted in the label; cost is what we model. ---
    disguised1: {
      label: 'Disguised (DM-1)',
      costMult: 1.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'disguise',
    },
    disguised2: {
      label: 'Disguised (DM-2)',
      costMult: 2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'disguise',
    },
    disguised3: {
      label: 'Disguised (DM-3)',
      costMult: 2.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'disguise',
    },
    disguised4: {
      label: 'Disguised (DM-4)',
      costMult: 3,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'disguise',
    },
    // --- Low Quality (group 'quality', shared with High Quality): a cost
    // reduction plus Deficiency points the design must satisfy with negative
    // traits (Inaccurate/Unreliable/Ramshackle/Hazardous). Which traits is the
    // player's choice per the FC, so we flag the points rather than auto-apply. ---
    lowQuality: {
      label: 'Low Quality',
      costMult: 0.9,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      deficiency: 1,
      group: 'quality',
    },
    veryLowQuality: {
      label: 'Very Low Quality',
      costMult: 0.8,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      deficiency: 2,
      group: 'quality',
    },
    extremelyLowQuality: {
      label: 'Extremely Low Quality',
      costMult: 0.6,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      deficiency: 3,
      group: 'quality',
    },
    appallingQuality: {
      label: 'Appalling Quality',
      costMult: 0.4,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      deficiency: 5,
      group: 'quality',
    },
    pieceOfJunk: {
      label: 'Piece of Junk',
      costMult: 0.2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      deficiency: 8,
      group: 'quality',
    },
    // --- Armoured (group 'armour'): +10% cost / +5% wt per point of Protection.
    // Levels 1–3 cover personal weapons; higher points follow the same formula. ---
    armoured1: {
      label: 'Armoured (1 pt)',
      costMult: 1.1,
      weightMult: 1.05,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Armoured: 1 },
      group: 'armour',
    },
    armoured2: {
      label: 'Armoured (2 pts)',
      costMult: 1.2,
      weightMult: 1.1,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Armoured: 2 },
      group: 'armour',
    },
    armoured3: {
      label: 'Armoured (3 pts)',
      costMult: 1.3,
      weightMult: 1.15,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Armoured: 3 },
      group: 'armour',
    },
    // --- Bulwarked (group 'bulwark'): +20% cost / +10% wt per point; each point
    // grants DM+1 on the Malfunction table (surfaced as a trait). ---
    bulwarked1: {
      label: 'Bulwarked (1 pt)',
      costMult: 1.2,
      weightMult: 1.1,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Bulwarked: 1 },
      group: 'bulwark',
    },
    bulwarked2: {
      label: 'Bulwarked (2 pts)',
      costMult: 1.4,
      weightMult: 1.2,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Bulwarked: 2 },
      group: 'bulwark',
    },
    bulwarked3: {
      label: 'Bulwarked (3 pts)',
      costMult: 1.6,
      weightMult: 1.3,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Bulwarked: 3 },
      group: 'bulwark',
    },
  };

// --- Accessories & sights ---------------------------------------------------

export interface AccessoryDef {
  label: string;
  /** Flat Credit cost, or undefined when `costPct` (of receiver) is used. */
  cost?: number;
  costPct?: number;
  weight: number;
  /** Weight as a fraction of receiver (gravitic support etc.); rare. */
  weightPct?: number;
  quickdraw: number;
  minTL?: number;
  /** Range multiplier applied to the profile (suppressors shorten range). */
  rangeMult?: number;
  penetration?: number;
  signatureShift?: number;
  traits?: Traits;
}

export const ACCESSORIES: Record<AccessoryId, AccessoryDef> = {
  suppressorBasic: {
    label: 'Suppressor (Basic)',
    costPct: 0.5,
    weight: 0.2,
    quickdraw: -2,
    signatureShift: -1,
    rangeMult: 0.75,
    traits: { Inaccurate: -1 },
  },
  suppressor: {
    label: 'Suppressor',
    costPct: 1,
    weight: 0.3,
    quickdraw: -3,
    signatureShift: -2,
    rangeMult: 0.5,
    penetration: -1,
    traits: { Inaccurate: -1 },
  },
  suppressorExtreme: {
    label: 'Suppressor (Extreme)',
    costPct: 2,
    weight: 0.5,
    quickdraw: -4,
    signatureShift: -3,
    rangeMult: 0.25,
    penetration: -2,
    traits: { Inaccurate: -1 },
  },
  scope: {
    label: 'Scope',
    cost: 50,
    weight: 0.2,
    quickdraw: 0,
    minTL: 5,
    traits: { Scope: true },
  },
  longRangeScope: {
    label: 'Long-Range Scope',
    cost: 500,
    weight: 1,
    quickdraw: 0,
    minTL: 6,
    traits: { Scope: true },
  },
  lowLightScope: {
    label: 'Low-Light Scope',
    cost: 150,
    weight: 0.4,
    quickdraw: 0,
    minTL: 6,
    traits: { Scope: true },
  },
  thermalScope: {
    label: 'Thermal Scope',
    cost: 250,
    weight: 0.5,
    quickdraw: 0,
    minTL: 6,
    traits: { Scope: true },
  },
  combinationScope: {
    label: 'Combination Scope',
    cost: 400,
    weight: 0.5,
    quickdraw: 0,
    minTL: 7,
    traits: { Scope: true },
  },
  multispectralScope: {
    label: 'Multispectral Scope',
    cost: 600,
    weight: 0.5,
    quickdraw: 0,
    minTL: 9,
    traits: { Scope: true },
  },
  laserPointer: {
    label: 'Laser Pointer',
    cost: 200,
    weight: 0.1,
    quickdraw: 0,
    minTL: 8,
  },
  integratedSight: {
    label: 'Integrated Sighting System',
    cost: 500,
    weight: 0.4,
    quickdraw: 0,
    minTL: 10,
  },
  holographicSight: {
    label: 'Holographic Sight',
    cost: 750,
    weight: 0,
    quickdraw: 0,
    minTL: 12,
  },
  bayonetLug: { label: 'Bayonet Lug', cost: 0, weight: 0, quickdraw: 0 },
  flashlight: { label: 'Flashlight', cost: 50, weight: 0.1, quickdraw: -2 },
  gunCamera: {
    label: 'Gun Camera',
    cost: 75,
    weight: 0.1,
    quickdraw: 0,
    minTL: 6,
  },
  secureWeapon: {
    label: 'Secure Weapon',
    cost: 100,
    weight: 0,
    quickdraw: 0,
    minTL: 10,
  },
  stabilisation: {
    label: 'Stabilisation',
    cost: 300,
    weight: 0,
    quickdraw: 0,
    minTL: 9,
  },
};

// --- Special (loaded) ammunition --------------------------------------------

export interface AmmoTypeDef {
  label: string;
  minTL: number;
  /** Cost as a multiple of ball ammunition. */
  costMult: number;
  penetration?: number;
  /** Damage modifier added per die of base damage (enhanced wounding +2/die). */
  damagePerDie?: number;
  /** Flat extra dice of damage (explosive +1D, plus per-3-dice bonus). */
  extraDicePer3?: boolean;
  /** Convert all dice to D3 (flechette, low-penetration). */
  allDiceToD3?: boolean;
  signatureShift?: number;
  traits?: Traits;
  /** Range override in metres (flechette → 10 m). */
  rangeOverride?: number;
  /** Spread value granted (pellet). */
  spread?: boolean;
}

export const AMMO_TYPES: Record<AmmoTypeId, AmmoTypeDef> = {
  ball: { label: 'Ball', minTL: 0, costMult: 1 },
  ap: { label: 'Armour-Piercing', minTL: 4, costMult: 2, penetration: 1 },
  apAdvanced: {
    label: 'Armour-Piercing (Advanced)',
    minTL: 7,
    costMult: 4,
    penetration: 2,
  },
  enhancedWounding: {
    label: 'Enhanced Wounding',
    minTL: 5,
    costMult: 2,
    penetration: -2,
    damagePerDie: 2,
  },
  explosive: {
    label: 'Explosive',
    minTL: 6,
    costMult: 6,
    penetration: -1,
    extraDicePer3: true,
    signatureShift: 1,
  },
  heap: {
    label: 'HEAP',
    minTL: 8,
    costMult: 10,
    penetration: 2,
    signatureShift: 1,
  },
  incendiary: {
    label: 'Incendiary',
    minTL: 6,
    costMult: 6,
    traits: { Incendiary: true },
  },
  flechette: {
    label: 'Flechette',
    minTL: 7,
    costMult: 1,
    allDiceToD3: true,
    rangeOverride: 10,
    spread: true,
  },
  gas: { label: 'Gas', minTL: 7, costMult: 6, traits: { Gas: true } },
  lowPenetration: {
    label: 'Low-Penetration',
    minTL: 6,
    costMult: 1,
    penetration: -1,
    allDiceToD3: true,
  },
  pellet: { label: 'Pellet', minTL: 3, costMult: 1, spread: true },
  smart: { label: 'Smart', minTL: 10, costMult: 6, traits: { Smart: true } },
  distraction: { label: 'Distraction', minTL: 5, costMult: 4 },
};

// --- Recoil class modifiers (Field Catalogue p.32) --------------------------

export const RECOIL_CLASS_MOD: Record<ReceiverTypeId, number> = {
  handgun: -2,
  assault: -4,
  longarm: -6,
  lsw: -8,
  heavy: -8,
};
