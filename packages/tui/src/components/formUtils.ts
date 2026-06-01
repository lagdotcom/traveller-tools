/** Small shared helpers for the sectioned builders (ship + weapon). */

/** Parse a numeric form value, falling back when it isn't a finite number. */
export const num = (value: string, fallback = 0): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Snap a choice value to an available option (the first when it isn't present). */
export const effective = (value: string, available: string[]): string =>
  available.includes(value) ? value : (available[0] ?? '');
