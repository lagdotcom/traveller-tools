import { useState } from 'react';

export interface Form<T extends Record<string, string>> {
  values: T;
  activeIndex: number;
  /** Returns an onChange handler bound to a specific field. */
  set: (key: keyof T) => (value: string) => void;
  /** Advance focus to the next field, wrapping around. */
  next: () => void;
}

/**
 * Minimal form state for a fixed set of text fields navigated with Enter.
 * Field order is the key order of `initial`.
 */
export function useForm<T extends Record<string, string>>(initial: T): Form<T> {
  const [values, setValues] = useState<T>(initial);
  const [activeIndex, setActiveIndex] = useState(0);
  const count = Object.keys(initial).length;

  const set = (key: keyof T) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const next = () => setActiveIndex((i) => (i + 1) % count);

  return { values, activeIndex, set, next };
}
