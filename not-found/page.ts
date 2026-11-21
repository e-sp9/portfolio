// ─────────────────────────────────────────────────────────────────────────────
// The 404 page. Cloudflare's assets serve dist/404.html, with status 404, for
// any path that has no file (wrangler.jsonc: not_found_handling), so the page
// can show up at any depth: every URL in it is absolute.
// Same shell as /work (header, CRT overlays, virtual screen, footer), written
// out as static HTML: no script beyond the theme toggle and the path it shows.
// ─────────────────────────────────────────────────────────────────────────────

import { join } from 'node:path';
import { themeToggleScript } from '../blog/theme-toggle';

/** Where a lost reader can go next: the pages the header and the top page lead to */
export const NOT_FOUND_LINKS = [
    { label: 'HOME', path: '/' },
    { label: 'WORK', path: '/work' },
    { label: 'BLOG', path: '/blog' },
    { label: 'THINGS', path: '/things' },
    { label: 'HIRE', path: '/hire' },
] as const;

function link({ label, path }: (typeof NOT_FOUND_LINKS)[number]): string {
    return `                <a class="link-row" href="${path}">
                    <span class="link-icon">&#9654;</span>
                    <span class="link-label">${label}</span>
                    <span class="link-arrow">&rarr;</span>
                </a>`;
}

export function renderNotFound(): string {
    return `<!DOCTYPE html>
<html lang="ja">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RYOTA KATADA / 404</title>
    <meta name="robots" content="noindex">
    <meta name="theme-color" content="#f5f5f5">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@300;400&display=swap"
        rel="stylesheet">

    <!-- Styles -->
    <link rel="stylesheet" href="/not-found.css">

</head>

<body class="not-found-page">
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
            <span class="exp-type">404</span>
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
    <main id="nf-screen">
        <div class="nf-signal">
            <p class="nf-tag" aria-hidden="true">NO SIGNAL</p>
            <h1 class="nf-code">404</h1>
            <p class="nf-text">お探しのページは見つかりませんでした。</p>
            <p class="nf-path" hidden><span class="nf-path-label">URL</span><span id="nf-path"></span></p>
        </div>

        <nav class="panel nf-links" aria-label="Pages">
            <h2 class="ph"><span class="dot g"></span> PAGES</h2>
${NOT_FOUND_LINKS.map(link).join('\n')}
        </nav>
    </main>

    <!-- Footer -->
    <div id="exp-footer">
        <span class="ef-credit">Built with Bun</span>
        <span class="ef-copy">&copy; 2026 RYOTA KATADA</span>
    </div>

    <!-- The path that was asked for, so a typo shows -->
    <script>
        (() => {
            let path = location.pathname;
            try {
                path = decodeURI(path);
            } catch (_) { }
            document.getElementById('nf-path').textContent = path;
            document.querySelector('.nf-path').hidden = false;
        })();
    </script>
${themeToggleScript()}
    <!-- The switch in 3D, once the page has loaded (theme-switch.ts) -->
    <script type="module" src="/theme-switch.js"></script>
</body>

</html>
`;
}

/** not-found.css imports style.css, so the page loads one stylesheet. */
async function bundleStyles(): Promise<string> {
    const { outputs } = await Bun.build({ entrypoints: [join(import.meta.dir, '../not-found.css')] });
    return outputs[0]!.text();
}

/** The files the 404 page adds to dist/, by path */
export function notFoundFiles(): Map<string, () => string | Promise<string>> {
    return new Map<string, () => string | Promise<string>>([
        ['404.html', renderNotFound],
        ['not-found.css', bundleStyles],
    ]);
}

/** The 404 response of the dev server, as Cloudflare's assets give it in production */
export function serveNotFound(): Response {
    return new Response(renderNotFound(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** /not-found.css in development */
export async function serveNotFoundStyles(): Promise<Response> {
    return new Response(await bundleStyles(), { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
}
