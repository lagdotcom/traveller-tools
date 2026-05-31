/**
 * Conventional-firearm domain types for the weapon builder, transcribed from the
 * Mongoose Traveller 2nd Edition *Field Catalogue* weapon-design rules.
 *
 * The Field Catalogue cost/weight model is **sequential-multiplicative off a
 * "modified receiver" baseline** ("this baseline value determines what every
 * further modification or accessory will add"), so — unlike the ship domain — we
 * do not run cost through the additive `design` engine's `summarize`. Instead
 * `evaluateWeapon` (in `weapon.ts`) walks an explicit pipeline that yields the
 * same *shape* of result (line-item breakdown + issues + sources + a derived
 * profile). We reuse the engine's `Issue` type for validation messages.
 *
 * Where the rules text and the user's worked examples disagree, the data tables
 * (`data.ts`) carry the value plus a `// reconcile` note; nothing is invented.
 */

/** Damage as dice of a given die size plus a flat modifier (e.g. `3D-3`). */
export interface Damage {
  dice: number;
  /** Die size: 6 normally, 3 once "reduced to D3s". */
  die: 3 | 6;
  mod: number;
}

/** Signature tracks (Physical for chemical guns, Emissions for gauss). */
export type SignatureKind = 'physical' | 'emissions';
/** Ordered signature levels (index 0 = lowest). */
export const SIGNATURE_LEVELS = [
  'minimal',
  'low',
  'normal',
  'high',
  'very high',
  'extreme',
] as const;
export type SignatureLevel = (typeof SIGNATURE_LEVELS)[number];

/** A weapon trait with an optional numeric score (e.g. `Auto 3`, `Bulky`). */
export type Traits = Record<string, number | true>;

// --- Selectable ids ---------------------------------------------------------

export type ReceiverTypeId =
  | 'handgun'
  | 'assault'
  | 'longarm'
  | 'lsw'
  | 'heavy';

export type MechanismId =
  | 'singleShot'
  | 'repeater'
  | 'semiAuto'
  | 'burst'
  | 'fullAuto';

export type CalibreId =
  | 'archaicPistol'
  | 'archaicSmoothbore'
  | 'archaicRifle'
  | 'lightHandgun'
  | 'mediumHandgun'
  | 'heavyHandgun'
  | 'smallSmoothbore'
  | 'lightSmoothbore'
  | 'standardSmoothbore'
  | 'heavySmoothbore'
  | 'lightRifle'
  | 'intermediateRifle'
  | 'battleRifle'
  | 'heavyRifle'
  | 'antiMateriel'
  | 'heavyAntiMateriel'
  | 'snub'
  | 'rocket'
  | 'standardGauss'
  | 'smallGauss'
  | 'enhancedGauss'
  | 'gaussShotgun';

export type BarrelId =
  | 'minimal'
  | 'short'
  | 'handgun'
  | 'assault'
  | 'carbine'
  | 'rifle'
  | 'long'
  | 'veryLong';

export type StockId = 'none' | 'folding' | 'full';

export type FeedId = 'fixed' | 'standard' | 'extended' | 'drum' | 'belt';

/** Receiver features (multi-select; some are mutually exclusive — see rules). */
export type ReceiverFeatureId =
  | 'advancedProjectile'
  | 'accurised'
  | 'bullpup'
  | 'compact'
  | 'veryCompact'
  | 'coolingBasic'
  | 'coolingAdvanced'
  | 'highCapacity'
  | 'highQuality'
  | 'lightweight'
  | 'extremeLightweight'
  | 'quickdraw'
  | 'rugged'
  | 'vacuum'
  | 'underwater'
  | 'stealthBasic'
  | 'stealthExtreme'
  | 'partialMultiBarrel';

/** Furniture add-ons beyond the stock choice (multi-select). */
export type FurnitureId =
  | 'modularisation'
  | 'bipod'
  | 'detachableBipod'
  | 'supportMount';

/** Accessories & sights (multi-select). */
export type AccessoryId =
  | 'suppressorBasic'
  | 'suppressor'
  | 'suppressorExtreme'
  | 'scope'
  | 'longRangeScope'
  | 'lowLightScope'
  | 'thermalScope'
  | 'combinationScope'
  | 'multispectralScope'
  | 'laserPointer'
  | 'integratedSight'
  | 'holographicSight'
  | 'bayonetLug'
  | 'flashlight'
  | 'gunCamera'
  | 'secureWeapon'
  | 'stabilisation'
  | 'additionalBarrel';

/** Loaded ammunition type, which alters the derived profile (not the cost). */
export type AmmoTypeId =
  | 'ball'
  | 'ap'
  | 'apAdvanced'
  | 'enhancedWounding'
  | 'explosive'
  | 'heap'
  | 'incendiary'
  | 'flechette'
  | 'gas'
  | 'lowPenetration'
  | 'pellet'
  | 'smart'
  | 'distraction';

