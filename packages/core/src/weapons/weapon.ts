/**
 * `evaluateWeapon` — turns conventional-firearm parameters into a derived weapon
 * profile, a component cost/weight breakdown, validation issues, and the source
 * books used. It mirrors the *shape* of the ship domain's `evaluateShip` but, as
 * the Field Catalogue cost model is sequential-multiplicative off a receiver
 * baseline, walks an explicit pipeline rather than the additive `summarize`.
 */
import type { Issue } from '../design/index.js';
import {
  ACCESSORIES,
  AMMO_TYPES,
  BARRELS,
  CALIBRES,
  FEEDS,
  FURNITURE,
  GAUSS_CAPACITY_MULT,
  GAUSS_COST_MULT,
  GAUSS_WEIGHT_MULT,
  INCREASED_AUTO,
  MECHANISMS,
  RECEIVER_FEATURES,
  RECEIVERS,
  RECOIL_CLASS_MOD,
  SMOOTHBORE_CAPACITY,
  SOURCE,
  STOCKS,
} from './data.js';
import {
  type Damage,
  SIGNATURE_LEVELS,
  type SignatureLevel,
  type Traits,
  type WeaponLineItem,
  type WeaponParams,
  type WeaponProfile,
} from './types.js';

export interface WeaponEvaluation {
  profile: WeaponProfile;
  breakdown: WeaponLineItem[];
  issues: Issue[];
  totals: { costCr: number; weightKg: number; magazineCr: number };
  sources: string[];
}

// --- Small helpers ----------------------------------------------------------

/** Format a Damage as the book does: `3D`, `3D-3`, `3D3+1` (D3 dice), `1`. */
export function formatDamage(dmg: Damage): string {
  if (dmg.dice <= 0) return String(Math.max(0, dmg.mod));
  const base = `${dmg.dice}D${dmg.die === 3 ? '3' : ''}`;
  if (dmg.mod === 0) return base;
  return `${base}${dmg.mod > 0 ? '+' : ''}${dmg.mod}`;
}

/**
 * Reduce a damage value by `n` dice, applying the "running out of dice" rule:
 * 1D → D3 → 1 point → 0. Operates on the dice count, preserving the modifier.
 */
function reduceDice(dmg: Damage, n: number): Damage {
  let { dice, die } = dmg;
  for (let i = 0; i < n; i++) {
    if (dice > 1) dice -= 1;
    else if (die === 6)
      die = 3; // 1D → 1D3
    else if (dice === 1) {
      dice = 0; // 1D3 → 1 point (represented as 0 dice, mod handled by caller)
    }
  }
  return { dice, die, mod: dmg.mod };
}

const round2 = (n: number): number => Math.round(n * 1e6) / 1e6;

// --- Validation -------------------------------------------------------------

const RECEIVER_ORDER = [
  'handgun',
  'assault',
  'longarm',
  'lsw',
  'heavy',
] as const;

