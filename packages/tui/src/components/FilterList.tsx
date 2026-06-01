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
 * A titled, scrolling single-column list (presentational). The parent owns the
 * filter query and which row is active; `index` < 0 means no row is highlighted.
 */
export function FilterList({
  title,
  items,
  index,
  isActive,
  height,
  width,
  emptyText,
}: {
  title: string;
  items: FilterItem[];
  index: number;
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
      {start > 0 ? <Text dimColor>↑ {start} more</Text> : null}
      {items.length === 0 ? (
        <Text dimColor>{emptyText}</Text>
      ) : (
        visible.map((it, i) => {
          const selected = index >= 0 && start + i === current;
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
