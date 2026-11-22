import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { renderPost } from './pages';
import post from './fixtures/theme-toggle/post.json';

test('mobile tables keep readable columns, intact headers and contained overflow', async () => {
    const { outputs } = await Bun.build({ entrypoints: [`${import.meta.dir}/../blog.css`] });
    const css = await outputs[0]!.text();
    const server = Bun.serve({
        port: 0,
        async fetch(req) {
            if (new URL(req.url).pathname === '/blog.css') {
                return new Response(css, { headers: { 'content-type': 'text/css' } });
            }
            return new Response('', { headers: { 'content-type': 'text/javascript' } });
        },
    });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto(server.url.href);
        for (const value of ['Short text', `https://example.com/${'unbroken'.repeat(24)}`, '']) {
            const content = `<table><tr><th>Item</th><th>Description</th><th>URL</th></tr><tr><td>TypeScript</td><td>説明</td><td>${value}</td></tr></table>`;
            await page.setContent(await renderPost([{ ...post, content }], 0));
            await page.evaluate(() => document.fonts.ready);
            const layout = await page.locator('table').evaluate((table: HTMLTableElement) => ({
                widths: Array.from(table.rows[0]!.cells, cell => cell.getBoundingClientRect().width),
                headerWrap: getComputedStyle(table.rows[0]!.cells[1]!).whiteSpace,
                cellWrap: getComputedStyle(table.rows[1]!.cells[2]!).overflowWrap,
                scroll: getComputedStyle(table.parentElement!).overflowX,
                pageWidth: document.documentElement.scrollWidth,
            }));
            expect(layout.widths.every(width => width >= 70)).toBe(true);
            expect(layout.headerWrap).toBe('nowrap');
            expect(layout.cellWrap).toBe('anywhere');
            expect(layout.scroll).toBe('auto');
            expect(layout.pageWidth).toBe(390);
        }
        await page.locator('table').evaluate(table => {
            table.style.width = '1200px';
        });
        const wrapper = page.locator('.table-scroll');
        expect(await wrapper.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        await wrapper.evaluate(el => { el.scrollLeft = 200; });
        expect(await wrapper.evaluate(el => el.scrollLeft)).toBe(200);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    } finally {
        await browser.close();
        server.stop(true);
    }
}, 30_000);
