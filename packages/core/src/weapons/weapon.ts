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
  modPct,
  pctOf,
  pushIf,
  round2,
  tlGate,
  warning,
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

  // Mutually-exclusive feature groups (size, weight, cooling, stealth, quality…).
  const groups = new Map<string, string[]>();
  for (const id of params.features) {
    const def = RECEIVER_FEATURES[id];
    if (def.group)
      (groups.get(def.group) ?? groups.set(def.group, []).get(def.group)!).push(
        def.label,
      );
    pushIf(issues, tlGate(tl, def.label, def.minTL));
    // Low Quality leaves Deficiency points the design must satisfy with negative
    // traits — the choice is the player's, so flag it rather than auto-applying.
    if (def.deficiency)
      issues.push(
        warning(
          `${def.label}: apply ${def.deficiency} Deficiency point${def.deficiency === 1 ? '' : 's'} as Inaccurate / Unreliable / Ramshackle / Hazardous traits (player's choice).`,
        ),
      );
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
  const parts = resolveParts(params);
  const recv = firearmReceiver(params, parts);
  const comp = firearmComponents(params, parts, recv);
  const { profile, magazineCr } = firearmProfile(params, parts, recv);

  return {
    profile,
    breakdown: [...recv.lines, ...comp.lines],
    issues: validate(params),
    totals: {
      costCr: round2(recv.baselineCost + comp.costCr),
      weightKg: round2(recv.baselineWeight + comp.weightKg),
      magazineCr,
    },
    sources: [...new Set([SOURCE, ...comp.sources])],
    ...(comp.secondary ? { secondary: comp.secondary } : {}),
  };
}

/** The catalogue rows + derived counts a firearm build is assembled from. */
function resolveParts(params: FirearmParams) {
  const autoSteps = Math.max(0, Math.min(6, Math.floor(params.autoIncrease)));
  return {
    receiver: RECEIVERS[params.receiver] ?? RECEIVERS.handgun,
    calibre: CALIBRES[params.calibre] ?? CALIBRES.mediumHandgun,
    mechanism: MECHANISMS[params.mechanism] ?? MECHANISMS.semiAuto,
    barrel: BARRELS[params.barrel] ?? BARRELS.rifle,
    stock: STOCKS[params.stock] ?? STOCKS.none,
    feed: FEEDS[params.feed] ?? FEEDS.standard,
    ammo: AMMO_TYPES[params.ammo] ?? AMMO_TYPES.ball,
    features: params.features
      .map((id) => RECEIVER_FEATURES[id])
      .filter(Boolean),
    autoSteps,
    incAuto: INCREASED_AUTO[autoSteps],
    capPct: Number.isFinite(params.capacityPct) ? params.capacityPct : 100,
    extraBarrels: Math.max(0, Math.floor(params.additionalBarrels)),
  };
}
type Parts = ReturnType<typeof resolveParts>;

interface ReceiverBuild {
  /** Base + one percentage-mod line per modifier + a "Receiver Totals" line. */
  lines: WeaponLineItem[];
  baselineCost: number;
  baselineWeight: number;
  capacity: number;
  /** Ammo-cost multiplier from features (extreme stealth ×20). */
  ammoCostMult: number;
}

/**
 * Phase 1 — the receiver. One multiplicative modifier chain yields both the
 * baseline (its running product) and the itemised breakdown (a marginal line per
 * step), so the two can never drift apart. Capacity is its own chain.
 */
function firearmReceiver(params: FirearmParams, parts: Parts): ReceiverBuild {
  const { receiver, calibre, mechanism, features, autoSteps, incAuto, capPct } =
    parts;
  const capPctSteps = (capPct - 100) / 10;
  const costCapMult =
    capPct >= 100 ? 1 + 0.1 * capPctSteps : 1 + 0.05 * capPctSteps;
  const weightCapMult = 1 + 0.05 * capPctSteps;

  const chain: { label: string; cost: number; weight: number }[] = [];
  const step = (label: string, cost: number, weight = 1) => {
    if (cost !== 1 || weight !== 1) chain.push({ label, cost, weight });
  };
  if (params.gauss) step('Gauss', GAUSS_COST_MULT, GAUSS_WEIGHT_MULT);
  step(mechanism.label, mechanism.costMult);
  step(calibre.label, calibre.receiverCostMult, calibre.receiverWeightMult);
  for (const f of features) step(f.label, f.costMult, f.weightMult);
  if (autoSteps > 0)
    step(`Increased Auto +${autoSteps}`, incAuto.cost, incAuto.weight);
  if (capPct !== 100) step(`Capacity ${capPct}%`, costCapMult, weightCapMult);

  const lines: WeaponLineItem[] = [
    {
      label: `Receiver: ${receiver.label}`,
      costCr: round2(receiver.baseCost),
      weightKg: round2(receiver.baseWeight),
    },
  ];
  let rc = receiver.baseCost;
  let rw = receiver.baseWeight;
  for (const mod of chain) {
    lines.push({
      label: mod.label,
      costCr: round2(rc * mod.cost - rc),
      weightKg: round2(rw * mod.weight - rw),
      costMod: modPct(mod.cost),
      weightMod: modPct(mod.weight),
    });
    rc *= mod.cost;
    rw *= mod.weight;
  }
  const baselineCost = round2(rc);
  const baselineWeight = round2(rw);

  let capacity: number;
  if (calibre.smoothbore) {
    // Large-calibre smoothbores use fixed per-receiver values (no mechanism cap).
    capacity = SMOOTHBORE_CAPACITY[params.receiver];
  } else {
    capacity =
      receiver.baseCapacity * calibre.capacityMult * mechanism.capacityMult;
    if (params.gauss) capacity *= GAUSS_CAPACITY_MULT;
    for (const f of features) capacity *= f.capacityMult;
  }
  // Single-shot weapons hold one round per barrel; otherwise scale by capacity %.
  capacity =
    params.mechanism === 'singleShot'
      ? 1
      : Math.round(capacity * (capPct / 100));

  lines.push({
    label: 'Receiver Totals',
    costCr: baselineCost,
    weightKg: baselineWeight,
    notes: `Capacity ${capacity}`,
  });

  const ammoCostMult = features.reduce((m, f) => m * (f.ammoCostMult ?? 1), 1);
  return { lines, baselineCost, baselineWeight, capacity, ammoCostMult };
}

