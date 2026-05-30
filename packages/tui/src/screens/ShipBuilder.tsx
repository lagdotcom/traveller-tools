import {
  ARMOUR_TYPES,
  type ArmourTypeId,
  type BridgeId,
  type ComputerId,
  COMPUTERS,
  type CrewType,
  evaluateShip,
  type HullConfigId,
  type PowerPlantId,
  type SensorId,
  SENSORS,
  SHIP_RESOURCES,
  type ShipParams,
  SOFTWARE_TYPES,
  type SoftwareEntry,
  type SoftwareTypeId,
  SYSTEM_TYPES,
  type SystemEntry,
  type SystemTypeId,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { BudgetBar } from '../components/BudgetBar.js';
import { ChoiceField } from '../components/ChoiceField.js';
import { Field } from '../components/Field.js';
import { IssueList } from '../components/IssueList.js';
import { ShipSheet } from '../components/ShipSheet.js';
import { useForm } from '../components/useForm.js';

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

const SYSTEM_IDS = Object.keys(SYSTEM_TYPES) as SystemTypeId[];
const SOFTWARE_IDS = Object.keys(SOFTWARE_TYPES) as SoftwareTypeId[];
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
type ListId = 'systems' | 'software';

export function ShipBuilderScreen({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const form = useForm({
    hull: '100',
    tl: '12',
    config: 'standard',
    thrust: '1',
    jump: '1',
    plant: 'TL12',
    power: '4',
    fuel: '12',
    bridge: 'standard',
    scoop: 'no',
    armourType: 'crystaliron',
    armour: '0',
    computer: '/5',
    bis: 'no',
    sensors: 'basic',
    staterooms: '2',
    lowBerths: '0',
    common: '0',
    turrets: '0',
    crewType: 'commercial',
  });
  type FormKey = keyof typeof form.values;

  const [systems, setSystems] = useState<SystemEntry[]>([]);
  const [software, setSoftware] = useState<SoftwareEntry[]>([]);
  const [addSystem, setAddSystem] = useState('');
  const [addSoftware, setAddSoftware] = useState('');
  const [active, setActive] = useState(0);

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

  const sectionDefs: {
    label: string;
    fields?: FieldDef[];
    list?: ListId;
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
    { label: 'Weapons', fields: [{ key: 'turrets', label: 'Turrets' }] },
    { label: 'Systems', list: 'systems' },
    { label: 'Software', list: 'software' },
    {
      label: 'Crew',
      fields: [
        { key: 'crewType', label: 'Crew', options: ['commercial', 'military'] },
      ],
    },
  ];

  const rows: Row[] = [];
  sectionDefs.forEach((section, si) => {
    if (section.list) {
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

  useInput((_input, key) => {
    if (key.escape) onBack();
    else if (key.downArrow) setActive((i) => Math.min(i + 1, rows.length - 1));
    else if (key.upArrow) setActive((i) => Math.max(i - 1, 0));
    else if (key.tab && key.shift)
      gotoSection(
        (activeSection - 1 + sectionDefs.length) % sectionDefs.length,
      );
    else if (key.tab) gotoSection((activeSection + 1) % sectionDefs.length);
  });

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
    systems,
    software,
    turrets: num(form.values.turrets),
    crewType: form.values.crewType as CrewType,
  };
  const { summary, issues, cargoTons, powerRequirements, crew, runningCosts } =
    evaluateShip(params);
  const usage = SHIP_RESOURCES.map((r) => summary.resources[r.key]!);
  const { thrust, jump, hullPoints } = summary.stats;

  const activeList = sectionDefs[activeSection]!.list;

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Ship Builder
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
                isActive={index === safeActive}
                onChange={form.setters[f.key]}
                onSubmit={advance}
              />
            ) : (
              <Field
                key={f.key}
                label={f.label}
                value={form.values[f.key]}
                isActive={index === safeActive}
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
                label={list.itemLabel(i)}
                value={list.itemValue(i)}
                isActive={index === safeActive}
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
              isActive={index === safeActive}
              onChange={list.onAddChange}
              onSubmit={list.addOptions.length > 0 ? list.onAdd : advance}
            />
          );
        })}
        {activeList && <Text dimColor>{lists[activeList].hint}</Text>}
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

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ field · Tab/⇧Tab section · Enter next · Esc menu
        </Text>
      </Box>
    </Box>
  );
}
