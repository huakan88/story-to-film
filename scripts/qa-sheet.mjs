#!/usr/bin/env node
// Contact sheet for cold review: one sheet per 16 frames (4 s apart by default) plus five key stills.
//
//   node scripts/qa-sheet.mjs out/film.mp4
//   node scripts/qa-sheet.mjs out/film.mp4 --every 3 --out review/
//
// Needs ffmpeg + ffprobe on PATH.

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
if (!input) {
  console.error('usage: node scripts/qa-sheet.mjs <video.mp4> [--every 4] [--out dir]');
  process.exit(2);
}
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const every = Number(flag('every', 4));
const outDir = resolve(flag('out', join(dirname(resolve(input)), 'review')));
const file = resolve(input);
if (!existsSync(file)) {
  console.error(`no such file: ${file}`);
  process.exit(2);
}

const run = (a) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...a], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('ffmpeg failed:', r.stderr?.trim()?.split('\n').pop());
    process.exit(1);
  }
};

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
const duration = Number((probe.stdout || '0').trim()) || 0;
const perSheet = Math.ceil((60 / every) >= 16 ? 16 : 60 / every);

mkdirSync(outDir, { recursive: true });
const stem = basename(file).replace(/\.\w+$/, '');

// one sheet per ~64 s of footage (16 tiles at `every` seconds)
const sheetSeconds = 16 * every;
for (let t = 0; t < duration; t += sheetSeconds) {
  const out = join(outDir, `${stem}-sheet-${String(Math.round(t)).padStart(3, '0')}.jpg`);
  run(['-ss', String(t), '-t', String(sheetSeconds), '-i', file,
    '-vf', `fps=1/${every},scale=440:-1,tile=4x4:padding=4:margin=4`, '-frames:v', '1', '-q:v', '3', out]);
  console.log('sheet ', out);
}

// five key stills for detail review
const marks = [0.08, 0.28, 0.5, 0.72, 0.94].map((k) => (duration * k).toFixed(2));
for (const t of marks) {
  const out = join(outDir, `${stem}-at-${t}s.jpg`);
  run(['-ss', t, '-i', file, '-frames:v', '1', '-q:v', '2', out]);
  console.log('still ', out);
}

console.log(`\nreview ${Math.ceil(duration / sheetSeconds)} sheet(s) + ${marks.length} stills in ${outDir}`);
console.log(`length ${duration.toFixed(2)}s · one tile every ${every}s`);
