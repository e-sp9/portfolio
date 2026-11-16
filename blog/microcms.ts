// ─────────────────────────────────────────────────────────────────────────────
// microCMS — where the blog posts live. They are fetched at build time only,
// so the API key never reaches the browser or the Worker.
// ─────────────────────────────────────────────────────────────────────────────

export interface Post {
    /** microCMS content ID; the article is served at /blog/<id> */
    id: string;
    title: string;
    /** Summary shown on the card, in the meta description and in the feed */
    description: string;
    /** Article body as rich-editor HTML */
    content: string;
    /** ISO 8601 */
    publishedAt: string;
    /** ISO 8601, last published revision */
    revisedAt: string;
    /** Category slug (e.g. technology), shown uppercase */
    category: string | null;
    tags: string[];
}

/** A problem with the content source, worded so it can be printed as is */
export class BlogSourceError extends Error {
    override name = 'BlogSourceError';
}

interface ApiPost {
    id: string;
    title: string;
    description?: string;
    content?: string;
    publishedAt: string;
    revisedAt?: string;
    category?: { name?: string; slug?: string } | null;
    tags?: { name: string }[];
}

interface ApiList {
    contents: ApiPost[];
    totalCount: number;
}

const ENDPOINT = 'blogs';
const FIELDS = 'id,title,description,content,publishedAt,revisedAt,category.name,category.slug,tags.name';
const PAGE_SIZE = 100;

/** Fetches every published post, newest first. */
export async function fetchPosts(env: Record<string, string | undefined> = process.env): Promise<Post[]> {
    const domain = env.MICROCMS_SERVICE_DOMAIN;
    const apiKey = env.MICROCMS_API_KEY;
    if (!domain || !apiKey) {
        const missing = [!domain && 'MICROCMS_SERVICE_DOMAIN', !apiKey && 'MICROCMS_API_KEY'].filter(Boolean);
        throw new BlogSourceError(
            `Missing ${missing.join(' and ')}. The blog is built from microCMS: ` +
            'set both variables in .env (see .env.example), or in the environment of the build.',
        );
    }
    // The key is only ever sent to <domain>.microcms.io
    if (!/^[a-z0-9-]+$/i.test(domain)) {
        throw new BlogSourceError('MICROCMS_SERVICE_DOMAIN must be the subdomain only: the "xxx" of xxx.microcms.io.');
    }

    const posts: Post[] = [];
    for (;;) {
        const query = new URLSearchParams({
            fields: FIELDS,
            orders: '-publishedAt',
            limit: String(PAGE_SIZE),
            offset: String(posts.length),
        });
        const page = await request(`https://${domain}.microcms.io/api/v1/${ENDPOINT}?${query}`, apiKey);
        posts.push(...page.contents.map(toPost));
        if (page.contents.length === 0 || posts.length >= page.totalCount) return posts;
    }
}

// Errors name the endpoint only, so the service domain and the key stay out of logs.
async function request(url: string, apiKey: string): Promise<ApiList> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { 'X-MICROCMS-API-KEY': apiKey },
            signal: AbortSignal.timeout(15_000),
        });
    } catch (error) {
        const reason = (error as { code?: string }).code ?? (error as Error).name;
        throw new BlogSourceError(`Could not reach microCMS for /${ENDPOINT} (${reason}).`);
    }
    if (!response.ok) {
        throw new BlogSourceError(
            `microCMS answered ${response.status} for /${ENDPOINT}. ` +
            'Check MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY.',
        );
    }
    return (await response.json()) as ApiList;
}

function toPost(post: ApiPost): Post {
    // The ID becomes a file name and a URL path
    if (!/^[\w-]+$/.test(post.id)) {
        throw new BlogSourceError(`Unexpected content ID in /${ENDPOINT}: ${JSON.stringify(post.id)}`);
    }
    return {
        id: post.id,
        title: post.title,
        description: post.description ?? '',
        content: post.content ?? '',
        publishedAt: post.publishedAt,
        revisedAt: post.revisedAt ?? post.publishedAt,
        category: post.category?.slug ?? post.category?.name ?? null,
        tags: (post.tags ?? []).map((tag) => tag.name),
    };
}
