import { expect, test } from 'bun:test';
import { paginate } from './pagination';
import { renderIndex, BLOG_TITLE } from './pages';
import { blogFiles } from './site';
import { renderSitemap } from '../discovery';
import type { Post } from './microcms';

const posts = (count: number): Post[] => Array.from({ length: count }, (_, index) => ({
    id: `post-${index}`, title: `Post ${index}`, description: '', content: '',
    publishedAt: '2025-01-01T00:00:00Z', revisedAt: '2025-01-01T00:00:00Z',
    category: null, tags: [], eyecatch: null,
}));

for (const count of [0, 1, 10, 11, 20, 21]) {
    test(`${count} posts: slices, navigation, metadata, files and sitemap agree`, () => {
        const all = posts(count);
        const expected = Math.max(1, Math.ceil(count / 10));
        expect(paginate(all).pageCount).toBe(expected);
        const sitemap = renderSitemap(all, []);
        const seen: Post[] = [];
        for (let page = 1; page <= expected; page++) {
            const data = paginate(all, page);
            seen.push(...data.items);
            const path = page === 1 ? '/blog' : `/blog/page/${page}`;
            const html = renderIndex(all, page);
            expect(data.items.length).toBeLessThanOrEqual(10);
            expect(html.match(/<article class="post panel"/g)?.length ?? 0).toBe(data.items.length);
            expect(html).toContain(`<title>${BLOG_TITLE}${page === 1 ? '' : ` / PAGE ${page}`}</title>`);
            expect(html).toContain(`<link rel="canonical" href="https://esp-9.dev${path}">`);
            expect(blogFiles(all).has(`${path.slice(1)}.html`)).toBe(true);
            expect(sitemap).toContain(`<loc>https://esp-9.dev${path}</loc>`);
            if (expected === 1) {
                expect(html).not.toContain('class="blog-pagination"');
            } else {
                expect(html).toContain(`<span aria-current="page">${page}</span>`);
                expect(html).toContain(page === 1 ? '<span aria-disabled="true">Prev</span>' : `href="${data.paths[page - 2]}" rel="prev">Prev</a>`);
                expect(html).toContain(page === expected ? '<span aria-disabled="true">Next</span>' : `href="${data.paths[page]}" rel="next">Next</a>`);
                for (const [index, href] of data.paths.entries()) {
                    if (index + 1 !== page) expect(html).toContain(`<a href="${href}" aria-label="Page ${index + 1}">${index + 1}</a>`);
                }
            }
        }
        expect(seen).toEqual(all);
        expect(sitemap).not.toContain(`/blog/page/${expected + 1}<`);
        for (const invalid of [0, 1, 99]) expect(blogFiles(all).has(`blog/page/${invalid}.html`)).toBe(false);
    });
}

test('invalid page arguments are rejected', () => {
    for (const page of [0, -1, 2, 1.5, NaN, Infinity]) {
        expect(() => paginate(posts(10), page)).toThrow(RangeError);
        expect(() => renderIndex(posts(10), page)).toThrow(RangeError);
    }
});
