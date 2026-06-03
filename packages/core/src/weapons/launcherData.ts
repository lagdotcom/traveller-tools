/**
 * Field Catalogue Launcher data tables (grenade / rocket / missile launchers),
 * transcribed from the FC "Launchers and Support Weapons" section plus the
 * warhead values from the "Grenade Weapons" table (Hand-grenade column).
 *
 * A launcher's effect comes from the warhead it fires — "warheads and payloads
 * are not considered part of the weapon itself" — so the warhead only shapes the
 * displayed profile and its price is the reload cost, not part of the build.
 */
import type {
  Credits,
  Kilograms,
  Metres,
  Multiplier,
  TechLevel,
} from '../flavours.js';
import type {
  Damage,
  DeliveryId,
  LauncherReceiverId,
  MissileWarheadId,
  Traits,
} from './types.js';

const d = (dice: number, mod = 0): Damage => ({ dice, die: 6, mod });

// --- Delivery systems -------------------------------------------------------

/**
 * How a launcher delivers a warhead. The warhead supplies the damage/blast/
 * traits (the hand-grenade payload); the delivery system sets the **range** and
 * multiplies the round's **cost/weight** off the payload.
 *
 * reconcile: the worked munition examples don't follow these text multipliers
 * consistently (e.g. the plasma RAM round is priced at ×1, the anti-armour RPG at
 * ×3 cost/×10 weight and is a *larger* warhead than the hand payload). So the
 * profile (range + payload damage/traits) matches the book, but the round
 * cost/weight here are the FC text multipliers and may differ from a specific
 * worked munition — and RPG/missile "larger warhead" damage is flagged.
 */
export interface DeliveryDef {
  label: string;
  minTL: TechLevel;
  /** Round cost as a multiple of the payload (hand-grenade) price. */
  costMult: Multiplier;
  /** Round weight as a multiple of the payload weight. */
  weightMult: Multiplier;
  /** Base range in metres. */
  range: Metres;
  traits: Traits;
  /** RPG/missile carry a larger warhead than the hand payload (damage flagged). */
  largerWarhead?: boolean;
}

export const DELIVERY_SYSTEMS: Record<DeliveryId, DeliveryDef> = {
  rifleGrenade: {
    label: 'Rifle Grenade',
    minTL: 5,
    costMult: 2,
    // reconcile: the FC prose says a rifle grenade weighs "50% more" (×1.5), but
    // the worked Anti-Armour Rifle Grenade is 0.625kg = the 0.5kg hand payload
    // ×1.25. We follow the worked example (the oracle); cost ×2 matches both.
    weightMult: 1.25,
    range: 100,
    traits: {},
  },
  cartridge: {
    label: 'Cartridge',
    minTL: 6,
    costMult: 2.5,
    weightMult: 1,
    range: 200,
    traits: {},
  },
  ram: {
    label: 'RAM',
    minTL: 8,
    costMult: 3,
    weightMult: 1,
    range: 300,
    traits: {},
  },
  rpg: {
    label: 'RPG',
    minTL: 5,
    costMult: 5,
    weightMult: 5,
    range: 500,
    traits: { Inaccurate: -2 },
    largerWarhead: true,
  },
};

// --- Launcher receivers -----------------------------------------------------

export interface LauncherReceiverDef {
  label: string;
  cost: Credits;
  weight: Kilograms;
  /** Base range in metres. */
  range: Metres;
  /** Fixed magazine capacity, or 'varies' (support launchers — user sets it). */
  capacity: number | 'varies';
  minTL: TechLevel;
  traits: Traits;
}

export const LAUNCHER_RECEIVERS: Record<
  LauncherReceiverId,
  LauncherReceiverDef
