import { Box, Text } from 'ink';
import React from 'react';

/**
 * The rulebooks a design draws on, listed one per line. Shared by the ship and
 * weapon sheets (both evaluations satisfy core's `Evaluation` contract, which
 * carries `sources`). Renders nothing when there are no sources.
 */
export function SourcesPanel({
  sources,
}: {
  sources: string[];
}): React.JSX.Element | null {
  if (sources.length === 0) return null;
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold color="yellow">
        Sources
      </Text>
      {sources.map((s) => (
        <Text key={s} dimColor>
          {s}
        </Text>
      ))}
    </Box>
  );
}
