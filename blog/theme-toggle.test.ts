import { expect, test } from 'bun:test';
import { renderNotFound } from '../not-found/page';
import { renderCase, renderIndex as renderWorkIndex } from '../work/pages';
import post from './fixtures/theme-toggle/post.json';
import { renderIndex, renderPost } from './pages';
import { themeToggleScript } from './theme-toggle';

const pages = [
    ['blog-index', () => renderIndex([post])],
    ['blog-empty', () => renderIndex([])],
    ['blog-post', () => renderPost([post], 0)],
    ['work-index', () => renderWorkIndex()],
    ['work-case', () => renderCase(0)],
    ['404', () => renderNotFound()],
] as const;

for (const [name, render] of pages) {
    test(`${name} preserves the pre-refactor HTML and controller position`, async () => {
        const before = await Bun.file(new URL(`./fixtures/theme-toggle/${name}.html`, import.meta.url)).text();
        const after = await render();
        const controller = themeToggleScript();

        expect(Buffer.from(after)).toEqual(Buffer.from(before));
        expect(after.split(controller)).toHaveLength(2);
        expect(after.indexOf(controller)).toBe(before.indexOf(controller));
    });
}
