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
import { BARRELS, RECEIVER_FEATURES, SOURCE, STOCKS } from './data.js';
import {
  DELIVERY_SYSTEMS,
  GUIDANCE_COST_MULT,
  LAUNCHER_RECEIVERS,
  WARHEADS,
} from './launcherData.js';
import {
  error,
  modPct,
  pctOf,
  pushIf,
  round2,
  tlGate,
  warning,
} from './shared.js';
import type {
  Damage,
  LauncherParams,
  Traits,
  WeaponLineItem,
  WeaponProfile,
} from './types.js';
import type { WeaponEvaluation } from './weapon.js';

function validateLauncher(params: LauncherParams): Issue[] {
  const issues: Issue[] = [];
  const tl = params.tl;
  const receiver = LAUNCHER_RECEIVERS[params.receiver];
  const warhead = WARHEADS[params.warhead];
  const delivery = DELIVERY_SYSTEMS[params.delivery];
  pushIf(issues, tlGate(tl, receiver?.label ?? '', receiver?.minTL));
  pushIf(issues, tlGate(tl, `${warhead?.label} warhead`, warhead?.minTL));
  pushIf(issues, tlGate(tl, `${delivery?.label} munition`, delivery?.minTL));

  // Receiver-feature TL gates + mutually-exclusive groups (reuses firearm data).
  const groups = new Map<string, string[]>();
  for (const id of params.features) {
    const def = RECEIVER_FEATURES[id];
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
  const warhead = WARHEADS[params.warhead] ?? WARHEADS.fragmentation;
  const delivery =
    DELIVERY_SYSTEMS[params.delivery] ?? DELIVERY_SYSTEMS.cartridge;
  const barrel = BARRELS[params.barrel] ?? BARRELS.minimal;
  const stock = STOCKS[params.stock] ?? STOCKS.none;
  const features = params.features
    .map((id) => RECEIVER_FEATURES[id])
    .filter(Boolean);

  const issues = validateLauncher(params);
  const sources = new Set<string>([SOURCE]);

  // --- Phase 1: the receiver (firearm-style multiplicative chain) ---
  const lines: WeaponLineItem[] = [
    {
      label: `Receiver: ${receiver.label}`,
      costCr: round2(receiver.cost),
      weightKg: round2(receiver.weight),
    },
  ];

  let rc = receiver.cost;
  let rw = receiver.weight;
  const applyMod = (label: string, costMult: number, weightMult = 1) => {
    if (costMult === 1 && weightMult === 1) return;
    lines.push({
      label,
      costCr: round2(rc * costMult - rc),
      weightKg: round2(rw * weightMult - rw),
      costMod: modPct(costMult),
      weightMod: modPct(weightMult),
    });
    rc *= costMult;
    rw *= weightMult;
  };

  if (params.guidance) applyMod('Guidance', GUIDANCE_COST_MULT);
  for (const f of features) applyMod(f.label, f.costMult, f.weightMult);

  const baselineCost = round2(rc);
  const baselineWeight = round2(rw);

  const capacityBase =
    receiver.capacity === 'varies'
      ? Math.max(1, Math.floor(params.magazineSize))
      : receiver.capacity;
  const capacity = Math.max(
    1,
    Math.round(features.reduce((c, f) => c * f.capacityMult, capacityBase)),
  );

  lines.push({
    label: 'Receiver Totals',
    costCr: baselineCost,
    weightKg: baselineWeight,
    notes: `Capacity ${capacity}`,
  });

  // --- Phase 2: barrel + stock as a fraction of the modified baseline ---
  // (cost/weight only — a launcher's profile comes from its warhead, not barrel.)
  let componentCost = 0;
  let componentWeight = 0;
  const addPct = (label: string, costFrac: number, weightFrac: number) => {
    const costCr = round2(baselineCost * costFrac);
    const weightKg = round2(baselineWeight * weightFrac);
    componentCost += costCr;
    componentWeight += weightKg;
    lines.push({
      label,
      costCr,
      weightKg,
      costMod: pctOf(costFrac),
      weightMod: pctOf(weightFrac),
    });
  };
  if (barrel.costPct > 0 || barrel.weightPct > 0)
    addPct(`Barrel: ${barrel.label}`, barrel.costPct, barrel.weightPct);
  if (params.stock !== 'none')
    addPct(`Stock: ${stock.label}`, stock.costPct, stock.weightPct);

  const launcherCost = round2(baselineCost + componentCost);
  const launcherWeight = round2(baselineWeight + componentWeight);

  // --- Munition: payload priced/weighed by its delivery system ---
  const munitionWeight = round2(
    capacity * warhead.weight * delivery.weightMult,
  );
  const magazineCr = round2(capacity * warhead.cost * delivery.costMult);
  lines.push({
    label: `Munition: ${warhead.label} (${delivery.label}) ×${capacity}`,
    costCr: 0,
    weightKg: munitionWeight,
    notes: `Cr${magazineCr} to load`,
  });

  const totalWeight = round2(launcherWeight + munitionWeight);

  // --- Profile: payload damage/traits, delivery range + delivery traits ---
  const damage: Damage = warhead.damage ?? { dice: 0, die: 6, mod: 0 };
  const traits: Traits = {
    ...receiver.traits,
    ...warhead.traits,
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
  };
}
