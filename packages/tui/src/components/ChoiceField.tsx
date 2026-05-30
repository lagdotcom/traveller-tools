import { Box, Text, useInput } from 'ink';
import React, { useEffect, useState } from 'react';

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

/** First option matching a typed query (exact > prefix > substring). */
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
 * A labelled picker. Left/Right cycle the options (one keypress to toggle
 * yes/no); typing jumps to the closest matching option (no need to clear the
 * field first); Enter advances. A filtered list shows the options with the
 * current one highlighted.
 */
export function ChoiceField({
  label,
  value,
  options,
  isActive,
  onChange,
  onSubmit,
}: ChoiceFieldProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!isActive) setQuery('');
  }, [isActive]);

  const index = Math.max(0, options.indexOf(value));
  const cycle = (delta: number) => {
    setQuery('');
    onChange(options[(index + delta + options.length) % options.length]!);
  };

  useInput(
    (input, key) => {
      if (key.leftArrow) cycle(-1);
      else if (key.rightArrow) cycle(1);
      else if (key.return) {
        setQuery('');
        onSubmit();
      } else if (key.backspace || key.delete) {
        const q = query.slice(0, -1);
        setQuery(q);
        const m = matchOption(q, options);
        if (m) onChange(m);
      } else if (input && !key.ctrl && !key.meta && !key.tab) {
        const printable = input.replace(/[^\x20-\x7e]/g, '');
        if (!printable) return;
        const q = query + printable;
        setQuery(q);
        const m = matchOption(q, options);
        if (m) onChange(m);
      }
    },
    { isActive },
  );

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
        <Box marginLeft={24}>
          {options.map((option) => (
            <Box key={option} marginRight={2}>
              <Text
                color={option === value ? 'cyan' : undefined}
                dimColor={option !== value}
              >
                {option}
              </Text>
            </Box>
          ))}
          <Text dimColor>←/→</Text>
        </Box>
      )}
    </Box>
  );
}
