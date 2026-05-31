/** Helpers shared by the firearm and energy weapon pipelines. */
import { SIGNATURE_LEVELS, type SignatureLevel } from './types.js';

/** Round to 6 d.p. to tame floating-point drift in the multiplicative model. */
export const round2 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Clamp a signature index into the defined level range. */
export const clampLevel = (i: number): SignatureLevel =>
  SIGNATURE_LEVELS[Math.max(0, Math.min(SIGNATURE_LEVELS.length - 1, i))]!;
