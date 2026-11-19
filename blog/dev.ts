import { BlogSourceError, fetchPosts, type Post } from './microcms';
import { blogFiles } from './site';
import { discoveryFiles } from '../discovery-site';
import { renderRobots } from '../discovery';

const CONTENT_TYPES: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
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

export async function serveDiscovery(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.slice(1);
    try {
        const content = path === 'robots.txt' ? renderRobots() : (await discoveryFiles(await loadPosts())).get(path);
        return new Response(content, { headers: { 'Content-Type': path.endsWith('.xml') ? CONTENT_TYPES.xml! : CONTENT_TYPES.txt! } });
    } catch (error) {
        if (!(error instanceof BlogSourceError)) throw error;
        return new Response(error.message, { status: 500 });
    }
}
