import {
  formatDamage,
  type WeaponEvaluation,
  type WeaponProfile,
} from '@traveller-tools/core';
import { Box, Text } from 'ink';
import React from 'react';

/** Format the trait map the way the book lists them: `Auto 3, Lo-Pen 2`. */
function formatTraits(profile: WeaponProfile): string {
  const parts = Object.entries(profile.traits)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k} ${v}`))
    .sort((a, b) => a.localeCompare(b));
  return parts.length ? parts.join(', ') : '—';
}

const cr = (n: number): string =>
  n >= 1000
    ? `Cr${Math.round(n).toLocaleString()}`
    : `Cr${Math.round(n * 100) / 100}`;
const kg = (n: number): string => `${Math.round(n * 1000) / 1000}kg`;

/** A book-style weapon profile + cost/weight breakdown panel. */
export function WeaponSheet({
  evaluation,
}: {
  evaluation: WeaponEvaluation;
}): React.JSX.Element {
  const { profile, breakdown, totals, sources } = evaluation;
  const sig = `${profile.signatureKind === 'emissions' ? 'Emissions' : 'Physical'} (${profile.signature})`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <Text bold color="yellow">
        Profile — TL{profile.tl}
      </Text>
      <Box flexWrap="wrap">
        <Text>Damage {formatDamage(profile.damage)} </Text>
        <Text dimColor>· </Text>
        <Text>Range {profile.range}m </Text>
        <Text dimColor>· </Text>
        <Text>{profile.auto > 0 ? `Auto ${profile.auto} ` : 'Single '}</Text>
        <Text dimColor>· </Text>
        <Text>Recoil {profile.recoil} </Text>
        <Text dimColor>· </Text>
        <Text>
          Quickdraw{' '}
          {profile.quickdraw >= 0
            ? `+${profile.quickdraw}`
            : profile.quickdraw}{' '}
        </Text>
      </Box>
      <Box flexWrap="wrap">
        <Text>Penetration {profile.penetration} </Text>
        <Text dimColor>· </Text>
        <Text>Signature {sig} </Text>
        <Text dimColor>· </Text>
        <Text>Magazine {profile.capacity} </Text>
        {profile.heat > 0 ? <Text dimColor>· Heat {profile.heat}</Text> : null}
      </Box>
      <Text>
        <Text dimColor>Traits: </Text>
        {formatTraits(profile)}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Components</Text>
        {breakdown.map((line, i) => (
          <Box key={i}>
            <Box width={34}>
              <Text wrap="truncate-end">{line.label}</Text>
            </Box>
            <Box width={11}>
              <Text>{cr(line.costCr)}</Text>
            </Box>
            <Box width={9}>
              <Text>{kg(line.weightKg)}</Text>
            </Box>
            {line.notes ? <Text dimColor>{line.notes}</Text> : null}
          </Box>
        ))}
        <Box marginTop={1}>
          <Box width={34}>
            <Text bold>TOTAL</Text>
          </Box>
          <Box width={11}>
            <Text bold>{cr(totals.costCr)}</Text>
          </Box>
          <Box width={9}>
            <Text bold>{kg(totals.weightKg)}</Text>
          </Box>
          <Text dimColor>magazine {cr(totals.magazineCr)}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Sources: {sources.join(', ')}</Text>
      </Box>
    </Box>
  );
}
