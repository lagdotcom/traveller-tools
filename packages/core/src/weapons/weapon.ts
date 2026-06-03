/**
 * `evaluateWeapon` — turns conventional-firearm parameters into a derived weapon
 * profile, a component cost/weight breakdown, validation issues, and the source
 * books used. It mirrors the *shape* of the ship domain's `evaluateShip` but, as
 * the Field Catalogue cost model is sequential-multiplicative off a receiver
 * baseline, walks an explicit pipeline rather than the additive `summarize`.
 */
import type { Evaluation, Issue } from '../design/index.js';
import {
  ACCESSORIES,
  AMMO_TYPES,
  type AmmoTypeDef,
  BARRELS,
  CALIBRES,
  collectNotes,
  FEEDS,
  FURNITURE,
  GAUSS_CAPACITY_MULT,
  GAUSS_COST_MULT,
  GAUSS_WEIGHT_MULT,
  hasFeature,
  INCREASED_AUTO,
  MECHANISMS,
  PELLET_SPREAD,
  RAPID_FIRE,
  RECEIVER_HEAT,
  RECEIVERS,
  RECOIL_CLASS_MOD,
  resolveFeature,
  resolveFeatures,
  SMOOTHBORE_CAPACITY,
  SMOOTHBORE_RECOIL,
  SOURCE,
  STOCKS,
} from './data.js';
import { evaluateEnergyWeapon } from './energy.js';
import { evaluateGrenade } from './grenade.js';
import { evaluateLauncher } from './launcher.js';
import {
  base,
  baseline,
  component,
  each,
  noop,
  pctComponent,
  runBuild,
  step,
  when,
} from './pipeline.js';
import { evaluateProjector } from './projector.js';
import {
  clampLevel,
  error,
  mergeTraits,
  pctOf,
  penetrationProfile,
  pushIf,
  round2,
  tlGate,
  warning,
} from './shared.js';
import {
  type AmmoTypeId,
  type Damage,
  type FirearmParams,
  type FlagTraitName,
  type MagazineSpec,
  type SecondaryWeaponParams,
  SIGNATURE_LEVELS,
  type Traits,
  type WeaponLineItem,
  type WeaponParams,
  type WeaponProfile,
} from './types.js';

export interface WeaponEvaluation extends Evaluation {
  profile: WeaponProfile;
  breakdown: WeaponLineItem[];
  totals: { costCr: number; weightKg: number; magazineCr: number };
  /** Play-time rules carried by chosen components (not captured as stats/traits). */
  notes?: string[];
  /**
   * One profile per loaded ammunition type (firearms only) — the primary is the
   * first and equals `profile`. Each carries its own reload price.
   */
  ammoProfiles?: {
    ammo: AmmoTypeId;
    label: string;
    profile: WeaponProfile;
    magazineCr: number;
  }[];
  /**
   * One profile per loaded munition (launchers only) — the analogue of
   * `ammoProfiles`. The primary is the first and equals `profile`; each carries
   * its own reload price. Present only when more than one munition is loaded.
   */
  munitionProfiles?: {
    /** The warhead / missile id (matched against book figures by id). */
    key: string;
    label: string;
    profile: WeaponProfile;
    /** Reload price of a full load. */
    magazineCr: number;
    /** Per-round weight (a single munition), as the book lists it. */
    weightKg: number;
    /** Per-round cost (a single munition), as the book lists it. */
    costCr: number;
  }[];
  /** A mounted secondary weapon's own profile, shown as a second data line. */
  secondary?: { label: string; profile: WeaponProfile; magazineCr: number };
  /**
   * The interchangeable magazine / power-source options (firearms & energy). The
   * first is the standard one baked into the build; the rest are alternatives.
   * Present only when more than one option exists.
   */
  magazines?: WeaponMagazine[];
}

/** One magazine / power-source row: capacity, loaded weight, reload price. */
export interface WeaponMagazine {
  label: string;
  /** Rounds (firearm) or shots (energy). */
  capacity: number;
  /** The noun for `capacity` — firearms hold rounds, energy weapons shots. */
  unit: 'rounds' | 'shots';
  /** The weapon's loaded weight with this magazine/pack fitted. */
  weightKg: number;
  /** Reload / refill price for this option (primary ammo for firearms). */
  magazineCr: number;
  /** The standard magazine baked into the headline build. */
  primary: boolean;
}

