import {
  ACCESSORIES,
  type AccessoryId,
  AMMO_TYPES,
  type AmmoTypeId,
  type BarrelId,
  BARRELS,
  type CalibreId,
  CALIBRES,
  DEFAULT_ENERGY_PARAMS,
  DEFAULT_GRENADE_PARAMS,
  DEFAULT_LAUNCHER_PARAMS,
  DEFAULT_PROJECTOR_PARAMS,
  DEFAULT_WEAPON_PARAMS,
  type DeliveryId,
  ENERGY_MODS,
  ENERGY_POWER_CLASS_LABEL,
  ENERGY_RECEIVERS,
  type EnergyModId,
  type EnergyParams,
  type EnergyPowerClass,
  type EnergyReceiverId,
  type EnergyWeaponTypeId,
  evaluateWeapon,
  type FeedId,
  FEEDS,
  type FirearmParams,
  FURNITURE,
  type FurnitureId,
  type GrenadeParams,
  GRENADES,
  type GrenadeSizeId,
  type GrenadeTypeId,
  LAUNCHER_RECEIVERS,
  type LauncherParams,
  type LauncherReceiverId,
  type LauncherWarhead,
  type MagazineSpec,
  type MechanismId,
  MECHANISMS,
  MISSILE_WARHEADS,
  type MissileWarheadId,
  type PackSpec,
  parseWeapon,
  PROJECTOR_FUELS,
  PROJECTOR_PROPELLANTS,
  PROJECTOR_STRUCTURES,
  type ProjectorFuelId,
  type ProjectorParams,
  type ProjectorPropellantId,
  type ProjectorStructureId,
  type RapidFireMode,
  RECEIVER_FEATURES,
  type ReceiverFeatureId,
  type ReceiverFeatureRef,
  RECEIVERS,
  type ReceiverTypeId,
  refFeatureId,
  type SecondaryWeaponParams,
  serializeWeapon,
  type StockId,
  STOCKS,
  variantParams,
  type WeaponClass,
  type WeaponDefinition,
  type WeaponParams,
  type WeaponVariant,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { ChoiceField } from '../components/ChoiceField.js';
import { Field } from '../components/Field.js';
import { effective, num } from '../components/formUtils.js';
import { IssueList } from '../components/IssueList.js';
import { useForm } from '../components/useForm.js';
import { WeaponSheet } from '../components/WeaponSheet.js';
import { useFiles } from '../files.js';
import { useWeaponStore } from '../storage.js';

/** Build label arrays + label→id lookups for a `{ id: { label } }` record. */
function labelMap<T extends string>(record: Record<T, { label: string }>) {
  const ids = Object.keys(record) as T[];
  const labels = ids.map((id) => record[id].label);
  const toId = (label: string): T =>
    ids.find((id) => record[id].label === label) ?? ids[0]!;
  const toLabel = (id: T): string => record[id].label;
  return { ids, labels, toId, toLabel };
}

const RECEIVER = labelMap<ReceiverTypeId>(RECEIVERS);
const CALIBRE = labelMap<CalibreId>(CALIBRES);
const MECHANISM = labelMap<MechanismId>(MECHANISMS);
const BARREL = labelMap<BarrelId>(BARRELS);
const STOCK = labelMap<StockId>(STOCKS);
const FEED = labelMap<FeedId>(FEEDS);
const AMMO = labelMap<AmmoTypeId>(AMMO_TYPES);
// Receiver features are picked by label; leveled features (Armoured, Bulwarked,
// Recoil Comp, Disguised, Low Quality) expand to one labelled choice per level
// that maps to an `{ id, level }` ref. Plain features map to a bare id.
const FEATURE_REFS: ReceiverFeatureRef[] = (
  Object.keys(RECEIVER_FEATURES) as ReceiverFeatureId[]
).flatMap((id): ReceiverFeatureRef[] => {
  const def = RECEIVER_FEATURES[id];
  return def.levels ? def.levels.map((_, i) => ({ id, level: i + 1 })) : [id];
});
const featureRefLabel = (ref: ReceiverFeatureRef): string => {
  const def = RECEIVER_FEATURES[refFeatureId(ref)];
  if (!def.levels) return def.label;
  const level = typeof ref === 'string' ? 1 : ref.level;
  return def.levels[level - 1]!.label;
};
const FEATURE_LABELS = FEATURE_REFS.map(featureRefLabel);
const featureLabelToRef = (label: string): ReceiverFeatureRef | undefined =>
  FEATURE_REFS.find((r) => featureRefLabel(r) === label);
const FURN = labelMap<FurnitureId>(FURNITURE);
const ACCESSORY = labelMap<AccessoryId>(ACCESSORIES);
const ERECEIVER = labelMap<EnergyReceiverId>(ENERGY_RECEIVERS);
const EMOD = labelMap<EnergyModId>(ENERGY_MODS);
const PSTRUCT = labelMap<ProjectorStructureId>(PROJECTOR_STRUCTURES);
const PPROP = labelMap<ProjectorPropellantId>(PROJECTOR_PROPELLANTS);
const PFUEL = labelMap<ProjectorFuelId>(PROJECTOR_FUELS);
const LRECEIVER = labelMap<LauncherReceiverId>(LAUNCHER_RECEIVERS);
const MISSILE = labelMap<MissileWarheadId>(MISSILE_WARHEADS);
const GTYPE = labelMap<GrenadeTypeId>(GRENADES);

/** Small label list for a fixed set of ids (used for enum-like choices). */
function choiceMap<T extends string>(entries: [T, string][]) {
  const labels = entries.map(([, label]) => label);
  const toId = (label: string): T =>
    entries.find(([, l]) => l === label)?.[0] ?? entries[0]![0];
  const toLabel = (id: T): string =>
    entries.find(([i]) => i === id)?.[1] ?? labels[0]!;
  return { labels, toId, toLabel };
}

const WCLASS = choiceMap<WeaponClass>([
  ['firearm', 'Firearm'],
  ['energy', 'Energy'],
  ['projector', 'Projector'],
  ['launcher', 'Launcher'],
  ['grenade', 'Grenade'],
]);
const GSIZE = choiceMap<GrenadeSizeId>([
  ['mini', 'Mini'],
  ['hand', 'Hand'],
]);
const DELIVERY = choiceMap<DeliveryId>([
  ['rifleGrenade', 'Rifle Grenade'],
  ['cartridge', 'Cartridge'],
  ['ram', 'RAM'],
  ['rpg', 'RPG'],
]);
const RAPIDFIRE = choiceMap<RapidFireMode>([
  ['none', 'None'],
  ['rf', 'Rapid-Fire (RF)'],
  ['vrf', 'Very Rapid-Fire (VRF)'],
]);
const EWTYPE = choiceMap<EnergyWeaponTypeId>([
  ['laser', 'Laser'],
  ['microwave', 'Microwave'],
]);
const PSOURCE = choiceMap<PackSpec['kind']>([
  ['powerpack', 'Powerpack'],
  ['cartridge', 'Cartridge'],
]);
const PCLASS = choiceMap<EnergyPowerClass>([
  ['weak', ENERGY_POWER_CLASS_LABEL.weak],
  ['light', ENERGY_POWER_CLASS_LABEL.light],
  ['standard', ENERGY_POWER_CLASS_LABEL.standard],
  ['heavy', ENERGY_POWER_CLASS_LABEL.heavy],
]);

const YN = ['no', 'yes'];

// Magazine / power-pack editors (compound list items, like ship turrets/craft).
const REMOVE = '✗ remove';
const PACK_KIND: Record<PackSpec['kind'], string> = {
  powerpack: 'Powerpack',
  cartridge: 'Cartridge',
};
const PACK_KIND_LABELS = Object.values(PACK_KIND);
const packKindLabel = (p: PackSpec) => PACK_KIND[p.kind];
/** The editable "size" of a pack: kg for a powerpack, count for a cartridge. */
const packSize = (p: PackSpec) => (p.kind === 'cartridge' ? p.count : p.kg);

/** Barrel/stock, shared by firearm + energy (projectors/launchers have neither). */
const barrelStockValues = (p: FirearmParams | EnergyParams) => ({
  barrel: BARREL.toLabel(p.barrel),
  heavyBarrel: p.heavyBarrel ? 'yes' : 'no',
  stock: STOCK.toLabel(p.stock),
});

const firearmValues = (f: FirearmParams) => ({
  receiver: RECEIVER.toLabel(f.receiver),
  calibre: CALIBRE.toLabel(f.calibre),
  mechanism: MECHANISM.toLabel(f.mechanism),
  autoIncrease: String(f.autoIncrease),
  rapidFire: RAPIDFIRE.toLabel(f.rapidFire),
  additionalBarrels: String(f.additionalBarrels),
  feed: FEED.toLabel(f.feed),
  capacityPct: String(f.capacityPct),
  // (loaded ammo is a multi-select list, not a single form field)
  // secondary weapon (an under-barrel weapon, fired independently)
  secEnabled: f.secondary ? 'yes' : 'no',
  secReceiver: RECEIVER.toLabel(f.secondary?.receiver ?? 'handgun'),
  secCalibre: CALIBRE.toLabel(f.secondary?.calibre ?? 'lightSmoothbore'),
  secMechanism: MECHANISM.toLabel(f.secondary?.mechanism ?? 'singleShot'),
  secBarrel: BARREL.toLabel(f.secondary?.barrel ?? 'short'),
  secAmmo: AMMO.toLabel(f.secondary?.ammo[0] ?? 'pellet'),
});

const energyValues = (e: EnergyParams) => {
  // The primary source is a single PackSpec; the form keeps a flat editing surface,
  // defaulting the inactive kind's fields (they aren't stored on the param).
  const pp = e.source.kind === 'powerpack' ? e.source : undefined;
  const ct = e.source.kind === 'cartridge' ? e.source : undefined;
  return {
    eWeaponType: EWTYPE.toLabel(e.weaponType),
    eReceiver: ERECEIVER.toLabel(e.receiver),
    damageDice: String(e.damageDice),
    powerSource: PSOURCE.toLabel(e.source.kind),
    powerpackKg: String(pp?.kg ?? 1),
    powerpackRating: PCLASS.toLabel(pp?.rating ?? 'light'),
    cartridgeRating: PCLASS.toLabel(ct?.rating ?? 'light'),
    cartridgeCount: String(ct?.count ?? 20),
    cartridgeEjects: ct?.ejects === false ? 'no' : 'yes',
  };
};

const projectorValues = (pr: ProjectorParams) => ({
  pStructure: PSTRUCT.toLabel(pr.structure),
  pPropellant: PPROP.toLabel(pr.propellant),
  pFuel: PFUEL.toLabel(pr.fuel),
  fuelKg: String(pr.fuelKg),
  propellantKg: String(pr.propellantKg),
});

const launcherValues = (l: LauncherParams) => ({
  lReceiver: LRECEIVER.toLabel(l.receiver),
  lBarrel: BARREL.toLabel(l.barrel),
  lStock: STOCK.toLabel(l.stock),
  warheadSize: GSIZE.toLabel(l.warheadSize),
  delivery: DELIVERY.toLabel(l.delivery),
  guidance: l.guidance ? 'yes' : 'no',
  magazineSize: String(l.magazineSize),
});

const grenadeValues = (g: GrenadeParams) => ({
  gType: GTYPE.toLabel(g.type),
  gSize: GSIZE.toLabel(g.size),
});

/**
 * Flatten any weapon into one string-keyed form record. Whichever class `p` is
 * seeds its own fields; the other classes fall back to their defaults, so
 * switching class mid-edit is lossless for the side you started on.
 */
function formValues(
  p: WeaponParams,
  meta: {
    name: string;
    manufacturer: string;
    description: string;
    baseVariant: string;
  },
) {
  const bs = p.kind === 'firearm' || p.kind === 'energy' ? p : undefined;
  return {
    name: meta.name,
    manufacturer: meta.manufacturer,
    description: meta.description,
    baseVariant: meta.baseVariant,
    weaponClass: WCLASS.toLabel(p.kind),
    tl: String(p.tl),
    ...barrelStockValues(bs ?? DEFAULT_WEAPON_PARAMS),
    ...firearmValues(p.kind === 'firearm' ? p : DEFAULT_WEAPON_PARAMS),
    ...energyValues(p.kind === 'energy' ? p : DEFAULT_ENERGY_PARAMS),
    ...projectorValues(p.kind === 'projector' ? p : DEFAULT_PROJECTOR_PARAMS),
    ...launcherValues(p.kind === 'launcher' ? p : DEFAULT_LAUNCHER_PARAMS),
    ...grenadeValues(p.kind === 'grenade' ? p : DEFAULT_GRENADE_PARAMS),
  };
}

type ListId =
  | 'features'
  | 'furniture'
  | 'accessories'
  | 'mods'
  | 'ammo'
  | 'warheads'
  | 'missiles';

/** The flat string-keyed record the form holds (one entry per builder field). */
type FormValues = ReturnType<typeof formValues>;
/** The multi-select state arrays, threaded into the per-class param builders. */
interface Lists {
  features: ReceiverFeatureRef[];
  furniture: FurnitureId[];
  accessories: AccessoryId[];
  mods: EnergyModId[];
  ammo: AmmoTypeId[];
  warheads: LauncherWarhead[];
  missiles: MissileWarheadId[];
  // Carried through unedited so loaded designs keep their magazine / power-pack
  // options (the builder edits the standard magazine via Capacity %).
  magazines?: MagazineSpec[];
  packs?: PackSpec[];
}

// --- Per-class param builders (form values + selections → WeaponParams) -----

function buildSecondary(v: FormValues): SecondaryWeaponParams {
  return {
    tl: num(v.tl, 0),
    receiver: RECEIVER.toId(v.secReceiver),
    calibre: CALIBRE.toId(v.secCalibre),
    mechanism: MECHANISM.toId(v.secMechanism),
    autoIncrease: 0,
    rapidFire: 'none',
    features: [],
    barrel: BARREL.toId(v.secBarrel),
    heavyBarrel: false,
    additionalBarrels: 0,
    stock: 'none',
    furniture: [],
    feed: 'standard',
    capacityPct: 100,
    accessories: [],
    ammo: [AMMO.toId(v.secAmmo)],
  };
}

function buildFirearm(v: FormValues, lists: Lists): FirearmParams {
  return {
    kind: 'firearm',
    tl: num(v.tl, 0),
    receiver: RECEIVER.toId(v.receiver),
    calibre: CALIBRE.toId(v.calibre),
    mechanism: MECHANISM.toId(v.mechanism),
    autoIncrease: num(v.autoIncrease),
    rapidFire: RAPIDFIRE.toId(v.rapidFire),
    features: lists.features,
    barrel: BARREL.toId(v.barrel),
    heavyBarrel: v.heavyBarrel === 'yes',
    additionalBarrels: num(v.additionalBarrels, 0),
    stock: STOCK.toId(v.stock),
    furniture: lists.furniture,
    feed: FEED.toId(v.feed),
    capacityPct: num(v.capacityPct, 100),
    ...(lists.magazines && lists.magazines.length > 0
      ? { magazines: lists.magazines }
      : {}),
    accessories: lists.accessories,
    ammo: lists.ammo,
    ...(v.secEnabled === 'yes' ? { secondary: buildSecondary(v) } : {}),
  };
}

function buildEnergy(v: FormValues, lists: Lists): EnergyParams {
  return {
    kind: 'energy',
    tl: num(v.tl, 0),
    weaponType: EWTYPE.toId(v.eWeaponType),
    receiver: ERECEIVER.toId(v.eReceiver),
    damageDice: num(v.damageDice, 1),
    barrel: BARREL.toId(v.barrel),
    heavyBarrel: v.heavyBarrel === 'yes',
    stock: STOCK.toId(v.stock),
    furniture: lists.furniture,
    features: lists.features,
    mods: lists.mods,
    accessories: lists.accessories,
    source:
      PSOURCE.toId(v.powerSource) === 'cartridge'
        ? {
            kind: 'cartridge',
            rating: PCLASS.toId(v.cartridgeRating),
            count: num(v.cartridgeCount, 10),
            ejects: v.cartridgeEjects === 'yes',
          }
        : {
            kind: 'powerpack',
            rating: PCLASS.toId(v.powerpackRating),
            kg: num(v.powerpackKg, 1),
          },
    ...(lists.packs && lists.packs.length > 0 ? { packs: lists.packs } : {}),
  };
}

function buildProjector(v: FormValues, lists: Lists): ProjectorParams {
  return {
    kind: 'projector',
    tl: num(v.tl, 0),
    structure: PSTRUCT.toId(v.pStructure),
    propellant: PPROP.toId(v.pPropellant),
    fuel: PFUEL.toId(v.pFuel),
    fuelKg: num(v.fuelKg, 0),
    propellantKg: num(v.propellantKg, 0),
    features: lists.features,
    ...(v.secEnabled === 'yes' ? { secondary: buildSecondary(v) } : {}),
  };
}

function buildLauncher(v: FormValues, lists: Lists): LauncherParams {
  return {
    kind: 'launcher',
    tl: num(v.tl, 0),
    receiver: LRECEIVER.toId(v.lReceiver),
    features: lists.features,
    barrel: BARREL.toId(v.lBarrel),
    stock: STOCK.toId(v.lStock),
    guidance: v.guidance === 'yes',
    magazineSize: num(v.magazineSize, 1),
    warheads:
      lists.warheads.length > 0 ? lists.warheads : [{ type: 'fragmentation' }],
    warheadSize: GSIZE.toId(v.warheadSize),
    delivery: DELIVERY.toId(v.delivery),
    ...(lists.missiles.length > 0 ? { missiles: lists.missiles } : {}),
  };
}

function buildGrenade(v: FormValues): GrenadeParams {
  return {
    kind: 'grenade',
    tl: num(v.tl, 0),
    type: GTYPE.toId(v.gType),
    size: GSIZE.toId(v.gSize),
  };
}

export function WeaponBuilderScreen({
  onBack,
  initial,
  initialVariant,
  onLoad,
}: {
  onBack: () => void;
  initial?: WeaponDefinition;
  /** Open directly on this variant index (else the main weapon). */
  initialVariant?: number;
  onLoad: (def: WeaponDefinition, variant?: number) => void;
}): React.JSX.Element {
  const files = useFiles();
  const store = useWeaponStore();
  const baseDefParams = initial?.params ?? DEFAULT_WEAPON_PARAMS;
  const baseDefMeta = {
    name: initial?.name ?? 'Untitled Weapon',
    manufacturer: initial?.manufacturer ?? '',
    description: initial?.description ?? '',
    baseVariant: initial?.baseVariant ?? '',
  };
  // Optionally open straight on a variant (from the library).
  const startVariant =
    initialVariant != null ? initial?.variants?.[initialVariant] : undefined;
  const startParams = startVariant
    ? variantParams(baseDefParams, startVariant.override)
    : baseDefParams;
  const startMeta = startVariant
    ? {
        name: startVariant.name,
        manufacturer: baseDefMeta.manufacturer,
        description: startVariant.description ?? '',
        baseVariant: baseDefMeta.baseVariant,
      }
    : baseDefMeta;
  const form = useForm(formValues(startParams, startMeta));
  type FormKey = keyof typeof form.values;
  // Features are shared by firearm + energy + launcher + projector (all reuse
  // RECEIVER_FEATURES); furniture/accessories are firearm/energy only. Seed each
  // from the start params.
  const listSeed: FirearmParams | EnergyParams =
    startParams.kind === 'firearm' || startParams.kind === 'energy'
      ? startParams
      : DEFAULT_WEAPON_PARAMS;
  const [features, setFeatures] = useState<ReceiverFeatureRef[]>(
    startParams.kind === 'launcher' || startParams.kind === 'projector'
      ? startParams.features
      : listSeed.features,
  );
  const [furniture, setFurniture] = useState<FurnitureId[]>(listSeed.furniture);
  const [accessories, setAccessories] = useState<AccessoryId[]>(
    listSeed.accessories,
  );
  const [mods, setMods] = useState<EnergyModId[]>(
    startParams.kind === 'energy' ? startParams.mods : [],
  );
  const [ammo, setAmmo] = useState<AmmoTypeId[]>(
    startParams.kind === 'firearm' ? startParams.ammo : ['ball'],
  );
  const [warheads, setWarheads] = useState<LauncherWarhead[]>(
    startParams.kind === 'launcher'
      ? startParams.warheads
      : [{ type: 'fragmentation' }],
  );
  const [missiles, setMissiles] = useState<MissileWarheadId[]>(
    startParams.kind === 'launcher' ? (startParams.missiles ?? []) : [],
  );
  // Magazine / power-pack options (the first magazine is the standard one). Each
  // is editable in its own builder section.
  const [magazines, setMagazines] = useState<MagazineSpec[]>(
    startParams.kind === 'firearm' ? (startParams.magazines ?? []) : [],
  );
  const [packs, setPacks] = useState<PackSpec[]>(
    startParams.kind === 'energy' ? (startParams.packs ?? []) : [],
  );
  const [addMagAmmo, setAddMagAmmo] = useState('');
  const [addPackKind, setAddPackKind] = useState('');
  const [addFeature, setAddFeature] = useState('');
  const [addFurniture, setAddFurniture] = useState('');
  const [addAccessory, setAddAccessory] = useState('');
  const [addMod, setAddMod] = useState('');
  const [addAmmo, setAddAmmo] = useState('');
  const [addWarhead, setAddWarhead] = useState('');
  const [addMissile, setAddMissile] = useState('');
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'edit' | 'export' | 'import'>('edit');
  const [importBuffer, setImportBuffer] = useState('');
  const [message, setMessage] = useState('');

  // --- Variant editing -------------------------------------------------------
  // The form edits one "target": the main weapon or one of its variants.
  // Switching commits the current target (a variant's override = the diff from
  // the base) then re-seeds the form + lists from the new target's params.
  const [variants, setVariants] = useState<WeaponVariant[]>(
    initial?.variants ?? [],
  );
  const [target, setTarget] = useState<'main' | number>(
    startVariant ? initialVariant! : 'main',
  );
  const [baseParams, setBaseParams] = useState<WeaponParams>(baseDefParams);
  const [baseMeta, setBaseMeta] = useState(baseDefMeta);

  /** Top-level fields where `derived` differs from `base` (the variant override). */
  const diffOverride = (
    base: WeaponParams,
    derived: WeaponParams,
  ): Partial<WeaponParams> => {
    const o: Record<string, unknown> = {};
    const b = base as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(derived)) {
      if (k === 'kind') continue;
      if (JSON.stringify(v) !== JSON.stringify(b[k])) o[k] = v;
    }
    return o as Partial<WeaponParams>;
  };

  /** Re-seed every multi-select list from a params object (on a target switch). */
  const seedLists = (q: WeaponParams) => {
    setFeatures(q.kind === 'grenade' ? [] : q.features);
    setFurniture(
      q.kind === 'firearm' || q.kind === 'energy' ? q.furniture : [],
    );
    setAccessories(
      q.kind === 'firearm' || q.kind === 'energy' ? q.accessories : [],
    );
    setMods(q.kind === 'energy' ? q.mods : []);
    setAmmo(q.kind === 'firearm' ? q.ammo : ['ball']);
    setWarheads(
      q.kind === 'launcher' ? q.warheads : [{ type: 'fragmentation' }],
    );
    setMissiles(q.kind === 'launcher' ? (q.missiles ?? []) : []);
    setMagazines(q.kind === 'firearm' ? (q.magazines ?? []) : []);
    setPacks(q.kind === 'energy' ? (q.packs ?? []) : []);
  };

  // --- Magazine editors (firearm) ---
  /** Apply a mutation to the magazine at index `i` (copy-on-write). */
  const editMag = (i: number, mutate: (m: MagazineSpec) => void) =>
    setMagazines((prev) =>
      prev.map((m, k) => {
        if (k !== i) return m;
        const next: MagazineSpec = { ...m };
        mutate(next);
        return next;
      }),
    );
  const setMagAmmo = (i: number, label: string) => {
    if (label === REMOVE)
      setMagazines((prev) => prev.filter((_, k) => k !== i));
    else editMag(i, (m) => (m.ammo = AMMO.toId(label)));
  };
  const setMagLabel = (i: number, v: string) =>
    editMag(i, (m) => {
      if (v.trim()) m.label = v;
      else delete m.label;
    });
  // Capacity is set by EITHER a percentage OR an absolute count — never both, so
  // setting one clears the other. A blank / non-positive value clears (auto).
  const setMagPct = (i: number, v: string) =>
    editMag(i, (m) => {
      const n = num(v, 0);
      if (n > 0) {
        m.pct = n;
        delete m.rounds;
      } else delete m.pct;
    });
  const setMagRounds = (i: number, v: string) =>
    editMag(i, (m) => {
      const n = num(v, 0);
      if (n > 0) {
        m.rounds = n;
        delete m.pct;
      } else delete m.rounds;
    });
  const setMagCost = (i: number, v: string) =>
    editMag(i, (m) => {
      const n = num(v, 0);
      if (n > 0) m.costCr = n;
      else delete m.costCr;
    });
  const addMagazine = () => {
    const id = addMagAmmo ? AMMO.toId(addMagAmmo) : (ammo[0] ?? 'ball');
    setMagazines((prev) => [...prev, { ammo: id }]);
    setAddMagAmmo('');
  };

  // --- Power-pack editors (energy) ---
  const setPackKind = (i: number, label: string) => {
    if (label === REMOVE) {
      setPacks((prev) => prev.filter((_, k) => k !== i));
      return;
    }
    const rating = (packs[i]?.rating ?? 'standard') as EnergyPowerClass;
    setPacks((prev) =>
      prev.map((p, k) =>
        k !== i
          ? p
          : label === PACK_KIND.cartridge
            ? { kind: 'cartridge', count: packSize(p), rating }
            : { kind: 'powerpack', kg: packSize(p), rating },
      ),
    );
  };
  const setPackSize = (i: number, v: string) => {
    const n = Math.max(0, num(v, 0));
    setPacks((prev) =>
      prev.map((p, k) =>
        k !== i
          ? p
          : p.kind === 'cartridge'
            ? { ...p, count: n }
            : { ...p, kg: n },
      ),
    );
  };
  const setPackRating = (i: number, label: string) =>
    setPacks((prev) =>
      prev.map((p, k) => (k === i ? { ...p, rating: PCLASS.toId(label) } : p)),
    );
  const addPack = () => {
    setPacks((prev) => [
      ...prev,
      { kind: 'powerpack', kg: 1, rating: 'standard' },
    ]);
    setAddPackKind('');
  };

  // Each multi-select category is an add/remove list (like Systems on a ship).
  const lists: Record<
    ListId,
    {
      // Items render via `itemLabel`; only the count/indices are read here, so the
      // element type is opaque (features hold `{id, level}` refs, others hold ids).
      items: readonly unknown[];
      itemLabel: (i: number) => string;
      remove: (i: number) => void;
      available: string[];
      addValue: string;
      onAddChange: (v: string) => void;
      onAdd: () => void;
    }
  > = {
    features: {
      items: features,
      itemLabel: (i) => featureRefLabel(features[i]!),
      remove: (i) => setFeatures((p) => p.filter((_, k) => k !== i)),
      // Exclude every level of a feature already chosen (one feature per id).
      available: FEATURE_LABELS.filter((l) => {
        const ref = featureLabelToRef(l);
        return (
          ref !== undefined &&
          !features.some((f) => refFeatureId(f) === refFeatureId(ref))
        );
      }),
      addValue: addFeature,
      onAddChange: setAddFeature,
      onAdd: () => {
        const ref = featureLabelToRef(
          effective(addFeature, lists.features.available),
        );
        if (ref && !features.some((f) => refFeatureId(f) === refFeatureId(ref)))
          setFeatures((p) => [...p, ref]);
        setAddFeature('');
      },
    },
    furniture: {
      items: furniture,
      itemLabel: (i) => FURN.toLabel(furniture[i]!),
      remove: (i) => setFurniture((p) => p.filter((_, k) => k !== i)),
      available: FURN.labels.filter((l) => !furniture.includes(FURN.toId(l))),
      addValue: addFurniture,
      onAddChange: setAddFurniture,
      onAdd: () => {
        const id = FURN.toId(
          effective(addFurniture, lists.furniture.available),
        );
        if (id && !furniture.includes(id)) setFurniture((p) => [...p, id]);
        setAddFurniture('');
      },
    },
    accessories: {
      items: accessories,
      itemLabel: (i) => ACCESSORY.toLabel(accessories[i]!),
      remove: (i) => setAccessories((p) => p.filter((_, k) => k !== i)),
      available: ACCESSORY.labels.filter(
        (l) => !accessories.includes(ACCESSORY.toId(l)),
      ),
      addValue: addAccessory,
      onAddChange: setAddAccessory,
      onAdd: () => {
        const id = ACCESSORY.toId(
          effective(addAccessory, lists.accessories.available),
        );
        if (id && !accessories.includes(id)) setAccessories((p) => [...p, id]);
        setAddAccessory('');
      },
    },
    mods: {
      items: mods,
      itemLabel: (i) => EMOD.toLabel(mods[i]!),
      remove: (i) => setMods((p) => p.filter((_, k) => k !== i)),
      available: EMOD.labels.filter((l) => !mods.includes(EMOD.toId(l))),
      addValue: addMod,
      onAddChange: setAddMod,
      onAdd: () => {
        const id = EMOD.toId(effective(addMod, lists.mods.available));
        if (id && !mods.includes(id)) setMods((p) => [...p, id]);
        setAddMod('');
      },
    },
    ammo: {
      items: ammo,
      itemLabel: (i) => AMMO.toLabel(ammo[i]!),
      // Keep at least one ammo type loaded.
      remove: (i) =>
        setAmmo((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p)),
      available: AMMO.labels.filter((l) => !ammo.includes(AMMO.toId(l))),
      addValue: addAmmo,
      onAddChange: setAddAmmo,
      onAdd: () => {
        const id = AMMO.toId(effective(addAmmo, lists.ammo.available));
        if (id && !ammo.includes(id)) setAmmo((p) => [...p, id]);
        setAddAmmo('');
      },
    },
    warheads: {
      items: warheads,
      // Show the per-munition delivery when it overrides the launcher default.
      itemLabel: (i) => {
        const w = warheads[i]!;
        return w.delivery
          ? `${GTYPE.toLabel(w.type)} (${DELIVERY.toLabel(w.delivery)})`
          : GTYPE.toLabel(w.type);
      },
      // Keep at least one warhead loaded (the primary munition).
      remove: (i) =>
        setWarheads((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p)),
      // New warheads use the launcher's default delivery (set per-munition in data).
      available: GTYPE.labels.filter(
        (l) => !warheads.some((w) => w.type === GTYPE.toId(l)),
      ),
      addValue: addWarhead,
      onAddChange: setAddWarhead,
      onAdd: () => {
        const id = GTYPE.toId(effective(addWarhead, lists.warheads.available));
        if (id && !warheads.some((w) => w.type === id))
          setWarheads((p) => [...p, { type: id }]);
        setAddWarhead('');
      },
    },
    missiles: {
      items: missiles,
      itemLabel: (i) => MISSILE.toLabel(missiles[i]!),
      // Missiles are optional (none = grenade mode); removable down to empty.
      remove: (i) => setMissiles((p) => p.filter((_, k) => k !== i)),
      available: MISSILE.labels.filter(
        (l) => !missiles.includes(MISSILE.toId(l)),
      ),
      addValue: addMissile,
      onAddChange: setAddMissile,
      onAdd: () => {
        const id = MISSILE.toId(
          effective(addMissile, lists.missiles.available),
        );
        if (id && !missiles.includes(id)) setMissiles((p) => [...p, id]);
        setAddMissile('');
      },
    },
  };

  interface FieldDef {
    key: FormKey;
    label: string;
    options?: string[];
    /** Left/Right step for a numeric field (e.g. 10 for capacity %). */
    step?: number;
  }
  interface BuilderSection {
    label: string;
    fields?: FieldDef[];
    list?: ListId;
    /** A magazine editor (firearm) / power-pack editor (energy). */
    magazines?: true;
    packs?: true;
  }
  type MagField = 'ammo' | 'label' | 'pct' | 'rounds' | 'cost';
  type PackField = 'kind' | 'size' | 'rating';
  type Row =
    | { section: number; kind: 'field'; field: FieldDef }
    | { section: number; kind: 'listItem'; list: ListId; index: number }
    | { section: number; kind: 'listAdd'; list: ListId }
    | { section: number; kind: 'magItem'; index: number; field: MagField }
    | { section: number; kind: 'magAdd' }
    | { section: number; kind: 'packItem'; index: number; field: PackField }
    | { section: number; kind: 'packAdd' };

  const weaponClass: WeaponClass = WCLASS.toId(form.values.weaponClass);

  const classField: FieldDef = {
    key: 'weaponClass',
    label: 'Class',
    options: WCLASS.labels,
  };

  const firearmSections: BuilderSection[] = [
    {
      label: 'Type',
      fields: [
        classField,
        { key: 'tl', label: 'Tech level' },
        // The FC picks the ammunition (calibre) before the receiver.
        { key: 'calibre', label: 'Calibre / ammo', options: CALIBRE.labels },
        { key: 'receiver', label: 'Receiver', options: RECEIVER.labels },
      ],
    },
    {
      label: 'Action',
      fields: [
        { key: 'mechanism', label: 'Mechanism', options: MECHANISM.labels },
        { key: 'autoIncrease', label: 'Increase Auto (+)' },
        { key: 'rapidFire', label: 'Rapid-Fire', options: RAPIDFIRE.labels },
      ],
    },
    // Receiver features are added "once the receiver characteristics are known"
    // (FC) — before the barrel — and set the baseline later % components scale off.
    { label: 'Features', list: 'features' },
    {
      label: 'Barrel',
      fields: [
        { key: 'barrel', label: 'Barrel', options: BARREL.labels },
        { key: 'heavyBarrel', label: 'Heavy barrel', options: YN },
        { key: 'additionalBarrels', label: 'Extra barrels' },
      ],
    },
    {
      label: 'Furniture',
      fields: [{ key: 'stock', label: 'Stock', options: STOCK.labels }],
      // The stock field shows first; furniture add/remove rows follow.
      list: 'furniture',
    },
    {
      label: 'Feed',
      fields: [
        { key: 'feed', label: 'Feed device', options: FEED.labels },
        { key: 'capacityPct', label: 'Capacity (% of base)', step: 10 },
      ],
    },
    { label: 'Accessories', list: 'accessories' },
    {
      label: 'Ammo',
      list: 'ammo',
    },
    { label: 'Magazines', magazines: true },
    {
      label: 'Secondary',
      fields: [
        { key: 'secEnabled', label: 'Secondary weapon', options: YN },
        { key: 'secReceiver', label: '· Receiver', options: RECEIVER.labels },
        { key: 'secCalibre', label: '· Calibre', options: CALIBRE.labels },
        {
          key: 'secMechanism',
          label: '· Mechanism',
          options: MECHANISM.labels,
        },
        { key: 'secBarrel', label: '· Barrel', options: BARREL.labels },
        { key: 'secAmmo', label: '· Loaded ammo', options: AMMO.labels },
      ],
    },
  ];

  const energySections: BuilderSection[] = [
    {
      label: 'Type',
      fields: [
        classField,
        { key: 'tl', label: 'Tech level' },
        { key: 'eWeaponType', label: 'Beam type', options: EWTYPE.labels },
        { key: 'eReceiver', label: 'Receiver', options: ERECEIVER.labels },
        { key: 'damageDice', label: 'Damage dice (D)' },
      ],
    },
    {
      label: 'Barrel',
      fields: [
        { key: 'barrel', label: 'Barrel', options: BARREL.labels },
        { key: 'heavyBarrel', label: 'Heavy barrel', options: YN },
      ],
    },
    {
      label: 'Furniture',
      fields: [{ key: 'stock', label: 'Stock', options: STOCK.labels }],
      list: 'furniture',
    },
    {
      label: 'Power',
      fields: [
        { key: 'powerSource', label: 'Power source', options: PSOURCE.labels },
        { key: 'powerpackKg', label: 'Powerpack (kg)' },
        {
          key: 'powerpackRating',
          label: 'Powerpack rating',
          options: PCLASS.labels,
        },
        {
          key: 'cartridgeRating',
          label: 'Cartridge rating',
          options: PCLASS.labels,
        },
        { key: 'cartridgeCount', label: 'Cartridge magazine (shots)' },
        { key: 'cartridgeEjects', label: 'Cartridges eject', options: YN },
      ],
    },
    { label: 'Power Packs', packs: true },
    { label: 'Modifications', list: 'mods' },
    { label: 'Features', list: 'features' },
    { label: 'Accessories', list: 'accessories' },
  ];

  const projectorSections: BuilderSection[] = [
    {
      label: 'Type',
      fields: [
        classField,
        { key: 'tl', label: 'Tech level' },
        { key: 'pStructure', label: 'Frame', options: PSTRUCT.labels },
        { key: 'pFuel', label: 'Fuel', options: PFUEL.labels },
        { key: 'pPropellant', label: 'Propellant', options: PPROP.labels },
      ],
    },
    {
      label: 'Payload',
      fields: [
        { key: 'fuelKg', label: 'Fuel (kg)' },
        { key: 'propellantKg', label: 'Propellant (kg)' },
      ],
    },
    // Hardening (Armoured / Bulwarked) comes from the shared features list.
    { label: 'Features', list: 'features' },
    {
      label: 'Secondary',
      fields: [
        { key: 'secEnabled', label: 'Secondary weapon', options: YN },
        { key: 'secReceiver', label: '· Receiver', options: RECEIVER.labels },
        { key: 'secCalibre', label: '· Calibre', options: CALIBRE.labels },
        {
          key: 'secMechanism',
          label: '· Mechanism',
          options: MECHANISM.labels,
        },
        { key: 'secBarrel', label: '· Barrel', options: BARREL.labels },
        { key: 'secAmmo', label: '· Loaded ammo', options: AMMO.labels },
      ],
    },
  ];

  const launcherSections: BuilderSection[] = [
    {
      label: 'Type',
      fields: [
        classField,
        { key: 'tl', label: 'Tech level' },
        { key: 'lReceiver', label: 'Receiver', options: LRECEIVER.labels },
        { key: 'warheadSize', label: 'Warhead size', options: GSIZE.labels },
        { key: 'delivery', label: 'Delivery', options: DELIVERY.labels },
        { key: 'guidance', label: 'Guidance system', options: YN },
      ],
    },
    // Each loaded warhead is its own profile row (like a firearm's ammo list).
    { label: 'Warheads', list: 'warheads' },
    // Missiles, when loaded, override the grenade warheads above.
    { label: 'Missiles (override warheads)', list: 'missiles' },
    // The receiver is built like a firearm: features modify the baseline, then a
    // barrel + stock are added as a % of it (cost/weight only).
    { label: 'Features', list: 'features' },
    {
      label: 'Barrel & Stock',
      fields: [
        { key: 'lBarrel', label: 'Barrel', options: BARREL.labels },
        { key: 'lStock', label: 'Stock', options: STOCK.labels },
      ],
    },
    {
      label: 'Magazine',
      fields: [{ key: 'magazineSize', label: 'Magazine (support launchers)' }],
    },
  ];

  const grenadeSections: BuilderSection[] = [
    {
      label: 'Type',
      fields: [
        classField,
        { key: 'tl', label: 'Tech level' },
        { key: 'gType', label: 'Payload', options: GTYPE.labels },
        { key: 'gSize', label: 'Size', options: GSIZE.labels },
      ],
    },
  ];

  // Name / manufacturer / description are ordinary text fields in a trailing
  // Identity section (shared by every class).
  const identitySection: BuilderSection = {
    label: 'Identity',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'manufacturer', label: 'Manufacturer' },
      { key: 'description', label: 'Description' },
      // The base configuration's own name when the weapon has named models/configs
      // (e.g. "Army Model", peer of the "Navy Model" variant). Blank = unnamed base.
      { key: 'baseVariant', label: 'Base model name' },
    ],
  };
  const sectionDefs = [
    ...(weaponClass === 'energy'
      ? energySections
      : weaponClass === 'projector'
        ? projectorSections
        : weaponClass === 'launcher'
          ? launcherSections
          : weaponClass === 'grenade'
            ? grenadeSections
            : firearmSections),
    identitySection,
  ];

  const rows: Row[] = [];
  sectionDefs.forEach((section, si) => {
    (section.fields ?? []).forEach((field) =>
      rows.push({ section: si, kind: 'field', field }),
    );
    if (section.list) {
      const list = lists[section.list];
      for (let index = 0; index < list.items.length; index++)
        rows.push({ section: si, kind: 'listItem', list: section.list, index });
      rows.push({ section: si, kind: 'listAdd', list: section.list });
    }
    if (section.magazines) {
      magazines.forEach((_, index) => {
        for (const field of [
          'ammo',
          'label',
          'pct',
          'rounds',
          'cost',
        ] as MagField[])
          rows.push({ section: si, kind: 'magItem', index, field });
      });
      rows.push({ section: si, kind: 'magAdd' });
    }
    if (section.packs) {
      packs.forEach((_, index) => {
        for (const field of ['kind', 'size', 'rating'] as PackField[])
          rows.push({ section: si, kind: 'packItem', index, field });
      });
      rows.push({ section: si, kind: 'packAdd' });
    }
  });

  const safeActive = Math.min(active, rows.length - 1);
  const activeSection = rows[safeActive]!.section;
  const advance = () => setActive((i) => Math.min(i + 1, rows.length - 1));
  const gotoSection = (sectionIndex: number) => {
    const idx = rows.findIndex((r) => r.section === sectionIndex);
    if (idx >= 0) setActive(idx);
  };

  const selected: Lists = {
    features,
    furniture,
    accessories,
    mods,
    ammo,
    warheads,
    missiles,
    magazines: magazines.length > 0 ? magazines : undefined,
    packs: packs.length > 0 ? packs : undefined,
  };
  const params: WeaponParams =
    weaponClass === 'energy'
      ? buildEnergy(form.values, selected)
      : weaponClass === 'projector'
        ? buildProjector(form.values, selected)
        : weaponClass === 'launcher'
          ? buildLauncher(form.values, selected)
          : weaponClass === 'grenade'
            ? buildGrenade(form.values)
            : buildFirearm(form.values, selected);
  const name = form.values.name.trim() || 'Untitled Weapon';
  const manufacturer = form.values.manufacturer.trim();
  const description = form.values.description.trim();
  const baseVariant = form.values.baseVariant.trim();
  const evaluation = evaluateWeapon(params);

  // Commit the live form into the current target, returning the whole weapon.
  const collect = (): {
    params: WeaponParams;
    meta: typeof baseMeta;
    variants: WeaponVariant[];
  } => {
    if (target === 'main')
      return {
        params,
        meta: { name, manufacturer, description, baseVariant },
        variants,
      };
    const override = diffOverride(baseParams, params);
    const vs = variants.map((v, k) =>
      k === target
        ? {
            name: name || v.name,
            ...(description ? { description } : {}),
            override,
          }
        : v,
    );
    return { params: baseParams, meta: baseMeta, variants: vs };
  };

  /** Seed the form + lists for a target, given a committed weapon snapshot. */
  const seedTarget = (next: 'main' | number, c: ReturnType<typeof collect>) => {
    const seedParams =
      next === 'main'
        ? c.params
        : variantParams(c.params, c.variants[next]!.override);
    const seedMeta =
      next === 'main'
        ? c.meta
        : {
            name: c.variants[next]!.name,
            manufacturer: c.meta.manufacturer,
            description: c.variants[next]!.description ?? '',
            baseVariant: c.meta.baseVariant,
          };
    setBaseParams(c.params);
    setBaseMeta(c.meta);
    setVariants(c.variants);
    form.reset(formValues(seedParams, seedMeta));
    seedLists(seedParams);
    setTarget(next);
    setActive(0);
  };

  const switchTo = (next: 'main' | number) => {
    if (next === target) return;
    seedTarget(next, collect());
  };
  const addVariant = () => {
    const c = collect();
    const nv: WeaponVariant = {
      name: `Variant ${c.variants.length + 1}`,
      override: {},
    };
    seedTarget(c.variants.length, { ...c, variants: [...c.variants, nv] });
    setMessage(`Added ${nv.name} — edit fields, then Ctrl+S or switch.`);
  };
  const removeVariant = () => {
    if (target === 'main') return;
    // Drop the current variant (don't commit it) and return to the main weapon.
    seedTarget('main', {
      params: baseParams,
      meta: baseMeta,
      variants: variants.filter((_, k) => k !== target),
    });
  };
  const cycleTarget = () => {
    const order: ('main' | number)[] = ['main', ...variants.map((_, i) => i)];
    const i = order.indexOf(target);
    switchTo(order[(i + 1) % order.length]!);
  };

  // The whole weapon (base + variants, with the live target committed) — used by
  // save and export so they always capture the full design.
  const collected = collect();
  const currentDef: WeaponDefinition = {
    name: collected.meta.name.trim() || 'Untitled Weapon',
    ...(collected.meta.manufacturer.trim()
      ? { manufacturer: collected.meta.manufacturer.trim() }
      : {}),
    ...(collected.meta.description.trim()
      ? { description: collected.meta.description.trim() }
      : {}),
    ...(collected.meta.baseVariant.trim()
      ? { baseVariant: collected.meta.baseVariant.trim() }
      : {}),
    params: collected.params,
    ...(collected.variants.length > 0 ? { variants: collected.variants } : {}),
  };

  // Parse imported JSON text and load it (or report why it failed).
  const loadFromText = (text: string | null) => {
    if (text == null) {
      setMessage('Import cancelled.');
      return;
    }
    try {
      onLoad(parseWeapon(text));
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };
  const startImport = () => {
    setMessage('');
    if (files.pickFile) {
      files
        .pickFile()
        .then(loadFromText)
        .catch(() => setMessage('Import failed.'));
    } else if (files.readFile) {
      setImportBuffer('');
      setMode('import');
    } else {
      setMessage('Import is not available here.');
    }
  };
  const doImport = () => {
    const path = importBuffer.trim();
    setMode('edit');
    setImportBuffer('');
    if (!path) return;
    const text = files.readFile ? files.readFile(path) : null;
    if (text == null) setMessage(`Couldn't read “${path}”.`);
    else loadFromText(text);
  };

  const doSave = () => {
    store.save(currentDef);
    setMode('edit');
    const n = currentDef.variants?.length ?? 0;
    setMessage(
      `Saved “${currentDef.name}”${n ? ` (+${n} variant${n > 1 ? 's' : ''})` : ''}.`,
    );
  };

  useInput((input, key) => {
    // Variant editing: switch target, add, cycle, remove.
    if (mode === 'edit' && key.ctrl && input === 'b') {
      switchTo('main');
      return;
    }
    if (mode === 'edit' && key.ctrl && input === 'n') {
      addVariant();
      return;
    }
    if (mode === 'edit' && key.ctrl && input === 'v') {
      cycleTarget();
      return;
    }
    if (mode === 'edit' && key.ctrl && input === 'r') {
      removeVariant();
      return;
    }
    if (mode === 'edit' && key.ctrl && input === 's') {
      doSave();
      return;
    }
    if (mode === 'edit' && key.ctrl && input === 'e') {
      setMode('export');
      return;
    }
    if (mode === 'edit' && key.ctrl && input === 'o') {
      startImport();
      return;
    }
    if (mode !== 'edit') {
      if (key.escape) setMode('edit');
      return;
    }
    if (key.escape) onBack();
    else if (key.downArrow) setActive((i) => Math.min(i + 1, rows.length - 1));
    else if (key.upArrow) setActive((i) => Math.max(i - 1, 0));
    else if (key.tab && key.shift)
      gotoSection(
        (activeSection - 1 + sectionDefs.length) % sectionDefs.length,
      );
    else if (key.tab) gotoSection((activeSection + 1) % sectionDefs.length);
  });

  if (mode === 'export') {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          Export — {name}
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Copy the JSON below. Esc returns to the builder.</Text>
        </Box>
        <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text>{serializeWeapon(currentDef)}</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'import') {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          Import Weapon
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Field
            label="File path"
            value={importBuffer}
            isActive
            onChange={setImportBuffer}
            onSubmit={doImport}
          />
          <Text dimColor>Enter to load · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  const effectiveListAdd = (list: (typeof lists)[ListId]) =>
    list.available.length > 0 ? effective(list.addValue, list.available) : '—';

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Weapon Builder — {name}
      </Text>

      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="round"
        borderColor={target === 'main' ? 'gray' : 'magenta'}
        paddingX={1}
      >
        {target !== 'main' && (
          <Text bold color="magenta">
            ▶ Editing variant “{form.values.name || 'Variant'}” of{' '}
            {baseMeta.name}
          </Text>
        )}
        <Box>
          <Text dimColor>Targets: </Text>
          {[
            { label: 'Main weapon', t: 'main' as const },
            ...variants.map((v, i) => ({ label: v.name, t: i })),
          ].map((x, i) => (
            <Text key={i}>
              {i > 0 ? <Text dimColor> · </Text> : null}
              <Text
                bold={target === x.t}
                color={target === x.t ? 'cyan' : undefined}
              >
                {x.label}
              </Text>
            </Text>
          ))}
        </Box>
        <Text dimColor>
          Ctrl+N new · Ctrl+V cycle · Ctrl+B main
          {target !== 'main' ? ' · Ctrl+R remove' : ''}
        </Text>
      </Box>

      <Box marginTop={1}>
        {sectionDefs.map((section, index) => (
          <Box key={section.label} marginRight={2}>
            <Text
              bold={index === activeSection}
              color={index === activeSection ? 'cyan' : undefined}
              dimColor={index !== activeSection}
            >
              {section.label}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, index) => {
          if (row.section !== activeSection) return null;
          const isActive = mode === 'edit' && index === safeActive;
          if (row.kind === 'field') {
            const f = row.field;
            return f.options ? (
              <ChoiceField
                key={f.key}
                label={f.label}
                options={f.options}
                value={form.values[f.key]}
                isActive={isActive}
                onChange={form.setters[f.key]}
                onSubmit={advance}
              />
            ) : (
              <Field
                key={f.key}
                label={f.label}
                value={form.values[f.key]}
                isActive={isActive}
                onChange={form.setters[f.key]}
                onSubmit={advance}
                step={f.step}
              />
            );
          }
          if (row.kind === 'magItem') {
            const i = row.index;
            const m = magazines[i]!;
            const tag = i === 0 ? 'Standard' : `Alt ${i}`;
            if (row.field === 'ammo')
              return (
                <ChoiceField
                  key={`mag-${i}-ammo`}
                  label={`${tag} magazine`}
                  options={[...AMMO.labels, REMOVE]}
                  value={AMMO.toLabel(m.ammo ?? ammo[0] ?? 'ball')}
                  isActive={isActive}
                  onChange={(v) => setMagAmmo(i, v)}
                  onSubmit={advance}
                />
              );
            if (row.field === 'label')
              return (
                <Field
                  key={`mag-${i}-label`}
                  label="· name (optional)"
                  value={m.label ?? ''}
                  isActive={isActive}
                  onChange={(v) => setMagLabel(i, v)}
                  onSubmit={advance}
                />
              );
            if (row.field === 'pct')
              return (
                <Field
                  key={`mag-${i}-pct`}
                  label="· size % (0=auto)"
                  value={String(m.pct ?? 0)}
                  isActive={isActive}
                  onChange={(v) => setMagPct(i, v)}
                  onSubmit={advance}
                  step={10}
                />
              );
            if (row.field === 'rounds')
              return (
                <Field
                  key={`mag-${i}-rounds`}
                  label="· rounds (0=auto)"
                  value={String(m.rounds ?? 0)}
                  isActive={isActive}
                  onChange={(v) => setMagRounds(i, v)}
                  onSubmit={advance}
                />
              );
            return (
              <Field
                key={`mag-${i}-cost`}
                label="· reload Cr (0=auto)"
                value={String(m.costCr ?? 0)}
                isActive={isActive}
                onChange={(v) => setMagCost(i, v)}
                onSubmit={advance}
              />
            );
          }
          if (row.kind === 'magAdd') {
            return (
              <ChoiceField
                key="mag-add"
                label="Add magazine"
                options={AMMO.labels}
                value={effective(addMagAmmo, AMMO.labels)}
                isActive={isActive}
                onChange={setAddMagAmmo}
                onSubmit={addMagazine}
              />
            );
          }
          if (row.kind === 'packItem') {
            const i = row.index;
            const p = packs[i]!;
            if (row.field === 'kind')
              return (
                <ChoiceField
                  key={`pack-${i}-kind`}
                  label={`Pack ${i + 1}`}
                  options={[...PACK_KIND_LABELS, REMOVE]}
                  value={packKindLabel(p)}
                  isActive={isActive}
                  onChange={(v) => setPackKind(i, v)}
                  onSubmit={advance}
                />
              );
            if (row.field === 'size')
              return (
                <Field
                  key={`pack-${i}-size`}
                  label={p.kind === 'cartridge' ? '· cartridges' : '· kg'}
                  value={String(packSize(p))}
                  isActive={isActive}
                  onChange={(v) => setPackSize(i, v)}
                  onSubmit={advance}
                />
              );
            return (
              <ChoiceField
                key={`pack-${i}-rating`}
                label="· power class"
                options={PCLASS.labels}
                value={PCLASS.toLabel(p.rating)}
                isActive={isActive}
                onChange={(v) => setPackRating(i, v)}
                onSubmit={advance}
              />
            );
          }
          if (row.kind === 'packAdd') {
            return (
              <ChoiceField
                key="pack-add"
                label="Add power pack"
                options={PACK_KIND_LABELS}
                value={effective(addPackKind, PACK_KIND_LABELS)}
                isActive={isActive}
                onChange={setAddPackKind}
                onSubmit={addPack}
              />
            );
          }
          const list = lists[row.list];
          if (row.kind === 'listItem') {
            const i = row.index;
            return (
              <Field
                key={`${row.list}-${i}`}
                label={`✓ ${list.itemLabel(i)}`}
                value=""
                placeholder="Enter to remove"
                isActive={isActive}
                onChange={() => {}}
                onSubmit={() => list.remove(i)}
              />
            );
          }
          return (
            <ChoiceField
              key={`${row.list}-add`}
              label="Add…"
              options={list.available.length > 0 ? list.available : ['—']}
              value={effectiveListAdd(list)}
              isActive={isActive}
              onChange={list.onAddChange}
              onSubmit={list.available.length > 0 ? list.onAdd : advance}
            />
          );
        })}
        {sectionDefs[activeSection]?.list && (
          <Text dimColor>
            Add… picks an option; Enter on a ✓ row removes it.
          </Text>
        )}
        {(sectionDefs[activeSection]?.magazines ||
          sectionDefs[activeSection]?.packs) && (
          <Text dimColor>
            The first magazine is the standard one (size also set by Capacity
            %). Choose “✗ remove” to delete an entry.
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <WeaponSheet evaluation={evaluation} />
      </Box>

      <Box marginTop={1}>
        <IssueList issues={evaluation.issues} />
      </Box>

      {message ? (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ field · Tab/⇧Tab section · Enter next · ^S save · ^E export · ^O
          import · Esc menu
        </Text>
      </Box>
    </Box>
  );
}
