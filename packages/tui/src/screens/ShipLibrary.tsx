import {
  BUILTIN_SHIPS,
  parseShip,
  type ShipDefinition,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { LibraryBrowser } from '../components/LibraryBrowser.js';
import { useShipStore } from '../storage.js';

export function ShipLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: ShipDefinition) => void;
}): React.JSX.Element {
  const store = useShipStore();
  const [savedVersion, setSavedVersion] = useState(0); // bump to re-read store
  const [mode, setMode] = useState<'list' | 'import'>('list');
  const [message, setMessage] = useState('');

  const saved = React.useMemo(
    () => store.list(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, savedVersion],
  );

  if (mode === 'import') {
    return (
      <ImportPrompt
        onLoad={(def) => {
          setMode('list');
          onLoad(def);
        }}
        onCancel={() => {
          setMode('list');
          setMessage('Import cancelled.');
        }}
      />
    );
  }

  return (
    <LibraryBrowser<ShipDefinition>
      title="Ship Library"
      builtinTitle="Built-in"
      builtins={BUILTIN_SHIPS}
      saved={saved}
      savedEmpty="(none — build one and Ctrl+S)"
      message={message}
      onLoad={onLoad}
      onImport={() => {
        setMessage('');
        setMode('import');
      }}
      onDelete={(def) => {
        store.remove(def.name);
        setSavedVersion((v) => v + 1);
        setMessage(`Deleted “${def.name}”.`);
      }}
      onBack={onBack}
    />
  );
}

/** Paste-to-import: accumulates pasted JSON and loads once it parses. */
function ImportPrompt({
  onLoad,
  onCancel,
}: {
  onLoad: (def: ShipDefinition) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [buffer, setBuffer] = useState('');
  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.backspace || key.delete) return setBuffer((b) => b.slice(0, -1));
    if (key.leftArrow || key.upArrow || key.downArrow || key.rightArrow) return;
    const next = buffer + (key.return ? '\n' : input);
    setBuffer(next);
    try {
      onLoad(parseShip(next));
    } catch {
      // keep collecting input until it parses
    }
  });
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Import Ship
      </Text>
      <Box marginTop={1}>
        <Text>Paste exported ship JSON. It loads once complete.</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{buffer.length} characters received…</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc to cancel</Text>
      </Box>
    </Box>
  );
}
