import { Select } from '@inkjs/ui';
import type { ShipDefinition, WeaponDefinition } from '@traveller-tools/core';
import { Box, Text, useApp, useInput } from 'ink';
import React, { useState } from 'react';

import { JumpFuelScreen } from './screens/JumpFuel.js';
import { ShipBuilderScreen } from './screens/ShipBuilder.js';
import { ShipLibraryScreen } from './screens/ShipLibrary.js';
import { TravelScreen } from './screens/Travel.js';
import { VehicleCatalogScreen } from './screens/VehicleCatalog.js';
import { WeaponBuilderScreen } from './screens/WeaponBuilder.js';
import { WeaponLibraryScreen } from './screens/WeaponLibrary.js';

type Screen =
  | 'menu'
  | 'jump'
  | 'travel'
  | 'ship'
  | 'library'
  | 'vehicles'
  | 'weapon'
  | 'weaponLibrary';

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  // The ship currently loaded into the builder (from the library or an import).
  // `loadSeq` bumps on every load so the builder remounts with fresh state.
  const [loaded, setLoaded] = useState<ShipDefinition | undefined>(undefined);
  const [loadSeq, setLoadSeq] = useState(0);
  // The weapon currently loaded into the weapon builder (same remount trick).
  const [loadedWeapon, setLoadedWeapon] = useState<
    WeaponDefinition | undefined
  >(undefined);
  const [weaponSeq, setWeaponSeq] = useState(0);
  const { exit } = useApp();

  const load = (def: ShipDefinition | undefined) => {
    setLoaded(def);
    setLoadSeq((n) => n + 1);
    setScreen('ship');
  };

  const loadWeapon = (def: WeaponDefinition | undefined) => {
    setLoadedWeapon(def);
    setWeaponSeq((n) => n + 1);
    setScreen('weapon');
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
  if (screen === 'vehicles') {
    return <VehicleCatalogScreen onBack={() => setScreen('menu')} />;
  }
  if (screen === 'weaponLibrary') {
    return (
      <WeaponLibraryScreen
        onBack={() => setScreen('menu')}
        onLoad={loadWeapon}
      />
    );
  }
  if (screen === 'weapon') {
    return (
      <WeaponBuilderScreen
        key={weaponSeq}
        initial={loadedWeapon}
        onBack={() => setScreen('menu')}
        onLoad={loadWeapon}
      />
    );
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
        visibleOptionCount={8}
        options={[
          { label: 'Jump & Fuel calculator', value: 'jump' },
          { label: 'Travel time (velocity) calculator', value: 'travel' },
          { label: 'Ship builder', value: 'ship-new' },
          { label: 'Ship library', value: 'library' },
          { label: 'Weapon builder', value: 'weapon-new' },
          { label: 'Weapon library', value: 'weaponLibrary' },
          { label: 'Vehicle catalogue', value: 'vehicles' },
          { label: 'Quit', value: 'quit' },
        ]}
        onChange={(value) => {
          if (value === 'quit') exit();
          else if (value === 'ship-new') load(undefined);
          else if (value === 'weapon-new') loadWeapon(undefined);
          else setScreen(value as Screen);
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>↑/↓ to move · Enter to select · Esc to quit</Text>
      </Box>
    </Box>
  );
}
