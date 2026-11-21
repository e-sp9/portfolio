import { expect, test } from 'bun:test';
import { renderNotFound } from '../not-found/page';
import { renderCase, renderIndex as renderWorkIndex } from '../work/pages';
import post from './fixtures/theme-toggle/post.json';
import { renderIndex, renderPost } from './pages';
import { THEME_TOGGLE_SCRIPT } from './theme-toggle';

const pages = [
    ['blog-index', () => renderIndex([post])],
    ['blog-empty', () => renderIndex([])],
    ['blog-post', () => renderPost([post], 0)],
    ['work-index', () => renderWorkIndex()],
    ['work-case', () => renderCase(0)],
    ['404', () => renderNotFound()],
] as const;

for (const [name, render] of pages) {
    test(`${name} includes one shared controller immediately before the 3D switch`, async () => {
        const html = await render();

        expect(html.split(THEME_TOGGLE_SCRIPT)).toHaveLength(2);
        expect(html).toContain(THEME_TOGGLE_SCRIPT + `
    <!-- The switch in 3D, once the page has loaded (theme-switch.ts) -->
    <script type="module" src="/theme-switch.js"></script>`);
        expect(html.split("localStorage.setItem('portfolio-theme'")).toHaveLength(2);
    });
}
