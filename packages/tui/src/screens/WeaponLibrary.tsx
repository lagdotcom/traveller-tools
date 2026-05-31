import {
  BUILTIN_WEAPONS,
  parseWeapon,
  type WeaponDefinition,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import { Field } from '../components/Field.js';
import { useFiles } from '../files.js';
import { useWeaponStore } from '../storage.js';

interface Entry {
  def: WeaponDefinition;
  saved: boolean;
}

/** Catalogue of the built-in (worked-example) weapons + your saved designs. */
export function WeaponLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: WeaponDefinition) => void;
}): React.JSX.Element {
  const files = useFiles();
  const store = useWeaponStore();
  const [savedVersion, setSavedVersion] = useState(0); // bump to re-read store
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'list' | 'import'>('list');
  const [importBuffer, setImportBuffer] = useState('');
  const [message, setMessage] = useState('');

  const builtinCount = BUILTIN_WEAPONS.length;
  const entries = useMemo<Entry[]>(() => {
    const builtins = BUILTIN_WEAPONS.map((def) => ({ def, saved: false }));
    const saved = store.list().map((def) => ({ def, saved: true }));
    return [...builtins, ...saved];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, savedVersion]);
  const safeActive = Math.max(0, Math.min(active, entries.length - 1));

  const loadFromText = (text: string | null) => {
    if (text == null) {
      setMessage('Import cancelled.');
      return;
    }
    try {
      onLoad(parseWeapon(text));
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };
  const startImport = () => {
    setMessage('');
    if (files.pickFile) {
      files
        .pickFile()
        .then(loadFromText)
        .catch(() => setMessage('Import failed.'));
    } else if (files.readFile) {
      setImportBuffer('');
      setMode('import');
    } else {
      setMessage('Import is not available here.');
    }
  };
  const doImport = () => {
    const path = importBuffer.trim();
    setMode('list');
    setImportBuffer('');
    if (!path) return;
    const text = files.readFile ? files.readFile(path) : null;
    if (text == null) setMessage(`Couldn't read “${path}”.`);
    else loadFromText(text);
  };

  useInput((input, key) => {
    if (mode === 'import') {
      if (key.escape) setMode('list');
      return;
    }
    if (key.escape) return onBack();
    if (key.upArrow) setActive((i) => Math.max(0, i - 1));
    else if (key.downArrow)
      setActive((i) => Math.min(entries.length - 1, i + 1));
    else if (key.return) {
      const entry = entries[safeActive];
      if (entry) onLoad(entry.def);
    } else if (input === 'i') startImport();
    else if (input === 'd') {
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
          Import Weapon
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Field
            label="File path"
            value={importBuffer}
            isActive
            onChange={setImportBuffer}
            onSubmit={doImport}
          />
          <Text dimColor>Enter to load · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Weapon Library
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">
          Field Catalogue examples
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
          <Text dimColor> (none yet — build a weapon and press Ctrl+S)</Text>
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
