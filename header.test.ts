import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { renderIndex as renderBlog } from './blog/pages';
import { renderIndex as renderWork } from './work/pages';
import { renderNotFound } from './not-found/page';

/** The theme switch of a page, whitespace collapsed */
const toggleOf = (html: string) =>
    html.match(/<button type="button" id="theme-toggle"[^>]*>[\s\S]*?<\/button>/)?.[0].replace(/\s+/g, ' ');

describe('theme toggle', () => {
    test('every page has the same switch, with no text but its name', async () => {
        const read = (name: string) => Bun.file(join(import.meta.dir, name)).text();
        const pages = [
            await read('index.html'),
            await read('things.html'),
            await read('hire.html'),
            renderWork(),
            renderBlog([]),
            renderNotFound(),
        ].map(toggleOf);

        const [top] = pages;
        // The markup says light; each page's script sets aria-checked from the saved theme
        expect(top).toBe('<button type="button" id="theme-toggle" class="exp-btn" role="switch" '
            + 'aria-checked="false" aria-label="Dark mode"> <span class="ts-visual"></span> </button>');
        for (const page of pages) expect(page).toBe(top);
    });

    test('the CSS switch needs no color-mix(), so it shows where the 3D cannot load', async () => {
        const css = (await Bun.file(join(import.meta.dir, 'style.css')).text()).replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
            .filter(([, selector]) => selector!.includes('#theme-toggle'));
        expect(rules.length).toBeGreaterThan(5);
        for (const [, selector, body] of rules) expect(`${selector}{${body}}`).not.toContain('color-mix(');
    });

    test('/blog, /work and the 404 page load the 3D switch, which the build writes to dist/', async () => {
        for (const page of [renderWork(), renderBlog([]), renderNotFound()]) {
            expect(page).toContain('<script type="module" src="/theme-switch.js"></script>');
        }
        const pkg = await Bun.file(join(import.meta.dir, 'package.json')).json();
        expect(pkg.scripts.build).toContain('./theme-switch.ts --outdir ./dist --splitting');
    });
});
