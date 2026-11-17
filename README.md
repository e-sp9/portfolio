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

The build starts with the blog. Without the microCMS credentials it stops there with an error that
names what is missing, except on GitHub Actions, where it skips the blog with a warning (see [Blog](#blog)).

Pushing to `main` deploys automatically via GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Required secrets and
token permissions are described in [docs/DEPLOY.md](docs/DEPLOY.md) (Japanese).

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

The microCMS credentials are kept in a local `.env` (git-ignored) and nowhere else:

```bash
MICROCMS_SERVICE_DOMAIN=...   # the "xxx" of xxx.microcms.io
MICROCMS_API_KEY=...          # a key that can GET the `blogs` API
```

They are used at build time only. The GitHub Actions deploy has no keys, so it builds the site
without `/blog` and prints a warning: for now the blog exists in local builds only.

### Eyecatches

A post that has no eyecatch image in microCMS is given one by the build. The picture
([blog/eyecatch.ts](blog/eyecatch.ts)) is 1200×630 and has no text: a marbled current in a quiet
blue between ink and paper, with one or two warm veins, drawn in 3px dots under a grain like that
of film. The content ID seeds it, grain included, so a post always gets the same picture. The
build uploads the picture to the media library and sets it as the post's `eyecatch`. A post that
already has an eyecatch is never touched. That holds for an eyecatch set by hand while the build
runs, too: each post is read again right before its upload and right before the PATCH, and left
alone if it has one by then. Those reads use a URL that has never been asked before, so the CDN in
front of microCMS cannot answer them with what it kept from an earlier build or from one running
alongside. (microCMS has no conditional update, so an eyecatch set in the instant between that last
read and the PATCH can still be overwritten.)

This is the only thing the build writes to microCMS, and it takes a key of its own, also in `.env`:

```bash
MICROCMS_WRITE_API_KEY=...    # a key that can PATCH the `blogs` API and upload media (Management API)
```

Without that key the build generates nothing and goes on as before. With it, a write that
microCMS refuses stops the build with an error that names the request; the next build carries on
with the posts that are still without an eyecatch. To look at the pictures without writing
anything to microCMS:

```bash
bun run eyecatch:dry-run              # every post without an eyecatch -> out/eyecatch/<content ID>.png
bun run eyecatch:dry-run <id> <id>    # these posts; needs no credentials
```

Two things to know before the key goes in. microCMS counts setting the eyecatch as a revision of
the post, so from the next build on the article page shows that day as its update date. And the
pages of this site do not show eyecatches yet (no image on the cards, no `og:image`): the picture
is only stored with the post.

## Design

Layout, layer stack, and visual language are documented in [docs/DESIGN.md](docs/DESIGN.md).
