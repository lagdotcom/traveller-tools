/**
 * `evaluateLauncher` — derives the profile, cost/weight breakdown, issues and
 * sources for a Launcher (grenade / rocket / missile).
 *
 * The receiver is built exactly like a firearm: a base tube/reusable/field
 * receiver, modified by a multiplicative chain of receiver features (Lightweight,
 * Bullpup, …) plus an optional guidance system, then a barrel and stock added as
 * a percentage of that modified baseline. Unlike a firearm, the barrel/stock are
 * cost/weight only — the fired profile comes from the loaded warhead (damage/
 * traits) and its delivery system (range), not from the barrel. Returns the
 * shared `WeaponEvaluation` shape.
 */
import type { Issue } from '../design/index.js';
import {
  BARRELS,
  collectNotes,
  resolveFeature,
  resolveFeatures,
  SOURCE,
  STOCKS,
} from './data.js';
import { GRENADES } from './grenadeData.js';
import {
  DELIVERY_SYSTEMS,
  GUIDANCE_COST_MULT,
  LAUNCHER_RECEIVERS,
  MISSILE_WARHEADS,
} from './launcherData.js';
import {
  base,
  baseline,
  component,
  each,
  pctComponent,
  runBuild,
  step,
  when,
} from './pipeline.js';
import { error, pushIf, round2, tlGate, warning } from './shared.js';
import type {
  Damage,
  LauncherParams,
  LauncherWarhead,
  Traits,
  WeaponProfile,
} from './types.js';
import type { WeaponEvaluation } from './weapon.js';

function validateLauncher(params: LauncherParams): Issue[] {
  const issues: Issue[] = [];
  const tl = params.tl;
  const receiver = LAUNCHER_RECEIVERS[params.receiver];
  pushIf(issues, tlGate(tl, receiver?.label ?? '', receiver?.minTL));
  // Loaded missiles are the munition (overriding the grenade payloads + delivery).
  const missiles = (params.missiles ?? []).map((id) => MISSILE_WARHEADS[id]);
  if (missiles.length > 0) {
    for (const m of missiles)
      if (m) pushIf(issues, tlGate(tl, m.label, m.minTL));
  } else {
    for (const wh of params.warheads) {
      const w = GRENADES[wh.type];
      pushIf(issues, tlGate(tl, `${w?.label} warhead`, w?.minTL));
    }
    // TL-gate each delivery in use (the launcher default + any per-warhead override).
    const deliveryIds = new Set(
      params.warheads.map((wh) => wh.delivery ?? params.delivery),
    );
    for (const id of deliveryIds) {
      const dlv = DELIVERY_SYSTEMS[id];
      pushIf(issues, tlGate(tl, `${dlv?.label} munition`, dlv?.minTL));
    }
  }

  // Receiver-feature TL gates + mutually-exclusive groups (reuses firearm data).
  const groups = new Map<string, string[]>();
  for (const ref of params.features) {
    const def = resolveFeature(ref);
    if (!def) continue;
    pushIf(issues, tlGate(tl, def.label, def.minTL));
    if (def.group)
      (groups.get(def.group) ?? groups.set(def.group, []).get(def.group)!).push(
        def.label,
      );
  }
  for (const labels of groups.values())
    if (labels.length > 1)
      issues.push(error(`Incompatible features: ${labels.join(' + ')}`));

  return issues;
}