/** Domain rules beyond the per-component TL gates, returning issues. */
function validate(params: WeaponParams): Issue[] {
  const issues: Issue[] = [];
  const tl = params.tl;
  const calibre = CALIBRES[params.calibre];

  // Gauss rounds force a gauss receiver, and vice-versa is illegal.
  if (calibre.gauss && !params.gauss)
    issues.push({
      severity: 'error',
      message: `${calibre.label} requires a gauss receiver`,
    });
  if (params.gauss && tl < 12)
    issues.push({ severity: 'error', message: 'Gauss weapons require TL12' });

  // Calibre ↔ receiver minimums (anti-materiel needs an LSW; heavy AM a Heavy).
  if (calibre.minReceiver) {
    const need = RECEIVER_ORDER.indexOf(calibre.minReceiver);
    const have = RECEIVER_ORDER.indexOf(params.receiver);
    if (have < need)
      issues.push({
        severity: 'error',
        message: `${calibre.label} requires at least a ${RECEIVERS[calibre.minReceiver].label}`,
      });
  }

  // Increased Auto only on burst/full-auto receivers.
  if (params.autoIncrease > 0 && MECHANISMS[params.mechanism].auto === 0)
    issues.push({
      severity: 'error',
      message:
        'Increased Rate of Fire needs a burst-capable or fully-automatic mechanism',
    });

  // Mutually-exclusive feature groups (size, weight, cooling, stealth).
  const groups = new Map<string, string[]>();
  for (const id of params.features) {
    const def = RECEIVER_FEATURES[id];
    if (def.group)
      (groups.get(def.group) ?? groups.set(def.group, []).get(def.group)!).push(
        def.label,
      );
    if (def.minTL && tl < def.minTL)
      issues.push({
        severity: 'error',
        message: `${def.label} requires TL${def.minTL}`,
      });
  }
  for (const labels of groups.values())
    if (labels.length > 1)
      issues.push({
        severity: 'error',
        message: `Incompatible features: ${labels.join(' + ')}`,
      });

  // Bullpup requires a full stock; high-capacity is incompatible with compacting.
  if (params.features.includes('bullpup') && params.stock !== 'full')
    issues.push({
      severity: 'error',
      message: 'A Bullpup weapon must have a full stock',
    });
  if (
    params.features.includes('highCapacity') &&
    (params.features.includes('compact') ||
      params.features.includes('veryCompact'))
  )
    issues.push({
      severity: 'error',
      message: 'High Capacity is incompatible with Compact / Very Compact',
    });

  // Accessory TL gates.
  for (const id of params.accessories) {
    const def = ACCESSORIES[id];
    if (def.minTL && tl < def.minTL)
      issues.push({
        severity: 'error',
        message: `${def.label} requires TL${def.minTL}`,
      });
  }

  // Loaded ammunition TL gate.
  const ammo = AMMO_TYPES[params.ammo];
  if (ammo.minTL && tl < ammo.minTL)
    issues.push({
      severity: 'error',
      message: `${ammo.label} ammunition requires TL${ammo.minTL}`,
    });

  return issues;
}

// --- The pipeline -----------------------------------------------------------

const clampLevel = (i: number): SignatureLevel =>
  SIGNATURE_LEVELS[Math.max(0, Math.min(SIGNATURE_LEVELS.length - 1, i))];

