import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unesc } from '../blog/html';
import { buildWork } from './build';
import { CASES, OPERATIONS } from './cases';
import { renderCase, renderIndex } from './pages';
import { serveWork } from './site';

/** What a reader sees: tags dropped, character references decoded */
const text = (html: string) => unesc(html.replace(/<[^>]+>/g, ''));

/** Every sentence the site shows for the cases */
const allText = [
    ...CASES.flatMap((item) => [item.title, item.summary, ...item.problem, ...item.work, ...item.outcome]),
    OPERATIONS.title,
    ...OPERATIONS.paragraphs,
];

describe('text', () => {
    test('speaks as 私, and calls the cases by their headings', () => {
        for (const sentence of allText) {
            expect(sentence).not.toContain('本人');
            expect(sentence).not.toContain('人紹DB');
            expect(sentence.replaceAll('ベンチャーキャピタル向けCRM', '')).not.toContain('CRM');
        }
    });

    test('every case has a page of its own', () => {
        const slugs = CASES.map((item) => item.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });
});

describe('pages', () => {
    test('the list links every case by its title, with its summary, then the bot operation', () => {
        const html = renderIndex();
        for (const item of CASES) {
            expect(html).toContain(`<a class="case-link" href="/work/${item.slug}">${item.title}</a>`);
            expect(html).toContain(item.summary);
        }
        const page = text(html);
        expect(page.indexOf(OPERATIONS.title)).toBeGreaterThan(page.indexOf(CASES.at(-1)!.summary));
        for (const paragraph of OPERATIONS.paragraphs) expect(page).toContain(paragraph);
    });

    test('a case page carries the three sections of the manuscript, in order', () => {
        CASES.forEach((item, index) => {
            const page = text(renderCase(index));
            const order = [
                item.title,
                '先方の困りごと', ...item.problem,
                'やったこと', ...item.work,
                'いまどうなったか', ...item.outcome,
            ].map((part) => page.indexOf(part));
            expect(order).not.toContain(-1);
            expect(order).toEqual([...order].sort((a, b) => a - b));
        });
    });

    test('a case page links its neighbours', () => {
        const first = renderCase(0);
        expect(first).not.toContain('rel="prev"');
        expect(first).toContain(`<a class="case-nav-link panel" href="/work/${CASES[1]!.slug}" rel="next">`);
        const last = renderCase(CASES.length - 1);
        expect(last).toContain(`<a class="case-nav-link panel" href="/work/${CASES.at(-2)!.slug}" rel="prev">`);
        expect(last).not.toContain('rel="next"');
    });

    test('the top page shows every case with the same summary and links to /work', async () => {
        const top = await Bun.file(join(import.meta.dir, '../index.html')).text();
        for (const item of CASES) {
            expect(top).toContain(`<a class="work-entry" href="/work/${item.slug}">`);
            expect(top).toContain(`<span class="work-name">${item.title}</span>`);
            expect(top).toContain(`<span class="work-desc">${item.summary}</span>`);
        }
        expect(top).toContain('<a class="ph-link" href="/work">');
    });
});

describe('build', () => {
    let dist: string;

    beforeEach(async () => {
        dist = await mkdtemp(join(tmpdir(), 'work-build-'));
        spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(async () => {
        mock.restore();
        await rm(dist, { recursive: true, force: true });
    });

    test('writes the list, a page per case and the stylesheet, where the static assets look for /work and /work/<slug>', async () => {
        await Bun.write(join(dist, 'work/renamed.html'), 'left by an earlier build');
        await buildWork(dist);
        expect((await readdir(dist, { recursive: true })).sort()).toEqual(
            ['work', 'work.css', 'work.html', ...CASES.map((item) => `work/${item.slug}.html`)].sort(),
        );
        const css = await Bun.file(join(dist, 'work.css')).text();
        expect(css).toContain('#work-screen');
        expect(css).toContain('.panel');
    });
});

describe('dev server', () => {
    test('serves /work and each case the way the static assets do, and nothing else', async () => {
        const get = (path: string) => serveWork(new Request(`http://localhost${path}`));
        for (const path of ['/work', '/work/', ...CASES.map((item) => `/work/${item.slug}`)]) {
            const res = await get(path);
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
        }
        expect((await get('/work.css')).headers.get('Content-Type')).toBe('text/css; charset=utf-8');
        expect((await get('/work/unknown')).status).toBe(404);
    });
});
