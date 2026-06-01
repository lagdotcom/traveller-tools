import {
  formatDamage,
  type WeaponEvaluation,
  type WeaponProfile,
} from '@traveller-tools/core';
import { Box, Text, useStdout } from 'ink';
import React from 'react';

/** Format the trait map the way the book lists them: `Auto 3, Lo-Pen 2`. */
function formatTraits(profile: WeaponProfile): string {
  const parts = Object.entries(profile.traits)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k} ${v}`))
    .sort((a, b) => a.localeCompare(b));
  return parts.length ? parts.join(', ') : '—';
}

// Credit values: integers above 1000 (no thousands separators), 2 d.p. below.
const cr = (n: number): string =>
  n >= 1000 ? `Cr${Math.round(n)}` : `Cr${Math.round(n * 100) / 100}`;
const kg = (n: number): string => `${Math.round(n * 1000) / 1000}kg`;

/** The headline stat lines for one weapon profile (primary or secondary). */
function ProfileBlock({
  profile,
}: {
  profile: WeaponProfile;
}): React.JSX.Element {
  const sig = `${profile.signatureKind === 'emissions' ? 'Emissions' : 'Physical'} (${profile.signature})`;
  return (
    <>
      <Box flexWrap="wrap">
        <Text>Range {profile.range}m </Text>
        <Text dimColor>· </Text>
        <Text>Damage {formatDamage(profile.damage)} </Text>
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
        {profile.heat > 0 ? (
          <Text dimColor>
            · Heat {profile.heat}/rd (−{profile.heatDissipation ?? 0} idle,
            overheat {profile.heatThreshold ?? 0})
          </Text>
        ) : null}
      </Box>
      <Text>
        <Text dimColor>Traits: </Text>
        {formatTraits(profile)}
      </Text>
    </>
  );
}

/** A book-style weapon profile + cost/weight breakdown panel. */
export function WeaponSheet({
  evaluation,
}: {
  evaluation: WeaponEvaluation;
}): React.JSX.Element {
  const { profile, breakdown, totals, sources } = evaluation;

  // Fill the terminal width: the cost/weight/notes columns are fixed, the label
  // column takes the rest (accounting for the round border + padding).
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const COST_W = 11;
  const WEIGHT_W = 10;
  const NOTES_W = 18;
  const labelWidth = Math.max(
    20,
    columns - 4 - COST_W - WEIGHT_W - NOTES_W, // 4 = border (2) + paddingX (2)
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      width={columns}
    >
      <Text bold color="yellow">
        Profile — TL{profile.tl}
      </Text>
      <ProfileBlock profile={profile} />

      {evaluation.secondary ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            Secondary — {evaluation.secondary.label}
          </Text>
          <ProfileBlock profile={evaluation.secondary.profile} />
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        <Text bold>Components</Text>
        {breakdown.map((line, i) => (
          <Box key={i}>
            <Box width={labelWidth}>
              <Text wrap="truncate-end">{line.label}</Text>
            </Box>
            <Box width={COST_W} justifyContent="flex-end">
              <Text>{line.costMod ?? cr(line.costCr)}</Text>
            </Box>
            <Box width={WEIGHT_W} justifyContent="flex-end">
              <Text>{line.weightMod ?? kg(line.weightKg)}</Text>
            </Box>
            <Box width={NOTES_W} paddingLeft={1}>
              <Text dimColor wrap="truncate-end">
                {line.notes ?? ''}
              </Text>
            </Box>
          </Box>
        ))}
        <Box marginTop={1}>
          <Box width={labelWidth}>
            <Text bold>TOTAL</Text>
          </Box>
          <Box width={COST_W} justifyContent="flex-end">
            <Text bold>{cr(totals.costCr)}</Text>
          </Box>
          <Box width={WEIGHT_W} justifyContent="flex-end">
            <Text bold>{kg(totals.weightKg)}</Text>
          </Box>
          <Box width={NOTES_W} paddingLeft={1}>
            <Text dimColor>magazine {cr(totals.magazineCr)}</Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Sources: {sources.join(', ')}</Text>
      </Box>
    </Box>
  );
}
