import { VEHICLE_CATALOG, type VehicleDefinition } from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** A read-only browser for the Core Rulebook's pre-made vehicles. */
export function VehicleCatalogScreen({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const [active, setActive] = useState(0);
  const safeActive = Math.max(0, Math.min(active, VEHICLE_CATALOG.length - 1));
  const vehicle = VEHICLE_CATALOG[safeActive]!;

  useInput((_input, key) => {
    if (key.escape) onBack();
    else if (key.upArrow) setActive((i) => Math.max(0, i - 1));
    else if (key.downArrow)
      setActive((i) => Math.min(VEHICLE_CATALOG.length - 1, i + 1));
  });

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Vehicle Catalogue
      </Text>

      <Box marginTop={1} flexDirection="row" gap={4}>
        <Box flexDirection="column">
          {VEHICLE_CATALOG.map((v, i) => (
            <Text
              key={v.name}
              color={i === safeActive ? 'cyan' : undefined}
              bold={i === safeActive}
            >
              {i === safeActive ? '› ' : '  '}
              {v.name}
            </Text>
          ))}
        </Box>

        <VehicleStats vehicle={vehicle} />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ browse · Esc menu</Text>
      </Box>
    </Box>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <Box>
      <Box width={12}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text>{value}</Text>
    </Box>
  );
}

function VehicleStats({
  vehicle: v,
}: {
  vehicle: VehicleDefinition;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>
        {v.name} <Text dimColor>— TL{v.tl}</Text>
      </Text>
      <Box marginBottom={1}>
        <Text dimColor wrap="wrap">
          {v.description}
        </Text>
      </Box>
      <StatRow label="Skill" value={v.skill} />
      <StatRow
        label="Agility"
        value={(v.agility >= 0 ? '+' : '') + v.agility}
      />
      <StatRow label="Speed" value={v.speed} />
      <StatRow label="Range" value={v.range} />
      <StatRow label="Crew" value={String(v.crew)} />
      <StatRow label="Passengers" value={String(v.passengers)} />
      <StatRow label="Cargo" value={`${fmt(v.cargoTons)} tons`} />
      <StatRow label="Hull" value={String(v.hull)} />
      <StatRow
        label="Armour"
        value={`${v.armour.front}/${v.armour.sides}/${v.armour.rear} (F/S/R)`}
      />
      {v.weapons ? <StatRow label="Weapons" value={v.weapons} /> : null}
      <StatRow label="Shipping" value={`${fmt(v.shippingTons)} tons`} />
      <StatRow label="Cost" value={`MCr${fmt(v.costMCr)}`} />
    </Box>
  );
}