// --- Energy-weapon selectable ids (Directed Energy Weapons) -----------------

/** Energy-weapon receiver classes (sets max power output + base range). */
export type EnergyReceiverId = 'minimal' | 'small' | 'medium' | 'large';
/** Power output classes; each caps the deliverable damage dice. */
export type EnergyPowerClass = 'weak' | 'light' | 'standard' | 'heavy';
/** Beam type — mechanically identical in the FC, differs only cosmetically. */
export type EnergyWeaponTypeId = 'laser' | 'microwave';
/** How the weapon is powered. */
export type EnergyPowerSourceId = 'powerpack' | 'cartridge';
/** Energy-weapon-exclusive receiver modifications. */
export type EnergyModId =
  | 'efficientBeam'
  | 'improvedFocus'
  | 'intensifiedPulse'
  | 'variableIntensity';

// --- User-facing parameters -------------------------------------------------

/** Discriminates the weapon class so `WeaponParams` is a tagged union. */
export type WeaponClass = 'firearm' | 'energy';

export interface FirearmParams {
  /** Conventional slug-thrower (the original/default class). */
  kind: 'firearm';
  /** Tech level the weapon is built at (gates components, sets some traits). */
  tl: number;
  receiver: ReceiverTypeId;
  /** Electromagnetic (gauss) receiver modifier (×2 cost / ×1.25 weight). */
  gauss: boolean;
  calibre: CalibreId;
  mechanism: MechanismId;
  /** Extra Auto bought on a burst/full-auto receiver (Increased Auto table). */
  autoIncrease: number;
  features: ReceiverFeatureId[];
  barrel: BarrelId;
  /** Heavy-profile barrel (doubles barrel weight & cost). */
  heavyBarrel: boolean;
  stock: StockId;
  furniture: FurnitureId[];
  feed: FeedId;
  /** Actual magazine size as a percentage of base capacity (50–150). */
  capacityPct: number;
  accessories: AccessoryId[];
  /** Loaded ammunition type used for the displayed profile. */
  ammo: AmmoTypeId;
}

/**
 * A Directed Energy Weapon (laser / microwave). Shares barrels, stocks,
 * furniture and accessories with firearms, but is powered (powerpack or
 * disposable cartridges) rather than fed ammunition, and the designer chooses
 * the delivered damage in whole dice up to the receiver's power class.
 */
export interface EnergyParams {
  kind: 'energy';
  tl: number;
  weaponType: EnergyWeaponTypeId;
  receiver: EnergyReceiverId;
  /** Delivered damage in whole D6 (capped by receiver power class + barrel). */
  damageDice: number;
  /** Reused firearm barrels (a collimator/wave-guide here). */
  barrel: BarrelId;
  heavyBarrel: boolean;
  stock: StockId;
  furniture: FurnitureId[];
  /** Shared firearm receiver features (applied for cost/weight/quickdraw/sig). */
  features: ReceiverFeatureId[];
  /** Energy-weapon-exclusive modifications. */
  mods: EnergyModId[];
  accessories: AccessoryId[];
  powerSource: EnergyPowerSourceId;
  /** Powerpack mass in kg (capacity = power-per-kg × kg ÷ damage dice). */
  powerpackKg: number;
  /** Powerpack power class (≥ weapon output, else Unreliable). */
  powerpackRating: EnergyPowerClass;
  /** Cartridge power class (≥ weapon output, else Unreliable). */
  cartridgeRating: EnergyPowerClass;
  /** Cartridge magazine size in shots. */
  cartridgeCount: number;
  /** Cartridges eject after firing; non-ejecting holders gain Hazardous -2. */
  cartridgeEjects: boolean;
}

/** A weapon design of any class (discriminated by `kind`). */
export type WeaponParams = FirearmParams | EnergyParams;

// --- The derived weapon profile ---------------------------------------------

export interface WeaponProfile {
  tl: number;
  damage: Damage;
  /** Effective range in metres. */
  range: number;
  /** Auto score (0 = none). */
  auto: number;
  /** Recoil score (see Field Catalogue p.32). */
  recoil: number;
  quickdraw: number;
  penetration: number;
  signatureKind: SignatureKind;
  signature: SignatureLevel;
  /** Heat generated per round (RF/VRF weapons only; 0 otherwise). */
  heat: number;
  /** Magazine capacity (rounds). */
  capacity: number;
  traits: Traits;
}

/** A single line of the cost/weight breakdown sheet. */
export interface WeaponLineItem {
  label: string;
  /** Cost contribution in Credits (the running total's delta for this line). */
  costCr: number;
  /** Weight contribution in kilograms. */
  weightKg: number;
  /** Free-text notes for the "Other Factors" column. */
  notes?: string;
}
