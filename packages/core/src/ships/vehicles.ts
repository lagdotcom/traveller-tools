import type { ArmourPoints, MegaCredits, TechLevel, Tons } from '../flavours';

/**
 * The Core Rulebook's pre-made vehicles. Core has no vehicle *construction*
 * system (that lives in the Vehicle Handbook), so these are a fixed catalogue.
 * `shippingTons` and `costMCr` are what the ship builder needs to carry one in
 * a docking space; the rest is for the stat-block display.
 */
export interface VehicleArmour {
  front: ArmourPoints;
  rear: ArmourPoints;
  sides: ArmourPoints;
}

export interface VehicleDefinition {
  name: string;
  description: string;
  tl: TechLevel;
  skill: string;
  agility: number;
  speed: string;
  range: string;
  crew: number;
  passengers: number;
  cargoTons: Tons;
  hull: number;
  /** Shipping displacement in tons — drives docking-space size when carried. */
  shippingTons: Tons;
  costMCr: MegaCredits;
  armour: VehicleArmour;
  /** Fitted weapon(s), if any (free text). */
  weapons?: string;
}

const armour = (
  front: ArmourPoints,
  rear: ArmourPoints,
  sides: ArmourPoints,
): VehicleArmour => ({
  front,
  rear,
  sides,
});

export const VEHICLE_CATALOG: VehicleDefinition[] = [
  {
    name: 'Air/Raft',
    description: 'Ubiquitous open-topped anti-grav vehicle; can reach orbit.',
    tl: 8,
    skill: 'Flyer (grav)',
    agility: 1,
    speed: 'High (medium)',
    range: '1,000 (1,500)',
    crew: 1,
    passengers: 5,
    cargoTons: 0.25,
    hull: 16,
    shippingTons: 4,
    costMCr: 0.25,
    armour: armour(10, 10, 10),
  },
  {
    name: 'ATV',
    description:
      'Enclosed, pressurised all-terrain ground vehicle with a turret hardpoint.',
    tl: 12,
    skill: 'Drive (wheel)',
    agility: -2,
    speed: 'High (medium)',
    range: '600 (900)',
    crew: 1,
    passengers: 7,
    cargoTons: 2.5,
    hull: 60,
    shippingTons: 10,
    costMCr: 0.155,
    armour: armour(6, 6, 6),
    weapons: 'Small turret (empty)',
  },
  {
    name: 'Brutus Heavy Cargo Truck',
    description:
      'Large wheeled logistics truck for forward supply and casualty evac.',
    tl: 10,
    skill: 'Drive (wheel)',
    agility: -2,
    speed: 'Medium (slow)',
    range: '500 (750)',
    crew: 1,
    passengers: 2,
    cargoTons: 12.5,
    hull: 180,
    shippingTons: 40,
    costMCr: 0.241,
    armour: armour(8, 8, 8),
  },
  {
    name: 'Cargo Lifter',
    description: 'Walker with heavy manipulator arms for moving containers.',
    tl: 8,
    skill: 'Drive (walker)',
    agility: 0,
    speed: 'Slow (very slow)',
    range: '150 (225)',
    crew: 1,
    passengers: 0,
    cargoTons: 0.25,
    hull: 12,
    shippingTons: 3,
    costMCr: 0.07,
    armour: armour(2, 2, 2),
  },
  {
    name: 'G/Bike',
    description: 'Fast, compact grav bike favoured by lone Travellers.',
    tl: 12,
    skill: 'Flyer (grav)',
    agility: 3,
    speed: 'Very fast (fast)',
    range: '3,000 (4,500)',
    crew: 1,
    passengers: 0,
    cargoTons: 0,
    hull: 2,
    shippingTons: 0.5,
    costMCr: 0.046,
    armour: armour(4, 4, 4),
  },
  {
    name: 'G/Racer',
    description: 'Extremely fast but fragile grav racing sports vehicle.',
    tl: 9,
    skill: 'Flyer (grav)',
    agility: 2,
    speed: 'Subsonic (very fast)',
    range: '2,000 (3,000)',
    crew: 1,
    passengers: 1,
    cargoTons: 0,
    hull: 4,
    shippingTons: 3,
    costMCr: 0.3,
    armour: armour(3, 3, 3),
  },
  {
    name: 'Gecko ATAV',
    description:
      'Semi-enclosed all-terrain assault vehicle with twin autocannon.',
    tl: 7,
    skill: 'Drive (wheel)',
    agility: 0,
    speed: 'High (medium)',
    range: '300 (450)',
    crew: 2,
    passengers: 3,
    cargoTons: 0,
    hull: 18,
    shippingTons: 4.5,
    costMCr: 0.04245,
    armour: armour(12, 12, 12),
    weapons: 'Pintle mount: twin light autocannon (front)',
  },
  {
    name: 'Gunskiff',
    description: 'Open grav platform mounting a single heavy weapon.',
    tl: 10,
    skill: 'Flyer (grav)',
    agility: -1,
    speed: 'Slow (very slow)',
    range: '1,000 (1,500)',
    crew: 2,
    passengers: 4,
    cargoTons: 0,
    hull: 30,
    shippingTons: 10,
    costMCr: 0.31375,
    armour: armour(3, 3, 3),
    weapons: 'Fixed mount: laser cannon (front)',
  },
  {
    name: 'Personal Land Yacht',
    description: 'Wind-powered land vehicle for flat, breezy worlds.',
    tl: 3,
    skill: 'Drive (wheel)',
    agility: -1,
    speed: 'Very slow (idle)',
    range: '—',
    crew: 1,
    passengers: 1,
    cargoTons: 0,
    hull: 2,
    shippingTons: 1,
    costMCr: 0.0006,
    armour: armour(1, 1, 1),
  },
  {
    name: 'G/Carrier',
    description:
      'Grav-mounted armoured personnel carrier; a standard military AFV.',
    tl: 15,
    skill: 'Flyer (grav)',
    agility: -1,
    speed: 'Fast (high)',
    range: '5,000 (7,500)',
    crew: 2,
    passengers: 8,
    cargoTons: 0.75,
    hull: 90,
    shippingTons: 15,
    costMCr: 11.58,
    armour: armour(120, 100, 80),
    weapons: 'Turret: fusion gun',
  },
];
