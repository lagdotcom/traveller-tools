import { DEFAULT_SHIP_PARAMS, type ShipDefinition } from './library.js';
import { type CarriedCraft, evaluateShip, type ShipParams } from './ship.js';

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

/** Snapshot a ship definition as a carried craft (resolving its tons + cost). */
function carry(def: ShipDefinition, count: number): CarriedCraft {
  const { summary } = evaluateShip(def.params);
  return {
    kind: 'ship',
    name: def.name,
    tons: def.params.hullTons,
    cost: summary.resources.cost.used,
    count,
    ship: def.params,
  };
}

// Small craft reused both standalone and as carried craft on the warships below.
const LIGHT_FIGHTER = ship('Light Fighter', '10-ton fighter.', {
  hullTons: 10,
  tl: 12,
  thrust: 6,
  jump: 0,
  powerPlantType: 'fusionTL12',
  powerPlantTons: 1,
  fuelTons: 1,
  bridge: 'cockpit',
  staterooms: 0,
  weapons: [{ mount: 'fixed', weapon: 'beamLaser' }],
});
const SHIPS_BOAT = ship('Ship’s Boat', '30-ton general-purpose small craft.', {
  hullTons: 30,
  tl: 10,
  hullConfig: 'streamlined',
  thrust: 3,
  jump: 0,
  powerPlantType: 'fusionTL8',
  powerPlantTons: 2,
  fuelTons: 2,
  bridge: 'cockpit',
  staterooms: 0,
  fuelScoop: true,
});

