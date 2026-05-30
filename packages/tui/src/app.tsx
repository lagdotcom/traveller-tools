import { Select } from '@inkjs/ui';
import type { ShipDefinition } from '@traveller-tools/core';
import { Box, Text, useApp, useInput } from 'ink';
import React, { useState } from 'react';

import { JumpFuelScreen } from './screens/JumpFuel.js';
import { ShipBuilderScreen } from './screens/ShipBuilder.js';
import { ShipLibraryScreen } from './screens/ShipLibrary.js';
import { TravelScreen } from './screens/Travel.js';

type Screen = 'menu' | 'jump' | 'travel' | 'ship' | 'library';

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  // The ship currently loaded into the builder (from the library or an import).
  // `loadSeq` bumps on every load so the builder remounts with fresh state.
  const [loaded, setLoaded] = useState<ShipDefinition | undefined>(undefined);
  const [loadSeq, setLoadSeq] = useState(0);
  const { exit } = useApp();

  const load = (def: ShipDefinition | undefined) => {
    setLoaded(def);
    setLoadSeq((n) => n + 1);
    setScreen('ship');
  };

  useInput((_input, key) => {
    if (screen === 'menu' && key.escape) exit();
  });

  if (screen === 'jump') {
    return <JumpFuelScreen onBack={() => setScreen('menu')} />;
  }
  if (screen === 'travel') {
    return <TravelScreen onBack={() => setScreen('menu')} />;
  }
  if (screen === 'library') {
    return <ShipLibraryScreen onBack={() => setScreen('menu')} onLoad={load} />;
  }
  if (screen === 'ship') {
    return (
      <ShipBuilderScreen
        key={loadSeq}
        initial={loaded}
        onBack={() => setScreen('menu')}
        onLoad={load}
      />
    );
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
          { label: 'Ship builder', value: 'ship-new' },
          { label: 'Ship library', value: 'library' },
          { label: 'Quit', value: 'quit' },
        ]}
        onChange={(value) => {
          if (value === 'quit') exit();
          else if (value === 'ship-new') load(undefined);
          else setScreen(value as Screen);
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>↑/↓ to move · Enter to select · Esc to quit</Text>
      </Box>
    </Box>
  );
}
