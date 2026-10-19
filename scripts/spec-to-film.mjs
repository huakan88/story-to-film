#!/usr/bin/env node
// spec-to-film.mjs — the prompt parser.
//
//   node scripts/spec-to-film.mjs films/yugong.spec.json            # validate + print the plan
//   node scripts/spec-to-film.mjs films/yugong.spec.json --emit     # print the STORY block to paste
//   node scripts/spec-to-film.mjs films/yugong.spec.json --table    # print the shot table
//
// A spec is the prompt: genre, cast, scale ladder, and one stage per beat. This script turns it into
// the four things a film needs (camera keys, beat windows, caption windows, sound hits) and refuses
// the specs that would produce a monotonous film:
//
//   ✗ a gap or an overlap between stages          (时间轴不连续)
//   ✗ a stage longer than 4.5 s with no change    (观众会走神)
//   ✗ a build/hybrid film whose scale never grows (单调的真正原因)
//   ✗ no hook, no turn, no payoff                 (缺段)
//   ✗ an increment stage with count < 2           (只有一次，读不出"越来越多")
//   ✗ a caption longer than 26 chars per line     (1080p 读不完)
//
// Exit code 1 means "do not render yet".
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/spec-to-film.mjs <spec.json> [--emit] [--table]');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(file, 'utf8'));
const ROLES = ['hook', 'setup', 'first-unit', 'accumulation', 'turn', 'cost', 'payoff', 'button'];
const PROBLEMS = [];
const WARN = [];
const bad = (m) => PROBLEMS.push(m);
const warn = (m) => WARN.push(m);

// ---------- 1 · shape ----------
for (const key of ['id', 'duration', 'fps', 'genre', 'stages']) {
  if (spec[key] == null) bad(`缺少 ${key}`);
}
if (!Array.isArray(spec.stages) || !spec.stages.length) bad('stages 不能为空');
const stages = spec.stages || [];

// ---------- 2 · timeline ----------
let prevEnd = 0;
for (const s of stages) {
  const [a, b] = s.t || [];
  if (!(b > a)) bad(`${s.id}: t 必须是 [起, 止] 且 止 > 起`);
  if (Math.abs(a - prevEnd) > 0.001) bad(`${s.id}: 起点 ${a}s 与上一段结束 ${prevEnd}s 不连续`);
  prevEnd = b;
}
if (Math.abs(prevEnd - spec.duration) > 0.05) bad(`最后一段结束于 ${prevEnd}s，但 duration 是 ${spec.duration}s`);

// ---------- 3 · the thing that makes a film monotonous ----------
const changesAt = (s) => (s.change && s.change.kind && s.change.kind !== 'none');
for (const s of stages) {
  const len = s.t[1] - s.t[0];
  if (len > 4.5 && !changesAt(s)) bad(`${s.id}: ${len.toFixed(1)}s 内没有可见变化（>4.5s 必走神）`);
  if (s.change && s.change.kind === 'increment' && (s.change.count || 0) < 2) {
    bad(`${s.id}: increment 只出现 ${s.change.count || 0} 次，观众读不出"越来越多"`);
  }
  if (!s.verb) bad(`${s.id}: 缺 verb（每段必须有一个可见动词）`);
  const zh = (s.caption && s.caption.zh) || '';
  if (zh.length > 26) warn(`${s.id}: 字幕 ${zh.length} 字，1080p 一行读不完（建议 ≤ 26）`);
}
const roles = new Set(stages.map((s) => s.role));
for (const r of ['hook', 'setup', 'accumulation', 'payoff', 'button']) {
  if (!roles.has(r)) bad(`缺 role=${r} 的段`);
}

// ---------- 4 · the scale ladder: every film, every genre (see 08-prompt-spec.md R1–R5) ----------
const ORDER = { object: 0, cluster: 1, field: 2, world: 3 };
const lvl = (s) => ORDER[s.scale];
const byRole = (r) => stages.filter((s) => s.role === r);

for (const s of stages) {
  if (ORDER[s.scale] == null) bad(`${s.id}: scale=${s.scale} 不在阶梯里（object/cluster/field/world）`);
}

// R3a: at least three distinct levels — a film that never leaves one level is monotonous
const used = new Set(stages.map((s) => s.scale).filter((v) => ORDER[v] != null));
if (used.size < 3) {
  bad(`整片只用到 ${used.size} 个尺度级别（${[...used].join('/')}）——至少 3 级，否则一定单调（R3）`);
}

// R3b: the payoff must sit above the accumulation
const acc = byRole('accumulation')[0];
const pay = byRole('payoff')[0];
if (acc && pay && lvl(pay) <= lvl(acc)) {
  bad(`payoff(${pay.scale}) 不高于 accumulation(${acc.scale})——落点升一级才成立（R3）`);
}

// R2: adjacent levels in use must step by a quantity order, and counts must not go backwards
const scaleSeq = [];
for (const s of stages) {
  if (ORDER[s.scale] == null) continue;
  if (!scaleSeq.length || scaleSeq[scaleSeq.length - 1] !== s.scale) scaleSeq.push(s.scale);
}
for (let i = 1; i < scaleSeq.length; i++) {
  if (lvl(scaleSeq[i]) < lvl(scaleSeq[i - 1]) - 1) {
    warn(`${scaleSeq[i - 1]} → ${scaleSeq[i]} 是一次两级的下落，观众会以为切了另一条片`);
  }
}
const counts = stages
  .filter((s) => s.change && ['increment', 'light-up', 'grow', 'spread'].includes(s.change.kind))
  .map((s) => ({ id: s.id, n: s.change.count || 0 }));
