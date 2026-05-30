import type { CrewMember, LineItem } from '@traveller-tools/core';
import { Box, Text } from 'ink';
import React from 'react';

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

interface Row {
  name: string;
  tons: string;
  cost: string;
}

function SheetRow({
  row,
  bold,
  dim,
}: {
  row: Row;
  bold?: boolean;
  dim?: boolean;
}): React.JSX.Element {
  return (
    <Box>
      <Box width={32}>
        <Text bold={bold} dimColor={dim} wrap="truncate-end">
          {row.name}
        </Text>
      </Box>
      <Box width={13} justifyContent="flex-end">
        <Text bold={bold} dimColor={dim} wrap="truncate-end">
          {row.tons}
        </Text>
      </Box>
      <Box width={11} justifyContent="flex-end">
        <Text bold={bold} dimColor={dim} wrap="truncate-end">
          {row.cost}
        </Text>
      </Box>
    </Box>
  );
}

export interface ShipSheetProps {
  lineItems: LineItem[];
  totalTons: number;
  hullTons: number;
  totalCost: number;
  hullPoints: number;
  thrust: number;
  jump: number;
  cargoTons: number;
  powerRequirements: {
    basic: number;
    manoeuvre: number;
    jump: number;
    sensors: number;
    weapons: number;
    fuelProcessor: number;
  };
  crew: CrewMember[];
  runningCosts: {
    purchaseMCr: number;
    monthlyMaintenanceCr: number;
    monthlySalaryCr: number;
  };
}

/** A book-style ship sheet: component breakdown plus derived stats / power. */
export function ShipSheet(props: ShipSheetProps): React.JSX.Element {
  // Power draws, in book order; zero draws are omitted so the panel stays tight.
  const powerRows: [string, number][] = (
    [
      ['Basic', props.powerRequirements.basic],
      ['Manoeuvre', props.powerRequirements.manoeuvre],
      ['Jump', props.powerRequirements.jump],
      ['Sensors', props.powerRequirements.sensors],
      ['Weapons', props.powerRequirements.weapons],
      ['Fuel Processor', props.powerRequirements.fuelProcessor],
    ] as [string, number][]
  ).filter(([, value]) => value > 0);

  const componentRows: Row[] = props.lineItems.map((item) => {
    const tons = item.resources.tons ?? 0;
    const cost = item.resources.cost ?? 0;
    return {
      name: item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
      // Negative tons = space consumed; the hull "provides" tonnage, shown as —.
      tons: tons < 0 ? fmt(-tons) : '—',
      cost: cost > 0 ? fmt(cost) : '—',
    };
  });

  return (
    <Box flexDirection="row" gap={4}>
      <Box flexDirection="column">
        <SheetRow row={{ name: 'COMPONENT', tons: 'TONS', cost: 'MCr' }} bold />
        {componentRows.map((row, i) => (
          <SheetRow key={i} row={row} />
        ))}
        <SheetRow
          row={{ name: 'Cargo', tons: fmt(props.cargoTons), cost: '—' }}
          dim
        />
        <SheetRow
          row={{
            name: 'TOTAL',
            tons: `${fmt(props.totalTons)}/${fmt(props.hullTons)}`,
            cost: fmt(props.totalCost),
          }}
          bold
        />
      </Box>

      <Box flexDirection="column">
        <Text bold color="yellow">
          Hull: {props.hullPoints}
        </Text>
        <Text>
          Thrust <Text color="cyan">{props.thrust}</Text>
        </Text>
        <Text>
          Jump <Text color="cyan">{props.jump}</Text>
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">
            Power
          </Text>
          {powerRows.map(([label, value]) => (
            <Text key={label}>
              {label} {fmt(value)}
            </Text>
          ))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">
            Crew
          </Text>
          {props.crew.map((member) => (
            <Text key={member.role}>
              {member.role}
              {member.count > 1 ? ` ×${member.count}` : ''}
            </Text>
          ))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">
            Running costs
          </Text>
          <Text>Buy MCr{fmt(props.runningCosts.purchaseMCr)}</Text>
          <Text>
            Maint Cr{Math.round(props.runningCosts.monthlyMaintenanceCr)}/mo
          </Text>
          <Text>Pay Cr{Math.round(props.runningCosts.monthlySalaryCr)}/mo</Text>
        </Box>
      </Box>
    </Box>
  );
}
