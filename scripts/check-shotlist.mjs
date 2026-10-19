#!/usr/bin/env node
// check-shotlist — does the shot list still agree with the film's own length?
//
//   node scripts/check-shotlist.mjs examples/moon-tree
//   node scripts/check-shotlist.mjs my-film --shotlist my-film/story.md
//
// Reads <dir>/shotlist.md (or --shotlist, or <dir>/story.md), pulls every time range out of it
// ("0.0–3.6", "| 2 | 4.0–6.5 | …"), and compares it with data-duration in <dir>/index.html.
// A shot list is the plan; the renderer only knows its duration. When they drift, the film either
// cuts off a beat or holds on the last frame — this catches that before a 9-minute render.
//
// Rules: every range must be start < end, ranges must be ordered and must not overlap,
// and nothing may start after the film ends. Exit code is non-zero ONLY when a rule breaks.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const DIR = resolve(argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--shotlist') || '.');
const EPS = 1e-6;
const NUM = '(\\d+(?:\\.\\d+)?)';
const RANGE = new RegExp(NUM + '\\s*(?:[–—\\-~〜→]|‥|\\.\\.|至|到)\\s*' + NUM);

const problems = [];
const notes = [];

// ---------- the film ----------
const indexPath = join(DIR, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`no index.html in ${DIR}`);
  process.exit(2);
}
const html = readFileSync(indexPath, 'utf8');
const root = /<[a-z][\w-]*\b[^>]*\sdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] || html;
const duration = Number((/data-duration\s*=\s*["']?([\d.]+)/i.exec(root) || [])[1]);
if (!(duration > 0)) {
  console.error(`no data-duration on the composition root of ${indexPath}`);
  process.exit(2);
}

// ---------- the shot list ----------
const explicit = flag('shotlist');
const candidates = [explicit, join(DIR, 'shotlist.md'), join(DIR, 'story.md')].filter(Boolean).map((p) => resolve(p));
const shotPath = candidates.find((p) => existsSync(p));
if (!shotPath) {
  console.error(`no shot list: looked for ${candidates.join(', ')}`);
  process.exit(2);
}
const md = readFileSync(shotPath, 'utf8');
const lines = md.split(/\r?\n/);

// find the table column that holds the time range (header wording varies), else scan every cell
let timeCol = -1;
for (const line of lines) {
  if (!line.trim().startsWith('|')) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  const i = cells.findIndex((c) => /时间|time|时长|seconds|^s$/i.test(c));
  if (i >= 0) { timeCol = i; break; }
}

const shots = [];
lines.forEach((line, n) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let fromCells = null;
  if (trimmed.startsWith('|')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;        // the |---|---| separator
    const pick = timeCol >= 0 ? cells[timeCol] : cells.find((c) => RANGE.test(c));
    if (pick) fromCells = pick;
  }
  const hay = fromCells != null ? fromCells : trimmed;
  const m = RANGE.exec(hay);
  if (!m) return;
  const start = Number(m[1]);
  const end = Number(m[2]);
  const cells = trimmed.startsWith('|') ? line.split('|').slice(1, -1).map((c) => c.trim()) : [];
  const label = cells.length
    ? (timeCol >= 0 && cells[timeCol + 1] ? cells[timeCol + 1] : cells.find((c) => c && !RANGE.test(c) && !/^\d+$/.test(c)) || '')
        .replace(/\*\*/g, '').slice(0, 26).trim()
    : '';
  shots.push({ start, end, label: label || `line ${n + 1}`, line: n + 1 });
});

if (!shots.length) {
  console.error(`no time ranges found in ${shotPath} (expected e.g. "0.0–3.6" or a 时间 column)`);
  process.exit(2);
}

// ---------- the checks ----------
shots.forEach((s, i) => {
  if (!(s.end > s.start)) problems.push(`#${i + 1} (line ${s.line}): end ${s.end} is not after start ${s.start}`);
  if (s.start < -EPS) problems.push(`#${i + 1} (line ${s.line}): negative start ${s.start}`);
  if (s.start > duration + EPS) problems.push(`#${i + 1} (line ${s.line}): starts at ${s.start}s, past the film's ${duration}s`);
  else if (s.end > duration + EPS) problems.push(`#${i + 1} (line ${s.line}): ends at ${s.end}s, past the film's ${duration}s`);
  if (i > 0) {
    const prev = shots[i - 1];
    if (s.start < prev.start - EPS) problems.push(`#${i + 1} (line ${s.line}): starts ${s.start}s, before #${i} (${prev.start}s) — out of order`);
    if (s.start < prev.end - EPS) problems.push(`#${i + 1} (line ${s.line}): overlaps #${i} (${prev.start}–${prev.end}s)`);
    if (s.start - prev.end > 0.001) notes.push(`gap ${(s.start - prev.end).toFixed(2)}s between #${i} and #${i + 1}`);
  }
});

// ---------- report ----------
const name = basename(DIR) || DIR;
console.log(`${name} · ${shots.length} shot(s) · film ${duration}s · list ${basename(shotPath)}`);
let cursor = 0;
for (let i = 0; i < shots.length; i++) {
  const s = shots[i];
  const lead = s.start - cursor;
  const mark = problems.some((p) => p.startsWith(`#${i + 1} `)) ? '  ✗' : '';
  console.log(
    `  #${String(i + 1).padStart(2)}  ${s.start.toFixed(1).padStart(5)}–${s.end.toFixed(1).padEnd(5)}` +
    `  ${(s.end - s.start).toFixed(2).padStart(5)}s  (+${Math.max(0, lead).toFixed(2)} lead)  ${s.label}${mark}`
  );
  cursor = Math.max(cursor, s.end);
}
const last = shots[shots.length - 1];
console.log(`  total listed ${last.end.toFixed(2)}s of ${duration}s${duration - last.end > 0.05 ? ` · ${(duration - last.end).toFixed(2)}s tail unlisted` : ' · covers the film'}`);
if (notes.length) console.log('  notes: ' + notes.join('; '));

if (problems.length) {
  console.error(`\n✗ shot list does not match the film (${problems.length} problem(s)):`);
  for (const p of problems) console.error('   ' + p);
  process.exit(1);
}
console.log('✓ shot list is consistent with data-duration');
