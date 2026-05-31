/**
 * Field Catalogue Launcher data tables (grenade / rocket / missile launchers),
 * transcribed from the FC "Launchers and Support Weapons" section plus the
 * warhead values from the "Grenade Weapons" table (Hand-grenade column).
 *
 * A launcher's effect comes from the warhead it fires — "warheads and payloads
 * are not considered part of the weapon itself" — so the warhead only shapes the
 * displayed profile and its price is the reload cost, not part of the build.
 */
import type { Damage, LauncherReceiverId, Traits, WarheadId } from './types.js';

const d = (dice: number, mod = 0): Damage => ({ dice, die: 6, mod });

// --- Launcher receivers -----------------------------------------------------

export interface LauncherReceiverDef {
  label: string;
  cost: number;
  weight: number;
  /** Base range in metres. */
  range: number;
  /** Fixed magazine capacity, or 'varies' (support launchers — user sets it). */
  capacity: number | 'varies';
  minTL: number;
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

// --- Warheads (FC "Grenade Weapons" — Hand-grenade column) ------------------

export interface WarheadDef {
  label: string;
  minTL: number;
  /** Damage per hit (null = an effect-only payload, e.g. smoke / gas). */
  damage: Damage | null;
  /** Munition cost (the reload price; not part of the launcher build). */
  cost: number;
  /** Munition weight (added to the launcher's loaded weight). */
  weight: number;
  traits: Traits;
}

/**
 * reconcile: these are the FC *thrown* Hand-grenade values. The launcher-calibre
 * munition table ("see page 126") is not in the supplied text, so the profile
 * uses the warhead's own listed values and `evaluateLauncher` flags the mapping
 * to launcher calibre as unverified.
 */
export const WARHEADS: Record<WarheadId, WarheadDef> = {
  fragmentation: {
    label: 'Fragmentation',
    minTL: 6,
    damage: d(5),
    cost: 30,
    weight: 0.5,
    traits: { Blast: 9, 'Lo-Pen': 2 },
  },
  antiArmour: {
    label: 'Anti-Armour',
    minTL: 6,
    damage: d(4),
    cost: 50,
    weight: 0.1,
    traits: { AP: 8, Blast: 1 },
  },
  breacher: {
    label: 'Breacher',
    minTL: 8,
    damage: d(4),
    cost: 60,
    weight: 0.5,
    traits: { AP: 12, Blast: 1 },
  },
  smoke: {
    label: 'Smoke',
    minTL: 6,
    damage: null,
    cost: 15,
    weight: 0.5,
    traits: { Blast: 9 },
  },
  stun: {
    label: 'Stun',
    minTL: 7,
    damage: d(3),
    cost: 30,
    weight: 0.5,
    traits: { Blast: 9, Stun: true },
  },
  gasIncapacitant: {
    label: 'Gas, Incapacitant',
    minTL: 7,
    damage: null,
    cost: 50,
    weight: 0.5,
    traits: { Blast: 3, Incapacitant: true },
  },
  gasToxin: {
    label: 'Gas, Toxin',
    minTL: 9,
    damage: null,
    cost: 250,
    weight: 0.5,
    traits: { Blast: 3, Toxin: true },
  },
  incendiary: {
    label: 'Incendiary, Antipersonnel',
    minTL: 8,
    damage: d(2),
    cost: 75,
    weight: 0.5,
    traits: { Blast: 15, Incendiary: 1, Burn: 2 },
  },
  plasma: {
    label: 'Plasma',
    minTL: 12,
    damage: d(8),
    cost: 200,
    weight: 0.8,
    traits: { Blast: 6, 'Lo-Pen': 2, Incendiary: 4 },
  },
  plasmaAntiArmour: {
    label: 'Plasma, Anti-Armour',
    minTL: 12,
    damage: d(8),
    cost: 250,
    weight: 0.9,
    traits: { Blast: 3, AP: 6, Incendiary: 4 },
  },
  microgrenade: {
    label: 'Microgrenade',
    minTL: 8,
    damage: d(2),
    cost: 150,
    weight: 0.75,
    traits: { Blast: 3, 'Lo-Pen': 3 },
  },
  multipleProjectile: {
    label: 'Multiple Projectile',
    minTL: 6,
    damage: d(6),
    cost: 15,
    weight: 0.9,
    traits: { 'Lo-Pen': 3, Spread: 4 },
  },
  cryogenic: {
    label: 'Cryogenic',
    minTL: 14,
    damage: d(5),
    cost: 150,
    weight: 0.6,
    traits: { Blast: 5 },
  },
  emp: {
    label: 'Electromagnetic Pulse (EMP)',
    minTL: 9,
    damage: null,
    cost: 100,
    weight: 0.5,
    traits: { 'Pulse Intensity': 9 },
  },
};
