import { TextInput } from '@inkjs/ui';
import { Box, Text } from 'ink';
import React from 'react';

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

/** Resolve typed text to the best matching option (exact > prefix > substring). */
export function closestOption(value: string, options: string[]): string {
  const v = value.trim().toLowerCase();
  if (!v) return options[0] ?? value;
  return (
    options.find((o) => o.toLowerCase() === v) ??
    options.find((o) => o.toLowerCase().startsWith(v)) ??
    options.find((o) => o.toLowerCase().includes(v)) ??
    value
  );
}

/**
 * A labelled choice input. While focused it uses @inkjs/ui's autocomplete
 * (inline closest-match ghost text + Tab/Enter to complete), shows a filtered
 * list of matching options with the best one highlighted, and snaps the value
 * to a canonical option on submit.
 */
export function ChoiceField({
  label,
  value,
  options,
  isActive,
  onChange,
  onSubmit,
}: ChoiceFieldProps): React.JSX.Element {
  const query = value.trim().toLowerCase();
  const matches = options.filter((o) => o.toLowerCase().includes(query));
  const visible = matches.length > 0 ? matches : options;
  const best = closestOption(value, options);

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
          {isActive ? (
            <TextInput
              defaultValue={value}
              suggestions={options}
              onChange={onChange}
              onSubmit={(submitted) => {
                onChange(closestOption(submitted, options));
                onSubmit();
              }}
            />
          ) : (
            <Text>{value}</Text>
          )}
        </Box>
      </Box>
      {isActive && (
        <Box marginLeft={24}>
          {visible.map((option) => (
            <Box key={option} marginRight={2}>
              <Text
                color={option === best ? 'cyan' : undefined}
                dimColor={option !== best}
              >
                {option}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
