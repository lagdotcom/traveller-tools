import {
  ARMOUR_TYPES,
  type ArmourTypeId,
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
    fuelProc: '0',
    scoop: 'no',
    armourType: 'crystaliron',
    armour: '0',
    computer: '/5',
    bis: 'no',
    sensors: 'basic',
    staterooms: '2',
    lowBerths: '0',
    common: '0',
    probe: '0',
    repair: '0',
    turrets: '0',
    crewType: 'commercial',
  });

  type FormKey = keyof typeof form.values;
  interface FieldDef {
    key: FormKey;
    label: string;
    options?: string[];
  }
  const sections: { label: string; fields: FieldDef[] }[] = [
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
        { key: 'fuelProc', label: 'Fuel processor (t)' },
        { key: 'scoop', label: 'Fuel scoop', options: ['no', 'yes'] },
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
    {
      label: 'Systems',
      fields: [
        { key: 'probe', label: 'Probe drones (t)' },
        { key: 'repair', label: 'Repair drones (t)' },
        { key: 'turrets', label: 'Turrets' },
      ],
    },
    {
      label: 'Crew',
      fields: [
        { key: 'crewType', label: 'Crew', options: ['commercial', 'military'] },
      ],
    },
  ];

  const flat = sections.flatMap((section, sectionIndex) =>
    section.fields.map((field) => ({ ...field, sectionIndex })),
  );

  const [active, setActive] = useState(0);
  const activeSection = flat[active]!.sectionIndex;

  const gotoSection = (sectionIndex: number) => {
    const idx = flat.findIndex((f) => f.sectionIndex === sectionIndex);
    if (idx >= 0) setActive(idx);
  };

  useInput((_input, key) => {
    if (key.escape) onBack();
    else if (key.downArrow) setActive((i) => Math.min(i + 1, flat.length - 1));
    else if (key.upArrow) setActive((i) => Math.max(i - 1, 0));
    else if (key.tab && key.shift)
      gotoSection((activeSection - 1 + sections.length) % sections.length);
    else if (key.tab) gotoSection((activeSection + 1) % sections.length);
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
    fuelProcessorTons: num(form.values.fuelProc),
    fuelScoop: form.values.scoop === 'yes',
    armourType: form.values.armourType as ArmourTypeId,
    armourPoints: num(form.values.armour),
    computer: form.values.computer as ComputerId,
    computerBis: form.values.bis === 'yes',
    sensors: form.values.sensors as SensorId,
    staterooms: num(form.values.staterooms),
    lowBerths: num(form.values.lowBerths),
    commonAreasTons: num(form.values.common),
    probeDroneTons: num(form.values.probe),
    repairDroneTons: num(form.values.repair),
    turrets: num(form.values.turrets),
    crewType: form.values.crewType as CrewType,
  };
  const { summary, issues, cargoTons, powerRequirements, crew, runningCosts } =
    evaluateShip(params);
  const usage = SHIP_RESOURCES.map((r) => summary.resources[r.key]!);
  const { thrust, jump, hullPoints } = summary.stats;

  const advance = () => setActive((i) => Math.min(i + 1, flat.length - 1));

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Ship Builder
      </Text>

      <Box marginTop={1}>
        {sections.map((section, index) => (
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
        {flat.map((f, index) =>
          f.sectionIndex !== activeSection ? null : f.options ? (
            <ChoiceField
              key={f.key}
              label={f.label}
              options={f.options}
              value={form.values[f.key]}
              isActive={index === active}
              onChange={form.setters[f.key]}
              onSubmit={advance}
            />
          ) : (
            <Field
              key={f.key}
              label={f.label}
              value={form.values[f.key]}
              isActive={index === active}
              onChange={form.setters[f.key]}
              onSubmit={advance}
            />
          ),
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

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ field · Tab/⇧Tab section · Enter next · Esc menu
        </Text>
      </Box>
    </Box>
  );
}
