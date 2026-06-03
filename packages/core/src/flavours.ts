interface Flavouring<FlavourT> {
  _type?: FlavourT;
}
export type Flavour<T, FlavourT> = T & Flavouring<FlavourT>;

export type ArmourPoints = Flavour<number, 'ArmourPoints'>;
export type HullPoints = Flavour<number, 'HullPoints'>;
export type Power = Flavour<number, 'Power'>;
export type TechLevel = Flavour<number, 'TechLevel'>;

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
