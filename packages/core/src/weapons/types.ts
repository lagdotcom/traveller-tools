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

/** The MgT2 rulebooks a piece of data can come from (provenance, for the sheet). */
export type BookSource =
  | 'Core Rulebook'
  | 'High Guard'
  | 'Field Catalogue'
  | 'Central Supply Catalogue';

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

export type StockId = 'none' | 'folding' | 'fixed' | 'full';

/** Rapid-fire capability (beyond an ordinary Auto score). */
export type RapidFireMode = 'none' | 'rf' | 'vrf';

export type FeedId = 'fixed' | 'standard' | 'extended' | 'drum' | 'belt';

/** Receiver features (multi-select; some are mutually exclusive — see rules). */
export type ReceiverFeatureId =
  | 'advancedProjectile'
  | 'accurised'
  | 'bullpup'
  | 'semiBullpup'
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
  | 'partialMultiBarrel'
  // Leveled features: a single id carrying a `level` option (see ReceiverFeatureRef).
  | 'recoilComp'
  | 'disguised'
  | 'lowQuality'
  | 'armoured'
  | 'bulwarked';

/**
 * A selected receiver feature. A bare id is a plain (level-1) feature; the object
 * form carries a `level` for the leveled features (Armoured, Bulwarked, Recoil
 * Compensation, Disguised, Low Quality) — like a ship `ComponentDef`'s options.
 */
export type ReceiverFeatureRef =
  | ReceiverFeatureId
  | { id: ReceiverFeatureId; level: number };

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
  | 'laserDesignator'
  | 'integratedSight'
  | 'holographicSight'
  | 'bayonetLug'
  | 'flashlight'
  | 'gunCamera'
  | 'graviticSupport'
  | 'intelligentWeapon'
  | 'secureWeapon'
  | 'stabilisation';

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

// --- Projector selectable ids (flame / cryo / chemical projectors) ----------

/** Projector frame size (sets max payload, weight %, cost/kg and Blast). */
export type ProjectorStructureId = 'large' | 'compact' | 'hand';
/** Propellant type (sets attacks-per-kg and effective range). */
export type ProjectorPropellantId =
  | 'compressed'
  | 'supercompressed'
  | 'generated';
/** Fuel type (sets the damage/effect each attack delivers). */
export type ProjectorFuelId =
  | 'liquid'
  | 'jellied'
  | 'irritant'
  | 'suppressant'
  | 'battlechem'
  | 'advanced'
  | 'cryogenic';

// --- Launcher selectable ids (grenade / rocket / missile launchers) ---------

/** Launcher receiver (tube, reusable or field), from the FC receiver tables. */
export type LauncherReceiverId =
  | 'tubeSingleLight'
  | 'tubeSingleStandard'
  | 'tubeSemiLight'
  | 'tubeSemiStandard'
  | 'tubeSupportLight'
  | 'tubeSupportStandard'
  | 'reuseSingleLight'
  | 'reuseSingleHeavy'
  | 'reuseMagLight'
  | 'reuseMagHeavy'
  | 'fieldLight2'
  | 'fieldLight4'
  | 'fieldHeavy2'
  | 'fieldHeavy4';

/** Loaded warhead/munition (sets the fired profile; bought separately). */
/** How a launcher delivers its warhead (sets range + cost/weight of the round). */
export type DeliveryId = 'rifleGrenade' | 'cartridge' | 'ram' | 'rpg';

/** A self-contained missile round (fired from a reusable / field launcher). */
export type MissileWarheadId = 'av7';

/** One loaded launcher warhead: a Grenade Weapons payload + optional delivery override. */
export interface LauncherWarhead {
  type: GrenadeTypeId;
  /** Overrides the launcher's default `delivery` (omitted = use the default). */
  delivery?: DeliveryId;
}

// --- Grenade selectable ids (thrown grenades) -------------------------------

/** Thrown-grenade payload type, from the FC "Grenade Weapons" table. */
export type GrenadeTypeId =
  | 'aerosolAntilaser'
  | 'aerosolCorrosive'
  | 'antiArmour'
  | 'battlechem'
  | 'baton'
  | 'breacher'
  | 'corrosive'
  | 'cryogenic'
  | 'distraction'
  | 'emp'
  | 'empAdvanced'
  | 'fireSuppression'
  | 'fragmentation'
  | 'gasIncapacitant'
  | 'gasToxin'
  | 'incendiaryAntipersonnel'
  | 'incendiaryDemolition'
  | 'microgrenade'
  | 'multipleProjectile'
  | 'plasma'
  | 'plasmaAntiArmour'
  | 'smoke'
  | 'stun';

/** Grenade body size (some payloads aren't made as mini-grenades). */
export type GrenadeSizeId = 'mini' | 'hand';

