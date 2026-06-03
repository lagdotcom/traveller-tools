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

/**
 * A named partial override of a weapon's params — a book variant (e.g. a "cut
 * down" or "carbine" version) without duplicating the whole design. Shallow
 * merge: a changed field is given in full (e.g. `{ barrel: 'short', ammo:
 * ['pellet'] }`); `kind` always inherits the base.
 */
export interface WeaponVariant {
  name: string;
  description?: string;
  override: Partial<WeaponParams>;
}

/** A named weapon design: parameters plus presentation metadata. */
export interface WeaponDefinition {
  name: string;
  description?: string;
  /** Designer / manufacturer (e.g. "Anhur Industries"). */
  manufacturer?: string;
  /**
   * Name of the **base** configuration when the weapon is one of several named
   * models/configs (e.g. GS-40's "Army Model", the peer of its "Navy Model"
   * variant). Cosmetic: the base shows as a named peer alongside `variants`.
   */
  baseVariant?: string;
  params: WeaponParams;
  /** Optional book variants (partial overrides on `params`). */
  variants?: WeaponVariant[];
}

/** Resolve a variant to full, valid params (base ← override, base `kind` kept). */
export function variantParams(
  base: WeaponParams,
  override: Partial<WeaponParams>,
): WeaponParams {
  return normalizeWeaponParams({
    ...(base as unknown as Record<string, unknown>),
    ...(override as unknown as Record<string, unknown>),
    kind: base.kind,
  });
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
  source: { kind: 'powerpack', kg: 1, rating: 'light' },
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
      out.push({
        kind: 'cartridge',
        label,
        count: num(item.count, 1),
        rating,
        ejects: bool(item.ejects, true),
      });
    } else {
      out.push({
        kind: 'powerpack',
        label,
        kg: num(item.kg, 1),
        rating,
        ...(item.internal === true ? { internal: true } : {}),
      });
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
    source: normalizeSource(p),
    ...(packs ? { packs } : {}),
  };
}

/**
 * Resolve the primary power source. New shape: a single `PackSpec` under `source`.
 * Legacy migration: rebuild it from the old flat fields (`powerSource` +
 * `powerpackKg`/`powerpackRating` or `cartridgeRating`/`cartridgeCount`/
 * `cartridgeEjects`) so saved energy weapons still load.
 */
