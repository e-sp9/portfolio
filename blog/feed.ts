import { esc } from './html';
import type { Post } from './microcms';
import { BLOG_DESCRIPTION, BLOG_TITLE, SITE_URL } from './pages';

function item(post: Post): string {
    const url = `${SITE_URL}/blog/${post.id}`;
    const categories = [post.category, ...post.tags].filter((name) => name !== null);
    return `        <item>
            <title>${esc(post.title)}</title>
            <link>${url}</link>
            <guid isPermaLink="true">${url}</guid>
            <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
            <description>${esc(post.description)}</description>${categories.map((name) => `
            <category>${esc(name)}</category>`).join('')}
        </item>`;
}

/** The RSS 2.0 feed at /blog/feed.xml: every post with its summary, newest first. */
export function renderFeed(posts: Post[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>${esc(BLOG_TITLE)}</title>
        <link>${SITE_URL}/blog</link>
        <description>${esc(BLOG_DESCRIPTION)}</description>
        <language>ja</language>
        <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${posts.map(item).join('\n')}
    </channel>
</rss>
`;
}
