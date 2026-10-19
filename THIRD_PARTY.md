# Third-party notices

This project **does not redistribute** any third-party library inside `assets/skeleton/`.
The runtime dependencies are fetched at load time from a CDN, or vendored locally on your
machine by `scripts/vendor-three.mjs` (that folder is git-ignored).

| Library | Version (pinned) | License | Source |
|---|---|---|---|
| three.js | 0.181.2 | MIT | https://github.com/mrdoob/three.js |
| GSAP | 3.14.x | "Standard no charge" (GreenSock) — **not** an OSI license | https://gsap.com/licensing/ |

## What that means for you

- **three.js (MIT)**: free to use, modify and redistribute with attribution. The CDN
  fallback chain in `assets/skeleton/index.html` pins `three@0.181.2`.
- **GSAP**: free for most uses under GreenSock's standard no-charge license, but it is a
  commercial license, not an open-source one. This project therefore never bundles GSAP;
  `scripts/vendor-three.mjs` downloads it **to your machine only**. If you ship a product
  built on top of GSAP, check GreenSock's current terms — or swap the animation layer for
  a plain `requestAnimationFrame`/`t`-driven renderer (the contract in
  `references/04-timeline.md` only requires a seekable, paused timeline).

## Fonts

`assets/skeleton/` does not ship any font. The captions fall back to the system CJK font.
If you want a specific typeface, add it yourself and check its license
(e.g. Noto Sans SC is OFL; many display fonts are not free for commercial use).

## Everything else

`SKILL.md`, `references/`, `assets/skeleton/*.js`, `scripts/*.mjs` and the example films in
`examples/` are original work of this repository, released under the MIT license in
[LICENSE](LICENSE).
