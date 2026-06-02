/**
 * Book-reconciliation harness (run: `npm run reconcile`).
 *
 * Compares every built-in weapon's *engine* output against the *book's printed
 * stat block* (transcribed below — errors and all) and prints an issue list of
 * the exact field-by-field differences. This is a diagnostic, not a pass/fail
 * test: the diffs are the point. Use them to decide, per difference, whether it's
 *   - a book error (the engine is right — leave a reconcile note),
 *   - a missing/general rule (something the book applies that the model doesn't),
 *   - or a bug to fix.
 *
 * BOOK_FIGURES is the editable list. Fill in `{}` stubs from the book; only the
 * fields you provide are compared, so partial entries are fine. `signature` is
 * "<kind> (<level>)", e.g. "physical (extreme)" / "emissions (low)". `traits`
 * lists only the distinctive ones you want checked (AP, Lo-Pen, Blast, …).
 */
import {
  BUILTIN_WEAPONS,
  evaluateWeapon,
  formatDamage,
} from '@traveller-tools/core';

const EN = 'emissions (normal)';
const PN = 'physical (normal)';

interface BookFigures {
  costCr?: number;
  weightKg?: number;
  /** Reload price of the standard magazine. */
  magazineCr?: number;
  /** e.g. '5D', '5D-3', '3D+5'. */
  damage?: string;
  range?: number;
  quickdraw?: number;
  auto?: number;
  penetration?: number;
  capacity?: number;
  /** '<kind> (<level>)', e.g. 'physical (extreme)'. */
  signature?: string;
  /** Only the distinctive traits to check (AP, Lo-Pen, Blast, …). */
  traits?: Record<string, number | boolean>;
  /** Free notes (page ref, "book error: …", etc.). */
  note?: string;
}

