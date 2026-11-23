import { expect, test } from 'bun:test';
import type { Post } from './blog/microcms';
import { renderIndex as blogIndex, renderPost } from './blog/pages';
import { renderNotFound } from './not-found/page';
import { CASES } from './work/cases';
import { renderCase, renderIndex as workIndex } from './work/pages';

function expectNonBlockingFonts(html: string): void {
    expect(html).toContain('href="https://fonts.gstatic.com" crossorigin');
    expect(html).toContain('rel="stylesheet" media="print" onload="this.onload=null;this.media=\'all\'"');
    expect(html).toMatch(/<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*rel="stylesheet">[\s\S]*<\/noscript>/);
    const head = html.slice(0, html.indexOf('</head>'));
    const blocking = head.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
        .match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g)!
        .filter(link => !link.includes('media="print"'));
    expect(blocking).toEqual([]);
}

test('homepage fonts load without a render-blocking stylesheet and retain a no-script fallback', async () => {
    expectNonBlockingFonts(await Bun.file(new URL('./index.html', import.meta.url)).text());
});

test('generated blog, work and 404 pages load fonts the same way', async () => {
    const post: Post = {
        id: 'fonts-test', title: 'Fonts', description: '', content: '<p>Hello</p>',
        publishedAt: '2025-01-01T00:00:00Z', revisedAt: '2025-01-01T00:00:00Z',
        category: null, tags: [], eyecatch: null,
    };
    const pages = [blogIndex([post]), await renderPost([post], 0), workIndex(),
        ...CASES.map((_, index) => renderCase(index)), renderNotFound()];
    for (const html of pages) expectNonBlockingFonts(html);
});
