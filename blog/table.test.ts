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
        const url = `https://example.com/${'very-long-path-without-breaks'.repeat(6)}`;
        for (const value of ['Short text', url, `<a href="${url}">${url}</a>`, 'unbroken'.repeat(24), '']) {
            const content = `<table><tr><th>Item</th><th>Description</th><th>URL</th></tr><tr><td>TypeScript</td><td>日本語とEnglish</td><td>${value}</td></tr></table>`;
            await page.setContent(await renderPost([{ ...post, content }], 0));
            await page.evaluate(() => document.fonts.ready);
            const layout = await page.locator('table').evaluate((table: HTMLTableElement) => {
                const wordLines = (cell: HTMLTableCellElement, word: string) => {
                    const node = cell.firstChild!;
                    const start = node.textContent!.indexOf(word);
                    const range = document.createRange();
                    range.setStart(node, start);
                    range.setEnd(node, start + word.length);
                    return new Set(Array.from(range.getClientRects(), rect => rect.top)).size;
                };
                const row = table.rows[1]!;
                return {
                    wordLines: [wordLines(row.cells[0]!, 'TypeScript'), wordLines(row.cells[1]!, 'English')],
                    headerWrap: getComputedStyle(table.rows[0]!.cells[1]!).whiteSpace,
                    cellWrap: getComputedStyle(row.cells[2]!).overflowWrap,
                    tokenWidth: row.cells[2]!.getBoundingClientRect().width,
                    tokenOverflows: row.cells[2]!.scrollWidth > row.cells[2]!.clientWidth,
                    rowHeight: row.getBoundingClientRect().height,
                    scroll: getComputedStyle(table.parentElement!).overflowX,
                    pageWidth: document.documentElement.scrollWidth,
                };
            });
            expect(layout.wordLines).toEqual([1, 1]);
            expect(layout.headerWrap).toBe('nowrap');
            expect(layout.cellWrap).toBe('break-word');
            expect(layout.tokenWidth).toBeLessThanOrEqual(270);
            expect(layout.tokenOverflows).toBe(false);
            expect(layout.rowHeight).toBeLessThan(257);
            if (value.length > 100) expect(layout.tokenWidth).toBeGreaterThanOrEqual(210);
            expect(layout.scroll).toBe('auto');
            expect(layout.pageWidth).toBe(390);
        }
        await page.locator('th').nth(1).evaluate(cell => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            if (range.getClientRects().length !== 1) throw new Error('Header wraps');
        });
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
