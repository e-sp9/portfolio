import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderArticle } from './article';
import { buildBlog } from './build';
import { renderFeed } from './feed';
import { unesc } from './html';
import { BlogSourceError, fetchPosts, type Post } from './microcms';
import { renderIndex, renderPost } from './pages';

function post(fields: Partial<Post> = {}): Post {
    return {
        id: 'abc123',
        title: 'Another post',
        description: 'About something',
        content: '<p>Hello</p>',
        publishedAt: '2024-08-22T18:40:36.470Z',
        revisedAt: '2024-08-22T18:40:36.470Z',
        category: 'technology',
        tags: ['Remix'],
        ...fields,
    };
}

const titles = new Map([['abc123', 'Another post']]);

/** What a reader sees: tags dropped, character references decoded */
const text = (html: string) => unesc(html.replace(/<[^>]+>/g, ''));

describe('article body', () => {
    test('highlights a code block under its file name', async () => {
        const html = await renderArticle(
            '<div data-filename="app/a.ts"><pre><code class="language-typescript">const a = &apos;x&apos; &lt; 1 &amp;&amp; b</code></pre></div>',
            titles,
        );
        expect(html).toStartWith(
            '<div class="code-block"><div class="code-head"><span class="code-file">app/a.ts</span><span class="code-lang">typescript</span></div><pre class="shiki',
        );
        expect(html).toContain('var(--code-token-keyword)');
        expect(text(html)).toBe("app/a.tstypescriptconst a = 'x' < 1 && b");
    });

    test('goes by the file extension when no language is given', async () => {
        const html = await renderArticle('<div data-filename="wrangler.toml"><pre><code>[vars]\nKEY = "value"</code></pre></div>', titles);
        expect(html).toContain('var(--code-token-string');
        expect(html).not.toContain('code-lang');
    });

    test('reads a .tsx file marked as TypeScript with the JSX grammar', async () => {
        const block = (file: string) => `<div data-filename="${file}"><pre><code class="language-typescript">const a = &lt;p&gt;Don&apos;t&lt;/p&gt;</code></pre></div>`;
        const tsx = await renderArticle(block('a.tsx'), titles);
        const ts = await renderArticle(block('a.ts'), titles);
        expect(text(tsx)).toBe("a.tsxtypescriptconst a = <p>Don't</p>");
        expect(tsx).not.toBe(ts.replace('a.ts', 'a.tsx'));
    });

    test('leaves an unlabelled code block plain', async () => {
        const html = await renderArticle('<pre><code>&lt;b&gt; stays text<br>on two lines\n</code></pre>', titles);
        expect(html).not.toContain('code-head');
        expect(html).not.toContain('--code-token');
        expect(text(html)).toBe('<b> stays text\non two lines');
    });

    test('asks microCMS for WebP images at the widths of the column', async () => {
        const html = await renderArticle('<img src="https://images.microcms-assets.io/assets/a/b/shot.png" alt="" width="2000" height="1000">', titles);
        expect(html).toContain('src="https://images.microcms-assets.io/assets/a/b/shot.png?fm=webp&amp;w=1440"');
        expect(html).toContain('shot.png?fm=webp&amp;w=720 720w, https://images.microcms-assets.io/assets/a/b/shot.png?fm=webp&amp;w=1440 1440w"');
        expect(html).toContain('loading="lazy"');
    });

    test('never upscales an image', async () => {
        const html = await renderArticle('<img src="https://images.microcms-assets.io/assets/a/b/small.webp" width="330" height="180">', titles);
        expect(html).toContain('small.webp?fm=webp&amp;w=330"');
        expect(html).not.toContain('srcset');
    });

    test('leaves GIFs and images from elsewhere as they are', async () => {
        const html = await renderArticle(
            '<img src="https://images.microcms-assets.io/assets/a/b/anim.gif" width="900" height="600"><img src="https://example.com/a.png" width="900" height="600">',
            titles,
        );
        expect(html).toContain('src="https://images.microcms-assets.io/assets/a/b/anim.gif"');
        expect(html).toContain('src="https://example.com/a.png"');
    });

    test('brings links to posts on the old blog along', async () => {
        const html = await renderArticle(
            '<p><a href="https://www.kissa-katada.com/technology/abc123">https://www.kissa-katada.com/technology/abc123</a></p>' +
            '<p><a href="https://www.kissa-katada.com/technology/abc123#part" target="_blank" rel="noopener noreferrer nofollow">こちら</a></p>',
            titles,
        );
        expect(html).toBe('<p><a href="/blog/abc123">Another post</a></p><p><a href="/blog/abc123#part">こちら</a></p>');
    });

    test('opens other sites in a new tab', async () => {
        const html = await renderArticle(
            '<a href="https://example.com/?a=1&amp;b=2">x</a><a href="https://www.kissa-katada.com/technology/gone">y</a><a href="#part">z</a>',
            titles,
        );
        expect(html).toBe(
            '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener">x</a>' +
            '<a href="https://www.kissa-katada.com/technology/gone" target="_blank" rel="noopener">y</a>' +
            '<a href="#part">z</a>',
        );
    });

    test('keeps one h1 per page and lets tables scroll', async () => {
        const html = await renderArticle('<h1 id="a">Top</h1><table><tr><td>1</td></tr></table>', titles);
        expect(html).toBe('<h2 id="a">Top</h2><div class="table-scroll"><table><tr><td>1</td></tr></table></div>');
    });
});