// ── The book stat blocks. Fill in the `{}` stubs from the Field Catalogue. ──────
const BOOK_FIGURES: Record<string, BookFigures> = {
  'Generic 6 Revolver': {
    range: 10,
    damage: '3D-3',
    weightKg: 0.75,
    costCr: 150,
    capacity: 6,
    magazineCr: 5,
    quickdraw: 8,
    traits: { 'Lo-Pen': 2 },
  },
  'Compact PDW': {
    range: 8,
    damage: '2D',
    weightKg: 0.67,
    costCr: 485,
    capacity: 13,
    magazineCr: 9,
    quickdraw: 6,
    signature: 'physical (low)',
    traits: { Auto: 4, 'Lo-Pen': 2 },
  },
  'Civilian Shotgun': {
    range: 20,
    damage: '4D-4',
    weightKg: 4.5,
    costCr: 130,
    capacity: 1,
    magazineCr: 2.5,
    quickdraw: -1,
    signature: PN,
    traits: { Inaccurate: -1, 'Lo-Pen': 4, Spread: 2 },
  },
  '13mm Crunch Gun': {
    range: 1250,
    damage: '5D',
    weightKg: 13.1,
    costCr: 3130,
    capacity: 3,
    magazineCr: 75,
    quickdraw: -8,
    signature: 'physical (extreme)',
    traits: { Bulky: true, Scope: true },
  },
  'Flintlock Jazail': {
    range: 125,
    damage: '3D-2',
    weightKg: 3.2,
    costCr: 140,
    capacity: 1,
    magazineCr: 0.25,
    quickdraw: 0,
    signature: 'physical (very high)',
    traits: { Inaccurate: -1, 'Lo-Pen': 3, 'Slow Loader': 12, Unreliable: 2 },
  },
  Adjudicator: {
    range: 12,
    damage: '3D-2',
    weightKg: 0.92,
    costCr: 75,
    capacity: 5,
    magazineCr: 5,
    quickdraw: 8,
    signature: 'physical (very high)',
    traits: { Bulky: true, Inaccurate: 1 },
  },
  'GA-100': {
    range: 50,
    damage: '3D+5',
    weightKg: 4.4,
    costCr: 2200,
    capacity: 23,
    magazineCr: 55,
    quickdraw: 8,
    signature: 'emissions (low)',
    traits: { AP: 4, Auto: 3, Spread: 3 },
  },
  'GC-24': {
    range: 10,
    damage: '3D',
    weightKg: 0.85,
    costCr: 890,
    capacity: 24,
    magazineCr: 27,
    quickdraw: 10,
    signature: 'emissions (low)',
    traits: { AP: 3, Auto: 4 },
  },
  'GS-40': {
    range: 20,
    damage: '3D',
    weightKg: 1.2,
    costCr: 450,
    capacity: 40,
    magazineCr: 25,
    quickdraw: 8,
    signature: 'emissions (low)',
    traits: { AP: 3, Auto: 2 },
  },
  Stowaway: {
    range: 4,
    damage: '2D',
    weightKg: 0.63,
    costCr: 240,
    capacity: 6,
    magazineCr: 135,
    quickdraw: 10,
    signature: 'physical (minimal)',
    traits: { Auto: 2, 'Lo-Pen': 2, Stealth: 'extreme' },
  },
  'Liberator Derringer': {
    range: 5,
    damage: '3D3-1',
    weightKg: 0.9,
    costCr: 105,
    capacity: 4,
    magazineCr: 4,
    quickdraw: 12,
    signature: 'physical (very high)',
    traits: { 'Lo-Pen': 3, 'Slow Loader': 4 },
  },
  'Bodyguard Shotgun': {
    range: 100,
    damage: '4D',
    weightKg: 4.1,
    costCr: 260,
    capacity: 6,
    magazineCr: 9,
    quickdraw: 0,
    signature: PN,
    traits: { Bulky: true, Inaccurate: 1 },
  },
  Standard: {
    range: 135,
    damage: '2D',
    weightKg: 2.3,
    costCr: 2260,
    capacity: 27,
    magazineCr: 30,
    quickdraw: 2,
    signature: PN,
    traits: { Bulwark: 2 },
  },
  'Mk 1 Handgun': {
    range: 12,
    damage: '3D-1',
    weightKg: 1.1,
    costCr: 240,
    capacity: 8,
    magazineCr: 10,
    quickdraw: 8,
    signature: PN,
  },
  'Posi-9': {
    range: 12.5,
    damage: '3D-3',
    weightKg: 1.1,
    costCr: 375,
    capacity: 15,
    magazineCr: 15,
    quickdraw: 8,
    signature: PN,
    traits: { 'Lo-Pen': 2 },
  },
  Crewmate: {
    range: 50,
    damage: '2D',
    weightKg: 1.1,
    costCr: 465,
    capacity: 30,
    magazineCr: 20,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 4, 'Lo-Pen': 2 },
  },
  Desperado: {
    range: 25,
    damage: '3D-3',
    weightKg: 2.8,
    costCr: 400,
    capacity: 20,
    magazineCr: 19,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 3, Inaccurate: 1 },
  },
  Eliminator: {
    range: 20,
    damage: '2D-3',
    weightKg: 2.81,
    costCr: 965,
    capacity: 24,
    magazineCr: 25,
    quickdraw: 4,
    signature: PN,
  },
  'IAW-12': {
    range: 50,
    damage: '3D-1',
    weightKg: 3.85,
    costCr: 1750,
    capacity: 72,
    magazineCr: 50,
    quickdraw: 6,
    signature: EN,
    traits: { AP: 4, Auto: 4 },
  },
  Planetsider: {},
  'GR-80': {},
  AIWS: {},
  Intruder: {},
  Squadmate: {},
  Sentinel: {},
  'Shipmate Handgun': {},
  'Ten-Six': {},
  Guardian: {},
  Solo: {},
  Reliant: {},
  'Jimpy-G': {},
  'MF-61': {},
  Cryojet: {},
  'BL-3': {},
  'M-84': {},
  Nefertem: {},
  'IP-2': {},
  'Spigot Mortar': {},
  'Light Munitions Launcher': {},
  ASSW: {},
  TMMS: {},
  'MDD-15': {
    range: 550,
    damage: '5D',
    weightKg: 35.2,
    costCr: 9050,
    capacity: 50,
    magazineCr: 750,
    quickdraw: -9,
    traits: { Auto: 3, Bulky: true, Scope: true },
  },
  'MDS-15': {
    range: 550,
    damage: '5D-3',
    weightKg: 13.61,
    costCr: 59720,
    capacity: 7,
    magazineCr: 150,
    quickdraw: -9,
    traits: { Bulky: true, Scope: true },
  },
  'TES-12': {
    range: 625,
    damage: '8D',
    weightKg: 13.7,
    costCr: 19500,
    capacity: 125,
    magazineCr: 2500,
    quickdraw: -9,
    signature: 'emissions (low)',
    traits: { Bulky: true, 'Lo-Pen': 2, Scope: true, 'Zero-G': true },
  },
};

