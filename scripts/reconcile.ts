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
  type Traits,
} from '@traveller-tools/core';

const EL = 'emissions (low)';
const EN = 'emissions (normal)';

const PL = 'physical (low)';
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
  traits?: Record<string, number | string | boolean>;
  /**
   * Per-ammo figures for a multi-ammo (or multi-munition) weapon, keyed by the
   * ammo/munition label as it appears on the sheet (e.g. 'Explosive', 'Pellet').
   * Only the ammo-varying fields are compared against that loaded profile; the
   * top-level figures still cover the weapon as a whole (the primary ammo).
   */
  ammo?: Record<string, AmmoFigures>;
  /**
   * Spot exceptions: field names to skip (a confirmed book error the engine is
   * right about). Use a `note` to record why. Field names match the report's
   * labels, e.g. 'damage', 'cost', 'trait Burn'. Per-ammo labels are prefixed,
   * e.g. 'Pellet · damage'.
   */
  ignore?: string[];
  /** Free notes (page ref, "book error: …", etc.). */
  note?: string;
}

/** The ammo-varying fields of one loaded ammunition / munition type. */
interface AmmoFigures {
  damage?: string;
  range?: number;
  penetration?: number;
  /** Reload price of a magazine loaded with this ammo. */
  magazineCr?: number;
  traits?: Record<string, number | string | boolean>;
  /** Field names (un-prefixed, e.g. 'damage') to skip for this ammo. */
  ignore?: string[];
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
    signature: 'NOT GIVEN',
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
    signature: PL,
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
    signature: EL,
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
    signature: EL,
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
    signature: EL,
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
  Planetsider: {
    range: 55,
    damage: '3D-1',
    weightKg: 5,
    costCr: 1950,
    capacity: 28,
    magazineCr: 48,
    quickdraw: 5,
    signature: PL,
    traits: { Auto: 3, Rugged: true },
  },
  'GR-80': {
    range: 540,
    damage: '4D',
    weightKg: 5.2,
    costCr: 2220,
    capacity: 90,
    magazineCr: 65,
    quickdraw: 0,
    signature: EL,
    traits: { AP: 3, Auto: 3, Scope: true },
  },
  AIWS: {
    range: 310,
    damage: '3D',
    weightKg: 3.9,
    costCr: 1435,
    capacity: 42,
    magazineCr: 35,
    quickdraw: 0,
    signature: PL,
    traits: { Auto: 3 },
  },
  Intruder: {
    range: 225,
    damage: '3D',
    weightKg: 5.55,
    costCr: 2085,
    capacity: 36,
    magazineCr: 40,
    quickdraw: 3,
    signature: PN,
  },
  Squadmate: {
    range: 300,
    damage: '3D+3',
    weightKg: 4,
    costCr: 560,
    capacity: 24,
    magazineCr: 28,
    quickdraw: 0,
    signature: PN,
  },
  Sentinel: {
    range: 250,
    damage: '3D-3',
    weightKg: 0.57,
    costCr: 195,
    capacity: 4,
    magazineCr: 8,
    quickdraw: 8,
    signature: PN,
    traits: { Inaccurate: -1, 'Zero-G': true },
  },
  'Shipmate Handgun': {
    range: 8,
    damage: '3D-3',
    weightKg: 1.4,
    costCr: 560,
    capacity: 14,
    magazineCr: 35,
    quickdraw: 6,
    signature: PN,
    traits: { Auto: 4, Inaccurate: -2, 'Lo-Pen': 3, 'Zero-G': true },
  },
  'Ten-Six': {
    range: 5,
    damage: '3D-3',
    weightKg: 0.93,
    costCr: 170,
    capacity: 5,
    magazineCr: 12,
    quickdraw: 7,
    signature: PN,
    traits: { Inaccurate: -2, 'Lo-Pen': 3, 'Zero-G': true },
  },
  Guardian: {
    range: 275,
    damage: '4D',
    weightKg: 10.3,
    costCr: 4520,
    capacity: 45,
    magazineCr: 270,
    quickdraw: -4,
    signature: PN,
    traits: { Auto: 3, Inaccurate: -1, 'Zero-G': true },
  },
  Solo: {
    range: 715,
    damage: '5D-2',
    weightKg: 4.1,
    costCr: 17525,
    capacity: 45,
    magazineCr: 200,
    quickdraw: 0,
    signature: EL,
    traits: { AP: 6, Auto: 3, Scope: true },
  },
  Reliant: {
    range: 280,
    damage: '3D',
    weightKg: 6.4,
    capacity: 50,
    magazineCr: 110,
    quickdraw: -5,
    signature: PL,
    traits: { Auto: 4, Scope: true },
  },
  'Jimpy-G': {
    range: 375,
    damage: '3D+3',
    weightKg: 14,
    costCr: 3060,
    capacity: 50,
    magazineCr: 50,
    quickdraw: 4,
    signature: PN,
    traits: { Auto: 3, 'Slow Loader': 4 },
  },
  'MF-61': {
    range: 30,
    damage: '5D',
    weightKg: 7.55,
    costCr: 1400,
    capacity: 4,
    magazineCr: 700,
    quickdraw: 0,
    signature: 'emissions (extreme)',
    traits: {
      Blast: 2,
      Bulwarked: 3,
      Burn: 'D3+1',
      Hazardous: -6,
      Incendiary: true,
    },
  },
  Cryojet: {
    range: 30,
    damage: '4D',
    weightKg: 20.41,
    costCr: 1332,
    capacity: 9,
    magazineCr: 2200,
    quickdraw: 2,
    signature: 'NOT GIVEN',
    traits: {
      Blast: 3,
      Bulky: true,
      Bulwarked: 3,
      Burn: 'D3+1',
      Hazardous: -6,
      Incendiary: true,
    },
    // The book stat block lists Burn/Incendiary, but the Cryojet burns cryogenic
    // fluid (no fire) — a transcription carry-over; the engine is right to omit them.
    ignore: ['trait Burn', 'trait Incendiary'],
  },
  'BL-3': {
    range: 5,
    damage: '2D',
    weightKg: 0.5,
    costCr: 415,
    capacity: 3,
    magazineCr: 15,
    quickdraw: 10,
    signature: EN,
    traits: { Hazardous: -2, 'Lo-Pen': 4, 'Zero-G': true },
  },
  'M-84': {
    range: 225,
    damage: '4D+3',
    weightKg: 4.4,
    costCr: 6750,
    capacity: 14,
    magazineCr: 0, // builtin
    quickdraw: 0,
    signature: EN,
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
  },
  Nefertem: {
    range: 50,
    damage: '3D',
    weightKg: 2.6 + 1,
    costCr: 960,
    capacity: 100,
    magazineCr: 1000,
    quickdraw: 6,
    signature: EN,
    traits: { 'Lo-Pen': 2, 'Zero-G': true },
  },
  'IP-2': {
    range: 500,
    damage: '2D',
    weightKg: 0.75,
    costCr: 75,
    traits: { Blast: 15, Burn: 2, Incendiary: true },
  },
  'Spigot Mortar': {
    range: 500,
    damage: '10D',
    weightKg: 10,
    costCr: 650,
    traits: { AP: 12, Blast: 4, Inaccurate: -2 },
  },
  'Light Munitions Launcher': {
    range: 200,
    weightKg: 0.5,
    costCr: 125,
    traits: { Blast: 3 },
  },
  ASSW: {
    range: 300,
    damage: '5D',
    weightKg: 0.5,
    costCr: 90,
    traits: { Blast: 3, 'Lo-Pen': 2 },
  },
  TMMS: {
    range: 1000,
    damage: '6D',
    weightKg: 6,
    costCr: 12000,
    traits: { AP: 12, Blast: 4, Smart: true },
  },
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
    signature: EL,
    traits: { Bulky: true, 'Lo-Pen': 2, Scope: true, 'Zero-G': true },
    // Book error: the table prints 8D but omits Improved Beam Focus's +3 (the
    // engine's 8D+3 is correct). Spot-ignored so it doesn't clutter the list.
    ignore: ['damage'],
  },
};