interface ComponentBuild {
  lines: WeaponLineItem[];
  costCr: number; // sum of the Phase-B lines (added to the receiver baseline)
  weightKg: number;
  secondary?: WeaponEvaluation['secondary'];
  sources: string[];
}

/**
 * Phase 2 — components fitted to the receiver (barrel, stock, furniture, extra
 * barrels, accessories, a mounted secondary). Each is a fraction of the receiver
 * baseline (or a flat Credit catalogue price).
 */
function firearmComponents(
  params: FirearmParams,
  parts: Parts,
  recv: ReceiverBuild,
): ComponentBuild {
  const { barrel, stock, extraBarrels } = parts;
  const { baselineCost, baselineWeight } = recv;
  const lines: WeaponLineItem[] = [];
  let costCr = 0;
  let weightKg = 0;
  const push = (item: WeaponLineItem) => {
    costCr += item.costCr;
    weightKg += item.weightKg;
    lines.push(item);
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

  // Extra barrels (multi-barrel weapons): each is bought at the barrel's cost and
  // adds half its weight; a *complete* multi-barrel (no partialMultiBarrel
  // feature) also adds 10% of the receiver baseline per extra barrel.
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

  // A mounted secondary weapon (e.g. under-barrel shotgun) is a complete extra
  // barrel/receiver. Per the FC complete-multi-barrel rule (p.34) it adds 10% of
  // the host receiver baseline (cost & weight); the secondary's own barrel is
  // bought at its normal cost but, as a barrel after the first, adds only half
  // its weight; Quickdraw drops by 1 (applied in the profile). The secondary
  // keeps its own profile as a separate data line.
  let secondary: WeaponEvaluation['secondary'];
  const sources: string[] = [];
  if (params.secondary) {
    const sub = evaluateFirearm({ kind: 'firearm', ...params.secondary });
    const sc = secondaryLabel(params.secondary);
    const secBarrel = BARRELS[params.secondary.barrel] ?? BARRELS.rifle;
    const secHeavy = params.secondary.heavyBarrel ? 2 : 1;
    push({
      label: `Secondary barrel: ${sc}`,
      costCr: round2(baselineCost * (0.1 + secBarrel.costPct * secHeavy)),
      weightKg: round2(
        baselineWeight * (0.1 + secBarrel.weightPct * secHeavy * 0.5),
      ),
      notes: 'complete multi-barrel: +10% receiver + barrel',
    });
    sources.push(...sub.sources);
    secondary = {
      label: sc,
      profile: sub.profile,
      magazineCr: sub.totals.magazineCr,
    };
  }

  return { lines, costCr, weightKg, secondary, sources };
}

/**
 * Phase 3 — the fired profile. Starts from the calibre and is reshaped by the
 * barrel (damage/range/penetration/signature), mechanism (Auto), features,
 * furniture, accessories and finally the loaded ammunition.
 */
function firearmProfile(
  params: FirearmParams,
  parts: Parts,
  recv: ReceiverBuild,
): { profile: WeaponProfile; magazineCr: number } {
  const { receiver, calibre, mechanism, barrel, feed, ammo, features } = parts;
  const { autoSteps, extraBarrels } = parts;

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

  let penetration = calibre.penetration + barrel.penetration;

  // Signature (physical for chemical guns, emissions for gauss).
  let sigIndex =
    SIGNATURE_LEVELS.indexOf(calibre.signature) + barrel.signatureShift;

  // Extra barrels and a mounted secondary (itself a complete extra barrel) each
  // cost a point of Quickdraw.
  let quickdraw =
    receiver.quickdraw +
    barrel.quickdraw +
    feed.quickdraw -
    extraBarrels -
    (params.secondary ? 1 : 0);
  let featureRecoilMod = 0;
  for (const f of features) {
    quickdraw += f.quickdraw;
    if (f.signatureShift) sigIndex += f.signatureShift;
    if (f.damageMod) damage = { ...damage, mod: damage.mod + f.damageMod };
    if (f.recoilMod) featureRecoilMod += f.recoilMod;
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

  // Recoil = base damage dice + Auto (when firing auto) + class & calibre mods,
  // less any Recoil Compensation.
  let recoil = calibre.damage.dice + auto + RECOIL_CLASS_MOD[params.receiver];
  if (params.gauss) recoil -= 1;
  if (calibre.traits['Zero-G']) recoil -= 2;
  recoil += featureRecoilMod;
  recoil = Math.max(0, recoil);

  // Loaded magazine price: rounds × (Cr/100) × any ammo cost multiplier.
  const magazineCr = round2(
    (recv.capacity *
      calibre.ammoCostPer100 *
      recv.ammoCostMult *
      ammo.costMult) /
      100,
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
    capacity: recv.capacity,
    traits,
  };
  return { profile, magazineCr };
}

/** Short descriptive label for a secondary weapon (calibre + mechanism). */
function secondaryLabel(p: SecondaryWeaponParams): string {
  const c = CALIBRES[p.calibre]?.label ?? p.calibre;
  const m = MECHANISMS[p.mechanism]?.label ?? p.mechanism;
  return `${c} · ${m}`;
}
