import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import { useFiles } from '../files.js';
import { Field } from './Field.js';

/**
 * Picker-based import shared by the libraries: use the native file picker when
 * available (web), otherwise fall back to a typed file path (terminal). `parse`
 * turns the file text into a design; `onLoad` receives it.
 */
export function useFileImport<T>(
  parse: (text: string) => T,
  onLoad: (def: T) => void,
) {
  const files = useFiles();
  const [mode, setMode] = useState<'idle' | 'path'>('idle');
  const [buffer, setBuffer] = useState('');
  const [message, setMessage] = useState('');

  const loadText = (text: string | null) => {
    if (text == null) {
      setMessage('Import cancelled.');
      return;
    }
    try {
      onLoad(parse(text));
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };

  const start = () => {
    setMessage('');
    if (files.pickFile) {
      files
        .pickFile()
        .then(loadText)
        .catch(() => setMessage('Import failed.'));
    } else if (files.readFile) {
      setBuffer('');
      setMode('path');
    } else {
      setMessage('Import is not available here.');
    }
  };

  const submitPath = () => {
    const path = buffer.trim();
    setMode('idle');
    setBuffer('');
    if (!path) return;
    const text = files.readFile ? files.readFile(path) : null;
    if (text == null) setMessage(`Couldn't read “${path}”.`);
    else loadText(text);
  };

  return {
    /** Whether the path prompt is showing (terminal fallback). */
    prompting: mode === 'path',
    message,
    start,
    /** Render this when `prompting` is true. */
    prompt: (title: string) => (
      <FilePathPrompt
        title={title}
        buffer={buffer}
        onChange={setBuffer}
        onSubmit={submitPath}
        onCancel={() => setMode('idle')}
      />
    ),
  };
}

function FilePathPrompt({
  title,
  buffer,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
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
        {title}
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
