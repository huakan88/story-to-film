#!/usr/bin/env node
// selfcheck — the repository's own gate. No browser, no network, ~100 ms.
//   node scripts/selfcheck.mjs
// Checks, for every film project in the repo:
//   · the composition root declares id / width / height / duration / fps
//   · every relative <script src> / <link href> exists on disk
//   · the 3D layer and the 2D layer are present (world-kit.js, ui.js, ui.css)
//   · the page's own code is deterministic: no Date.now / performance.now / Math.random
// and, repo-wide: every .mjs parses, and every relative link in README/SKILL resolves.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(process.argv[2] || '.');
const problems = [];
const notes = [];
const rel = (p) => relative(ROOT, p).split(sep).join('/');

// ---------- 1. projects ----------
const projects = [];
const consider = (dir) => {
  if (dir.includes('three') || dir.includes('vendor')) return;
  if (existsSync(join(dir, 'index.html'))) projects.push(dir);
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory() && full !== dir) {
      const depth = rel(full).split('/').length;
      if (depth <= 2 && !['three', 'vendor', 'assets', 'scripts', 'references'].includes(name)) consider(full);
    }
  }
};
for (const top of ['assets', 'examples']) {
  const base = join(ROOT, top);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const full = join(base, name);
    if (statSync(full).isDirectory()) consider(full);
  }
}

const REQUIRED_ATTRS = ['data-composition-id', 'data-width', 'data-height', 'data-duration'];
for (const dir of projects) {
  const file = join(dir, 'index.html');
  const html = readFileSync(file, 'utf8');
  const root = /<[a-z][\w-]*\b[^>]*\sdata-composition-id\s*=[^>]*>/i.exec(html)?.[0] || '';
  const name = rel(dir);

  for (const attr of REQUIRED_ATTRS) {
    if (!new RegExp(attr + '\\s*=', 'i').test(root)) problems.push(`${name}: root element is missing ${attr}`);
  }
  for (const layer of ['world-kit.js', 'ui.js', 'ui.css']) {
    if (!existsSync(join(dir, layer))) problems.push(`${name}: missing ${layer}`);
  }

  // relative assets must exist (a 404 in the browser is a blank frame, not a warning)
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|data:|#)/i.test(ref)) continue;          // CDN / inline — allowed
    const target = resolve(dir, ref);
    if (!existsSync(target) && !ref.startsWith('vendor/')) { // vendor/ is created on demand
      problems.push(`${name}: references missing file ${ref}`);
    }
  }

  // determinism: the film must be a pure function of t
  const code = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')); // keep line numbers
  code.split('\n').forEach((line, i) => {
    const text = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//, '');
    for (const [re, why] of [
      [/(^|[^.\w])Date\.now\s*\(/, 'Date.now() — a render-time clock'],
      [/(^|[^.\w])performance\.now\s*\(/, 'performance.now() — a render-time clock'],
      [/(^|[^.\w])Math\.random\s*\(/, 'Math.random() — unseeded; use K.rand(seed)'],
    ]) {
      if (re.test(text)) problems.push(`${name}: index.html:${i + 1} uses ${why}`);
    }
  });
}

// ---------- 2. scripts parse ----------
const scriptsDir = join(ROOT, 'scripts');
if (existsSync(scriptsDir)) {
  for (const f of readdirSync(scriptsDir).filter((f) => /\.(mjs|js)$/.test(f))) {
    const full = join(scriptsDir, f);
    try { execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' }); }
    catch (e) { problems.push(`scripts/${f}: does not parse\n${String(e.stderr || e.message).split('\n')[0]}`); }
  }
}

// ---------- 3. docs links ----------
for (const doc of ['README.md', 'SKILL.md', 'CONTRIBUTING.md', 'THIRD_PARTY.md']) {
  const full = join(ROOT, doc);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, 'utf8');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    let link = m[1];
    if (/^(https?:|mailto:|#)/i.test(link)) continue;
    link = link.split('#')[0];
    if (!link) continue;
    if (!existsSync(resolve(dirname(full), link))) problems.push(`${doc}: link target missing — ${link}`);
  }
}

// ---------- report ----------
const list = (items) => items.map((p) => '  ✗ ' + p).join('\n');
if (projects.length === 0) problems.push('no film project found (expected assets/skeleton/index.html)');
notes.push(`${projects.length} project(s): ${projects.map(rel).join(', ')}`);

if (problems.length) {
  console.error('selfcheck failed\n' + list(problems) + '\n\n' + notes.join('\n'));
  process.exit(1);
}
console.log('selfcheck ok — ' + notes.join(' · '));
