import { expect, test } from 'bun:test';
import { renderLlms, renderRobots, renderSitemap, jsonLd } from './discovery';
import { renderPost } from './blog/pages';
import type { Post } from './blog/microcms';
import { CASES } from './work/cases';

const post: Post = {
    id: 'fixture-post', title: 'A [post] </script>', description: '', content: '<p>Hello</p>',
    publishedAt: '2025-01-01T00:00:00Z', revisedAt: '2025-02-01T00:00:00Z',
    category: null, tags: [], eyecatch: null,
};
const index = await Bun.file(new URL('./index.html', import.meta.url)).text();
const hire = await Bun.file(new URL('./hire.html', import.meta.url)).text();
const data = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]!));

test('sitemap lists the canonical main pages, fixture cases and all posts with known dates only', () => {
    const cases = [{ ...CASES[0]!, slug: 'fixture-case' }];
    const xml = renderSitemap([post], cases);
    for (const path of ['/', '/things', '/hire', '/work', '/blog', '/work/fixture-case', '/blog/fixture-post']) {
        expect(xml).toContain(`<loc>https://esp-9.dev${path}</loc>`);
    }
    expect(xml.match(/<url>/g)).toHaveLength(7);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml).toContain(`<lastmod>${post.revisedAt}</lastmod>`);
    expect(renderSitemap([{ ...post, revisedAt: '' }], [])).toContain(`<lastmod>${post.publishedAt}</lastmod>`);
    expect(renderSitemap([], [])).not.toContain('<lastmod>');
});

test('robots allows every crawler and advertises the sitemap', () => {
    expect(renderRobots()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://esp-9.dev/sitemap.xml\n');
});

test('llms uses existing copy and links in the llmstxt structure', () => {
    const llms = renderLlms(index, hire, [post], CASES);
    expect(llms).toStartWith('# RYOTA KATADA\n\n> ');
    for (const heading of ['## HIRE', '## LINKS', '## BLOG']) expect(llms).toContain(heading);
    for (const value of ['業務委託の開発', 'スポットの相談', '講師', 'https://x.com/e___sp9']) expect(llms).toContain(value);
    expect(llms).toContain('[A \\[post\\] \\</script\\>](https://esp-9.dev/blog/fixture-post)');
    for (const item of CASES) expect(llms).toContain(`https://esp-9.dev/work/${item.slug}`);
    expect(renderLlms(index, hire, [], [])).not.toContain('/blog/fixture-post');
});

test('llms escapes angle brackets so titles cannot become autolinks inside link labels', () => {
    const title = 'A <https://example.com>';
    const llms = renderLlms(index, hire, [{ ...post, id: 'autolink-post', title }], [{ ...CASES[0]!, slug: 'autolink-case', title }]);
    expect(llms).toContain('[A \\<https://example.com\\>](https://esp-9.dev/blog/autolink-post)');
    expect(llms).toContain('[A \\<https://example.com\\>](https://esp-9.dev/work/autolink-case)');
    expect(llms).not.toMatch(/(?<!\\)<https:\/\/example\.com/);
});

test('static pages contain parseable Person and Services matching visible content', () => {
    const person = data(index)[0];
    expect(person['@type']).toBe('Person');
    for (const url of person.sameAs) expect(index).toContain(`href="${url}"`);
    const services = data(hire)[0]['@graph'];
    expect(services).toHaveLength(3);
    for (const service of services) {
        expect(service['@type']).toBe('Service');
        expect(hire).toContain(`<li>${service.name}</li>`);
    }
});

test('article JSON-LD matches displayed headline and dates and safely handles script end tags', async () => {
    const html = await renderPost([post], 0);
    const article = data(html)[0];
    expect(article['@type']).toBe('BlogPosting');
    expect(article.headline).toBe(post.title);
    expect(article.datePublished).toBe(post.publishedAt);
    expect(article.dateModified).toBe(post.revisedAt);
    const sameDay = data(await renderPost([{ ...post, revisedAt: post.publishedAt }], 0))[0];
    expect(sameDay).not.toHaveProperty('dateModified');
    await expect(renderPost([], 0)).rejects.toThrow('No post at index 0');
    expect(jsonLd({ value: '</script>' })).not.toContain('></script></script>');
});
