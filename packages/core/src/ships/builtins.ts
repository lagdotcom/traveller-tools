import { DEFAULT_SHIP_PARAMS, type ShipDefinition } from './library.js';
import type { ShipParams } from './ship.js';

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
 * Common spacecraft from the Core Rulebook, as starting points for the builder.
 * These are faithful reconstructions with the components modelled so far; tweak
 * after loading. (A unit test asserts each one builds without errors.)
 *
 * TODO: components not yet modelled, so the ships below approximate them (see
 * the per-ship notes):
 *   - Small-craft firmpoints (craft under 100t can't yet mount weapons, since
 *     hardpoints are floor(hull/100) — so the Fighter and armed boats are
 *     omitted for now).
 *   - Nested/carried small craft: a Hangar only models the bay tonnage, not the
 *     docked craft's own design (so carriers list a hangar, not their boats).
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
  // TODO: the Patrol Corvette carries a Ship's Boat — only the hangar bay is
  // modelled (derived), not the docked craft.
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
    systems: [{ type: 'hangar', amount: 30 }],
    software: [{ type: 'jumpControl', level: 3 }],
    weapons: [
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'beamLaser' },
      { mount: 'triple', weapon: 'pulseLaser' },
    ],
  }),
  // Small craft (no jump drive; cockpit bridge). TODO: firmpoints aren't
  // modelled, so these are unarmed — the book's armed boats/fighters await
  // small-craft weapon mounts.
  ship('Ship’s Boat', '30-ton general-purpose small craft.', {
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
  }),
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
];
