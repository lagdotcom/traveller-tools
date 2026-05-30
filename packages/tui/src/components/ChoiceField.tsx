import { Box, Text, useInput } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ChoiceFieldProps {
  label: string;
  value: string;
  options: string[];
  /** Whether this field currently has focus. */
  isActive: boolean;
  onChange: (value: string) => void;
  /** Called when the user presses Enter; advance to the next field. */
  onSubmit: () => void;
}

const sortOptions = (options: string[]): string[] =>
  [...options].sort((a, b) => a.localeCompare(b));

/** Options matching a query (case-insensitive substring), in sorted order. */
function filterOptions(query: string, options: string[]): string[] {
  const sorted = sortOptions(options);
  if (!query) return sorted;
  const q = query.toLowerCase();
  return sorted.filter((o) => o.toLowerCase().includes(q));
}

/** Best option for a typed query (exact > prefix > substring). */
function matchOption(query: string, options: string[]): string | undefined {
  if (!query) return undefined;
  const q = query.toLowerCase();
  return (
    options.find((o) => o.toLowerCase() === q) ??
    options.find((o) => o.toLowerCase().startsWith(q)) ??
    options.find((o) => o.toLowerCase().includes(q))
  );
}

/**
 * A labelled picker. Left/Right cycle the (sorted) options; typing filters the
 * list to matching options and jumps to the closest one; Enter advances. A
 * short scrolling window of the filtered options shows, current one highlighted.
 *
 * The key handler is stable (reads latest props/query from a ref) so Ink's
 * useInput doesn't re-subscribe every render and churn its raw-mode effect.
 */
export function ChoiceField(props: ChoiceFieldProps): React.JSX.Element {
  const { label, value, options, isActive } = props;
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!isActive) setQuery('');
  }, [isActive]);

  const ref = useRef({ props, query });
  ref.current = { props, query };

  const handle = useCallback((input: string, key: { [k: string]: boolean }) => {
    const { props: p, query: q } = ref.current;
    if (key.leftArrow || key.rightArrow) {
      // Arrows cycle the full sorted list (and clear any filter).
      setQuery('');
      const sorted = sortOptions(p.options);
      const index = Math.max(0, sorted.indexOf(p.value));
      const delta = key.leftArrow ? -1 : 1;
      p.onChange(sorted[(index + delta + sorted.length) % sorted.length]!);
    } else if (key.return) {
      setQuery('');
      p.onSubmit();
    } else if (key.backspace || key.delete) {
      const next = q.slice(0, -1);
      setQuery(next);
      const m = matchOption(next, sortOptions(p.options));
      if (m) p.onChange(m);
    } else if (input && !key.ctrl && !key.meta && !key.tab) {
      const printable = input.replace(/[^\x20-\x7e]/g, '');
      if (!printable) return;
      const next = q + printable;
      setQuery(next);
      const m = matchOption(next, sortOptions(p.options));
      if (m) p.onChange(m);
    }
  }, []);
  useInput(handle, { isActive });

  // Short, vertical, scrolling window of the (filtered) options around the
  // current one — a single horizontal row wraps badly with many/long choices.
  const WINDOW = 6;
  const list = filterOptions(query, options);
  const currentIndex = Math.max(0, list.indexOf(value));
  const start = Math.max(
    0,
    Math.min(
      currentIndex - Math.floor(WINDOW / 2),
      Math.max(0, list.length - WINDOW),
    ),
  );
  const visible = list.slice(start, start + WINDOW);
  const hiddenAbove = start;
  const hiddenBelow = list.length - (start + visible.length);

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={24}>
          <Text color={isActive ? 'cyan' : 'gray'}>
            {isActive ? '› ' : '  '}
            {label}
          </Text>
        </Box>
        <Box>
          <Text color={isActive ? 'cyan' : undefined}>
            {value}
            {isActive && query ? ` (${query})` : ''}
          </Text>
        </Box>
      </Box>
      {isActive && (
        <Box marginLeft={24} flexDirection="column">
          {list.length === 0 && <Text dimColor>(no matches)</Text>}
          {hiddenAbove > 0 && <Text dimColor>↑ {hiddenAbove} more</Text>}
          {visible.map((option) => (
            <Box key={option} width={40}>
              <Text
                color={option === value ? 'cyan' : undefined}
                dimColor={option !== value}
                wrap="truncate-end"
              >
                {option === value ? '› ' : '  '}
                {option}
              </Text>
            </Box>
          ))}
          {hiddenBelow > 0 && <Text dimColor>↓ {hiddenBelow} more</Text>}
          <Text dimColor>←/→ cycle · type to filter</Text>
        </Box>
      )}
    </Box>
  );
}
