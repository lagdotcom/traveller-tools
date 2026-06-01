/**
 * Weapon library: a complete default loadout, tolerant (de)serialization with a
 * versioned envelope, and the user's worked examples as built-in designs (which
 * double as the test oracle in `weapon.test.ts`). Mirrors `ships/library.ts`.
 */
import {
  ACCESSORIES,
  AMMO_TYPES,
  BARRELS,
  CALIBRES,
  FEEDS,
  FURNITURE,
  MECHANISMS,
  RECEIVER_FEATURES,
  RECEIVERS,
  STOCKS,
} from './data.js';
import {
  ENERGY_MODS,
  ENERGY_POWER_CLASS_DICE,
  ENERGY_RECEIVERS,
  ENERGY_WEAPON_TYPE_LABEL,
} from './energyData.js';
import { GRENADES } from './grenadeData.js';
import {
  DELIVERY_SYSTEMS,
  LAUNCHER_RECEIVERS,
  WARHEADS,
} from './launcherData.js';
import {
  PROJECTOR_FUELS,
  PROJECTOR_PROPELLANTS,
  PROJECTOR_STRUCTURES,
} from './projectorData.js';
import type {
  AccessoryId,
  AmmoTypeId,
  BarrelId,
  CalibreId,
  DeliveryId,
  EnergyModId,
  EnergyParams,
  EnergyPowerClass,
  EnergyPowerSourceId,
  EnergyReceiverId,
  EnergyWeaponTypeId,
  FeedId,
  FirearmParams,
  FurnitureId,
  GrenadeParams,
  GrenadeSizeId,
  GrenadeTypeId,
  LauncherParams,
  LauncherReceiverId,
  MechanismId,
  ProjectorFuelId,
  ProjectorParams,
  ProjectorPropellantId,
  ProjectorStructureId,
  RapidFireMode,
  ReceiverFeatureId,
  ReceiverFeatureRef,
  ReceiverTypeId,
  SecondaryWeaponParams,
  StockId,
  WarheadId,
  WeaponParams,
} from './types.js';

/** A named weapon design: parameters plus presentation metadata. */
export interface WeaponDefinition {
  name: string;
  description?: string;
  params: WeaponParams;
}

export const WEAPON_FORMAT = 'traveller-tools/weapon';
export const WEAPON_FORMAT_VERSION = 1;
export interface WeaponDocument {
  format: typeof WEAPON_FORMAT;
  version: number;
  weapon: WeaponDefinition;
}

/** A valid starting design: a TL8 semi-automatic intermediate-rifle carbine. */
export const DEFAULT_WEAPON_PARAMS: FirearmParams = {
  kind: 'firearm',
  tl: 8,
  receiver: 'longarm',
  calibre: 'intermediateRifle',
  mechanism: 'semiAuto',
  autoIncrease: 0,
  rapidFire: 'none',
  features: [],
  barrel: 'rifle',
  heavyBarrel: false,
  additionalBarrels: 0,
  stock: 'none',
  furniture: [],
  feed: 'standard',
  capacityPct: 100,
  accessories: [],
  ammo: ['ball'],
};

/** A valid starting energy design: a TL10 Small (Light) laser carbine. */
export const DEFAULT_ENERGY_PARAMS: EnergyParams = {
  kind: 'energy',
  tl: 10,
  weaponType: 'laser',
  receiver: 'small',
  damageDice: 3,
  barrel: 'rifle',
  heavyBarrel: false,
  stock: 'full',
  furniture: [],
  features: [],
  mods: [],
  accessories: [],
  powerSource: 'powerpack',
  powerpackKg: 1,
  powerpackRating: 'light',
  cartridgeRating: 'light',
  cartridgeCount: 20,
  cartridgeEjects: true,
};

/** A valid starting projector: a TL5 Compact jellied-fuel flamethrower. */
export const DEFAULT_PROJECTOR_PARAMS: ProjectorParams = {
  kind: 'projector',
  tl: 5,
  structure: 'compact',
  propellant: 'compressed',
  fuel: 'jellied',
  fuelKg: 4,
  propellantKg: 2,
  features: [],
};

/** A valid starting launcher: a TL6 single-shot light tube grenade launcher. */
export const DEFAULT_LAUNCHER_PARAMS: LauncherParams = {
  kind: 'launcher',
  tl: 6,
  receiver: 'tubeSingleLight',
  features: [],
  // A bare tube launcher's tube is integral — no separate barrel/stock by default.
  barrel: 'minimal',
  stock: 'none',
  guidance: false,
  magazineSize: 6,
  warhead: 'fragmentation',
  delivery: 'cartridge',
};

