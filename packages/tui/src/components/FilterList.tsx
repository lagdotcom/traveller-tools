import { Box, Text } from 'ink';
import React from 'react';

export interface FilterItem {
  key: string;
  label: string;
}

/** Case-insensitive substring filter on item labels. */
export function filterByLabel<T extends FilterItem>(
  query: string,
  items: T[],
): T[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter((i) => i.label.toLowerCase().includes(q));
}

/**
 * A titled, scrolling, filterable single-column list (presentational). Input is
 * handled by the parent, which owns the query/index and which list has focus.
 */
export function FilterList({
  title,
  items,
  index,
  query,
  isActive,
  height,
  width,
  emptyText,
}: {
  title: string;
  items: FilterItem[];
  index: number;
  query: string;
  isActive: boolean;
  height: number;
  width: number;
  emptyText: string;
}): React.JSX.Element {
  const current = items.length
    ? Math.max(0, Math.min(index, items.length - 1))
    : 0;
  // Keep the current row inside a window of `height` rows.
  const start = Math.max(
    0,
    Math.min(
      current - Math.floor(height / 2),
      Math.max(0, items.length - height),
    ),
  );
  const visible = items.slice(start, start + height);
  const below = items.length - (start + visible.length);

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color={isActive ? 'cyan' : 'gray'}>
        {title} ({items.length})
      </Text>
      {/* The filter line shows on the focused pane (always rendered to keep the
          two panes vertically aligned). */}
      <Text dimColor wrap="truncate-end">
        {isActive ? `/${query}` : ' '}
      </Text>
      {start > 0 ? <Text dimColor>↑ {start} more</Text> : <Text> </Text>}
      {items.length === 0 ? (
        <Text dimColor>{emptyText}</Text>
      ) : (
        visible.map((it, i) => {
          const selected = start + i === current;
          return (
            <Text
              key={it.key}
              color={selected && isActive ? 'cyan' : undefined}
              dimColor={!selected}
              wrap="truncate-end"
            >
              {selected ? '› ' : '  '}
              {it.label}
            </Text>
          );
        })
      )}
      {below > 0 ? <Text dimColor>↓ {below} more</Text> : null}
    </Box>
  );
}
