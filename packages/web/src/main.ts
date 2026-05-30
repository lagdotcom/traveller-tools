import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { mount } from '@traveller-tools/tui';
import { createStreams } from './ptyAdapter';

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
  term.write(`\r\n\x1b[31m${label}\x1b[0m\r\n`);
  term.write(message.replace(/\n/g, '\r\n') + '\r\n');
}

window.addEventListener('error', (event) =>
  showError('Uncaught error:', event.error),
);
window.addEventListener('unhandledrejection', (event) =>
  showError('Unhandled promise rejection:', event.reason),
);

try {
  const { stdin, stdout } = createStreams(term);
  mount({
    stdin,
    stdout,
    stderr: stdout,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  term.focus();
} catch (error) {
  showError('Failed to start the TUI:', error);
}
