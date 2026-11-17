// ─────────────────────────────────────────────────────────────────────────────
// Blog pages — the list at /blog and one page per article at /blog/<id>.
// Same shell as things.html (header, CRT overlays, virtual screen, footer),
// written out as static HTML: these pages carry no script beyond the theme toggle.
// ─────────────────────────────────────────────────────────────────────────────

import { renderArticle, resized } from './article';
import { esc } from './html';
import type { Eyecatch, Post } from './microcms';

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
    /** Contents of the virtual screen */
    main: string;
}

function layout(page: Page): string {
    const url = SITE_URL + page.path;
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
    <meta property="og:url" content="${url}">${page.head ?? ''}
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@e___sp9">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@300;400;600&display=swap"
        rel="stylesheet">

    <!-- Styles -->
    <link rel="stylesheet" href="/blog.css">

</head>

<body class="blog-page">
    <!-- Apply saved theme before first paint to avoid a light flash -->
    <script>
        try {
            if (localStorage.getItem('portfolio-theme') === 'dark') document.body.classList.add('dark-mode');
        } catch (_) { }
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
            <button id="theme-toggle" class="exp-btn" aria-label="Toggle dark/light mode">DARK</button>
            <a id="home-btn" class="exp-btn" href="/">&#x2190; HOME</a>
            <a id="blog-btn" class="exp-btn" href="https://www.kissa-katada.com" target="_blank">BLOG &#x2197;</a>
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
    <script>
        (() => {
            const toggle = document.getElementById('theme-toggle');
            let dark = document.body.classList.contains('dark-mode');
            const apply = () => {
                document.body.classList.toggle('dark-mode', dark);
                toggle.textContent = dark ? 'LIGHT' : 'DARK';
                toggle.classList.toggle('active', dark);
            };
            apply();
            toggle.addEventListener('click', () => {
                dark = !dark;
                try {
                    localStorage.setItem('portfolio-theme', dark ? 'dark' : 'light');
                } catch (_) { }
                apply();
            });
        })();
    </script>
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

/** Where an eyecatch is shown: the widths to ask the image API for (1x and 2x), and how wide it is on the page */
interface Frame {
    widths: readonly number[];
    sizes: string;
}

/** On a card: a column of the grid in blog.css */
const CARD: Frame = { widths: [400, 800], sizes: '(min-width: 1100px) 33vw, (min-width: 640px) 50vw, 100vw' };
/** Across the top of the article sheet, 800px at most */
const SHEET: Frame = { widths: [800, 1600], sizes: '(min-width: 860px) 800px, 100vw' };

/** The eyecatch as an <img>, sized for its frame. It stands for the post, so its alt is the title. */
function eyecatch(image: Eyecatch, title: string, frame: Frame, attributes: string): string {
    const sources = resized(image.url, image.width, frame.widths);
    const src = sources
        ? `src="${sources.src}"${sources.srcset ? ` srcset="${sources.srcset}" sizes="${frame.sizes}"` : ''}`
        : `src="${esc(image.url)}"`;
    const size = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : '';
    return `<img ${src}${size} alt="${esc(title)}" ${attributes} decoding="async">`;
}

function card(post: Post, index: number): string {
    // Cards fade in one after another, as on /things; past the first screens they stop waiting
    const delay = Math.min(index, 12) * 60;
    // A post without an eyecatch keeps the frame, so the cards in a row stay aligned
    const picture = post.eyecatch
        ? `<div class="post-eyecatch">${eyecatch(post.eyecatch, post.title, CARD, 'loading="lazy"')}</div>`
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
    const body = await renderArticle(post.content, new Map(posts.map((p) => [p.id, p.title])));
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
    <meta property="article:modified_time" content="${esc(post.revisedAt)}">`,
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
