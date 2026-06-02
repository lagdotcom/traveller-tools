/**
 * FC "Heavy Weaponry" — vehicle / ship-scale hardware. Note the units: weight in
 * TONS, the weapon occupies turret **Spaces**, ranges are in km. This is the
 * vehicle/ship weapon domain, NOT the personal (kg-scale) weapon builder, so it
 * is deliberately kept separate and is NOT wired into `evaluateWeapon`.
 *
 * A standalone reference catalogue (the FC gives these as fixed catalogue items,
 * not a construction system). Deliberately not hooked into any vehicle/ship
 * builder — it stands on its own, exported for lookup. The Blackjack ↔ TAC-150
 * relationship mirrors the personal launcher ↔ missile one, a scale up: a
 * turreted gun/launcher that fires shell variants or loads a self-contained
 * heavy missile.
 */
import type { Damage, Traits } from './types.js';

const d = (dice: number, mod = 0): Damage => ({ dice, die: 6, mod });

/** One round a heavy gun fires (the gun is fixed; the round varies). */
export interface HeavyRoundDef {
  label: string;
  /** Effective range in metres. */
  range: number;
  damage: Damage;
  /** Loaded-magazine reload price (Cr). */
  magazineCr: number;
  traits: Traits;
}

/** A heavy (vehicle-scale) gun: tons + turret Spaces, firing several round types. */
export interface HeavyGunDef {
  label: string;
  minTL: number;
  /** Weight in tons. */
  weightTons: number;
  /** Turret Spaces occupied. */
  spaces: number;
  cost: number;
  magazine: number;
  rounds: HeavyRoundDef[];
  notes?: string;
}

export const HEAVY_GUNS: Record<string, HeavyGunDef> = {
  blackjack: {
    label: 'Blackjack Gun/Missile System',
    minTL: 8,
    weightTons: 0.75,
    spaces: 3,
    cost: 80000,
    magazine: 6,
    rounds: [
      {
        label: 'Explosive',
        range: 1000,
        damage: d(10),
        magazineCr: 3000,
        traits: { Blast: 12 },
      },
      {
        label: 'Canister',
        range: 1000,
        damage: d(8),
        magazineCr: 2400,
        traits: { Blast: 5, 'Lo-Pen': 2 },
      },
      {
        label: 'Rocket-Assisted Penetrator',
        range: 1200,
        damage: d(4),
        magazineCr: 6000,
        traits: { AP: 16, Blast: 2 },
      },
    ],
    notes:
      'A 150mm vehicle cannon that also launches 150mm missiles (e.g. TAC-150) from a container; standard mount = an 8-Space large turret, 6-shell revolver autoloader.',
  },
};

/** A heavy (vehicle-scale) missile — a self-contained, one-use, smart round. */
export interface HeavyMissileDef {
  label: string;
  minTL: number;
  /** Range in metres. */
  range: number;
  /** Weight in tons. */
  weightTons: number;
  /** Turret Spaces occupied. */
  spaces: number;
  cost: number;
  magazine: number;
  /** Loaded-magazine reload price (Cr). */
  magazineCr: number;
  damage: Damage;
  traits: Traits;
}

/**
 * TAC-150 family — 150mm missiles fired from a Blackjack or any 150mm launcher.
 * A common bus/propulsion with the warhead fitted as a unit (AA / AT / ATS / AR).
 */
export const HEAVY_MISSILES: Record<string, HeavyMissileDef> = {
  tac150aa: {
    label: 'TAC-150AA',
    minTL: 9,
    range: 5000,
    weightTons: 0.25,
    spaces: 1,
    cost: 10000,
    magazine: 2,
    magazineCr: 10000,
    damage: d(6),
    traits: { Blast: 12, 'One-Use': true, Smart: true },
  },
  tac150at: {
    label: 'TAC-150AT',
    minTL: 9,
    range: 5000,
    weightTons: 0.25,
    spaces: 1,
    cost: 12000,
    magazine: 2,
    magazineCr: 12000,
    damage: d(8),
    traits: { AP: 12, Blast: 4, 'One-Use': true, Smart: true },
  },
  tac150ats: {
    label: 'TAC-150ATS',
    minTL: 9,
    range: 5000,
    weightTons: 0.25,
    spaces: 1,
    cost: 22000,
    magazine: 2,
    magazineCr: 22000,
    // Ignores reactive armour (shaped-charge positioning).
    damage: d(8),
    traits: { AP: 12, Blast: 4, 'One-Use': true, Smart: true },
  },
  tac150ar: {
    label: 'TAC-150AR',
    minTL: 9,
    range: 5000,
    weightTons: 0.25,
    spaces: 1,
    cost: 16000,
    magazine: 2,
    magazineCr: 16000,
    // Anti-radiation: DM+4 vs emitting sensors, DM+6 home-on-jam.
    damage: d(6),
    traits: { Blast: 12, 'One-Use': true, Smart: true },
  },
};