// ── Runner ──────────────────────────────────────────────────────────────────
/**
 * Per-field rounding tolerance: a difference counts as "rounding" (not a real
 * issue) when |engine − book| ≤ max(abs, rel × |book|). The relative term absorbs
 * the book rounding prices to round numbers (e.g. 2190.24 → 2200) and printing
 * fewer decimals (13.1375 → 13.1); the absolute floor catches the tiny ones. It
 * scales correctly: 0.04kg is noise on a 13kg gun but a real diff on a 0.9kg one.
 * Fields with no entry (quickdraw / auto / capacity / penetration) are compared
 * EXACTLY — any difference there is meaningful. Pass `--rounding` to also list the
 * suppressed rounding diffs; tighten these to see more.
 */
const TOLERANCE: Record<string, { abs: number; rel: number }> = {
  cost: { abs: 1, rel: 0.01 },
  weight: { abs: 0.01, rel: 0.01 },
  magazine: { abs: 1, rel: 0.01 },
  range: { abs: 1, rel: 0 },
};
const SHOW_ROUNDING = process.argv.includes('--rounding');

/**
 * Trait-value normalizers applied to the *book* figure before comparing — for
 * traits the book transcribes inconsistently. Inaccurate is always a penalty, but
 * the book prints its sign at random (likely OCR), so force it negative.
 */
const TRAIT_NORMALIZE: Record<
  string,
  (v: number | string | boolean) => number | string | boolean
> = {
  // Inaccurate is always a penalty; the book prints its sign at random (OCR).
  Inaccurate: (v) => (typeof v === 'number' ? -Math.abs(v) : v),
  // "Incendiary" with no modifier means Incendiary 0 (Weapon Traits chapter).
  Incendiary: (v) => (v === true ? 0 : v),
};

const n = (v: number) => String(Math.round(v * 10000) / 10000);

