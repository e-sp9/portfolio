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
        eyecatch: null,
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

    test('asks microCMS for AVIF and WebP images at the widths of the column', async () => {
        const html = await renderArticle('<figure><img src="https://images.microcms-assets.io/assets/a/b/shot.png" alt="" width="2000" height="1000"></figure>', titles);
        const at = (format: string, w: number) => `https://images.microcms-assets.io/assets/a/b/shot.png?fm=${format}&amp;w=${w}`;
        const sizes = 'sizes="(min-width: 1441px) 922px, (min-width: 860px) 720px, (min-width: 769px) calc(100vw - 140px), calc(100vw - 72px)"';
        expect(html).toBe(
            '<figure><picture>' +
            `<source type="image/avif" srcset="${at('avif', 720)} 720w, ${at('avif', 1080)} 1080w, ${at('avif', 1440)} 1440w" ${sizes}>` +
            `<img src="${at('webp', 1440)}" alt="" width="2000" height="1000" loading="lazy" decoding="async" ` +
            `srcset="${at('webp', 720)} 720w, ${at('webp', 1080)} 1080w, ${at('webp', 1440)} 1440w" ${sizes}>` +
            '</picture></figure>',
        );
    });

    test('never upscales an image', async () => {
        const html = await renderArticle('<img src="https://images.microcms-assets.io/assets/a/b/small.webp" width="330" height="180">', titles);
        expect(html).toContain('<source type="image/avif" srcset="https://images.microcms-assets.io/assets/a/b/small.webp?fm=avif&amp;w=330">');
        expect(html).toContain('src="https://images.microcms-assets.io/assets/a/b/small.webp?fm=webp&amp;w=330"');
        expect(html).not.toContain(' sizes=');
    });

    test('leaves GIFs and images from elsewhere as they are', async () => {
        const html = await renderArticle(
            '<img src="https://images.microcms-assets.io/assets/a/b/anim.gif" width="900" height="600"><img src="https://example.com/a.png" width="900" height="600">',
            titles,
        );
        expect(html).toContain('src="https://images.microcms-assets.io/assets/a/b/anim.gif"');
        expect(html).toContain('src="https://example.com/a.png"');
        expect(html).not.toContain('<picture>');
    });

    test('loads images lazily, all but the first when asked, which goes first', async () => {
        const images = '<img src="https://example.com/a.png"><img src="https://example.com/b.png">';
        const lazy = await renderArticle(images, titles);
        expect(lazy.match(/loading="lazy"/g)).toHaveLength(2);
        expect(lazy).not.toContain('fetchpriority');
        const eager = await renderArticle(images, titles, { eagerFirstImage: true });
        expect(eager).toBe(
            '<img src="https://example.com/a.png" fetchpriority="high" decoding="async">' +
            '<img src="https://example.com/b.png" loading="lazy" decoding="async">',
        );
    });

    test('the first image goes first even when the editor marked it lazy', async () => {
        const images = '<img src="https://example.com/a.png" loading="lazy" alt="A"><img src="https://example.com/b.png" loading="lazy" alt="B">';
        expect(await renderArticle(images, titles, { eagerFirstImage: true })).toBe(
            '<img src="https://example.com/a.png" alt="A" fetchpriority="high" decoding="async">' +
            '<img src="https://example.com/b.png" loading="lazy" alt="B" decoding="async">',
        );
        // Not asked: the editor's lazy stays
        expect((await renderArticle(images, titles)).match(/loading="lazy"/g)).toHaveLength(2);
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

    const IMAGES = 'https://images.microcms-assets.io/assets/a/b';
    const generated = { url: `${IMAGES}/eyecatch-newer.png`, width: 1200, height: 630 };

    test('a card shows the eyecatch small, as AVIF or WebP, and keeps the frame when there is none', () => {
        const html = renderIndex([
            post({ id: 'newer', title: 'Newer <b>&</b>', eyecatch: generated }),
            post({ eyecatch: { url: `${IMAGES}/small.webp`, width: 330, height: 180 } }),
            post({ id: 'bare' }),
        ]);
        const at = (format: string, w: number) => `${IMAGES}/eyecatch-newer.png?fm=${format}&amp;w=${w}`;
        const srcset = (format: string) => [400, 600, 800].map((w) => `${at(format, w)} ${w}w`).join(', ');
        const sizes = 'sizes="(min-width: 1100px) calc((100vw - 204px) / 3), (min-width: 640px) calc(50vw - 28px), calc(100vw - 40px)"';
        expect(html).toContain(
            `<div class="post-eyecatch"><picture><source type="image/avif" srcset="${srcset('avif')}" ${sizes}>` +
            `<img src="${at('webp', 800)}" srcset="${srcset('webp')}" ${sizes} width="1200" height="630" ` +
            'alt="Newer &lt;b&gt;&amp;&lt;/b&gt;" fetchpriority="high" decoding="async"></picture></div>',
        );
        // Never wider than the picture itself
        expect(html).toContain(
            `<picture><source type="image/avif" srcset="${IMAGES}/small.webp?fm=avif&amp;w=330">` +
            `<img src="${IMAGES}/small.webp?fm=webp&amp;w=330" width="330" height="180" alt="Another post" decoding="async"></picture>`,
        );
        expect(html).toContain('<div class="post-eyecatch post-eyecatch-none" aria-hidden="true">NO SIGNAL</div>');
        expect(html.match(/class="post-eyecatch/g)).toHaveLength(3);
    });

    test('the cards of the first screen load at once, the first one first, and the rest lazily', () => {
        const html = renderIndex(Array.from({ length: 8 }, (_, i) => post({ id: `p${i}`, eyecatch: generated })));
        const loading = [...html.matchAll(/<img [^>]*>/g)].map(([img]) => /fetchpriority="high"|loading="lazy"/.exec(img)?.[0] ?? 'eager');
        expect(loading).toEqual(['fetchpriority="high"', 'eager', 'eager', 'eager', 'eager', 'eager', 'loading="lazy"', 'loading="lazy"']);
    });

    test('an article shows its eyecatch above the title, and nothing when it has none', async () => {
        const html = await renderPost([post({ eyecatch: generated })], 0);
        const at = (format: string, w: number) => `${IMAGES}/eyecatch-newer.png?fm=${format}&amp;w=${w}`;
        const sizes = 'sizes="(min-width: 1441px) 1024px, (min-width: 860px) 800px, (min-width: 769px) calc(100vw - 60px), calc(100vw - 40px)"';
        expect(html).toContain(
            `<div class="article-eyecatch"><picture><source type="image/avif" srcset="${at('avif', 800)} 800w, ${at('avif', 1200)} 1200w" ${sizes}>` +
            `<img src="${at('webp', 1200)}" srcset="${at('webp', 800)} 800w, ${at('webp', 1200)} 1200w" ${sizes} ` +
            'width="1200" height="630" alt="Another post" fetchpriority="high" decoding="async"></picture></div>',
        );
        expect(html.indexOf('class="article-eyecatch"')).toBeLessThan(html.indexOf('class="article-title"'));
        expect(html).not.toContain('loading="lazy"');

        const bare = await renderPost([post()], 0);
        expect(bare).not.toContain('eyecatch');
        expect(bare).not.toContain('<img');
    });

    test('without an eyecatch, the first image of the article loads at once and first', async () => {
        const content = '<p>Hello</p><figure><img src="https://example.com/a.png"></figure><figure><img src="https://example.com/b.png"></figure>';
        const bare = await renderPost([post({ content })], 0);
        expect(bare).toContain('<img src="https://example.com/a.png" fetchpriority="high" decoding="async">');
        expect(bare).toContain('<img src="https://example.com/b.png" loading="lazy" decoding="async">');

        // With one, the eyecatch is the only image that goes first
        const withEyecatch = await renderPost([post({ content, eyecatch: generated })], 0);
        expect(withEyecatch.match(/loading="lazy"/g)).toHaveLength(2);
        expect(withEyecatch.match(/fetchpriority="high"/g)).toHaveLength(1);
        expect(withEyecatch.indexOf('fetchpriority="high"')).toBeLessThan(withEyecatch.indexOf('class="article-body"'));
    });

    test('a shared article shows its eyecatch as JPEG, large when it is big enough', async () => {
        const html = await renderPost([post({ eyecatch: { url: `${IMAGES}/photo.png`, width: 2400, height: 1260 } })], 0);
        expect(html).toContain(
            `<meta property="og:image" content="${IMAGES}/photo.png?fm=jpg&amp;w=1200">\n` +
            '    <meta property="og:image:width" content="1200">\n' +
            '    <meta property="og:image:height" content="630">\n' +
            '    <meta property="og:image:alt" content="Another post">\n' +
            '    <meta name="twitter:card" content="summary_large_image">\n' +
            '    <meta name="twitter:site" content="@e___sp9">\n' +
            `    <meta name="twitter:image" content="${IMAGES}/photo.png?fm=jpg&amp;w=1200">\n` +
            '    <meta name="twitter:image:alt" content="Another post">',
        );

        // A small picture is not stretched: it makes the small card
        const small = await renderPost([post({ eyecatch: { url: `${IMAGES}/small.webp`, width: 330, height: 180 } })], 0);
        expect(small).toContain(`<meta property="og:image" content="${IMAGES}/small.webp?fm=jpg">`);
        expect(small).toContain('<meta property="og:image:width" content="330">');
        expect(small).toContain('<meta name="twitter:card" content="summary">');

        for (const page of [await renderPost([post()], 0), renderIndex([post({ eyecatch: generated })])]) {
            expect(page).not.toContain('og:image');
            expect(page).not.toContain('twitter:image');
            expect(page).toContain('<meta name="twitter:card" content="summary">');
        }
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
            eyecatch: null,
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

    test('without the credentials, the build stops and names them, on GitHub Actions too', async () => {
        const fetched = spyOn(globalThis, 'fetch');
        for (const place of [{}, { GITHUB_ACTIONS: 'true' }]) {
            await expect(buildBlog(place, dist)).rejects.toThrow('Missing MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY.');
            await expect(buildBlog({ ...env, MICROCMS_API_KEY: '', ...place }, dist)).rejects.toThrow('Missing MICROCMS_API_KEY.');
        }
        expect(fetched).not.toHaveBeenCalled();
        expect(await readdir(dist)).toEqual([]);
    });

    test('when the posts cannot be fetched, the build stops and leaves the earlier blog as it is', async () => {
        spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
        await Bun.write(join(dist, 'blog/abc123.html'), 'left by an earlier build');

        await expect(buildBlog({ ...env, GITHUB_ACTIONS: 'true' }, dist)).rejects.toBeInstanceOf(BlogSourceError);
        expect((await readdir(dist, { recursive: true })).sort()).toEqual(['blog', 'blog/abc123.html']);
    });

    test('with the credentials, writes the list, the articles, the feed and the stylesheet', async () => {
        spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ contents: [apiPost], totalCount: 1 }));
        spyOn(console, 'log').mockImplementation(() => {});
        await Bun.write(join(dist, 'blog/unpublished.html'), 'left by an earlier build');

        await buildBlog(env, dist);
        expect((await readdir(dist, { recursive: true })).sort()).toEqual(['blog', 'blog.css', 'blog.html', 'blog/abc123.html', 'blog/feed.xml']);
    });
});