/** A valid starting grenade: a TL6 Hand fragmentation grenade. */
export const DEFAULT_GRENADE_PARAMS: GrenadeParams = {
  kind: 'grenade',
  tl: 6,
  type: 'fragmentation',
  size: 'hand',
};

// --- Validation helpers (shape-matched to ships/library.ts) -----------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

function pick<T extends string>(
  v: unknown,
  allowed: Record<T, unknown>,
  fallback: T,
): T {
  return typeof v === 'string' && v in allowed ? (v as T) : fallback;
}

/** Coerce an array of ids, dropping anything not in the catalog. */
function pickList<T extends string>(
  v: unknown,
  allowed: Record<T, unknown>,
): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is T => typeof x === 'string' && x in allowed);
}

/**
 * Coerce a feature list, accepting both bare ids and `{id, level}` objects.
 * Canonicalises to a bare id for plain features and `{id, level}` (clamped to the
 * feature's level range) for leveled ones, dropping anything unknown.
 */
function normalizeFeatures(v: unknown): ReceiverFeatureRef[] {
  if (!Array.isArray(v)) return [];
  const out: ReceiverFeatureRef[] = [];
  for (const item of v) {
    const id =
      typeof item === 'string'
        ? item
        : isObject(item) && typeof item.id === 'string'
          ? item.id
          : undefined;
    if (!id || !(id in RECEIVER_FEATURES)) continue;
    const def = RECEIVER_FEATURES[id as ReceiverFeatureId];
    if (!def.levels) {
      out.push(id as ReceiverFeatureId);
    } else {
      const raw = isObject(item) ? num(item.level, 1) : 1;
      const level = Math.max(1, Math.min(def.levels.length, Math.floor(raw)));
      out.push({ id: id as ReceiverFeatureId, level });
    }
  }
  return out;
}

/** Coerce ammunition into a non-empty list, tolerating a legacy single string. */
function normalizeAmmo(v: unknown, fallback: AmmoTypeId[]): AmmoTypeId[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out = arr.filter(
    (x): x is AmmoTypeId => typeof x === 'string' && x in AMMO_TYPES,
  );
  return out.length ? out : fallback;
}

const POWER_CLASSES = ENERGY_POWER_CLASS_DICE;
const POWER_SOURCES = { powerpack: 0, cartridge: 0 };

/** Coerce arbitrary parsed JSON into a complete, valid FirearmParams. */
function normalizeFirearmParams(p: Record<string, unknown>): FirearmParams {
  const d = DEFAULT_WEAPON_PARAMS;
  return {
    kind: 'firearm',
    tl: num(p.tl, d.tl),
    receiver: pick<ReceiverTypeId>(p.receiver, RECEIVERS, d.receiver),
    calibre: pick<CalibreId>(p.calibre, CALIBRES, d.calibre),
    mechanism: pick<MechanismId>(p.mechanism, MECHANISMS, d.mechanism),
    autoIncrease: num(p.autoIncrease, d.autoIncrease),
    rapidFire: pick<RapidFireMode>(
      p.rapidFire,
      { none: 0, rf: 0, vrf: 0 },
      d.rapidFire,
    ),
    features: normalizeFeatures(p.features),
    barrel: pick<BarrelId>(p.barrel, BARRELS, d.barrel),
    heavyBarrel: bool(p.heavyBarrel, d.heavyBarrel),
    additionalBarrels: num(p.additionalBarrels, d.additionalBarrels),
    stock: pick<StockId>(p.stock, STOCKS, d.stock),
    furniture: pickList<FurnitureId>(p.furniture, FURNITURE),
    feed: pick<FeedId>(p.feed, FEEDS, d.feed),
    capacityPct: num(p.capacityPct, d.capacityPct),
    accessories: pickList<AccessoryId>(p.accessories, ACCESSORIES),
    ammo: normalizeAmmo(p.ammo, d.ammo),
    // A secondary weapon (one level deep — its own `secondary` is dropped).
    ...(isObject(p.secondary)
      ? { secondary: normalizeSecondaryParams(p.secondary) }
      : {}),
  };
}

/** Normalize a nested secondary weapon (a firearm without kind/secondary). */
function normalizeSecondaryParams(
  p: Record<string, unknown>,
): SecondaryWeaponParams {
  const f = normalizeFirearmParams(p);
  return {
    tl: f.tl,
    receiver: f.receiver,
    calibre: f.calibre,
    mechanism: f.mechanism,
    autoIncrease: f.autoIncrease,
    rapidFire: f.rapidFire,
    features: f.features,
    barrel: f.barrel,
    heavyBarrel: f.heavyBarrel,
    additionalBarrels: f.additionalBarrels,
    stock: f.stock,
    furniture: f.furniture,
    feed: f.feed,
    capacityPct: f.capacityPct,
    accessories: f.accessories,
    ammo: f.ammo,
  };
}

