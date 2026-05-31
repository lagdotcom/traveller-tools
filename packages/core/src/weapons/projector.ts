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
import { SOURCE } from './data.js';
import {
  ARMOURED_COST_PER_PT,
  ARMOURED_WEIGHT_PER_PT,
  BULWARKED_COST_PER_PT,
  BULWARKED_WEIGHT_PER_PT,
  PROJECTOR_FUELS,
  PROJECTOR_HAZARDOUS,
  PROJECTOR_PROPELLANTS,
  PROJECTOR_STRUCTURES,
} from './projectorData.js';
import { round2 } from './shared.js';
import type {
  Damage,
  ProjectorParams,
  Traits,
  WeaponLineItem,
  WeaponProfile,
} from './types.js';
import type { WeaponEvaluation } from './weapon.js';

function validateProjector(params: ProjectorParams): Issue[] {
  const issues: Issue[] = [];
  const fuel = PROJECTOR_FUELS[params.fuel];
  const prop = PROJECTOR_PROPELLANTS[params.propellant];
  if (fuel && params.tl < fuel.minTL)
    issues.push({
      severity: 'error',
      message: `${fuel.label} fuel requires TL${fuel.minTL}`,
    });
  if (prop && params.tl < prop.minTL)
    issues.push({
      severity: 'error',
      message: `${prop.label} requires TL${prop.minTL}`,
    });
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
    issues.push({
      severity: 'warning',
      message: `Payload ${payload}kg exceeds the ${structure.label} frame's ${structure.maxPayload}kg — the user suffers DM-2 per extra multiple of the maximum`,
    });

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

  const breakdown: WeaponLineItem[] = [
    {
      label: `Structure: ${structure.label} (Blast ${structure.blast})`,
      costCr: frameCost,
      weightKg: frameWeight,
      notes: `${attacks} attacks`,
    },
    {
      label: `Fuel: ${fuel.label} ${fuelKg}kg`,
      costCr: 0,
      weightKg: fuelKg,
      notes: `Cr${fuelCost} to fill`,
    },
    {
      label: `Propellant: ${prop.label} ${propKg}kg`,
      costCr: machinery,
      weightKg: propKg,
      notes: machinery
        ? `Cr${machinery} machinery · Cr${propConsumable} to fill`
        : `Cr${propConsumable} to fill`,
    },
  ];

  // Base build cost (frame + any machinery) and loaded weight, before the
  // Armoured/Bulwarked capability features multiply them.
  const baseCost = frameCost + machinery;
  const baseWeight = totalWeight;
  const armour = Math.max(0, Math.floor(params.armour));
  const bulwark = Math.max(0, Math.floor(params.bulwark));
  const costMult =
    (1 + ARMOURED_COST_PER_PT * armour) * (1 + BULWARKED_COST_PER_PT * bulwark);
  const weightMult =
    (1 + ARMOURED_WEIGHT_PER_PT * armour) *
    (1 + BULWARKED_WEIGHT_PER_PT * bulwark);
  if (armour > 0)
    breakdown.push({
      label: `Armoured (Armour +${armour})`,
      costCr: round2(baseCost * ARMOURED_COST_PER_PT * armour),
      weightKg: round2(baseWeight * ARMOURED_WEIGHT_PER_PT * armour),
    });
  if (bulwark > 0)
    breakdown.push({
      label: `Bulwarked (${bulwark})`,
      costCr: round2(baseCost * BULWARKED_COST_PER_PT * bulwark),
      weightKg: round2(baseWeight * BULWARKED_WEIGHT_PER_PT * bulwark),
    });

  const totalCost = round2(baseCost * costMult);
  const finalWeight = round2(baseWeight * weightMult);
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
  };
  if (armour > 0) traits.Armour = armour;
  if (bulwark > 0) traits.Bulwarked = bulwark;

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range,
    auto: 0,
    recoil: 0,
    quickdraw: structure.quickdraw,
    penetration: 0,
    signatureKind: 'physical',
    signature: 'high',
    heat: 0,
    capacity: attacks,
    traits,
  };

  issues.push({
    severity: 'warning',
    message:
      'Base Signature for projectors is not given in the supplied Field Catalogue text — the value shown is unverified.',
  });

  return {
    profile,
    breakdown,
    issues,
    totals: { costCr: totalCost, weightKg: finalWeight, magazineCr },
    sources: [...sources],
  };
}
