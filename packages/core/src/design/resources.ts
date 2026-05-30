/**
 * Resources are the named, numeric budgets a design tracks. They are generic so
 * each builder uses its own set: ships use `tons` / `power` / `cost` /
 * `hardpoints`; robots will use `slots` / `power` / `bandwidth` / `cost`;
 * weapons `mass` / `cost`.
 *
 * Each resource has a mode that decides how the engine interprets the numbers
 * contributed by the chassis and components:
 *
 * - `capacity` — some sources *provide* the resource (a hull provides `tons`; a
 *   power plant provides `power`) and others *consume* it. Contributions are
 *   signed: positive provides, negative consumes. The engine checks that
 *   consumption does not exceed what is provided.
 * - `accumulate` — every contribution is simply summed, with no cap (`cost`).
 */
export type ResourceMode = 'capacity' | 'accumulate';

export interface ResourceDef {
  key: string;
  label: string;
  mode: ResourceMode;
  /**
   * Severity when a `capacity` resource is over-consumed (default 'error').
   * Some resources (e.g. ship power, which need not run every system at once)
   * are better surfaced as warnings.
   */
  overflowSeverity?: 'error' | 'warning';
}

/** A bag of resource contributions keyed by resource key. */
export type ResourceDelta = Record<string, number>;

/** Add `delta` into `target` in place (treating missing keys as 0). */
export function addDelta(target: ResourceDelta, delta: ResourceDelta): void {
  for (const [key, value] of Object.entries(delta)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export interface ResourceUsage {
  key: string;
  label: string;
  mode: ResourceMode;
  /** Sum of positive contributions (capacity provided). 0 for `accumulate`. */
  provided: number;
  /**
   * For `capacity`: total consumed (absolute value of negative contributions).
   * For `accumulate`: the running total of all contributions.
   */
  used: number;
  /** `provided - used` for `capacity`; always 0 for `accumulate`. */
  remaining: number;
  /** True only for `capacity` resources where `used > provided`. */
  overCapacity: boolean;
  /** Severity to report when `overCapacity` (from the resource definition). */
  overflowSeverity: 'error' | 'warning';
}

/**
 * Reduce the signed contributions for one resource into a usage summary.
 */
export function summariseResource(
  def: ResourceDef,
  contributions: number[],
): ResourceUsage {
  const overflowSeverity = def.overflowSeverity ?? 'error';
  if (def.mode === 'accumulate') {
    const used = contributions.reduce((sum, value) => sum + value, 0);
    return {
      key: def.key,
      label: def.label,
      mode: def.mode,
      provided: 0,
      used,
      remaining: 0,
      overCapacity: false,
      overflowSeverity,
    };
  }

  let provided = 0;
  let consumed = 0;
  for (const value of contributions) {
    if (value >= 0) provided += value;
    else consumed += -value;
  }
  return {
    key: def.key,
    label: def.label,
    mode: def.mode,
    provided,
    used: consumed,
    remaining: provided - consumed,
    overCapacity: consumed > provided,
    overflowSeverity,
  };
}
