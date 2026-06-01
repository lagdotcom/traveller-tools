import { Box, Text, useInput, useStdout } from 'ink';
import React, { useState } from 'react';

import { filterByLabel, FilterList } from './FilterList.js';

/** A library definition needs a name and (optionally) a description. */
interface Definition {
  name: string;
  description?: string;
}

/**
 * Library browser: built-ins stacked above saved designs (vertical split). One
 * filter narrows both lists at once and the cursor flows across them. ↑/↓ select,
 * Enter loads, Ctrl+O imports, Ctrl+X deletes a saved entry, Esc clears the
 * filter (or goes back when it's empty).
 */
export function LibraryBrowser<T extends Definition>({
  title,
  builtinTitle,
  builtins,
  saved,
  savedEmpty,
  message,
  onLoad,
  onDelete,
  onImport,
  onBack,
}: {
  title: string;
  builtinTitle: string;
  builtins: T[];
  saved: T[];
  savedEmpty: string;
  message?: string;
  onLoad: (def: T) => void;
  onDelete: (def: T) => void;
  onImport: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const fb = filterByLabel(
    query,
    builtins.map((def, i) => ({ key: `b${i}`, label: def.name, def })),
  );
  const fs = filterByLabel(
    query,
    saved.map((def, i) => ({ key: `s${i}`, label: def.name, def })),
  );
  const combined = [...fb, ...fs];
  const cur = combined.length
    ? Math.max(0, Math.min(index, combined.length - 1))
    : 0;
  const inSaved = cur >= fb.length;
  const selected = combined[cur];
  const selectedSaved = inSaved && selected !== undefined;

  useInput((input, key) => {
    if (key.escape) {
      if (query) {
        setQuery('');
        setIndex(0);
      } else onBack();
    } else if (key.upArrow) {
      setIndex(Math.max(0, cur - 1));
    } else if (key.downArrow) {
      setIndex(Math.min(combined.length - 1, cur + 1));
    } else if (key.return) {
      if (selected) onLoad(selected.def);
    } else if (key.ctrl && input === 'o') {
      onImport();
    } else if (key.ctrl && input === 'x') {
      if (selectedSaved) onDelete(selected.def);
    } else if (key.backspace || key.delete) {
      setQuery(query.slice(0, -1));
      setIndex(0);
    } else if (input && !key.ctrl && !key.meta) {
      const printable = input.replace(/[^\x20-\x7e]/g, '');
      if (printable) {
        setQuery(query + printable);
        setIndex(0);
      }
    }
  });

  const { stdout } = useStdout();
  const width = Math.max(20, (stdout?.columns ?? 80) - 2);

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        {title}
      </Text>
      <Text dimColor>Filter: {query || '—'}</Text>

      <Box marginTop={1} flexDirection="column">
        <FilterList
          title={builtinTitle}
          items={fb}
          index={inSaved ? -1 : cur}
          isActive={!inSaved}
          height={8}
          width={width}
          emptyText="(none)"
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <FilterList
          title="Saved"
          items={fs}
          index={inSaved ? cur - fb.length : -1}
          isActive={inSaved}
          height={6}
          width={width}
          emptyText={savedEmpty}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor wrap="truncate-end">
          {selected
            ? `${selected.def.name}${selected.def.description ? ` — ${selected.def.description}` : ''}`
            : ' '}
        </Text>
      </Box>

      {message ? (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ select · type to filter · Enter load · Ctrl+O import · Ctrl+X
          delete · Esc back
        </Text>
      </Box>
    </Box>
  );
}
