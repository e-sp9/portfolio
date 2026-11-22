import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { renderPost } from './pages';
import post from './fixtures/theme-toggle/post.json';

test('printed code wraps highlighted and plain long lines without clipping', async () => {
    const { outputs } = await Bun.build({ entrypoints: [`${import.meta.dir}/../blog.css`] });
    const css = await outputs[0]!.text();
    const content = [
        `<div data-filename="example.ts"><pre><code class="language-typescript">const endpoint = "https://example.com/${'long-path'.repeat(60)}";\nconsole.log(endpoint);</code></pre></div>`,
        `<pre><code class="language-unknown">${'unbroken'.repeat(80)}</code></pre>`,
        '<pre><code></code></pre>',
    ].join('');
    const html = await renderPost([{ ...post, content }], 0);
    const server = Bun.serve({
        port: 0,
        fetch(req) {
            const styles = new URL(req.url).pathname === '/blog.css';
            return new Response(styles ? css : html, {
                headers: { 'content-type': styles ? 'text/css' : 'text/html' },
            });
        },
    });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
        await page.route('https://**/*', route => route.abort());
        await page.goto(server.url.href);
        await page.emulateMedia({ media: 'print' });
        expect(await page.locator('pre.shiki').count()).toBe(3);
        const blocks = await page.locator('.code-block').evaluateAll(blocks => blocks.map(block => ({
            overflow: [block, ...Array.from(block.querySelectorAll('pre, code'))].some(el => el.scrollWidth > el.clientWidth),
            whiteSpace: getComputedStyle(block.querySelector('code')!).whiteSpace,
            overflowX: getComputedStyle(block.querySelector('pre')!).overflowX,
        })));
        expect(blocks).toHaveLength(3);
        for (const block of blocks) {
            expect(block.overflow).toBe(false);
            expect(block.whiteSpace).toBe('pre-wrap');
            expect(block.overflowX).toBe('visible');
        }
    } finally {
        await browser.close();
        server.stop(true);
    }
}, 30_000);
