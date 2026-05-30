/**
 * On-screen control bar for touch devices. Soft keyboards rarely offer arrows,
 * Esc or Tab — the keys the TUI relies on — so we render DOM buttons that inject
 * the matching key sequences straight into stdin via `sendKey`. The Ink TUI is
 * unchanged; it just receives keystrokes as if typed.
 */

// ANSI / control sequences the TUI already understands.
const KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  left: '\x1b[D',
  right: '\x1b[C',
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  shiftTab: '\x1b[Z',
  ctrlS: '\x13', // Save
  ctrlE: '\x05', // Export
} as const;

/** True on phones/tablets (coarse pointer) or when forced via `?touch`. */
export function isTouchDevice(): boolean {
  const forced = new URLSearchParams(window.location.search).has('touch');
  return (
    forced ||
    window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window
  );
}

interface Btn {
  label: string;
  seq: string;
  wide?: boolean;
}

/**
 * Build and append the control bar. Returns `true` if it was installed (so the
 * caller can re-fit the terminal, which now has less vertical room).
 */
export function installTouchControls(
  parent: HTMLElement,
  sendKey: (data: string) => void,
): boolean {
  if (!isTouchDevice()) return false;

  const bar = document.createElement('div');
  bar.className = 'touch-controls';

  const rows: Btn[][] = [
    [
      { label: '⇧Tab', seq: KEYS.shiftTab },
      { label: '↑', seq: KEYS.up },
      { label: 'Tab', seq: KEYS.tab },
      { label: 'Esc', seq: KEYS.esc },
    ],
    [
      { label: '←', seq: KEYS.left },
      { label: '↓', seq: KEYS.down },
      { label: '→', seq: KEYS.right },
      { label: 'Enter', seq: KEYS.enter },
    ],
    [
      { label: 'Save', seq: KEYS.ctrlS, wide: true },
      { label: 'Export', seq: KEYS.ctrlE, wide: true },
    ],
  ];

  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'touch-row';
    for (const { label, seq, wide } of row) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (wide) b.className = 'wide';
      // Use pointerdown + preventDefault so a tap fires immediately and never
      // steals focus or triggers double-tap zoom. Synthetic keys go straight to
      // stdin, so terminal focus is irrelevant.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sendKey(seq);
      });
      rowEl.appendChild(b);
    }
    bar.appendChild(rowEl);
  }

  parent.appendChild(bar);
  return true;
}
