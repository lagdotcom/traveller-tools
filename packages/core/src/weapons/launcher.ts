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
import type { Damage, LauncherParams, Traits, WeaponProfile } from './types.js';
import type { WeaponEvaluation } from './weapon.js';

function validateLauncher(params: LauncherParams): Issue[] {
  const issues: Issue[] = [];
  const tl = params.tl;
  const receiver = LAUNCHER_RECEIVERS[params.receiver];
  const warhead = GRENADES[params.warhead];
  const delivery = DELIVERY_SYSTEMS[params.delivery];
  pushIf(issues, tlGate(tl, receiver?.label ?? '', receiver?.minTL));
  pushIf(issues, tlGate(tl, `${warhead?.label} warhead`, warhead?.minTL));
  pushIf(issues, tlGate(tl, `${delivery?.label} munition`, delivery?.minTL));

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
  // The payload is a Grenade Weapons table entry at the chosen body size (mini
  // falls back to hand when that payload isn't made as a mini).
  const warheadDef = GRENADES[params.warhead] ?? GRENADES.fragmentation;
  const payload =
    (params.warheadSize === 'mini' ? warheadDef.mini : warheadDef.hand) ??
    warheadDef.hand;
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
  const munitionWeight = round2(
    capacity * payload.weight * delivery.weightMult,
  );
  const magazineCr = round2(capacity * payload.cost * delivery.costMult);
  const warheadLabel =
    params.warheadSize === 'mini'
      ? `${warheadDef.label} (Mini)`
      : warheadDef.label;

  // The receiver is firearm-style (base → multiplicative chain → baseline); the
  // barrel/stock are a % of that baseline (cost/weight only — a launcher's profile
  // comes from its warhead). The munition adds its loaded weight; its cost is the
  // separate reload price, not part of the launcher cost.
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
      label: `Munition: ${warheadLabel} (${delivery.label}) ×${capacity}`,
      costCr: 0,
      weightKg: munitionWeight,
      notes: `Cr${magazineCr} to load`,
    })),
  ]);
  const lines = build.lines;
  const launcherCost = round2(build.cost);
  const totalWeight = round2(build.weight);

  // --- Profile: payload damage/traits, delivery range + delivery traits ---
  const damage: Damage = payload.damage ?? { dice: 0, die: 6, mod: 0 };
  const traits: Traits = {
    ...receiver.traits,
    ...payload.traits,
    ...delivery.traits,
  };
  if (params.guidance) traits.Smart = true;

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range: delivery.range,
    auto: 0,
    recoil: 0,
    quickdraw: 0,
    penetration: 0,
    // Physical (normal), per the launcher worked examples (IP-2, Spigot Mortar,
    // ASSW, Tac Missile System).
    signatureKind: 'physical',
    signature: 'normal',
    heat: 0,
    capacity,
    traits,
  };

  // Cartridge/RAM rounds use the hand payload's profile (the FC says they're
  // "equivalent in effect"); RPG/missile carry a larger warhead whose own damage
  // isn't tabled in the supplied text, so flag those.
  if (delivery.largerWarhead)
    issues.push(
      warning(
        `${delivery.label} rounds carry a larger warhead than the hand-grenade payload; its damage/blast aren't in the supplied text and are shown as the payload's.`,
      ),
    );

  return {
    profile,
    breakdown: lines,
    issues,
    totals: { costCr: launcherCost, weightKg: totalWeight, magazineCr },
    sources: [...sources],
    notes: collectNotes({ features: params.features }),
  };
}
