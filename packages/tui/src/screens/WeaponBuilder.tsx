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
  DEFAULT_PROJECTOR_PARAMS,
  DEFAULT_WEAPON_PARAMS,
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
  type MechanismId,
  MECHANISMS,
  parseWeapon,
  PROJECTOR_FUELS,
  PROJECTOR_PROPELLANTS,
  PROJECTOR_STRUCTURES,
  type ProjectorFuelId,
  type ProjectorParams,
  type ProjectorPropellantId,
  type ProjectorStructureId,
  RECEIVER_FEATURES,
  type ReceiverFeatureId,
  RECEIVERS,
  type ReceiverTypeId,
  serializeWeapon,
  type StockId,
  STOCKS,
  type WeaponClass,
  type WeaponDefinition,
  type WeaponParams,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { ChoiceField } from '../components/ChoiceField.js';
import { Field } from '../components/Field.js';
import { IssueList } from '../components/IssueList.js';
import { useForm } from '../components/useForm.js';
import { WeaponSheet } from '../components/WeaponSheet.js';
import { useFiles } from '../files.js';
import { useWeaponStore } from '../storage.js';

const num = (value: string, fallback = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

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
const FEATURE = labelMap<ReceiverFeatureId>(RECEIVER_FEATURES);
const FURN = labelMap<FurnitureId>(FURNITURE);
const ACCESSORY = labelMap<AccessoryId>(ACCESSORIES);
const ERECEIVER = labelMap<EnergyReceiverId>(ENERGY_RECEIVERS);
const EMOD = labelMap<EnergyModId>(ENERGY_MODS);
const PSTRUCT = labelMap<ProjectorStructureId>(PROJECTOR_STRUCTURES);
const PPROP = labelMap<ProjectorPropellantId>(PROJECTOR_PROPELLANTS);
const PFUEL = labelMap<ProjectorFuelId>(PROJECTOR_FUELS);

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
]);
const EWTYPE = choiceMap<EnergyWeaponTypeId>([
  ['laser', 'Laser'],
  ['microwave', 'Microwave'],
]);
const PSOURCE = choiceMap<EnergyParams['powerSource']>([
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

/**
 * Flatten any weapon's params into one string-valued form record holding both
 * firearm and energy fields. Whichever class `p` is seeds its own side; the
 * other side falls back to its defaults, so switching class mid-edit is lossless
 * for the side you started on.
 */
function formValues(p: WeaponParams) {
  const f: FirearmParams = p.kind === 'firearm' ? p : DEFAULT_WEAPON_PARAMS;
  const e: EnergyParams = p.kind === 'energy' ? p : DEFAULT_ENERGY_PARAMS;
  const pr: ProjectorParams =
    p.kind === 'projector' ? p : DEFAULT_PROJECTOR_PARAMS;
  // Barrel/stock are shared by firearm + energy only (projectors have neither).
  const bs: FirearmParams | EnergyParams =
    p.kind === 'projector' ? DEFAULT_WEAPON_PARAMS : p;
  return {
    weaponClass: WCLASS.toLabel(p.kind),
    tl: String(p.tl),
    // shared (firearm + energy)
    barrel: BARREL.toLabel(bs.barrel),
    heavyBarrel: bs.heavyBarrel ? 'yes' : 'no',
    stock: STOCK.toLabel(bs.stock),
    // firearm
    receiver: RECEIVER.toLabel(f.receiver),
    gauss: f.gauss ? 'yes' : 'no',
    calibre: CALIBRE.toLabel(f.calibre),
    mechanism: MECHANISM.toLabel(f.mechanism),
    autoIncrease: String(f.autoIncrease),
    feed: FEED.toLabel(f.feed),
    capacityPct: String(f.capacityPct),
    ammo: AMMO.toLabel(f.ammo),
    // energy
    eWeaponType: EWTYPE.toLabel(e.weaponType),
    eReceiver: ERECEIVER.toLabel(e.receiver),
    damageDice: String(e.damageDice),
    powerSource: PSOURCE.toLabel(e.powerSource),
    powerpackKg: String(e.powerpackKg),
    powerpackRating: PCLASS.toLabel(e.powerpackRating),
    cartridgeRating: PCLASS.toLabel(e.cartridgeRating),
    cartridgeCount: String(e.cartridgeCount),
    cartridgeEjects: e.cartridgeEjects ? 'yes' : 'no',
    // projector
    pStructure: PSTRUCT.toLabel(pr.structure),
    pPropellant: PPROP.toLabel(pr.propellant),
    pFuel: PFUEL.toLabel(pr.fuel),
    fuelKg: String(pr.fuelKg),
    propellantKg: String(pr.propellantKg),
  };
}

type ListId = 'features' | 'furniture' | 'accessories' | 'mods';

export function WeaponBuilderScreen({
  onBack,
  initial,
  onLoad,
}: {
  onBack: () => void;
  initial?: WeaponDefinition;
  onLoad: (def: WeaponDefinition) => void;
}): React.JSX.Element {
  const files = useFiles();
  const store = useWeaponStore();
  const startParams = initial?.params ?? DEFAULT_WEAPON_PARAMS;
  const form = useForm(formValues(startParams));
  type FormKey = keyof typeof form.values;

  const [name, setName] = useState(initial?.name ?? 'Untitled Weapon');
  // Features/furniture/accessories are shared by firearm + energy; projectors
  // have none, so seed empty for them.
  const listSeed =
    startParams.kind === 'projector' ? DEFAULT_WEAPON_PARAMS : startParams;
  const [features, setFeatures] = useState<ReceiverFeatureId[]>(
    listSeed.features,
  );
  const [furniture, setFurniture] = useState<FurnitureId[]>(listSeed.furniture);
  const [accessories, setAccessories] = useState<AccessoryId[]>(
    listSeed.accessories,
  );
  const [mods, setMods] = useState<EnergyModId[]>(
    startParams.kind === 'energy' ? startParams.mods : [],
  );
  const [addFeature, setAddFeature] = useState('');
  const [addFurniture, setAddFurniture] = useState('');
  const [addAccessory, setAddAccessory] = useState('');
  const [addMod, setAddMod] = useState('');
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'edit' | 'save' | 'export' | 'import'>(
    'edit',
  );
  const [saveName, setSaveName] = useState(name);
  const [importBuffer, setImportBuffer] = useState('');
  const [message, setMessage] = useState('');

  // Each multi-select category is an add/remove list (like Systems on a ship).
  const lists: Record<
    ListId,
    {
      items: string[];
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
      itemLabel: (i) => FEATURE.toLabel(features[i]!),
      remove: (i) => setFeatures((p) => p.filter((_, k) => k !== i)),
      available: FEATURE.labels.filter(
        (l) => !features.includes(FEATURE.toId(l)),
      ),
      addValue: addFeature,
      onAddChange: setAddFeature,
      onAdd: () => {
        const id = FEATURE.toId(
          effective(addFeature, lists.features.available),
        );
        if (id && !features.includes(id)) setFeatures((p) => [...p, id]);
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
  };

  interface FieldDef {
    key: FormKey;
    label: string;
    options?: string[];
  }
  type Row =
    | { section: number; kind: 'field'; field: FieldDef }
    | { section: number; kind: 'listItem'; list: ListId; index: number }
    | { section: number; kind: 'listAdd'; list: ListId };

  const weaponClass: WeaponClass = WCLASS.toId(form.values.weaponClass);

  const classField: FieldDef = {
    key: 'weaponClass',
    label: 'Class',
    options: WCLASS.labels,
  };

  const firearmSections: {
    label: string;
    fields?: FieldDef[];
    list?: ListId;
  }[] = [
    {
      label: 'Type',
      fields: [
        classField,
        { key: 'tl', label: 'Tech level' },
        { key: 'receiver', label: 'Receiver', options: RECEIVER.labels },
        { key: 'gauss', label: 'Gauss', options: YN },
        { key: 'calibre', label: 'Calibre / ammo', options: CALIBRE.labels },
      ],
    },
    {
      label: 'Action',
      fields: [
        { key: 'mechanism', label: 'Mechanism', options: MECHANISM.labels },
        { key: 'autoIncrease', label: 'Increase Auto (+)' },
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
      // The stock field shows first; furniture add/remove rows follow.
      list: 'furniture',
    },
    {
      label: 'Feed',
      fields: [
        { key: 'feed', label: 'Feed device', options: FEED.labels },
        { key: 'capacityPct', label: 'Capacity (% of base)' },
      ],
    },
    { label: 'Features', list: 'features' },
    { label: 'Accessories', list: 'accessories' },
    {
      label: 'Ammo',
      fields: [{ key: 'ammo', label: 'Loaded ammo', options: AMMO.labels }],
    },
  ];

  const energySections: {
    label: string;
    fields?: FieldDef[];
    list?: ListId;
  }[] = [
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
    { label: 'Modifications', list: 'mods' },
    { label: 'Features', list: 'features' },
    { label: 'Accessories', list: 'accessories' },
  ];

  const projectorSections: {
    label: string;
    fields?: FieldDef[];
    list?: ListId;
  }[] = [
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
  ];

  const sectionDefs =
    weaponClass === 'energy'
      ? energySections
      : weaponClass === 'projector'
        ? projectorSections
        : firearmSections;

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
  });

  const safeActive = Math.min(active, rows.length - 1);
  const activeSection = rows[safeActive]!.section;
  const advance = () => setActive((i) => Math.min(i + 1, rows.length - 1));
  const gotoSection = (sectionIndex: number) => {
    const idx = rows.findIndex((r) => r.section === sectionIndex);
    if (idx >= 0) setActive(idx);
  };

  const params: WeaponParams =
    weaponClass === 'energy'
      ? {
          kind: 'energy',
          tl: num(form.values.tl, 0),
          weaponType: EWTYPE.toId(form.values.eWeaponType),
          receiver: ERECEIVER.toId(form.values.eReceiver),
          damageDice: num(form.values.damageDice, 1),
          barrel: BARREL.toId(form.values.barrel),
          heavyBarrel: form.values.heavyBarrel === 'yes',
          stock: STOCK.toId(form.values.stock),
          furniture,
          features,
          mods,
          accessories,
          powerSource: PSOURCE.toId(form.values.powerSource),
          powerpackKg: num(form.values.powerpackKg, 1),
          powerpackRating: PCLASS.toId(form.values.powerpackRating),
          cartridgeRating: PCLASS.toId(form.values.cartridgeRating),
          cartridgeCount: num(form.values.cartridgeCount, 10),
          cartridgeEjects: form.values.cartridgeEjects === 'yes',
        }
      : weaponClass === 'projector'
        ? {
            kind: 'projector',
            tl: num(form.values.tl, 0),
            structure: PSTRUCT.toId(form.values.pStructure),
            propellant: PPROP.toId(form.values.pPropellant),
            fuel: PFUEL.toId(form.values.pFuel),
            fuelKg: num(form.values.fuelKg, 0),
            propellantKg: num(form.values.propellantKg, 0),
          }
        : {
            kind: 'firearm',
            tl: num(form.values.tl, 0),
            receiver: RECEIVER.toId(form.values.receiver),
            gauss: form.values.gauss === 'yes',
            calibre: CALIBRE.toId(form.values.calibre),
            mechanism: MECHANISM.toId(form.values.mechanism),
            autoIncrease: num(form.values.autoIncrease),
            features,
            barrel: BARREL.toId(form.values.barrel),
            heavyBarrel: form.values.heavyBarrel === 'yes',
            stock: STOCK.toId(form.values.stock),
            furniture,
            feed: FEED.toId(form.values.feed),
            capacityPct: num(form.values.capacityPct, 100),
            accessories,
            ammo: AMMO.toId(form.values.ammo),
          };
  const currentDef: WeaponDefinition = { name, params };
  const evaluation = evaluateWeapon(params);

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
    const finalName = saveName.trim() || 'Untitled Weapon';
    store.save({ name: finalName, params });
    setName(finalName);
    setMode('edit');
    setMessage(`Saved “${finalName}”.`);
  };

  useInput((input, key) => {
    if (mode === 'edit' && key.ctrl && input === 's') {
      setSaveName(name);
      setMessage('');
      setMode('save');
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

  if (mode === 'save') {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          Save Weapon
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Field
            label="Name"
            value={saveName}
            isActive
            onChange={setSaveName}
            onSubmit={doSave}
          />
          <Text dimColor>Enter to save to the library · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

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

/** Keep a list's "Add" value valid as the available options change. */
function effective(value: string, available: string[]): string {
  return available.includes(value) ? value : (available[0] ?? '');
}
