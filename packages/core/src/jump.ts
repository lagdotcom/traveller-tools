/**
 * MgT2 jump drive rules.
 *
 * Core rulebook: a jump consumes 10% of the ship's tonnage in fuel per parsec
 * jumped, i.e. fuel = 0.1 * hullTonnage * jumpNumber. A jump takes roughly one
 * week to complete — precisely 148 + 6D hours.
 */

/** Jump drives are rated Jump-1 through Jump-6 in the core rules. */
export const MIN_JUMP = 1;
export const MAX_JUMP = 6;

/** Fraction of hull tonnage consumed as fuel, per parsec jumped. */
export const JUMP_FUEL_FRACTION = 0.1;

export interface JumpFuelResult {
  /** Fuel required for the jump, in tons. */
  fuelTons: number;
  /** Fuel as a percentage of the hull tonnage. */
  fuelPercentOfHull: number;
}

/**
 * Fuel required for a single jump.
 *
 * @param hullTons    Total tonnage of the ship's hull.
 * @param jumpNumber  Parsecs to be jumped (the jump distance).
 */
export function jumpFuel(hullTons: number, jumpNumber: number): JumpFuelResult {
  if (hullTons <= 0) throw new RangeError('hullTons must be positive');
  if (jumpNumber <= 0) throw new RangeError('jumpNumber must be positive');

  const fuelTons = JUMP_FUEL_FRACTION * hullTons * jumpNumber;
  return {
    fuelTons,
    // Round to avoid floating-point noise (e.g. 0.1 * 3 * 100 = 30.0000004).
    fuelPercentOfHull:
      Math.round(JUMP_FUEL_FRACTION * jumpNumber * 100 * 1e6) / 1e6,
  };
}

export interface JumpValidation {
  ok: boolean;
  /** Human-readable reason when `ok` is false. */
  reason?: string;
}

/**
 * Check that a requested jump is legal: within Jump-1..Jump-6 and not beyond
 * the installed drive's rating.
 *
 * @param jumpNumber  Parsecs to be jumped.
 * @param driveRating Installed jump drive rating (defaults to MAX_JUMP).
 */
export function validateJump(
  jumpNumber: number,
  driveRating: number = MAX_JUMP,
): JumpValidation {
  if (!Number.isInteger(jumpNumber)) {
    return {
      ok: false,
      reason: 'Jump distance must be a whole number of parsecs',
    };
  }
  if (jumpNumber < MIN_JUMP || jumpNumber > MAX_JUMP) {
    return {
      ok: false,
      reason: `Jump distance must be between ${MIN_JUMP} and ${MAX_JUMP} parsecs`,
    };
  }
  if (jumpNumber > driveRating) {
    return {
      ok: false,
      reason: `Jump-${jumpNumber} exceeds the installed Jump-${driveRating} drive`,
    };
  }
  return { ok: true };
}

export interface JumpDuration {
  /** Minimum duration in hours (148 + 6 * 1). */
  minHours: number;
  /** Average duration in hours (148 + 6 * 3.5). */
  avgHours: number;
  /** Maximum duration in hours (148 + 6 * 6). */
  maxHours: number;
}

/**
 * Duration of a jump in hours: 148 + 6D hours per the core rules. We return the
 * min / average / max of the 6D roll rather than rolling, so callers stay pure
 * and testable (a separate dice helper can roll when an actual value is wanted).
 */
export function jumpDuration(): JumpDuration {
  const base = 148;
  return {
    minHours: base + 6 * 1,
    avgHours: base + 6 * 3.5,
    maxHours: base + 6 * 6,
  };
}