describe('pages', () => {
    const posts = [post({ id: 'newer', title: 'Newer <b>&</b>' }), post({ publishedAt: '2024-08-22T15:00:00.000Z', revisedAt: '2024-09-08T12:00:00.000Z' })];

    test('the list links every post and escapes what comes from the CMS', () => {
        const html = renderIndex(posts);
        expect(html).toContain('<a class="post-link" href="/blog/newer">Newer &lt;b&gt;&amp;&lt;/b&gt;</a>');
        expect(html).toContain('<a class="post-link" href="/blog/abc123">Another post</a>');
        expect(html).toContain('02 POSTS');
    });

    test('an article shows its dates in Japan time, its number and its neighbours', async () => {
        const html = await renderPost(posts, 1);
        expect(html).toContain('<title>Another post | RYOTA KATADA</title>');
        expect(html).toContain('<link rel="canonical" href="https://esp-9.dev/blog/abc123">');
        // 15:00 UTC is already the next day in Japan
        expect(html).toContain('<time class="post-date" datetime="2024-08-22T15:00:00.000Z">2024.08.23</time>');
        expect(html).toContain('UPDATED <time datetime="2024-09-08T12:00:00.000Z">2024.09.08</time>');
        expect(html).toContain('POST 01 / 02');
        expect(html).toContain('href="/blog/newer" rel="next"');
        expect(html).not.toContain('rel="prev"');
    });

    test('the feed lists every post', () => {
        const xml = renderFeed(posts);
        expect(xml).toContain('<title>Newer &lt;b&gt;&amp;&lt;/b&gt;</title>');
        expect(xml).toContain('<link>https://esp-9.dev/blog/abc123</link>');
        expect(xml).toContain('<pubDate>Thu, 22 Aug 2024 15:00:00 GMT</pubDate>');
        expect(xml.match(/<item>/g)).toHaveLength(2);
    });
});

const env = { MICROCMS_SERVICE_DOMAIN: 'hidden-domain', MICROCMS_API_KEY: 'hidden-key' };
const apiPost = { id: 'abc123', title: 'T', content: '<p>c</p>', publishedAt: '2024-08-22T15:00:00.000Z', category: { name: 'テクノロジー', slug: 'technology' }, tags: [{ name: 'Remix' }] };