// ── Runner ──────────────────────────────────────────────────────────────────
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const n = (v: number) => String(Math.round(v * 10000) / 10000);

interface Diff {
  field: string;
  engine: string;
  book: string;
}

function diffWeapon(name: string, book: BookFigures): Diff[] {
  const def = BUILTIN_WEAPONS.find((w) => w.name === name);
  if (!def) return [{ field: '(weapon)', engine: 'MISSING', book: 'listed' }];
  const e = evaluateWeapon(def.params);
  const p = e.profile;
  const diffs: Diff[] = [];
  const cmpNum = (field: string, eng: number, bk: number | undefined) => {
    if (bk !== undefined && !near(eng, bk))
      diffs.push({ field, engine: n(eng), book: n(bk) });
  };
  const cmpStr = (field: string, eng: string, bk: string | undefined) => {
    if (bk !== undefined && eng !== bk)
      diffs.push({ field, engine: eng, book: bk });
  };
  cmpNum('cost', e.totals.costCr, book.costCr);
  cmpNum('weight', e.totals.weightKg, book.weightKg);
  cmpNum('magazine', e.totals.magazineCr, book.magazineCr);
  cmpStr('damage', formatDamage(p.damage), book.damage);
  cmpNum('range', p.range, book.range);
  cmpNum('quickdraw', p.quickdraw, book.quickdraw);
  cmpNum('auto', p.auto, book.auto);
  cmpNum('penetration', p.penetration, book.penetration);
  cmpNum('capacity', p.capacity, book.capacity);
  cmpStr('signature', `${p.signatureKind} (${p.signature})`, book.signature);
  for (const [k, bv] of Object.entries(book.traits ?? {})) {
    const ev = p.traits[k];
    const evStr = ev === undefined ? '—' : ev === true ? 'yes' : String(ev);
    const bvStr = bv === true ? 'yes' : String(bv);
    if (evStr !== bvStr)
      diffs.push({ field: `trait ${k}`, engine: evStr, book: bvStr });
  }
  return diffs;
}

function main() {
  const stubs: string[] = [];
  let matched = 0;
  let totalDiffs = 0;
  const lines: string[] = [];

  for (const def of BUILTIN_WEAPONS) {
    const book = BOOK_FIGURES[def.name];
    if (book === undefined) {
      lines.push(`?? ${def.name} — no entry in BOOK_FIGURES`);
      continue;
    }
    if (Object.keys(book).length === 0) {
      stubs.push(def.name);
      continue;
    }
    const diffs = diffWeapon(def.name, book);
    if (diffs.length === 0) {
      matched++;
      lines.push(`✓  ${def.name} — all provided fields match`);
      continue;
    }
    totalDiffs += diffs.length;
    lines.push(`✗  ${def.name}`);
    for (const d of diffs)
      lines.push(
        `      ${d.field.padEnd(14)} engine ${d.engine.padEnd(18)} book ${d.book}`,
      );
    if (book.note) lines.push(`      note: ${book.note}`);
  }

  console.log('\n=== Book reconciliation ===\n');
  console.log(lines.join('\n'));
  if (stubs.length > 0) {
    console.log(
      `\n--- Stubs (fill BOOK_FIGURES from the book) — ${stubs.length} ---`,
    );
    console.log(stubs.map((s) => `   ${s}`).join('\n'));
  }
  console.log(
    `\n${BUILTIN_WEAPONS.length} weapons · ${matched} fully match · ${stubs.length} stubs · ${totalDiffs} mismatched fields\n`,
  );
}

main();