// --- User-facing parameters -------------------------------------------------

/** Discriminates the weapon class so `WeaponParams` is a tagged union. */
export type WeaponClass =
  | 'firearm'
  | 'energy'
  | 'projector'
  | 'launcher'
  | 'grenade';

export interface FirearmParams {
  /** Conventional slug-thrower (the original/default class). */
  kind: 'firearm';
  /** Tech level the weapon is built at (gates components, sets some traits). */
  tl: number;
  receiver: ReceiverTypeId;
  /**
   * The calibre. Gauss is implied by the calibre (the gauss calibres carry a
   * `gauss` flag) rather than being a separate field — a gauss receiver can only
   * fire gauss projectiles and vice-versa.
   */
  calibre: CalibreId;
  mechanism: MechanismId;
  /** Extra Auto bought on a burst/full-auto receiver (Increased Auto table). */
  autoIncrease: number;
  /**
   * Rapid-Fire capability layered on a high Auto score: RF (needs Auto ≥4) or VRF
   * (Auto ≥6). Multiplies receiver cost/weight, adds extra damage dice + AP +
   * Bulky/Very Bulky, and greatly increases Heat.
   */
  rapidFire: RapidFireMode;
  features: ReceiverFeatureRef[];
  barrel: BarrelId;
  /** Heavy-profile barrel (doubles barrel weight & cost). */
  heavyBarrel: boolean;
  /**
   * Extra barrels beyond the first (multi-barrel weapons). Each is bought at the
   * barrel's cost and adds half its weight + Quickdraw −1; without the
   * `partialMultiBarrel` feature each also adds 10% of the receiver cost/weight.
   */
  additionalBarrels: number;
  stock: StockId;
  furniture: FurnitureId[];
  feed: FeedId;
  /**
   * Actual magazine size as a percentage of base capacity (50–150). Retained as
   * the fallback for the standard magazine when `magazines` is not given.
   */
  capacityPct: number;
  /**
   * The interchangeable magazine options the weapon is sold with. The **first**
   * is the standard magazine, baked into the build cost/weight (its `pct` is the
   * effective `capacityPct`); the rest are alternative magazines, each shown as
   * its own capacity / reload / loaded-weight row. Absent ≡ a single standard
   * magazine derived from `capacityPct`.
   */
  magazines?: MagazineSpec[];
  accessories: AccessoryId[];
  /**
   * Ammunition types the weapon is shown firing — one profile row per type (the
   * first is the primary). The build cost/weight is the same for all; only the
   * derived profile and reload price differ. Empty falls back to ball.
   */
  ammo: AmmoTypeId[];
  /**
   * An optional secondary weapon (e.g. an under-barrel shotgun). It is designed
   * as its own weapon and fires independently; mounting it costs and weighs 10%
   * of the secondary's values, added to this weapon's totals. The secondary gets
   * its own profile line.
   */
  secondary?: SecondaryWeaponParams;
}

/** A secondary weapon: a firearm spec without its own class tag or secondary. */
export type SecondaryWeaponParams = Omit<FirearmParams, 'kind' | 'secondary'>;

/**
 * One magazine option. The FC bakes a *standard* magazine into the weapon's
 * loaded weight/cost (via the capacity % rule); alternative magazines are sold
 * separately. Capacity is normally a percentage of base, but the book sometimes
 * prints an absolute round count or magazine price that doesn't derive cleanly —
 * `rounds`/`costCr` are manual overrides for those listed values.
 */
export interface MagazineSpec {
  /** Display name (e.g. "Standard", "Drum", "Extended"). Defaults to the ammo. */
  label?: string;
  /**
   * The ammunition the magazine is loaded with — its reload price is computed
   * from this type (and it labels the row). Defaults to the weapon's primary
   * ammo. A magazine that embeds a type also fixes that type's reload price on
   * the matching profile row.
   */
  ammo?: AmmoTypeId;
  /** Capacity as a % of base (50–150). Ignored when `rounds` is given. */
  pct?: number;
  /** Absolute round count — a manual override for a book-listed magazine size. */
  rounds?: number;
  /** Manual reload-price override (Cr) for a book-listed magazine cost. */
  costCr?: number;
}

/**
 * One power-source option for an energy weapon — a rechargeable powerpack (sized
 * in kg) or a holder of disposable cartridges. Listed as alternatives beyond the
 * weapon's primary source (e.g. the M-84's internal / belt / backpack packs).
 */
