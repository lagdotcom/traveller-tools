/**
 * Field Catalogue Directed Energy Weapon data tables (lasers / microwave guns),
 * transcribed from the FC "Energy Weapons" chapter. Barrels, stocks, furniture
 * and accessories are shared with the firearm tables in `data.ts`; only the
 * energy-exclusive pieces live here.
 *
 * Cost/weight follow the same "% of the modified receiver baseline" model as
 * firearms (see `energy.ts`). The base Signature for directed-energy weapons is
 * NOT given in the supplied text — `evaluateEnergyWeapon` flags it as unverified
 * rather than inventing a confirmed value.
 */
import type {
  EnergyModId,
  EnergyPowerClass,
  EnergyReceiverId,
} from './types.js';

// --- Power classes ----------------------------------------------------------

/** Maximum delivered damage dice per power class (Weak 2D … Heavy 8D). */
export const ENERGY_POWER_CLASS_DICE: Record<EnergyPowerClass, number> = {
  weak: 2,
  light: 3,
  standard: 5,
  heavy: 8,
};

export const ENERGY_POWER_CLASS_LABEL: Record<EnergyPowerClass, string> = {
  weak: 'Weak',
  light: 'Light',
  standard: 'Standard',
  heavy: 'Heavy',
};

// --- Receivers --------------------------------------------------------------

export interface EnergyReceiverDef {
  label: string;
  baseCost: number;
  baseWeight: number;
  /** Base range in metres (before barrel multiplier). */
  baseRange: number;
  /** Highest power class (and thus damage) the receiver can deliver. */
  maxPower: EnergyPowerClass;
}

export const ENERGY_RECEIVERS: Record<EnergyReceiverId, EnergyReceiverDef> = {
  minimal: {
    label: 'Minimal',
    baseCost: 400,
    baseWeight: 0.5,
    baseRange: 50,
    maxPower: 'weak',
  },
  small: {
    label: 'Small',
    baseCost: 800,
    baseWeight: 1.5,
    baseRange: 100,
    maxPower: 'light',
  },
  medium: {
    label: 'Medium',
    baseCost: 2500,
    baseWeight: 3,
    baseRange: 200,
    maxPower: 'standard',
  },
  large: {
    label: 'Large',
    baseCost: 5000,
    baseWeight: 8,
    baseRange: 500,
    maxPower: 'heavy',
  },
};

/**
 * Barrel power caps: a shorter barrel wastes laser power, limiting delivered
 * damage dice regardless of the receiver. Rifle/Long/Very Long are uncapped.
 * Keyed by the shared firearm BarrelId.
 */
export const ENERGY_BARREL_POWER_CAP: Partial<Record<string, number>> = {
  minimal: 2,
  short: 3,
  handgun: 3,
  assault: 4,
  carbine: 4,
};

// --- Power sources ----------------------------------------------------------

/** Powerpack capacity (power points per kg) and the strongest cartridge by TL. */
export const POWERPACK_RATINGS: Array<{
  tl: number;
  perKg: number;
  cartridgeMax: EnergyPowerClass | null;
}> = [
  { tl: 8, perKg: 100, cartridgeMax: null },
  { tl: 9, perKg: 300, cartridgeMax: 'weak' },
  { tl: 10, perKg: 500, cartridgeMax: 'light' },
  { tl: 11, perKg: 700, cartridgeMax: 'standard' },
  { tl: 12, perKg: 1000, cartridgeMax: 'heavy' },
];

/**
 * Standard powerpack form factors (weight in kg); total Power = weight × the
 * TL's power-per-kg (e.g. an internal pack at TL11 = 0.1 × 700 = Power 70).
 */
export const POWERPACK_SIZES = { internal: 0.1, belt: 1, backpack: 3 } as const;

/** Power-points-per-kg available at a tech level (uses the highest TL band ≤ tl). */
export function powerPerKg(tl: number): number {
  let perKg = 0;
  for (const band of POWERPACK_RATINGS) if (tl >= band.tl) perKg = band.perKg;
  return perKg;
}

/** Powerpack cost per kg, by the pack's power class. */
export const POWERPACK_COST_PER_KG: Record<EnergyPowerClass, number> = {
  weak: 500,
  light: 1000,
  standard: 1500,
  heavy: 2500,
};

/** Per-shot disposable cartridge cost/weight, by power class. */
export const ENERGY_CARTRIDGE: Record<
  EnergyPowerClass,
  { cost: number; weight: number }
> = {
  weak: { cost: 5, weight: 0.01 },
  light: { cost: 8, weight: 0.01 },
  standard: { cost: 10, weight: 0.02 },
  heavy: { cost: 15, weight: 0.025 },
};

// --- Energy-exclusive modifications -----------------------------------------

export interface EnergyModDef {
  label: string;
  costMult: number;
  weightMult: number;
  minTL: number;
  /** Base-range multiplier (Efficient Beam Generation). */
  rangeMult?: number;
  /** Flat damage bonus, applied only to lasers doing ≥2D (Improved Beam Focus). */
  damageMod?: number;
  /** Penetration bonus (Intensified Pulse). */
  penetration?: number;
}

export const ENERGY_MODS: Record<EnergyModId, EnergyModDef> = {
  efficientBeam: {
    label: 'Efficient Beam Generation',
    costMult: 1.5,
    weightMult: 0.75,
    minTL: 11,
    rangeMult: 1.25,
  },
  improvedFocus: {
    label: 'Improved Beam Focus',
    costMult: 1.25,
    weightMult: 1,
    minTL: 11,
    damageMod: 3,
  },
  intensifiedPulse: {
    label: 'Intensified Pulse',
    costMult: 1.25,
    weightMult: 1.1,
    minTL: 12,
    penetration: 1,
  },
  variableIntensity: {
    label: 'Variable Intensity',
    costMult: 1.15,
    weightMult: 1.1,
    minTL: 10,
  },
};

export const ENERGY_WEAPON_TYPE_LABEL: Record<string, string> = {
  laser: 'Laser',
  microwave: 'Microwave',
};
