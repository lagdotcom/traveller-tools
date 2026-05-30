import { Box, Text, useInput } from 'ink';
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
 * A labelled text input. Typing edits the value; when the value is numeric,
 * Left/Right step it by 1 (clamped at 0); Enter advances. Controlled by the
 * parent, so the displayed value always reflects state.
 */
export function Field({
  label,
  value,
  placeholder,
  isActive,
  onChange,
  onSubmit,
}: FieldProps): React.JSX.Element {
  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit();
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n)) {
          onChange(String(key.leftArrow ? Math.max(0, n - 1) : n + 1));
        }
        return;
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.tab) {
        const printable = input.replace(/[^\x20-\x7e]/g, '');
        if (printable) onChange(value + printable);
      }
    },
    { isActive },
  );

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
          <Text>
            {value ? (
              <Text color="cyan">{value}</Text>
            ) : (
              <Text dimColor>{placeholder ?? ''}</Text>
            )}
            <Text inverse> </Text>
          </Text>
        ) : (
          <Text dimColor={!value}>{value || placeholder || ''}</Text>
        )}
      </Box>
    </Box>
  );
}
