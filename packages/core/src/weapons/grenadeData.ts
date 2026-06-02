/**
 * Field Catalogue thrown-grenade catalogue, transcribed from the FC "Grenade
 * Weapons" table (Mini + Hand columns). Grenades aren't "designed" — they're
 * catalogue items — so this is a lookup table; `grenade.ts` just resolves the
 * chosen type/size to a profile.
 *
 * A "—" Mini entry in the book means that payload isn't produced as a
 * mini-grenade; those are `mini: null` here.
 */
import type { Damage, GrenadeTypeId, Traits } from './types.js';

const d = (dice: number, mod = 0): Damage => ({ dice, die: 6, mod });

/** Cost (Cr), weight (kg), per-hit damage and traits for one grenade size. */
export interface GrenadeSizeStats {
  cost: number;
  weight: number;
  damage: Damage | null;
  traits: Traits;
}

export interface GrenadeDef {
  label: string;
  minTL: number;
  /** Mini-grenade stats, or null when that payload isn't made as a mini. */
  mini: GrenadeSizeStats | null;
  hand: GrenadeSizeStats;
}

export const GRENADES: Record<GrenadeTypeId, GrenadeDef> = {
  aerosolAntilaser: {
    label: 'Aerosol, Antilaser',
    minTL: 9,
    mini: { cost: 10, weight: 0.3, damage: null, traits: { Blast: 6 } },
    hand: { cost: 15, weight: 0.5, damage: null, traits: { Blast: 9 } },
  },
  aerosolCorrosive: {
    label: 'Aerosol, Corrosive',
    minTL: 10,
    mini: null,
    hand: {
      cost: 100,
      weight: 0.75,
      damage: d(3),
      traits: { Blast: 9, Corrosive: true },
    },
  },
  antiArmour: {
    label: 'Anti-Armour',
    minTL: 6,
    mini: null,
    // reconcile: the grenade table prints 0.1kg, but the worked Anti-Armour Hand
    // Grenade is 0.5kg (every other hand grenade is 0.5kg); 0.1 is a typo.
    hand: { cost: 50, weight: 0.5, damage: d(4), traits: { AP: 8, Blast: 1 } },
  },
  battlechem: {
    label: 'Battlechem',
    minTL: 8,
    mini: { cost: 75, weight: 0.3, damage: null, traits: { Blast: 4 } },
    hand: { cost: 125, weight: 0.5, damage: null, traits: { Blast: 9 } },
  },
  baton: {
    label: 'Baton',
    minTL: 7,
    mini: { cost: 5, weight: 0.3, damage: null, traits: { Stun: '1D' } },
    hand: {
      cost: 10,
      weight: 0.5,
      damage: null,
      traits: { Stun: '2D' },
    },
  },
  breacher: {
    label: 'Breacher',
    minTL: 8,
    mini: {
      cost: 25,
      weight: 0.3,
      damage: d(2),
      traits: { Blast: 1, AP: 4 },
    },
    hand: {
      cost: 60,
      weight: 0.5,
      damage: d(4),
      traits: { AP: 12, Blast: 1 },
    },
  },
  corrosive: {
    label: 'Corrosive',
    minTL: 10,
    mini: null,
    hand: {
      cost: 75,
      weight: 0.5,
      damage: d(2),
      traits: { Blast: 4, Corrosive: true },
    },
  },
  cryogenic: {
    label: 'Cryogenic',
    minTL: 14,
    mini: null,
    hand: { cost: 150, weight: 0.6, damage: d(5), traits: { Blast: 5 } },
  },
  distraction: {
    label: 'Distraction',
    minTL: 7,
    mini: {
      cost: 25,
      weight: 0.3,
      damage: null,
      traits: { Distraction: 'typical' },
    },
    hand: {
      cost: 60,
      weight: 0.6,
      damage: null,
      traits: { Distraction: 'potent' },
    },
  },
  emp: {
    label: 'Electromagnetic Pulse (EMP)',
    minTL: 9,
    mini: null,
    hand: {
      cost: 100,
      weight: 0.5,
      damage: null,
      traits: { 'Pulse Intensity': 9 },
    },
  },
  empAdvanced: {
    label: 'EMP, Advanced',
    minTL: 12,
    mini: null,
    hand: {
      cost: 150,
      weight: 0.75,
      damage: null,
      traits: { 'Pulse Intensity': 12 },
    },
  },
  fireSuppression: {
    label: 'Fire Suppression',
    minTL: 8,
    mini: { cost: 10, weight: 0.4, damage: null, traits: { Blast: 2 } },
    hand: { cost: 15, weight: 0.8, damage: null, traits: { Blast: 3 } },
  },
  fragmentation: {
    label: 'Fragmentation',
    minTL: 6,
    mini: {
      cost: 20,
      weight: 0.3,
      damage: d(3),
      traits: { Blast: 4, 'Lo-Pen': 2 },
    },
    hand: {
      cost: 30,
      weight: 0.5,
      damage: d(5),
      traits: { Blast: 9, 'Lo-Pen': 2 },
    },
  },
  gasIncapacitant: {
    label: 'Gas, Incapacitant',
    minTL: 7,
    mini: null,
    hand: {
      cost: 50,
      weight: 0.5,
      damage: null,
      traits: { Blast: 3, Incapacitant: true },
    },
  },
  gasToxin: {
    label: 'Gas, Toxin',
    minTL: 9,
    mini: null,
    hand: {
      cost: 250,
      weight: 0.5,
      damage: null,
      traits: { Blast: 3, Toxin: true },
    },
  },
  incendiaryAntipersonnel: {
    label: 'Incendiary, Antipersonnel',
    minTL: 8,
    mini: null,
    hand: {
      cost: 75,
      weight: 0.5,
      damage: d(2),
      traits: { Blast: 15, Incendiary: 1, Burn: 2 },
    },
  },
  incendiaryDemolition: {
    label: 'Incendiary, Demolition',
    minTL: 6,
    mini: {
      cost: 50,
      weight: 0.6,
      damage: d(2),
      traits: { Blast: 1, Incendiary: 4, Burn: 6 },
    },
    hand: {
      cost: 80,
      weight: 1.2,
      damage: d(3),
      traits: { Blast: 2, Incendiary: 6, Burn: 6 },
    },
  },
  microgrenade: {
    label: 'Microgrenade',
    minTL: 8,
    mini: null,
    hand: {
      cost: 150,
      weight: 0.75,
      damage: d(2),
      traits: { Blast: 3, 'Lo-Pen': 3 },
    },
  },
  multipleProjectile: {
    label: 'Multiple Projectile',
    minTL: 6,
    mini: {
      cost: 10,
      weight: 0.4,
      damage: d(5),
      traits: { 'Lo-Pen': 3, Spread: 2 },
    },
    hand: {
      cost: 15,
      weight: 0.9,
      damage: d(6),
      traits: { 'Lo-Pen': 3, Spread: 4 },
    },
  },
  plasma: {
    label: 'Plasma',
    minTL: 12,
    mini: null,
    hand: {
      cost: 200,
      weight: 0.8,
      damage: d(8),
      traits: { Blast: 6, 'Lo-Pen': 2, Incendiary: 4 },
    },
  },
  plasmaAntiArmour: {
    label: 'Plasma, Anti-Armour',
    minTL: 12,
    mini: null,
    hand: {
      cost: 250,
      weight: 0.9,
      damage: d(8),
      traits: { Blast: 3, AP: 6, Incendiary: 4 },
    },
  },
  smoke: {
    label: 'Smoke',
    minTL: 6,
    mini: null,
    hand: { cost: 15, weight: 0.5, damage: null, traits: { Blast: 9 } },
  },
  stun: {
    label: 'Stun',
    minTL: 7,
    mini: null,
    hand: {
      cost: 30,
      weight: 0.5,
      damage: d(3),
      traits: { Blast: 9, Stun: '3D' },
    },
  },
};
