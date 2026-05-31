import {
  ACCESSORIES,
  type AccessoryId,
  AMMO_TYPES,
  type AmmoTypeId,
  type BarrelId,
  BARRELS,
  type CalibreId,
  CALIBRES,
  DEFAULT_WEAPON_PARAMS,
  evaluateWeapon,
  type FeedId,
  FEEDS,
  FURNITURE,
  type FurnitureId,
  type MechanismId,
  MECHANISMS,
  parseWeapon,
  RECEIVER_FEATURES,
  type ReceiverFeatureId,
  RECEIVERS,
  type ReceiverTypeId,
  serializeWeapon,
  type StockId,
  STOCKS,
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

const YN = ['no', 'yes'];

function formValues(p: WeaponParams) {
  return {
    tl: String(p.tl),
    receiver: RECEIVER.toLabel(p.receiver),
    gauss: p.gauss ? 'yes' : 'no',
    calibre: CALIBRE.toLabel(p.calibre),
    mechanism: MECHANISM.toLabel(p.mechanism),
    autoIncrease: String(p.autoIncrease),
    barrel: BARREL.toLabel(p.barrel),
    heavyBarrel: p.heavyBarrel ? 'yes' : 'no',
    stock: STOCK.toLabel(p.stock),
    feed: FEED.toLabel(p.feed),
    capacityPct: String(p.capacityPct),
    ammo: AMMO.toLabel(p.ammo),
  };
}

type ListId = 'features' | 'furniture' | 'accessories';

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
  const startParams = initial?.params ?? DEFAULT_WEAPON_PARAMS;
  const form = useForm(formValues(startParams));
  type FormKey = keyof typeof form.values;

  const name = initial?.name ?? 'Untitled Weapon';
  const [features, setFeatures] = useState<ReceiverFeatureId[]>(
    startParams.features,
  );
  const [furniture, setFurniture] = useState<FurnitureId[]>(
    startParams.furniture,
  );
  const [accessories, setAccessories] = useState<AccessoryId[]>(
    startParams.accessories,
  );
  const [addFeature, setAddFeature] = useState('');
  const [addFurniture, setAddFurniture] = useState('');
  const [addAccessory, setAddAccessory] = useState('');
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'edit' | 'export' | 'import'>('edit');
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

  const sectionDefs: { label: string; fields?: FieldDef[]; list?: ListId }[] = [
    {
      label: 'Type',
      fields: [
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

  const params: WeaponParams = {
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

  useInput((input, key) => {
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
          ↑/↓ field · Tab/⇧Tab section · Enter next · ^E export · ^O import ·
          Esc menu
        </Text>
      </Box>
    </Box>
  );
}

/** Keep a list's "Add" value valid as the available options change. */
function effective(value: string, available: string[]): string {
  return available.includes(value) ? value : (available[0] ?? '');
}
