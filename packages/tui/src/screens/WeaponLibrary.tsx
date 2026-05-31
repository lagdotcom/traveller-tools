import {
  BUILTIN_WEAPONS,
  parseWeapon,
  type WeaponDefinition,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { Field } from '../components/Field.js';
import { useFiles } from '../files.js';

/** Read-only catalogue of the built-in (worked-example) weapons, plus import. */
export function WeaponLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: WeaponDefinition) => void;
}): React.JSX.Element {
  const files = useFiles();
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<'list' | 'import'>('list');
  const [importBuffer, setImportBuffer] = useState('');
  const [message, setMessage] = useState('');

  const entries = BUILTIN_WEAPONS;
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
      if (entry) onLoad(entry);
    } else if (input === 'i') startImport();
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
        {entries.map((entry, i) => (
          <Box key={entry.name}>
            <Text
              color={i === safeActive ? 'cyan' : undefined}
              bold={i === safeActive}
            >
              {i === safeActive ? '› ' : '  '}
              {entry.name}
            </Text>
            {entry.description ? (
              <Text dimColor> — {entry.description}</Text>
            ) : null}
          </Box>
        ))}
      </Box>

      {message ? (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>↑/↓ select · Enter load · i import · Esc menu</Text>
      </Box>
    </Box>
  );
}
