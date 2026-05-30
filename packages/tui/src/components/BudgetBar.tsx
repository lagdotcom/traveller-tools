import type { ResourceUsage } from '@traveller-tools/core';
import { Box, Text } from 'ink';
import React from 'react';

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A compact, builder-agnostic budget header: `capacity` resources show
 * used/provided (red when over), `accumulate` resources show the running total.
 * Reused by every builder.
 */
export function BudgetBar({
  resources,
}: {
  resources: ResourceUsage[];
}): React.JSX.Element {
  return (
    <Box>
      {resources.map((r) => (
        <Box key={r.key} marginRight={3}>
          {r.mode === 'capacity' ? (
            <Text color={r.overCapacity ? 'red' : 'green'}>
              {r.label} {round(r.used)}/{round(r.provided)}
            </Text>
          ) : (
            <Text color="cyan">
              {r.label} {round(r.used)}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
