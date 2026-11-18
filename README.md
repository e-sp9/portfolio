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
bun test        # tests of the blog and /work generators
```

`/blog` needs the microCMS credentials in `.env` (see [Blog](#blog)); the other pages work without them.

## Build & deploy

```bash
bun run build   # bundle index.html + things.html + hire.html into dist/, generate /blog and /work, copy public/
bun run deploy  # wrangler deploy
```

The blog comes right after the pages are bundled, since it also writes into the top page (see
[On the top page](#on-the-top-page)). Without the microCMS credentials, or when the posts cannot be
fetched, the build stops there with an error, on GitHub Actions too: a deploy never goes out without `/blog`.

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

## Work

[`/work`](https://esp-9.dev/work) shows my client work as case studies: a card per case, then a
section on the bot operation behind them. Each case gets a page at `/work/<slug>`. The text lives in
[work/cases.ts](work/cases.ts), and the build ([work/build.ts](work/build.ts)) writes static HTML plus
one stylesheet ([work.css](work.css)). To add a case, add one entry there, and a card for it to the
WORK panel in `index.html`; the tests check that the top page and the manifest agree.

## Hire

[`/hire`](https://esp-9.dev/hire) is where to ask me for work: what I can take on, the kinds of
work I accept, and how to reach me. It is a static page, `hire.html` + `hire.css` (plus the theme toggle
in `hire-page.ts`), built alongside the top page and linked from its LINKS panel.

## Blog

`/blog` lists the posts I write in microCMS. Each post gets a page at
`/blog/<content ID>`, and `/blog/feed.xml` is the RSS feed. All of it is static: the build
([blog/build.ts](blog/build.ts)) fetches every post once, rewrites the body for reading
([blog/article.ts](blog/article.ts): highlighted code, AVIF and WebP images sized for the text column)
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

### On the top page

The WRITING panel of the top page is the way in. It lists the posts tagged `おすすめ` in microCMS,
newest first, then a link to `/blog`, then my posts on other sites (written in [index.html](index.html)).
The build puts the tagged posts into the bundled `dist/index.html`
([blog/entrance.ts](blog/entrance.ts)), so tagging or untagging a post changes the top page with the
next deploy, and the webhook starts that deploy. With no post tagged, or no such tag at all, the
panel starts with the link to `/blog`. `bun run dev` serves `index.html` as it is, without the tagged
posts; to see them, build and serve `dist/`.

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

This is the only thing the build writes to microCMS, and it takes a key of its own, also in `.env`,
and as a GitHub Secret for the deploy workflow if the automatic deploys should generate eyecatches too:

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
picture shows on the site from that build on: on the post's card in the list and above the title of
its article, and as the picture of a shared link to the article (`og:image`).

## Design

Layout, layer stack, and visual language are documented in [docs/DESIGN.md](docs/DESIGN.md).
