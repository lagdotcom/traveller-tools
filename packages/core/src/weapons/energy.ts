/**
 * `evaluateEnergyWeapon` — derives the profile, cost/weight breakdown, issues
 * and sources for a Directed Energy Weapon (laser / microwave). It follows the
 * same "% of the modified receiver baseline" shape as the firearm pipeline and
 * returns the identical `WeaponEvaluation`, but the power/damage model is
 * energy-specific (the designer buys damage dice up to a power class; barrels
 * cap wasted power; powerpacks/cartridges supply shots).
 */
import type { Issue } from '../design/index.js';
import {
  ACCESSORIES,
  BARRELS,
  FURNITURE,
  RECEIVER_FEATURES,
  SOURCE,
  STOCKS,
} from './data.js';
import {
  ENERGY_BARREL_POWER_CAP,
  ENERGY_CARTRIDGE,
  ENERGY_MODS,
  ENERGY_POWER_CLASS_DICE,
  ENERGY_POWER_CLASS_LABEL,
  ENERGY_RECEIVERS,
  ENERGY_WEAPON_TYPE_LABEL,
  POWERPACK_COST_PER_KG,
  POWERPACK_RATINGS,
  powerPerKg,
} from './energyData.js';
import {
  addTrait,
  clampLevel,
  error,
  mergeTraits,
  pushIf,
  round2,
  tlGate,
  warning,
} from './shared.js';
import {
  type Damage,
  type EnergyModId,
  type EnergyParams,
  SIGNATURE_LEVELS,
  type Traits,
  type WeaponLineItem,
  type WeaponProfile,
} from './types.js';
import type { WeaponEvaluation } from './weapon.js';

/** Strongest cartridge power class available at a tech level (null below TL9). */
function cartridgeMaxAt(tl: number): string | null {
  let max: string | null = null;
  for (const band of POWERPACK_RATINGS)
    if (tl >= band.tl) max = band.cartridgeMax;
  return max;
}

/** TL gates and incompatible-feature checks for the shared receiver features. */
function validateEnergy(params: EnergyParams): Issue[] {
  const issues: Issue[] = [];
  const tl = params.tl;

  const groups = new Map<string, string[]>();
  for (const id of params.features) {
    const def = RECEIVER_FEATURES[id];
    if (!def) continue;
    if (def.group)
      (groups.get(def.group) ?? groups.set(def.group, []).get(def.group)!).push(
        def.label,
      );
    pushIf(issues, tlGate(tl, def.label, def.minTL));
  }
  for (const labels of groups.values())
    if (labels.length > 1)
      issues.push(error(`Incompatible features: ${labels.join(' + ')}`));

  for (const id of params.mods)
    pushIf(issues, tlGate(tl, ENERGY_MODS[id].label, ENERGY_MODS[id].minTL));
  for (const id of params.accessories)
    pushIf(
      issues,
      tlGate(tl, ACCESSORIES[id]?.label ?? id, ACCESSORIES[id]?.minTL),
    );
  return issues;
}

