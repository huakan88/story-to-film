#!/usr/bin/env node
// Start a new film from the skeleton.
//
//   node scripts/new-film.mjs my-film
//   node scripts/new-film.mjs my-film --title "一只猫的春天"
//
// Copies assets/skeleton → my-film (minus its own self-check stills), renames the
// composition id to a slug of the folder name, and drops a story.md to fill in.

import { cp, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('--'));
if (!dirArg) {
  console.error('usage: node scripts/new-film.mjs <folder> [--title "标题"]');
  process.exit(2);
}
const ti = args.indexOf('--title');
const title = ti >= 0 && args[ti + 1] ? args[ti + 1] : basename(dirArg);

// the composition id must be a slug: it becomes window.__timelines[<id>]
const slug = basename(dirArg)
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'film';

const dest = resolve(dirArg);
try {
  await access(join(dest, 'index.html'));
  console.error(`${dest} already has an index.html — pick an empty folder`);
  process.exit(1);
} catch { /* good: empty */ }
await mkdir(dest, { recursive: true });

await cp(join(ROOT, 'assets', 'skeleton'), dest, {
  recursive: true,
  // the skeleton's own verification stills and vendored copies are not part of a new film
  filter: (src) => !/[\\/](out|vendor|node_modules|_selfcheck|_verify)[\\/]/.test(src + '\\'),
});

const indexPath = join(dest, 'index.html');
let html = await readFile(indexPath, 'utf8');
html = html
  .replace(/data-composition-id="[^"]*"/, `data-composition-id="${slug}"`)
  .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
await writeFile(indexPath, html, 'utf8');

// story.md is the first deliverable of the workflow: the 8 beats, before any code.
// Unwrap the fill-in template (it keeps its own ```markdown fence) and title it.
const beats = await readFile(join(ROOT, 'assets', 'beats-template.md'), 'utf8');
const fenced = /```markdown\r?\n([\s\S]*?)```/.exec(beats);
const after = /```\r?\n([\s\S]*)$/.exec(beats);
const body = (fenced ? fenced[1] : beats).replace(/^# <片名>\s*/m, `# ${title}\n`);
await writeFile(join(dest, 'story.md'), body.trimEnd() + '\n' + (after ? '\n' + after[1].trim() + '\n' : ''), 'utf8');

console.log(`created ${dest}   (composition id: ${slug})`);
console.log(`
next:
  cd ${dirArg}
  1. fill story.md (8 beats) — that decides the shots
  2. edit the STORY block in index.html (beats + camera keys + caption)
  3. om still . --at 1,6,11,16      # look at four frames
  4. om check .                     # structure / motion / text checks
  5. om render . --fps 60           # out/<name>-v1.mp4

no om CLI? node ${join(ROOT, 'scripts', 'vendor-three.mjs')} . then render with any headless Chrome.

reminder: every frame must be a pure function of t — no Date.now, no Math.random.`);