export type PackSpec =
  | {
      kind: 'powerpack';
      label?: string;
      /** Powerpack mass in kg (shots = power-per-kg × kg ÷ damage dice). */
      kg: number;
      rating: EnergyPowerClass;
    }
  | {
      kind: 'cartridge';
      label?: string;
      /** Number of cartridges in the holder. */
      count: number;
      rating: EnergyPowerClass;
    };

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
  features: ReceiverFeatureRef[];
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
  /**
   * Alternative power sources beyond the primary one (defined by the fields
   * above). Each is shown as its own shots / reload / weight row — e.g. a weapon
   * sold with internal, belt and backpack packs.
   */
  packs?: PackSpec[];
}

/**
 * A Projector (flamethrower / cryo / chemical sprayer). Built from a frame
 * (Structure), a Propellant and a Fuel; the designer chooses how many kg of each
 * to carry as payload. Damage comes from the fuel, range from the propellant, and
 * the number of attacks from whichever of the two runs out first.
 */
export interface ProjectorParams {
  kind: 'projector';
  tl: number;
  structure: ProjectorStructureId;
  propellant: ProjectorPropellantId;
  fuel: ProjectorFuelId;
  /** Kilograms of fuel carried (1kg = 1 attack). */
  fuelKg: number;
  /** Kilograms of propellant carried (attacks = kg × attacks-per-kg). */
  propellantKg: number;
  /**
   * Receiver features — projectors take the capability features (Armoured /
   * Bulwarked) from the shared list, applied as a multiplicative cost/weight chain.
   */
  features: ReceiverFeatureRef[];
  /** An optional mounted secondary weapon (e.g. the Cryojet's breaching shotgun). */
  secondary?: SecondaryWeaponParams;
}

/**
 * A Launcher (grenade / rocket / missile). The weapon itself is essentially the
 * receiver (+ optional guidance and magazine); its effect comes from the loaded
 * warhead, which is bought separately and only shapes the displayed profile.
 */
export interface LauncherParams {
  kind: 'launcher';
  tl: number;
  receiver: LauncherReceiverId;
  /**
   * Receiver features (Lightweight, Bullpup, …), applied as a multiplicative
   * chain off the base receiver — exactly as on a firearm.
   */
  features: ReceiverFeatureRef[];
  /** Barrel fitted to the launcher (a % of the modified-receiver baseline). */
  barrel: BarrelId;
  /** Stock fitted to the launcher (a % of the modified-receiver baseline). */
  stock: StockId;
  /** Adds a guidance system (+50% receiver cost) for guided munitions. */
  guidance: boolean;
  /** Magazine size for "varies"-capacity (support) launchers. */
  magazineSize: number;
  /**
   * Loaded warhead — a payload drawn from the Grenade Weapons table (shared with
   * thrown grenades), at the chosen body size, shaping the displayed profile.
   */
  /**
   * Loaded warheads — payloads drawn from the Grenade Weapons table (shared with
   * thrown grenades), at the launcher's `warheadSize`. Like a firearm's `ammo`
   * list, the build is fixed and each yields its own profile row; the first is the
   * primary. Each may override the launcher's `delivery` (a tube can fire e.g. a
   * RAM round and cartridge rounds), else it uses the launcher-level one.
   */
  warheads: LauncherWarhead[];
  warheadSize: GrenadeSizeId;
  /** Default delivery (cartridge / RAM / RPG) — per-warhead `delivery` overrides it. */
  delivery: DeliveryId;
  /**
   * Loaded missiles (from `MISSILE_WARHEADS`). When non-empty, the launcher fires
   * these complete self-contained rounds — their own profile/cost/weight — instead
   * of grenade payloads, and `warheads`/`delivery` are ignored. Needs a missile-
   * capable (reusable / field) receiver.
   */
  missiles?: MissileWarheadId[];
}

/**
 * A thrown Grenade. There's no construction to do — a grenade is a catalogue
 * item — so the "design" is simply a payload type and a body size.
 */
export interface GrenadeParams {
  kind: 'grenade';
  tl: number;
  type: GrenadeTypeId;
  size: GrenadeSizeId;
}

/** A weapon design of any class (discriminated by `kind`). */
export type WeaponParams =
  | FirearmParams
  | EnergyParams
  | ProjectorParams
  | LauncherParams
  | GrenadeParams;

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
  /** Heat generated per (auto)fire round (0 if the weapon doesn't autofire). */
  heat: number;
  /** Heat dissipated per idle round (receiver + heavy barrel + cooling + barrels). */
  heatDissipation?: number;
  /** Overheating threshold: at/above this Heat, firing risks a malfunction. */
  heatThreshold?: number;
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
  /**
   * Display override for the cost column — e.g. a percentage modifier ("+25%")
   * for a component that scales the receiver rather than adding a flat Credit
   * amount. The sheet shows this instead of the raw `costCr` when present.
   */
  costMod?: string;
  /** Display override for the weight column (see `costMod`). */
  weightMod?: string;
  /** Free-text notes for the "Other Factors" column. */
  notes?: string;
}
