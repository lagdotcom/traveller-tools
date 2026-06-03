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
  BookSource,
  CalibreId,
  Damage,
  FeedId,
  FlagTraitName,
  FurnitureId,
  MechanismId,
  ReceiverFeatureId,
  ReceiverFeatureRef,
  ReceiverTypeId,
  SignatureKind,
  SignatureLevel,
  StockId,
  Traits,
} from './types.js';

export const SOURCE: BookSource = 'Field Catalogue';

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

/**
 * FC "Recoil Effects" table: the Bulky / Very Bulky trait a large-calibre
 * smoothbore gains in a given receiver (`'impossible'` = can't be built that way).
 * Combinations not listed impose no Bulky.
 */
export const SMOOTHBORE_RECOIL: Partial<
  Record<
    CalibreId,
    Partial<Record<ReceiverTypeId, 'Bulky' | 'Very Bulky' | 'impossible'>>
  >
> = {
  smallSmoothbore: { handgun: 'Bulky' },
  lightSmoothbore: { handgun: 'Very Bulky', assault: 'Bulky' },
  standardSmoothbore: {
    handgun: 'impossible',
    assault: 'Very Bulky',
    longarm: 'Bulky',
  },
  heavySmoothbore: {
    handgun: 'impossible',
    assault: 'impossible',
    longarm: 'Very Bulky',
  },
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

/**
 * Rapid-Fire / Very-Rapid-Fire capability (FC). RF needs Auto ≥4, VRF Auto ≥6.
 * `costMult` for RF is the Auto score +2 (computed at evaluation); weight is a
 * flat receiver multiplier. Each adds extra damage dice (per N base dice), an AP
 * score equal to the base dice, a Bulky/Very-Bulky trait, and a Heat multiplier
 * on the damage dice (Heat/round = Auto + heatDicePerDie × base dice).
 */
export interface RapidFireDef {
  label: string;
  minAuto: number;
  weightMult: number;
  /** +1 damage die per this many full base dice. */
  dicePer: number;
  heatDicePerDie: number;
  trait: FlagTraitName;
}
export const RAPID_FIRE: Record<'rf' | 'vrf', RapidFireDef> = {
  rf: {
    label: 'Rapid-Fire',
    minAuto: 4,
    weightMult: 2,
    dicePer: 3,
    heatDicePerDie: 2,
    trait: 'Bulky',
  },
  vrf: {
    label: 'Very Rapid-Fire',
    minAuto: 6,
    weightMult: 5,
    dicePer: 2,
    heatDicePerDie: 3,
    trait: 'Very Bulky',
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
 * reconcile: the rules table prints "—" for handgun-calibre penetration. Under
 * the Final Penetration table, the worksheets' shown Lo-Pen 2 corresponds to a
 * net penetration of −1 — i.e. base 0 once a handgun/short barrel's −1 is applied
 * (PDW, Stowaway, Crewmate). So pistol calibres are seeded at base 0, not −1.
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
    // Pistol calibres net Lo-Pen 2 once a handgun/short barrel's −1 is applied
    // (Final Penetration table: −1 → Lo-Pen 2); base is 0, not −1.
    penetration: 0,
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
    penetration: 0,
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
    penetration: 0,
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
    range: 500,
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
    signature: 'low',
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
    signature: 'low',
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

/**
 * Pellet ammunition's Spread score by barrel length (FC "Pellet Spread" table).
 * Pellet rounds reduce Penetration by this score.
 */
export const PELLET_SPREAD: Record<BarrelId, number> = {
  minimal: 6,
  short: 5,
  handgun: 4,
  assault: 3,
  carbine: 2,
  rifle: 2,
  long: 1,
  veryLong: 1,
  sawedOff: 3,
};

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
    quickdraw: -1, // worked large laser: a long barrel gives a further −1 Quickdraw
    penetration: 0,
    signatureShift: 0,
  },
  // reconcile: a long barrel is −1 Quickdraw (above); the 13mm Crunch Gun
  // worksheet's very-long barrel applies no Quickdraw penalty (its −8 is the LSW
  // receiver −4 + bipod −4), so Very Long is left at 0 despite being longer.
  veryLong: {
    label: 'Very Long',
    costPct: 1,
    weightPct: 1,
    // reconcile: ×2.5 range (not ×1.25) — with anti-materiel's 500m base this
    // reproduces the 13mm Crunch Gun's 1250m. Only the Crunch Gun uses it.
    rangeMult: 2.5,
    quickdraw: 0,
    penetration: 0,
    signatureShift: 0,
  },
  // Sawed-off: a drastically shortened smoothbore barrel, derived from the
  // Civilian Shotgun's Sawed-Off variant. rangeMult 0.25 reproduces its 5 m range
  // (light-smoothbore pellet range 20 × 0.25); a Pellet Spread of 3 (PELLET_SPREAD
  // above) gives the variant's Spread 3 / Lo-Pen 5. weightPct 0.1 reproduces the
  // book's 3 kg *when paired with that worksheet's 3 kg longarm receiver* — with
  // the rules' 2.5 kg longarm the engine reads ~0.5 kg light, the same documented
  // longarm-weight quirk that makes the base shotgun read light (not a barrel bug).
  // Quickdraw +5 (shorter than Short's +6, longer than Handgun's +4) and the
  // Short-barrel penetration/signature shifts are derived, not book-stated.
  sawedOff: {
    label: 'Sawed-Off',
    costPct: 0.1,
    weightPct: 0.1,
    rangeMult: 0.25,
    quickdraw: 5,
    penetration: -1,
    signatureShift: 1,
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
  fixed: { label: 'Fixed Stock', costPct: 0.1, weightPct: 0.1 },
  full: { label: 'Full Stock', costPct: 0.1, weightPct: 0.1 },
};

export interface FurnitureDef {
  label: string;
  costPct: number;
  weightPct: number;
  quickdraw: number;
  minTL?: number;
  /** A play-time rule not captured as a stat/trait. */
  note?: string;
}

export const FURNITURE: Record<FurnitureId, FurnitureDef> = {
  modularisation: {
    label: 'Modularisation',
    costPct: 0.2,
    weightPct: 0.1,
    quickdraw: 0,
  },
  bipod: {
    label: 'Bipod',
    costPct: 0.1,
    weightPct: 0.2,
    quickdraw: -4,
    note: 'Bipod: once deployed (a significant action), DM+1 to attack beyond 50m.',
  },
  detachableBipod: {
    label: 'Detachable Bipod',
    costPct: 0.15,
    weightPct: 0.2,
    quickdraw: -4,
    note: 'Detachable Bipod: once deployed (a significant action), DM+1 to attack beyond 50m.',
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
  /**
   * Price of the empty feed device as a fraction of the weapon's purchase price
   * (FC: a standard magazine is 1%, an extended one twice that, a drum five
   * times). A loaded magazine's price — what the book lists and `reloadFor`
   * returns — is this plus the ammunition. Fixed magazines are part of the weapon,
   * so 0.
   */
  emptyMagCostPct: number;
}

export const FEEDS: Record<FeedId, FeedDef> = {
  fixed: {
    label: 'Fixed Magazine',
    costMult: 0.9,
    weightMult: 0.9,
    capacityMult: 1,
    quickdraw: 0,
    traits: {},
    emptyMagCostPct: 0,
  },
  standard: {
    label: 'Standard Magazine',
    costMult: 1,
    weightMult: 1,
    capacityMult: 1,
    quickdraw: 0,
    traits: {},
    emptyMagCostPct: 0.01,
  },
  extended: {
    label: 'Extended Magazine',
    costMult: 1,
    weightMult: 1,
    capacityMult: 1.5,
    quickdraw: -2,
    traits: {},
    emptyMagCostPct: 0.02,
  },
  drum: {
    label: 'Drum Magazine',
    costMult: 1,
    weightMult: 1,
    capacityMult: 2.5,
    quickdraw: -6,
    traits: { Inaccurate: -1, Hazardous: -1 },
    emptyMagCostPct: 0.05,
  },
  belt: {
    label: 'Belt',
    costMult: 1,
    weightMult: 1,
    capacityMult: 1,
    quickdraw: -8,
    traits: { Inaccurate: -1 },
    // Belts are sold by the length, not as a % of the weapon; the FC gives no
    // multiplier, so the reload is priced on ammunition alone.
    emptyMagCostPct: 0,
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
  /** Heat removed per round (cooling systems). */
  heatDissipation?: number;
  traits?: Traits;
  /** A play-time rule not captured as a stat/trait. */
  note?: string;
  /** Mutually-exclusive group (only one feature per group). */
  group?: string;
  /**
   * Per-level effects for a *leveled* feature (index 0 = level 1). When present
   * the feature carries a `level` option (see `ReceiverFeatureRef`) and the flat
   * multipliers above are ignored in favour of the chosen level's entry —
   * `resolveFeature` flattens the two into a concrete def.
   */
  levels?: ReceiverFeatureLevel[];
}

/** One level of a leveled feature; missing fields default to "no effect". */
export interface ReceiverFeatureLevel {
  label: string;
  costMult: number;
  weightMult?: number;
  capacityMult?: number;
  quickdraw?: number;
  signatureShift?: number;
  damageMod?: number;
  recoilMod?: number;
  deficiency?: number;
  traits?: Traits;
}

/** Build `max` per-point levels for a linear feature (Armoured / Bulwarked). */
function LEVELED_POINTS(
  max: number,
  name: string,
  costPerPt: number,
  weightPerPt: number,
): ReceiverFeatureLevel[] {
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    return {
      label: `${name} (${n})`,
      costMult: r(1 + costPerPt * n),
      weightMult: r(1 + weightPerPt * n),
      traits: { [name]: n },
    };
  });
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
      traits: { Accurised: true },
      note: 'Accurised: DM+1 to aimed fire at ranges beyond 25m.',
    },
    bullpup: {
      label: 'Bullpup',
      costMult: 1.25,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 2,
      note: 'Bullpup: set up for a right- or left-handed shooter; firing from the wrong shoulder flings hot cases at the user.',
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
      heatDissipation: 2, // removes 2 Heat/round
      note: 'Basic Cooling: a water jacket absorbs 25 Heat per kg before boiling off.',
      group: 'cooling',
    },
    coolingAdvanced: {
      label: 'Cooling System (Advanced)',
      costMult: 1.5,
      weightMult: 1.2,
      capacityMult: 1,
      quickdraw: 0,
      heatDissipation: 5, // removes 5 Heat/round (needs a heat sink, e.g. a chill can)
      note: 'Advanced Cooling: removes 5 Heat/round but its own capacity is only 25 Heat — needs a heat sink (e.g. a chill can) or support cooling.',
      group: 'cooling',
    },
    highCapacity: {
      label: 'High Capacity',
      costMult: 1.2,
      weightMult: 1.1,
      capacityMult: 1.2,
      quickdraw: 0,
      note: 'High Capacity: its magazines are incompatible with non-High-Capacity weapons of the same calibre.',
    },
    highQuality: {
      label: 'High Quality',
      costMult: 1.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      note: 'High Quality: DM+1 to attack beyond 100m when using a scope or similar sight.',
      group: 'quality',
    },
    lightweight: {
      label: 'Lightweight',
      costMult: 1.5,
      weightMult: 0.8,
      capacityMult: 1,
      quickdraw: 0,
      note: 'Lightweight: the +50% cost may instead be taken as the Hazardous (−1) trait.',
      group: 'weight',
    },
    extremeLightweight: {
      label: 'Extreme Lightweight',
      costMult: 3,
      weightMult: 0.6,
      capacityMult: 1,
      quickdraw: 0,
      note: 'Extreme Lightweight: the +200% cost may instead be taken as the Hazardous (−3) trait.',
      group: 'weight',
    },
    quickdraw: {
      label: 'Quickdraw',
      costMult: 1.2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 2,
      note: 'Quickdraw: DM+1 to attack under 25m, DM−1 beyond 25m.',
    },
    rugged: {
      label: 'Rugged',
      costMult: 1.3,
      weightMult: 1.1,
      capacityMult: 1,
      quickdraw: 0,
      traits: { Rugged: true },
      note: 'Rugged: DM+2 to rolls on the Malfunction table.',
    },
    vacuum: {
      label: 'Vacuum',
      costMult: 1.2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      // Vacuum operation grants the Zero-G trait (corroborated by the Guardian /
      // Sentinel worksheets, whose only Zero-G source is this feature).
      traits: { 'Zero-G': true },
      note: 'Vacuum: functions in vacuum or very low pressure (enlarged trigger guard for vacc-suit gloves); works in space or atmosphere.',
    },
    underwater: {
      label: 'Underwater',
      costMult: 2,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      note: 'Underwater: usable underwater (range ÷5 rather than ÷10); requires specialist ammunition.',
    },
    stealthBasic: {
      label: 'Stealth (Basic)',
      costMult: 1.5,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      signatureShift: -1,
      note: 'Basic Stealth: DM−2 to attempts to detect the weapon by scanner, observation or search.',
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
      traits: { Stealth: 'extreme' },
      note: 'Extreme Stealth: DM−6 to detect the weapon; firing standard ammo instead gives only −2 Signature and DM−4.',
      group: 'stealth',
    },
    partialMultiBarrel: {
      label: 'Partial Multi-Barrel',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
    },
    // --- Leveled features (carry a `level` option). Each `levels` entry is one
    // point/grade; `resolveFeature` flattens the chosen level into a concrete def. ---
    // Recoil Compensation: +10% cost / +5% wt per point; reduces Recoil by up to 2
    // at the cost of −1 damage (1pt) / −3 (2pts).
    recoilComp: {
      label: 'Recoil Compensation',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'recoil',
      levels: [
        {
          label: 'Recoil Compensation (1)',
          costMult: 1.1,
          weightMult: 1.05,
          damageMod: -1,
          recoilMod: -1,
        },
        {
          label: 'Recoil Compensation (2)',
          costMult: 1.2,
          weightMult: 1.1,
          damageMod: -3,
          recoilMod: -2,
        },
      ],
    },
    // Disguised: each −1 detection DM adds 50% cost (the DM is a play stat).
    disguised: {
      label: 'Disguised',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      note: 'Disguised: imposes the level’s DM (−1 to −4) on attempts to detect, notice or recognise the weapon.',
      group: 'disguise',
      levels: [
        { label: 'Disguised (DM-1)', costMult: 1.5 },
        { label: 'Disguised (DM-2)', costMult: 2 },
        { label: 'Disguised (DM-3)', costMult: 2.5 },
        { label: 'Disguised (DM-4)', costMult: 3 },
      ],
    },
    // Low Quality (group 'quality', shared with High Quality): a cost reduction
    // plus Deficiency points the design must satisfy with negative traits
    // (Inaccurate/Unreliable/Ramshackle/Hazardous) — the player's choice, so we
    // flag the points rather than auto-apply a trait.
    lowQuality: {
      label: 'Low Quality',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      group: 'quality',
      levels: [
        { label: 'Low Quality', costMult: 0.9, deficiency: 1 },
        { label: 'Very Low Quality', costMult: 0.8, deficiency: 2 },
        { label: 'Extremely Low Quality', costMult: 0.6, deficiency: 3 },
        { label: 'Appalling Quality', costMult: 0.4, deficiency: 5 },
        { label: 'Piece of Junk', costMult: 0.2, deficiency: 8 },
      ],
    },
    // Armoured: +10% cost / +5% wt per point of Protection (surfaced as a trait).
    armoured: {
      label: 'Armoured',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      note: 'Armoured: the Protection points guard against external damage only, not internal malfunctions (e.g. breech explosions).',
      group: 'armour',
      levels: LEVELED_POINTS(5, 'Armoured', 0.1, 0.05),
    },
    // Bulwarked: +20% cost / +10% wt per point; each point grants Malfunction DM+1.
    bulwarked: {
      label: 'Bulwarked',
      costMult: 1,
      weightMult: 1,
      capacityMult: 1,
      quickdraw: 0,
      note: 'Bulwarked: each point gives DM+1 to rolls on the Malfunction table.',
      group: 'bulwark',
      levels: LEVELED_POINTS(5, 'Bulwarked', 0.2, 0.1),
    },
  };

/** The id of a selected feature (bare string or `{id, level}` object). */
export const refFeatureId = (ref: ReceiverFeatureRef): ReceiverFeatureId =>
  typeof ref === 'string' ? ref : ref.id;

/** The level of a selected feature (1 for a bare id / non-leveled feature). */
export const refFeatureLevel = (ref: ReceiverFeatureRef): number =>
  typeof ref === 'string' ? 1 : ref.level;

/** True if `id` is selected at any level. */
export const hasFeature = (
  refs: ReceiverFeatureRef[],
  id: ReceiverFeatureId,
): boolean => refs.some((r) => refFeatureId(r) === id);

/**
 * Flatten a selected feature into a concrete def: for a leveled feature the
 * chosen level's entry replaces the (placeholder) flat multipliers; a plain
 * feature is returned as-is. Returns undefined for an unknown id.
 */
export function resolveFeature(
  ref: ReceiverFeatureRef,
): ReceiverFeatureDef | undefined {
  const def = RECEIVER_FEATURES[refFeatureId(ref)];
  if (!def || !def.levels) return def;
  const i =
    Math.max(1, Math.min(def.levels.length, Math.floor(refFeatureLevel(ref)))) -
    1;
  const lv = def.levels[i]!;
  return {
    label: lv.label,
    costMult: lv.costMult,
    weightMult: lv.weightMult ?? 1,
    capacityMult: lv.capacityMult ?? 1,
    quickdraw: lv.quickdraw ?? 0,
    minTL: def.minTL,
    signatureShift: lv.signatureShift,
    rangeMult: def.rangeMult,
    ammoCostMult: def.ammoCostMult,
    damageMod: lv.damageMod,
    recoilMod: lv.recoilMod,
    deficiency: lv.deficiency,
    traits: lv.traits,
    note: def.note,
    group: def.group,
  };
}

/** Resolve a list of feature refs to concrete defs, dropping unknown ids. */
export const resolveFeatures = (
  refs: ReceiverFeatureRef[],
): ReceiverFeatureDef[] =>
  refs
    .map(resolveFeature)
    .filter((d): d is ReceiverFeatureDef => d !== undefined);

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
  /** A play-time rule not captured as a stat/trait (e.g. "DM+1 within 50m"). */
  note?: string;
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
    minTL: 5, // FC Sighting Devices table. (Accessory-TL is a warning, so the
    // TL4 Crunch Gun's scope just flags rather than invalidating it.)
    traits: { Scope: true },
  },
  longRangeScope: {
    label: 'Long-Range Scope',
    cost: 500,
    // reconcile: prose says 0.5kg, the Sighting Devices table says 1kg; the
    // Intruder worked example ("Optical Sight" Cr500/0.5kg) corroborates 0.5kg.
    weight: 0.5,
    quickdraw: 0,
    minTL: 6,
    traits: { Scope: true },
    note: 'Long-Range Scope: reduces the negative DM for range by 2.',
  },
  lowLightScope: {
    label: 'Low-Light Scope',
    cost: 150,
    weight: 0.4,
    quickdraw: 0,
    minTL: 6,
    traits: { Scope: true },
    note: 'Low-Light Scope: negates near-darkness (needs a little light; useless through smoke).',
  },
  thermalScope: {
    label: 'Thermal Scope',
    cost: 250,
    weight: 0.5, // reconcile: table says 0.5kg, prose says 0.25kg (kept the table)
    quickdraw: 0,
    minTL: 6,
    traits: { Scope: true },
    note: 'Thermal Scope: no to-hit DM, but DM+4 to Recon to spot concealed targets / locate shots.',
  },
  combinationScope: {
    label: 'Combination Scope',
    cost: 400,
    weight: 0.5,
    quickdraw: 0,
    minTL: 7,
    traits: { Scope: true },
    note: 'Combination Scope: combines standard, low-light and thermal scopes.',
  },
  multispectralScope: {
    label: 'Multispectral Scope',
    cost: 600,
    weight: 0.5,
    quickdraw: 0,
    minTL: 9,
    traits: { Scope: true },
    note: 'Multispectral Scope: DM+1 to hit at all ranges and DM+6 to Recon to spot targets.',
  },
  laserPointer: {
    label: 'Laser Pointer',
    cost: 200,
    weight: 0.1,
    quickdraw: 0,
    minTL: 8,
    note: 'Laser Pointer: DM+1 to attack rolls out to 50m.',
  },
  // Weapon-mounted designator (Personal Equipment). The handheld version (TL6,
  // 5kg, Cr5000) is standalone gear, not a weapon accessory.
  laserDesignator: {
    label: 'Laser Designator',
    cost: 1000,
    weight: 0.2,
    quickdraw: 0,
    minTL: 9,
    note: 'Laser Designator: paints a target for laser-guided munitions / homing weapons.',
  },
  integratedSight: {
    label: 'Integrated Sighting System',
    cost: 500,
    weight: 0.4,
    quickdraw: 0,
    minTL: 10,
    note: 'Integrated Sighting System: all Multispectral-Scope benefits even when hip-firing.',
  },
  holographicSight: {
    label: 'Holographic Sight',
    cost: 750, // book error: table says Cr500
    weight: 0,
    quickdraw: 0,
    minTL: 12,
    note: 'Holographic Sight: configurable holographic sighting; can use external sensor data like an ISS.',
    traits: { Scope: true },
  },
  bayonetLug: {
    label: 'Bayonet Lug',
    cost: 0,
    weight: 0,
    quickdraw: 0,
    note: 'Bayonet Lug: lets a bayonet be fitted; a fitted bayonet imposes −2 Quickdraw (except when attacking with it).',
  },
  flashlight: {
    label: 'Flashlight',
    cost: 50,
    weight: 0.1,
    quickdraw: -2,
    note: 'Flashlight: a high-powered light under the barrel.',
  },
  gunCamera: {
    label: 'Gun Camera',
    cost: 75,
    weight: 0.1,
    quickdraw: 0,
    minTL: 6,
    note: 'Gun Camera: records the firing view; the bulkier TL6–7 models impose −2 Quickdraw.',
  },
  graviticSupport: {
    label: 'Gravitic Support',
    cost: 0, // Cr2500/kg of the weapon — depends on final weight, so not auto-priced
    weight: 0,
    weightPct: 3, // weighs 3× the receiver when switched off
    quickdraw: 0,
    minTL: 12,
    note: 'Gravitic Support: reduces Very Bulky to Bulky and removes Bulky; weighs 3× the receiver off, ~0 active. Cost is Cr2500 per kg of the weapon (add manually).',
  },
  intelligentWeapon: {
    label: 'Intelligent Weapon',
    cost: 1000,
    weight: 0,
    quickdraw: 0,
    minTL: 11,
    note: 'Intelligent Weapon: adds a Computer/0 (Computer/1 for Cr5000 at TL13).',
  },
  secureWeapon: {
    label: 'Secure Weapon',
    cost: 100,
    weight: 0,
    quickdraw: 0,
    minTL: 10,
    note: 'Secure Weapon: requires authentication (DNA / voice / signal) before it will fire.',
  },
  stabilisation: {
    label: 'Stabilisation',
    cost: 300,
    weight: 0,
    weightPct: 0.2, // FC: a gyrostabiliser weighs 20% of the receiver
    quickdraw: 0,
    minTL: 9,
    note: 'Stabilisation: offsets up to −2 aiming DM from movement (aimed fire while moving); reduces Very Bulky to Bulky and removes Bulky.',
  },
};

