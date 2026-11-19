import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { renderIndex as renderBlog } from './blog/pages';
import { renderIndex as renderWork } from './work/pages';

/** The LIGHT / DARK control of a page, whitespace collapsed */
const toggleOf = (html: string) =>
    html.match(/<div id="theme-toggle"[^>]*>[\s\S]*?<\/div>/)?.[0].replace(/\s+/g, ' ');

describe('theme toggle', () => {
    test('every page has the same LIGHT / DARK pair, a button per theme', async () => {
        const read = (name: string) => Bun.file(join(import.meta.dir, name)).text();
        const pages = [
            await read('index.html'),
            await read('things.html'),
            await read('hire.html'),
            renderWork(),
            renderBlog([]),
        ].map(toggleOf);

        const [top] = pages;
        expect(top).toContain('role="group" aria-label="Color theme"');
        // The markup says light; each page's script sets aria-pressed from the saved theme
        expect(top).toContain('<button type="button" class="exp-btn" data-theme="light" aria-pressed="true">LIGHT</button>');
        expect(top).toContain('<button type="button" class="exp-btn" data-theme="dark" aria-pressed="false">DARK</button>');
        for (const page of pages) expect(page).toBe(top);
    });
});
