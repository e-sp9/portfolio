import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSitemap } from '../discovery';
import { buildNotFound } from './build';
import { NOT_FOUND_LINKS, renderNotFound, serveNotFound } from './page';

const root = join(import.meta.dir, '..');

describe('page', () => {
    test('every URL in it is absolute, so it renders at any depth', () => {
        const urls = [...renderNotFound().matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1]!);
        expect(urls.length).toBeGreaterThan(10);
        for (const url of urls) expect(url).toMatch(/^(\/|https:\/\/)/);
    });

    test('is kept out of search results and share cards', () => {
        const html = renderNotFound();
        expect(html).toContain('<meta name="robots" content="noindex">');
        expect(html).not.toContain('rel="canonical"');
        expect(html).not.toContain('og:url');
    });

    test('links to the main pages, each one listed in the sitemap', () => {
        const html = renderNotFound();
        const sitemap = renderSitemap([], []);
        for (const { label, path } of NOT_FOUND_LINKS) {
            expect(html).toContain(`<a class="link-row" href="${path}">`);
            expect(html).toContain(`<span class="link-label">${label}</span>`);
            expect(sitemap).toContain(`<loc>https://esp-9.dev${path}</loc>`);
        }
    });

    test('shows the path that was asked for as text, never as markup', () => {
        const html = renderNotFound();
        expect(html).toContain('<p class="nf-path" hidden>');
        expect(html).toContain("document.getElementById('nf-path').textContent = path;");
        expect(html).not.toContain('innerHTML');
    });
});

describe('build', () => {
    test('writes dist/404.html and its one stylesheet', async () => {
        const dist = await mkdtemp(join(tmpdir(), 'not-found-'));
        try {
            await buildNotFound(dist);
            expect((await readdir(dist)).sort()).toEqual(['404.html', 'not-found.css']);
            expect(await Bun.file(join(dist, '404.html')).text()).toBe(renderNotFound());
            const css = await Bun.file(join(dist, 'not-found.css')).text();
            expect(css).not.toContain('@import');
            // style.css is bundled in, then this page's rules
            expect(css).toContain('#theme-toggle');
            expect(css).toContain('#nf-screen');
        } finally {
            await rm(dist, { recursive: true, force: true });
        }
    });

    test('runs in `bun run build`, and Cloudflare serves it for paths with no file', async () => {
        const pkg = await Bun.file(join(root, 'package.json')).json();
        expect(pkg.scripts.build).toContain('&& bun ./not-found/build.ts &&');
        const wrangler = await Bun.file(join(root, 'wrangler.jsonc')).text();
        expect(wrangler).toContain('"not_found_handling": "404-page"');
    });

    test('the dev server answers with the same page and status', async () => {
        const response = serveNotFound();
        expect(response.status).toBe(404);
        expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
        expect(await response.text()).toBe(renderNotFound());
    });
});
