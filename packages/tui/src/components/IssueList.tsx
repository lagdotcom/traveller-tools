import type { Issue } from '@traveller-tools/core';
import { Box, Text } from 'ink';
import React from 'react';

/** Builder-agnostic list of validation issues (red errors, yellow warnings). */
export function IssueList({ issues }: { issues: Issue[] }): React.JSX.Element {
  if (issues.length === 0) {
    return <Text color="green">✓ No issues</Text>;
  }
  return (
    <Box flexDirection="column">
      {issues.map((issue, index) => (
        <Text key={index} color={issue.severity === 'error' ? 'red' : 'yellow'}>
          {issue.severity === 'error' ? '✗' : '⚠'} {issue.message}
        </Text>
      ))}
    </Box>
  );
}
