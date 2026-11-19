import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { renderIndex as renderBlog } from './blog/pages';
import { renderIndex as renderWork } from './work/pages';

/** The theme switch of a page, whitespace collapsed */
const toggleOf = (html: string) =>
    html.match(/<button type="button" id="theme-toggle"[^>]*>[\s\S]*?<\/button>/)?.[0].replace(/\s+/g, ' ');

describe('theme toggle', () => {
    test('every page has the same lever switch, labelled LIGHT and DARK', async () => {
        const read = (name: string) => Bun.file(join(import.meta.dir, name)).text();
        const pages = [
            await read('index.html'),
            await read('things.html'),
            await read('hire.html'),
            renderWork(),
            renderBlog([]),
        ].map(toggleOf);

        const [top] = pages;
        // The markup says light; each page's script sets aria-checked from the saved theme
        expect(top).toContain('role="switch" aria-checked="false" aria-label="Dark mode"');
        expect(top).toContain('<span class="ts-lever"></span>');
        expect(top).toContain('<span class="ts-light">LIGHT</span><span class="ts-dark">DARK</span>');
        for (const page of pages) expect(page).toBe(top);
    });
});