/** Coerce arbitrary parsed JSON into a complete, valid EnergyParams. */
function normalizeEnergyParams(p: Record<string, unknown>): EnergyParams {
  const d = DEFAULT_ENERGY_PARAMS;
  return {
    kind: 'energy',
    tl: num(p.tl, d.tl),
    weaponType: pick<EnergyWeaponTypeId>(
      p.weaponType,
      ENERGY_WEAPON_TYPE_LABEL,
      d.weaponType,
    ),
    receiver: pick<EnergyReceiverId>(p.receiver, ENERGY_RECEIVERS, d.receiver),
    damageDice: num(p.damageDice, d.damageDice),
    barrel: pick<BarrelId>(p.barrel, BARRELS, d.barrel),
    heavyBarrel: bool(p.heavyBarrel, d.heavyBarrel),
    stock: pick<StockId>(p.stock, STOCKS, d.stock),
    furniture: pickList<FurnitureId>(p.furniture, FURNITURE),
    features: normalizeFeatures(p.features),
    mods: pickList<EnergyModId>(p.mods, ENERGY_MODS),
    accessories: pickList<AccessoryId>(p.accessories, ACCESSORIES),
    powerSource: pick<EnergyPowerSourceId>(
      p.powerSource,
      POWER_SOURCES,
      d.powerSource,
    ),
    powerpackKg: num(p.powerpackKg, d.powerpackKg),
    powerpackRating: pick<EnergyPowerClass>(
      p.powerpackRating,
      POWER_CLASSES,
      d.powerpackRating,
    ),
    cartridgeRating: pick<EnergyPowerClass>(
      p.cartridgeRating,
      POWER_CLASSES,
      d.cartridgeRating,
    ),
    cartridgeCount: num(p.cartridgeCount, d.cartridgeCount),
    cartridgeEjects: bool(p.cartridgeEjects, d.cartridgeEjects),
  };
}

/** Coerce arbitrary parsed JSON into a complete, valid ProjectorParams. */
function normalizeProjectorParams(p: Record<string, unknown>): ProjectorParams {
  const d = DEFAULT_PROJECTOR_PARAMS;
  return {
    kind: 'projector',
    tl: num(p.tl, d.tl),
    structure: pick<ProjectorStructureId>(
      p.structure,
      PROJECTOR_STRUCTURES,
      d.structure,
    ),
    propellant: pick<ProjectorPropellantId>(
      p.propellant,
      PROJECTOR_PROPELLANTS,
      d.propellant,
    ),
    fuel: pick<ProjectorFuelId>(p.fuel, PROJECTOR_FUELS, d.fuel),
    fuelKg: num(p.fuelKg, d.fuelKg),
    propellantKg: num(p.propellantKg, d.propellantKg),
    features: normalizeFeatures(p.features),
    ...(isObject(p.secondary)
      ? { secondary: normalizeSecondaryParams(p.secondary) }
      : {}),
  };
}

/** Coerce arbitrary parsed JSON into a complete, valid LauncherParams. */
function normalizeLauncherParams(p: Record<string, unknown>): LauncherParams {
  const d = DEFAULT_LAUNCHER_PARAMS;
  return {
    kind: 'launcher',
    tl: num(p.tl, d.tl),
    receiver: pick<LauncherReceiverId>(
      p.receiver,
      LAUNCHER_RECEIVERS,
      d.receiver,
    ),
    features: normalizeFeatures(p.features),
    barrel: pick<BarrelId>(p.barrel, BARRELS, d.barrel),
    stock: pick<StockId>(p.stock, STOCKS, d.stock),
    guidance: bool(p.guidance, d.guidance),
    magazineSize: num(p.magazineSize, d.magazineSize),
    warhead: pick<WarheadId>(p.warhead, WARHEADS, d.warhead),
    delivery: pick<DeliveryId>(p.delivery, DELIVERY_SYSTEMS, d.delivery),
  };
}

/** Coerce arbitrary parsed JSON into a complete, valid GrenadeParams. */
function normalizeGrenadeParams(p: Record<string, unknown>): GrenadeParams {
  const d = DEFAULT_GRENADE_PARAMS;
  return {
    kind: 'grenade',
    tl: num(p.tl, d.tl),
    type: pick<GrenadeTypeId>(p.type, GRENADES, d.type),
    size: pick<GrenadeSizeId>(p.size, { mini: 0, hand: 0 }, d.size),
  };
}