// --- Small helpers ----------------------------------------------------------

/** Format a Damage as the book does: `3D`, `3D-3`, `3D3+1` (D3 dice), `1`. */
export function formatDamage(dmg: Damage): string {
  if (dmg.dice <= 0) return String(Math.max(0, dmg.mod));
  // "Dice of dice": `2DD` — roll `dice` D6 to get the number of damage D6.
  const base = dmg.diceOfDice
    ? `${dmg.dice}DD`
    : `${dmg.dice}D${dmg.die === 3 ? '3' : ''}`;
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

  // Gauss is implied by the calibre; gauss weapons are TL12+.
  if (calibre.gauss && tl < 12)
    issues.push(error('Gauss weapons require TL12'));

  // A large-calibre smoothbore can be impossible in some receivers (Recoil table).
  if (SMOOTHBORE_RECOIL[params.calibre]?.[params.receiver] === 'impossible')
    issues.push(
      error(
        `${calibre.label} can't be built on a ${RECEIVERS[params.receiver].label}`,
      ),
    );

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
  const mechAuto = MECHANISMS[params.mechanism].auto;
  if (params.autoIncrease > 0 && mechAuto === 0)
    issues.push(
      error(
        'Increased Rate of Fire needs a burst-capable or fully-automatic mechanism',
      ),
    );

  // RF/VRF need a high Auto score (RF ≥4, VRF ≥6).
  if (params.rapidFire === 'rf' || params.rapidFire === 'vrf') {
    const rf = RAPID_FIRE[params.rapidFire];
    const auto = mechAuto > 0 ? mechAuto + Math.max(0, params.autoIncrease) : 0;
    if (auto < rf.minAuto)
      issues.push(
        error(
          `${rf.label} needs Auto ${rf.minAuto}+ (this build has Auto ${auto})`,
        ),
      );
  }

  // Mutually-exclusive feature groups (size, weight, cooling, stealth, quality…).
  const groups = new Map<string, string[]>();
  for (const ref of params.features) {
    const def = resolveFeature(ref);
    if (!def) continue;
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

  // Bullpup needs a rigid stock (the feed sits in it) — fixed or full, not
  // folding/none. High-capacity is incompatible with compacting.
  if (
    hasFeature(params.features, 'bullpup') &&
    params.stock !== 'full' &&
    params.stock !== 'fixed'
  )
    issues.push(error('A Bullpup weapon must have a fixed or full stock'));
  if (
    hasFeature(params.features, 'highCapacity') &&
    (hasFeature(params.features, 'compact') ||
      hasFeature(params.features, 'veryCompact'))
  )
    issues.push(
      error('High Capacity is incompatible with Compact / Very Compact'),
    );

  // Accessories are swappable gear (FC: "can usually be swapped around at will"),
  // so a TL shortfall just means it isn't available yet — a warning, not an error.
  // (The FC's own TL4 Crunch Gun mounts a TL5 scope.)
  for (const id of params.accessories) {
    const a = ACCESSORIES[id];
    if (a?.minTL && tl < a.minTL)
      issues.push(warning(`${a.label} requires TL${a.minTL}`));
  }
  // Loaded ammunition is just carried — a TL shortfall only means it isn't
  // available yet, so flag it as a warning rather than invalidating the build.
  for (const id of params.ammo) {
    const ammo = AMMO_TYPES[id];
    if (ammo?.minTL && tl < ammo.minTL)
      issues.push(
        warning(
          `${ammo.label} ammunition requires TL${ammo.minTL} (loaded into a TL${tl} weapon)`,
        ),
      );
  }

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

  const totalWeight = round2(recv.baselineWeight + comp.weightKg);
  const { calibre, neutralCapacity, capPct: stdPct } = parts;
  const capWeightMult = (pct: number) => 1 + 0.05 * ((pct - 100) / 10);
  // Loaded-magazine price for `cap` rounds of a given ammo type.
  const reloadFor = (cap: number, ammo: AmmoTypeDef) =>
    round2(
      (cap * calibre.ammoCostPer100 * recv.ammoCostMult * ammo.costMult) / 100,
    );

  // Magazine options: the first is the standard one (its weight/cost are the
  // headline); each alternative scales loaded weight by the capacity-% weight
  // rule and prices its reload off the ammo it is loaded with.
  const ammoIds = params.ammo.length > 0 ? params.ammo : ['ball' as AmmoTypeId];
  const magazines: WeaponMagazine[] = parts.magazines.map((spec, i) => {
    const isStd = i === 0;
    const specPct = spec.pct ?? (isStd ? stdPct : 100);
    const capacity =
      params.mechanism === 'singleShot'
        ? neutralCapacity // one round per barrel (folded into neutralCapacity)
        : (spec.rounds ?? Math.round(neutralCapacity * (specPct / 100)));
    const ammoId = spec.ammo ?? ammoIds[0]!;
    const ammo = AMMO_TYPES[ammoId] ?? AMMO_TYPES.ball;
    return {
      label:
        spec.label ??
        (spec.ammo ? ammo.label : isStd ? 'Standard' : `Magazine ${i + 1}`),
      capacity,
      unit: 'rounds',
      weightKg: isStd
        ? totalWeight
        : round2(
            (totalWeight * capWeightMult(specPct)) / capWeightMult(stdPct),
          ),
      magazineCr: spec.costCr ?? reloadFor(capacity, ammo),
      primary: isStd,
    };
  });
  // A magazine that embeds an ammo type fixes that type's reload price on the
  // matching profile row (the standard magazine sets the primary ammo's price).
  const reloadByAmmo = new Map<AmmoTypeId, number>();
  parts.magazines.forEach((spec, i) => {
    const ammoId = spec.ammo ?? (i === 0 ? ammoIds[0]! : undefined);
    if (ammoId !== undefined && !reloadByAmmo.has(ammoId))
      reloadByAmmo.set(ammoId, magazines[i]!.magazineCr);
  });

  // The build is fixed; each loaded ammunition type yields its own profile row.
  const ammoProfiles = ammoIds.map((id) => {
    const ammo = AMMO_TYPES[id] ?? AMMO_TYPES.ball;
    const { profile, magazineCr } = firearmProfile(params, parts, recv, ammo);
    return {
      ammo: id,
      label: ammo.label,
      profile,
      magazineCr: reloadByAmmo.get(id) ?? magazineCr,
    };
  });
  const primary = ammoProfiles[0]!;
  const headlineMagCr = primary.magazineCr;

  return {
    profile: primary.profile,
    breakdown: [...recv.lines, ...comp.lines],
    issues: validate(params),
    totals: {
      costCr: round2(recv.baselineCost + comp.costCr),
      weightKg: totalWeight,
      magazineCr: headlineMagCr,
    },
    sources: [...new Set([SOURCE, ...comp.sources])],
    notes: collectNotes({
      accessories: params.accessories,
      furniture: params.furniture,
      features: params.features,
    }),
    ammoProfiles,
    ...(comp.secondary ? { secondary: comp.secondary } : {}),
    ...(magazines.length > 1 ? { magazines } : {}),
  };
}

/** The catalogue rows + derived counts a firearm build is assembled from. */
function resolveParts(params: FirearmParams) {
  const autoSteps = Math.max(0, Math.min(6, Math.floor(params.autoIncrease)));
  const mechanism = MECHANISMS[params.mechanism] ?? MECHANISMS.semiAuto;
  const auto = mechanism.auto > 0 ? mechanism.auto + autoSteps : 0;
  const receiver = RECEIVERS[params.receiver] ?? RECEIVERS.handgun;
  const calibre = CALIBRES[params.calibre] ?? CALIBRES.mediumHandgun;
  const features = resolveFeatures(params.features);
  const extraBarrels = Math.max(0, Math.floor(params.additionalBarrels));

  // Capacity-neutral base count (before the capacity-% setting): single-shot
  // holds one round per barrel (a double-barrel shotgun loads 2); smoothbores use
  // fixed per-receiver sizes; otherwise it is the receiver base × calibre ×
  // mechanism × gauss × feature multipliers.
  let neutralCapacity: number;
  if (params.mechanism === 'singleShot') neutralCapacity = 1 + extraBarrels;
  else if (calibre.smoothbore)
    neutralCapacity = SMOOTHBORE_CAPACITY[params.receiver];
  else {
    neutralCapacity =
      receiver.baseCapacity * calibre.capacityMult * mechanism.capacityMult;
    if (calibre.gauss) neutralCapacity *= GAUSS_CAPACITY_MULT;
    for (const f of features) neutralCapacity *= f.capacityMult;
  }

  // The magazine options; the first is the standard one baked into the build.
  const magazines: MagazineSpec[] =
    params.magazines && params.magazines.length > 0
      ? params.magazines
      : [
          {
            pct: Number.isFinite(params.capacityPct) ? params.capacityPct : 100,
          },
        ];
  // A `rounds` override sets the displayed count only; the cost/weight chain
  // still follows the standard magazine's percentage (default 100%).
  const capPct =
    magazines[0]?.pct ??
    (Number.isFinite(params.capacityPct) ? params.capacityPct : 100);

  return {
    receiver,
    calibre,
    mechanism,
    barrel: BARRELS[params.barrel] ?? BARRELS.rifle,
    stock: STOCKS[params.stock] ?? STOCKS.none,
    feed: FEEDS[params.feed] ?? FEEDS.standard,
    features,
    autoSteps,
    auto,
    incAuto: INCREASED_AUTO[autoSteps],
    rapidFire:
      params.rapidFire === 'rf' || params.rapidFire === 'vrf'
        ? RAPID_FIRE[params.rapidFire]
        : undefined,
    capPct,
    magazines,
    neutralCapacity,
    extraBarrels,
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
 * Phase 1 — the receiver, declared as a pipeline. The multiplicative chain and
 * its itemised breakdown are now one thing (the op trace), so they can't drift.
 */
function firearmReceiver(params: FirearmParams, parts: Parts): ReceiverBuild {
  const { receiver, calibre, mechanism, features, autoSteps, incAuto, capPct } =
    parts;
  const { auto, rapidFire } = parts;
  const capPctSteps = (capPct - 100) / 10;
  const costCapMult =
    capPct >= 100 ? 1 + 0.1 * capPctSteps : 1 + 0.05 * capPctSteps;
  const weightCapMult = 1 + 0.05 * capPctSteps;

  // Single-shot holds one round per barrel (already folded into neutralCapacity);
  // otherwise the neutral count scaled by the standard magazine's capacity %,
  // unless it carries an absolute-count override.
  const capacity =
    params.mechanism === 'singleShot'
      ? parts.neutralCapacity
      : (parts.magazines[0]?.rounds ??
        Math.round(parts.neutralCapacity * (capPct / 100)));

  const build = runBuild([
    base(`Receiver: ${receiver.label}`, receiver.baseCost, receiver.baseWeight),
    when(!!calibre.gauss, step('Gauss', GAUSS_COST_MULT, GAUSS_WEIGHT_MULT)),
    step(mechanism.label, mechanism.costMult),
    step(calibre.label, calibre.receiverCostMult, calibre.receiverWeightMult),
    each(features, (f) => step(f.label, f.costMult, f.weightMult)),
    when(
      autoSteps > 0,
      step(`Increased Auto +${autoSteps}`, incAuto.cost, incAuto.weight),
    ),
    // RF cost = ×(Auto + 2); VRF cost = ×5. Both multiply the receiver weight.
    when(
      !!rapidFire,
      step(
        rapidFire?.label ?? '',
        rapidFire?.minAuto === 4 ? auto + 2 : 5,
        rapidFire?.weightMult ?? 1,
      ),
    ),
    when(
      capPct !== 100,
      step(`Capacity ${capPct}%`, costCapMult, weightCapMult),
    ),
    baseline('Receiver Totals', `Capacity ${capacity}`),
  ]);

  const ammoCostMult = features.reduce((m, f) => m * (f.ammoCostMult ?? 1), 1);
  return {
    lines: build.lines,
    baselineCost: build.baseCost,
    baselineWeight: build.baseWeight,
    capacity,
    ammoCostMult,
  };
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
  const heavyMult = params.heavyBarrel ? 2 : 1;
  // The secondary weapon contributes a line *and* its own profile + sources, so
  // its op stashes those side outputs as it runs.
  let secondary: WeaponEvaluation['secondary'];
  const sources: string[] = [];

  const build = runBuild(
    [
      // Barrel — shown for any non-default or heavy/priced barrel.
      when(
        params.barrel !== 'rifle' ||
          params.heavyBarrel ||
          recv.baselineCost * barrel.costPct * heavyMult > 0,
        pctComponent(
          `Barrel: ${barrel.label}${params.heavyBarrel ? ' (Heavy)' : ''}`,
          barrel.costPct * heavyMult,
          barrel.weightPct * heavyMult,
        ),
      ),
      when(
        params.stock !== 'none',
        pctComponent(`Stock: ${stock.label}`, stock.costPct, stock.weightPct),
      ),
      each(params.furniture, (id) => {
        const f = FURNITURE[id];
        return f ? pctComponent(f.label, f.costPct, f.weightPct) : noop;
      }),
      // Extra barrels: each bought at the barrel's cost + half its weight; a
      // *complete* multi-barrel (no partialMultiBarrel) also adds 10% of baseline.
      when(
        extraBarrels > 0,
        component((b) => {
          const partial = hasFeature(params.features, 'partialMultiBarrel');
          const recCost = partial ? 0 : b.baseCost * 0.1 * extraBarrels;
          const recWeight = partial ? 0 : b.baseWeight * 0.1 * extraBarrels;
          const barrelCost = b.baseCost * barrel.costPct * heavyMult;
          const barrelWeight = b.baseWeight * barrel.weightPct * heavyMult;
          return {
            label: `Extra barrels: ${barrel.label} ×${extraBarrels}${partial ? ' (partial)' : ''}`,
            costCr: round2(recCost + barrelCost * extraBarrels),
            weightKg: round2(recWeight + (barrelWeight / 2) * extraBarrels),
            notes: `Quickdraw −${extraBarrels}`,
          };
        }),
      ),
      each(params.accessories, (id) => {
        const a = ACCESSORIES[id];
        if (!a) return noop;
        // Cost may be a flat Credit amount or a % of the receiver; weight likewise.
        return component((b) => ({
          label: a.label,
          costCr: round2(a.cost ?? b.baseCost * (a.costPct ?? 0)),
          weightKg: round2(
            a.weightPct !== undefined ? b.baseWeight * a.weightPct : a.weight,
          ),
          costMod: a.cost !== undefined ? undefined : pctOf(a.costPct ?? 0),
          weightMod: a.weightPct !== undefined ? pctOf(a.weightPct) : undefined,
        }));
      }),
      // A mounted secondary weapon is a complete extra barrel/receiver (FC p.34):
      // +10% of the host baseline (cost & weight) + the secondary's own barrel
      // (full cost, half weight). It keeps its own profile as a separate line.
      when(
        !!params.secondary,
        component((b) => {
          const sec = params.secondary!;
          const sub = evaluateFirearm({ kind: 'firearm', ...sec });
          const sc = secondaryLabel(sec);
          const secBarrel = BARRELS[sec.barrel] ?? BARRELS.rifle;
          const secHeavy = sec.heavyBarrel ? 2 : 1;
          sources.push(...sub.sources);
          secondary = {
            label: sc,
            profile: sub.profile,
            magazineCr: sub.totals.magazineCr,
          };
          return {
            label: `Secondary barrel: ${sc}`,
            costCr: round2(b.baseCost * (0.1 + secBarrel.costPct * secHeavy)),
            weightKg: round2(
              b.baseWeight * (0.1 + secBarrel.weightPct * secHeavy * 0.5),
            ),
            notes: 'complete multi-barrel: +10% receiver + barrel',
          };
        }),
      ),
    ],
    { baseCost: recv.baselineCost, baseWeight: recv.baselineWeight },
  );
  const lines = build.lines;
  const costCr = round2(build.cost);
  const weightKg = round2(build.weight);

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
  ammo: AmmoTypeDef,
): { profile: WeaponProfile; magazineCr: number } {
  const { receiver, calibre, barrel, feed, features } = parts;
  const { auto, extraBarrels, rapidFire } = parts;

  let damage: Damage = { ...calibre.damage };
  const traits: Traits = { ...calibre.traits };

  // Large-calibre smoothbores gain Bulky / Very Bulky by receiver (Recoil table).
  const sbRecoil = SMOOTHBORE_RECOIL[params.calibre]?.[params.receiver];
  if (sbRecoil && sbRecoil !== 'impossible') traits[sbRecoil] = true;

  // Barrel effects on damage.
  if (barrel.allDiceToD3) damage.die = 3;
  if (barrel.reduceHighVelocityDie && calibre.highVelocity)
    damage = reduceDice(damage, 1);
  if (barrel.carbineReduction && calibre.highVelocity)
    damage = {
      ...damage,
      mod: damage.mod - Math.floor(calibre.damage.dice / 2),
    };

  if (auto > 0) traits.Auto = auto;

  // Range: base range × any feature range bonus (e.g. Advanced Projectile +25%)
  // × barrel multiplier (minimal overrides to a flat 5 m). A spread (pellet/
  // flechette) round uses the calibre's shorter pellet range, where given.
  const featureRangeMult = features.reduce((m, f) => m * (f.rangeMult ?? 1), 1);
  const baseRange =
    ammo.spread && calibre.pelletRange !== undefined
      ? calibre.pelletRange
      : calibre.range;
  let range = barrel.allDiceToD3
    ? 5
    : Math.round(baseRange * featureRangeMult * barrel.rangeMult);

  // Barrels lose penetration on high-velocity rounds; smoothbores are already
  // low-velocity (fixed base Penetration) so a short barrel doesn't reduce them.
  let penetration =
    calibre.penetration + (calibre.smoothbore ? 0 : barrel.penetration);

  // Signature (physical for chemical guns, emissions for gauss).
  // Gauss signature is the Emissions of the EM pulse, not a muzzle flash, so a
  // short barrel doesn't raise it (like a laser's collimator).
  let sigIndex =
    SIGNATURE_LEVELS.indexOf(calibre.signature) +
    (calibre.gauss ? 0 : barrel.signatureShift);

  // Extra barrels and a mounted secondary (itself a complete extra barrel) each
  // cost a point of Quickdraw.
  let quickdraw =
    receiver.quickdraw +
    barrel.quickdraw +
    feed.quickdraw -
    extraBarrels -
    (params.heavyBarrel ? 1 : 0) - // a heavy barrel costs a point of Quickdraw
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
    // Pellet/flechette spread comes from the barrel (FC Pellet Spread table) and
    // reduces penetration by that score.
    const spread = PELLET_SPREAD[params.barrel] ?? 2;
    traits.Spread = spread;
    penetration -= spread;
  }
  mergeTraits(traits, ammo.traits);

  // Final Penetration table: net penetration → Lo-Pen or AP (+ AP damage penalty).
  const pen = penetrationProfile(penetration, damage.dice);
  if (pen.loPen) traits['Lo-Pen'] = pen.loPen;
  else delete traits['Lo-Pen'];
  if (pen.ap) traits['AP'] = pen.ap;
  else delete traits['AP'];
  if (pen.damageMod) damage = { ...damage, mod: damage.mod + pen.damageMod };

  // Rapid-Fire / VRF: an extra die per N base dice, an AP score equal to the base
  // dice (before the RF bonus), and the Bulky/Very-Bulky trait. `heatDice` (the
  // pre-bonus dice) drives the Heat rate below.
  const heatDice = damage.dice;
  if (rapidFire) {
    damage = {
      ...damage,
      dice: heatDice + Math.floor(heatDice / rapidFire.dicePer),
    };
    const baseAp = typeof traits.AP === 'number' ? traits.AP : 0;
    traits.AP = Math.max(baseAp, heatDice);
    (traits as Partial<Record<FlagTraitName, true>>)[rapidFire.trait] = true;
  }

  // Recoil = base damage dice + Auto (when firing auto) + class & calibre mods,
  // less any Recoil Compensation.
  let recoil = calibre.damage.dice + auto + RECOIL_CLASS_MOD[params.receiver];
  if (calibre.gauss) recoil -= 1;
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

  // Heat: an autofiring weapon generates (heat-dice × multiplier + Auto) per
  // round — the multiplier is 1 normally, 2 for RF, 3 for VRF, off the *base*
  // dice (before the RF damage bonus). It dissipates by receiver class + a heavy
  // barrel (+2) + extra barrels (+1 each) + any cooling system; at/above the
  // receiver's threshold, firing risks a malfunction.
  const heatMult = rapidFire ? rapidFire.heatDicePerDie : 1;
  const heatGen = auto > 0 ? heatMult * heatDice + auto : 0;
  const heatRow = RECEIVER_HEAT[params.receiver];
  const coolingDissipation = features.reduce(
    (h, f) => h + (f.heatDissipation ?? 0),
    0,
  );
  const heatDissipation =
    heatRow.dissipation +
    (params.heavyBarrel ? 2 : 0) +
    extraBarrels +
    coolingDissipation;

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
    heat: heatGen,
    heatDissipation,
    heatThreshold: heatRow.overheat,
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
