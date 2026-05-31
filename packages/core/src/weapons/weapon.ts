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
import { evaluateEnergyWeapon } from './energy.js';
import { evaluateGrenade } from './grenade.js';
import { evaluateLauncher } from './launcher.js';
import { evaluateProjector } from './projector.js';
import {
  clampLevel,
  error,
  mergeTraits,
  pushIf,
  round2,
  tlGate,
} from './shared.js';
import {
  type Damage,
  type FirearmParams,
  type SecondaryWeaponParams,
  SIGNATURE_LEVELS,
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
  /** A mounted secondary weapon's own profile, shown as a second data line. */
  secondary?: { label: string; profile: WeaponProfile; magazineCr: number };
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

// --- Validation -------------------------------------------------------------

/** Format a multiplier as a signed percentage modifier (×1.25 → "+25%"). */
const modPct = (mult: number): string => {
  const p = Math.round((mult - 1) * 100);
  return p === 0 ? '—' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`;
};
/** Format a fraction-of-baseline as a "+N%" addition (0.15 → "+15%"). */
const pctOf = (frac: number): string => {
  const p = Math.round(frac * 100);
  return p === 0 ? '—' : `+${p}%`;
};

const RECEIVER_ORDER = [
  'handgun',
  'assault',
  'longarm',
  'lsw',
  'heavy',
] as const;

/** Domain rules beyond the per-component TL gates, returning issues. */
function validate(params: FirearmParams): Issue[] {
  const issues: Issue[] = [];
  const tl = params.tl;
  const calibre = CALIBRES[params.calibre];

  // Gauss rounds force a gauss receiver, and vice-versa is illegal.
  if (calibre.gauss && !params.gauss)
    issues.push(error(`${calibre.label} requires a gauss receiver`));
  if (params.gauss && tl < 12) issues.push(error('Gauss weapons require TL12'));

  // Calibre ↔ receiver minimums (anti-materiel needs an LSW; heavy AM a Heavy).
  if (calibre.minReceiver) {
    const need = RECEIVER_ORDER.indexOf(calibre.minReceiver);
    const have = RECEIVER_ORDER.indexOf(params.receiver);
    if (have < need)
      issues.push(
        error(
          `${calibre.label} requires at least a ${RECEIVERS[calibre.minReceiver].label}`,
        ),
      );
  }

  // Increased Auto only on burst/full-auto receivers.
  if (params.autoIncrease > 0 && MECHANISMS[params.mechanism].auto === 0)
    issues.push(
      error(
        'Increased Rate of Fire needs a burst-capable or fully-automatic mechanism',
      ),
    );

  // Mutually-exclusive feature groups (size, weight, cooling, stealth).
  const groups = new Map<string, string[]>();
  for (const id of params.features) {
    const def = RECEIVER_FEATURES[id];
    if (def.group)
      (groups.get(def.group) ?? groups.set(def.group, []).get(def.group)!).push(
        def.label,
      );
    pushIf(issues, tlGate(tl, def.label, def.minTL));
  }
  for (const labels of groups.values())
    if (labels.length > 1)
      issues.push(error(`Incompatible features: ${labels.join(' + ')}`));

  // Bullpup requires a full stock; high-capacity is incompatible with compacting.
  if (params.features.includes('bullpup') && params.stock !== 'full')
    issues.push(error('A Bullpup weapon must have a full stock'));
  if (
    params.features.includes('highCapacity') &&
    (params.features.includes('compact') ||
      params.features.includes('veryCompact'))
  )
    issues.push(
      error('High Capacity is incompatible with Compact / Very Compact'),
    );

  // Accessory and loaded-ammunition TL gates.
  for (const id of params.accessories)
    pushIf(issues, tlGate(tl, ACCESSORIES[id].label, ACCESSORIES[id].minTL));
  const ammo = AMMO_TYPES[params.ammo];
  pushIf(issues, tlGate(tl, `${ammo.label} ammunition`, ammo.minTL));

  return issues;
}

// --- The pipeline -----------------------------------------------------------

/** Evaluate any weapon, dispatching on its class. */
export function evaluateWeapon(params: WeaponParams): WeaponEvaluation {
  switch (params.kind) {
    case 'energy':
      return evaluateEnergyWeapon(params);
    case 'projector':
      return evaluateProjector(params);
    case 'launcher':
      return evaluateLauncher(params);
    case 'grenade':
      return evaluateGrenade(params);
    default:
      return evaluateFirearm(params);
  }
}

export function evaluateFirearm(params: FirearmParams): WeaponEvaluation {
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

  // Itemise the receiver the way the worked worksheets do: a base line, one line
  // per modifier showing its *percentage* mod (not the raw Credit change), then a
  // "Receiver Totals" subtotal that every later component is a percentage of.
  const breakdown: WeaponLineItem[] = [
    {
      label: `Receiver: ${receiver.label}`,
      costCr: round2(receiver.baseCost),
      weightKg: round2(receiver.baseWeight),
    },
  ];
  let rc = receiver.baseCost;
  let rw = receiver.baseWeight;
  const stepRec = (label: string, cm: number, wm: number) => {
    const nc = rc * cm;
    const nw = rw * wm;
    if (cm !== 1 || wm !== 1)
      breakdown.push({
        label,
        costCr: round2(nc - rc),
        weightKg: round2(nw - rw),
        costMod: modPct(cm),
        weightMod: modPct(wm),
      });
    rc = nc;
    rw = nw;
  };
  if (params.gauss) stepRec('Gauss', GAUSS_COST_MULT, GAUSS_WEIGHT_MULT);
  stepRec(mechanism.label, mechanism.costMult, 1);
  stepRec(calibre.label, calibre.receiverCostMult, calibre.receiverWeightMult);
  for (const id of params.features) {
    const f = RECEIVER_FEATURES[id];
    if (f) stepRec(f.label, f.costMult, f.weightMult);
  }
  if (autoSteps > 0)
    stepRec(`Increased Auto +${autoSteps}`, incAuto.cost, incAuto.weight);
  if (capPct !== 100)
    stepRec(`Capacity ${capPct}%`, costCapMult, weightCapMult);

  breakdown.push({
    label: 'Receiver Totals',
    costCr: baselineCost,
    weightKg: baselineWeight,
    notes: `Capacity ${capacity}`,
  });

  // --- Phase B: percentages of the receiver baseline ---
  let totalCost = baselineCost;
  let totalWeight = baselineWeight;
  const push = (item: WeaponLineItem) => {
    totalCost += item.costCr;
    totalWeight += item.weightKg;
    breakdown.push(item);
  };
  // A component that adds a fraction of the receiver baseline shows that %.
  const addPct = (
    label: string,
    costFrac: number,
    weightFrac: number,
    notes?: string,
  ) =>
    push({
      label,
      costCr: round2(baselineCost * costFrac),
      weightKg: round2(baselineWeight * weightFrac),
      costMod: pctOf(costFrac),
      weightMod: pctOf(weightFrac),
      notes,
    });

  const heavyMult = params.heavyBarrel ? 2 : 1;
  const barrelCost = baselineCost * barrel.costPct * heavyMult;
  const barrelWeight = baselineWeight * barrel.weightPct * heavyMult;
  if (params.barrel !== 'rifle' || barrelCost > 0 || params.heavyBarrel)
    addPct(
      `Barrel: ${barrel.label}${params.heavyBarrel ? ' (Heavy)' : ''}`,
      barrel.costPct * heavyMult,
      barrel.weightPct * heavyMult,
    );

  if (params.stock !== 'none')
    addPct(`Stock: ${stock.label}`, stock.costPct, stock.weightPct);

  for (const id of params.furniture) {
    const f = FURNITURE[id];
    if (f) addPct(f.label, f.costPct, f.weightPct);
  }

  // Extra barrels (multi-barrel weapons). Each is bought at the barrel's cost and
  // adds half its weight; a *complete* multi-barrel (no partialMultiBarrel
  // feature) also adds 10% of the receiver baseline per extra barrel.
  const extraBarrels = Math.max(0, Math.floor(params.additionalBarrels));
  if (extraBarrels > 0) {
    const partial = params.features.includes('partialMultiBarrel');
    const recCost = partial ? 0 : baselineCost * 0.1 * extraBarrels;
    const recWeight = partial ? 0 : baselineWeight * 0.1 * extraBarrels;
    push({
      label: `Extra barrels: ${barrel.label} ×${extraBarrels}${partial ? ' (partial)' : ''}`,
      costCr: round2(recCost + barrelCost * extraBarrels),
      weightKg: round2(recWeight + (barrelWeight / 2) * extraBarrels),
      notes: `Quickdraw −${extraBarrels}`,
    });
  }

  for (const id of params.accessories) {
    const a = ACCESSORIES[id];
    if (!a) continue;
    // Cost may be a flat Credit amount or a % of the receiver; weight likewise.
    const flatCost = a.cost !== undefined;
    push({
      label: a.label,
      costCr: round2(a.cost ?? baselineCost * (a.costPct ?? 0)),
      weightKg: round2(
        a.weightPct !== undefined ? baselineWeight * a.weightPct : a.weight,
      ),
      costMod: flatCost ? undefined : pctOf(a.costPct ?? 0),
      weightMod: a.weightPct !== undefined ? pctOf(a.weightPct) : undefined,
    });
  }

  // --- Derive the profile ---
  let damage: Damage = { ...calibre.damage };
  const traits: Traits = { ...calibre.traits };

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

  // Range: ball range × any feature range bonus (e.g. Advanced Projectile +25%)
  // × barrel multiplier (minimal overrides to a flat 5 m).
  const featureRangeMult = features.reduce((m, f) => m * (f.rangeMult ?? 1), 1);
  let range = barrel.allDiceToD3
    ? 5
    : Math.round(calibre.range * featureRangeMult * barrel.rangeMult);

  // Penetration.
  let penetration = calibre.penetration + barrel.penetration;

  // Signature (physical for chemical guns, emissions for gauss).
  let sigIndex = SIGNATURE_LEVELS.indexOf(calibre.signature);
  sigIndex += barrel.signatureShift;

  let quickdraw =
    receiver.quickdraw + barrel.quickdraw + feed.quickdraw - extraBarrels;
  for (const f of features) {
    quickdraw += f.quickdraw;
    if (f.signatureShift) sigIndex += f.signatureShift;
    mergeTraits(traits, f.traits);
  }
  for (const id of params.furniture) quickdraw += FURNITURE[id]?.quickdraw ?? 0;
  mergeTraits(traits, feed.traits);

  // Accessories affect the profile (suppressors shorten range / signature).
  for (const id of params.accessories) {
    const a = ACCESSORIES[id];
    if (!a) continue;
    quickdraw += a.quickdraw;
    if (a.rangeMult) range = Math.round(range * a.rangeMult);
    if (a.penetration) penetration += a.penetration;
    if (a.signatureShift) sigIndex += a.signatureShift;
    mergeTraits(traits, a.traits);
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
  mergeTraits(traits, ammo.traits);

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

  // A mounted secondary weapon (e.g. under-barrel shotgun): designed as its own
  // weapon, but mounting it costs/weighs 10% of its values. It keeps its own
  // profile (a separate data line); its full build is not added to this weapon.
  let secondary: WeaponEvaluation['secondary'];
  if (params.secondary) {
    const sub = evaluateFirearm({ kind: 'firearm', ...params.secondary });
    const sc = secondaryLabel(params.secondary);
    push({
      label: `Secondary mount: ${sc}`,
      costCr: round2(sub.totals.costCr * 0.1),
      weightKg: round2(sub.totals.weightKg * 0.1),
      notes: '10% of the secondary',
    });
    for (const s of sub.sources) sources.add(s);
    secondary = {
      label: sc,
      profile: sub.profile,
      magazineCr: sub.totals.magazineCr,
    };
  }

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
    ...(secondary ? { secondary } : {}),
  };
}

/** Short descriptive label for a secondary weapon (calibre + mechanism). */
function secondaryLabel(p: SecondaryWeaponParams): string {
  const c = CALIBRES[p.calibre]?.label ?? p.calibre;
  const m = MECHANISMS[p.mechanism]?.label ?? p.mechanism;
  return `${c} · ${m}`;
}
