// ─────────────────────────────────────────────────────────────────────────────
// Blog pages — the list at /blog and one page per article at /blog/<id>.
// Same shell as things.html (header, CRT overlays, virtual screen, footer),
// written out as static HTML: these pages carry no script beyond the theme toggle.
// ─────────────────────────────────────────────────────────────────────────────

import { type Frame, renderArticle, resized, shared, WIDE_SCALE } from './article';
import { esc } from './html';
import type { Eyecatch, Post } from './microcms';
import { jsonLd } from '../discovery';

export const SITE_URL = 'https://esp-9.dev';
export const BLOG_TITLE = 'RYOTA KATADA / BLOG';
export const BLOG_DESCRIPTION = '技術とガジェットとコーヒーと、日々のこと。Ryota Katada のブログです。';

const JST_DATE = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** ISO 8601 → YYYY.MM.DD in Japan time */
function formatDate(iso: string): string {
    return JST_DATE.format(new Date(iso)).replaceAll('/', '.');
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

interface Page {
    /** Document title */
    title: string;
    /** Title when shared; defaults to the document title */
    ogTitle?: string;
    ogType: 'website' | 'article';
    description: string;
    /** Site-relative URL of the page */
    path: string;
    /** Extra tags for <head> */
    head?: string;
    /** Picture shown with a shared link */
    image?: { url: string; width: number; height: number; alt: string };
    /** Contents of the virtual screen */
    main: string;
}

function layout(page: Page): string {
    const url = SITE_URL + page.path;
    const { image } = page;
    // The large card only for a picture that fills it without being blown up: from 600 × 315, the size Facebook shows large
    const card = image && image.width >= 600 && image.height >= 315 ? 'summary_large_image' : 'summary';
    return `<!DOCTYPE html>
<html lang="ja">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}">
    <meta name="theme-color" content="#f5f5f5">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="canonical" href="${url}">
    <link rel="alternate" type="application/rss+xml" title="${BLOG_TITLE}" href="/blog/feed.xml">

    <!-- OGP -->
    <meta property="og:title" content="${esc(page.ogTitle ?? page.title)}">
    <meta property="og:description" content="${esc(page.description)}">
    <meta property="og:type" content="${page.ogType}">
    <meta property="og:url" content="${url}">${page.head ?? ''}${image ? `
    <meta property="og:image" content="${esc(image.url)}">${image.width && image.height ? `
    <meta property="og:image:width" content="${image.width}">
    <meta property="og:image:height" content="${image.height}">` : ''}
    <meta property="og:image:alt" content="${esc(image.alt)}">` : ''}
    <meta name="twitter:card" content="${card}">
    <meta name="twitter:site" content="@e___sp9">${image ? `
    <meta name="twitter:image" content="${esc(image.url)}">
    <meta name="twitter:image:alt" content="${esc(image.alt)}">` : ''}

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@300;400;600&display=swap"
        rel="stylesheet">

    <!-- Styles -->
    <link rel="stylesheet" href="/blog.css">

</head>

<body class="blog-page">
    <!-- Apply saved theme -->
    <script type="module">
        import { safeGetItem } from '/storage.js';
        if (safeGetItem('portfolio-theme') === 'dark') document.body.classList.add('dark-mode');
    </script>
    <!-- CRT Effects -->
    <div id="scanlines"></div>
    <div id="dither"></div>

    <!-- Header -->
    <div id="exp-header">
        <div class="exp-left">
            <a class="exp-label" href="/">RYOTA KATADA</a>
            <span class="exp-sep">/</span>
            <a class="exp-type" href="/blog">BLOG</a>
        </div>
        <div class="exp-right">
            <button type="button" id="theme-toggle" class="exp-btn" role="switch" aria-checked="false" aria-label="Dark mode">
                <span class="ts-visual"></span>
            </button>
            <a id="home-btn" class="exp-btn" href="/">&#x2190; HOME</a>
            <a id="blog-btn" class="exp-btn" href="/blog">BLOG</a>
        </div>
    </div>

    <!-- Virtual Screen -->
    <main id="blog-screen">
${page.main}
    </main>

    <!-- Footer -->
    <div id="exp-footer">
        <span class="ef-credit">Built with Bun + microCMS</span>
        <span class="ef-copy">&copy; 2026 RYOTA KATADA</span>
    </div>

    <!-- Theme toggle (shares the \`portfolio-theme\` key with the other pages) -->
    <script type="module">
        import { safeSetItem } from '/storage.js';
        (() => {
            const toggle = document.getElementById('theme-toggle');
            let dark = document.body.classList.contains('dark-mode');
            // The switch follows body.dark-mode (style.css, theme-switch-3d.ts); aria-checked tells assistive tech
            const apply = () => {
                document.body.classList.toggle('dark-mode', dark);
                toggle.setAttribute('aria-checked', String(dark));
            };
            apply();
            toggle.addEventListener('click', () => {
                dark = !dark;
                safeSetItem('portfolio-theme', dark ? 'dark' : 'light');
                apply();
            });
        })();
    </script>
    <!-- The switch in 3D, once the page has loaded (theme-switch.ts) -->
    <script type="module" src="/theme-switch.js"></script>
</body>

</html>
`;
}

function meta(post: Post): string {
    const category = post.category ? `<span class="post-cat">${esc(post.category.toUpperCase())}</span>` : '';
    return `${category}<time class="post-date" datetime="${esc(post.publishedAt)}">${formatDate(post.publishedAt)}</time>`;
}

function tags(post: Post): string {
    if (post.tags.length === 0) return '';
    return `<ul class="post-tags">${post.tags.map((tag) => `<li>#${esc(tag)}</li>`).join('')}</ul>`;
}

/**
 * On a card: a column of the grid in blog.css, less the margins of the screen, the gaps and the borders.
 * With two columns, the narrowest margins (below 768px) are counted, so it never comes out short.
 * Above 1440px the frame is narrower than the screen less its margins, so three columns come out a little long.
 */
const CARD: Frame = {
    widths: [400, 600, 800],
    sizes: '(min-width: 1100px) calc((100vw - 204px) / 3), (min-width: 640px) calc(50vw - 28px), calc(100vw - 40px)',
};
/** Across the top of the article sheet, 800px at most (more above 1440px); below that, the page less the margins, which narrow at 768px */
const SHEET: Frame = {
    widths: [800, 1200, 1600],
    sizes: `(min-width: 1441px) ${Math.ceil(800 * WIDE_SCALE)}px, (min-width: 860px) 800px, (min-width: 769px) calc(100vw - 60px), calc(100vw - 40px)`,
};

/** Cards whose eyecatch loads at once: what the first screen of most displays shows (two rows of three, or three of two). The rest wait until they are scrolled near. */
const EAGER_CARDS = 6;

/** The eyecatch as an image sized for its frame. It stands for the post, so its alt is the title. */
function eyecatch(image: Eyecatch, title: string, frame: Frame, loading: string): string {
    const sources = resized(image.url, image.width, frame);
    const attributes = [
        ...(sources ? sources.img.map(([name, value]) => `${name}="${value}"`) : [`src="${esc(image.url)}"`]),
        ...(image.width && image.height ? [`width="${image.width}"`, `height="${image.height}"`] : []),
        `alt="${esc(title)}"`,
        loading,
        'decoding="async"',
    ].filter(Boolean).join(' ');
    return sources ? `<picture>${sources.source}<img ${attributes}></picture>` : `<img ${attributes}>`;
}

function card(post: Post, index: number): string {
    // Cards fade in one after another, as on /things; past the first screens they stop waiting
    const delay = Math.min(index, 12) * 60;
    // The first eyecatch is the largest thing on the first screen, so it goes first
    const loading = index === 0 ? 'fetchpriority="high"' : index < EAGER_CARDS ? '' : 'loading="lazy"';
    // A post without an eyecatch keeps the frame, so the cards in a row stay aligned
    const picture = post.eyecatch
        ? `<div class="post-eyecatch">${eyecatch(post.eyecatch, post.title, CARD, loading)}</div>`
        : '<div class="post-eyecatch post-eyecatch-none" aria-hidden="true">NO SIGNAL</div>';
    const description = post.description && `<p class="post-desc">${esc(post.description)}</p>`;
    return `            <article class="post panel" style="animation-delay: ${delay}ms">
                ${picture}
                <div class="post-body">
                    <div class="post-meta">${meta(post)}</div>
                    <h2 class="post-title"><a class="post-link" href="/blog/${post.id}">${esc(post.title)}</a></h2>
                    ${description}
                    ${tags(post)}
                </div>
            </article>`;
}

/** The list at /blog: every post as a card, newest first. */
export function renderIndex(posts: Post[]): string {
    return layout({
        title: BLOG_TITLE,
        ogType: 'website',
        description: BLOG_DESCRIPTION,
        path: '/blog',
        main: `        <div class="blog-head">
            <h1 class="ph"><span class="dot b"></span> BLOG</h1>
            <div class="blog-sub">
                <span>STUFF I WROTE</span>
                <span class="blog-count">${pad(posts.length)} POSTS</span>
                <a class="blog-link" href="/blog/feed.xml">RSS</a>
            </div>
        </div>

        <div class="posts-grid">
${posts.map(card).join('\n')}
        </div>`,
    });
}

function neighbour(post: Post | undefined, rel: 'prev' | 'next'): string {
    if (!post) return '<span></span>';
    const label = rel === 'prev' ? '&#9664; OLDER' : 'NEWER &#9654;';
    return `<a class="article-nav-link panel" href="/blog/${post.id}" rel="${rel}">
                <span class="article-nav-label">${label}</span>
                <span class="article-nav-title">${esc(post.title)}</span>
            </a>`;
}

/** The article at /blog/<id>. `posts` is the whole list, newest first. */
export async function renderPost(posts: Post[], index: number): Promise<string> {
    const post = posts[index];
    if (!post) throw new RangeError(`No post at index ${index}`);
    // Without an eyecatch, the first image of the body is the one that may be on the first screen
    const body = await renderArticle(post.content, new Map(posts.map((p) => [p.id, p.title])), { eagerFirstImage: !post.eyecatch });
    // The revision date only shows when it is a later day than the publication
    const revised = formatDate(post.revisedAt);
    const sub = tags(post) + (revised === formatDate(post.publishedAt)
        ? ''
        : `<span class="article-revised">UPDATED <time datetime="${esc(post.revisedAt)}">${revised}</time></span>`);

    return layout({
        title: `${post.title} | RYOTA KATADA`,
        ogTitle: post.title,
        ogType: 'article',
        description: post.description || BLOG_DESCRIPTION,
        path: `/blog/${post.id}`,
        head: `
    <meta property="article:published_time" content="${esc(post.publishedAt)}">
    <meta property="article:modified_time" content="${esc(post.revisedAt)}">
    ${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        url: `${SITE_URL}/blog/${post.id}`,
        datePublished: post.publishedAt,
        ...(revised === formatDate(post.publishedAt) ? {} : { dateModified: post.revisedAt }),
    })}`,
        image: post.eyecatch ? { ...shared(post.eyecatch.url, post.eyecatch.width, post.eyecatch.height), alt: post.title } : undefined,
        main: `        <div class="blog-head">
            <a class="blog-link" href="/blog">&#x2190; ALL POSTS</a>
            <div class="blog-sub">
                <span class="blog-count">POST ${pad(posts.length - index)} / ${pad(posts.length)}</span>
            </div>
        </div>

        <article class="article">${post.eyecatch ? `
            <div class="article-eyecatch">${eyecatch(post.eyecatch, post.title, SHEET, 'fetchpriority="high"')}</div>` : ''}
            <header class="article-head">
                <div class="post-meta">${meta(post)}</div>
                <h1 class="article-title">${esc(post.title)}</h1>${sub && `
                <div class="article-sub">${sub}</div>`}
            </header>
            <div class="article-body">
${body}
            </div>
        </article>

        <nav class="article-nav" aria-label="Other posts">
            ${neighbour(posts[index + 1], 'prev')}
            ${neighbour(posts[index - 1], 'next')}
        </nav>`,
    });
}
