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
  collectNotes,
  FURNITURE,
  resolveFeature,
  resolveFeatures,
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
  baseline,
  component,
  each,
  mul,
  noop,
  runBuild,
  when,
} from './pipeline.js';
import {
  addTrait,
  clampLevel,
  error,
  mergeTraits,
  penetrationProfile,
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
import type { WeaponEvaluation, WeaponMagazine } from './weapon.js';

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
  for (const ref of params.features) {
    const def = resolveFeature(ref);
    if (!def) continue;
    if (def.group)
      (groups.get(def.group) ?? groups.set(def.group, []).get(def.group)!).push(
        def.label,
      );
    pushIf(issues, tlGate(tl, def.label, def.minTL));
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
  const features = resolveFeatures(params.features);
  const mods = params.mods.map((id) => ENERGY_MODS[id]).filter(Boolean);
  const hasMod = (id: EnergyModId) => params.mods.includes(id);

  const issues = validateEnergy(params);
  const sources = new Set<string>([SOURCE]);

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
  // Power *drawn* per shot = the receiver-capped output. A barrel that caps lower
  // just wastes the excess (the weapon still draws full power), so shots-per-pack
  // divide by this draw, not by the barrel-limited delivered dice.
  const drawDice = dice;
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
  // The Large (support/crew-served) receiver is Bulky (TES-12).
  if (receiver.bulky) traits.Bulky = true;

  // --- Power source: capacity (shots), reload price, traits — computed up front;
  // its breakdown line (`powerLine`) is emitted last by the pipeline below. ---
  let capacity = 0;
  let magazineCr = 0;
  let deliveredDice = dice;
  // The primary power source's weight/label/refill, so alternative packs can be
  // shown as their own rows (weapon weight − this pack + the alternative).
  let primaryPackWeight = 0;
  let primaryPackLabel = '';
  let primaryReloadCr = 0;
  let powerLine: WeaponLineItem;

  const source = params.source;
  if (source.kind === 'powerpack') {
    const perKg = powerPerKg(params.tl);
    if (perKg === 0)
      issues.push(error('Energy-weapon powerpacks require TL8+'));
    const kg = Math.max(0, source.kg);
    capacity = drawDice > 0 ? Math.floor((perKg * kg) / drawDice) : 0;
    primaryPackWeight = kg;
    primaryPackLabel = `Powerpack: ${ENERGY_POWER_CLASS_LABEL[source.rating]} ${kg}kg`;
    primaryReloadCr = round2(POWERPACK_COST_PER_KG[source.rating] * kg);
    // A detachable pack costs its price to replace (the weapon's reload); an
    // internal pack is recharged in place, so it has no separate reload price.
    if (!source.internal) magazineCr = primaryReloadCr;
    powerLine = {
      label: primaryPackLabel,
      costCr: primaryReloadCr,
      weightKg: round2(kg),
      notes: `${capacity} shots @ ${dice} power`,
    };
    // An under-rated pack suffers excessive draw → Unreliable.
    const packDice = ENERGY_POWER_CLASS_DICE[source.rating];
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
    capacity = Math.max(0, Math.floor(source.count));
    const cart = ENERGY_CARTRIDGE[source.rating];
    // Loaded cartridges weigh their own mass (BL-3: 3 × weak 0.01 = 0.03kg); the
    // build cost is one cartridge (the rest are the reload price).
    magazineCr = round2(capacity * cart.cost);
    primaryPackWeight = capacity * cart.weight;
    primaryPackLabel = `Cartridge: ${ENERGY_POWER_CLASS_LABEL[source.rating]} ×${capacity}`;
    primaryReloadCr = magazineCr;
    powerLine = {
      label: `Cartridge holder: ${ENERGY_POWER_CLASS_LABEL[source.rating]} ×${capacity}`,
      costCr: round2(cart.cost),
      weightKg: round2(capacity * cart.weight),
      notes: `${capacity} shots`,
    };
    const cartDice = ENERGY_POWER_CLASS_DICE[source.rating];
    if (cartDice > dice) {
      // An over-powered cartridge stresses the weapon → Unreliable.
      addTrait(traits, 'Unreliable', cartDice - dice);
      issues.push(
        warning(
          `${ENERGY_POWER_CLASS_LABEL[source.rating]} cartridge exceeds the weapon's ${dice}D handling → Unreliable ${cartDice - dice}`,
        ),
      );
    } else if (cartDice < dice) {
      // An under-powered cartridge simply delivers less.
      deliveredDice = cartDice;
      issues.push(
        warning(
          `${ENERGY_POWER_CLASS_LABEL[source.rating]} cartridge only delivers ${cartDice}D, below the weapon's ${dice}D capability`,
        ),
      );
    }
    // A non-ejecting holder (ejects explicitly false) gains Hazardous −2.
    if (source.ejects === false) addTrait(traits, 'Hazardous', -2);
  }

  // --- Cost/weight breakdown (pipeline) — the receiver folds its features + mods
  // into one baseline line; barrel/stock/furniture/accessories are a % of it; the
  // power source's line comes last. ---
  const typeLabel = ENERGY_WEAPON_TYPE_LABEL[params.weaponType] ?? 'Laser';
  const heavyMult = params.heavyBarrel ? 2 : 1;
  const build = runBuild(
    [
      each(features, (f) => mul(f.costMult, f.weightMult)),
      each(mods, (m) => mul(m.costMult, m.weightMult)),
      baseline(
        `Receiver: ${typeLabel} · ${receiver.label} (${ENERGY_POWER_CLASS_LABEL[receiver.maxPower]})`,
        `Up to ${receiverCap}D`,
      ),
      when(
        params.barrel !== 'rifle' ||
          params.heavyBarrel ||
          barrel.costPct * heavyMult > 0,
        component((b) => ({
          label: `Barrel: ${barrel.label}${params.heavyBarrel ? ' (Heavy)' : ''}`,
          costCr: round2(b.baseCost * barrel.costPct * heavyMult),
          weightKg: round2(b.baseWeight * barrel.weightPct * heavyMult),
        })),
      ),
      when(
        params.stock !== 'none',
        component((b) => ({
          label: `Stock: ${stock.label}`,
          costCr: round2(b.baseCost * stock.costPct),
          weightKg: round2(b.baseWeight * stock.weightPct),
        })),
      ),
      each(params.furniture, (id) => {
        const f = FURNITURE[id];
        return f
          ? component((b) => ({
              label: f.label,
              costCr: round2(b.baseCost * f.costPct),
              weightKg: round2(b.baseWeight * f.weightPct),
            }))
          : noop;
      }),
      each(params.accessories, (id) => {
        const a = ACCESSORIES[id];
        if (!a) return noop;
        return component((b) => ({
          label: a.label,
          costCr: round2(a.cost ?? b.baseCost * (a.costPct ?? 0)),
          weightKg: round2(
            a.weightPct !== undefined ? b.baseWeight * a.weightPct : a.weight,
          ),
        }));
      }),
      component(() => powerLine),
    ],
    { cost: receiver.baseCost, weight: receiver.baseWeight },
  );
  const breakdown = build.lines;
  const totalCost = round2(build.cost);
  const totalWeight = round2(build.weight);

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

  let quickdraw =
    receiver.quickdraw + barrel.quickdraw + (params.heavyBarrel ? -1 : 0);
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

  // Final Penetration table: −1 base → Lo-Pen 2; Intensified Pulse can push it
  // positive → AP (with the table's damage penalty).
  const pen = penetrationProfile(penetration, damage.dice);
  if (pen.loPen) traits['Lo-Pen'] = pen.loPen;
  if (pen.ap) traits['AP'] = pen.ap;
  if (pen.damageMod) damage = { ...damage, mod: damage.mod + pen.damageMod };

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

  // Power-source options: the primary (built-in) plus any alternative packs. The
  // weapon weight for an alternative is the loaded weight less the primary pack
  // plus the alternative's mass.
  const weaponSansPack = round2(totalWeight - primaryPackWeight);
  const altPacks: WeaponMagazine[] = (params.packs ?? []).map((spec) => {
    if (spec.kind === 'powerpack') {
      const kg = Math.max(0, spec.kg);
      const shots =
        deliveredDice > 0 ? Math.floor((powerPerKg(params.tl) * kg) / dice) : 0;
      return {
        label: spec.label ?? `Powerpack ${kg}kg`,
        capacity: shots,
        unit: 'shots',
        weightKg: round2(weaponSansPack + kg),
        magazineCr: round2(POWERPACK_COST_PER_KG[spec.rating] * kg),
        primary: false,
      };
    }
    const cart = ENERGY_CARTRIDGE[spec.rating];
    const count = Math.max(0, Math.floor(spec.count));
    return {
      label: spec.label ?? `Cartridge ×${count}`,
      capacity: count,
      unit: 'shots',
      weightKg: round2(weaponSansPack + count * cart.weight),
      magazineCr: round2(count * cart.cost),
      primary: false,
    };
  });
  const magazines: WeaponMagazine[] = [
    {
      label: primaryPackLabel || 'Power source',
      capacity,
      unit: 'shots',
      weightKg: round2(totalWeight),
      magazineCr: primaryReloadCr,
      primary: true,
    },
    ...altPacks,
  ];

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
    notes: collectNotes({
      accessories: params.accessories,
      furniture: params.furniture,
      features: params.features,
    }),
    ...(altPacks.length > 0 ? { magazines } : {}),
  };
}
