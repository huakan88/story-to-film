#!/usr/bin/env node
// push-to-github — publish this folder with the GitHub REST API, no `git` needed.
//
// Why: on some machines (behind a proxy, or in a sandbox) `git push` cannot open a connection to
// github.com even though HTTPS works from Node. This script writes the same objects git would:
// blobs → one tree (the folder's exact contents, so deletions happen too) → a commit → the branch.
//
//   node scripts/push-to-github.mjs --owner you --repo my-film --message "add film"
//   node scripts/push-to-github.mjs --dry                # show what would change, upload nothing
//
// Auth: GITHUB_TOKEN, or an existing `gh auth token`. Nothing is written to disk except the upload.
//
// Skips (same intent as .gitignore): .git/, node_modules/, out/, vendor/, .om/, files starting with _,
// OS junk. Pass --all to send everything.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : fallback;
};
const DRY = argv.includes('--dry');
const ALL = argv.includes('--all');
const DIR = resolve(flag('dir', '.'));
const BRANCH = String(flag('branch', 'main'));
const MESSAGE = String(flag('message', 'update ' + new Date().toISOString().slice(0, 10)));

const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'vendor', '.om', '.github-cache']);
const skip = (rel) => {
  if (ALL) return false;
  const parts = rel.split('/');
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  return parts.some((p) => p.startsWith('_')) || /^(Thumbs\.db|\.DS_Store)$/.test(parts.at(-1));
};

// ---------- identify the repository ----------
const token = process.env.GITHUB_TOKEN || (() => {
  try { return execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch { return ''; }
})();
if (!token) {
  console.error('no token: set GITHUB_TOKEN, or run `gh auth login` once');
  process.exit(1);
}
const api = async (method, path, body) => {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: 'token ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'story-to-film-pusher',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
};

let owner = flag('owner'), repo = flag('repo');
if ((!owner || !repo) && existsSync(join(DIR, '.git'))) {
  try {
    const url = execSync('git remote get-url origin', { cwd: DIR, encoding: 'utf8' }).trim();
    const m = /github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
    if (m) { owner = owner || m[1]; repo = repo || m[2]; }
  } catch { /* no remote */ }
}
if (!owner || !repo) {
  console.error('need --owner and --repo (or a git remote named origin)');
  process.exit(1);
}

// ---------- collect the local tree ----------
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(DIR, full).split(sep).join('/');
    const st = statSync(full);
    if (st.isDirectory()) { if (!skip(rel + '/')) walk(full); }
    else if (!skip(rel)) files.push({ rel, full, size: st.size });
  }
};
walk(DIR);

// ---------- remote state ----------
let remoteHead = null, remoteTree = null, remoteFiles = new Map();
try {
  const ref = await api('GET', `/repos/${owner}/${repo}/git/ref/heads/${BRANCH}`);
  remoteHead = ref.object.sha;
  const commit = await api('GET', `/repos/${owner}/${repo}/git/commits/${remoteHead}`);
  remoteTree = commit.tree.sha;
  const tree = await api('GET', `/repos/${owner}/${repo}/git/trees/${remoteTree}?recursive=1`);
  for (const t of tree.tree || []) if (t.type === 'blob') remoteFiles.set(t.path, t.sha);
} catch (e) {
  if (e.status === 404) console.log('remote branch not found — this will be the first commit');
  else if (e.status === 409) console.log('remote repository is empty');
  else throw e;
}

// ---------- what changed ----------
const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const upload = [], unchanged = [];
for (const f of files) {
  const buf = readFileSync(f.full);
  f.sha = blobSha(buf);
  f.buf = buf;
  if (remoteFiles.get(f.rel) === f.sha) unchanged.push(f.rel); else upload.push(f);
}
const localPaths = new Set(files.map((f) => f.rel));
const deletions = [...remoteFiles.keys()].filter((p) => !localPaths.has(p));

console.log(`${owner}/${repo}@${BRANCH}`);
console.log(`  local   ${files.length} file(s), ${(files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(2)} MB`);
console.log(`  upload  ${upload.length} · unchanged ${unchanged.length} · delete ${deletions.length}`);
for (const f of upload) console.log(`    + ${f.rel}  ${Math.round(f.size / 1024)}KB`);
for (const p of deletions) console.log(`    - ${p}`);
if (DRY) { console.log('\n--dry: nothing uploaded'); process.exit(0); }
if (!upload.length && !deletions.length) { console.log('\nnode: tree is already up to date'); process.exit(0); }

// ---------- blobs → tree → commit → ref ----------
const entries = [];
for (const f of upload) {
  const blob = await api('POST', `/repos/${owner}/${repo}/git/blobs`, {
    content: f.buf.toString('base64'),
    encoding: 'base64',
  });
  entries.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
}
// Files that did not change keep their existing blob — but never re-add a path we just uploaded,
// or the stale entry would appear later in the tree array and silently win.
const uploaded = new Set(entries.map((e) => e.path));
const keep = [...remoteFiles.entries()].filter(([p]) => localPaths.has(p) && !uploaded.has(p));
const tree = await api('POST', `/repos/${owner}/${repo}/git/trees`, {
  tree: [...entries, ...keep.map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha }))],
});
if (remoteHead && tree.sha === remoteTree) { console.log('\ntree unchanged'); process.exit(0); }

const commit = await api('POST', `/repos/${owner}/${repo}/git/commits`, {
  message: MESSAGE,
  tree: tree.sha,
  parents: remoteHead ? [remoteHead] : [],
});

if (remoteHead) {
  await api('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
} else {
  await api('POST', `/repos/${owner}/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
}
console.log(`\n✓ pushed ${upload.length} blob(s), ${deletions.length} deletion(s)`);
console.log(`  https://github.com/${owner}/${repo}/commit/${commit.sha}`);

// ---------- verify: every local file must now be the remote blob ----------
const after = await api('GET', `/repos/${owner}/${repo}/git/trees/${tree.sha}?recursive=1`);
const remoteNow = new Map((after.tree || []).filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
const wrong = files.filter((f) => remoteNow.get(f.rel) !== f.sha);
if (wrong.length) {
  console.error('\n✗ verification failed — these paths are not what you uploaded:');
  for (const f of wrong) console.error(`    ${f.rel}  local ${f.sha.slice(0, 8)} vs remote ${String(remoteNow.get(f.rel)).slice(0, 8)}`);
  process.exit(1);
}
console.log(`  verified: ${files.length} remote blob(s) match the local files`);
