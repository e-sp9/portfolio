// ─────────────────────────────────────────────────────────────────────────────
// microCMS — where the blog posts live. They are fetched at build time only,
// so the API key never reaches the browser or the Worker.
// The build also writes to it in one case, with a key of its own: a post
// without an eyecatch is given a generated one (the end of this file).
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
    /** URL of the eyecatch image in the media library; null when the post has none */
    eyecatch: string | null;
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
    eyecatch?: { url?: string } | null;
}

interface ApiList {
    contents: ApiPost[];
    totalCount: number;
}

const ENDPOINT = 'blogs';
const FIELDS = 'id,title,description,content,publishedAt,revisedAt,category.name,category.slug,tags.name,eyecatch';
const PAGE_SIZE = 100;

/** What a content ID may be made of. It becomes a file name and a URL path. */
export const POST_ID = /^[\w-]+$/;

type Env = Record<string, string | undefined>;
type KeyName = 'MICROCMS_API_KEY' | 'MICROCMS_WRITE_API_KEY';

interface Access {
    domain: string;
    apiKey: string;
    keyName: KeyName;
}

/** Names of the credentials that are not set. They are kept in the local .env only. */
export function missingCredentials(env: Env, keyName: KeyName = 'MICROCMS_API_KEY'): string[] {
    return ['MICROCMS_SERVICE_DOMAIN', keyName].filter((name) => !env[name]);
}

/** The service domain with one of the keys, or the error that says what is wrong with them. */
function access(env: Env, keyName: KeyName): Access {
    const domain = env.MICROCMS_SERVICE_DOMAIN;
    const apiKey = env[keyName];
    if (!domain || !apiKey) {
        const missing = missingCredentials(env, keyName).join(' and ');
        throw new BlogSourceError(
            keyName === 'MICROCMS_API_KEY'
                ? `Missing ${missing}. The blog is built from microCMS: set both variables in .env.`
                : `Missing ${missing}. Writing to microCMS takes the service domain and this key.`,
        );
    }
    // The keys are only ever sent to <domain>.microcms.io and <domain>.microcms-management.io
    if (!/^[a-z0-9-]+$/i.test(domain)) {
        throw new BlogSourceError('MICROCMS_SERVICE_DOMAIN must be the subdomain only: the "xxx" of xxx.microcms.io.');
    }
    return { domain, apiKey, keyName };
}

/** Fetches every published post, newest first. */
export async function fetchPosts(env: Env = process.env): Promise<Post[]> {
    const reader = access(env, 'MICROCMS_API_KEY');
    const posts: Post[] = [];
    for (;;) {
        const query = new URLSearchParams({
            fields: FIELDS,
            orders: '-publishedAt',
            limit: String(PAGE_SIZE),
            offset: String(posts.length),
        });
        const response = await request(reader, `/${ENDPOINT}`, `https://${reader.domain}.microcms.io/api/v1/${ENDPOINT}?${query}`);
        const page = (await response.json()) as ApiList;
        posts.push(...page.contents.map(toPost));
        if (page.contents.length === 0 || posts.length >= page.totalCount) return posts;
    }
}

/** What a write sends besides the key */
interface Sent {
    method: string;
    headers?: Record<string, string>;
    body: BodyInit;
}

/** Pauses before a write is tried again, in ms. The second outlasts the 10-second window of the Management API. */
const RETRY_PAUSES = [2_000, 10_000];

/**
 * Sends a request and returns the answer once microCMS has accepted it.
 * Errors name the request (`what`) and never the URL, so the service domain and the keys stay out of logs.
 */
async function request(access: Access, what: string, url: string, sent?: Sent): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
            response = await fetch(url, {
                ...sent,
                headers: { ...sent?.headers, 'X-MICROCMS-API-KEY': access.apiKey },
                // A redirect would take the key to another host
                redirect: 'error',
                // microCMS can take about 29 seconds to answer. A write is given that long:
                // giving up on one that then goes through would leave it half done.
                signal: AbortSignal.timeout(sent ? 30_000 : 15_000),
            });
        } catch (error) {
            const code = (error as { code?: unknown }).code;
            const reason = typeof code === 'string' ? code : (error as Error).name;
            throw new BlogSourceError(`No answer from microCMS for ${what} (${reason}).${sent ? ' The request may still have gone through.' : ''}`);
        }
        if (response.ok) return response;
        // microCMS says a 429 or a 5xx can come back now and then even within its limits: a write is tried again
        const pause = sent && (response.status === 429 || response.status >= 500) ? RETRY_PAUSES[attempt] : undefined;
        if (pause === undefined) throw await refusal(response, access, what);
        await Bun.sleep(pause);
    }
}

/** The error for an answer that is not a success. */
async function refusal(response: Response, { domain, apiKey, keyName }: Access, what: string): Promise<BlogSourceError> {
    // microCMS explains itself in `message`. It is quoted as one short line, without the domain or the key should it repeat them.
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === 'string'
        ? body.message.replaceAll(domain, '***').replaceAll(apiKey, '***').replace(/\s+/g, ' ').trim().slice(0, 200)
        : '';
    const said = message && ` It said: ${message.replace(/\.?$/, '.')}`;
    // These mean a wrong key, a key without the permission, or a wrong service
    const check = [401, 403, 404].includes(response.status) ? ` Check MICROCMS_SERVICE_DOMAIN and ${keyName}.` : '';
    return new BlogSourceError(`microCMS answered ${response.status} for ${what}.${said}${check}`);
}

function toPost(post: ApiPost): Post {
    if (!POST_ID.test(post.id)) {
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
        eyecatch: post.eyecatch?.url || null,
    };
}

/** The posts the build generates an eyecatch for: those that have none. */
export function withoutEyecatch(posts: Post[]): Post[] {
    return posts.filter((post) => post.eyecatch === null);
}

// ─── Writing ─────────────────────────────────────────────────────────────────
// The two requests that change anything in microCMS. Both use MICROCMS_WRITE_API_KEY,
// a key that may upload media (Management API) and PATCH the blogs API.

/** Uploads a PNG to the media library and returns its URL. */
export async function uploadImage(env: Env, name: string, png: Uint8Array<ArrayBuffer>): Promise<string> {
    const writer = access(env, 'MICROCMS_WRITE_API_KEY');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), name);
    const response = await request(writer, `the upload of ${name}`, `https://${writer.domain}.microcms-management.io/api/v1/media`, {
        method: 'POST',
        body: form,
    });
    const answer = (await response.json().catch(() => null)) as { url?: unknown } | null;
    const url = answer?.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) {
        throw new BlogSourceError(`microCMS took the upload but did not say where the image is. Look for ${name} in the media library.`);
    }
    return url;
}

/**
 * Sets the eyecatch of a post to an image in the media library. The post stays published.
 * microCMS counts this as a revision of the post, so its revisedAt moves to now.
 */
export async function setEyecatch(env: Env, id: string, imageUrl: string): Promise<void> {
    const writer = access(env, 'MICROCMS_WRITE_API_KEY');
    if (!POST_ID.test(id)) throw new BlogSourceError(`Not a content ID: ${JSON.stringify(id)}`);
    await request(writer, `PATCH /${ENDPOINT}/${id}`, `https://${writer.domain}.microcms.io/api/v1/${ENDPOINT}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eyecatch: imageUrl }),
    });
}
