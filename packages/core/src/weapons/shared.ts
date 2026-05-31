/** Helpers shared by the firearm, energy, projector, launcher and grenade pipelines. */
import type { Issue } from '../design/index.js';
import { SIGNATURE_LEVELS, type SignatureLevel, type Traits } from './types.js';

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

// --- Traits -----------------------------------------------------------------

/** Add a numeric trait level, stacking with any existing numeric value. */
export function addTrait(traits: Traits, name: string, level: number): void {
  const existing = traits[name];
  traits[name] = typeof existing === 'number' ? existing + level : level;
}

/** Merge a source trait map: numbers stack, `true` flags overwrite. */
export function mergeTraits(traits: Traits, source?: Traits): void {
  if (!source) return;
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'number') addTrait(traits, k, v);
    else traits[k] = v;
  }
}
