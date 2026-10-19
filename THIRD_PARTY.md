# Third-party notices

## Bundled with this repository

| Library | Version (pinned) | License | Where |
|---|---|---|---|
| three.js | 0.181.2 | MIT | `assets/skeleton/three/` and every `examples/*/three/` (two files each: `three.module.min.js` + `three.core.min.js`, ~718 KB) |

three.js is bundled so that a fresh clone renders **offline with zero setup** — no network at
render time. The files are unmodified upstream builds and carry their own license header
(`@license Copyright 2010-2025 Three.js Authors — SPDX-License-Identifier: MIT`).
Upstream: https://github.com/mrdoob/three.js

## Fetched at runtime, never redistributed

| Library | Version (pinned) | License | How it is loaded |
|---|---|---|---|
| GSAP | 3.12.5 | GreenSock "standard no charge" — **not** an OSI license | from a CDN (`jsDelivr → unpkg → npmmirror`), or from a local `vendor/gsap.min.js` that **you** create with `node scripts/vendor-three.mjs .` (`vendor/` is git-ignored) |

Why GSAP is not bundled: its license is commercial (free for most uses, but not open source),
so this repository does not redistribute it. If you ship a product on top of it, read
https://gsap.com/licensing/ first. If you would rather not use GSAP at all, the contract in
`references/04-timeline.md` only needs **a paused, seekable timeline** — a t-driven
`requestAnimationFrame`/manual renderer satisfies it and the rest of the pipeline still works.

## Fonts

No font ships with this repository; captions fall back to the system CJK font, and the UI layer
uses the stack in `ui.css`. If you add a typeface, check its license first (Noto Sans SC is OFL;
many display fonts are not free for commercial use).

## Everything else

`SKILL.md`, `references/`, `assets/skeleton/*.js`, `assets/skeleton/*.css`, `scripts/*.mjs` and the
films in `examples/` are original work of this repository, released under the MIT license in
[LICENSE](LICENSE).