> = {
  tubeSingleLight: {
    label: 'Tube · Single Shot, Light',
    cost: 200,
    weight: 1.5,
    range: 200,
    capacity: 1,
    minTL: 6,
    traits: { Bulky: true },
  },
  tubeSingleStandard: {
    label: 'Tube · Single Shot, Standard',
    cost: 300,
    weight: 2,
    range: 300,
    capacity: 1,
    minTL: 6,
    traits: { Bulky: true },
  },
  tubeSemiLight: {
    label: 'Tube · Semi-Automatic, Light',
    cost: 400,
    weight: 2.5,
    range: 200,
    capacity: 3,
    minTL: 6,
    traits: { Bulky: true },
  },
  tubeSemiStandard: {
    label: 'Tube · Semi-Automatic, Standard',
    cost: 500,
    weight: 3.5,
    range: 300,
    capacity: 3,
    minTL: 6,
    traits: { 'Very Bulky': true },
  },
  tubeSupportLight: {
    label: 'Tube · Support, Light',
    cost: 2000,
    weight: 10,
    range: 200,
    capacity: 'varies',
    minTL: 6,
    traits: {},
  },
  tubeSupportStandard: {
    label: 'Tube · Support, Standard',
    cost: 2000,
    weight: 15,
    range: 300,
    capacity: 'varies',
    minTL: 6,
    traits: {},
  },
  reuseSingleLight: {
    label: 'Reusable · Single Shot, Light',
    cost: 500,
    weight: 10,
    range: 1000,
    capacity: 1,
    minTL: 6,
    traits: { Bulky: true },
  },
  reuseSingleHeavy: {
    label: 'Reusable · Single Shot, Heavy',
    cost: 1000,
    weight: 15,
    range: 1200,
    capacity: 1,
    minTL: 6,
    traits: { Bulky: true },
  },
  reuseMagLight: {
    label: 'Reusable · Magazine-Fed, Light',
    cost: 750,
    weight: 12,
    range: 1000,
    capacity: 3,
    minTL: 6,
    traits: { Bulky: true },
  },
  reuseMagHeavy: {
    label: 'Reusable · Magazine-Fed, Heavy',
    cost: 500,
    weight: 20,
    range: 1200,
    capacity: 3,
    minTL: 6,
    traits: { 'Very Bulky': true },
  },
  fieldLight2: {
    label: 'Field Launcher, Light, 2-Tube',
    cost: 25000,
    weight: 25,
    range: 3000,
    capacity: 2,
    minTL: 6,
    traits: {},
  },
  fieldLight4: {
    label: 'Field Launcher, Light, 4-Tube',
    cost: 40000,
    weight: 35,
    range: 3000,
    capacity: 4,
    minTL: 6,
    traits: {},
  },
  fieldHeavy2: {
    label: 'Field Launcher, Heavy, 2-Tube',
    cost: 50000,
    weight: 40,
    range: 10000,
    capacity: 2,
    minTL: 6,
    traits: {},
  },
  fieldHeavy4: {
    label: 'Field Launcher, Heavy, 4-Tube',
    cost: 70000,
    weight: 50,
    range: 10000,
    capacity: 4,
    minTL: 6,
    traits: {},
  },
};

/** A guidance system adds 50% to the cost of the launcher. */
export const GUIDANCE_COST_MULT = 1.5;

// --- Missile warheads (parked) ----------------------------------------------

/** One firing mode of a missile warhead (the first listed is the primary). */
export interface MissileMode {
  label: string;
  damage: Damage;
  traits: Traits;
}

/**
 * A complete, pre-built guided round (missile) with fixed stats and multiple
 * firing modes — NOT the grenade-payload × delivery model. Per FC "Support
 * Weapons", missiles/RPGs are fired from reusable / field launchers (whose
 * receiver includes barrel + stock) and are self-contained rounds: the round's
 * own damage/range/traits/cost/weight govern (no delivery multiplier), and the
 * full missile load weight is added to the weapon. `evaluateLauncher` loads one
 * via `LauncherParams.missile` (overriding the grenade payload) and shows the
 * primary (first) mode; the FC gives no construction rule, so these are tabled.
 */
export interface MissileWarheadDef {
  label: string;
  minTL: TechLevel;
  /** Range in metres. */
  range: Metres;
  weight: Kilograms;
  cost: Credits;
  /** Traits shared across every mode (e.g. Smart). */
  traits: Traits;
  modes: MissileMode[];
}

export const MISSILE_WARHEADS: Record<MissileWarheadId, MissileWarheadDef> = {
  av7: {
    label: 'AV-7 Missile',
    minTL: 10,
    range: 1000,
    weight: 6,
    cost: 12000,
    traits: { Smart: true },
    modes: [
      { label: 'Contact', damage: d(6), traits: { AP: 12, Blast: 4 } },
      { label: 'Proximity', damage: d(4), traits: { AP: 8, Blast: 12 } },
    ],
  },
};
