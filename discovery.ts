import type { Post } from './blog/microcms';
import { unesc, esc } from './blog/html';
import type { WorkCase } from './work/cases';

export const ORIGIN = 'https://esp-9.dev';

export function jsonLd(value: unknown): string {
    return `<script type="application/ld+json">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`;
}

export function renderSitemap(posts: Post[], cases: WorkCase[]): string {
    const pages = [
        ...['/', '/things', '/hire', '/work', '/blog'].map(path => ({ path, date: '' })),
        ...cases.map(item => ({ path: `/work/${item.slug}`, date: '' })),
        ...posts.map(post => ({ path: `/blog/${post.id}`, date: post.revisedAt || post.publishedAt })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(({ path, date }) => `  <url><loc>${esc(ORIGIN + path)}</loc>${date ? `<lastmod>${esc(date)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

export function renderRobots(): string {
    return `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}

const text = (html: string) => unesc(html.replace(/<[^>]*>/g, '')).trim();
const markdown = (value: string) => value.replaceAll(/([\\\[\]])/g, '\\$1').replaceAll(/[\r\n]+/g, ' ');

export function renderLlms(index: string, hire: string, posts: Post[], cases: WorkCase[]): string {
    const name = text(index.match(/<title>(.*?)<\/title>/s)?.[1] ?? '').split(' /')[0]!;
    const summary = index.match(/<meta name="description"\s+content="([^"]+)"/s)?.[1] ?? '';
    const items = [...hire.matchAll(/<li>(.*?)<\/li>/gs)].map(match => text(match[1]!));
    const link = (label: string, path: string) => `- [${markdown(label)}](${ORIGIN}${path})`;
    return `# ${name}\n\n> ${text(summary)}\n\n## HIRE\n\n${items.map(item => link(item, '/hire')).join('\n')}\n- [X @e___sp9](https://x.com/e___sp9)\n\n## LINKS\n\n${[['HOME', '/'], ['THINGS', '/things'], ['HIRE', '/hire'], ['WORK', '/work'], ['BLOG', '/blog']].map(([label, path]) => link(label!, path!)).join('\n')}\n${cases.map(item => link(item.title, `/work/${item.slug}`)).join('\n')}\n\n## BLOG\n\n${posts.map(post => link(post.title, `/blog/${post.id}`)).join('\n')}\n`;
}
