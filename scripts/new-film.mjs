#!/usr/bin/env node
// Start a new film from the skeleton.
//
//   node scripts/new-film.mjs my-film
//   node scripts/new-film.mjs my-film --title "一只猫的春天"
//
// Copies assets/skeleton → my-film, rewrites the composition id + <title>,
// and prints the three commands that turn it into an mp4.

import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
if (!name) {
  console.error('usage: node scripts/new-film.mjs <folder> [--title "标题"]');
  process.exit(2);
}
const ti = args.indexOf('--title');
const title = ti >= 0 && args[ti + 1] ? args[ti + 1] : name;

const dest = resolve(name);
await mkdir(dest, { recursive: true });
await cp(join(ROOT, 'assets', 'skeleton'), dest, {
  recursive: true,
  filter: (src) => !/[\\/](out|vendor|node_modules)[\\/]/.test(src),
});

const indexPath = join(dest, 'index.html');
let html = await readFile(indexPath, 'utf8');
html = html
  .replace(/data-composition-id="[^"]*"/, `data-composition-id="${name}"`)
  .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  .replace(/window\.__timelines\['story-to-film-skeleton'\]/g, `window.__timelines['${name}']`);
await writeFile(indexPath, html, 'utf8');

console.log(`created ${dest}`);
console.log(`
next:
  cd ${name}
  1. edit the STORY block in index.html (beats + camera keys + caption)
  2. om still . --at 1,6,11,16      # look at four frames
  3. om render . --fps 60           # out/<name>-v1.mp4
     (no om CLI? node ../scripts/vendor-three.mjs . && render with any headless Chrome)

reminder: every frame must be a pure function of t — no Date.now, no Math.random.`);
