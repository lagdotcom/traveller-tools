/**
 * Physical constants and unit conversions used across the rules engine.
 *
 * Traveller distances are quoted in parsecs (jump) and in km / AU / diameters
 * (in-system travel). We keep everything here so the formulas elsewhere read
 * cleanly and the "1 G" assumption lives in exactly one place.
 */

import type {
  AstronomicalUnits,
  Kilometres,
  MetresPerSecondSquared,
} from './flavours';

/** Standard gravity in m/s^2. Traveller's "thrust in G" is multiplied by this. */
export const G_MS2: MetresPerSecondSquared = 9.81;

/** Kilometres in one astronomical unit. */
export const AU_KM: Kilometres = 149_597_870.7;

/** Kilometres in one parsec (used for reference / future tools). */
export const PARSEC_KM: Kilometres = 3.085_677_581e13;

/** Convert a distance given in AU to kilometres. */
export function auToKm(au: AstronomicalUnits): Kilometres {
  return au * AU_KM;
}

/** Convert a distance given in kilometres to AU. */
export function kmToAu(km: Kilometres): AstronomicalUnits {
  return km / AU_KM;
}

/** Supported distance units for travel calculations. */
export type DistanceUnit = 'km' | 'AU';

/** Normalise a distance in the given unit to kilometres. */
export function toKm(
  distance: Kilometres | AstronomicalUnits,
  unit: DistanceUnit,
): number {
  return unit === 'AU' ? auToKm(distance) : distance;
}