export function evaluateLauncher(params: LauncherParams): WeaponEvaluation {
  const receiver =
    LAUNCHER_RECEIVERS[params.receiver] ?? LAUNCHER_RECEIVERS.tubeSingleLight;
  const delivery =
    DELIVERY_SYSTEMS[params.delivery] ?? DELIVERY_SYSTEMS.cartridge;
  const barrel = BARRELS[params.barrel] ?? BARRELS.minimal;
  const stock = STOCKS[params.stock] ?? STOCKS.none;
  const features = resolveFeatures(params.features);

  const issues = validateLauncher(params);
  const sources = new Set<string>([SOURCE]);

  const capacityBase =
    receiver.capacity === 'varies'
      ? Math.max(1, Math.floor(params.magazineSize))
      : receiver.capacity;
  const capacity = Math.max(
    1,
    Math.round(features.reduce((c, f) => c * f.capacityMult, capacityBase)),
  );

  // Build a profile from a range + damage + traits (the launcher itself is
  // recoilless/single, Physical (normal) per the worked examples).
  const mkProfile = (
    range: number,
    damage: Damage,
    traits: Traits,
  ): WeaponProfile => {
    const t: Traits = { ...receiver.traits, ...traits };
    if (params.guidance) t.Smart = true;
    return {
      tl: params.tl,
      damage,
      range,
      auto: 0,
      recoil: 0,
      quickdraw: 0,
      penetration: 0,
      signatureKind: 'physical',
      signature: 'normal',
      heat: 0,
      capacity,
      traits: t,
    };
  };

  // Resolve the loaded munitions. Like a firearm's ammo list, the build is fixed
  // and each munition yields its own profile row; the first (primary) sets the
  // headline weight/profile/reload. Loaded missiles (self-contained rounds, no
  // delivery multiplier) override the grenade-payload path entirely.
  const missiles = (params.missiles ?? [])
    .map((id) => MISSILE_WARHEADS[id])
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
  type Munition = {
    /** The warhead / missile id (matched against the book's `warheads` map). */
    key: string;
    label: string;
    /** Loaded weight (per-round weight × capacity). */
    weight: number;
    /** Reload price of a full load. */
    reload: number;
    /** Per-round weight (a single munition), as the book lists it. */
    roundWeightKg: number;
    /** Per-round cost (a single munition), as the book lists it. */
    roundCostCr: number;
    largerWarhead?: boolean;
    deliveryLabel?: string;
    profile: WeaponProfile;
  };
  const munitions: Munition[] =
    missiles.length > 0
      ? (params.missiles ?? [])
          .filter((id) => MISSILE_WARHEADS[id] !== undefined)
          .map((id) => {
            const m = MISSILE_WARHEADS[id]!;
            const mode = m.modes[0]!;
            return {
              key: id,
              label: m.label,
              weight: round2(capacity * m.weight),
              reload: round2(capacity * m.cost),
              roundWeightKg: round2(m.weight),
              roundCostCr: round2(m.cost),
              profile: mkProfile(m.range, mode.damage, {
                ...m.traits,
                ...mode.traits,
              }),
            };
          })
      : (params.warheads.length > 0
          ? params.warheads
          : ([{ type: 'fragmentation' }] as LauncherWarhead[])
        ).map((w) => {
          const def = GRENADES[w.type] ?? GRENADES.fragmentation;
          const payload =
            (params.warheadSize === 'mini' ? def.mini : def.hand) ?? def.hand;
          // Each warhead may override the launcher's default delivery.
          const dlv =
            DELIVERY_SYSTEMS[w.delivery ?? params.delivery] ?? delivery;
          const sizeTag = params.warheadSize === 'mini' ? ' (Mini)' : '';
          const roundWeightKg = round2(payload.weight * dlv.weightMult);
          const roundCostCr = round2(payload.cost * dlv.costMult);
          return {
            key: w.type,
            label: `${def.label}${sizeTag} (${dlv.label})`,
            weight: round2(capacity * roundWeightKg),
            reload: round2(capacity * roundCostCr),
            roundWeightKg,
            roundCostCr,
            largerWarhead: dlv.largerWarhead === true,
            deliveryLabel: dlv.label,
            profile: mkProfile(
              dlv.range,
              payload.damage ?? { dice: 0, die: 6, mod: 0 },
              { ...payload.traits, ...dlv.traits },
            ),
          };
        });
  const primary = munitions[0]!;
  // The grenade label already embeds its delivery; the missile label doesn't.
  const primaryLine = `Munition: ${primary.label} ×${capacity}`;

  // The receiver is firearm-style (base → multiplicative chain → baseline); the
  // barrel/stock are a % of that baseline (cost/weight only — a launcher's profile
  // comes from its munition). The primary munition adds its loaded weight; its
  // cost is the separate reload price, not part of the launcher cost.
  const build = runBuild([
    base(`Receiver: ${receiver.label}`, receiver.cost, receiver.weight),
    when(params.guidance, step('Guidance', GUIDANCE_COST_MULT)),
    each(features, (f) => step(f.label, f.costMult, f.weightMult)),
    baseline('Receiver Totals', `Capacity ${capacity}`),
    when(
      barrel.costPct > 0 || barrel.weightPct > 0,
      pctComponent(`Barrel: ${barrel.label}`, barrel.costPct, barrel.weightPct),
    ),
    when(
      params.stock !== 'none',
      pctComponent(`Stock: ${stock.label}`, stock.costPct, stock.weightPct),
    ),
    component(() => ({
      label: primaryLine,
      cost: 0,
      weight: primary.weight,
      notes: `Cr${primary.reload} to load`,
    })),
  ]);
  const lines = build.lines;
  const launcherCost = round2(build.cost);
  const totalWeight = round2(build.weight);

  // Cartridge/RAM rounds use the hand payload's profile (the FC says they're
  // "equivalent in effect"); an RPG round carries a larger warhead whose own
  // damage isn't tabled in the supplied text, so flag each such delivery.
  for (const label of new Set(
    munitions.filter((m) => m.largerWarhead).map((m) => m.deliveryLabel),
  ))
    issues.push(
      warning(
        `${label} rounds carry a larger warhead than the hand-grenade payload; its damage/blast aren't in the supplied text and are shown as the payload's.`,
      ),
    );
  // A missile with several firing modes shows only its primary (first) mode.
  for (const m of missiles)
    if (m.modes.length > 1)
      issues.push(
        warning(
          `${m.label} has ${m.modes.length} firing modes (${m.modes.map((x) => x.label).join(', ')}); the profile shows the primary mode (${m.modes[0]!.label}).`,
        ),
      );

  return {
    profile: primary.profile,
    breakdown: lines,
    issues,
    totals: {
      cost: launcherCost,
      weight: totalWeight,
      reload: primary.reload,
    },
    sources: [...sources],
    notes: collectNotes({ features: params.features }),
    ...(munitions.length > 1
      ? {
          munitionProfiles: munitions.map((m) => ({
            key: m.key,
            label: m.label,
            profile: m.profile,
            reload: m.reload,
            weight: m.roundWeightKg,
            cost: m.roundCostCr,
          })),
        }
      : {}),
  };
}