export function evaluateEnergyWeapon(params: EnergyParams): WeaponEvaluation {
  const receiver =
    ENERGY_RECEIVERS[params.receiver] ?? ENERGY_RECEIVERS.minimal;
  const barrel = BARRELS[params.barrel] ?? BARRELS.rifle;
  const stock = STOCKS[params.stock] ?? STOCKS.none;
  const features = params.features
    .map((id) => RECEIVER_FEATURES[id])
    .filter(Boolean);
  const mods = params.mods.map((id) => ENERGY_MODS[id]).filter(Boolean);
  const hasMod = (id: EnergyModId) => params.mods.includes(id);

  const issues = validateEnergy(params);
  const sources = new Set<string>([SOURCE]);

  // --- Receiver baseline: shared features + energy mods (multiplicative) ---
  // Capacity-affecting feature multipliers are ignored here: an energy weapon's
  // "capacity" is shots from its power source, not a magazine.
  let cost = receiver.baseCost;
  let weight = receiver.baseWeight;
  for (const f of features) {
    cost *= f.costMult;
    weight *= f.weightMult;
  }
  for (const m of mods) {
    cost *= m.costMult;
    weight *= m.weightMult;
  }
  const baselineCost = round2(cost);
  const baselineWeight = round2(weight);

  // --- Delivered damage dice: receiver power cap, then barrel cap ---
  const receiverCap = ENERGY_POWER_CLASS_DICE[receiver.maxPower];
  const requested = Math.max(0, Math.floor(params.damageDice));
  let dice = Math.min(requested, receiverCap);
  if (dice < requested)
    issues.push(
      warning(
        `${receiver.label} receiver caps output at ${receiverCap}D — excess power is wasted`,
      ),
    );
  const barrelCap = ENERGY_BARREL_POWER_CAP[params.barrel];
  if (barrelCap !== undefined && dice > barrelCap) {
    issues.push(
      warning(
        `${barrel.label} barrel limits this laser to ${barrelCap}D — excess power is wasted`,
      ),
    );
    dice = barrelCap;
  }

  const traits: Traits = { 'Zero-G': true };

  // --- Breakdown: receiver line ---
  const typeLabel = ENERGY_WEAPON_TYPE_LABEL[params.weaponType] ?? 'Laser';
  const breakdown: WeaponLineItem[] = [
    {
      label: `Receiver: ${typeLabel} · ${receiver.label} (${ENERGY_POWER_CLASS_LABEL[receiver.maxPower]})`,
      costCr: baselineCost,
      weightKg: baselineWeight,
      notes: `Up to ${receiverCap}D`,
    },
  ];

  let totalCost = baselineCost;
  let totalWeight = baselineWeight;
  const add = (label: string, c: number, w: number, notes?: string) => {
    const costCr = round2(c);
    const weightKg = round2(w);
    totalCost += costCr;
    totalWeight += weightKg;
    breakdown.push({ label, costCr, weightKg, notes });
  };

  // --- Phase B: percentages of the receiver baseline ---
  const heavyMult = params.heavyBarrel ? 2 : 1;
  const barrelCost = baselineCost * barrel.costPct * heavyMult;
  const barrelWeight = baselineWeight * barrel.weightPct * heavyMult;
  if (params.barrel !== 'rifle' || params.heavyBarrel || barrelCost > 0)
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
    const c = a.cost ?? baselineCost * (a.costPct ?? 0);
    const w =
      a.weightPct !== undefined ? baselineWeight * a.weightPct : a.weight;
    add(a.label, c, w);
  }

  // --- Power source: capacity (shots), build cost/weight, reload price ---
  let capacity = 0;
  let magazineCr = 0;
  let deliveredDice = dice;

  if (params.powerSource === 'powerpack') {
    const perKg = powerPerKg(params.tl);
    if (perKg === 0)
      issues.push(error('Energy-weapon powerpacks require TL8+'));
    const kg = Math.max(0, params.powerpackKg);
    capacity = dice > 0 ? Math.floor((perKg * kg) / dice) : 0;
    add(
      `Powerpack: ${ENERGY_POWER_CLASS_LABEL[params.powerpackRating]} ${kg}kg`,
      POWERPACK_COST_PER_KG[params.powerpackRating] * kg,
      kg,
      `${capacity} shots @ ${dice} power`,
    );
    // An under-rated pack suffers excessive draw → Unreliable.
    const packDice = ENERGY_POWER_CLASS_DICE[params.powerpackRating];
    if (packDice < dice) {
      addTrait(traits, 'Unreliable', dice - packDice);
      issues.push(
        warning(
          `Powerpack rating (${packDice}D) is below the weapon's ${dice}D output → Unreliable ${dice - packDice}`,
        ),
      );
    }
  } else {
    if (cartridgeMaxAt(params.tl) === null)
      issues.push(error('Energy-weapon cartridges require TL9+'));
    capacity = Math.max(0, Math.floor(params.cartridgeCount));
    const cart = ENERGY_CARTRIDGE[params.cartridgeRating];
    // Disposable holder: weighs cartridges + 20%; build cost is one cartridge.
    add(
      `Cartridge holder: ${ENERGY_POWER_CLASS_LABEL[params.cartridgeRating]} ×${capacity}`,
      cart.cost,
      capacity * cart.weight * 1.2,
      `${capacity} shots`,
    );
    magazineCr = round2(capacity * cart.cost);
    const cartDice = ENERGY_POWER_CLASS_DICE[params.cartridgeRating];
    if (cartDice > dice) {
      // An over-powered cartridge stresses the weapon → Unreliable.
      addTrait(traits, 'Unreliable', cartDice - dice);
      issues.push(
        warning(
          `${ENERGY_POWER_CLASS_LABEL[params.cartridgeRating]} cartridge exceeds the weapon's ${dice}D handling → Unreliable ${cartDice - dice}`,
        ),
      );
    } else if (cartDice < dice) {
      // An under-powered cartridge simply delivers less.
      deliveredDice = cartDice;
      issues.push(
        warning(
          `${ENERGY_POWER_CLASS_LABEL[params.cartridgeRating]} cartridge only delivers ${cartDice}D, below the weapon's ${dice}D capability`,
        ),
      );
    }
    if (!params.cartridgeEjects) addTrait(traits, 'Hazardous', -2);
  }

  // --- Derive the profile ---
  let damage: Damage = { dice: deliveredDice, die: 6, mod: 0 };
  if (hasMod('improvedFocus') && deliveredDice >= 2)
    damage = {
      ...damage,
      mod: damage.mod + (ENERGY_MODS.improvedFocus.damageMod ?? 0),
    };

  // Range: base × Efficient-Beam bonus × barrel multiplier (minimal → flat 5 m).
  const baseRange =
    receiver.baseRange *
    (hasMod('efficientBeam') ? (ENERGY_MODS.efficientBeam.rangeMult ?? 1) : 1);
  let range =
    params.barrel === 'minimal' ? 5 : Math.round(baseRange * barrel.rangeMult);

  // Penetration: −1 base (all energy receivers) + barrel + Intensified Pulse.
  let penetration =
    -1 + barrel.penetration + (hasMod('intensifiedPulse') ? 1 : 0);

  // Signature: Emissions (normal), per the worked laser examples (BL-3, M-84,
  // Nefertem). A laser's "barrel" is a collimator, so — unlike a firearm muzzle —
  // it adds no signature shift; only stealth features/accessories move it.
  let sigIndex = SIGNATURE_LEVELS.indexOf('normal');

  let quickdraw = barrel.quickdraw + (params.heavyBarrel ? -1 : 0);
  for (const f of features) {
    quickdraw += f.quickdraw;
    if (f.signatureShift) sigIndex += f.signatureShift;
    mergeTraits(traits, f.traits);
  }
  for (const id of params.furniture) quickdraw += FURNITURE[id]?.quickdraw ?? 0;
  for (const id of params.accessories) {
    const a = ACCESSORIES[id];
    if (!a) continue;
    quickdraw += a.quickdraw;
    if (a.rangeMult) range = Math.round(range * a.rangeMult);
    if (a.penetration) penetration += a.penetration;
    if (a.signatureShift) sigIndex += a.signatureShift;
    mergeTraits(traits, a.traits);
  }

  if (penetration < 0) traits['Lo-Pen'] = -penetration;

  const profile: WeaponProfile = {
    tl: params.tl,
    damage,
    range,
    auto: 0,
    recoil: 0, // energy weapons produce no recoil
    quickdraw,
    penetration,
    signatureKind: 'emissions',
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