/**
 * Gather the play-time `note` text from a weapon's chosen accessories, furniture
 * and features (deduped) — for things whose effect is a rule, not a stat/trait.
 */
export function collectNotes(opts: {
  accessories?: AccessoryId[];
  furniture?: FurnitureId[];
  features?: ReceiverFeatureRef[];
}): string[] {
  const out: (string | undefined)[] = [];
  for (const id of opts.accessories ?? []) out.push(ACCESSORIES[id]?.note);
  for (const id of opts.furniture ?? []) out.push(FURNITURE[id]?.note);
  for (const r of opts.features ?? []) out.push(resolveFeature(r)?.note);
  return [...new Set(out.filter((n): n is string => Boolean(n)))];
}

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
    // Bare "Incendiary" (no modifier) means Incendiary 0 (Weapon Traits chapter).
    traits: { Incendiary: 0 },
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

// --- Weapon Heat (FC "Weapon Heating Effects" table) ------------------------

export interface HeatProfile {
  /** Heat dissipated per idle round by the bare receiver. */
  dissipation: number;
  /** At/above this Heat, any shot risks a malfunction (12+, no DM). */
  overheat: number;
  /** Danger threshold (9+, DM-2). */
  danger: number;
  /** Disaster threshold (6+, DM-4). */
  disaster: number;
}

/** Per-receiver heat dissipation + malfunction thresholds. */
export const RECEIVER_HEAT: Record<ReceiverTypeId, HeatProfile> = {
  handgun: { dissipation: 2, overheat: 10, danger: 15, disaster: 20 },
  assault: { dissipation: 4, overheat: 15, danger: 30, disaster: 45 },
  longarm: { dissipation: 6, overheat: 20, danger: 40, disaster: 60 },
  lsw: { dissipation: 8, overheat: 25, danger: 50, disaster: 75 },
  heavy: { dissipation: 10, overheat: 30, danger: 60, disaster: 90 },
};

/** A heat sink: discardable when full. (FC gear — pairs with Advanced Cooling.) */
export const CHILL_CAN = {
  label: 'Chill Can',
  minTL: 10,
  weight: 1,
  cost: 50,
  heatCapacity: 100,
};
