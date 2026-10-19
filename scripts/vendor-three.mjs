#!/usr/bin/env node
// Freeze the CDN dependencies into ./vendor so renders work offline and are reproducible.
//
//   node scripts/vendor-three.mjs            → writes vendor/ next to the skeleton
//   node scripts/vendor-three.mjs path/to/film
//
// The skeleton already lists ./vendor/… as the LAST fallback, so nothing else needs editing.

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const THREE_VERSION = '0.181.2';
const GSAP_VERSION = '3.12.5';

const MIRRORS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
  'https://cdn.npmmirror.com/packages',
];

const FILES = [
  // three ships as two files: the module imports ./three.core.min.js next to it
  { name: 'three.module.min.js', pkg: `three@${THREE_VERSION}/build/three.module.min.js`, mirrorPath: `three/${THREE_VERSION}/files/build/three.module.min.js` },
  { name: 'three.core.min.js', pkg: `three@${THREE_VERSION}/build/three.core.min.js`, mirrorPath: `three/${THREE_VERSION}/files/build/three.core.min.js` },
  { name: 'gsap.min.js', pkg: `gsap@${GSAP_VERSION}/dist/gsap.min.js`, mirrorPath: `gsap/${GSAP_VERSION}/files/dist/gsap.min.js` },
];

const target = resolve(process.argv[2] || join(HERE, '..', 'assets', 'skeleton'));
const vendorDir = join(target, 'vendor');

async function fetchFirst(file) {
  const urls = MIRRORS.map((m) => `${m}/${m.includes('npmmirror') ? file.mirrorPath : file.pkg}`);
  const errors = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error('suspiciously small');
      return { buf, url };
    } catch (e) {
      errors.push(`${url} → ${e.message}`);
    }
  }
  throw new Error(`all mirrors failed for ${file.name}:\n  ${errors.join('\n  ')}`);
}

await mkdir(vendorDir, { recursive: true });
console.log(`vendoring into ${vendorDir}`);

for (const file of FILES) {
  const { buf, url } = await fetchFirst(file);
  await writeFile(join(vendorDir, file.name), buf);
  const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  console.log(`  ✓ ${file.name.padEnd(22)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  sha256:${sha}  (${new URL(url).host})`);
}

const listing = await readdir(vendorDir);
console.log(`\ndone — ${listing.length} file(s) in vendor/. The page will now boot offline.`);
console.log('note: vendor/ is git-ignored on purpose; re-run this script on a new machine.');
