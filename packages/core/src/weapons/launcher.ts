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
  pushIf(issues, tlGate(params.tl, receiver?.label ?? '', receiver?.minTL));
  pushIf(
    issues,
    tlGate(params.tl, `${warhead?.label} warhead`, warhead?.minTL),
  );
  return issues;
}

export function evaluateLauncher(params: LauncherParams): WeaponEvaluation {
  const receiver =
    LAUNCHER_RECEIVERS[params.receiver] ?? LAUNCHER_RECEIVERS.tubeSingleLight;
  const warhead = WARHEADS[params.warhead] ?? WARHEADS.fragmentation;

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
  // Loaded weight includes a full load of munitions (FC: missile launchers).
  const munitionWeight = round2(capacity * warhead.weight);
  const totalWeight = round2(receiver.weight + munitionWeight);
  const magazineCr = round2(capacity * warhead.cost);

  const breakdown: WeaponLineItem[] = [
    {
      label: `Receiver: ${receiver.label}${params.guidance ? ' + Guidance' : ''}`,
      costCr: receiverCost,
      weightKg: receiver.weight,
      notes: `${capacity} round${capacity === 1 ? '' : 's'}`,
    },
    {
      label: `Warhead: ${warhead.label} ×${capacity}`,
      costCr: 0,
      weightKg: munitionWeight,
      notes: `Cr${magazineCr} to load`,
    },
  ];

  // --- Profile (from the loaded warhead) ---
  const damage: Damage = warhead.damage ?? { dice: 0, die: 6, mod: 0 };
  const traits: Traits = { ...receiver.traits, ...warhead.traits };
  if (params.guidance) traits.Smart = true;

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range: receiver.range,
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

  // The warhead damage/blast values are still the FC thrown Hand-grenade figures
  // (the launcher-calibre munition table isn't in the supplied text).
  issues.push(
    warning(
      'Warhead damage values are the Field Catalogue Hand-grenade figures; launcher-calibre munition stats are not in the supplied text.',
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
