import { DEFAULT_SHIP_PARAMS, type ShipDefinition } from './library.js';
import { type CarriedCraft, evaluateShip, type ShipParams } from './ship.js';
import { VEHICLE_CATALOG } from './vehicles.js';

/** Build a definition from the default loadout plus the listed overrides. */
function ship(
  name: string,
  description: string,
  overrides: Partial<ShipParams>,
): ShipDefinition {
  return {
    name,
    description,
    params: { ...DEFAULT_SHIP_PARAMS, ...overrides },
  };
}

/**
 * Carry a library ship, resolving its displacement and cost from its design.
 * `nested` craft (e.g. an ATV stored on a launch) are folded into the carried
 * ship's own design so their cost flows up and they're listed on the sheet.
 */
function carryShip(
  def: ShipDefinition,
  count = 1,
  nested: CarriedCraft[] = [],
): CarriedCraft {
  const params = nested.length
    ? { ...def.params, carried: [...def.params.carried, ...nested] }
    : def.params;
  return {
    kind: 'ship',
    name: def.name,
    tons: def.params.hullTons,
    cost: evaluateShip(params).summary.resources.cost.used,
    count,
    ship: params,
  };
}

/** Carry a catalogue vehicle by name (its shipping size and cost). */
function carryVehicle(name: string, count = 1): CarriedCraft {
  const v = VEHICLE_CATALOG.find((veh) => veh.name === name);
  if (!v) throw new Error(`Unknown vehicle: ${name}`);
  return {
    kind: 'vehicle',
    name: v.name,
    tons: v.shippingTons,
    cost: v.costMCr,
    count,
    vehicle: v,
  };
}

// Small craft that warships carry, defined once and reused both standalone (in
// the catalogue below) and as carried craft via carryShip().
const LAUNCH = ship('Launch', '20-ton utility launch / lifeboat.', {
  hullTons: 20,
  tl: 12,
  hullConfig: 'streamlined',
  thrust: 1,
  jump: 0,
  powerPlantType: 'fusionTL8',
  powerPlantTons: 1,
  fuelTons: 1,
  computer: '/5',
  software: [
    { type: 'library', level: 0 },
    { type: 'manoeuvre', level: 0 },
    { type: 'intellect', level: 0 },
  ],
  staterooms: 0,
});
const GIG = ship('Gig', '20-ton starport gig.', {
  hullTons: 20,
  tl: 12,
  hullConfig: 'streamlined',
  thrust: 7,
  jump: 0,
  powerPlantTons: 2,
  fuelTons: 1,
  computer: '/5',
  weapons: [{ mount: 'single', weapons: [] }],
  systems: [{ type: 'cabinSpace', amount: 3 }],
  software: [
    { type: 'library', level: 0 },
    { type: 'manoeuvre', level: 0 },
    { type: 'intellect', level: 0 },
  ],
  staterooms: 0,
});
const SHIPS_BOAT = ship('Ship’s Boat', '30-ton general-purpose small craft.', {
  hullTons: 30,
  tl: 12,
  hullConfig: 'streamlined',
  thrust: 5,
  jump: 0,
  powerPlantTons: 2,
  fuelTons: 1,
  computer: '/5',
  weapons: [{ mount: 'fixed', weapons: [] }],
  systems: [{ type: 'cabinSpace', amount: 9 }],
  software: [
    { type: 'library', level: 0 },
    { type: 'manoeuvre', level: 0 },
    { type: 'intellect', level: 0 },
  ],
  staterooms: 0,
});
const PINNACE = ship('Pinnace', '40-ton small craft.', {
  hullTons: 40,
  tl: 12,
  hullConfig: 'streamlined',
  thrust: 5,
  jump: 0,
  powerPlantTons: 2,
  fuelTons: 1,
  computer: '/5',
  weapons: [{ mount: 'fixed', weapons: [] }],
  systems: [{ type: 'cabinSpace', amount: 9 }],
  software: [
    { type: 'library', level: 0 },
    { type: 'manoeuvre', level: 0 },
    { type: 'intellect', level: 0 },
  ],
  staterooms: 0,
});
// TODO: the detachable 30-ton module is left as cargo.
const MODULAR_CUTTER = ship('Modular Cutter', '50-ton modular cutter.', {
  hullTons: 50,
  tl: 12,
  hullConfig: 'streamlined',
  thrust: 4,
  jump: 0,
  powerPlantType: 'fusionTL8',
  powerPlantTons: 3,
  fuelTons: 1,
  computer: '/5',
  weapons: [{ mount: 'fixed', weapons: [] }],
  systems: [{ type: 'cabinSpace', amount: 6 }],
  software: [
    { type: 'library', level: 0 },
    { type: 'manoeuvre', level: 0 },
    { type: 'intellect', level: 0 },
  ],
  staterooms: 0,
});

