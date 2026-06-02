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
  MISSILE_WARHEADS,
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
  LauncherWarhead,
  MagazineSpec,
  MechanismId,
  MissileWarheadId,
  PackSpec,
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
  WeaponParams,
} from './types.js';

/** A named weapon design: parameters plus presentation metadata. */
export interface WeaponDefinition {
  name: string;
  description?: string;
  /** Designer / manufacturer (e.g. "Anhur Industries"). */
  manufacturer?: string;
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
  warheads: [{ type: 'fragmentation' }],
  warheadSize: 'hand',
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

/** Coerce a magazine-options list; drops malformed entries, undefined if empty. */
function normalizeMagazines(v: unknown): MagazineSpec[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MagazineSpec[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const spec: MagazineSpec = {};
    if (typeof item.label === 'string') spec.label = item.label;
    if (typeof item.ammo === 'string' && item.ammo in AMMO_TYPES)
      spec.ammo = item.ammo as AmmoTypeId;
    if (typeof item.pct === 'number' && Number.isFinite(item.pct))
      spec.pct = item.pct;
    if (typeof item.rounds === 'number' && Number.isFinite(item.rounds))
      spec.rounds = item.rounds;
    if (typeof item.costCr === 'number' && Number.isFinite(item.costCr))
      spec.costCr = item.costCr;
    out.push(spec);
  }
  return out.length ? out : undefined;
}

/** Coerce an energy power-source-options list (powerpack / cartridge). */
function normalizePacks(v: unknown): PackSpec[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: PackSpec[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const rating = pick<EnergyPowerClass>(
      item.rating,
      ENERGY_POWER_CLASS_DICE,
      'standard' as EnergyPowerClass,
    );
    const label = typeof item.label === 'string' ? item.label : undefined;
    if (item.kind === 'cartridge') {
      out.push({ kind: 'cartridge', label, count: num(item.count, 1), rating });
    } else {
      out.push({ kind: 'powerpack', label, kg: num(item.kg, 1), rating });
    }
  }
  return out.length ? out : undefined;
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
  const magazines = normalizeMagazines(p.magazines);
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
    ...(magazines ? { magazines } : {}),
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
    ...(f.magazines ? { magazines: f.magazines } : {}),
    accessories: f.accessories,
    ammo: f.ammo,
  };
}

/** Coerce arbitrary parsed JSON into a complete, valid EnergyParams. */
function normalizeEnergyParams(p: Record<string, unknown>): EnergyParams {
  const d = DEFAULT_ENERGY_PARAMS;
  const packs = normalizePacks(p.packs);
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
    ...(packs ? { packs } : {}),
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
    // Warheads are a list (accepts a legacy single `warhead`); the legacy
    // 'incendiary' id maps onto its Grenade-table name. Falls back to the default.
    warheads: normalizeWarheads(
      Array.isArray(p.warheads) ? p.warheads : [p.warhead],
      d.warheads,
    ),
    warheadSize: pick<GrenadeSizeId>(
      p.warheadSize,
      { mini: 0, hand: 0 },
      d.warheadSize,
    ),
    delivery: pick<DeliveryId>(p.delivery, DELIVERY_SYSTEMS, d.delivery),
    // Missiles are a list too (accepts a legacy single `missile`); omitted when none.
    ...(() => {
      const raw = Array.isArray(p.missiles) ? p.missiles : [p.missile];
      const missiles = raw.filter(
        (x): x is MissileWarheadId =>
          typeof x === 'string' && x in MISSILE_WARHEADS,
      );
      return missiles.length > 0 ? { missiles } : {};
    })(),
  };
}

/**
 * Coerce a launcher warhead list. Accepts bare ids (a legacy single `warhead` or
 * the earlier string list) and `{type, delivery?}` objects; maps the legacy
 * 'incendiary' id; drops unknowns and falls back to the default if empty.
 */
function normalizeWarheads(
  v: unknown[],
  fallback: LauncherWarhead[],
): LauncherWarhead[] {
  const out: LauncherWarhead[] = [];
  for (const item of v) {
    const rawType =
      typeof item === 'string' ? item : (item as { type?: unknown })?.type;
    const type = rawType === 'incendiary' ? 'incendiaryAntipersonnel' : rawType;
    if (typeof type !== 'string' || !(type in GRENADES)) continue;
    const wh: LauncherWarhead = { type: type as GrenadeTypeId };
    const dlv = isObject(item) ? item.delivery : undefined;
    if (typeof dlv === 'string' && dlv in DELIVERY_SYSTEMS)
      wh.delivery = dlv as DeliveryId;
    out.push(wh);
  }
  return out.length > 0 ? out : fallback;
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
      ...(def.manufacturer ? { manufacturer: def.manufacturer } : {}),
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
    ...(typeof weapon.manufacturer === 'string'
      ? { manufacturer: weapon.manufacturer }
      : {}),
    params: normalizeWeaponParams(params),
  };
}

