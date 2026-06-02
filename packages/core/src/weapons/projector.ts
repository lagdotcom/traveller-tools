/**
 * `evaluateProjector` — derives the profile, cost/weight breakdown, issues and
 * sources for a Projector (flamethrower / cryo / chemical sprayer). Returns the
 * same `WeaponEvaluation` shape as the other classes.
 *
 * Model: the frame weighs a % of the payload and the loaded weapon costs a flat
 * Cr/kg of its total weight. Fuel and propellant are consumables, surfaced as the
 * reload ("magazine") price. The number of attacks is whichever of fuel (1kg = 1
 * attack) or propellant (kg × attacks-per-kg) runs out first.
 */
import type { Issue } from '../design/index.js';
import {
  CALIBRES,
  collectNotes,
  MECHANISMS,
  resolveFeatures,
  SOURCE,
} from './data.js';
import { component, each, runBuild, step, when } from './pipeline.js';
import {
  PROJECTOR_FUELS,
  PROJECTOR_HAZARDOUS,
  PROJECTOR_PROPELLANTS,
  PROJECTOR_STRUCTURES,
} from './projectorData.js';
import { pushIf, round2, tlGate, warning } from './shared.js';
import type {
  Damage,
  ProjectorParams,
  SecondaryWeaponParams,
  Traits,
  WeaponProfile,
} from './types.js';
import { evaluateFirearm, type WeaponEvaluation } from './weapon.js';

/** Short label for a mounted secondary weapon (calibre · mechanism). */
function secondaryLabel(p: SecondaryWeaponParams): string {
  return `${CALIBRES[p.calibre]?.label ?? p.calibre} · ${MECHANISMS[p.mechanism]?.label ?? p.mechanism}`;
}

function validateProjector(params: ProjectorParams): Issue[] {
  const issues: Issue[] = [];
  const fuel = PROJECTOR_FUELS[params.fuel];
  const prop = PROJECTOR_PROPELLANTS[params.propellant];
  pushIf(issues, tlGate(params.tl, `${fuel?.label} fuel`, fuel?.minTL));
  pushIf(issues, tlGate(params.tl, prop?.label ?? '', prop?.minTL));
  return issues;
}

export function evaluateProjector(params: ProjectorParams): WeaponEvaluation {
  const structure =
    PROJECTOR_STRUCTURES[params.structure] ?? PROJECTOR_STRUCTURES.compact;
  const prop =
    PROJECTOR_PROPELLANTS[params.propellant] ??
    PROJECTOR_PROPELLANTS.compressed;
  const fuel = PROJECTOR_FUELS[params.fuel] ?? PROJECTOR_FUELS.liquid;

  const issues = validateProjector(params);
  const sources = new Set<string>([SOURCE]);

  const fuelKg = Math.max(0, params.fuelKg);
  const propKg = Math.max(0, params.propellantKg);
  const payload = fuelKg + propKg;
  if (payload > structure.maxPayload)
    issues.push(
      warning(
        `Payload ${payload}kg exceeds the ${structure.label} frame's ${structure.maxPayload}kg — the user suffers DM-2 per extra multiple of the maximum`,
      ),
    );

  // Attacks: limited by fuel (1kg = 1 attack) or propellant (kg × attacks/kg).
  const attacks = Math.floor(Math.min(fuelKg, propKg * prop.attacksPerKg));

  // --- Weights & costs ---
  const frameWeight = round2(structure.weightPct * payload);
  const totalWeight = round2(frameWeight + payload);
  const frameCost = round2(structure.costPerKg * totalWeight);
  const machinery = prop.machineryPerKg
    ? round2(prop.machineryPerKg * propKg)
    : 0;
  const fuelCost = round2(fuel.costPerKg * fuelKg);
  const propConsumable = round2(prop.costPerKg * propKg);

  // The frame + fuel + propellant are three base lines; the capability features
  // (Armoured / Bulwarked) then multiply the running total, and a mounted
  // secondary weapon adds its full cost/weight — all declared as a pipeline.
  const features = resolveFeatures(params.features);
  const featureTraits: Traits = {};
  for (const f of features)
    if (!(f.costMult === 1 && f.weightMult === 1))
      Object.assign(featureTraits, f.traits);

  let secondary: WeaponEvaluation['secondary'];
  const build = runBuild([
    component(() => ({
      label: `Structure: ${structure.label} (Blast ${structure.blast})`,
      costCr: frameCost,
      weightKg: frameWeight,
      notes: `${attacks} attacks`,
    })),
    component(() => ({
      label: `Fuel: ${fuel.label} ${fuelKg}kg`,
      costCr: 0,
      weightKg: fuelKg,
      notes: `Cr${fuelCost} to fill`,
    })),
    component(() => ({
      label: `Propellant: ${prop.label} ${propKg}kg`,
      costCr: machinery,
      weightKg: propKg,
      notes: machinery
        ? `Cr${machinery} machinery · Cr${propConsumable} to fill`
        : `Cr${propConsumable} to fill`,
    })),
    each(features, (f) => step(f.label, f.costMult, f.weightMult)),
    // reconcile: no worked projector-secondary cost is in the supplied text, so
    // the full-cost mounting is flagged rather than verified.
    when(
      !!params.secondary,
      component(() => {
        const sub = evaluateFirearm({ kind: 'firearm', ...params.secondary! });
        const label = secondaryLabel(params.secondary!);
        for (const s of sub.sources) sources.add(s);
        secondary = {
          label,
          profile: sub.profile,
          magazineCr: sub.totals.magazineCr,
        };
        return {
          label: `Secondary weapon: ${label}`,
          costCr: sub.totals.costCr,
          weightKg: sub.totals.weightKg,
          notes: 'complete mounted weapon (cost unverified)',
        };
      }),
    ),
  ]);
  const breakdown = build.lines;
  const totalCost = round2(build.cost);
  const finalWeight = round2(build.weight);
  const magazineCr = round2(fuelCost + propConsumable);

  // --- Profile ---
  const damage: Damage = fuel.damage ?? { dice: 0, die: 6, mod: 0 };
  let range = prop.range;
  if (structure.halfRange) range = Math.round(range / 2);
  if (fuel.halfRange) range = Math.round(range / 2);

  const traits: Traits = {
    Hazardous: PROJECTOR_HAZARDOUS,
    Blast: structure.blast,
    ...fuel.traits,
    ...featureTraits,
  };

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range,
    auto: 0,
    recoil: 0,
    quickdraw: structure.quickdraw,
    penetration: 0,
    // Emissions (extreme), per the MF-61 flame-projector worked example. Only the
    // flame case is attested; cryo/suppressant projectors may differ.
    signatureKind: 'emissions',
    signature: 'extreme',
    heat: 0,
    capacity: attacks,
    traits,
  };

  return {
    profile,
    breakdown,
    issues,
    totals: { costCr: totalCost, weightKg: finalWeight, magazineCr },
    sources: [...sources],
    notes: collectNotes({ features: params.features }),
    ...(secondary ? { secondary } : {}),
  };
}