export function evaluateWeapon(params: WeaponParams): WeaponEvaluation {
  const receiver = RECEIVERS[params.receiver] ?? RECEIVERS.handgun;
  const calibre = CALIBRES[params.calibre] ?? CALIBRES.mediumHandgun;
  const mechanism = MECHANISMS[params.mechanism] ?? MECHANISMS.semiAuto;
  const barrel = BARRELS[params.barrel] ?? BARRELS.rifle;
  const stock = STOCKS[params.stock] ?? STOCKS.none;
  const feed = FEEDS[params.feed] ?? FEEDS.standard;
  const ammo = AMMO_TYPES[params.ammo] ?? AMMO_TYPES.ball;

  const issues = validate(params);
  const sources = new Set<string>([SOURCE]);

  const features = params.features
    .map((id) => RECEIVER_FEATURES[id])
    .filter(Boolean);
  const autoSteps = Math.max(0, Math.min(6, Math.floor(params.autoIncrease)));
  const incAuto = INCREASED_AUTO[autoSteps];

  // --- Receiver baseline (sequential-multiplicative) ---
  let cost = receiver.baseCost;
  let weight = receiver.baseWeight;
  if (params.gauss) {
    cost *= GAUSS_COST_MULT;
    weight *= GAUSS_WEIGHT_MULT;
  }
  cost *= mechanism.costMult;
  cost *= calibre.receiverCostMult;
  weight *= calibre.receiverWeightMult;

  // Base ammunition capacity. Large-calibre smoothbores use fixed per-receiver
  // values and ignore mechanism limits; everything else scales off the receiver.
  let capacity: number;
  if (calibre.smoothbore) {
    capacity = SMOOTHBORE_CAPACITY[params.receiver];
  } else {
    capacity = receiver.baseCapacity;
    if (params.gauss) capacity *= GAUSS_CAPACITY_MULT;
    capacity *= calibre.capacityMult;
    capacity *= mechanism.capacityMult;
  }

  let ammoCostMult = 1;
  for (const f of features) {
    cost *= f.costMult;
    weight *= f.weightMult;
    capacity *= f.capacityMult;
    if (f.ammoCostMult) ammoCostMult *= f.ammoCostMult;
  }
  cost *= incAuto.cost;
  weight *= incAuto.weight;
  // Magazine-capacity adjustment (50–150% of base): cost +10%/−5% per 10 %,
  // weight ±5% per 10 %.
  const capPct = Number.isFinite(params.capacityPct) ? params.capacityPct : 100;
  const steps = (capPct - 100) / 10;
  const costCapMult = capPct >= 100 ? 1 + 0.1 * steps : 1 + 0.05 * steps;
  const weightCapMult = 1 + 0.05 * steps;
  cost *= costCapMult;
  weight *= weightCapMult;
  // Single-shot weapons hold one round per barrel.
  capacity =
    params.mechanism === 'singleShot'
      ? 1
      : Math.round(capacity * (capPct / 100));

  const baselineCost = round2(cost);
  const baselineWeight = round2(weight);

  const breakdown: WeaponLineItem[] = [
    {
      label: `Receiver: ${receiver.label}${params.gauss ? ' (gauss)' : ''} · ${calibre.label} · ${mechanism.label}`,
      costCr: baselineCost,
      weightKg: baselineWeight,
      notes: `Capacity ${capacity}`,
    },
  ];

  // --- Phase B: percentages of the receiver baseline ---
  let totalCost = baselineCost;
  let totalWeight = baselineWeight;
  const add = (label: string, c: number, w: number, notes?: string) => {
    const costCr = round2(c);
    const weightKg = round2(w);
    totalCost += costCr;
    totalWeight += weightKg;
    breakdown.push({ label, costCr, weightKg, notes });
  };

  const heavyMult = params.heavyBarrel ? 2 : 1;
  const barrelCost = baselineCost * barrel.costPct * heavyMult;
  const barrelWeight = baselineWeight * barrel.weightPct * heavyMult;
  if (params.barrel !== 'rifle' || barrelCost > 0 || params.heavyBarrel)
    add(
      `Barrel: ${barrel.label}${params.heavyBarrel ? ' (Heavy)' : ''}`,
      barrelCost,
      barrelWeight,
    );

  if (params.stock !== 'none')
    add(
      `Stock: ${stock.label}`,
      baselineCost * stock.costPct,
      baselineWeight * stock.weightPct,
    );

  for (const id of params.furniture) {
    const f = FURNITURE[id];
    if (f) add(f.label, baselineCost * f.costPct, baselineWeight * f.weightPct);
  }

  for (const id of params.accessories) {
    const a = ACCESSORIES[id];
    if (!a) continue;
    if (id === 'additionalBarrel') {
      // An extra barrel: full barrel cost, half its weight, Quickdraw −1.
      add(
        `${a.label} (${barrel.label})`,
        barrelCost,
        barrelWeight / 2,
        'Quickdraw −1',
      );
      continue;
    }
    const c = a.cost ?? baselineCost * (a.costPct ?? 0);
    const w =
      a.weightPct !== undefined ? baselineWeight * a.weightPct : a.weight;
    add(a.label, c, w);
  }

  // --- Derive the profile ---
  let damage: Damage = { ...calibre.damage };
  const traits: Traits = { ...calibre.traits };
  const mergeTraits = (t?: Traits) => {
    if (!t) return;
    for (const [k, v] of Object.entries(t)) {
      const existing = traits[k];
      traits[k] =
        typeof existing === 'number' && typeof v === 'number'
          ? existing + v
          : v;
    }
  };

  // Barrel effects on damage.
  if (barrel.allDiceToD3) damage.die = 3;
  if (barrel.reduceHighVelocityDie && calibre.highVelocity)
    damage = reduceDice(damage, 1);
  if (barrel.carbineReduction && calibre.highVelocity)
    damage = {
      ...damage,
      mod: damage.mod - Math.floor(calibre.damage.dice / 2),
    };

  // Auto / RF.
  const auto = mechanism.auto > 0 ? mechanism.auto + autoSteps : 0;
  if (auto > 0) traits.Auto = auto;

  // Range: ball range × barrel multiplier (minimal overrides to a flat 5 m).
  let range = barrel.allDiceToD3
    ? 5
    : Math.round(calibre.range * barrel.rangeMult);

  // Penetration.
  let penetration = calibre.penetration + barrel.penetration;

  // Signature (physical for chemical guns, emissions for gauss).
  let sigIndex = SIGNATURE_LEVELS.indexOf(calibre.signature);
  sigIndex += barrel.signatureShift;

  let quickdraw = receiver.quickdraw + barrel.quickdraw + feed.quickdraw;
  for (const f of features) {
    quickdraw += f.quickdraw;
    if (f.signatureShift) sigIndex += f.signatureShift;
    mergeTraits(f.traits);
  }
  for (const id of params.furniture) quickdraw += FURNITURE[id]?.quickdraw ?? 0;
  mergeTraits(feed.traits);

  // Accessories affect the profile (suppressors shorten range / signature).
  for (const id of params.accessories) {
    const a = ACCESSORIES[id];
    if (!a) continue;
    quickdraw += a.quickdraw;
    if (a.rangeMult) range = Math.round(range * a.rangeMult);
    if (a.penetration) penetration += a.penetration;
    if (a.signatureShift) sigIndex += a.signatureShift;
    mergeTraits(a.traits);
    if (a.minTL) sources.add(SOURCE);
  }

  // Loaded ammunition modifies the profile (but not the weapon's build cost).
  if (ammo.penetration) penetration += ammo.penetration;
  if (ammo.damagePerDie)
    damage = { ...damage, mod: damage.mod + ammo.damagePerDie * damage.dice };
  if (ammo.extraDicePer3)
    damage = { ...damage, dice: damage.dice + 1 + Math.floor(damage.dice / 3) };
  if (ammo.allDiceToD3) damage.die = 3;
  if (ammo.signatureShift) sigIndex += ammo.signatureShift;
  if (ammo.rangeOverride) range = ammo.rangeOverride;
  if (ammo.spread) {
    const spread = typeof traits.Spread === 'number' ? traits.Spread : 2;
    traits.Spread = spread;
    penetration -= spread;
  }
  mergeTraits(ammo.traits);

  // Negative penetration surfaces as a Lo-Pen trait.
  if (penetration < 0) traits['Lo-Pen'] = -penetration;
  else delete traits['Lo-Pen'];

  // Recoil = base damage dice + Auto (when firing auto) + class & calibre mods.
  let recoil = calibre.damage.dice + auto + RECOIL_CLASS_MOD[params.receiver];
  if (params.gauss) recoil -= 1;
  if (calibre.traits['Zero-G']) recoil -= 2;
  recoil = Math.max(0, recoil);

  // Loaded magazine price: rounds × (Cr/100) × any ammo cost multiplier.
  const magazineCr = round2(
    (capacity * calibre.ammoCostPer100 * ammoCostMult * ammo.costMult) / 100,
  );

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range,
    auto,
    recoil,
    quickdraw,
    penetration,
    signatureKind: calibre.signatureKind,
    signature: clampLevel(sigIndex),
    heat: 0,
    capacity,
    traits,
  };

  return {
    profile,
    breakdown,
    issues,
    totals: {
      costCr: round2(totalCost),
      weightKg: round2(totalWeight),
      magazineCr,
    },
    sources: [...sources],
  };
}
