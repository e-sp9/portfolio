// ─────────────────────────────────────────────────────────────────────────────
// Work pages — the cases at /work and one page per case at /work/<slug>.
// Same shell as the blog (header, CRT overlays, virtual screen, footer),
// written out as static HTML: these pages carry no script beyond the theme toggle.
// ─────────────────────────────────────────────────────────────────────────────

import { esc } from '../blog/html';
import { CASES, OPERATIONS, type WorkCase } from './cases';

const SITE_URL = 'https://esp-9.dev';
export const WORK_TITLE = 'RYOTA KATADA / WORK';
export const WORK_DESCRIPTION = 'Ryota Katada の仕事の事例と、それを支えているボット運用。';

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

    <!-- OGP -->
    <meta property="og:title" content="${esc(page.ogTitle ?? page.title)}">
    <meta property="og:description" content="${esc(page.description)}">
    <meta property="og:type" content="${page.ogType}">
    <meta property="og:url" content="${url}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@e___sp9">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@300;400;600&display=swap"
        rel="stylesheet">

    <!-- Styles -->
    <link rel="stylesheet" href="/work.css">

</head>

<body class="work-page">
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
            <a class="exp-type" href="/work">WORK</a>
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
    <main id="work-screen">
${page.main}
    </main>

    <!-- Footer -->
    <div id="exp-footer">
        <span class="ef-credit">Built with Bun</span>
        <span class="ef-copy">&copy; 2026 RYOTA KATADA</span>
    </div>

    <!-- Theme toggle (shares the \`portfolio-theme\` key with the other pages) -->
    <script>
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
                try {
                    localStorage.setItem('portfolio-theme', dark ? 'dark' : 'light');
                } catch (_) { }
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

function paragraphs(texts: string[]): string {
    return texts.map((text) => `                <p>${esc(text)}</p>`).join('\n');
}

/** A heading over its paragraphs */
function section(heading: string, texts: string[]): string {
    return `                <h2>${esc(heading)}</h2>
${paragraphs(texts)}`;
}

function card(item: WorkCase, index: number): string {
    return `            <article class="case panel" style="animation-delay: ${index * 60}ms">
                <div class="case-meta"><span class="case-no">CASE ${pad(index + 1)}</span></div>
                <h2 class="case-title"><a class="case-link" href="/work/${item.slug}">${esc(item.title)}</a></h2>
                <p class="case-summary">${esc(item.summary)}</p>
            </article>`;
}

/** The list at /work: every case as a card, then how they are run. */
export function renderIndex(): string {
    return layout({
        title: WORK_TITLE,
        ogType: 'website',
        description: WORK_DESCRIPTION,
        path: '/work',
        main: `        <div class="work-head">
            <h1 class="ph"><span class="dot b"></span> WORK</h1>
            <div class="work-sub">
                <span>CLIENT WORK</span>
                <span class="work-count">${pad(CASES.length)} CASES</span>
            </div>
        </div>

        <div class="work-column">
            <div class="cases-grid">
${CASES.map(card).join('\n')}
            </div>

            <section class="sheet sheet-body work-ops">
${section(OPERATIONS.title, OPERATIONS.paragraphs)}
            </section>
        </div>`,
    });
}

function neighbour(index: number, rel: 'prev' | 'next'): string {
    const item = CASES[index];
    if (!item) return '<span></span>';
    const label = rel === 'prev' ? `&#9664; CASE ${pad(index + 1)}` : `CASE ${pad(index + 1)} &#9654;`;
    return `<a class="case-nav-link panel" href="/work/${item.slug}" rel="${rel}">
                <span class="case-nav-label">${label}</span>
                <span class="case-nav-title">${esc(item.title)}</span>
            </a>`;
}

/** The case at /work/<slug>: the three sections of the manuscript, as they are. */
export function renderCase(index: number): string {
    const item = CASES[index];
    if (!item) throw new RangeError(`No case at index ${index}`);
    return layout({
        title: `${item.title} | RYOTA KATADA`,
        ogTitle: item.title,
        ogType: 'article',
        description: item.summary,
        path: `/work/${item.slug}`,
        main: `        <div class="work-head">
            <a class="work-link" href="/work">&#x2190; ALL WORK</a>
            <div class="work-sub">
                <span class="work-count">CASE ${pad(index + 1)} / ${pad(CASES.length)}</span>
            </div>
        </div>

        <article class="sheet">
            <header class="sheet-head">
                <div class="case-meta"><span class="case-no">CASE ${pad(index + 1)}</span></div>
                <h1 class="sheet-title">${esc(item.title)}</h1>
            </header>
            <div class="sheet-body">
${section('先方の困りごと', item.problem)}
${section('やったこと', item.work)}
${section('いまどうなったか', item.outcome)}
            </div>
        </article>

        <nav class="case-nav" aria-label="Other cases">
            ${neighbour(index - 1, 'prev')}
            ${neighbour(index + 1, 'next')}
        </nav>`,
    });
}
