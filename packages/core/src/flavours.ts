interface Flavouring<FlavourT> {
  _type?: FlavourT;
}
export type Flavour<T, FlavourT> = T & Flavouring<FlavourT>;

/** The tag string of a flavour type — or the string itself for a bare unit. */
type TagOf<F> = F extends string
  ? F
  : F extends Flavouring<infer T>
    ? T & string
    : never;

/**
 * A "per-unit" rate built from the flavour *types* it relates, e.g.
 * `Rate<MegaCredits, Tons>` for MCr/ton — not bare strings, so the units are
 * the real flavours (typo-safe, single source of truth). A denominator with no
 * flavour of its own may be given as a string literal (e.g. `Rate<Credits, '100
 * rounds'>`). Keeps both dimensions in the tag, so distinct rates don't mix and a
 * rate is never confused with a plain amount. (Weak, like all flavours: `rate *
 * quantity` collapses to `number`, which then assigns to the numerator flavour.)
 */
export type Rate<Num, Den> = Flavour<number, `${TagOf<Num>} per ${TagOf<Den>}`>;

/** A dimensionless multiplier (×1.2, ×0.25) — a cost/weight/range/capacity factor. */
export type Multiplier = Flavour<number, 'Multiplier'>;

/** A 0–1 proportion of some base ("X% of the receiver"), stored as a fraction. */
export type Fraction = Flavour<number, 'Fraction'>;

/** A percentage stored on the 100 scale (120 = 120%), e.g. a capacity setting. */
export type Percentage = Flavour<number, 'Percentage'>;

export type ArmourPoints = Flavour<number, 'ArmourPoints'>;
export type HullPoints = Flavour<number, 'HullPoints'>;
export type Power = Flavour<number, 'Power'>;
export type TechLevel = Flavour<number, 'TechLevel'>;
/** A count of projector attacks (for the propellant's attacks-per-kg rate). */
export type Attacks = Flavour<number, 'Attacks'>;

export type Credits = Flavour<number, 'Credits'>;
export type MegaCredits = Flavour<number, 'MegaCredits'>;

export type Metres = Flavour<number, 'Metres'>;
export type Kilometres = Flavour<number, 'Kilometres'>;
export type AstronomicalUnits = Flavour<number, 'AstronomicalUnits'>;
export type Parsecs = Flavour<number, 'Parsecs'>;

export type Kilograms = Flavour<number, 'Kilograms'>;
export type Tons = Flavour<number, 'Tons'>;

export type Seconds = Flavour<number, 'Seconds'>;
export type Minutes = Flavour<number, 'Minutes'>;
export type Hours = Flavour<number, 'Hours'>;
export type Days = Flavour<number, 'Days'>;

export type MetresPerSecond = Flavour<number, 'MetresPerSecond'>;
export type KilometresPerSecond = Flavour<number, 'KilometresPerSecond'>;

export type MetresPerSecondSquared = Flavour<number, 'MetresPerSecondSquared'>;