/**
 * The Core Rulebook's common spacecraft, reconstructed as starting points for
 * the builder. Component tonnages and per-line costs follow the book; a unit
 * test asserts each one builds without errors.
 *
 * Known approximations (features the engine doesn't model yet):
 *   - Purchase totals here are the full component cost; the book applies a 10%
 *     standard-design discount to the printed PURCHASE COST.
 *   - Reinforced hull uses the book's MCr0.5/ton but an approximate Hull-Point
 *     bonus; armoured bulkheads and drop tanks are omitted (so a few warships
 *     carry slightly more cargo than the book).
 *   - Luxury staterooms, multi-environment space, acceleration benches and a
 *     modular cutter's swappable module are folded into common areas / cabin
 *     space / cargo of the same tonnage.
 *   - Sphere hulls and reduced-size jump drives use the standard equivalents;
 *     fibre-optic (fib) computers are priced like /bis.
 *   - A vehicle nested in an auxiliary craft (e.g. an ATV on a launch) is given
 *     its own docking space inside that craft, so its cost runs a touch high.
 */
export const BUILTIN_SHIPS: ShipDefinition[] = [
  ship('Scout / Courier (Type S)', '100-ton streamlined survey scout.', {
    hullTons: 100,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 2,
    jump: 2,
    powerPlantTons: 4,
    fuelTons: 23,
    armourType: 'crystaliron',
    armourPoints: 4,
    computer: '/5',
    computerBis: true,
    sensors: 'military',
    fuelScoop: true,
    weapons: [{ mount: 'double', weapons: [] }],
    systems: [
      { type: 'fuelProcessor', amount: 2 },
      { type: 'probeDrones', amount: 2 },
      { type: 'workshop', amount: 6 },
    ],
    carried: [carryVehicle('Air/Raft')],
    software: [
      { type: 'jumpControl', level: 2 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 4,
  }),
  ship('Seeker Mining Ship (Type J)', '100-ton belt-mining scout variant.', {
    hullTons: 100,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 2,
    jump: 2,
    powerPlantTons: 4,
    fuelTons: 21,
    armourType: 'crystaliron',
    armourPoints: 4,
    computer: '/5',
    computerBis: true,
    sensors: 'military',
    fuelScoop: true,
    weapons: [{ mount: 'double', weapons: [] }],
    systems: [
      { type: 'fuelProcessor', amount: 1 },
      { type: 'miningDrones', amount: 10 },
    ],
    software: [
      { type: 'jumpControl', level: 2 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 2,
  }),
  ship('Free Trader (Type A)', '200-ton streamlined free trader.', {
    hullTons: 200,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 1,
    powerPlantTons: 5,
    fuelTons: 21,
    armourType: 'crystaliron',
    armourPoints: 2,
    computer: '/5',
    sensors: 'civilian',
    fuelScoop: true,
    systems: [
      { type: 'fuelProcessor', amount: 1 },
      { type: 'cargoCrane', amount: 3 },
    ],
    software: [
      { type: 'jumpControl', level: 1 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 10,
    lowBerths: 20,
    commonAreasTons: 11,
  }),
  ship('Far Trader (Type A2)', '200-ton streamlined jump-2 trader.', {
    hullTons: 200,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 2,
    powerPlantTons: 6,
    fuelTons: 41,
    armourType: 'crystaliron',
    armourPoints: 2,
    computer: '/5',
    computerBis: true,
    sensors: 'civilian',
    fuelScoop: true,
    systems: [
      { type: 'fuelProcessor', amount: 2 },
      { type: 'cargoCrane', amount: 3 },
    ],
    software: [
      { type: 'jumpControl', level: 2 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 10,
    lowBerths: 6,
    commonAreasTons: 9,
  }),
  // TODO: the trophy lounge folds into common areas.
  ship('Safari Ship (Type K)', '200-ton streamlined expedition ship.', {
    hullTons: 200,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 2,
    powerPlantTons: 7,
    fuelTons: 41,
    computer: '/5',
    computerBis: true,
    sensors: 'civilian',
    fuelScoop: true,
    weapons: [{ mount: 'double', weapons: [] }],
    systems: [
      { type: 'fuelProcessor', amount: 2 },
      { type: 'multiEnvironment', amount: 8 },
      { type: 'multiEnvironment', amount: 8 },
    ],
    carried: [
      carryShip(LAUNCH, 1, [carryVehicle('ATV')]),
      carryVehicle('Air/Raft'),
    ],
    software: [
      { type: 'jumpControl', level: 2 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 11,
    commonAreasTons: 20, // 13t common areas + 7t trophy lounge
  }),
  // TODO: reinforced hull and armoured bulkheads are approximate (cargo runs a
  // little high), and the sensors' countermeasures suite isn't modelled yet.
  ship('System Defence Boat', '200-ton TL15 non-jump system defender.', {
    hullTons: 200,
    tl: 15,
    thrust: 9,
    jump: 0,
    powerPlantType: 'fusionTL15',
    powerPlantTons: 16,
    fuelTons: 6,
    reinforcementTons: 10,
    armourType: 'crystaliron',
    armourPoints: 13,
    computer: '/35',
    sensors: 'improved',
    crewType: 'military',
    weapons: [
      { mount: 'triple', weapons: ['beamLaser', 'beamLaser', 'beamLaser'] },
      {
        mount: 'triple',
        weapons: ['missileRack', 'missileRack', 'missileRack'],
      },
    ],
    systems: [
      { type: 'missileStorage', amount: 12 },
      { type: 'repairDrones', amount: 2 },
      { type: 'fuelProcessor', amount: 1 },
      { type: 'medicalBay', amount: 4 },
    ],
    software: [
      { type: 'autoRepair', level: 1 },
      { type: 'evade', level: 2 },
      { type: 'fireControl', level: 2 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 15,
    commonAreasTons: 4,
  }),
  ship('Yacht (Type Y)', '200-ton luxury yacht.', {
    hullTons: 200,
    tl: 12,
    thrust: 1,
    jump: 1,
    powerPlantTons: 6,
    fuelTons: 22,
    computer: '/5',
    sensors: 'civilian',
    carried: [
      carryVehicle('Air/Raft'),
      carryShip(SHIPS_BOAT, 1, [carryVehicle('ATV')]),
    ],
    systems: [{ type: 'luxuryStateroom', amount: 10 }], // 1 luxury stateroom
    software: [
      { type: 'jumpControl', level: 1 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 12,
    commonAreasTons: 32,
  }),
  // TODO: reinforced hull, the armoury and the drop-tank mount are approximate;
  // modelled at its internal Jump-3 (the book reaches Jump-5 on drop tanks).
  ship(
    'Close Escort (Gazelle)',
    '400-ton TL15 close escort (Jump-3 internal).',
    {
      hullTons: 400,
      tl: 15,
      thrust: 6,
      jump: 3,
      powerPlantTons: 36,
      fuelTons: 128,
      reinforcementTons: 20,
      armourType: 'crystaliron',
      armourPoints: 3,
      computer: '/30',
      sensors: 'military',
      crewType: 'military',
      weapons: [
        { mount: 'single', weapons: ['particleBarbette'] },
        { mount: 'single', weapons: ['particleBarbette'] },
        { mount: 'triple', weapons: ['beamLaser', 'beamLaser', 'beamLaser'] },
        { mount: 'triple', weapons: ['beamLaser', 'beamLaser', 'beamLaser'] },
      ],
      systems: [{ type: 'fuelProcessor', amount: 6 }],
      carried: [carryShip(GIG)],
      software: [
        { type: 'evade', level: 1 },
        { type: 'fireControl', level: 4 },
        { type: 'jumpControl', level: 5 },
        { type: 'library', level: 0 },
        { type: 'manoeuvre', level: 0 },
        { type: 'intellect', level: 0 },
      ],
      staterooms: 11,
      commonAreasTons: 11,
    },
  ),
  // TODO: the spin-gravity laboratory section uses laboratory space.
  ship('Laboratory Ship (Type L)', '400-ton research vessel.', {
    hullTons: 400,
    tl: 12,
    thrust: 2,
    jump: 2,
    powerPlantTons: 12,
    fuelTons: 82,
    computer: '/10',
    sensors: 'improved',
    systems: [
      { type: 'probeDrones', amount: 3 },
      { type: 'laboratory', amount: 100 },
    ],
    carried: [
      carryShip(PINNACE, 1, [carryVehicle('ATV')]),
      carryVehicle('Air/Raft'),
    ],
    software: [
      { type: 'jumpControl', level: 2 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 20,
    commonAreasTons: 15,
  }),
  ship('Patrol Corvette (Type T)', '400-ton streamlined patrol corvette.', {
    hullTons: 400,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 4,
    jump: 3,
    powerPlantTons: 27,
    fuelTons: 124,
    armourType: 'crystaliron',
    armourPoints: 4,
    computer: '/15',
    sensors: 'military',
    crewType: 'military',
    weapons: [
      { mount: 'triple', weapons: ['pulseLaser', 'pulseLaser', 'pulseLaser'] },
      { mount: 'triple', weapons: ['pulseLaser', 'pulseLaser', 'pulseLaser'] },
      {
        mount: 'triple',
        weapons: ['missileRack', 'missileRack', 'missileRack'],
      },
      {
        mount: 'triple',
        weapons: ['missileRack', 'missileRack', 'missileRack'],
      },
    ],
    systems: [{ type: 'fuelProcessor', amount: 4 }],
    carried: [carryShip(SHIPS_BOAT), carryVehicle('G/Carrier')],
    software: [
      { type: 'evade', level: 1 },
      { type: 'fireControl', level: 1 },
      { type: 'jumpControl', level: 3 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 12,
    lowBerths: 4,
    commonAreasTons: 10,
  }),
  ship('Subsidised Merchant (Type R)', '400-ton subsidised merchant.', {
    hullTons: 400,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 1,
    powerPlantTons: 9,
    fuelTons: 41,
    computer: '/5',
    sensors: 'civilian',
    fuelScoop: true,
    systems: [{ type: 'fuelProcessor', amount: 1 }],
    carried: [carryShip(LAUNCH)],
    software: [
      { type: 'jumpControl', level: 1 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 19,
    lowBerths: 9,
    commonAreasTons: 5.5,
  }),
  // TODO: reduced-size jump drive approximated with a standard Jump-3; advanced
  // probe drones use regular probe drones; sensor station folds into cargo.
  ship('Survey Scout (Donosev)', '400-ton TL14 survey scout.', {
    hullTons: 400,
    tl: 14,
    thrust: 2,
    jump: 3,
    powerPlantTons: 14,
    fuelTons: 124,
    computer: '/25',
    sensors: 'improved',
    systems: [
      { type: 'workshop', amount: 6 },
      { type: 'probeDrones', amount: 4 },
      { type: 'fuelProcessor', amount: 6 },
      { type: 'laboratory', amount: 8 },
    ],
    carried: [carryShip(MODULAR_CUTTER), carryVehicle('Air/Raft', 3)],
    software: [
      { type: 'jumpControl', level: 3 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 10,
    commonAreasTons: 10,
  }),
  ship('Subsidised Liner (Type M)', '600-ton TL14 passenger liner.', {
    hullTons: 600,
    tl: 14,
    thrust: 1,
    jump: 3,
    powerPlantTons: 24,
    fuelTons: 183,
    computer: '/10',
    computerBis: true,
    sensors: 'civilian',
    carried: [carryShip(LAUNCH)],
    software: [
      { type: 'jumpControl', level: 3 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 30,
    lowBerths: 20,
    commonAreasTons: 45,
  }),
  // TODO: sphere hull approximated as standard; fib computer priced like /bis;
  // two modular cutters carried (their ATVs' cost is not added).
  ship('Mercenary Cruiser (Type C)', '800-ton mercenary cruiser.', {
    hullTons: 800,
    tl: 12,
    thrust: 3,
    jump: 3,
    powerPlantTons: 50,
    fuelTons: 252,
    armourType: 'crystaliron',
    armourPoints: 4,
    computer: '/20',
    computerBis: true,
    sensors: 'military',
    crewType: 'military',
    weapons: [
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
      { mount: 'triple', weapons: [] },
    ],
    systems: [{ type: 'repairDrones', amount: 8 }],
    carried: [
      carryVehicle('Air/Raft'),
      carryShip(MODULAR_CUTTER, 2, [carryVehicle('ATV')]),
    ],
    software: [
      { type: 'autoRepair', level: 2 },
      { type: 'evade', level: 1 },
      { type: 'fireControl', level: 1 },
      { type: 'jumpControl', level: 3 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 25,
    commonAreasTons: 44,
  }),
  // --- Small craft (no jump; flown by a single pilot) ---
  ship('Light Fighter', '10-ton fighter.', {
    hullTons: 10,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 6,
    jump: 0,
    powerPlantTons: 1,
    fuelTons: 1,
    bridge: 'cockpit',
    armourType: 'crystaliron',
    armourPoints: 2,
    computer: '/5',
    sensors: 'military',
    weapons: [{ mount: 'fixed', weapons: ['pulseLaser'] }],
    software: [
      { type: 'fireControl', level: 1 },
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 0,
  }),
  GIG,
  LAUNCH,
  SHIPS_BOAT,
  ship('Slow Boat', '30-ton low-thrust boat.', {
    hullTons: 30,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 3,
    jump: 0,
    powerPlantTons: 1,
    fuelTons: 1,
    computer: '/5',
    weapons: [{ mount: 'fixed', weapons: [] }],
    systems: [{ type: 'cabinSpace', amount: 3 }],
    software: [
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 0,
  }),
  PINNACE,
  ship('Slow Pinnace', '40-ton low-thrust pinnace.', {
    hullTons: 40,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 3,
    jump: 0,
    powerPlantType: 'fusionTL8',
    powerPlantTons: 2,
    fuelTons: 1,
    computer: '/5',
    weapons: [{ mount: 'fixed', weapons: [] }],
    software: [
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 0,
  }),
  MODULAR_CUTTER,
  ship('Shuttle', '95-ton orbital shuttle.', {
    hullTons: 95,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 3,
    jump: 0,
    powerPlantTons: 4,
    fuelTons: 1,
    computer: '/5',
    weapons: [{ mount: 'fixed', weapons: [] }],
    systems: [{ type: 'cabinSpace', amount: 12 }],
    software: [
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 0,
  }),
  // TODO: the acceleration bench (240 passenger seats) is folded into common
  // areas of the same tonnage.
  ship('Passenger Shuttle', '95-ton passenger shuttle.', {
    hullTons: 95,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 0,
    powerPlantType: 'fusionTL8',
    powerPlantTons: 3,
    fuelTons: 1,
    computer: '/5',
    commonAreasTons: 68,
    software: [
      { type: 'library', level: 0 },
      { type: 'manoeuvre', level: 0 },
      { type: 'intellect', level: 0 },
    ],
    staterooms: 0,
  }),
];