/** Coerce arbitrary parsed JSON into a complete, valid WeaponParams. Never throws. */
export function normalizeWeaponParams(input: unknown): WeaponParams {
  const p = isObject(input) ? input : {};
  // Legacy documents (no `kind`) are conventional firearms.
  switch (p.kind) {
    case 'energy':
      return normalizeEnergyParams(p);
    case 'projector':
      return normalizeProjectorParams(p);
    case 'launcher':
      return normalizeLauncherParams(p);
    case 'grenade':
      return normalizeGrenadeParams(p);
    default:
      return normalizeFirearmParams(p);
  }
}

// --- Serialize / parse ------------------------------------------------------

export function serializeWeapon(def: WeaponDefinition): string {
  const doc: WeaponDocument = {
    format: WEAPON_FORMAT,
    version: WEAPON_FORMAT_VERSION,
    weapon: {
      name: def.name,
      ...(def.description ? { description: def.description } : {}),
      params: normalizeWeaponParams(def.params),
    },
  };
  return JSON.stringify(doc, null, 2);
}

export function parseWeapon(text: string): WeaponDefinition {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!isObject(data)) throw new Error('Expected a weapon object.');
  const weapon: Record<string, unknown> = isObject(data.weapon)
    ? data.weapon
    : data;
  const params = 'params' in weapon ? weapon.params : weapon;
  const name =
    typeof weapon.name === 'string' && weapon.name.trim()
      ? weapon.name.trim()
      : 'Imported Weapon';
  return {
    name,
    ...(typeof weapon.description === 'string'
      ? { description: weapon.description }
      : {}),
    params: normalizeWeaponParams(params),
  };
}

// --- Built-in weapons (the worked FC examples) -----------------

function weapon(
  name: string,
  description: string,
  overrides: Partial<FirearmParams>,
): WeaponDefinition {
  return {
    name,
    description,
    params: { ...DEFAULT_WEAPON_PARAMS, ...overrides },
  };
}

function energyWeapon(
  name: string,
  description: string,
  overrides: Partial<EnergyParams>,
): WeaponDefinition {
  return {
    name,
    description,
    params: { ...DEFAULT_ENERGY_PARAMS, ...overrides },
  };
}

function projector(
  name: string,
  description: string,
  overrides: Partial<ProjectorParams>,
): WeaponDefinition {
  return {
    name,
    description,
    params: { ...DEFAULT_PROJECTOR_PARAMS, ...overrides },
  };
}

function launcher(
  name: string,
  description: string,
  overrides: Partial<LauncherParams>,
): WeaponDefinition {
  return {
    name,
    description,
    params: { ...DEFAULT_LAUNCHER_PARAMS, ...overrides },
  };
}

// function grenade(
//   name: string,
//   description: string,
//   overrides: Partial<GrenadeParams>,
// ): WeaponDefinition {
//   return {
//     name,
//     description,
//     params: { ...DEFAULT_GRENADE_PARAMS, ...overrides },
//   };
// }

