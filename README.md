# esp-9.dev

Source of **[esp-9.dev](https://esp-9.dev)** — my personal portfolio.

A CRT-monitor-styled single page: procedurally generated 3D models of gadgets I own
(Game Boy Advance, Game Boy Color, DualShock 4) float and slowly rotate at the center,
rendered as translucent glass with crisp feature edges, framed by status panels.

## Stack

- [Bun](https://bun.com) — runtime, bundler, and dev server (HTML imports, no bundler config)
- [Three.js](https://threejs.org) — WebGL rendering: AgX tone mapping, fat edge lines via `LineSegments2`
- [glTF Transform](https://gltf-transform.dev) — `.glb` export in the model generation scripts
- [microCMS](https://microcms.io) — where the blog posts are written; fetched at build time
- [Shiki](https://shiki.style) — syntax highlighting of the code blocks in posts, also at build time
- [Cloudflare Workers](https://workers.cloudflare.com) — static assets plus a tiny Worker that 301-redirects `www.esp-9.dev` to the apex

## Development

```bash
bun install
bun run dev     # http://localhost:3000 with HMR
bun test        # tests of the blog generator
```

`/blog` needs the microCMS credentials in `.env` (see [Blog](#blog)); the other pages work without them.

## Build & deploy

```bash
bun run build   # generate /blog, bundle index.html + things.html into dist/, copy public/
bun run deploy  # wrangler deploy
```

The build starts with the blog. Without the microCMS credentials, or when the posts cannot be
fetched, it stops there with an error, on GitHub Actions too: a deploy never goes out without `/blog`.

Pushing to `main`, and publishing, updating, unpublishing or deleting a post in microCMS, deploy
automatically via GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).
Required secrets, the microCMS webhook, and token permissions are described in
[docs/DEPLOY.md](docs/DEPLOY.md) (Japanese).

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

## Things

[`/things`](https://esp-9.dev/things) is a grid of stuff I like. Each card shows a photo,
name, category, a one-liner, and a link. To add one: drop the photo into `public/things/`
and add one entry to [things.ts](things.ts). The page is `things.html` +
`things-page.ts` + `things.css`, built alongside the top page.

## Blog

`/blog` lists the posts I write in microCMS. Each post gets a page at
`/blog/<content ID>`, and `/blog/feed.xml` is the RSS feed. All of it is static: the build
([blog/build.ts](blog/build.ts)) fetches every post once, rewrites the body for reading
([blog/article.ts](blog/article.ts): highlighted code, WebP images sized for the text column)
and writes plain HTML plus one stylesheet ([blog.css](blog.css)). The only script on these pages
is the theme toggle.

The microCMS credentials are kept in a local `.env` (git-ignored), and as GitHub Secrets for the deploy workflow:

```bash
MICROCMS_SERVICE_DOMAIN=...   # the "xxx" of xxx.microcms.io
MICROCMS_API_KEY=...          # a key that can GET the `blogs` API
```

They are used at build time only; the deploy workflow passes them to its build step alone.
A microCMS webhook starts that workflow (`repository_dispatch`) whenever a post is published, updated,
unpublished or deleted, so the live `/blog` follows the CMS without a local build.

## Design

Layout, layer stack, and visual language are documented in [docs/DESIGN.md](docs/DESIGN.md).
