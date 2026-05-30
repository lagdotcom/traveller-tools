import {
  DistanceUnit,
  G_MS2,
  humanizeDuration,
  travel,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React from 'react';

import { Field } from '../components/Field.js';
import { useForm } from '../components/useForm.js';

function formatDuration(seconds: number): string {
  const d = humanizeDuration(seconds);
  const parts: string[] = [];
  if (d.days) parts.push(`${d.days}d`);
  if (d.hours) parts.push(`${d.hours}h`);
  if (d.minutes) parts.push(`${d.minutes}m`);
  parts.push(`${d.seconds}s`);
  return parts.join(' ');
}

export function TravelScreen({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const form = useForm({ distance: '', unit: '', thrust: '', gravity: '' });
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  const distance = Number.parseFloat(form.values.distance);
  const unit: DistanceUnit =
    form.values.unit.trim().toLowerCase() === 'km' ? 'km' : 'AU';
  const thrust = Number.parseFloat(form.values.thrust);
  const gravity = form.values.gravity
    ? Number.parseFloat(form.values.gravity)
    : G_MS2;

  const ready =
    Number.isFinite(distance) &&
    distance > 0 &&
    Number.isFinite(thrust) &&
    thrust > 0;
  const result = ready ? travel(distance, unit, thrust, gravity) : undefined;

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Travel Time (flip &amp; burn)
      </Text>
      <Text dimColor>
        Constant thrust to the midpoint, then decelerate: t = 2·√(d / a).
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Field
          label="Distance"
          placeholder="e.g. 1"
          value={form.values.distance}
          isActive={form.activeIndex === 0}
          onChange={form.setters.distance}
          onSubmit={form.next}
        />
        <Field
          label="Unit (km/AU)"
          placeholder="AU"
          value={form.values.unit}
          isActive={form.activeIndex === 1}
          onChange={form.setters.unit}
          onSubmit={form.next}
        />
        <Field
          label="Thrust (G)"
          placeholder="e.g. 1-9"
          value={form.values.thrust}
          isActive={form.activeIndex === 2}
          onChange={form.setters.thrust}
          onSubmit={form.next}
        />
        <Field
          label="1 G in m/s² (opt.)"
          placeholder={`default ${G_MS2}`}
          value={form.values.gravity}
          isActive={form.activeIndex === 3}
          onChange={form.setters.gravity}
          onSubmit={form.next}
        />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {result ? (
          <>
            <Text>
              Travel time:{' '}
              <Text bold color="green">
                {formatDuration(result.seconds)}
              </Text>{' '}
              <Text dimColor>({Math.round(result.seconds)} s)</Text>
            </Text>
            <Text>
              Peak velocity:{' '}
              <Text color="cyan">
                {result.peakVelocityKms.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{' '}
                km/s
              </Text>{' '}
              <Text dimColor>at the midpoint</Text>
            </Text>
            <Text dimColor>
              over {distance} {unit} at {thrust} G
            </Text>
          </>
        ) : (
          <Text dimColor>Enter a distance and thrust…</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter: next field · Esc: back to menu</Text>
      </Box>
    </Box>
  );
}
