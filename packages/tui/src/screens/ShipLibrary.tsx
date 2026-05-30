import {
  BUILTIN_SHIPS,
  parseShip,
  type ShipDefinition,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import { useStore } from '../storage.js';

interface Entry {
  def: ShipDefinition;
  saved: boolean;
}

export function ShipLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: ShipDefinition) => void;
}): React.JSX.Element {
  const store = useStore();
  const [savedVersion, setSavedVersion] = useState(0); // bump to re-read store
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'list' | 'import'>('list');
  const [buffer, setBuffer] = useState('');
  const [message, setMessage] = useState('');

  const entries = useMemo<Entry[]>(() => {
    const builtins = BUILTIN_SHIPS.map((def) => ({ def, saved: false }));
    const saved = store.list().map((def) => ({ def, saved: true }));
    return [...builtins, ...saved];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, savedVersion]);

  const safeActive = Math.max(0, Math.min(active, entries.length - 1));

  useInput((input, key) => {
    if (mode === 'import') {
      if (key.escape) {
        setMode('list');
        setBuffer('');
        setMessage('Import cancelled.');
        return;
      }
      if (key.backspace || key.delete) {
        setBuffer((b) => b.slice(0, -1));
        return;
      }
      // Ignore navigation keys; accumulate everything else (paste arrives here
      // as one burst). Try to parse on each change and accept once it's valid.
      if (key.leftArrow || key.upArrow || key.downArrow || key.rightArrow)
        return;
      const next = buffer + (key.return ? '\n' : input);
      setBuffer(next);
      try {
        const def = parseShip(next);
        setMode('list');
        setBuffer('');
        onLoad(def);
      } catch {
        // keep collecting input until it parses
      }
      return;
    }

    if (key.escape) return onBack();
    if (key.upArrow) setActive((i) => Math.max(0, i - 1));
    else if (key.downArrow)
      setActive((i) => Math.min(entries.length - 1, i + 1));
    else if (key.return) {
      const entry = entries[safeActive];
      if (entry) onLoad(entry.def);
    } else if (input === 'i') {
      setMode('import');
      setBuffer('');
      setMessage('');
    } else if (input === 'd') {
      const entry = entries[safeActive];
      if (entry?.saved) {
        store.remove(entry.def.name);
        setSavedVersion((v) => v + 1);
        setActive((i) => Math.max(0, i - 1));
        setMessage(`Deleted “${entry.def.name}”.`);
      }
    }
  });

  if (mode === 'import') {
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

  const builtinCount = BUILTIN_SHIPS.length;
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Ship Library
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">
          Built-in
        </Text>
        {entries.slice(0, builtinCount).map((entry, i) => (
          <LibraryRow
            key={`b-${entry.def.name}`}
            entry={entry}
            active={i === safeActive}
          />
        ))}

        <Box marginTop={1}>
          <Text bold color="cyan">
            Saved
          </Text>
        </Box>
        {entries.length === builtinCount ? (
          <Text dimColor> (none yet — build a ship and press Ctrl+S)</Text>
        ) : (
          entries
            .slice(builtinCount)
            .map((entry, i) => (
              <LibraryRow
                key={`s-${entry.def.name}`}
                entry={entry}
                active={builtinCount + i === safeActive}
              />
            ))
        )}
      </Box>

      {message ? (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ select · Enter load · i import · d delete (saved) · Esc menu
        </Text>
      </Box>
    </Box>
  );
}

function LibraryRow({
  entry,
  active,
}: {
  entry: Entry;
  active: boolean;
}): React.JSX.Element {
  return (
    <Box>
      <Text color={active ? 'cyan' : undefined} bold={active}>
        {active ? '› ' : '  '}
        {entry.def.name}
      </Text>
      {entry.def.description ? (
        <Text dimColor> — {entry.def.description}</Text>
      ) : null}
    </Box>
  );
}
