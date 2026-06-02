import { useCallback, useMemo, useRef, useState } from 'react';

export interface Form<T extends Record<string, string>> {
  values: T;
  activeIndex: number;
  /** Stable onChange handler per field (safe to pass to inputs' deps). */
  setters: Record<keyof T, (value: string) => void>;
  /** Advance focus to the next field, wrapping around. */
  next: () => void;
  /** Replace all values (same keys) and reset focus — for switching edit target. */
  reset: (values: T) => void;
}

/**
 * Minimal form state for a fixed set of text fields navigated with Enter.
 * Field order is the key order of `initial`.
 *
 * The per-field setters and `next` have stable identities. This matters because
 * @inkjs/ui's TextInput lists `onChange` in a useEffect dependency array; an
 * onChange whose identity changed every render would re-fire that effect in a
 * loop ("Maximum update depth exceeded").
 */
export function useForm<T extends Record<string, string>>(initial: T): Form<T> {
  const [values, setValues] = useState<T>(initial);
  const [activeIndex, setActiveIndex] = useState(0);
  const keys = useRef(Object.keys(initial) as Array<keyof T>);
  const count = keys.current.length;

  const next = useCallback(
    () => setActiveIndex((index) => (index + 1) % count),
    [count],
  );

  const setters = useMemo(() => {
    const map = {} as Record<keyof T, (value: string) => void>;
    for (const key of keys.current) {
      map[key] = (value: string) =>
        setValues((prev) => ({ ...prev, [key]: value }));
    }
    return map;
  }, []);

  const reset = useCallback((nextValues: T) => {
    setValues(nextValues);
    setActiveIndex(0);
  }, []);

  return { values, activeIndex, setters, next, reset };
}
