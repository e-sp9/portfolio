import { BlogSourceError, fetchPosts, type Post } from './microcms';
import { blogFiles } from './site';

const CONTENT_TYPES: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
};

// Posts are refetched at most this often, so reloading a page while styling it stays quick
const POSTS_TTL = 60_000;
let cache: { posts: Promise<Post[]>; at: number } | undefined;

function loadPosts(): Promise<Post[]> {
    if (!cache || Date.now() - cache.at > POSTS_TTL) {
        const posts = fetchPosts();
        cache = { posts, at: Date.now() };
        // A failed fetch is retried on the next request
        posts.catch(() => {
            if (cache?.posts === posts) cache = undefined;
        });
    }
    return cache.posts;
}

/**
 * Serves the blog in development: the files the build would write, rendered on request.
 * Paths resolve the way Cloudflare's static assets do (/blog → blog.html).
 */
export async function serveBlog(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/|\/$/g, '');
    const file = /\.\w+$/.test(path) ? path : `${path}.html`;
    try {
        const render = blogFiles(await loadPosts()).get(file);
        if (!render) return new Response('Not Found', { status: 404 });
        const type = CONTENT_TYPES[file.slice(file.lastIndexOf('.') + 1)];
        return new Response(await render(), { headers: type ? { 'Content-Type': type } : undefined });
    } catch (error) {
        if (!(error instanceof BlogSourceError)) throw error;
        return new Response(error.message, { status: 500 });
    }
}
