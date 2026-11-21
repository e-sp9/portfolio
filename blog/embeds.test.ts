import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { renderArticle } from './article';

test('article embeds retain their authored aspect ratio when constrained', async () => {
    const browser = await chromium.launch();
    try {
        const { outputs } = await Bun.build({ entrypoints: [new URL('../blog.css', import.meta.url).pathname] });
        const body = await renderArticle('<iframe width="560" height="315" src="about:blank"></iframe>', new Map());
        const page = await browser.newPage();
        await page.setContent(`<style>${await outputs[0]!.text()}</style><div class="article-body">${body}</div>`);
        for (const width of [318, 720]) {
            await page.locator('.article-body').evaluate((el, width) => { el.style.width = `${width}px`; }, width);
            const box = await page.locator('iframe').boundingBox();
            expect(box!.width).toBe(Math.min(width, 560));
            expect(box!.height).toBeCloseTo(box!.width * 315 / 560, 1);
        }
    } finally {
        await browser.close();
    }
});

test('embed sizing preserves styles and leaves missing or invalid dimensions alone', async () => {
    const styled = await renderArticle('<iframe width="400" height="300" style="border: 0" loading="eager"></iframe>', new Map());
    expect(styled).toContain('style="border: 0; aspect-ratio: 400 / 300; height: auto;"');
    expect(styled).toContain('loading="eager"');
    for (const dimensions of ['', 'width="560"', 'width="100%" height="315"', 'width="0" height="315"', 'width="560" height="-1"', 'width="Infinity" height="315"']) {
        const html = await renderArticle(`<iframe ${dimensions}></iframe>`, new Map());
        expect(html).not.toContain('aspect-ratio');
        expect(html).toContain('loading="lazy"');
    }
});
