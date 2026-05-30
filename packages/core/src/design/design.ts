import {
  type Catalog,
  contextOf,
  type Design,
  type DesignContext,
  getDef,
  type InstalledComponent,
  type Stats,
} from './component.js';
import {
  type ResourceDef,
  type ResourceDelta,
  type ResourceUsage,
  summariseResource,
} from './resources.js';

export interface DesignSummary<S extends Stats = Stats> {
  /** Per-resource usage, keyed by resource key. */
  resources: Record<string, ResourceUsage>;
  /** Merged derived stats (chassis base + every component, summed). */
  stats: S;
}

const quantityOf = (inst: InstalledComponent) => inst.quantity ?? 1;

/** Multiply each value in a delta by `n`. */
function scale(delta: ResourceDelta, n: number): ResourceDelta {
  if (n === 1) return delta;
  const out: ResourceDelta = {};
  for (const [key, value] of Object.entries(delta)) out[key] = value * n;
  return out;
}

/**
 * Aggregate a design into per-resource usage and merged stats. Contributions
 * are scaled by each component's quantity. Throws on an unknown component id
 * (catalogs are code-defined, so that's a programming error).
 */
export function summarize<S extends Stats>(
  design: Design<S>,
  catalog: Catalog<S>,
  resources: ResourceDef[],
): DesignSummary<S> {
  const ctx = contextOf(design);

  // Collect signed contributions per resource key, starting from the chassis.
  const contributions: Record<string, number[]> = {};
  const push = (delta: ResourceDelta) => {
    for (const [key, value] of Object.entries(delta)) {
      (contributions[key] ??= []).push(value);
    }
  };
  push(design.chassis.provides);

  const stats: Stats = {};
  const mergeStats = (partial: Partial<S>) => {
    for (const [key, value] of Object.entries(partial)) {
      if (typeof value === 'number') stats[key] = (stats[key] ?? 0) + value;
    }
  };
  mergeStats(design.chassis.baseStats ?? {});

  for (const inst of design.installed) {
    const def = getDef(catalog, inst.defId);
    const n = quantityOf(inst);
    push(scale(def.resources(inst, ctx), n));
    if (def.stats) {
      const partial = def.stats(inst, ctx);
      for (let i = 0; i < n; i++) mergeStats(partial);
    }
  }

  const usage: Record<string, ResourceUsage> = {};
  for (const def of resources) {
    usage[def.key] = summariseResource(def, contributions[def.key] ?? []);
  }

  return { resources: usage, stats: stats as S };
}

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
}

/** A validation rule: inspects the design + its summary and returns issues. */
export type Rule<S extends Stats = Stats> = (input: {
  design: Design<S>;
  summary: DesignSummary<S>;
  catalog: Catalog<S>;
  context: DesignContext;
}) => Issue[];

/** Flags any capacity resource consumed beyond what is provided. */
export const overCapacityRule: Rule = ({ summary }) =>
  Object.values(summary.resources)
    .filter((r) => r.overCapacity)
    .map((r) => ({
      severity: r.overflowSeverity,
      message: `${r.label} exceeds capacity by ${r.used - r.provided} (${r.used}/${r.provided})`,
    }));

/** Flags a component whose required categories are not all present. */
export const requiresRule: Rule = ({ design, catalog, context }) => {
  const present = new Set(
    context.installed.map((inst) => getDef(catalog, inst.defId).category),
  );
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const inst of design.installed) {
    const def = getDef(catalog, inst.defId);
    for (const need of def.requires ?? []) {
      const tag = `${def.id}->${need}`;
      if (!present.has(need) && !seen.has(tag)) {
        seen.add(tag);
        issues.push({
          severity: 'error',
          message: `${def.name} requires a ${need} component`,
        });
      }
    }
  }
  return issues;
};

/** Flags more than one component in a category marked `unique`. */
export const uniqueRule: Rule = ({ design, catalog }) => {
  const counts = new Map<string, { count: number; label: string }>();
  for (const inst of design.installed) {
    const def = getDef(catalog, inst.defId);
    if (!def.unique) continue;
    const entry = counts.get(def.category) ?? { count: 0, label: def.category };
    entry.count += 1;
    counts.set(def.category, entry);
  }
  return [...counts.values()]
    .filter((entry) => entry.count > 1)
    .map((entry) => ({
      severity: 'error' as const,
      message: `Only one ${entry.label} is allowed (found ${entry.count})`,
    }));
};

/** Flags components whose minimum tech level exceeds the design's TL. */
export const minTlRule: Rule = ({ design, catalog, context }) => {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const inst of design.installed) {
    const def = getDef(catalog, inst.defId);
    if (
      def.minTL !== undefined &&
      def.minTL > context.tl &&
      !seen.has(def.id)
    ) {
      seen.add(def.id);
      issues.push({
        severity: 'error',
        message: `${def.name} requires TL ${def.minTL} (design is TL ${context.tl})`,
      });
    }
  }
  return issues;
};

export const BUILTIN_RULES: Rule[] = [
  overCapacityRule,
  requiresRule,
  uniqueRule,
  minTlRule,
];

/** Summarize a design and run the built-in rules plus any extra rules. */
export function evaluate<S extends Stats>(
  design: Design<S>,
  catalog: Catalog<S>,
  resources: ResourceDef[],
  extraRules: Rule<S>[] = [],
): { summary: DesignSummary<S>; issues: Issue[] } {
  const summary = summarize(design, catalog, resources);
  const context = contextOf(design);
  const issues = [...(BUILTIN_RULES as Rule<S>[]), ...extraRules].flatMap(
    (rule) => rule({ design, summary, catalog, context }),
  );
  return { summary, issues };
}

/** Convenience wrapper returning only the issues. */
export function validate<S extends Stats>(
  design: Design<S>,
  catalog: Catalog<S>,
  resources: ResourceDef[],
  extraRules: Rule<S>[] = [],
): Issue[] {
  return evaluate(design, catalog, resources, extraRules).issues;
}
