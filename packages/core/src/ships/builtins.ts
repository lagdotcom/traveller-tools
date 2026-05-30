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
];
