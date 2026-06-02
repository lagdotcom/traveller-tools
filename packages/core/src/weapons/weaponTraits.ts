/**
 * Weapon-traits glossary — the traits detailed in the Field Catalogue "Weapon
 * Traits" chapter, transcribed so the app can explain what the traits it already
 * stamps on a weapon (Lo-Pen, Spread, Burn, …) actually do at the table.
 *
 * Scope: only the traits the FC details. Many traits (AP, Blast, Auto, Bulky,
 * Smart, Stun, …) come from the Core Rulebook and "apply unchanged" — those live
 * in the Core text, not here. `key` is the trait name as written on a weapon
 * profile, so `findWeaponTrait` can look one up from a built weapon's traits.
 */

/** A reference sub-table shown under a trait (Hazard Levels, Flammability, …). */
export interface TraitTable {
  columns: [string, string];
  rows: [string, string][];
}

export interface WeaponTraitDef {
  /** Trait name as written on a weapon profile (e.g. 'Lo-Pen', 'Hazardous'). */
  key: string;
  /** Display name including its score notation, e.g. 'Lo-Pen X', 'Hazardous -X'. */
  label: string;
  source: string;
  description: string;
  table?: TraitTable;
}

export const WEAPON_TRAITS: WeaponTraitDef[] = [
  {
    key: 'Burn',
    label: 'Burn X',
    source: 'Field Catalogue',
    description:
      'Delivers half its initial damage for a number of rounds equal to its Burn score.',
  },
  {
    key: 'Corrosion-Resistant',
    label: 'Corrosion-Resistant (+X)',
    source: 'Field Catalogue',
    description:
      'An item or device degraded by corrosion to a lesser degree (the score reduces corrosive damage it takes).',
  },
  {
    key: 'Corrosive',
    label: 'Corrosive',
    source: 'Field Catalogue',
    description:
      'Does damage over time and can destroy armour (see the Corrosive weapons rules).',
  },
  {
    key: 'Emissions Signature',
    label: 'Emissions Signature (level)',
    source: 'Field Catalogue',
    description:
      'Carried by any weapon with a power source or that generates heat (lasers, gauss, flame/cryo, plasma, fusion) — they show up readily on sensors. The Emissions Signature DM applies when sensors are used to detect and locate the weapon. A weapon without it is only found by specialist devices using human-like cues (e.g. acoustic), which use its Physical Signature instead.',
  },
  {
    key: 'Hazardous',
    label: 'Hazardous -X',
    source: 'Field Catalogue',
    description:
      'Uses hazardous materials (generated plasma, flammable gels). It does not make the weapon dangerous to use, but increases the severity of a malfunction: on a malfunction, or if the weapon is penetrated by enemy fire, apply the Hazardous score as a negative DM on the Malfunction table. Typical propellants and batteries are a zero-DM hazard and do not grant the trait.',
    table: {
      columns: ['Hazard DM', 'Example'],
      rows: [
        ['-1', 'Poorly made conventional firearms prone to stoppages.'],
        [
          '-2',
          'Stable explosives (launched grenades); laser/gauss powerpacks.',
        ],
        ['-3', 'Very poor firearms likely to injure the user.'],
        ['-4', 'Possibly unstable explosives (ageing dynamite, high-yield).'],
        ['-6', 'Flammable materials (flamethrower fuel, cryogenic fluids).'],
        ['-8', 'Well-protected plasma generation chamber (good plasma gun).'],
        ['-10', 'Well-protected fusion chamber, or poor plasma generation.'],
        [
          '-12',
          'Poorly engineered fusion chamber (improvised fusion weapons).',
        ],
      ],
    },
  },
  {
    key: 'Inaccurate',
    label: 'Inaccurate -X',
    source: 'Field Catalogue',
    description:
      'A negative DM to hit a target more than 10m away (normally -1 or -2, more for a very ill-made weapon). Most smoothbores suffer it, though it rarely matters at shotgun ranges.',
  },
  {
    key: 'Incendiary',
    label: 'Incendiary X',
    source: 'Field Catalogue',
    description:
      'Sets materials alight on a successful check determined by the material; the Incendiary score is a positive modifier to that check (default +0). A hot enough incendiary can ignite even metals.',
    table: {
      columns: ['Material (example)', 'Difficulty'],
      rows: [
        ['Highly Flammable (liquid fuel)', 'Simple (2+)'],
        ['Flammable (straw, some clothing)', 'Routine (6+)'],
        ['Non-Flammable (skin, uniform)', 'Average (8+)'],
        ['Fire Resistant (vacc suit)', 'Difficult (10+)'],
        ['Highly Fire Resistant (metals)', 'Formidable (14+)'],
      ],
    },
  },
  {
    key: 'Lo-Pen',
    label: 'Lo-Pen X',
    source: 'Field Catalogue',
    description:
      "Performs poorly against armour (score typically 2 or 3). The score is a multiple applied to the target's armour — a Lo-Pen (3) weapon vs Protection +5 treats it as +15. Low-velocity and pellet-firing weapons typically have it; it is sometimes desirable (e.g. aboard a spacecraft).",
  },
  {
    key: 'Physical Signature',
    label: 'Physical Signature (level)',
    source: 'Field Catalogue',
    description:
      'Based on the noise, flash and disturbance of small objects from the propulsion mechanism or the passage of the beam/bolt/projectile. All firearms and energy weapons have some; when it is about handgun/rifle level there is no need to note it (detection and location are as normal).',
  },
  {
    key: 'Ramshackle',
    label: 'Ramshackle -X',
    source: 'Field Catalogue',
    description:
      'Thrown together from available parts or poorly engineered (usually -1 to -4, sometimes more). The DM applies to attack rolls and to malfunction results. Building or repairing a weapon below its Tech Level imposes Ramshackle equal to the TL difference; it can be reduced by the Effect of a Mechanics check when repairing. Being Ramshackle does not by itself make a weapon Unreliable.',
  },
  {
    key: 'Slow Loader',
    label: 'Slow Loader X',
    source: 'Field Catalogue',
    description:
      'Fiddly to load: the score is how many minor actions are required to load the weapon (a fiddly SMG magazine ~2-4, a black-powder rifle 10+). An Average (8+) Gun Combat check reduces the loading time by its Effect, to a minimum of one minor action.',
  },
  {
    key: 'Spread',
    label: 'Spread X',
    source: 'Field Catalogue',
    description:
      'Fires multiple projectiles at once or in rapid succession (score usually 1-4). Within the weapon’s base range the firer adds the Spread value to all attack rolls. Combining with Inaccurate: Inaccurate does not apply within 10m (so Spread alone helps); between 10m and base range both apply — e.g. Spread (2) + Inaccurate (-1) nets +1.',
  },
  {
    key: 'Unreliable',
    label: 'Unreliable X',
    source: 'Field Catalogue',
    description:
      'Prone to malfunctions (score 1-5). Throw an extra 1D of a different colour with the usual 2D check; if it comes up equal to or less than the Unreliable score the weapon malfunctions — roll 2D on the Malfunction table (the user adds their combat skill as a positive DM; Weapon Power gives -1 per damage die and Hazardous applies its score).',
    table: {
      columns: ['2D + DMs', 'Result'],
      rows: [
        [
          '0-',
          'Breech explosion: weapon ruined, user takes its normal damage.',
        ],
        [
          '1-3',
          'Critical component breaks: out of action until workshop repair.',
        ],
        ['4-6', 'Component breaks / jam: out of action, fixable in minutes.'],
        ['7-9', 'Misfeed: one significant action to clear/ready the weapon.'],
        ['10+', 'Minor fault: shot wasted but the weapon keeps working.'],
      ],
    },
  },
];

/** Look up the glossary entry for a trait key as written on a weapon profile. */
export function findWeaponTrait(key: string): WeaponTraitDef | undefined {
  return WEAPON_TRAITS.find((t) => t.key === key);
}
