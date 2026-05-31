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
import { LAUNCHER_RECEIVERS, WARHEADS } from './launcherData.js';
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
  ReceiverFeatureId,
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
  gauss: false,
  calibre: 'intermediateRifle',
  mechanism: 'semiAuto',
  autoIncrease: 0,
  features: [],
  barrel: 'rifle',
  heavyBarrel: false,
  additionalBarrels: 0,
  stock: 'full',
  furniture: [],
  feed: 'standard',
  capacityPct: 100,
  accessories: [],
  ammo: 'ball',
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
  armour: 0,
  bulwark: 0,
};

/** A valid starting launcher: a TL6 single-shot light tube grenade launcher. */
export const DEFAULT_LAUNCHER_PARAMS: LauncherParams = {
  kind: 'launcher',
  tl: 6,
  receiver: 'tubeSingleLight',
  guidance: false,
  magazineSize: 6,
  warhead: 'fragmentation',
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

const POWER_CLASSES = ENERGY_POWER_CLASS_DICE;
const POWER_SOURCES = { powerpack: 0, cartridge: 0 };

/** Coerce arbitrary parsed JSON into a complete, valid FirearmParams. */
function normalizeFirearmParams(p: Record<string, unknown>): FirearmParams {
  const d = DEFAULT_WEAPON_PARAMS;
  return {
    kind: 'firearm',
    tl: num(p.tl, d.tl),
    receiver: pick<ReceiverTypeId>(p.receiver, RECEIVERS, d.receiver),
    gauss: bool(p.gauss, d.gauss),
    calibre: pick<CalibreId>(p.calibre, CALIBRES, d.calibre),
    mechanism: pick<MechanismId>(p.mechanism, MECHANISMS, d.mechanism),
    autoIncrease: num(p.autoIncrease, d.autoIncrease),
    features: pickList<ReceiverFeatureId>(p.features, RECEIVER_FEATURES),
    barrel: pick<BarrelId>(p.barrel, BARRELS, d.barrel),
    heavyBarrel: bool(p.heavyBarrel, d.heavyBarrel),
    additionalBarrels: num(p.additionalBarrels, d.additionalBarrels),
    stock: pick<StockId>(p.stock, STOCKS, d.stock),
    furniture: pickList<FurnitureId>(p.furniture, FURNITURE),
    feed: pick<FeedId>(p.feed, FEEDS, d.feed),
    capacityPct: num(p.capacityPct, d.capacityPct),
    accessories: pickList<AccessoryId>(p.accessories, ACCESSORIES),
    ammo: pick<AmmoTypeId>(p.ammo, AMMO_TYPES, d.ammo),
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
    gauss: f.gauss,
    calibre: f.calibre,
    mechanism: f.mechanism,
    autoIncrease: f.autoIncrease,
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
    features: pickList<ReceiverFeatureId>(p.features, RECEIVER_FEATURES),
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
    armour: num(p.armour, d.armour),
    bulwark: num(p.bulwark, d.bulwark),
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
    guidance: bool(p.guidance, d.guidance),
    magazineSize: num(p.magazineSize, d.magazineSize),
    warhead: pick<WarheadId>(p.warhead, WARHEADS, d.warhead),
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

// --- Built-in weapons (the worked Field Catalogue examples) -----------------

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

function grenade(
  name: string,
  description: string,
  overrides: Partial<GrenadeParams>,
): WeaponDefinition {
  return {
    name,
    description,
    params: { ...DEFAULT_GRENADE_PARAMS, ...overrides },
  };
}

export const BUILTIN_WEAPONS: WeaponDefinition[] = [
  weapon(
    'Generic 6 Revolver',
    'Medium-calibre repeater revolver (Field Catalogue worked example).',
    {
      tl: 6,
      receiver: 'handgun',
      calibre: 'mediumHandgun',
      mechanism: 'repeater',
      barrel: 'handgun',
      stock: 'none',
      capacityPct: 120,
    },
  ),
  weapon(
    'Compact PDW',
    'Light-handgun personal defence weapon (Field Catalogue worked example).',
    {
      tl: 8,
      receiver: 'assault',
      calibre: 'lightHandgun',
      mechanism: 'fullAuto',
      autoIncrease: 1,
      features: ['compact'],
      barrel: 'handgun',
      stock: 'none',
      capacityPct: 70,
    },
  ),
  weapon(
    'Civilian Shotgun',
    'Single-shot double-barrel light smoothbore (Field Catalogue worked example).',
    {
      tl: 4,
      receiver: 'longarm',
      calibre: 'lightSmoothbore',
      mechanism: 'singleShot',
      features: ['partialMultiBarrel'],
      barrel: 'rifle',
      additionalBarrels: 1,
      stock: 'full',
      ammo: 'pellet',
    },
  ),
  weapon(
    '13mm Crunch Gun',
    'Anti-materiel repeater with a very long barrel (Field Catalogue worked example).',
    {
      tl: 4,
      receiver: 'lsw',
      calibre: 'antiMateriel',
      mechanism: 'repeater',
      barrel: 'veryLong',
      stock: 'full',
      furniture: ['bipod'],
      accessories: ['scope'],
      capacityPct: 50,
    },
  ),
  // reconcile: the worked Adjudicator lists its Handgun barrel at 0.12kg, which
  // is 15% of the 0.8kg receiver — the barrel's *cost* fraction. The FC barrel
  // table gives a Handgun barrel 20% weight (→ 0.16kg here), matching the
  // Bodyguard worksheet's rifle barrel, so we follow the rules table (0.16kg)
  // and treat the worksheet's 0.12kg as using the cost figure by mistake.
  weapon(
    'Adjudicator',
    'Small-smoothbore revolver, Ailene Armament (Field Catalogue worked example).',
    {
      tl: 7,
      receiver: 'handgun',
      calibre: 'smallSmoothbore',
      mechanism: 'repeater',
      barrel: 'handgun',
      stock: 'none',
    },
  ),
  weapon(
    'GA-100',
    'Gauss-shotgun bullpup assault weapon, Anhur Industries (Field Catalogue worked example).',
    {
      tl: 13,
      receiver: 'assault',
      gauss: true,
      calibre: 'gaussShotgun',
      mechanism: 'fullAuto',
      features: ['bullpup', 'quickdraw', 'highCapacity'],
      barrel: 'assault',
      stock: 'full',
      capacityPct: 130,
    },
  ),
  weapon(
    'Stowaway',
    'Extreme-stealth full-auto body pistol, Colvery Solutions (Field Catalogue worked example).',
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
    'Bodyguard Shotgun',
    'Standard-smoothbore repeater longarm, Harrix Industries (Field Catalogue worked example).',
    {
      tl: 8,
      receiver: 'longarm',
      calibre: 'standardSmoothbore',
      mechanism: 'repeater',
      barrel: 'rifle',
      stock: 'full',
      accessories: ['laserPointer'],
    },
  ),
  energyWeapon(
    'Laser Carbine',
    'TL10 Small (Light) laser carbine, powerpack-fed (Field Catalogue energy weapon).',
    {
      tl: 10,
      receiver: 'small',
      damageDice: 3,
      barrel: 'carbine',
      stock: 'full',
      powerSource: 'powerpack',
      powerpackKg: 1,
      powerpackRating: 'light',
    },
  ),
  energyWeapon(
    'Laser Rifle',
    'TL12 Medium (Standard) laser rifle with improved focus (Field Catalogue energy weapon).',
    {
      tl: 12,
      receiver: 'medium',
      damageDice: 5,
      barrel: 'rifle',
      stock: 'full',
      mods: ['improvedFocus'],
      powerSource: 'powerpack',
      powerpackKg: 2,
      powerpackRating: 'standard',
    },
  ),
  projector(
    'Flamethrower',
    'TL5 Compact jellied-fuel flamethrower (Field Catalogue projector).',
    {
      tl: 5,
      structure: 'compact',
      propellant: 'compressed',
      fuel: 'jellied',
      fuelKg: 4,
      propellantKg: 2,
    },
  ),
  projector(
    'MF-61',
    'Krabbine Heavy Industries MF-61 individual flame weapon (Field Catalogue).',
    {
      tl: 10,
      structure: 'compact',
      propellant: 'generated',
      fuel: 'advanced',
      fuelKg: 4,
      propellantKg: 0.4,
      armour: 2,
      bulwark: 3,
    },
  ),
  launcher(
    'Grenade Launcher',
    'TL6 single-shot light tube grenade launcher (Field Catalogue launcher).',
    {
      tl: 6,
      receiver: 'tubeSingleLight',
      warhead: 'fragmentation',
    },
  ),
  launcher(
    'Rocket Launcher',
    'TL6 reusable heavy anti-armour rocket launcher (Field Catalogue launcher).',
    {
      tl: 6,
      receiver: 'reuseSingleHeavy',
      warhead: 'antiArmour',
    },
  ),
  grenade(
    'Fragmentation Grenade',
    'TL6 hand fragmentation grenade (Field Catalogue).',
    { tl: 6, type: 'fragmentation', size: 'hand' },
  ),
  grenade('Smoke Grenade', 'TL6 hand smoke grenade (Field Catalogue).', {
    tl: 6,
    type: 'smoke',
    size: 'hand',
  }),
];
