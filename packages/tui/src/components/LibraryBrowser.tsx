import { Box, Text, useInput, useStdout } from 'ink';
import React, { useState } from 'react';

import { filterByLabel, FilterList } from './FilterList.js';

/** A library definition needs a name and (optionally) a description. */
interface Definition {
  name: string;
  description?: string;
}

/**
 * Two-pane library browser: built-ins on the left, saved designs on the right.
 * Each pane scrolls and filters as you type (like a select field). Tab switches
 * panes, Enter loads, Ctrl+O imports, Ctrl+X deletes a saved entry, Esc clears
 * the filter (or goes back when it's empty).
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
  const [pane, setPane] = useState<0 | 1>(0);
  const [queries, setQueries] = useState<[string, string]>(['', '']);
  const [indices, setIndices] = useState<[number, number]>([0, 0]);

  const lists = [
    builtins.map((def, i) => ({ key: `b${i}`, label: def.name, def })),
    saved.map((def, i) => ({ key: `s${i}`, label: def.name, def })),
  ];
  const filtered = [
    filterByLabel(queries[0], lists[0]!),
    filterByLabel(queries[1], lists[1]!),
  ];

  const active = filtered[pane]!;
  const cur = active.length
    ? Math.max(0, Math.min(indices[pane], active.length - 1))
    : 0;
  const selected = active[cur]?.def;

  const setQuery = (p: 0 | 1, q: string) =>
    setQueries((qs) => (p === 0 ? [q, qs[1]] : [qs[0], q]));
  const setIndex = (p: 0 | 1, i: number) =>
    setIndices((is) => (p === 0 ? [i, is[1]] : [is[0], i]));

  useInput((input, key) => {
    const q = queries[pane];
    if (key.escape) {
      if (q) {
        setQuery(pane, '');
        setIndex(pane, 0);
      } else onBack();
    } else if (key.tab) {
      setPane((p) => (p === 0 ? 1 : 0));
    } else if (key.upArrow) {
      setIndex(pane, Math.max(0, cur - 1));
    } else if (key.downArrow) {
      setIndex(pane, Math.min(active.length - 1, cur + 1));
    } else if (key.return) {
      if (selected) onLoad(selected);
    } else if (key.ctrl && input === 'o') {
      onImport();
    } else if (key.ctrl && input === 'x') {
      if (pane === 1 && selected) onDelete(selected);
    } else if (key.backspace || key.delete) {
      setQuery(pane, q.slice(0, -1));
      setIndex(pane, 0);
    } else if (input && !key.ctrl && !key.meta) {
      const printable = input.replace(/[^\x20-\x7e]/g, '');
      if (printable) {
        setQuery(pane, q + printable);
        setIndex(pane, 0);
      }
    }
  });

  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const paneWidth = Math.max(16, Math.floor((cols - 6) / 2));
  const HEIGHT = 10;

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        {title}
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <FilterList
          title={builtinTitle}
          items={filtered[0]!}
          index={indices[0]}
          query={queries[0]}
          isActive={pane === 0}
          height={HEIGHT}
          width={paneWidth}
          emptyText="(none)"
        />
        <FilterList
          title="Saved"
          items={filtered[1]!}
          index={indices[1]}
          query={queries[1]}
          isActive={pane === 1}
          height={HEIGHT}
          width={paneWidth}
          emptyText={savedEmpty}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor wrap="truncate-end">
          {selected
            ? `${selected.name}${selected.description ? ` — ${selected.description}` : ''}`
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
          Tab pane · ↑/↓ select · type to filter · Enter load · Ctrl+O import ·
          Ctrl+X delete · Esc back
        </Text>
      </Box>
    </Box>
  );
}
