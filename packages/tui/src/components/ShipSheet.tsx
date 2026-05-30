import type { LineItem } from '@traveller-tools/core';
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
      <Box width={26}>
        <Text bold={bold} dimColor={dim}>
          {row.name}
        </Text>
      </Box>
      <Box width={8} justifyContent="flex-end">
        <Text bold={bold} dimColor={dim}>
          {row.tons}
        </Text>
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text bold={bold} dimColor={dim}>
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
  powerRequirements: { basic: number; manoeuvre: number; jump: number };
}

/** A book-style ship sheet: component breakdown plus derived stats / power. */
export function ShipSheet(props: ShipSheetProps): React.JSX.Element {
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
          <Text>Basic {fmt(props.powerRequirements.basic)}</Text>
          <Text>Manoeuvre {fmt(props.powerRequirements.manoeuvre)}</Text>
          <Text>Jump {fmt(props.powerRequirements.jump)}</Text>
        </Box>
      </Box>
    </Box>
  );
}
