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
  'Generic 6 Revolver': {},
  'Compact PDW': {},
  'Civilian Shotgun': {},
  // Verified worked example (a fully-reconciled weapon — should show all ✓).
  '13mm Crunch Gun': {
    costCr: 3143.75,
    weightKg: 13.1375,
    range: 1250,
    quickdraw: -8,
    damage: '5D',
  },
  'Flintlock Jazail': {},
  Adjudicator: {},
  'GA-100': {},
  'GC-24': {},
  'GS-40': {},
  Stowaway: {},
  'Liberator Derringer': {},
  'Bodyguard Shotgun': {},
  Standard: {},
  'Mk 1 Handgun': {},
  'Posi-9': {},
  Crewmate: {},
  Desperado: {},
  Eliminator: {},
  'IAW-12': {},
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
    costCr: 9050,
    weightKg: 35.2,
    magazineCr: 750,
    damage: '5D',
    range: 550,
    quickdraw: -9,
    auto: 3,
    capacity: 50,
  },
  'MDS-15': {
    costCr: 59720,
    weightKg: 13.61,
    magazineCr: 150,
    damage: '5D-3',
    range: 550,
    quickdraw: -9,
    capacity: 7,
  },
  'TES-12': {
    costCr: 19500,
    weightKg: 13.7,
    magazineCr: 2500,
    damage: '8D', // book error: the table omits Improved Beam Focus's +3
    range: 625,
    quickdraw: -9,
    capacity: 125,
    signature: 'emissions (low)',
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
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