/**
 * Common spacecraft from the Core Rulebook, as starting points for the builder.
 * These are faithful reconstructions with the components modelled so far; tweak
 * after loading. (A unit test asserts each one builds without errors.)
 *
 * TODO: components not yet modelled, so the ships below approximate them (see
 * the per-ship notes):
 *   - Carried craft crew: a carrier doesn't yet add pilots/gunners for its
 *     embarked small craft.
 *   - Luxuries / fittings, ship's lockers, vehicles, air/rafts, escape pods,
 *     specimen storage, ammunition for sandcasters/missiles beyond bare racks.
 *   - Mixed-weapon turrets (one weapon type per mount for now).
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
    sensors: 'military',
    staterooms: 4,
    fuelScoop: true,
    software: [{ type: 'jumpControl', level: 2 }],
    weapons: [{ mount: 'double', weapon: 'beamLaser' }],
  }),
  // TODO: the book's Seeker carries a mining laser + ore processing; modelled
  // here as mining drones plus cargo for ore.
  ship('Seeker (Modified Scout)', '100-ton belt-mining variant of the Scout.', {
    hullTons: 100,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 2,
    jump: 2,
    powerPlantTons: 4,
    fuelTons: 23,
    sensors: 'military',
    staterooms: 3,
    fuelScoop: true,
    systems: [{ type: 'miningDrones', amount: 10 }],
    software: [{ type: 'jumpControl', level: 2 }],
  }),
  ship('Free Trader (Type A)', '200-ton streamlined free trader.', {
    hullTons: 200,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 1,
    powerPlantTons: 5,
    fuelTons: 22,
    staterooms: 10,
    fuelScoop: true,
    software: [{ type: 'jumpControl', level: 1 }],
    weapons: [
      { mount: 'single', weapon: 'beamLaser' },
      { mount: 'single', weapon: 'sandcaster' },
    ],
  }),
  ship('Far Trader (Type A2)', '200-ton streamlined jump-2 trader.', {
    hullTons: 200,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 2,
    powerPlantTons: 7,
    fuelTons: 42,
    staterooms: 8,
    fuelScoop: true,
    software: [{ type: 'jumpControl', level: 2 }],
    weapons: [
      { mount: 'single', weapon: 'beamLaser' },
      { mount: 'single', weapon: 'sandcaster' },
    ],
  }),
  ship('Subsidised Merchant (Type R)', '400-ton subsidised merchant.', {
    hullTons: 400,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 1,
    powerPlantTons: 11,
    fuelTons: 45,
    staterooms: 12,
    fuelScoop: true,
    software: [{ type: 'jumpControl', level: 1 }],
    weapons: [{ mount: 'single', weapon: 'beamLaser' }],
  }),
  // TODO: luxury fittings / high passage suites are not modelled; the lounge is
  // approximated with common areas.
  ship('Yacht (Type Y)', '200-ton streamlined luxury yacht.', {
    hullTons: 200,
    tl: 13,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 1,
    powerPlantTons: 6,
    fuelTons: 22,
    staterooms: 6,
    commonAreasTons: 10,
    fuelScoop: true,
    software: [{ type: 'jumpControl', level: 1 }],
  }),
  // TODO: laboratories use derived (High Guard) values — the build shows the
  // "derived rules" warning until verified.
  ship('Lab Ship (Type L)', '400-ton research vessel.', {
    hullTons: 400,
    tl: 13,
    thrust: 1,
    jump: 2,
    powerPlantTons: 14,
    fuelTons: 85,
    sensors: 'improved',
    staterooms: 12,
    systems: [{ type: 'laboratory', amount: 30 }],
    software: [{ type: 'jumpControl', level: 2 }],
  }),
  // TODO: specimen storage, vehicles and the air/raft are approximated with a
  // small laboratory plus hangar space (both derived).
  ship('Safari Ship', '200-ton streamlined hunting/expedition ship.', {
    hullTons: 200,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 1,
    jump: 2,
    powerPlantTons: 7,
    fuelTons: 43,
    staterooms: 8,
    fuelScoop: true,
    systems: [
      { type: 'laboratory', amount: 4 },
      { type: 'hangar', amount: 8 },
    ],
    software: [{ type: 'jumpControl', level: 2 }],
  }),
  ship('Subsidised Liner (Type M)', '600-ton passenger liner.', {
    hullTons: 600,
    tl: 12,
    thrust: 1,
    jump: 2,
    powerPlantTons: 20,
    fuelTons: 125,
    staterooms: 30,
    lowBerths: 20,
    software: [{ type: 'jumpControl', level: 2 }],
    weapons: [
      { mount: 'single', weapon: 'beamLaser' },
      { mount: 'single', weapon: 'sandcaster' },
    ],
  }),
  ship('Patrol Corvette (Type T)', '400-ton system patrol corvette.', {
    hullTons: 400,
    tl: 13,
    thrust: 4,
    jump: 3,
    powerPlantTons: 24,
    fuelTons: 130,
    armourType: 'crystaliron',
    armourPoints: 4,
    sensors: 'military',
    staterooms: 8,
    crewType: 'military',
    carried: [carry(SHIPS_BOAT, 1)],
    software: [{ type: 'jumpControl', level: 3 }],
    weapons: [
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'pulseLaser' },
    ],
  }),
  // TODO: the Close Escort carries no small craft; weapons are best-guess
  // turret loadouts.
  ship('Close Escort (Type E)', '400-ton escort.', {
    hullTons: 400,
    tl: 13,
    thrust: 4,
    jump: 3,
    powerPlantTons: 24,
    fuelTons: 130,
    armourType: 'crystaliron',
    armourPoints: 2,
    sensors: 'military',
    staterooms: 6,
    crewType: 'military',
    software: [{ type: 'jumpControl', level: 3 }],
    weapons: [
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'pulseLaser' },
      { mount: 'single', weapon: 'particleBarbette' },
    ],
  }),
  ship('Corsair (Type P)', '400-ton streamlined raider.', {
    hullTons: 400,
    tl: 12,
    hullConfig: 'streamlined',
    thrust: 3,
    jump: 2,
    powerPlantTons: 19,
    fuelTons: 85,
    sensors: 'military',
    staterooms: 10,
    fuelScoop: true,
    software: [{ type: 'jumpControl', level: 2 }],
    weapons: [
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'single', weapon: 'missileRack' },
    ],
  }),
  // TODO: the SDB is a non-jump system defender; armour values and the particle
  // barbette use derived/approximate loadouts.
  ship('System Defence Boat', '400-ton non-jump system defence boat.', {
    hullTons: 400,
    tl: 14,
    thrust: 6,
    jump: 0,
    powerPlantTons: 22,
    fuelTons: 5,
    armourType: 'crystaliron',
    armourPoints: 6,
    sensors: 'military',
    staterooms: 8,
    crewType: 'military',
    weapons: [
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'pulseLaser' },
      { mount: 'single', weapon: 'particleBarbette' },
    ],
  }),
  // The Mercenary Cruiser embarks small craft in its hangars (nested designs).
  ship('Mercenary Cruiser (Type C)', '800-ton mercenary cruiser.', {
    hullTons: 800,
    tl: 13,
    thrust: 2,
    jump: 3,
    powerPlantTons: 38,
    fuelTons: 250,
    armourType: 'crystaliron',
    armourPoints: 4,
    sensors: 'military',
    staterooms: 20,
    crewType: 'military',
    carried: [carry(LIGHT_FIGHTER, 2), carry(SHIPS_BOAT, 1)],
    software: [{ type: 'jumpControl', level: 3 }],
    weapons: [
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'pulseLaser' },
      { mount: 'triple', weapon: 'missileRack' },
    ],
  }),
  // Small craft (no jump drive; cockpit bridge). Weapons mount on firmpoints, so
  // these use fixed mounts only (turrets need a 100-ton hull). LIGHT_FIGHTER and
  // SHIPS_BOAT are defined above so the warships can also carry them.
  LIGHT_FIGHTER,
  SHIPS_BOAT,
  ship('Launch', '20-ton utility launch.', {
    hullTons: 20,
    tl: 9,
    thrust: 1,
    jump: 0,
    powerPlantType: 'fusionTL8',
    powerPlantTons: 1,
    fuelTons: 2,
    bridge: 'cockpit',
    staterooms: 0,
  }),
  ship('Slow Boat', '30-ton low-thrust boat.', {
    hullTons: 30,
    tl: 9,
    thrust: 1,
    jump: 0,
    powerPlantType: 'fusionTL8',
    powerPlantTons: 1,
    fuelTons: 2,
    bridge: 'cockpit',
    staterooms: 0,
  }),
  ship('Pinnace', '40-ton small craft.', {
    hullTons: 40,
    tl: 11,
    hullConfig: 'streamlined',
    thrust: 4,
    jump: 0,
    powerPlantType: 'fusionTL8',
    powerPlantTons: 3,
    fuelTons: 2,
    bridge: 'cockpit',
    staterooms: 0,
    fuelScoop: true,
  }),
  // TODO: the Modular Cutter's interchangeable 30-ton modules aren't modelled;
  // the bay is left as cargo.
  ship('Modular Cutter', '50-ton modular cutter.', {
    hullTons: 50,
    tl: 11,
    hullConfig: 'streamlined',
    thrust: 4,
    jump: 0,
    powerPlantType: 'fusionTL8',
    powerPlantTons: 3,
    fuelTons: 2,
    bridge: 'cockpit',
    staterooms: 0,
    fuelScoop: true,
  }),
  ship('Heavy Fighter', '35-ton fighter.', {
    hullTons: 35,
    tl: 12,
    thrust: 6,
    jump: 0,
    powerPlantType: 'fusionTL12',
    powerPlantTons: 2,
    fuelTons: 1,
    bridge: 'cockpit',
    armourType: 'crystaliron',
    armourPoints: 2,
    staterooms: 0,
    weapons: [{ mount: 'fixed', weapon: 'pulseLaser' }],
  }),
];
