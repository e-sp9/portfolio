# esp-9.dev

Source of **[esp-9.dev](https://esp-9.dev)** — my personal portfolio.

A CRT-monitor-styled single page: procedurally generated 3D models of gadgets I own
(Game Boy Advance, Game Boy Color, DualShock 4) float and slowly rotate at the center,
rendered as translucent glass with crisp feature edges, framed by status panels.

## Stack

- [Bun](https://bun.com) — runtime, bundler, and dev server (HTML imports, no bundler config)
- [Three.js](https://threejs.org) — WebGL rendering: AgX tone mapping, fat edge lines via `LineSegments2`
- [glTF Transform](https://gltf-transform.dev) — `.glb` export in the model generation scripts
- [Cloudflare Workers](https://workers.cloudflare.com) — static assets plus a tiny Worker that 301-redirects `www.esp-9.dev` to the apex

## Development

```bash
bun install
bun run dev     # http://localhost:3000 with HMR
```

## Build & deploy

```bash
bun run build   # bundle index.html into dist/ and copy public/
bun run deploy  # wrangler deploy
```

## 3D models

Models are not sculpted in a DCC tool — each one is built in code with three.js math,
using proportions measured from reference photos of the real hardware, then exported
to `.glb` with glTF Transform:

```bash
bun scripts/generate-gbc.ts   # -> public/models/gbc.glb
bun scripts/generate-ds4.ts   # -> public/models/ds4.glb
```

The viewer ([main.ts](main.ts)) re-materializes every mesh as translucent glass and
draws edge lines with an 8° threshold, so smooth surfaces stay clean while deliberate
feature edges read as crisp outlines. A mesh named `screen` gets the dark glossy
screen material.

To add a model to the rotation: drop the `.glb` into `public/models/` and add one
entry to [models.ts](models.ts) — it automatically joins the random rotation and the
footer model selector.

## Design

Layout, layer stack, and visual language are documented in [docs/DESIGN.md](docs/DESIGN.md).
