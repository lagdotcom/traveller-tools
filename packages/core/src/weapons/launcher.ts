/**
 * `evaluateLauncher` — derives the profile, cost/weight breakdown, issues and
 * sources for a Launcher (grenade / rocket / missile). The weapon is essentially
 * its receiver (+ optional guidance); the loaded warhead shapes the profile and
 * its price is the reload cost, not part of the build. Returns the shared
 * `WeaponEvaluation` shape.
 */
import type { Issue } from '../design/index.js';
import { SOURCE } from './data.js';
import {
  DELIVERY_SYSTEMS,
  GUIDANCE_COST_MULT,
  LAUNCHER_RECEIVERS,
  WARHEADS,
} from './launcherData.js';
import { pushIf, round2, tlGate, warning } from './shared.js';
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
  const receiver = LAUNCHER_RECEIVERS[params.receiver];
  const warhead = WARHEADS[params.warhead];
  const delivery = DELIVERY_SYSTEMS[params.delivery];
  pushIf(issues, tlGate(params.tl, receiver?.label ?? '', receiver?.minTL));
  pushIf(
    issues,
    tlGate(params.tl, `${warhead?.label} warhead`, warhead?.minTL),
  );
  pushIf(
    issues,
    tlGate(params.tl, `${delivery?.label} munition`, delivery?.minTL),
  );
  return issues;
}

export function evaluateLauncher(params: LauncherParams): WeaponEvaluation {
  const receiver =
    LAUNCHER_RECEIVERS[params.receiver] ?? LAUNCHER_RECEIVERS.tubeSingleLight;
  const warhead = WARHEADS[params.warhead] ?? WARHEADS.fragmentation;
  const delivery =
    DELIVERY_SYSTEMS[params.delivery] ?? DELIVERY_SYSTEMS.cartridge;

  const issues = validateLauncher(params);
  const sources = new Set<string>([SOURCE]);

  const capacity =
    receiver.capacity === 'varies'
      ? Math.max(1, Math.floor(params.magazineSize))
      : receiver.capacity;

  // --- Build cost / weight ---
  const receiverCost = round2(
    receiver.cost * (params.guidance ? GUIDANCE_COST_MULT : 1),
  );
  // A round = the payload priced/weighed by its delivery system; loaded weight
  // includes a full load (FC: missile launchers).
  const munitionWeight = round2(
    capacity * warhead.weight * delivery.weightMult,
  );
  const totalWeight = round2(receiver.weight + munitionWeight);
  const magazineCr = round2(capacity * warhead.cost * delivery.costMult);

  const breakdown: WeaponLineItem[] = [
    {
      label: `Receiver: ${receiver.label}${params.guidance ? ' + Guidance' : ''}`,
      costCr: receiverCost,
      weightKg: receiver.weight,
      notes: `${capacity} round${capacity === 1 ? '' : 's'}`,
    },
    {
      label: `Munition: ${warhead.label} (${delivery.label}) ×${capacity}`,
      costCr: 0,
      weightKg: munitionWeight,
      notes: `Cr${magazineCr} to load`,
    },
  ];

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
    breakdown,
    issues,
    totals: { costCr: receiverCost, weightKg: totalWeight, magazineCr },
    sources: [...sources],
  };
}
