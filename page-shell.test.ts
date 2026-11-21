import { describe, expect, test } from 'bun:test';
import type { Post } from './blog/microcms';
import { renderIndex as blogIndex, renderPost } from './blog/pages';
import { renderNotFound } from './not-found/page';
import { PAGE_ICONS, renderPageShell } from './page-shell';
import { CASES } from './work/cases';
import { renderCase, renderIndex as workIndex } from './work/pages';

const post: Post = {
    id: 'shell-test', title: '技術 & coffee', description: '', content: '<p>Hello</p>',
    publishedAt: '2025-01-01T00:00:00Z', revisedAt: '2025-01-01T00:00:00Z',
    category: null, tags: [], eyecatch: null,
};

function expectShell(html: string): void {
    const pieces = [
        PAGE_ICONS, "localStorage.getItem('portfolio-theme')", 'id="scanlines"', 'id="dither"',
        'id="exp-header"', 'id="theme-toggle"', '<main id=', 'id="exp-footer"',
        '<!-- Theme toggle', 'src="/theme-switch.js"',
    ];
    let previous = -1;
    for (const piece of pieces) {
        expect(html.split(piece).length - 1).toBe(1);
        const position = html.indexOf(piece);
        expect(position).toBeGreaterThan(previous);
        previous = position;
    }
}

describe('shared page shell', () => {
    test('appears once and in order in every page renderer', async () => {
        const pages = [blogIndex([]), blogIndex([post]), await renderPost([post], 0), workIndex(),
            ...CASES.map((_, index) => renderCase(index)), renderNotFound()];
        for (const html of pages) expectShell(html);
    });

    test('keeps the 404 path script before the theme toggle', () => {
        const html = renderNotFound();
        expect(html).toContain('<span class="exp-type">404</span>');
        expect(html.indexOf('let path = location.pathname')).toBeGreaterThan(html.indexOf('id="exp-footer"'));
        expect(html.indexOf('let path = location.pathname')).toBeLessThan(html.indexOf('<!-- Theme toggle'));
    });

    test('accepts empty content and omits optional scripts and section links', () => {
        const html = renderPageShell({ bodyClass: 'test-page', section: { label: 'TEST' }, screenId: 'test-screen', main: '', credit: '' });
        expect(html).toContain('<main id="test-screen">\n\n    </main>');
        expect(html).toContain('<span class="exp-type">TEST</span>');
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('null');
    });

    test('escapes shell text and attributes while keeping supplied markup', () => {
        const html = renderPageShell({ bodyClass: 'a"b', section: { label: '<BLOG>', href: '/?a=1&b=2' }, screenId: 'a"b', main: '<p>Body</p>', credit: 'Bun & microCMS', beforeTheme: '<script>custom()</script>\n' });
        expect(html).toContain('class="a&quot;b"');
        expect(html).toContain('id="a&quot;b"');
        expect(html).toContain('href="/?a=1&amp;b=2">&lt;BLOG&gt;</a>');
        expect(html).toContain('Bun &amp; microCMS');
        expect(html).toContain('<p>Body</p>');
        expect(html).toContain('<script>custom()</script>\n');
    });

    test('preserves renderer errors for nonexistent content', async () => {
        expect(() => renderCase(-1)).toThrow(RangeError);
        await expect(renderPost([], 0)).rejects.toThrow(RangeError);
    });
});
