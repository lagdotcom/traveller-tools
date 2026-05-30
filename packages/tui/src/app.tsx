import { Select } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import React, { useState } from 'react';

import { JumpFuelScreen } from './screens/JumpFuel.js';
import { TravelScreen } from './screens/Travel.js';

type Screen = 'menu' | 'jump' | 'travel';

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const { exit } = useApp();

  useInput((_input, key) => {
    if (screen === 'menu' && key.escape) exit();
  });

  if (screen === 'jump') {
    return <JumpFuelScreen onBack={() => setScreen('menu')} />;
  }
  if (screen === 'travel') {
    return <TravelScreen onBack={() => setScreen('menu')} />;
  }

  return (
    <Box flexDirection="column">
      <Text bold color="magenta">
        ╭─ Traveller Tools ─ MgT2 ─╮
      </Text>
      <Box marginTop={1} marginBottom={1}>
        <Text>Select a tool:</Text>
      </Box>
      <Select
        options={[
          { label: 'Jump & Fuel calculator', value: 'jump' },
          { label: 'Travel time (velocity) calculator', value: 'travel' },
          { label: 'Quit', value: 'quit' },
        ]}
        onChange={(value) => {
          if (value === 'quit') exit();
          else setScreen(value as Screen);
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>↑/↓ to move · Enter to select · Esc to quit</Text>
      </Box>
    </Box>
  );
}
