import React from 'react';
import { Box, Text, useInput } from 'ink';
import {
  jumpDuration,
  jumpFuel,
  MAX_JUMP,
  validateJump,
} from '@traveller-tools/core';
import { Field } from '../components/Field.js';
import { useForm } from '../components/useForm.js';

export function JumpFuelScreen({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const form = useForm({ hull: '', jump: '', drive: '' });
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  const hull = Number.parseFloat(form.values.hull);
  const jump = Number.parseInt(form.values.jump, 10);
  const drive = form.values.drive
    ? Number.parseInt(form.values.drive, 10)
    : MAX_JUMP;

  const hasHull = Number.isFinite(hull) && hull > 0;
  const hasJump = Number.isFinite(jump) && jump > 0;

  const validation = hasJump ? validateJump(jump, drive) : undefined;
  const fuel = hasHull && hasJump ? jumpFuel(hull, jump) : undefined;
  const duration = jumpDuration();

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Jump &amp; Fuel
      </Text>
      <Text dimColor>Fuel = 10% of hull tonnage per parsec jumped.</Text>
      <Box flexDirection="column" marginTop={1}>
        <Field
          label="Hull tonnage"
          placeholder="e.g. 200"
          value={form.values.hull}
          isActive={form.activeIndex === 0}
          onChange={form.set('hull')}
          onSubmit={form.next}
        />
        <Field
          label="Jump distance (pc)"
          placeholder="1-6"
          value={form.values.jump}
          isActive={form.activeIndex === 1}
          onChange={form.set('jump')}
          onSubmit={form.next}
        />
        <Field
          label="Drive rating (opt.)"
          placeholder={`default ${MAX_JUMP}`}
          value={form.values.drive}
          isActive={form.activeIndex === 2}
          onChange={form.set('drive')}
          onSubmit={form.next}
        />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {validation && !validation.ok && (
          <Text color="red">⚠ {validation.reason}</Text>
        )}
        {fuel && (
          <>
            <Text>
              Fuel required:{' '}
              <Text bold color="green">
                {fuel.fuelTons.toLocaleString()} tons
              </Text>{' '}
              <Text dimColor>({fuel.fuelPercentOfHull}% of hull)</Text>
            </Text>
            <Text>
              Jump duration:{' '}
              <Text color="cyan">
                {duration.minHours}–{duration.maxHours} hours
              </Text>{' '}
              <Text dimColor>
                (~{(duration.avgHours / 24).toFixed(1)} days, 148 + 6D)
              </Text>
            </Text>
          </>
        )}
        {!fuel && <Text dimColor>Enter hull tonnage and jump distance…</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter: next field · Esc: back to menu</Text>
      </Box>
    </Box>
  );
}
