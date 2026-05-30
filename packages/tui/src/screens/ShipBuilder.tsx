import {
  evaluateShip,
  type HullConfigId,
  type PowerPlantId,
  SHIP_RESOURCES,
  type ShipParams,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React from 'react';

import { BudgetBar } from '../components/BudgetBar.js';
import { Field } from '../components/Field.js';
import { IssueList } from '../components/IssueList.js';
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
    staterooms: '2',
    turrets: '0',
  });
  useInput((_input, key) => {
    if (key.escape) onBack();
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
    staterooms: num(form.values.staterooms),
    turrets: num(form.values.turrets),
  };
  const { summary, issues, cargoTons } = evaluateShip(params);
  const usage = SHIP_RESOURCES.map((r) => summary.resources[r.key]!);
  const { thrust, jump, hullPoints } = summary.stats;

  const fields: Array<{ key: keyof typeof form.values; label: string }> = [
    { key: 'hull', label: 'Hull tonnage' },
    { key: 'tl', label: 'Tech level' },
    { key: 'config', label: 'Hull config' },
    { key: 'thrust', label: 'Thrust (M-drive)' },
    { key: 'jump', label: 'Jump (J-drive)' },
    { key: 'plant', label: 'Plant (TL8/12/15)' },
    { key: 'power', label: 'Power plant (tons)' },
    { key: 'fuel', label: 'Fuel (tons)' },
    { key: 'staterooms', label: 'Staterooms' },
    { key: 'turrets', label: 'Turrets' },
  ];

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Ship Builder
      </Text>
      <Text dimColor>Core Rulebook (2022) · standard hull configuration.</Text>

      <Box marginTop={1}>
        <BudgetBar resources={usage} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {fields.map((f, index) => (
          <Field
            key={f.key}
            label={f.label}
            value={form.values[f.key]}
            isActive={form.activeIndex === index}
            onChange={form.setters[f.key]}
            onSubmit={form.next}
          />
        ))}
      </Box>

      <Box marginTop={1}>
        <Text>
          Thrust <Text color="cyan">{thrust}</Text> · Jump{' '}
          <Text color="cyan">{jump}</Text> · Hull pts{' '}
          <Text color="cyan">{hullPoints}</Text> · Cargo{' '}
          <Text color="cyan">{Math.round(cargoTons * 100) / 100}</Text> tons
        </Text>
      </Box>

      <Box marginTop={1}>
        <IssueList issues={issues} />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter: next field · Esc: back to menu</Text>
      </Box>
    </Box>
  );
}