for (let i = 1; i < counts.length; i++) {
  if (counts[i].n > 0 && counts[i - 1].n > 0 && counts[i].n < counts[i - 1].n) {
    warn(`${counts[i].id}: 数量 ${counts[i].n} 小于上一段 ${counts[i - 1].id} 的 ${counts[i - 1].n}（R2 要求不回落）`);
  }
}
const bigJumps = counts.filter((c, i) => i > 0 && counts[i - 1].n > 0 && c.n >= counts[i - 1].n * 3).length;
if (spec.genre !== 'story' && counts.length >= 2 && bigJumps === 0) {
  warn('没有任何一次 ×3 的数量跃升（R2）——构建片靠跃升制造"变大"的体感');
}

// R5: a long accumulation has to run two tracks (add something, remove something)
if (acc) {
  const len = acc.t[1] - acc.t[0];
  if (len > 8 && !(acc.change && acc.change.also)) {
    bad(`${acc.id}: 累积段 ${len.toFixed(1)}s 只有单轨（只加不减）——超过 8s 必须有 change.also（R5）`);
  }
}

// genre-specific: a story film still needs the "gap in one frame" shot (cost or payoff at field+)
if (spec.genre === 'story') {
  const cost = byRole('cost')[0];
  if (cost && lvl(cost) < 2) warn(`cost(${cost.scale}) 建议放到 field/world：差距要同框才读得出`);
}

// ---------- 5 · what a renderer actually wants ----------
const camera = [];
for (const s of stages) {
  const c = s.camera || {};
  const push = (t, pos) => {
    const prev = camera[camera.length - 1];
    if (prev && Math.abs(prev.t - t) < 1e-6) { prev.pos = pos; prev.look = c.look || [0, 1, -4]; prev.fov = c.fov || 40; return; }
    camera.push({ t, pos, look: c.look || [0, 1, -4], fov: c.fov || 40 });
  };
  push(s.t[0], c.from || [0, 1.4, 5.5]);
  push(s.t[1], c.to || c.from || [0, 1.4, 5.5]);
}
const beats = {};
for (const s of stages) beats[s.id] = s.t;
const captions = stages
  .map((s) => ({ id: s.id, window: [s.t[0] + 0.4, s.t[1] - 0.4], ...(s.caption || {}) }))
  .filter((c) => c.zh);
const sfx = stages.flatMap((s) => (s.sfx || []).map(([name, t, o]) => [t, name, o || {}]));

// ---------- 6 · report ----------
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nspec   ${spec.id} · ${spec.title || ''} · ${spec.duration}s · ${spec.fps}fps · ${spec.aspect || '16:9'} · ${spec.genre}`);
console.log(`stages ${stages.length}   camera keys ${camera.length}   captions ${captions.length}   sfx ${sfx.length}\n`);
console.log(pad('#', 3) + pad('段', 16) + pad('时间', 13) + pad('占比', 7) + pad('scale', 9) + pad('变化', 22) + '动词');
stages.forEach((s, i) => {
  const len = s.t[1] - s.t[0];
  const pct = ((len / spec.duration) * 100).toFixed(0) + '%';
  const ch = s.change && s.change.kind !== 'none' ? `${s.change.kind}×${s.change.count}` : '—';
  console.log(pad(i + 1, 3) + pad(s.id, 16) + pad(`${s.t[0]}–${s.t[1]}s`, 13) + pad(pct, 7) + pad(s.scale, 9) + pad(ch, 22) + s.verb);
});

if (process.argv.includes('--table')) {
  console.log('\n| # | 时间(s) | 段 | 动词 | 变化 | 镜头 | 字幕 |');
  console.log('|---|---|---|---|---|---|---|');
  stages.forEach((s, i) => {
    const c = s.camera || {};
    const cam = `${(c.from || []).join(',')} → ${(c.to || c.from || []).join(',')} · fov ${c.fov || 40}`;
    console.log(`| ${i + 1} | ${s.t[0]}–${s.t[1]} | ${s.role} | ${s.verb} | ${s.change && s.change.what ? s.change.what : '—'} | ${cam} | ${(s.caption && s.caption.zh) || ''} |`);
  });
}

if (process.argv.includes('--emit')) {
  const js = (v) => JSON.stringify(v);
  console.log('\n// ---- paste into index.html (STORY + captions + sfx) ----');
  console.log('const STORY = {');
  console.log(`  duration: ${spec.duration},`);
  console.log('  camera: [');
  camera.forEach((c) => console.log(`    { t: ${c.t.toFixed(2)}, pos: ${js(c.pos)}, look: ${js(c.look)}, fov: ${c.fov} },`));
  console.log('  ],');
  console.log('  beats: {');
  Object.entries(beats).forEach(([k, v]) => console.log(`    ${k}: [${v[0]}, ${v[1]}],`));
  console.log('  },\n};');
  console.log('const CAPTIONS = [');
  captions.forEach((c) => console.log(`  { id: '${c.id}', win: [${c.window[0].toFixed(2)}, ${c.window[1].toFixed(2)}], zh: ${js(c.zh)}, en: ${js(c.en || '')} },`));
  console.log('];');
  console.log('const SFX = [');
  sfx.forEach(([t, name, o]) => console.log(`  [${t}, '${name}', ${js(o)}],`));
  console.log('];');
}

if (WARN.length) {
  console.log('\nwarnings');
  WARN.forEach((w) => console.log('  ! ' + w));
}
if (PROBLEMS.length) {
  console.log('\nproblems');
  PROBLEMS.forEach((p) => console.log('  ✗ ' + p));
  console.log(`\n${PROBLEMS.length} problem(s) — do not render yet.`);
  process.exit(1);
}
console.log('\n✓ spec is renderable');
