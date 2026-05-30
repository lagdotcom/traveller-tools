import type { ResourceDelta } from './resources.js';

/**
 * Derived stats are a flat numeric record so the engine can merge contributions
 * additively (Thrust from the one M-drive, armour summed across layers, power
 * produced/consumed, …). Each builder narrows this to its own keys.
 */
export type Stats = Record<string, number>;

/** A component as actually installed in a design (a reference + chosen params). */
export interface InstalledComponent {
  defId: string;
  /** How many copies (e.g. number of turrets). Defaults to 1. */
  quantity?: number;
  /** A single numeric parameter — drive Thrust/Jump code, armour points, … */
  rating?: number;
  /** Any further per-install parameters (e.g. a list of fitted weapons). */
  options?: Record<string, number | string | string[]>;
}

/**
 * Context handed to a component's contribution functions. Most MgT2 components
 * size relative to the hull, so they need the chassis size and tech level as
 * well as visibility of everything else installed.
 */
export interface DesignContext {
  chassisSize: number;
  tl: number;
  installed: InstalledComponent[];
}

/**
 * A catalog entry: how a kind of component contributes resources and stats, and
 * what constraints it carries. Contributions are functions because they often
 * depend on the hull size / TL / other components.
 */
export interface ComponentDef<S extends Stats = Stats> {
  id: string;
  name: string;
  category: string;
  /** At most one component of this category may be installed. */
  unique?: boolean;
  /** Categories that must also be present for this component to be legal. */
  requires?: string[];
  /** Minimum tech level to install. */
  minTL?: number;
  /** Source book this component comes from, if not the base rules. */
  source?: string;
  /** Signed resource contributions (positive provides, negative consumes). */
  resources: (inst: InstalledComponent, ctx: DesignContext) => ResourceDelta;
  /** Additive contributions to the design's derived stats. */
  stats?: (inst: InstalledComponent, ctx: DesignContext) => Partial<S>;
  /** Optional descriptive label for a breakdown sheet (defaults to `name`). */
  describe?: (inst: InstalledComponent, ctx: DesignContext) => string;
}

/** The chassis (hull) that establishes the resource capacities and base stats. */
export interface Chassis<S extends Stats = Stats> {
  id: string;
  name: string;
  size: number;
  tl?: number;
  /** Capacities the chassis provides (e.g. `{ tons: size, hardpoints: n }`). */
  provides: ResourceDelta;
  baseStats?: Partial<S>;
}

export interface Design<S extends Stats = Stats> {
  chassis: Chassis<S>;
  installed: InstalledComponent[];
  /** Design tech level; defaults to the chassis TL. */
  tl?: number;
}

/** Component definitions keyed by id. */
export type Catalog<S extends Stats = Stats> = Record<string, ComponentDef<S>>;

/** Look up a definition, throwing a clear error for an unknown id. */
export function getDef<S extends Stats>(
  catalog: Catalog<S>,
  defId: string,
): ComponentDef<S> {
  const def = catalog[defId];
  if (!def) throw new Error(`Unknown component definition: ${defId}`);
  return def;
}

/** Build the per-evaluation context from a design. */
export function contextOf<S extends Stats>(design: Design<S>): DesignContext {
  return {
    chassisSize: design.chassis.size,
    tl: design.tl ?? design.chassis.tl ?? 0,
    installed: design.installed,
  };
}
