import { TextInput } from '@inkjs/ui';
import { Box, Text } from 'ink';
import React from 'react';

export interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  /** Whether this field currently has focus. */
  isActive: boolean;
  onChange: (value: string) => void;
  /** Called when the user presses Enter; advance to the next field. */
  onSubmit: () => void;
}

/**
 * A single labelled text input row. The actual Ink TextInput is only mounted
 * while the field is active; inactive fields render their value as plain text.
 */
export function Field({
  label,
  value,
  placeholder,
  isActive,
  onChange,
  onSubmit,
}: FieldProps): React.JSX.Element {
  return (
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
            placeholder={placeholder}
            onChange={onChange}
            onSubmit={onSubmit}
          />
        ) : (
          <Text dimColor={!value}>{value || placeholder || ''}</Text>
        )}
      </Box>
    </Box>
  );
}