describe('microCMS', () => {
    afterEach(() => mock.restore());

    test('says which variables are missing', async () => {
        const fetched = spyOn(globalThis, 'fetch');
        await expect(fetchPosts({})).rejects.toThrow('Missing MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY.');
        await expect(fetchPosts({ ...env, MICROCMS_API_KEY: '' })).rejects.toThrow('Missing MICROCMS_API_KEY.');
        expect(fetched).not.toHaveBeenCalled();
    });

    test('only ever sends the key to microCMS', async () => {
        const fetched = spyOn(globalThis, 'fetch');
        await expect(fetchPosts({ ...env, MICROCMS_SERVICE_DOMAIN: 'example.com/#' })).rejects.toBeInstanceOf(BlogSourceError);
        expect(fetched).not.toHaveBeenCalled();
    });

    test('keeps the domain and the key out of its errors', async () => {
        const fetched = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
        const refused = await fetchPosts(env).catch((error) => error);
        fetched.mockRejectedValue(new Error('Unable to connect to https://hidden-domain.microcms.io'));
        const unreachable = await fetchPosts(env).catch((error) => error);

        for (const error of [refused, unreachable]) {
            expect(error).toBeInstanceOf(BlogSourceError);
            expect(error.message).not.toContain('hidden');
        }
        expect(refused.message).toContain('401');
    });

    test('reads every page of the list', async () => {
        const fetched = spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
            const offset = Number(new URL(url).searchParams.get('offset'));
            const contents = offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ ...apiPost, id: `p${i}` })) : [apiPost];
            return Response.json({ contents, totalCount: 101 });
        }) as unknown as typeof fetch);

        const posts = await fetchPosts(env);
        expect(posts).toHaveLength(101);
        expect(posts.at(-1)).toEqual({
            id: 'abc123',
            title: 'T',
            description: '',
            content: '<p>c</p>',
            publishedAt: '2024-08-22T15:00:00.000Z',
            revisedAt: '2024-08-22T15:00:00.000Z',
            category: 'technology',
            tags: ['Remix'],
        });
        expect(fetched).toHaveBeenCalledTimes(2);
        const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
        expect(new URL(url).origin).toBe('https://hidden-domain.microcms.io');
        expect(init.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-key' });
    });
});

describe('build', () => {
    let dist: string;

    beforeEach(async () => {
        dist = await mkdtemp(join(tmpdir(), 'blog-build-'));
    });

    afterEach(async () => {
        mock.restore();
        await rm(dist, { recursive: true, force: true });
    });

    test('without the credentials, a local build stops and names them', async () => {
        const fetched = spyOn(globalThis, 'fetch');
        await expect(buildBlog({}, dist)).rejects.toThrow('Missing MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY.');
        await expect(buildBlog({ ...env, MICROCMS_API_KEY: '' }, dist)).rejects.toThrow('Missing MICROCMS_API_KEY.');
        expect(fetched).not.toHaveBeenCalled();
        expect(await readdir(dist)).toEqual([]);
    });

    test('without the credentials, a build on GitHub Actions leaves the blog out with a warning', async () => {
        const fetched = spyOn(globalThis, 'fetch');
        const warned = spyOn(console, 'warn').mockImplementation(() => {});
        await buildBlog({ GITHUB_ACTIONS: 'true' }, dist);
        await buildBlog({ ...env, MICROCMS_API_KEY: '', GITHUB_ACTIONS: 'true' }, dist);

        expect(warned.mock.calls.map(([line]) => line)).toEqual([
            '::warning title=Blog not generated::MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY not set, so the site is built without /blog.',
            '::warning title=Blog not generated::MICROCMS_API_KEY not set, so the site is built without /blog.',
        ]);
        expect(fetched).not.toHaveBeenCalled();
        expect(await readdir(dist)).toEqual([]);
    });

    test('with the credentials, writes the list, the articles, the feed and the stylesheet', async () => {
        spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ contents: [apiPost], totalCount: 1 }));
        spyOn(console, 'log').mockImplementation(() => {});
        await Bun.write(join(dist, 'blog/unpublished.html'), 'left by an earlier build');

        // The keys decide, not the place: with them, GitHub Actions builds the blog too
        await buildBlog({ ...env, GITHUB_ACTIONS: 'true' }, dist);
        expect((await readdir(dist, { recursive: true })).sort()).toEqual(['blog', 'blog.css', 'blog.html', 'blog/abc123.html', 'blog/feed.xml']);
    });
});
