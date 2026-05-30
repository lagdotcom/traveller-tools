import {
  ARMOUR_TYPES,
  type ArmourTypeId,
  type BridgeId,
  BUILTIN_SHIPS,
  type CarriedCraft,
  type ComputerId,
  COMPUTERS,
  type CrewType,
  DEFAULT_SHIP_PARAMS,
  evaluateShip,
  type HullConfigId,
  type MountId,
  MOUNTS,
  parseShip,
  type PowerPlantId,
  type SensorId,
  SENSORS,
  serializeShip,
  SHIP_RESOURCES,
  type ShipDefinition,
  type ShipParams,
  SOFTWARE_TYPES,
  type SoftwareEntry,
  type SoftwareTypeId,
  SYSTEM_TYPES,
  type SystemEntry,
  type SystemTypeId,
  type WeaponEntry,
  type WeaponId,
  WEAPONS,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { BudgetBar } from '../components/BudgetBar.js';
import { ChoiceField } from '../components/ChoiceField.js';
import { Field } from '../components/Field.js';
import { IssueList } from '../components/IssueList.js';
import { ShipSheet } from '../components/ShipSheet.js';
import { useForm } from '../components/useForm.js';
import { useStore } from '../storage.js';

const num = (value: string, fallback = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

function parseConfig(value: string): HullConfigId {
  const v = value.trim().toLowerCase();
  if (v.startsWith('stream')) return 'streamlined';
  if (v.startsWith('disp')) return 'dispersed';
  return 'standard';
}

function parsePlant(value: string): PowerPlantId {
  const v = value.trim().toLowerCase();
  if (v.includes('8')) return 'fusionTL8';
  if (v.includes('15')) return 'fusionTL15';
  return 'fusionTL12';
}

const PLANT_TO_FORM: Record<PowerPlantId, string> = {
  fusionTL8: 'TL8',
  fusionTL12: 'TL12',
  fusionTL15: 'TL15',
};

/** Initial text-field values for the builder form, from a set of ship params. */
function formValues(p: ShipParams) {
  return {
    hull: String(p.hullTons),
    tl: String(p.tl),
    config: p.hullConfig,
    thrust: String(p.thrust),
    jump: String(p.jump),
    plant: PLANT_TO_FORM[p.powerPlantType],
    power: String(p.powerPlantTons),
    fuel: String(p.fuelTons),
    bridge: p.bridge,
    scoop: p.fuelScoop ? 'yes' : 'no',
    armourType: p.armourType,
    armour: String(p.armourPoints),
    reinforce: String(p.reinforcementTons),
    computer: p.computer,
    bis: p.computerBis ? 'yes' : 'no',
    sensors: p.sensors,
    staterooms: String(p.staterooms),
    lowBerths: String(p.lowBerths),
    common: String(p.commonAreasTons),
    crewType: p.crewType,
    standard: p.standardDesign ? 'yes' : 'no',
  };
}

const SYSTEM_IDS = Object.keys(SYSTEM_TYPES) as SystemTypeId[];
const SOFTWARE_IDS = Object.keys(SOFTWARE_TYPES) as SoftwareTypeId[];
const MOUNT_IDS = Object.keys(MOUNTS) as MountId[];
const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const MOUNT_LABELS = MOUNT_IDS.map((id) => MOUNTS[id].label);
const REMOVE_TURRET = '✗ remove turret';
const MOUNT_LABELS_REMOVE = [...MOUNT_LABELS, REMOVE_TURRET];
const EMPTY_SLOT = '— empty —';
// Each weapon slot can hold a weapon or be left empty.
const WEAPON_SLOT_LABELS = [
  EMPTY_SLOT,
  ...WEAPON_IDS.map((id) => WEAPONS[id].label),
];
const mountByLabel = (label: string): MountId =>
  MOUNT_IDS.find((id) => MOUNTS[id].label === label) ?? 'single';
const weaponByLabel = (label: string): WeaponId | undefined =>
  WEAPON_IDS.find((id) => WEAPONS[id].label === label);
/** Capacity of a mount (a particle barbette occupies its whole mount). */
const mountCapacity = (entry: WeaponEntry): number =>
  entry.weapons.some((w) => WEAPONS[w]?.barbette)
    ? 1
    : MOUNTS[entry.mount].capacity;
const labelToId = <T extends string>(
  ids: T[],
  labelOf: (id: T) => string,
  label: string,
): T | undefined => ids.find((id) => labelOf(id) === label);

/** A dynamic add/remove list section (Systems, Software). */
interface ListConfig {
  count: number;
  itemLabel: (index: number) => string;
  itemValue: (index: number) => string;
  setItem: (index: number, value: string) => void;
  isEmpty: (index: number) => boolean;
  remove: (index: number) => void;
  addOptions: string[];
  addValue: string;
  onAddChange: (value: string) => void;
  onAdd: () => void;
  hint: string;
}
type ListId = 'systems' | 'software' | 'craft';

export function ShipBuilderScreen({
  onBack,
  initial,
  onLoad,
}: {
  onBack: () => void;
  initial?: ShipDefinition;
  onLoad: (def: ShipDefinition) => void;
}): React.JSX.Element {
  const store = useStore();
  const startParams = initial?.params ?? DEFAULT_SHIP_PARAMS;
  const form = useForm(formValues(startParams));
  type FormKey = keyof typeof form.values;

  const [name, setName] = useState(initial?.name ?? 'Untitled Ship');
  const [systems, setSystems] = useState<SystemEntry[]>(startParams.systems);
  const [software, setSoftware] = useState<SoftwareEntry[]>(
    startParams.software,
  );
  const [weapons, setWeapons] = useState<WeaponEntry[]>(startParams.weapons);
  const [carried, setCarried] = useState<CarriedCraft[]>(startParams.carried);
  const [addSystem, setAddSystem] = useState('');
  const [addSoftware, setAddSoftware] = useState('');
  const [addWeapon, setAddWeapon] = useState('');
  const [addCraft, setAddCraft] = useState('');
  const [active, setActive] = useState(0);
  // Library actions: save, export JSON, import JSON (paste).
  const [mode, setMode] = useState<'edit' | 'save' | 'export' | 'import'>(
    'edit',
  );
  const [saveName, setSaveName] = useState('');
  const [importBuffer, setImportBuffer] = useState('');
  const [message, setMessage] = useState('');

  const sysLabel = (id: SystemTypeId) => SYSTEM_TYPES[id].label;
  const swLabel = (id: SoftwareTypeId) => SOFTWARE_TYPES[id].label;

  const sysAvailable = SYSTEM_IDS.filter(
    (id) => !systems.some((s) => s.type === id),
  ).map(sysLabel);
  const swAvailable = SOFTWARE_IDS.filter(
    (id) => !software.some((s) => s.type === id),
  ).map(swLabel);
  const effective = (value: string, available: string[]) =>
    available.includes(value) ? value : (available[0] ?? '');

  // Craft that can be carried: every built-in plus the player's saved ships,
  // de-duplicated by name (saved ships win).
  const craftDefs: ShipDefinition[] = [
    ...store.list(),
    ...BUILTIN_SHIPS.filter(
      (b) => !store.list().some((s) => s.name === b.name),
    ),
  ];
  const craftAvailable = craftDefs
    .map((d) => d.name)
    .filter((n) => !carried.some((c) => c.name === n));

  const lists: Record<ListId, ListConfig> = {
    systems: {
      count: systems.length,
      itemLabel: (i) => `${sysLabel(systems[i]!.type)} (t)`,
      itemValue: (i) => String(systems[i]!.amount),
      setItem: (i, v) =>
        setSystems((prev) =>
          prev.map((e, k) => (k === i ? { ...e, amount: num(v) } : e)),
        ),
      isEmpty: (i) => systems[i]!.amount <= 0,
      remove: (i) => setSystems((prev) => prev.filter((_, k) => k !== i)),
      addOptions: sysAvailable,
      addValue: effective(addSystem, sysAvailable),
      onAddChange: setAddSystem,
      onAdd: () => {
        const id = labelToId(
          SYSTEM_IDS,
          sysLabel,
          effective(addSystem, sysAvailable),
        );
        if (id) {
          setSystems((prev) => [...prev, { type: id, amount: 1 }]);
          setAddSystem('');
        }
      },
      hint: 'Enter on a system with 0 tons removes it.',
    },
    software: {
      count: software.length,
      itemLabel: (i) =>
        SOFTWARE_TYPES[software[i]!.type].leveled
          ? `${swLabel(software[i]!.type)} (level)`
          : swLabel(software[i]!.type),
      itemValue: (i) => String(software[i]!.level),
      setItem: (i, v) =>
        setSoftware((prev) =>
          prev.map((e, k) => (k === i ? { ...e, level: num(v) } : e)),
        ),
      isEmpty: (i) =>
        SOFTWARE_TYPES[software[i]!.type].leveled && software[i]!.level <= 0,
      remove: (i) => setSoftware((prev) => prev.filter((_, k) => k !== i)),
      addOptions: swAvailable,
      addValue: effective(addSoftware, swAvailable),
      onAddChange: setAddSoftware,
      onAdd: () => {
        const id = labelToId(
          SOFTWARE_IDS,
          swLabel,
          effective(addSoftware, swAvailable),
        );
        if (id) {
          setSoftware((prev) => [...prev, { type: id, level: 1 }]);
          setAddSoftware('');
        }
      },
      hint: 'Enter on a 0-level program removes it.',
    },
    craft: {
      count: carried.length,
      itemLabel: (i) => `${carried[i]!.name} (qty)`,
      itemValue: (i) => String(carried[i]!.count),
      setItem: (i, v) =>
        setCarried((prev) =>
          prev.map((e, k) => (k === i ? { ...e, count: num(v) } : e)),
        ),
      isEmpty: (i) => carried[i]!.count <= 0,
      remove: (i) => setCarried((prev) => prev.filter((_, k) => k !== i)),
      addOptions: craftAvailable,
      addValue: effective(addCraft, craftAvailable),
      onAddChange: setAddCraft,
      onAdd: () => {
        const def = craftDefs.find(
          (d) => d.name === effective(addCraft, craftAvailable),
        );
        if (def) {
          const { summary } = evaluateShip(def.params);
          setCarried((prev) => [
            ...prev,
            {
              kind: 'ship',
              name: def.name,
              tons: def.params.hullTons,
              cost: summary.resources.cost.used,
              count: 1,
              ship: def.params,
            },
          ]);
          setAddCraft('');
        }
      },
      hint: 'Carried craft use derived hangar rules. Enter on qty 0 removes it.',
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
    | { section: number; kind: 'listAdd'; list: ListId }
    | { section: number; kind: 'wpnMount'; index: number }
    | { section: number; kind: 'wpnSlot'; index: number; slot: number }
    | { section: number; kind: 'wpnAdd' };

  const sectionDefs: {
    label: string;
    fields?: FieldDef[];
    list?: ListId;
    weapons?: true;
  }[] = [
    {
      label: 'Hull',
      fields: [
        { key: 'hull', label: 'Hull tonnage' },
        { key: 'tl', label: 'Tech level' },
        {
          key: 'config',
          label: 'Hull config',
          options: ['standard', 'streamlined', 'dispersed'],
        },
      ],
    },
    {
      label: 'Drives & Power',
      fields: [
        { key: 'thrust', label: 'Thrust (M-drive)' },
        { key: 'jump', label: 'Jump (J-drive)' },
        {
          key: 'plant',
          label: 'Power plant',
          options: ['TL8', 'TL12', 'TL15'],
        },
        { key: 'power', label: 'Power plant (tons)' },
        { key: 'fuel', label: 'Fuel (tons)' },
        { key: 'scoop', label: 'Fuel scoop', options: ['no', 'yes'] },
        {
          key: 'bridge',
          label: 'Bridge',
          options: ['standard', 'cockpit', 'holographic'],
        },
      ],
    },
    {
      label: 'Defences',
      fields: [
        {
          key: 'armourType',
          label: 'Armour type',
          options: Object.keys(ARMOUR_TYPES),
        },
        { key: 'armour', label: 'Armour points' },
        { key: 'reinforce', label: 'Reinforcement (t)' },
        { key: 'computer', label: 'Computer', options: Object.keys(COMPUTERS) },
        { key: 'bis', label: 'Computer /bis', options: ['no', 'yes'] },
        { key: 'sensors', label: 'Sensors', options: Object.keys(SENSORS) },
      ],
    },
    {
      label: 'Accommodation',
      fields: [
        { key: 'staterooms', label: 'Staterooms' },
        { key: 'lowBerths', label: 'Low berths' },
        { key: 'common', label: 'Common areas (t)' },
      ],
    },
    { label: 'Weapons', weapons: true },
    { label: 'Systems', list: 'systems' },
    { label: 'Software', list: 'software' },
    { label: 'Craft', list: 'craft' },
    {
      label: 'Crew',
      fields: [
        { key: 'crewType', label: 'Crew', options: ['commercial', 'military'] },
        {
          key: 'standard',
          label: 'Standard design (−10%)',
          options: ['yes', 'no'],
        },
      ],
    },
  ];

  const rows: Row[] = [];
  sectionDefs.forEach((section, si) => {
    if (section.weapons) {
      weapons.forEach((entry, index) => {
        rows.push({ section: si, kind: 'wpnMount', index });
        const cap = mountCapacity(entry);
        for (let slot = 0; slot < cap; slot++)
          rows.push({ section: si, kind: 'wpnSlot', index, slot });
      });
      rows.push({ section: si, kind: 'wpnAdd' });
    } else if (section.list) {
      const list = lists[section.list];
      for (let index = 0; index < list.count; index++)
        rows.push({ section: si, kind: 'listItem', list: section.list, index });
      rows.push({ section: si, kind: 'listAdd', list: section.list });
    } else {
      section.fields!.forEach((field) =>
        rows.push({ section: si, kind: 'field', field }),
      );
    }
  });

  const safeActive = Math.min(active, rows.length - 1);
  const activeSection = rows[safeActive]!.section;
  const advance = () => setActive((i) => Math.min(i + 1, rows.length - 1));
  const gotoSection = (sectionIndex: number) => {
    const idx = rows.findIndex((r) => r.section === sectionIndex);
    if (idx >= 0) setActive(idx);
  };

  useInput((input, key) => {
    // Import mode accumulates pasted JSON (which arrives as one burst) and
    // loads it the moment it parses; Esc cancels.
    if (mode === 'import') {
      if (key.escape) {
        setMode('edit');
        setImportBuffer('');
        setMessage('Import cancelled.');
        return;
      }
      if (key.backspace || key.delete) {
        setImportBuffer((b) => b.slice(0, -1));
        return;
      }
      if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow)
        return;
      const next = importBuffer + (key.return ? '\n' : input);
      setImportBuffer(next);
      try {
        const def = parseShip(next);
        setMode('edit');
        setImportBuffer('');
        onLoad(def);
      } catch {
        // keep collecting until it parses
      }
      return;
    }

    // Library shortcuts are available from edit mode.
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
    if (mode === 'edit' && key.ctrl && input === 'i') {
      setImportBuffer('');
      setMessage('');
      setMode('import');
      return;
    }

    // Save/export overlays: Esc returns to editing; the name Field (save mode)
    // handles its own typing, so swallow other keys here.
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

  const doSave = () => {
    const finalName = saveName.trim() || 'Untitled Ship';
    store.save({ name: finalName, params });
    setName(finalName);
    setMode('edit');
    setMessage(`Saved “${finalName}”.`);
  };

  const effectiveAddWeapon = MOUNT_LABELS.includes(addWeapon)
    ? addWeapon
    : MOUNT_LABELS[0]!;
  const removeWeapon = (i: number) =>
    setWeapons((prev) => prev.filter((_, k) => k !== i));
  // Choosing a mount (or removing the turret); the weapon list is truncated to
  // the new mount's capacity.
  const setWeaponMount = (i: number, label: string) => {
    if (label === REMOVE_TURRET) return removeWeapon(i);
    const mount = mountByLabel(label);
    setWeapons((prev) =>
      prev.map((e, k) =>
        k === i
          ? { mount, weapons: e.weapons.slice(0, MOUNTS[mount].capacity) }
          : e,
      ),
    );
  };
  // Set a single weapon slot; empty slots are dropped, keeping the list compact.
  const setWeaponSlot = (i: number, slot: number, label: string) =>
    setWeapons((prev) =>
      prev.map((e, k) => {
        if (k !== i) return e;
        const cap = mountCapacity(e);
        const slots: (WeaponId | undefined)[] = Array.from(
          { length: cap },
          (_, s) => e.weapons[s],
        );
        slots[slot] = label === EMPTY_SLOT ? undefined : weaponByLabel(label);
        return {
          ...e,
          weapons: slots.filter((w): w is WeaponId => Boolean(w)),
        };
      }),
    );
  const addWeaponEntry = () =>
    setWeapons((prev) => [
      ...prev,
      { mount: mountByLabel(effectiveAddWeapon), weapons: ['beamLaser'] },
    ]);

  const params: ShipParams = {
    hullTons: num(form.values.hull),
    tl: num(form.values.tl),
    hullConfig: parseConfig(form.values.config),
    thrust: num(form.values.thrust),
    jump: num(form.values.jump),
    powerPlantType: parsePlant(form.values.plant),
    powerPlantTons: num(form.values.power),
    fuelTons: num(form.values.fuel),
    bridge: form.values.bridge as BridgeId,
    fuelScoop: form.values.scoop === 'yes',
    armourType: form.values.armourType as ArmourTypeId,
    armourPoints: num(form.values.armour),
    computer: form.values.computer as ComputerId,
    computerBis: form.values.bis === 'yes',
    sensors: form.values.sensors as SensorId,
    staterooms: num(form.values.staterooms),
    lowBerths: num(form.values.lowBerths),
    commonAreasTons: num(form.values.common),
    reinforcementTons: num(form.values.reinforce),
    systems,
    software,
    weapons,
    carried,
    crewType: form.values.crewType as CrewType,
    standardDesign: form.values.standard === 'yes',
  };
  const currentDef: ShipDefinition = { name, params };
  const { summary, issues, cargoTons, powerRequirements, crew, runningCosts } =
    evaluateShip(params);
  const usage = SHIP_RESOURCES.map((r) => summary.resources[r.key]!);
  const { thrust, jump, hullPoints } = summary.stats;

  const activeList = sectionDefs[activeSection]!.list;

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
          <Text>{serializeShip(currentDef)}</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'import') {
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          Import Ship
        </Text>
        <Box marginTop={1}>
          <Text>Paste exported ship JSON; it loads once complete.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{importBuffer.length} characters received…</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Ship Builder — {name}
      </Text>

      {mode === 'save' && (
        <Box marginTop={1} flexDirection="column">
          <Field
            label="Save as"
            value={saveName}
            isActive
            onChange={setSaveName}
            onSubmit={doSave}
          />
          <Text dimColor>Enter to save · Esc to cancel</Text>
        </Box>
      )}

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

      <Box marginTop={1}>
        <BudgetBar resources={usage} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rows.map((row, index) => {
          if (row.section !== activeSection) return null;
          if (row.kind === 'field') {
            const f = row.field;
            return f.options ? (
              <ChoiceField
                key={f.key}
                label={f.label}
                options={f.options}
                value={form.values[f.key]}
                isActive={mode === 'edit' && index === safeActive}
                onChange={form.setters[f.key]}
                onSubmit={advance}
              />
            ) : (
              <Field
                key={f.key}
                label={f.label}
                value={form.values[f.key]}
                isActive={mode === 'edit' && index === safeActive}
                onChange={form.setters[f.key]}
                onSubmit={advance}
              />
            );
          }
          if (row.kind === 'wpnMount') {
            const i = row.index;
            return (
              <ChoiceField
                key={`wpn-mount-${i}`}
                label={`Turret ${i + 1}`}
                options={MOUNT_LABELS_REMOVE}
                value={MOUNTS[weapons[i]!.mount].label}
                isActive={mode === 'edit' && index === safeActive}
                onChange={(v) => setWeaponMount(i, v)}
                onSubmit={advance}
              />
            );
          }
          if (row.kind === 'wpnSlot') {
            const { index: i, slot } = row;
            const w = weapons[i]!.weapons[slot];
            return (
              <ChoiceField
                key={`wpn-slot-${i}-${slot}`}
                label={`  Weapon ${slot + 1}`}
                options={WEAPON_SLOT_LABELS}
                value={w ? WEAPONS[w].label : EMPTY_SLOT}
                isActive={mode === 'edit' && index === safeActive}
                onChange={(v) => setWeaponSlot(i, slot, v)}
                onSubmit={advance}
              />
            );
          }
          if (row.kind === 'wpnAdd') {
            return (
              <ChoiceField
                key="wpn-add"
                label="Add turret"
                options={MOUNT_LABELS}
                value={effectiveAddWeapon}
                isActive={mode === 'edit' && index === safeActive}
                onChange={setAddWeapon}
                onSubmit={addWeaponEntry}
              />
            );
          }
          const list = lists[row.list];
          if (row.kind === 'listItem') {
            const i = row.index;
            return (
              <Field
                key={`${row.list}-${i}`}
                label={list.itemLabel(i)}
                value={list.itemValue(i)}
                isActive={mode === 'edit' && index === safeActive}
                onChange={(v) => list.setItem(i, v)}
                onSubmit={() => (list.isEmpty(i) ? list.remove(i) : advance())}
              />
            );
          }
          return (
            <ChoiceField
              key={`${row.list}-add`}
              label="Add…"
              options={list.addOptions.length > 0 ? list.addOptions : ['—']}
              value={list.addOptions.length > 0 ? list.addValue : '—'}
              isActive={mode === 'edit' && index === safeActive}
              onChange={list.onAddChange}
              onSubmit={list.addOptions.length > 0 ? list.onAdd : advance}
            />
          );
        })}
        {activeList && <Text dimColor>{lists[activeList].hint}</Text>}
        {sectionDefs[activeSection]?.weapons && (
          <Text dimColor>
            Turrets hold multiple weapons; set Turret to “✗ remove turret” to
            delete.
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <ShipSheet
          lineItems={summary.lineItems}
          totalTons={summary.resources.tons.used}
          hullTons={summary.resources.tons.provided}
          totalCost={summary.resources.cost.used}
          hullPoints={hullPoints}
          thrust={thrust}
          jump={jump}
          cargoTons={cargoTons}
          powerRequirements={powerRequirements}
          crew={crew}
          runningCosts={runningCosts}
        />
      </Box>

      <Box marginTop={1}>
        <IssueList issues={issues} />
      </Box>

      {message ? (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ field · Tab/⇧Tab section · Enter next · ^S save · ^E export · ^I
          import · Esc menu
        </Text>
      </Box>
    </Box>
  );
}
