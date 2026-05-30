import '@xterm/xterm/css/xterm.css';

import { mount } from '@traveller-tools/tui';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import chalk from 'chalk';

import { localStore } from './localStore';
import { createStreams } from './ptyAdapter';
import { installTouchControls } from './touchControls';

const term = new Terminal({
  convertEol: true,
  cursorBlink: true,
  fontFamily: 'monospace',
  fontSize: 14,
  theme: {
    background: '#0b0e14',
    foreground: '#d3d7de',
    cursor: '#c9a227',
  },
});

const fit = new FitAddon();
term.loadAddon(fit);

const container = document.getElementById('terminal');
if (!container) throw new Error('#terminal element not found');

term.open(container);
fit.fit();
window.addEventListener('resize', () => fit.fit());

/** Surface any runtime failure directly in the terminal (and the console). */
function showError(label: string, error: unknown): void {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  // eslint-disable-next-line no-console
  console.error(label, error);
  term.write(`\r\n${chalk.red(label)}\r\n`);
  term.write(message.replace(/\n/g, '\r\n') + '\r\n');
}

/** Open a native file dialog and resolve with the chosen file's text (or null). */
function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) resolve(null);
      else file.text().then(resolve, () => resolve(null));
    });
    // If the dialog is dismissed, `change` never fires; resolve null on refocus.
    window.addEventListener(
      'focus',
      () => setTimeout(() => (input.files?.length ? null : resolve(null)), 300),
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

window.addEventListener('error', (event) =>
  showError('Uncaught error:', event.error),
);
window.addEventListener('unhandledrejection', (event) =>
  showError('Unhandled promise rejection:', event.reason),
);

try {
  const { stdin, stdout, sendKey } = createStreams(term);
  mount({
    stdin,
    stdout,
    stderr: stdout,
    exitOnCtrlC: false,
    patchConsole: false,
    store: localStore(),
    files: { pickFile },
  });
  // On touch devices, add an on-screen control bar (arrows / Esc / Tab / …).
  // It steals vertical space, so re-fit the terminal once it's in place.
  const app = document.getElementById('app');
  if (app && installTouchControls(app, sendKey)) fit.fit();
  term.focus();
} catch (error) {
  showError('Failed to start the TUI:', error);
}
