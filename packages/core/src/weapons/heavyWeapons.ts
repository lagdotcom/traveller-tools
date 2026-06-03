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
  reload: number;
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
  // TODO AC-25 AUTOMATIC CANNON
  // TODO AC-40 MEDIUM AUTOMATIC CANNON
  // TODO AC-60H HEAVY AUTOCANNON
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
        reload: 3000,
        traits: { Blast: 12 },
      },
      {
        label: 'Canister',
        range: 1000,
        damage: d(8),
        reload: 2400,
        traits: { Blast: 5, 'Lo-Pen': 2 },
      },
      {
        label: 'Rocket-Assisted Penetrator',
        range: 1200,
        damage: d(4),
        reload: 6000,
        traits: { AP: 16, Blast: 2 },
      },
    ],
    notes:
      'A 150mm vehicle cannon that also launches 150mm missiles (e.g. TAC-150) from a container; standard mount = an 8-Space large turret, 6-shell revolver autoloader.',
  },
  // TODO LC-85 LOW-PRESSURE CANNON
  // TODO VRF-3 VRF GAUSS SUPPORT WEAPON
  // TODO MPS-22 GAUSS AUTOCANNON
  // TODO AGGRESSOR 90MM MULTIPLE MORTAR
  // TODO DOMINATOR 200MM SIEGE MORTAR
  // TODO FA-150 GUN-HOWITZER
  // TODO AIRSPACE DEFENCE SYSTEM
  // TODO ASA-40 HEAVY AEROSPACE DEFENCE MISSILE SYSTEM
  // TODO P-12 VEHICULAR SUPPORT WEAPON (PLASMA)
  // TODO RESGAW-220 ROCKET ARTILLERY SYSTEM
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
  reload: number;
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
    reload: 10000,
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
    reload: 12000,
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
    reload: 22000,
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
    reload: 16000,
    // Anti-radiation: DM+4 vs emitting sensors, DM+6 home-on-jam.
    damage: d(6),
    traits: { Blast: 12, 'One-Use': true, Smart: true },
  },
};

/** One weapon fit of a point-defence system (a self-contained variant). */
export interface PointDefenceFit {
  label: string;
  /** Range in metres. */
  range: number;
  damage: Damage;
  weight: number;
  cost: number;
  magazine: number;
  /** Loaded-magazine reload price (Cr). */
  reload: number;
  signature: string;
  traits: Traits;
}

/**
 * A point-defence system (FC Support Weaponry) — a self-contained mount + sensors
 * + one of several weapon fits. Vehicle/installation scale (it occupies Spaces and
 * costs kCr), so reference data here rather than a personal build.
 */
export interface PointDefenceSystemDef {
  label: string;
  minTL: number;
  /** Mounting Spaces occupied. */
  spaces: number;
  traits: Traits;
  notes?: string;
  fits: PointDefenceFit[];
}

export const POINT_DEFENCE_SYSTEMS: Record<string, PointDefenceSystemDef> = {
  closeguard: {
    label: 'Closeguard Semi-Autonomous Point Defence System',
    minTL: 9,
    spaces: 1,
    traits: { 'Point Defence': 2 },
    notes:
      'Internal batteries (36h); short-range radar + thermal sensors. Point Defence 2: engages up to two targets of the same general type at DM+2 to hit.',
    fits: [
      {
        label: 'Machinegun',
        range: 375,
        damage: d(3, 3),
        weight: 32,
        cost: 123000,
        magazine: 50,
        reload: 50,
        signature: 'Physical (normal)',
        traits: { Auto: 3, 'Slow Loader': 4 },
      },
      {
        label: 'Twin RF Heavy Machinegun',
        range: 550,
        damage: d(7),
        weight: 110,
        cost: 175000,
        magazine: 50,
        reload: 750,
        signature: 'Physical (high)',
        traits: { Auto: 3, Bulky: true, 'Slow Loader': 4 },
      },
      {
        label: 'Twin Laser Support Weapon',
        range: 625,
        damage: d(8),
        weight: 45,
        cost: 160000,
        magazine: 125,
        reload: 5000,
        signature: 'Emissions (low)',
        traits: { Bulky: true, 'Zero-G': true },
      },
    ],
  },
};