// --- Built-in weapons (the worked FC examples) -----------------

function weapon(
  name: string,
  description: string,
  overrides: Partial<FirearmParams>,
  manufacturer?: string,
): WeaponDefinition {
  return {
    name,
    description,
    ...(manufacturer ? { manufacturer } : {}),
    params: { ...DEFAULT_WEAPON_PARAMS, ...overrides },
  };
}

function energyWeapon(
  name: string,
  description: string,
  overrides: Partial<EnergyParams>,
  manufacturer?: string,
): WeaponDefinition {
  return {
    name,
    description,
    ...(manufacturer ? { manufacturer } : {}),
    params: { ...DEFAULT_ENERGY_PARAMS, ...overrides },
  };
}

function projector(
  name: string,
  description: string,
  overrides: Partial<ProjectorParams>,
  manufacturer?: string,
): WeaponDefinition {
  return {
    name,
    description,
    ...(manufacturer ? { manufacturer } : {}),
    params: { ...DEFAULT_PROJECTOR_PARAMS, ...overrides },
  };
}

function launcher(
  name: string,
  description: string,
  overrides: Partial<LauncherParams>,
  manufacturer?: string,
): WeaponDefinition {
  return {
    name,
    description,
    ...(manufacturer ? { manufacturer } : {}),
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
  weapon(
    'Adjudicator',
    'Small-smoothbore revolver',
    {
      tl: 7,
      receiver: 'handgun',
      calibre: 'smallSmoothbore',
      mechanism: 'repeater',
      barrel: 'handgun',
      stock: 'none',
      ammo: ['ball', 'pellet', 'flechette', 'explosive'],
    },
    'Ailene Armament',
  ),
  weapon(
    'GA-100',
    'Gauss-shotgun bullpup assault weapon',
    {
      tl: 13,
      receiver: 'assault',
      calibre: 'gaussShotgun',
      mechanism: 'fullAuto',
      features: ['bullpup', 'quickdraw', 'highCapacity'],
      capacityPct: 130,
      barrel: 'assault',
      stock: 'full',
      // reconcile: magazine reads Cr34.5 vs the book's Cr55 (gauss-shotgun ammo cost).
    },
    'Anhur Industries',
  ),
  weapon(
    'GC-24',
    'Gauss handgun',
    {
      tl: 13,
      receiver: 'handgun',
      calibre: 'smallGauss',
      mechanism: 'burst',
      features: ['veryCompact', 'lightweight'],
      autoIncrease: 2,
      capacityPct: 120,
      barrel: 'short',
      // reconcile: AP 3 and Emissions (low) reproduce; receiver cost reads
      // Cr1212.75 vs the book's Cr808.5 (unresolved). Verify weight: note's
      // 0.7744kg no longer holds (current ~0.852kg, likely the 120% capacity).
    },
    'Anhur Industries',
  ),
  weapon(
    'GS-40',
    'Gauss sidearm',
    {
      tl: 13,
      receiver: 'handgun',
      calibre: 'smallGauss',
      mechanism: 'burst',
      barrel: 'handgun',
    },
    'Anhur Industries',
  ),
  weapon(
    'Stowaway',
    'Extreme-stealth full-auto body pistol',
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
    'Colvery Solutions',
  ),
  weapon(
    'Liberator Derringer',
    'Heavy-handgun multi-barrel hold-out',
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
    'Hangul Arms and Tactical',
  ),
  weapon(
    'Bodyguard Shotgun',
    'Standard-smoothbore repeater longarm',
    {
      tl: 8,
      receiver: 'longarm',
      calibre: 'standardSmoothbore',
      mechanism: 'repeater',
      barrel: 'rifle',
      stock: 'full',
      accessories: ['laserPointer'],
      ammo: ['ball', 'pellet'],
      // reconcile: Physical Signature reads high vs the book's normal (smoothbore signature).
      // TODO Pointguard variant: shorter, no stock - TL10, 125m range, 3.25Kg, Cr180, Mag 3 (Cr4.5), Quickdraw +2, pellet only
    },
    'Harrix Industries',
  ),
  weapon(
    'Standard',
    'Safety-conscious carbine',
    {
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
    },
    'Interstellar Ordnance',
  ),
  weapon('Mk 1 Handgun', 'Generic early semi-automatic pistol', {
    tl: 5,
    receiver: 'handgun',
    calibre: 'heavyHandgun',
    mechanism: 'semiAuto',
    barrel: 'handgun',
    // reconcile: does not list Bulky or Lo-Pen 2
    // TODO: suppressed variant, Cr415, Quickdraw +5, Lo-Pen 2, Phys Sig (small)
  }),
  weapon(
    'Posi-9',
    'Upmarket semi-auto pistol',
    {
      tl: 9,
      receiver: 'handgun',
      calibre: 'mediumHandgun',
      mechanism: 'semiAuto',
      capacityPct: 150,
      features: ['advancedProjectile'],
      barrel: 'handgun',
      // reconcile: Physical Signature (normal)
      // TODO: burst and auto variants
    },
    'Tacload Armaments',
  ),
  weapon(
    'Crewmate',
    'Vehicle defense weapon',
    {
      tl: 7,
      receiver: 'handgun',
      calibre: 'intermediateRifle',
      mechanism: 'fullAuto',
      features: ['semiBullpup', 'rugged'],
      autoIncrease: 1,
      barrel: 'handgun',
      accessories: ['scope'],
    },
    'Tactical Systems Incorporated',
  ),
  weapon('Desperado', 'Generic assault submachinegun', {
    tl: 5,
    receiver: 'assault',
    calibre: 'mediumHandgun',
    mechanism: 'fullAuto',
    barrel: 'assault',
    stock: 'full',
    // reconcile: the book's Desperado also lists Inaccurate -1 (not modelled) and
    // seems to charge +10% for full-auto, not the +20% rule.
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
    // reconcile: receiver weight reads 1.25 vs the book's 2.079kg, Mag 18 vs 24
    // (the book ignores the Compact penalty), and Physical Signature low vs normal.
  }),
  weapon(
    'IAW-12',
    'Infantry Assault Weapon',
    {
      tl: 12,
      receiver: 'assault',
      calibre: 'smallGauss',
      mechanism: 'fullAuto',
      features: ['quickdraw', 'highCapacity'],
      autoIncrease: 1,
      barrel: 'assault',
      accessories: ['laserPointer'],
      // reconcile: the book worksheet oddly charges 15% for 'No Stock' (not modelled).
    },
    'Interstellar Ordnance',
  ),
  weapon(
    'Planetsider',
    'Starship crew security weapon',
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
      // The standard 150% magazine (29 rounds), plus the book's two larger
      // options: a 40-round casket (Cr40) and a heavy 70-round drum (Cr100). The
      // FC gives no magazine weights, so `pct` sizes the loaded weight via the
      // capacity-% rule (drum heavier than casket). Book note (not modelled): with
      // any magazine fitted the Planetsider's mass absorbs recoil, dropping Bulky.
      magazines: [
        { label: 'Standard' },
        { label: 'Casket', rounds: 40, costCr: 40, pct: 210 },
        { label: 'Drum', rounds: 70, costCr: 100, pct: 360 },
      ],
      // reconcile: 'Heavy Handgun ammo' adds +15% weight but no cost
      // reconcile: Receiver Totals Cr1264, 3.13kg
      // reconcile: Range 55m, Quickdraw +5, no Lo-Pen
    },
    'Unified Space Industries',
  ),
  weapon(
    'GR-80',
    'Gauss rifle',
    {
      tl: 13,
      receiver: 'longarm',
      calibre: 'standardGauss',
      mechanism: 'fullAuto',
      features: ['bullpup'],
      barrel: 'carbine',
      stock: 'full',
      accessories: ['multispectralScope'],
      // reconcile: AP reads 5 vs the book's 3 (standard gauss AP) — and the book
      // calls it both GR-80 and GR-90.
      // extra thing: "In addition to the standard GR-90, a light support variant is offered, built on the same receiver but using a heavy, heat-dissipating barrel. This is significantly longer than the standard carbine barrel, but in all other ways the support version is identical to the infantry  weapon. As a result any trooper in a squad can take over the support weapon at need. A 150-round extension magazine is issued to support gunners, though since the weapon can use either it is often ‘borrowed’ by rifle-armed soldiers when their own ammunition runs low." -- GR-90A, Range 600m, Cr3120, Mag 150 (Cr100), Quickdraw -2, AP 3, Auto 3, Emissions Signature (low), Scope -- I have no idea how to build this???
    },
    'Anhur Industries',
  ),
  weapon(
    'AIWS',
    'Modular infantry weapon',
    {
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
    },
    'Interstellar Ordnance',
  ),
  weapon(
    'Intruder',
    'Integrated AR/breaching shotgun',
    {
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
    },
    'Tacload Armaments',
  ),
  weapon(
    'Squadmate',
    'Simple and effective rifle',
    {
      tl: 7,
      receiver: 'longarm',
      calibre: 'battleRifle',
      mechanism: 'semiAuto',
      barrel: 'rifle',
      stock: 'fixed',
      // TODO: marksman variant - accurised, longer barrel, scope - 4.825kg, Cr1280
    },
    'Tactical Systems Incorporated',
  ),
  weapon(
    'Sentinel',
    'Low-G accelerator pistol',
    {
      tl: 9,
      receiver: 'handgun',
      calibre: 'heavyHandgun', // "Ammunition Type: Heavy Handgun (rocket)"
      mechanism: 'repeater',
      features: ['highCapacity', 'vacuum'],
      capacityPct: 140,
      barrel: 'handgun',
      ammo: ['ball', 'explosive'],
    },
    'BeraTech',
  ),
  weapon(
    'Shipmate Handgun',
    'Configurable low-recoil weapon',
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
    'Unified Space Industries',
  ),
  // reconcile: cost matches (Cr170.625 vs the worksheet's Cr170.25, ~Cr0.4 of
  // rounding) and the primary damage/Lo-Pen reproduce. Still off: weight (0.99 vs
  // 0.928875kg — the worksheet bases the handgun at 0.75kg, the FC table at 0.8kg)
  // and Quickdraw (9 vs 7). The secondary's pellet profile (range, Spread, damage)
  // isn't reproduced: the worksheet's smoothbore figures don't follow the pellet
  // range / Pellet Spread tables.
  weapon(
    'Ten-Six',
    'snub revolver with an under-barrel smoothbore',
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
    'Universal Security Solutions',
  ),
  weapon(
    'Guardian',
    '100m heavy accelerator weapon',
    {
      tl: 9,
      receiver: 'lsw',
      calibre: 'heavyRifle', // Heavy Rifle (Rocket)
      mechanism: 'fullAuto',
      features: ['vacuum'],
      barrel: 'long',
      stock: 'full',
      accessories: ['laserPointer'], // book error: says 'Scope', but Cr200 0.1kg
      ammo: ['ball', 'explosive', 'heap'],
      // Book lists Mag 45 (a rocket-calibre quirk we don't derive), one per ammo.
      magazines: [
        { ammo: 'ball', rounds: 45, costCr: 270 },
        { ammo: 'explosive', rounds: 45, costCr: 1400 },
        { ammo: 'heap', rounds: 45, costCr: 2300 },
      ],
      // reconcile: ball - 275m, 4D, QD -4, Inaccurate -1, Phys Sig (normal), Zero-G (rocket calibre not modelled)
    },
    'BeraTech',
  ),
  weapon(
    'Solo',
    'Fully-auto anti-armour sniper rifle',
    {
      tl: 14,
      receiver: 'longarm',
      calibre: 'enhancedGauss',
      mechanism: 'fullAuto',
      features: [
        'veryCompact',
        'rugged',
        'lightweight',
        'accurised',
        'highQuality', // book error: says Cost +100%
      ],
      barrel: 'long',
      stock: 'full',
      accessories: ['holographicSight'],
      ammo: ['ball', 'apAdvanced'],
      // Book reloads: ball Cr200, advanced AP Cr275 (the derived prices miss a
      // gauss ammo premium); capacity 45 derives correctly.
      magazines: [
        { ammo: 'ball', costCr: 200 },
        { ammo: 'apAdvanced', costCr: 275 },
      ],
      // reconcile: Quickdraw +0
    },
    'Diversified Military Systems',
  ),
  weapon(
    'Reliant',
    'Light starship security machine-gun',
    {
      tl: 9,
      receiver: 'lsw',
      calibre: 'intermediateRifle', // reconcile: book has no Weight adjustment here
      mechanism: 'fullAuto',
      features: ['advancedProjectile', 'compact'],
      autoIncrease: 1,
      barrel: 'carbine',
      heavyBarrel: true, // reconcile: book says Cr773.4375, 1.701kg
      stock: 'folding', // reconcile: book says Cr464, 0.212625kg
      accessories: ['scope'],
      ammo: ['ball', 'apAdvanced'],
      // Mag 50 is a manual override (mentioned in the text); ball Cr110, AAP Cr180.
      magazines: [
        { ammo: 'ball', rounds: 50, costCr: 110 },
        { ammo: 'apAdvanced', rounds: 50, costCr: 180 },
      ],
    },
    'Jervaux Aerospace',
  ),
  weapon('Jimpy-G', 'General-purpose machinegun, generic', {
    tl: 5,
    receiver: 'lsw',
    calibre: 'battleRifle',
    mechanism: 'fullAuto',
    barrel: 'long',
    heavyBarrel: true, // reconcile: book says Cr900, 7.5kg
    stock: 'full',
    furniture: ['bipod'],
    // Belt feed: Mag 50 is a manual override (the text's belt length), reload Cr50.
    magazines: [{ rounds: 50, costCr: 50 }],
    // reconcile: Range 375m, Quickdraw +4 (???), Slow Loader 4 (belt feed not modelled)
  }),
  projector(
    'MF-61',
    'Individual flame weapon',
    {
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
    },
    'Krabbine Heavy Industries',
  ),
  projector(
    'Cryojet',
    'Breaching aid',
    {
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
    },
    'Unified Space Industries',
  ),
  energyWeapon(
    'BL-3',
    'Emergency defence weapon',
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
    'Personal Security Solutions',
  ),
  energyWeapon('M-84', 'Battlefield configurable laser weapon', {
    tl: 11,
    receiver: 'medium',
    damageDice: 5,
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
  launcher(
    'IP-2',
    'Standoff incendiary weapon',
    {
      tl: 8,
      receiver: 'tubeSingleLight', // reconcile: Disposable Launcher - 0.25kg, Quickdraw -8, Bulky
      warheads: [{ type: 'incendiaryAntipersonnel' }], // reconcile: Incendiary Rocket-Propelled Grenade - Cr75, 0.5kg
      delivery: 'rpg',
    },
    'Krabbine Heavy Industries',
  ),
  launcher('Spigot Mortar', 'General-purpose RPG launcher', {
    tl: 6,
    receiver: 'reuseSingleLight',
    warheads: [{ type: 'antiArmour' }], // reconcile: Rocket-Propelled Grenade - Cr150, 5kg
    delivery: 'rpg',
    // reconcile: Damage 10D, AP 12, Blast 4
  }),
  launcher(
    'Light Munitions Launcher',
    // Whaite Industries worked example: a semi-auto light tube made Lightweight +
    // Bullpup with an Assault barrel and full stock. Receiver Cr750/2.0kg, +Assault
    // barrel +full stock → 2.8kg. reconcile: the worksheet totals Cr940; the
    // firearm-style barrel/stock percentages give Cr975 (a ~Cr35 over-count we keep
    // flagged rather than fudge — the user is the authority on the exact figure).
    'semi-auto light tube launcher',
    {
      tl: 7,
      receiver: 'tubeSemiLight', // reconcile: Quickdraw -8
      // Light (mini) cartridges. Primary is the multiple-projectile round; the
      // book also lists incapacitant gas, baton and distraction (each its own
      // profile row). gasIncapacitant isn't made as a mini, so it falls back to hand.
      warheads: [
        { type: 'multipleProjectile' },
        { type: 'gasIncapacitant' },
        { type: 'baton' },
        { type: 'distraction' },
      ],
      warheadSize: 'mini',
      delivery: 'cartridge',
      features: ['lightweight', 'bullpup'],
      barrel: 'assault',
      stock: 'fixed',
      // reconcile: Totals = Cr940, 2.8kg (does not count the warhead)
      // reconcile: multiple projectile = 0.4kg, Cr25
    },
    'Whaite Industries',
  ),
  launcher(
    'ASSW',
    'Rotary-fed RAM grenade launcher',
    {
      tl: 9,
      receiver: 'reuseSingleHeavy', // reconcile: Semi-Automatic Grenade Launcher, Standard - Quickdraw -8
      // Primary is the guided-frag RAM round; the other five are cartridge grenades
      // (per-munition delivery). Guidance is launcher-wide here (it adds Smart to
      // every round + 50% receiver cost), so the cartridge rounds also read Smart.
      guidance: true,
      delivery: 'ram',
      warheads: [
        { type: 'fragmentation', delivery: 'ram' },
        { type: 'multipleProjectile', delivery: 'cartridge' },
        { type: 'distraction', delivery: 'cartridge' },
        { type: 'gasIncapacitant', delivery: 'cartridge' },
        { type: 'baton', delivery: 'cartridge' },
        { type: 'stun', delivery: 'cartridge' },
      ],
      // book error: Receiver Totals Cr6500 (extra 0), 3.85kg
      // reconcile: Accessories: Fixed Drum - Cr325, 3kg - Capacity 6 rounds
      // reconcile: guided fragmentation is plain fragmentation + guidance (so Blast
      // reads 9, not the book's reduced 3); RAM Guided Frag - TL9, 300m, 5D, Cr90.
    },
    'Interstellar Ordnance',
  ),
  launcher(
    'TMMS',
    'Light TAC missile launcher',
    {
      tl: 10,
      receiver: 'reuseMagLight',
      missiles: ['av7'], // Ammunition Type: Light Tac Missile
      features: ['lightweight', 'veryCompact'],
      guidance: true, // TODO: why is this not a feature?
      // book error: Receiver Totals Cr1127.9, 7.68kg
    },
    'Xeirbin Components',
  ),
  weapon('MDD-15', 'heavy machine-gun', {
    tl: 8,
    receiver: 'heavy', // our 'Heavy Weapon' receiver = the FC support receiver: Cr3000, 10kg, QD-8, base mag 50
    calibre: 'antiMateriel',
    mechanism: 'fullAuto',
    barrel: 'long',
    heavyBarrel: true,
    stock: 'none',
    furniture: ['supportMount'], // a mount, not a shoulder stock — Cr900, 10kg
    accessories: ['scope'],
    // Belt feed: Mag 50 (Cr750) is a manual override (the % rule under-derives it).
    magazines: [{ rounds: 50, costCr: 750 }],

    // all versions: 550m, 50 Mag (Cr750), Quickdraw -9, Bulky, Scope
    // 5D / Auto 3 / Mag 50 (Cr750) reproduce. reconcile: the build runs high —
    // r1100 / Cr20300 / 52.7kg / QD-10 vs the book's 550m / Cr9050 / 35.2kg / QD-9
    // (the antiMateriel calibre's range + the support-mount cost/weight don't match
    // the book's Heavy Machinegun figures).
    // reconcile: Heavy Machinegun - 5D, 35.2kg, Cr9050 - Auto 3
    // reconcile: Chain Gun - 5D, 56.7kg, Cr28100 - Auto 4 [needs powered feed system, pintle/ring mount]
    // reconcile: Twin Chain Gun - 7D, 113.4kg, Cr56200 - Auto 4 [needs small turret]
  }),
  weapon('MDS-15', 'heavy projectile weapon', {
    tl: 8,
    receiver: 'heavy', // same as MDD (FC support receiver)
    calibre: 'antiMateriel',
    mechanism: 'semiAuto',
    features: [
      'compact',
      'rugged',
      'lightweight',
      { id: 'recoilComp', level: 2 },
      'accurised',
      'highQuality',
    ],
    capacityPct: 50,
    barrel: 'long',
    stock: 'full',
    accessories: ['scope'],
    furniture: ['bipod'],
    // Mag 7 (Cr150) is a manual override (the book-listed count/price).
    magazines: [{ rounds: 7, costCr: 150 }],

    // all versions: Mag 7, Quickdraw -9, Bulky
    // 5D-3 / Mag 7 (Cr150) reproduce. reconcile: the build runs high — r1100 /
    // Cr83961 / 20.29kg / QD-13 vs the book's 550m / Cr59720 / 13.61kg / QD-9.
    // reconcile: MDS-15 - 550m, 5D-3, 13.61kg, Cr59720, Mag Cr150 - Scope
    // reconcile: MDS-15 (advanced AP) - 550m, 5D-5, 13.61kg, Cr59720, Mag Cr480 - AP 6, Scope
    // reconcile: MDS-15 (cut down, explosive) - 250m, 7D-3, 10.76kg, Cr47435, Mag Cr650 - Lo-Pen 2
    // reconcile: MDS-15 (cut down, pellet) - 250m, 5D-3, 10.76kg, Cr47435, Mag Cr150 - Lo-Pen 4, Spread 3
  }),
  energyWeapon('TES-12', 'laser support weapon', {
    tl: 12, // prose places it at TL12 (and the Efficient Beam / Improved Focus mods need TL11)
    receiver: 'large',
    damageDice: 8,
    // A heavy (8D) powerpack drives the 8D output without Unreliable.
    powerpackRating: 'heavy',
    mods: ['efficientBeam', 'improvedFocus'],
    barrel: 'long',
    stock: 'full',
    accessories: ['scope', 'laserDesignator'],
    furniture: ['bipod'],
    // Accessory: Internal Power Pack (1kg) - Cr2500, Power 1000 (the heavy powerpack)

    // all versions: 8D, Mag 125 (Cr2500), Bulky, Emis (low), Lo-Pen 2, Scope, Zero-G
    // Mag 125 / Lo-Pen 2 / Zero-G / Scope / cost (Cr19500) / weight (13.7kg) all
    // reproduce — the heavy powerpack drives 8D without Unreliable and the
    // weapon-mounted Laser Designator closes the last Cr1000 / 0.2kg.
    // reconcile: range 688 / QD-13 / Emis(normal) / 8D+3 differ from the book's
    // 625m / QD-9 / Emis(low) / 8D.
    // reconcile: TES-12 - 625m, 13.7kg, Cr19500, Quickdraw -9
    // reconcile: TEA-12 - 450m, 10.01kg, Cr17500, Quickdraw -4 [carbine, folding stock]
  }),
];

/* TODO
  CLOSEGUARD SEMI-AUTONOMOUS POINT DEFENCE SYSTEM (TL9)
  - takes 1 Space
  - internal batteries good for 36h
  - short range radar and thermal sensors
  - has Point Defence 2; up to two targets of same general type, at DM+2 to hit

  machinegun - 375m, 3D+3, 32kg, kCr123, Mag 50 (Cr50) - Auto 3, Phys (norm), Slow Loader 4
  twin RF heavy machinegun - 550m, 7D, 110kg, kCr175, Mag 50 (Cr750) - Auto 3, Bulky, Phys (high), Slow Loader 4
  twin laser support weapon - 625m, 8D, 45kg, kCr160, Mag 125 (kCr5) - Bulky, Emis (low), Zero-G
*/
/* TODO
  PORCUPINE RIFLE GRENADE DISCHARGER (TL7)

  porcupine - 100m, damage as grenade, 8kg, Cr2500, Mag 12 (cost as grenade) - traits as grenade
*/

/*
 * Standard munitions (reference / TODO). Launchers now fire any Grenade Weapons
 * payload (`GRENADES`, hand or mini) via a delivery system, so most of these are
 * a payload × delivery away. Still to wire up: a Rifle-Grenade delivery (100m,
 * cost ×2 / weight ×1.25 — reproduces the Anti-Armour Rifle Grenade exactly);
 * the larger RPG / missile warheads; and the multi-mode rounds (we show the
 * primary mode only). The "larger warhead" damage is flagged, not invented.
 *
 *   AV-7 Missile (TL10) — in launcherData `MISSILE_WARHEADS`; load via
 *                          LauncherParams.missile on a reusable / field launcher
 *   Grenade, Anti-Armour (TL6) — Hand 20m/4D/0.5kg/Cr50/AP8 Blast1;
 *                                 Rifle 100m/4D/0.625kg/Cr100/AP8 Blast1
 *   Grenade, Mini, Multi-purpose AP (TL9) — 30m/1D|3D|Distraction/0.3kg/Cr35/Blast4 Lo-Pen2
 *   Grenade, Mine Delivery (TL9) — 200m/as payload/0.6kg/Cr15 + payload
 *   Grenade, Smart-RAM, Plasma (TL12) — 300m/8D/0.8kg/Cr200/Blast6 Incendiary4 Lo-Pen2 Smart
 *   Rifle Grenade, Guided (TL8) — 100m/as payload/varies/Cr50 Smart (+Cr100 terminal seeking)
 *   Rocket-Propelled Grenade, Anti-Armour (TL6) — 500m/5D/5kg/Cr150/AP10 Blast4 Inaccurate-2
 */
