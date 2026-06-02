/** Helpers shared by the firearm, energy, projector, launcher and grenade pipelines. */
import type { Issue } from '../design/index.js';
import {
  type NumericTraitName,
  SIGNATURE_LEVELS,
  type SignatureLevel,
  type Traits,
} from './types.js';

/** Round to 6 d.p. to tame floating-point drift in the multiplicative model. */
export const round2 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Clamp a signature index into the defined level range. */
export const clampLevel = (i: number): SignatureLevel =>
  SIGNATURE_LEVELS[Math.max(0, Math.min(SIGNATURE_LEVELS.length - 1, i))]!;

// --- Issues -----------------------------------------------------------------

export const error = (message: string): Issue => ({
  severity: 'error',
  message,
});
export const warning = (message: string): Issue => ({
  severity: 'warning',
  message,
});

/** A TL-gate issue (or null when the tech level is met). */
export const tlGate = (
  tl: number,
  label: string,
  minTL: number | undefined,
): Issue | null =>
  minTL && tl < minTL ? error(`${label} requires TL${minTL}`) : null;

/** Push an issue if it is non-null (pairs with `tlGate`). */
export const pushIf = (issues: Issue[], issue: Issue | null): void => {
  if (issue) issues.push(issue);
};

// --- Percentage-modifier formatting (for the itemised breakdown) ------------

/** Format a multiplier as a signed percentage modifier (×1.25 → "+25%"). */
export const modPct = (mult: number): string => {
  const p = Math.round((mult - 1) * 100);
  return p === 0 ? '—' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`;
};

/** Format a fraction-of-baseline as a "+N%" addition (0.15 → "+15%"). */
export const pctOf = (frac: number): string => {
  const p = Math.round(frac * 100);
  return p === 0 ? '—' : `+${p}%`;
};

// --- Final Penetration ------------------------------------------------------

/**
 * The Field Catalogue "Final Penetration" table. A weapon's net penetration
 * (clamped to ±4) maps to either a Lo-Pen trait (poor vs armour) or an AP trait
 * (armour-piercing); AP scales with the number of full damage dice and carries a
 * damage penalty. Returns the trait level(s) and the damage modifier to apply.
 */
export function penetrationProfile(
  pen: number,
  dice: number,
): { loPen?: number; ap?: number; damageMod: number } {
  const p = Math.max(-4, Math.min(4, Math.round(pen)));
  const full = Math.max(0, dice);
  if (p < 0) return { loPen: -p + 1, damageMod: 0 }; // −1→2 … −4→5
  switch (p) {
    case 1: // Semi-AP: AP 1 per full dice
      return { ap: full, damageMod: 0 };
    case 2: // AP: AP 1 + 1 per full dice; −1 damage per 2 full dice
      return { ap: 1 + full, damageMod: -Math.floor(full / 2) };
    case 3: // High-AP: AP 3 + 3 per 2 full dice; −2 damage per 3 full dice
      return {
        ap: 3 + 3 * Math.floor(full / 2),
        damageMod: -2 * Math.floor(full / 3),
      };
    case 4: // Extreme-AP: AP 5 + 2 per full dice; −1 damage per dice
      return { ap: 5 + 2 * full, damageMod: -full };
    default:
      return { damageMod: 0 };
  }
}

// --- Traits -----------------------------------------------------------------

/** Add a numeric trait level, stacking with any existing numeric value. */
export function addTrait(
  traits: Traits,
  name: NumericTraitName,
  level: number,
): void {
  const existing = traits[name];
  traits[name] = typeof existing === 'number' ? existing + level : level;
}

/** Merge a source trait map: numbers stack, `true`/string values overwrite. */
export function mergeTraits(traits: Traits, source?: Traits): void {
  if (!source) return;
  // The key/value pairing is guaranteed correct by the `Traits` type on `source`;
  // the loop just can't express that to the compiler, so the writes are cast.
  const out = traits as Record<string, number | string | true>;
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'number') addTrait(traits, k as NumericTraitName, v);
    else out[k] = v;
  }
}