export const BUILTIN_WEAPONS: WeaponDefinition[] = [
  weapon('Generic 6 Revolver', 'Medium-calibre repeater revolver', {
    tl: 6,
    receiver: 'handgun',
    calibre: 'mediumHandgun',
    mechanism: 'repeater',
    barrel: 'handgun',
    stock: 'none',
    capacityPct: 120,
  }),
  weapon('Compact PDW', 'Light-handgun personal defence weapon', {
    tl: 8,
    receiver: 'assault',
    calibre: 'lightHandgun',
    mechanism: 'fullAuto',
    autoIncrease: 1,
    features: ['compact'],
    barrel: 'handgun',
    stock: 'none',
    capacityPct: 70,
  }),
  weapon('Civilian Shotgun', 'Single-shot double-barrel light smoothbore', {
    tl: 4,
    receiver: 'longarm',
    calibre: 'lightSmoothbore',
    mechanism: 'singleShot',
    features: ['partialMultiBarrel'],
    barrel: 'rifle',
    stock: 'full',
    additionalBarrels: 1,
    ammo: ['ball'],
  }),
  weapon('13mm Crunch Gun', 'Anti-materiel repeater with a very long barrel', {
    tl: 4,
    receiver: 'lsw',
    calibre: 'antiMateriel',
    mechanism: 'repeater',
    capacityPct: 50,
    barrel: 'veryLong',
    stock: 'full',
    furniture: ['bipod'],
    accessories: ['scope'],
    // Listed firing ball, explosive, incendiary and advanced AP (the latter
    // three carry their own TL availability, flagged as warnings on a TL4 build).
    ammo: ['ball', 'explosive', 'incendiary', 'apAdvanced'],
  }),
  weapon('Flintlock Jazail', 'Long-barrelled archaic black-powder rifle', {
    tl: 3,
    receiver: 'longarm',
    calibre: 'archaicRifle',
    mechanism: 'singleShot',
    barrel: 'rifle',
    stock: 'full',
    ammo: ['ball'],
    // Representative build (no FC worksheet). A book jazail (a smoothbore) would
    // read ~3D-2 / Inaccurate -1 / Lo-Pen 3; this archaic-rifle build gives 3D-3
    // and no Inaccurate.
  }),
  // reconcile: the worked Adjudicator lists its Handgun barrel at 0.12kg, which
  // is 15% of the 0.8kg receiver — the barrel's *cost* fraction. The FC barrel
  // table gives a Handgun barrel 20% weight (→ 0.16kg here), matching the
  // Bodyguard worksheet's rifle barrel, so we follow the rules table (0.16kg)
  // and treat the worksheet's 0.12kg as using the cost figure by mistake.
  weapon('Adjudicator', 'Small-smoothbore revolver, Ailene Armament', {
    tl: 7,
    receiver: 'handgun',
    calibre: 'smallSmoothbore',
    mechanism: 'repeater',
    barrel: 'handgun',
    stock: 'none',
    ammo: ['ball', 'pellet', 'flechette', 'explosive'],
  }),
  weapon('GA-100', 'Gauss-shotgun bullpup assault weapon, Anhur Industries', {
    tl: 13,
    receiver: 'assault',
    calibre: 'gaussShotgun',
    mechanism: 'fullAuto',
    features: ['bullpup', 'quickdraw', 'highCapacity'],
    capacityPct: 130,
    barrel: 'assault',
    stock: 'full',
    // reconcile: 3D+5 and AP 4 reproduce; magazine reads Cr34.5 vs the book's
    // Cr55 (gauss-shotgun ammo cost).
  }),
  weapon('GC-24', 'Gauss handgun, Anhur Industries', {
    tl: 13,
    receiver: 'handgun',
    calibre: 'smallGauss',
    mechanism: 'burst',
    features: ['veryCompact', 'lightweight'],
    autoIncrease: 2,
    capacityPct: 120,
    barrel: 'short',
    // reconcile: weight (0.7744kg), AP 3 and Emissions (low) reproduce; receiver
    // cost reads Cr1212.75 vs the book's Cr808.5 (unresolved).
  }),
  weapon('GS-40', 'Gauss sidearm, Anhur Industries', {
    tl: 13,
    receiver: 'handgun',
    calibre: 'smallGauss',
    mechanism: 'burst',
    barrel: 'handgun',
    // AP 3 and Emissions (low) reproduce.
  }),
  weapon(
    'Stowaway',
    'Extreme-stealth full-auto body pistol, Colvery Solutions',
    {
      tl: 12,
      receiver: 'handgun',
      calibre: 'lightHandgun',
      mechanism: 'fullAuto',
      autoIncrease: 3,
      features: ['veryCompact', 'stealthExtreme'],
      barrel: 'short',
      stock: 'none',
    },
  ),
  weapon(
    'Liberator Derringer',
    'Heavy-handgun multi-barrel hold-out, Hangul Arms and Tactical',
    {
      tl: 7,
      receiver: 'handgun',
      calibre: 'heavyHandgun',
      mechanism: 'repeater',
      features: ['partialMultiBarrel'],
      barrel: 'minimal',
      stock: 'none',
      additionalBarrels: 3, // '3x Extra Barrel, Minimal'
      ammo: ['lowPenetration', 'heap'],
      // reconcile: Quickdraw +12, Lo-Pen 3, Slow Loader 4
      // TODO: Liberator Defender variant: short smg, supports ball/distraction/explosive
    },
  ),
  weapon(
    'Bodyguard Shotgun',
    'Standard-smoothbore repeater longarm, Harrix Industries',
    {
      tl: 8,
      receiver: 'longarm',
      calibre: 'standardSmoothbore',
      mechanism: 'repeater',
      barrel: 'rifle',
      stock: 'full',
      accessories: ['laserPointer'],
      ammo: ['ball', 'pellet'],
      // reconcile: Bulky now reproduces (smoothbore Recoil table); Physical
      // Signature reads high vs the book's normal (smoothbore signature).
      // TODO Pointguard variant: shorter, no stock - TL10, 125m range, 3.25Kg, Cr180, Mag 3 (Cr4.5), Quickdraw +2, pellet only
    },
  ),
  weapon('Standard', 'Safety-conscious carbine, Interstellar Ordnance', {
    tl: 9,
    receiver: 'longarm',
    calibre: 'lightRifle',
    mechanism: 'semiAuto',
    features: [
      'bullpup',
      'compact',
      'rugged',
      'lightweight',
      { id: 'bulwarked', level: 2 },
    ],
    barrel: 'carbine',
    stock: 'full',
    accessories: ['scope'],
    // reconcile: (thinks Bullpup is +20% cost?), Mag Cost Cr30, Damage 2D, Physical Signature (normal)
  }),
  weapon('Mk 1 Handgun', 'Generic early semi-automatic pistol', {
    tl: 5,
    receiver: 'handgun',
    calibre: 'heavyHandgun',
    mechanism: 'semiAuto',
    barrel: 'handgun',
    // reconcile: does not list Bulky or Lo-Pen 2
    // TODO: suppressed variant, Cr415, Quickdraw +5, Lo-Pen 2, Phys Sig (small)
  }),
  weapon('Posi-9', 'Upmarket semi-auto pistol, Tacload Armaments', {
    tl: 9,
    receiver: 'handgun',
    calibre: 'mediumHandgun',
    mechanism: 'semiAuto',
    capacityPct: 150,
    features: ['advancedProjectile'],
    barrel: 'handgun',
    // reconcile: Physical Signature (normal)
    // TODO: burst and auto variants
  }),
  weapon('Crewmate', 'Vehicle defense weapon, Tactical Systems Incorporated', {
    tl: 7,
    receiver: 'handgun',
    calibre: 'intermediateRifle',
    mechanism: 'fullAuto',
    features: ['semiBullpup', 'rugged'],
    autoIncrease: 1,
    barrel: 'handgun',
    accessories: ['scope'],
    // Semi-Bullpup (+20% cost, +2 Quickdraw) and Lo-Pen 2 both reproduce.
  }),
  weapon('Desperado', 'Generic assault submachinegun', {
    tl: 5,
    receiver: 'assault',
    calibre: 'mediumHandgun',
    mechanism: 'fullAuto',
    barrel: 'assault',
    stock: 'full',
    // reconcile: no Lo-Pen reproduces; the book's Desperado also lists Inaccurate
    // -1 (not modelled) and seems to charge +10% for full-auto, not the +20% rule.
  }),
  weapon('Eliminator', 'Extreme close quarters smg', {
    tl: 9,
    receiver: 'assault',
    calibre: 'lightHandgun',
    mechanism: 'fullAuto',
    autoIncrease: 1,
    features: ['compact', { id: 'recoilComp', level: 2 }, 'lightweight'],
    barrel: 'assault',
    stock: 'folding',
    ammo: ['ball', 'apAdvanced', 'enhancedWounding'],
    // reconcile: no Lo-Pen reproduces; still off — receiver weight 1.25 vs the
    // book's 2.079kg, Mag 18 vs 24 (the book ignores the Compact penalty), and
    // Physical Signature low vs normal.
  }),
  weapon('IAW-12', 'Infantry Assault Weapon, Interstellar Ordnance', {
    tl: 12,
    receiver: 'assault',
    calibre: 'smallGauss',
    mechanism: 'fullAuto',
    features: ['quickdraw', 'highCapacity'],
    autoIncrease: 1,
    barrel: 'assault',
    accessories: ['laserPointer'],
    // reconcile: Damage 3D-1, AP 4 and Emissions (low) reproduce; the book
    // worksheet oddly charges 15% for 'No Stock'.
  }),
  weapon(
    'Planetsider',
    'Starship crew security weapon, Unified Space Industries',
    {
      tl: 9,
      receiver: 'assault',
      calibre: 'heavyHandgun',
      mechanism: 'fullAuto',
      features: [
        'highCapacity',
        'rugged',
        'advancedProjectile',
        'bullpup',
        'quickdraw',
      ],
      capacityPct: 150,
      barrel: 'carbine',
      stock: 'full',
      accessories: ['scope', 'laserPointer'],
      // reconcile: 'Heavy Handgun ammo' adds +15% weight but no cost
      // reconcile: Receiver Totals Cr1264, 3.13kg
      // reconcile: Range 55m, Quickdraw +5, no Lo-Pen
      // extra thing: "For those who require more firepower a 40-round casket magazine is available for Cr40 and a 70-round drum costs Cr100. The latter is heavy and awkward to use,and eliminates many of the weapon’s quick-reaction advantages. With any kind of magazine in place the Planetsider's weight absorbs recoil well, removing the Bulky trait."
    },
  ),
  weapon('GR-80', 'Gauss rifle, Anhur Industries', {
    tl: 13,
    receiver: 'longarm',
    calibre: 'standardGauss',
    mechanism: 'fullAuto',
    features: ['bullpup'],
    barrel: 'carbine',
    stock: 'full',
    accessories: ['multispectralScope'],
    // reconcile: Emissions (low) reproduces; AP reads 5 vs the book's 3 (standard
    // gauss AP) — and the book calls it both GR-80 and GR-90.
    // extra thing: "In addition to the standard GR-90, a light support variant is offered, built on the same receiver but using a heavy, heat-dissipating barrel. This is significantly longer than the standard carbine barrel, but in all other ways the support version is identical to the infantry  weapon. As a result any trooper in a squad can take over the support weapon at need. A 150-round extension magazine is issued to support gunners, though since the weapon can use either it is often ‘borrowed’ by rifle-armed soldiers when their own ammunition runs low." -- GR-90A, Range 600m, Cr3120, Mag 150 (Cr100), Quickdraw -2, AP 3, Auto 3, Emissions Signature (low), Scope -- I have no idea how to build this???
  }),
  weapon('AIWS', 'Modular infantry weapon, Interstellar Ordnance', {
    tl: 10,
    receiver: 'longarm',
    calibre: 'intermediateRifle',
    mechanism: 'fullAuto',
    features: ['advancedProjectile', 'highCapacity'],
    capacityPct: 120,
    barrel: 'rifle',
    stock: 'full',
    furniture: ['modularisation'],
    accessories: ['scope'],
    // TODO: carbine, support, assault configurations
  }),
  weapon('Intruder', 'Integrated AR/breaching shotgun, Tacload Armaments', {
    tl: 8,
    receiver: 'longarm',
    calibre: 'intermediateRifle',
    mechanism: 'fullAuto',
    features: ['bullpup', 'highCapacity', 'quickdraw'],
    barrel: 'carbine',
    stock: 'fixed', // a fixed stock (+10% cost / +10% weight)
    secondary: {
      tl: 8,
      receiver: 'assault',
      calibre: 'standardSmoothbore',
      mechanism: 'repeater',
      autoIncrease: 0,
      rapidFire: 'none',
      features: [],
      barrel: 'handgun',
      heavyBarrel: false,
      additionalBarrels: 0,
      stock: 'none',
      furniture: [],
      feed: 'fixed',
      capacityPct: 100,
      accessories: [],
      ammo: ['ball'],
      // reconcile: "Accessory: Secondary Receiver (Standard Smoothbore, Complete)" Cr+10%, Weight+10%
      // reconcile: "Accessory: Secondary Barrel (Handgun)" Cr+20%, Weight+20%
    },
    // The worked example's "Optical Sight" (Cr500/0.5kg) is the Long-Range Scope.
    accessories: ['laserPointer', 'longRangeScope'],
  }),
  weapon(
    'Squadmate',
    'Simple and effective rifle, Tactical Systems Incorporated',
    {
      tl: 7,
      receiver: 'longarm',
      calibre: 'battleRifle',
      mechanism: 'semiAuto',
      barrel: 'rifle',
      stock: 'fixed',
      // TODO: marksman variant - accurised, longer barrel, scope - 4.825kg, Cr1280
    },
  ),
  weapon('Sentinel', 'Low-G accelerator pistol, BeraTech', {
    tl: 9,
    receiver: 'handgun',
    calibre: 'heavyHandgun', // "Ammunition Type: Heavy Handgun (rocket)"
    mechanism: 'repeater',
    features: ['highCapacity', 'vacuum'],
    capacityPct: 140,
    barrel: 'handgun',
    ammo: ['ball', 'explosive'],
  }),
  weapon(
    'Shipmate Handgun',
    'Configurable low-recoil weapon, Unified Space Industries',
    {
      tl: 9,
      receiver: 'handgun',
      calibre: 'snub',
      mechanism: 'burst',
      autoIncrease: 2,
      features: ['highCapacity', 'rugged', 'vacuum'],
      barrel: 'handgun',
      furniture: ['modularisation'],
      // TODO 'assault weapon' and 'carbine' variants
    },
  ),
  // reconcile: cost matches (Cr170.625 vs the worksheet's Cr170.25, ~Cr0.4 of
  // rounding) and the primary damage/Lo-Pen reproduce. Still off: weight (0.99 vs
  // 0.928875kg — the worksheet bases the handgun at 0.75kg, the FC table at 0.8kg)
  // and Quickdraw (9 vs 7). The secondary's pellet profile (range, Spread, damage)
  // isn't reproduced: the worksheet's smoothbore figures don't follow the pellet
  // range / Pellet Spread tables.
  weapon(
    'Ten-Six',
    'Universal Security Solutions snub revolver with an under-barrel smoothbore (FC worked example).',
    {
      tl: 9,
      receiver: 'handgun',
      calibre: 'snub',
      mechanism: 'repeater',
      features: ['advancedProjectile', 'highCapacity'],
      barrel: 'short',
      stock: 'none',
      secondary: {
        tl: 9,
        receiver: 'handgun',
        calibre: 'lightSmoothbore',
        mechanism: 'singleShot',
        autoIncrease: 0,
        rapidFire: 'none',
        features: [],
        barrel: 'short',
        heavyBarrel: false,
        additionalBarrels: 0,
        stock: 'none',
        furniture: [],
        feed: 'standard',
        capacityPct: 100,
        accessories: [],
        ammo: ['pellet'],
      },
    },
  ),
  // TODO: Guardian
  // TODO: Solo
  // TODO: Reliant
  // TODO: Jimpy-G
  projector('MF-61', 'Individual flame weapon, Krabbine Heavy Industries', {
    tl: 9,
    structure: 'compact',
    propellantKg: 0.4,
    fuelKg: 4,
    fuel: 'advanced',
    propellant: 'generated',
    features: [
      { id: 'armoured', level: 2 },
      { id: 'bulwarked', level: 3 },
    ],
  }),
  projector('Cryojet', 'Breaching aid, Unified Space Industries', {
    tl: 10,
    structure: 'large',
    propellantKg: 1,
    fuelKg: 9,
    fuel: 'cryogenic',
    propellant: 'generated',
    features: [
      { id: 'armoured', level: 2 },
      { id: 'bulwarked', level: 2 },
    ],
    secondary: {
      tl: 10,
      receiver: 'longarm',
      calibre: 'heavySmoothbore',
      mechanism: 'repeater',
      autoIncrease: 0,
      rapidFire: 'none',
      features: [],
      barrel: 'assault',
      heavyBarrel: false,
      additionalBarrels: 0,
      stock: 'full',
      furniture: [],
      feed: 'fixed',
      capacityPct: 100,
      accessories: [],
      ammo: ['ball'],
    },
  }),
  energyWeapon(
    'BL-3',
    'Emergency defence weapon, Personal Security Solutions',
    {
      tl: 9,
      receiver: 'minimal',
      damageDice: 2,
      barrel: 'minimal',
      // Fed by 3 disposable weak energy cartridges (3 × 0.01 = 0.03kg).
      powerSource: 'cartridge',
      cartridgeRating: 'weak',
      cartridgeCount: 3,
    },
  ),
  energyWeapon('M-84', 'Battlefield configurable laser weapon', {
    tl: 11,
    receiver: 'medium',
    damageDice: 5,
    // efficientBeamGeneration / improvedBeamFocus map to the existing beam mods.
    mods: ['efficientBeam', 'improvedFocus'],
    barrel: 'carbine',
    stock: 'folding',
    // Internal powerpack: 0.1kg → Power 70 at TL11 (perKg 700). The standard
    // belt pack (1kg) and backpack (3kg) are larger options.
    powerSource: 'powerpack',
    powerpackRating: 'standard',
    powerpackKg: 0.1,
  }),
  energyWeapon('Nefertem', 'Compact TL9 laser pistol', {
    tl: 9,
    receiver: 'small',
    damageDice: 3,
    barrel: 'assault',
    stock: 'none',
    // Body Cr960 / 1.95kg (Small Cr800/1.5 + Assault barrel); + a 1kg light
    // powerpack. Small receiver → Quickdraw +4 (pistol-class); base pen −1 →
    // Lo-Pen 2.
    powerSource: 'powerpack',
    powerpackRating: 'light',
    powerpackKg: 1,
  }),
  // TODO: Krabbine Heavy Industries IP-2 Standoff Incendiary Weapon
  // TODO: Spigot Mortar, General Purpose
  launcher(
    'Light Munition Launcher',
    // Whaite Industries worked example: a semi-auto light tube made Lightweight +
    // Bullpup with an Assault barrel and full stock. Receiver Cr750/2.0kg, +Assault
    // barrel +full stock → 2.8kg. reconcile: the worksheet totals Cr940; the
    // firearm-style barrel/stock percentages give Cr975 (a ~Cr35 over-count we keep
    // flagged rather than fudge — the user is the authority on the exact figure).
    'Whaite Industries Light Munition Launcher',
    {
      tl: 8,
      receiver: 'tubeSemiLight',
      delivery: 'cartridge',
      features: ['lightweight', 'bullpup'],
      barrel: 'assault',
      stock: 'fixed', // a fixed stock (same +10%/+10% as full)
      warhead: 'fragmentation',
      // reconcile: incapacitant gas, baton, distraction, multiple projectile
    },
  ),
  // TODO: Interstellar Ordnance 42mm Advanced Squad Support Weapon
  // TODO: Xeirbin Components Tactical Multirole Missile System
  // TODO: AV-7 Missile
  // TODO: Grenade, Anti-Armour
  // TODO: Grenade, Mini, Multi-purpose Anti-Personnel
  // TODO: Grenade, Mine Delivery
  // TODO: Grenade, Smart-RAM, Plasma
  // TODO: Rifle Grenade, Guided
  // TODO: Rocket-Propelled Grenade, Anti-Armour
];
