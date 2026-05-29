/**
 * In-system travel under constant thrust.
 *
 * Traveller ships accelerate continuously at their maneuver drive's thrust
 * rating (measured in G). The standard "flip and burn" profile accelerates to
 * the halfway point and decelerates for the second half, so:
 *
 *   each half: d/2 = 1/2 * a * t_half^2  =>  t_half = sqrt(d / a)
 *   total:     t   = 2 * sqrt(d / a)
 *   peak velocity at midpoint: v = a * t_half = sqrt(a * d)
 *
 * with d in metres and a in m/s^2.
 */

import { DistanceUnit, G_MS2, toKm } from './units.js';

export interface TravelResult {
  /** Total travel time in seconds (accelerate to midpoint, then decelerate). */
  seconds: number;
  /** Peak velocity reached at the midpoint, in metres per second. */
  peakVelocityMs: number;
  /** Peak velocity in kilometres per second, for convenience. */
  peakVelocityKms: number;
}

/**
 * Compute flip-and-burn travel time and peak velocity.
 *
 * @param distance  Distance to travel.
 * @param unit      Unit the distance is expressed in ('km' or 'AU').
 * @param thrustG   Maneuver drive thrust in G.
 * @param g         Value of 1 G in m/s^2 (defaults to standard gravity).
 */
export function travel(
  distance: number,
  unit: DistanceUnit,
  thrustG: number,
  g: number = G_MS2,
): TravelResult {
  if (distance <= 0) throw new RangeError('distance must be positive');
  if (thrustG <= 0) throw new RangeError('thrustG must be positive');

  const distanceM = toKm(distance, unit) * 1000;
  const a = thrustG * g;

  const seconds = 2 * Math.sqrt(distanceM / a);
  const peakVelocityMs = Math.sqrt(a * distanceM);

  return {
    seconds,
    peakVelocityMs,
    peakVelocityKms: peakVelocityMs / 1000,
  };
}

/** Break a duration in seconds into days / hours / minutes / seconds. */
export function humanizeDuration(totalSeconds: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  let remaining = Math.round(totalSeconds);
  const days = Math.floor(remaining / 86_400);
  remaining -= days * 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining -= hours * 3_600;
  const minutes = Math.floor(remaining / 60);
  remaining -= minutes * 60;
  return { days, hours, minutes, seconds: remaining };
}
