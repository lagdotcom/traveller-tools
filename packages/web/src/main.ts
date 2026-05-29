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

const { stdin, stdout } = createStreams(term);

mount({
  stdin,
  stdout,
  stderr: stdout,
  exitOnCtrlC: false,
  patchConsole: false,
});

term.focus();