function normalizeSource(p: Record<string, unknown>): PackSpec {
  if (isObject(p.source)) {
    const one = normalizePacks([p.source]);
    if (one && one[0]) return one[0];
  }
  if (p.powerSource === 'cartridge') {
    return {
      kind: 'cartridge',
      rating: pick<EnergyPowerClass>(p.cartridgeRating, POWER_CLASSES, 'light'),
      count: num(p.cartridgeCount, 20),
      ejects: bool(p.cartridgeEjects, true),
    };
  }
  return {
    kind: 'powerpack',
    rating: pick<EnergyPowerClass>(p.powerpackRating, POWER_CLASSES, 'light'),
    kg: num(p.powerpackKg, 1),
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

/** Coerce a variants list: each needs a name; the override is kept raw (it's
 *  shallow-merged and normalised at resolve time, so unknown keys drop out). */
function normalizeVariants(v: unknown): WeaponVariant[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: WeaponVariant[] = [];
  for (const item of v) {
    if (!isObject(item)) continue;
    const name =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : undefined;
    if (!name) continue;
    out.push({
      name,
      ...(typeof item.description === 'string'
        ? { description: item.description }
        : {}),
      override: isObject(item.override)
        ? (item.override as Partial<WeaponParams>)
        : {},
    });
  }
  return out.length ? out : undefined;
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
      ...(def.baseVariant ? { baseVariant: def.baseVariant } : {}),
      params: normalizeWeaponParams(def.params),
      ...(def.variants && def.variants.length > 0
        ? { variants: def.variants }
        : {}),
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
    ...(typeof weapon.baseVariant === 'string' && weapon.baseVariant.trim()
      ? { baseVariant: weapon.baseVariant.trim() }
      : {}),
    params: normalizeWeaponParams(params),
    ...(normalizeVariants(weapon.variants)
      ? { variants: normalizeVariants(weapon.variants) }
      : {}),
  };
}

// --- Built-in weapons (the worked FC examples) -----------------

/** Optional named variants (partial overrides on the just-built params). */
type Variants = WeaponVariant[];
const withVariants = (def: WeaponDefinition, variants?: Variants) =>
  variants && variants.length > 0 ? { ...def, variants } : def;

function weapon(
  name: string,
  description: string,
  overrides: Partial<FirearmParams>,
  manufacturer?: string,
  variants?: Variants,
): WeaponDefinition {
  return withVariants(
    {
      name,
      description,
      ...(manufacturer ? { manufacturer } : {}),
      params: { ...DEFAULT_WEAPON_PARAMS, ...overrides },
    },
    variants,
  );
}

function energyWeapon(
  name: string,
  description: string,
  overrides: Partial<EnergyParams>,
  manufacturer?: string,
  variants?: Variants,
): WeaponDefinition {
  return withVariants(
    {
      name,
      description,
      ...(manufacturer ? { manufacturer } : {}),
      params: { ...DEFAULT_ENERGY_PARAMS, ...overrides },
    },
    variants,
  );
}

function projector(
  name: string,
  description: string,
  overrides: Partial<ProjectorParams>,
  manufacturer?: string,
  variants?: Variants,
): WeaponDefinition {
  return withVariants(
    {
      name,
      description,
      ...(manufacturer ? { manufacturer } : {}),
      params: { ...DEFAULT_PROJECTOR_PARAMS, ...overrides },
    },
    variants,
  );
}

function launcher(
  name: string,
  description: string,
  overrides: Partial<LauncherParams>,
  manufacturer?: string,
  variants?: Variants,
): WeaponDefinition {
  return withVariants(
    {
      name,
      description,
      ...(manufacturer ? { manufacturer } : {}),
      params: { ...DEFAULT_LAUNCHER_PARAMS, ...overrides },
    },
    variants,
  );
}

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
  weapon(
    'Civilian Shotgun',
    'Single-shot double-barrel light smoothbore',
    {
      tl: 4,
      receiver: 'longarm',
      calibre: 'lightSmoothbore',
      mechanism: 'singleShot',
      features: ['partialMultiBarrel'],
      barrel: 'rifle',
      stock: 'full',
      additionalBarrels: 1,
      ammo: ['pellet'],
    },
    undefined,
    [
      {
        name: 'Sawed-Off',
        override: { barrel: 'sawedOff', ammo: ['pellet', 'explosive'] },
      },
    ],
  ),
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
  }),
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
      // reconcile: gauss handguns hold 40 base (matching the Core Gauss Pistol),
      // not the rules' ×3 → 30; no FC text explains it, so it's pinned per-weapon.
      // Final 24 = 40 × Very Compact 0.5 × 120%; magazine Cr27 is the book figure.
      magazines: [{ rounds: 24, costCr: 27 }],
    },
    'Anhur Industries',
  ),
  {
    ...weapon(
      'GS-40',
      'Gauss sidearm',
      {
        tl: 13,
        receiver: 'handgun',
        calibre: 'smallGauss',
        mechanism: 'burst',
        barrel: 'handgun',
        // reconcile: gauss handguns hold 40 base (Core Gauss Pistol), not ×3 → 30 —
        // pinned per-weapon; the name itself is the 40-round magazine. Cr25 = book.
        magazines: [{ rounds: 40, costCr: 25 }],
      },
      'Anhur Industries',
      [
        {
          name: 'Navy Model',
          override: { barrel: 'assault', stock: 'full' },
        },
      ],
    ),
    baseVariant: 'Army Model',
  },
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
  {
    ...weapon(
      'Liberator',
      'Heavy-handgun multi-barrel hold-out',
      {
        tl: 7,
        receiver: 'handgun',
        calibre: 'heavyHandgun',
        mechanism: 'repeater',
        features: ['partialMultiBarrel'],
        stock: 'none',
        additionalBarrels: 3,
        barrel: 'minimal',
        ammo: ['lowPenetration', 'heap'],
      },
      'Hangul Arms and Tactical',
      [
        {
          name: 'Defender',
          override: {
            barrel: 'short',
            ammo: ['ball', 'distraction', 'explosive'],
          },
        },
      ],
    ),
    baseVariant: 'Derringer',
  },
  weapon(
    'Bodyguard',
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
    },
    'Harrix Industries',
    [
      {
        name: 'Pointguard',
        override: {
          barrel: 'assault',
          stock: 'none',
          ammo: ['pellet'],
        },
      },
    ],
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
    },
    'Interstellar Ordnance',
  ),
  weapon(
    'Mk 1 Handgun',
    'Generic early semi-automatic pistol',
    {
      tl: 5,
      receiver: 'handgun',
      calibre: 'heavyHandgun',
      mechanism: 'semiAuto',
      barrel: 'handgun',
    },
    undefined,
    [{ name: 'suppressed', override: { accessories: ['suppressor'] } }],
  ),
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
    },
    'Tacload Armaments',
    [
      { name: 'burst', override: { mechanism: 'burst' } },
      { name: 'auto', override: { mechanism: 'fullAuto' } },
    ],
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
      magazines: [
        { label: 'Standard' },
        { label: 'Casket', rounds: 40, costCr: 40, pct: 210 },
        { label: 'Drum', rounds: 70, costCr: 100, pct: 360 }, // TODO drops Bulky
      ],
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
    },
    'Anhur Industries',
    [{ name: 'GR-80A', override: { heavyBarrel: true } }],
  ),
  {
    ...weapon(
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
      },
      'Interstellar Ordnance',
      [
        { name: 'carbine', override: { barrel: 'carbine', stock: 'folding' } },
        {
          // "Available for support work" — a heavy barrel plus the Cr28 extended
          // casket magazine (64 rounds, loaded reload Cr70). Modelled as a magazine
          // option, not an extended feed device, so it keeps the heavy barrel's
          // −1 Quickdraw without the extended-magazine −2 penalty (matching book).
          name: 'lsw',
          override: {
            heavyBarrel: true,
            magazines: [
              { label: 'extended casket magazine', rounds: 64, costCr: 70 },
            ],
          },
        },
        { name: 'assault', override: { barrel: 'assault', stock: 'none' } },
      ],
    ),
    baseVariant: 'rifle',
  },
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
      stock: 'fixed',
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
      },
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
    [
      {
        name: 'Marksman',
        override: {
          features: ['accurised'],
          barrel: 'long',
          accessories: ['scope'],
        },
      },
    ],
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
  {
    ...weapon(
      'Shipmate',
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
      },
      'Unified Space Industries',
      [
        {
          name: 'Assault Weapon',
          override: { barrel: 'assault', stock: 'folding' },
        },
        {
          name: 'Carbine',
          override: {
            barrel: 'carbine',
            stock: 'fixed',
            accessories: ['scope'],
          },
        },
      ],
    ),
    baseVariant: 'Handgun',
  },
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
      calibre: 'heavyRifle',
      mechanism: 'fullAuto',
      features: ['vacuum'],
      barrel: 'long',
      stock: 'full',
      accessories: ['laserPointer'],
      ammo: ['ball', 'explosive', 'heap'],
      magazines: [
        { ammo: 'ball', rounds: 45, costCr: 270 },
        { ammo: 'explosive', rounds: 45, costCr: 1400 },
        { ammo: 'heap', rounds: 45, costCr: 2300 },
      ],
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
        'highQuality',
      ],
      barrel: 'long',
      stock: 'full',
      accessories: ['holographicSight'],
      ammo: ['ball', 'apAdvanced'],
      magazines: [
        { ammo: 'ball', costCr: 200 },
        { ammo: 'apAdvanced', costCr: 275 },
      ],
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
      // "Bottled Lightning": three disposable weak energy cartridges in a screw-out
      // rear section (replaced individually or together) → non-ejecting (Hazardous −2).
      source: { kind: 'cartridge', rating: 'weak', count: 3, ejects: false },
    },
    'Personal Security Solutions',
  ),
  {
    ...energyWeapon(
      'M-84',
      'Battlefield configurable laser weapon',
      {
        tl: 11,
        receiver: 'medium',
        damageDice: 5,
        mods: ['efficientBeam', 'improvedFocus'],
        barrel: 'carbine',
        stock: 'folding',
        // Internal 0.1kg reserve (Power 70 → 14 shots, recharged not replaced);
        // the belt and back packs are detachable alternatives.
        source: {
          kind: 'powerpack',
          label: 'internal',
          kg: 0.1,
          rating: 'standard',
          internal: true,
        },
        packs: [
          { kind: 'powerpack', label: 'belt pack', kg: 1, rating: 'standard' },
          { kind: 'powerpack', label: 'back pack', kg: 3, rating: 'standard' },
        ],
      },
      undefined,
      [{ name: 'rifle', override: { barrel: 'rifle' } }],
    ),
    baseVariant: 'carbine',
  },
  energyWeapon('Nefertem', 'Compact TL9 laser pistol', {
    tl: 9,
    receiver: 'small',
    damageDice: 3,
    barrel: 'assault',
    stock: 'none',
    // Standard 1kg belt-mounted pack: Power 300 (TL9) → 100 shots, Cr1000 to replace.
    source: { kind: 'powerpack', rating: 'light', kg: 1 },
  }),
  launcher(
    'IP-2',
    'Standoff incendiary weapon',
    {
      tl: 8,
      receiver: 'tubeSingleLight',
      warheads: [{ type: 'incendiaryAntipersonnel' }],
      delivery: 'rpg',
    },
    'Krabbine Heavy Industries',
  ),
  launcher('Spigot Mortar', 'General-purpose RPG launcher', {
    tl: 6,
    receiver: 'reuseSingleLight',
    warheads: [{ type: 'antiArmour' }],
    delivery: 'rpg',
  }),
  launcher(
    'Light Munitions Launcher',
    'semi-auto light tube launcher',
    {
      tl: 7,
      receiver: 'tubeSemiLight',
      warheadSize: 'mini',
      delivery: 'cartridge',
      features: ['lightweight', 'bullpup'],
      barrel: 'assault',
      stock: 'fixed',
      warheads: [
        { type: 'fragmentation', delivery: 'ram' },
        { type: 'gasIncapacitant' },
        { type: 'baton' },
        { type: 'distraction' },
        { type: 'multipleProjectile' },
      ],
    },
    'Whaite Industries',
  ),
  launcher(
    'ASSW',
    'Rotary-fed RAM grenade launcher',
    {
      tl: 9,
      receiver: 'reuseSingleHeavy',
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
    },
    'Interstellar Ordnance',
  ),
  launcher(
    'TMMS',
    'Light TAC missile launcher',
    {
      tl: 10,
      receiver: 'reuseMagLight',
      missiles: ['av7'],
      features: ['lightweight', 'veryCompact'],
      guidance: true,
    },
    'Xeirbin Components',
  ),
  weapon(
    'MDD-15',
    'heavy machine-gun',
    {
      tl: 8,
      receiver: 'heavy',
      calibre: 'antiMateriel',
      mechanism: 'fullAuto',
      barrel: 'long',
      heavyBarrel: true,
      stock: 'none',
      furniture: ['supportMount'],
      accessories: ['scope'],
      magazines: [{ rounds: 50, costCr: 750 }],
    },
    undefined,
    [
      { name: 'Chain Gun', override: { feed: 'belt' } },
      { name: 'Twin Chain Gun', override: { feed: 'belt' } },
    ],
  ),
  weapon(
    'MDS-15',
    'heavy projectile weapon',
    {
      tl: 8,
      receiver: 'heavy',
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
      magazines: [{ rounds: 7, costCr: 150 }],
      ammo: ['ball', 'apAdvanced'],
    },
    undefined,
    [
      {
        name: 'cut down',
        override: { barrel: 'assault', ammo: ['explosive', 'pellet'] },
      },
    ],
  ),
  energyWeapon(
    'TES-12',
    'laser support weapon',
    {
      tl: 12,
      receiver: 'large',
      damageDice: 8,
      source: { kind: 'powerpack', kg: 1, rating: 'heavy' },
      // Often used with a detachable 3kg external unit (Power 3000 → 375 shots,
      // Cr7500) as an alternative to the internal 1kg pack.
      packs: [
        {
          kind: 'powerpack',
          label: 'external power unit',
          kg: 3,
          rating: 'heavy',
        },
      ],
      mods: ['efficientBeam', 'improvedFocus'],
      barrel: 'long',
      stock: 'full',
      accessories: ['scope', 'laserDesignator'],
      furniture: ['bipod'],
    },
    undefined,
    [
      {
        // "Greatly reduces weight and enables a strong soldier to use it as a
        // rifle-like weapon" — so the bipod comes off too (furniture cleared).
        name: 'TEA-12',
        override: { barrel: 'carbine', stock: 'folding', furniture: [] },
      },
    ],
  ),
];

// Closeguard point-defence system → weapons/heavyWeapons.ts (POINT_DEFENCE_SYSTEMS):
// it's vehicle/installation scale (1 Space, kCr), so it lives in the standalone
// catalogue, not as a personal build.
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
