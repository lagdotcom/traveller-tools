/**
 * `evaluateGrenade` — resolves a thrown grenade's type + size to the shared
 * `WeaponEvaluation` shape. There's no construction maths: the catalogue entry
 * is the answer, so this mostly validates and packages the lookup.
 */
import type { Issue } from '../design/index.js';
import { SOURCE } from './data.js';
import { GRENADES, type GrenadeSizeStats } from './grenadeData.js';
import { error, pushIf, round2, tlGate, warning } from './shared.js';
import type {
  Damage,
  GrenadeParams,
  Traits,
  WeaponLineItem,
  WeaponProfile,
} from './types.js';
import type { WeaponEvaluation } from './weapon.js';

export function evaluateGrenade(params: GrenadeParams): WeaponEvaluation {
  const def = GRENADES[params.type] ?? GRENADES.fragmentation;
  const issues: Issue[] = [];
  const sources = new Set<string>([SOURCE]);

  // A mini-grenade may not exist for this payload — fall back to Hand.
  let size = params.size;
  let stats: GrenadeSizeStats;
  if (size === 'mini' && !def.mini) {
    issues.push(error(`${def.label} is not available as a mini-grenade`));
    size = 'hand';
    stats = def.hand;
  } else {
    stats = (size === 'mini' ? def.mini : def.hand) ?? def.hand;
  }

  pushIf(issues, tlGate(params.tl, def.label, def.minTL));

  const sizeLabel = size === 'mini' ? 'Mini' : 'Hand';
  const breakdown: WeaponLineItem[] = [
    {
      label: `${def.label} (${sizeLabel} grenade)`,
      costCr: round2(stats.cost),
      weightKg: round2(stats.weight),
    },
  ];

  const damage: Damage = stats.damage ?? { dice: 0, die: 6, mod: 0 };
  const traits: Traits = { ...stats.traits };

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range: 0, // thrown — effective range depends on the thrower, not the weapon
    auto: 0,
    recoil: 0,
    quickdraw: 0,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'high',
    heat: 0,
    capacity: 1,
    traits,
  };

  issues.push(
    warning(
      'Thrown range and Signature are not weapon stats in the Field Catalogue — range depends on the thrower; the Signature shown is unverified.',
    ),
  );

  return {
    profile,
    breakdown,
    issues,
    totals: {
      costCr: round2(stats.cost),
      weightKg: round2(stats.weight),
      magazineCr: 0,
    },
    sources: [...sources],
  };
}
