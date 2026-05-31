/**
 * Field Catalogue Projector data tables (flame / cryo / chemical sprayers),
 * transcribed from the FC "Projectors" section. A projector is built from a
 * Structure (frame), a Propellant and a Fuel; the designer chooses how many kg
 * of fuel and propellant to carry.
 *
 * Cost/weight model (see `projector.ts`): the frame weighs a percentage of the
 * payload and the whole weapon costs a flat Cr/kg of its loaded weight; fuel and
 * propellant are consumables priced per kg (shown as the reload/"magazine" cost,
 * like a firearm's loaded magazine).
 */
import type {
  Damage,
  ProjectorFuelId,
  ProjectorPropellantId,
  ProjectorStructureId,
  Traits,
} from './types.js';

const d = (dice: number, mod = 0): Damage => ({ dice, die: 6, mod });

// --- Structures -------------------------------------------------------------

export interface ProjectorStructureDef {
  label: string;
  /** Frame weight as a fraction of the payload (fuel + propellant) carried. */
  weightPct: number;
  /** Maximum payload in kg before the weapon becomes unwieldy (DM-2 penalties). */
  maxPayload: number;
  /** Cost in Credits per kg of the weapon's total (loaded) weight. */
  costPerKg: number;
  /** Blast trait level. */
  blast: number;
  quickdraw: number;
  /** Hand projectors halve the weapon's effective range. */
  halfRange?: boolean;
}

export const PROJECTOR_STRUCTURES: Record<
  ProjectorStructureId,
  ProjectorStructureDef
> = {
  large: {
    label: 'Large',
    weightPct: 0.3,
    maxPayload: 20,
    costPerKg: 50,
    blast: 3,
    quickdraw: 2,
  },
  compact: {
    label: 'Compact',
    weightPct: 0.2,
    maxPayload: 10,
    costPerKg: 100,
    blast: 2,
    quickdraw: 0,
  },
  hand: {
    label: 'Hand',
    weightPct: 0.1,
    maxPayload: 2,
    costPerKg: 25,
    blast: 1,
    quickdraw: 2,
    halfRange: true,
  },
};

// --- Propellants ------------------------------------------------------------

export interface ProjectorPropellantDef {
  label: string;
  minTL: number;
  /** Attacks delivered per kg of propellant. */
  attacksPerKg: number;
  /** Effective range in metres. */
  range: number;
  /** Consumable (reload) cost per kg. */
  costPerKg: number;
  /** Generated gas needs one-off machinery, priced per kg of propellant. */
  machineryPerKg?: number;
}

export const PROJECTOR_PROPELLANTS: Record<
  ProjectorPropellantId,
  ProjectorPropellantDef
> = {
  compressed: {
    label: 'Compressed Gas',
    minTL: 4,
    attacksPerKg: 4,
    range: 20,
    costPerKg: 100,
  },
  supercompressed: {
    label: 'Supercompressed Gas',
    minTL: 7,
    attacksPerKg: 6,
    range: 25,
    costPerKg: 250,
  },
  generated: {
    label: 'Generated Gas',
    minTL: 9,
    attacksPerKg: 10,
    range: 30,
    costPerKg: 200, // reagents (consumable)
    machineryPerKg: 500, // one-off machinery (build cost)
  },
};

// --- Fuels ------------------------------------------------------------------

export interface ProjectorFuelDef {
  label: string;
  minTL: number;
  /** Damage per attack (null = a non-damaging effect such as an irritant). */
  damage: Damage | null;
  /** Consumable (reload) cost per kg. */
  costPerKg: number;
  /** Suppressant foam halves the weapon's effective range. */
  halfRange?: boolean;
  traits: Traits;
}

/**
 * reconcile: the FC fuel *table* lists Liquid as 4D / Cr75 — identical to Jellied
 * — but the prose says "Liquid fuel does Damage 3D and costs Cr25 per kg." The
 * prose value is distinct and keeps the TL progression (3D < 4D < 5D), so it is
 * seeded here; the table row looks like a copy of the Jellied row.
 */
export const PROJECTOR_FUELS: Record<ProjectorFuelId, ProjectorFuelDef> = {
  liquid: {
    label: 'Liquid',
    minTL: 4,
    damage: d(3),
    costPerKg: 25,
    traits: { Incendiary: 1, Burn: 1 },
  },
  jellied: {
    label: 'Jellied',
    minTL: 5,
    damage: d(4),
    costPerKg: 75,
    traits: { Incendiary: 1, 'Burn (D3+1)': true },
  },
  irritant: {
    label: 'Irritant',
    minTL: 6,
    damage: null,
    costPerKg: 25,
    traits: { Incapacitant: true },
  },
  suppressant: {
    label: 'Suppressant',
    minTL: 6,
    damage: d(2),
    costPerKg: 25,
    halfRange: true,
    traits: {},
  },
  battlechem: {
    label: 'Battlechem',
    minTL: 8,
    damage: null,
    costPerKg: 300,
    traits: { Battlechem: true },
  },
  advanced: {
    label: 'Advanced',
    minTL: 9,
    damage: d(5),
    costPerKg: 150,
    traits: { 'Incendiary (D3+1)': true, 'Burn (D3+1)': true },
  },
  cryogenic: {
    label: 'Cryogenic',
    minTL: 10,
    damage: d(4),
    costPerKg: 100,
    traits: { Cryogenic: true },
  },
};

/** All projectors carry the Hazardous trait, typically at this level. */
export const PROJECTOR_HAZARDOUS = -6;
