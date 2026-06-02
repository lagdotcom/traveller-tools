import { WEAPON_TRAITS, type WeaponTraitDef } from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

/** A read-only glossary of the Field Catalogue weapon traits. */
export function WeaponTraitsScreen({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const [active, setActive] = useState(0);
  const safeActive = Math.max(0, Math.min(active, WEAPON_TRAITS.length - 1));
  const trait = WEAPON_TRAITS[safeActive]!;

  useInput((_input, key) => {
    if (key.escape) onBack();
    else if (key.upArrow) setActive((i) => Math.max(0, i - 1));
    else if (key.downArrow)
      setActive((i) => Math.min(WEAPON_TRAITS.length - 1, i + 1));
  });

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Weapon Traits
      </Text>

      <Box marginTop={1} flexDirection="row" gap={4}>
        <Box flexDirection="column">
          {WEAPON_TRAITS.map((t, i) => (
            <Text
              key={t.key}
              color={i === safeActive ? 'cyan' : undefined}
              bold={i === safeActive}
            >
              {i === safeActive ? '› ' : '  '}
              {t.label}
            </Text>
          ))}
        </Box>

        <TraitDetail trait={trait} />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ browse · Esc menu</Text>
      </Box>
    </Box>
  );
}

function TraitDetail({ trait }: { trait: WeaponTraitDef }): React.JSX.Element {
  return (
    <Box flexDirection="column" width={52}>
      <Text bold>
        {trait.label} <Text dimColor>— {trait.source}</Text>
      </Text>
      <Box marginTop={1}>
        <Text wrap="wrap">{trait.description}</Text>
      </Box>
      {trait.table ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            {trait.table.columns[0]} · {trait.table.columns[1]}
          </Text>
          {trait.table.rows.map(([k, v]) => (
            <Box key={k}>
              <Box width={10}>
                <Text color="green">{k}</Text>
              </Box>
              <Box width={42}>
                <Text wrap="wrap">{v}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