type Kind = 'exact' | 'rounding' | 'diff';
function classifyNum(field: string, eng: number, bk: number): Kind {
  if (eng === bk) return 'exact';
  const t = TOLERANCE[field] ?? { abs: 0, rel: 0 };
  const tol = Math.max(t.abs, t.rel * Math.abs(bk));
  return Math.abs(eng - bk) <= tol ? 'rounding' : 'diff';
}

interface Diff {
  field: string;
  engine: string;
  book: string;
  delta?: string;
  rounding?: boolean;
}

function diffWeapon(name: string, book: BookFigures): Diff[] {
  const def = BUILTIN_WEAPONS.find((w) => w.name === name);
  if (!def) return [{ field: '(weapon)', engine: 'MISSING', book: 'listed' }];
  const e = evaluateWeapon(def.params);
  const p = e.profile;
  const diffs: Diff[] = [];
  // `field` is the base name (used for tolerance); `prefix` labels per-ammo rows.
  const cmpNum = (
    field: string,
    eng: number,
    bk: number | undefined,
    prefix = '',
  ) => {
    if (bk === undefined) return;
    const kind = classifyNum(field, eng, bk);
    if (kind === 'exact') return;
    const sign = eng - bk >= 0 ? '+' : '';
    diffs.push({
      field: prefix + field,
      engine: n(eng),
      book: n(bk),
      delta: `Δ${sign}${n(eng - bk)}`,
      rounding: kind === 'rounding',
    });
  };
  const cmpStr = (
    field: string,
    eng: string,
    bk: string | undefined,
    prefix = '',
  ) => {
    if (bk !== undefined && eng !== bk)
      diffs.push({ field: prefix + field, engine: eng, book: bk });
  };
  const cmpTraits = (
    engT: Traits,
    bookT: Record<string, number | string | boolean> | undefined,
    prefix = '',
  ) => {
    for (const [k, raw] of Object.entries(bookT ?? {})) {
      const bv = TRAIT_NORMALIZE[k] ? TRAIT_NORMALIZE[k]!(raw) : raw;
      const ev = engT[k];
      const evStr = ev === undefined ? '—' : ev === true ? 'yes' : String(ev);
      const bvStr = bv === true ? 'yes' : String(bv);
      if (evStr !== bvStr)
        diffs.push({
          field: `${prefix}trait ${k}`,
          engine: evStr,
          book: bvStr,
        });
    }
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
  cmpTraits(p.traits, book.traits);

  // Per-ammo / per-munition rows: compare each loaded profile to its book figures.
  const ignore = new Set(book.ignore ?? []);
  const rows = e.ammoProfiles ?? e.munitionProfiles ?? [];
  for (const [label, figs] of Object.entries(book.ammo ?? {})) {
    const prefix = `${label} · `;
    const row = rows.find((r) => r.label === label);
    if (!row) {
      diffs.push({ field: `${prefix}(loaded)`, engine: '—', book: 'expected' });
      continue;
    }
    cmpStr('damage', formatDamage(row.profile.damage), figs.damage, prefix);
    cmpNum('range', row.profile.range, figs.range, prefix);
    cmpNum('penetration', row.profile.penetration, figs.penetration, prefix);
    cmpNum('magazine', row.magazineCr, figs.magazineCr, prefix);
    cmpTraits(row.profile.traits, figs.traits, prefix);
    for (const f of figs.ignore ?? []) ignore.add(prefix + f);
  }

  // Drop spot exceptions (confirmed book errors the engine is right about).
  return diffs.filter((d) => !ignore.has(d.field));
}

function main() {
  const stubs: string[] = [];
  let reconciled = 0; // exact, or every diff within rounding tolerance
  let realDiffTotal = 0;
  let roundingTotal = 0;
  const lines: string[] = [];

  const row = (d: Diff) =>
    `      ${(d.rounding ? '≈ ' : '  ') + d.field.padEnd(14)} engine ${d.engine.padEnd(16)} book ${(d.book + ' ' + (d.delta ?? '')).trim()}`;

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
    const all = diffWeapon(def.name, book);
    const real = all.filter((d) => !d.rounding);
    const rounding = all.filter((d) => d.rounding);
    roundingTotal += rounding.length;

    if (real.length === 0) {
      reconciled++;
      const tag = rounding.length
        ? ` (${rounding.length} within rounding)`
        : '';
      lines.push(`✓  ${def.name}${tag}`);
    } else {
      realDiffTotal += real.length;
      lines.push(`✗  ${def.name}`);
      for (const d of real) lines.push(row(d));
      if (book.note) lines.push(`      note: ${book.note}`);
    }
    if (SHOW_ROUNDING) for (const d of rounding) lines.push(row(d));
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
    `\n${BUILTIN_WEAPONS.length} weapons · ${reconciled} reconcile (±rounding) · ${stubs.length} stubs · ${realDiffTotal} real diffs · ${roundingTotal} within rounding${SHOW_ROUNDING ? '' : ' (--rounding to show)'}\n`,
  );
}

main();
