// ─────────────────────────────────────────────────────────────────────────────
// The 404 page. Cloudflare's assets serve dist/404.html, with status 404, for
// any path that has no file (wrangler.jsonc: not_found_handling), so the page
// can show up at any depth: every URL in it is absolute.
// Same shell as /work (header, CRT overlays, virtual screen, footer), written
// out as static HTML: no script beyond the theme toggle and the path it shows.
// ─────────────────────────────────────────────────────────────────────────────

import { join } from 'node:path';
import { PAGE_ICONS, renderFonts, renderPageShell } from '../page-shell';

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
${PAGE_ICONS}

${renderFonts('300;400')}

    <!-- Styles -->
    <link rel="stylesheet" href="/not-found.css">

</head>

${renderPageShell({
        bodyClass: 'not-found-page',
        section: { label: '404' },
        screenId: 'nf-screen',
        credit: 'Built with Bun',
        main: `        <div class="nf-signal">
            <p class="nf-tag" aria-hidden="true">NO SIGNAL</p>
            <h1 class="nf-code">404</h1>
            <p class="nf-text">お探しのページは見つかりませんでした。</p>
            <p class="nf-path" hidden><span class="nf-path-label">URL</span><span id="nf-path"></span></p>
        </div>

        <nav class="panel nf-links" aria-label="Pages">
            <h2 class="ph"><span class="dot g"></span> PAGES</h2>
${NOT_FOUND_LINKS.map(link).join('\n')}
        </nav>`,
        beforeTheme: `    <!-- The path that was asked for, so a typo shows -->
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
`,
    })}`;
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
