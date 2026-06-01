import { Box, Text, useInput } from 'ink';
import React, { useCallback, useRef } from 'react';

export interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  /** Whether this field currently has focus. */
  isActive: boolean;
  onChange: (value: string) => void;
  /** Called when the user presses Enter; advance to the next field. */
  onSubmit: () => void;
  /** Left/Right step for numeric values (default 1) — e.g. 10 for capacity %. */
  step?: number;
}

/**
 * A labelled text input. Typing edits the value; when the value is numeric,
 * Left/Right step it by `step` (default 1, clamped at 0); Enter advances.
 * Controlled by the parent, so the displayed value always reflects state.
 *
 * The key handler is stable (reads the latest props from a ref) so Ink's
 * useInput doesn't re-subscribe every render — an unstable handler churns Ink's
 * raw-mode effect and can loop ("Maximum update depth exceeded").
 */
export function Field(props: FieldProps): React.JSX.Element {
  const { label, value, placeholder, isActive } = props;
  const ref = useRef(props);
  ref.current = props;

  const handle = useCallback((input: string, key: { [k: string]: boolean }) => {
    const current = ref.current;
    if (key.return) {
      current.onSubmit();
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      const n = Number.parseFloat(current.value);
      if (Number.isFinite(n)) {
        const step = current.step ?? 1;
        current.onChange(
          String(key.leftArrow ? Math.max(0, n - step) : n + step),
        );
      }
      return;
    }
    if (key.backspace || key.delete) {
      current.onChange(current.value.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      const printable = input.replace(/[^\x20-\x7e]/g, '');
      if (printable) current.onChange(current.value + printable);
    }
  }, []);
  useInput(handle, { isActive });

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
