import {
  BUILTIN_WEAPONS,
  parseWeapon,
  type WeaponDefinition,
} from '@traveller-tools/core';
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { Field } from '../components/Field.js';
import { LibraryBrowser } from '../components/LibraryBrowser.js';
import { useFiles } from '../files.js';
import { useWeaponStore } from '../storage.js';

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
  const [mode, setMode] = useState<'list' | 'import'>('list');
  const [importBuffer, setImportBuffer] = useState('');
  const [message, setMessage] = useState('');

  const saved = React.useMemo(
    () => store.list(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, savedVersion],
  );

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

  if (mode === 'import') {
    return (
      <ImportPrompt
        buffer={importBuffer}
        onChange={setImportBuffer}
        onSubmit={doImport}
        onCancel={() => setMode('list')}
      />
    );
  }

  return (
    <LibraryBrowser<WeaponDefinition>
      title="Weapon Library"
      builtinTitle="Field Catalogue"
      builtins={BUILTIN_WEAPONS}
      saved={saved}
      savedEmpty="(none — build one and Ctrl+S)"
      message={message}
      onLoad={onLoad}
      onImport={startImport}
      onDelete={(def) => {
        store.remove(def.name);
        setSavedVersion((v) => v + 1);
        setMessage(`Deleted “${def.name}”.`);
      }}
      onBack={onBack}
    />
  );
}

/** A file-path prompt for terminals without a native file picker. */
function ImportPrompt({
  buffer,
  onChange,
  onSubmit,
  onCancel,
}: {
  buffer: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Import Weapon
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Field
          label="File path"
          value={buffer}
          isActive
          onChange={onChange}
          onSubmit={onSubmit}
        />
        <Text dimColor>Enter to load · Esc to cancel</Text>
      </Box>
    </Box>
  );
}
