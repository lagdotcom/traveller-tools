import {
  ARMOUR_TYPES,
  type ArmourTypeId,
  type BridgeId,
  type CarriedCraft,
  type ComputerId,
  COMPUTERS,
  type CrewType,
  HULL_CONFIGS,
  type HullConfigId,
  type MountId,
  MOUNTS,
  POWER_PLANTS,
  type PowerPlantId,
  type SensorId,
  SENSORS,
  type ShipParams,
  SOFTWARE_TYPES,
  type SoftwareEntry,
  type SoftwareTypeId,
  SYSTEM_TYPES,
  type SystemEntry,
  type SystemTypeId,
  type WeaponEntry,
  type WeaponId,
  WEAPONS,
} from './ship.js';

/** A named ship design: the parameters plus presentation metadata. */
export interface ShipDefinition {
  name: string;
  description?: string;
  params: ShipParams;
}

/** The on-disk / export envelope, so files are self-describing and versioned. */
export const SHIP_FORMAT = 'traveller-tools/ship';
export const SHIP_FORMAT_VERSION = 1;
export interface ShipDocument {
  format: typeof SHIP_FORMAT;
  version: number;
  ship: ShipDefinition;
}

/** A complete, valid default loadout (the builder's starting 100-ton hull). */
export const DEFAULT_SHIP_PARAMS: ShipParams = {
  hullTons: 100,
  tl: 12,
  hullConfig: 'standard',
  thrust: 1,
  jump: 1,
  powerPlantType: 'fusionTL12',
  powerPlantTons: 4,
  fuelTons: 12,
  bridge: 'standard',
  armourType: 'crystaliron',
  armourPoints: 0,
  computer: '/5',
  computerBis: false,
  sensors: 'basic',
  staterooms: 2,
  lowBerths: 0,
  commonAreasTons: 0,
  fuelScoop: false,
  reinforcementTons: 0,
  systems: [],
  software: [],
  weapons: [],
  carried: [],
  crewType: 'commercial',
};

// --- Validation helpers -----------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

/** Coerce to one of a set of allowed keys, else fall back. */
function pick<T extends string>(
  v: unknown,
  allowed: Record<T, unknown>,
  fallback: T,
): T {
  return typeof v === 'string' && v in allowed ? (v as T) : fallback;
}

function normalizeSystems(v: unknown): SystemEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObject)
    .filter((e) => typeof e.type === 'string' && e.type in SYSTEM_TYPES)
    .map((e) => ({
      type: e.type as SystemTypeId,
      amount: num(e.amount, 0),
    }));
}

function normalizeSoftware(v: unknown): SoftwareEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObject)
    .filter((e) => typeof e.type === 'string' && e.type in SOFTWARE_TYPES)
    .map((e) => ({
      type: e.type as SoftwareTypeId,
      level: num(e.level, 0),
    }));
}

function normalizeWeapons(v: unknown): WeaponEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObject)
    .filter((e) => typeof e.mount === 'string' && e.mount in MOUNTS)
    .map((e) => ({
      mount: e.mount as MountId,
      weapon:
        e.weapon === 'none' ||
        (typeof e.weapon === 'string' && e.weapon in WEAPONS)
          ? (e.weapon as WeaponId | 'none')
          : 'none',
    }));
}

function normalizeCarried(v: unknown): CarriedCraft[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObject).map((e) => ({
    kind: 'ship' as const,
    name: typeof e.name === 'string' ? e.name : 'Craft',
    tons: num(e.tons, 0),
    cost: num(e.cost, 0),
    count: num(e.count, 1),
    ...(isObject(e.ship) ? { ship: normalizeParams(e.ship) } : {}),
  }));
}

/**
 * Coerce arbitrary parsed JSON into a complete, valid ShipParams, filling any
 * missing or malformed field from DEFAULT_SHIP_PARAMS. Never throws.
 */
export function normalizeParams(input: unknown): ShipParams {
  const p = isObject(input) ? input : {};
  const d = DEFAULT_SHIP_PARAMS;
  return {
    hullTons: num(p.hullTons, d.hullTons),
    tl: num(p.tl, d.tl),
    hullConfig: pick<HullConfigId>(p.hullConfig, HULL_CONFIGS, d.hullConfig),
    thrust: num(p.thrust, d.thrust),
    jump: num(p.jump, d.jump),
    powerPlantType: pick<PowerPlantId>(
      p.powerPlantType,
      POWER_PLANTS,
      d.powerPlantType,
    ),
    powerPlantTons: num(p.powerPlantTons, d.powerPlantTons),
    fuelTons: num(p.fuelTons, d.fuelTons),
    bridge: pick<BridgeId>(
      p.bridge,
      { standard: 1, cockpit: 1, holographic: 1 },
      d.bridge,
    ),
    armourType: pick<ArmourTypeId>(p.armourType, ARMOUR_TYPES, d.armourType),
    armourPoints: num(p.armourPoints, d.armourPoints),
    computer: pick<ComputerId>(p.computer, COMPUTERS, d.computer),
    computerBis: bool(p.computerBis, d.computerBis),
    sensors: pick<SensorId>(p.sensors, SENSORS, d.sensors),
    staterooms: num(p.staterooms, d.staterooms),
    lowBerths: num(p.lowBerths, d.lowBerths),
    commonAreasTons: num(p.commonAreasTons, d.commonAreasTons),
    fuelScoop: bool(p.fuelScoop, d.fuelScoop),
    reinforcementTons: num(p.reinforcementTons, d.reinforcementTons),
    systems: normalizeSystems(p.systems),
    software: normalizeSoftware(p.software),
    weapons: normalizeWeapons(p.weapons),
    carried: normalizeCarried(p.carried),
    crewType: pick<CrewType>(
      p.crewType,
      { commercial: 1, military: 1 },
      d.crewType,
    ),
  };
}

// --- Serialize / parse ------------------------------------------------------

/** Pretty-print a ship as a versioned JSON document for export/saving. */
export function serializeShip(def: ShipDefinition): string {
  const doc: ShipDocument = {
    format: SHIP_FORMAT,
    version: SHIP_FORMAT_VERSION,
    ship: {
      name: def.name,
      ...(def.description ? { description: def.description } : {}),
      params: normalizeParams(def.params),
    },
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Parse a ship document (or a bare ship/params object) back into a
 * ShipDefinition. Tolerant of partial input — unknown fields are defaulted —
 * but throws a friendly error if the text isn't valid JSON.
 */
export function parseShip(text: string): ShipDefinition {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!isObject(data)) throw new Error('Expected a ship object.');

  // Accept either the {format, version, ship} envelope or a bare ship/params.
  const ship: Record<string, unknown> = isObject(data.ship) ? data.ship : data;
  const params = 'params' in ship ? ship.params : ship;
  const name =
    typeof ship.name === 'string' && ship.name.trim()
      ? ship.name.trim()
      : 'Imported Ship';
  return {
    name,
    ...(typeof ship.description === 'string'
      ? { description: ship.description }
      : {}),
    params: normalizeParams(params),
  };
}
