import { afterEach, beforeEach, describe, expect, type Mock, mock, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { buildBlog } from './build';
import * as art from './eyecatch';
import { EYECATCH_HEIGHT, EYECATCH_WIDTH, eyecatchPng, paintEyecatch } from './eyecatch';
import { dryRun } from './eyecatch-dry-run';
import { BlogSourceError, fetchPosts, setEyecatch, uploadImage } from './microcms';

const digest = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

/** Reads a PNG back into RGB bytes, undoing the two row filters the encoder uses */
function decodePng(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const chunks: Record<string, Uint8Array> = {};
    for (let at = 8; at < png.length;) {
        const length = view.getUint32(at);
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
        expect(view.getUint32(at + 8 + length)).toBe(Bun.hash.crc32(png.subarray(at + 4, at + 8 + length)));
        chunks[type] = png.subarray(at + 8, at + 8 + length);
        at += length + 12;
    }
    expect(Object.keys(chunks)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const header = chunks.IHDR!;
    // 8 bits per channel, RGB, not interlaced
    expect([...header.subarray(8)]).toEqual([8, 2, 0, 0, 0]);
    const width = new DataView(header.buffer, header.byteOffset).getUint32(0);
    const height = new DataView(header.buffer, header.byteOffset).getUint32(4);

    const rows = inflateSync(chunks.IDAT!);
    const stride = width * 3;
    expect(rows.length).toBe(height * (stride + 1));
    const pixels = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = rows[y * (stride + 1)];
        const row = rows.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        if (filter === 0) pixels.set(row, y * stride);
        else if (filter === 2) pixels.set(row.map((byte, x) => byte + pixels[(y - 1) * stride + x]!), y * stride);
        else throw new Error(`Unexpected filter ${filter} on row ${y}`);
    }
    return { width, height, pixels };
}

/** Hue in degrees; null for white and greys */
function hue(r: number, g: number, b: number): number | null {
    const max = Math.max(r, g, b);
    const range = max - Math.min(r, g, b);
    if (range === 0) return null;
    const sixth = max === r ? (g - b) / range : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
    return (sixth * 60 + 360) % 360;
}

/** How much of a picture is blue, and which other colours it carries */
function colours(pixels: Uint8Array): { blue: number; accent: number; accents: string[] } {
    const counts = new Map<string, number>();
    let samples = 0;
    // A few thousand samples spread over the picture are enough
    for (let y = 2; y < EYECATCH_HEIGHT; y += 5) {
        for (let x = 2; x < EYECATCH_WIDTH; x += 5) {
            const at = (y * EYECATCH_WIDTH + x) * 3;
            const key = `${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            samples++;
        }
    }
    let blue = 0;
    let accent = 0;
    const accents: string[] = [];
    for (const [key, count] of counts) {
        const [r, g, b] = key.split(',').map(Number) as [number, number, number];
        const h = hue(r, g, b);
        if (h === null) continue;
        // The site's blues lie between 211° and 227°
        if (h > 205 && h < 235) blue += count;
        else {
            accent += count;
            // A colour shows once it covers 0.4% of the picture
            if (count / samples >= 0.004) accents.push(key);
        }
    }
    return { blue: blue / samples, accent: accent / samples, accents };
}

describe('eyecatch art', () => {
    test('is a 1200×630 PNG of the painted pixels', () => {
        const png = eyecatchPng('abc123');
        const { width, height, pixels } = decodePng(png);
        expect([width, height]).toEqual([1200, 630]);
        expect(digest(pixels)).toBe(digest(paintEyecatch('abc123')));
        // The media library takes 5MB per upload
        expect(png.length).toBeLessThan(5 * 1024 * 1024);
    });

    test('gives a post the same picture every time, and each post its own', () => {
        // Pinned: if this changes, posts get a different picture than the dry run showed before
        expect(digest(paintEyecatch('abc123'))).toBe('7f732f759dd5ef842050abf8c95f1eb19ef02d8ddfd2f89bc93c3092a4d131a8');
        expect(eyecatchPng('abc123')).toEqual(eyecatchPng('abc123'));
        expect(digest(paintEyecatch('abc124'))).not.toBe(digest(paintEyecatch('abc123')));
    });

    test('is blue, with veins of at least two other colours', () => {
        const pictures = Array.from({ length: 24 }, (_, i) => ({ id: `post-${i}`, ...colours(paintEyecatch(`post-${i}`)) }));
        expect(pictures.filter((picture) => picture.blue < 0.7).map((picture) => picture.id)).toEqual([]);
        expect(pictures.filter((picture) => picture.accent < 0.03 || picture.accent > 0.25).map((picture) => picture.id)).toEqual([]);
        expect(pictures.filter((picture) => picture.accents.length < 2).map((picture) => picture.id)).toEqual([]);
        // Across the posts the accents are many: pink, red, orange, amber, green, cyan, violet
        expect(new Set(pictures.flatMap((picture) => picture.accents)).size).toBe(7);
    });
});

// ─── A stand-in for microCMS ─────────────────────────────────────────────────

interface Call {
    method: string;
    url: URL;
    headers: Record<string, string>;
    body: unknown;
    redirect: unknown;
}

/**
 * Answers `fetch` as microCMS would: lists `contents`, takes uploads and PATCHes.
 * Returns the requests it was sent. `refuse` can answer one of them differently, or throw.
 */
function microcms(contents: object[], refuse: (call: Call) => Response | undefined = () => undefined): Call[] {
    const calls: Call[] = [];
    spyOn(globalThis, 'fetch').mockImplementation((async (url: string, init: RequestInit = {}) => {
        const call: Call = {
            method: init.method ?? 'GET',
            url: new URL(url),
            headers: init.headers as Record<string, string>,
            body: init.body,
            redirect: init.redirect,
        };
        calls.push(call);
        const refusal = refuse(call);
        if (refusal) return refusal;
        if (call.method === 'GET') return Response.json({ contents, totalCount: contents.length });
        if (call.method === 'POST') {
            const file = (call.body as FormData).get('file') as File;
            return Response.json({ url: `${MEDIA}/${file.name}` }, { status: 201 });
        }
        return Response.json({ id: call.url.pathname.split('/').pop() });
    }) as unknown as typeof fetch);
    return calls;
}

const MEDIA = 'https://images.microcms-assets.io/assets/service/media';
const readEnv = { MICROCMS_SERVICE_DOMAIN: 'hidden-domain', MICROCMS_API_KEY: 'hidden-read-key' };
const writeEnv = { ...readEnv, MICROCMS_WRITE_API_KEY: 'hidden-write-key' };

function apiPost(id: string, eyecatch?: string): object {
    return {
        id,
        title: `Post ${id}`,
        content: '<p>c</p>',
        publishedAt: '2024-08-22T15:00:00.000Z',
        ...(eyecatch && { eyecatch: { url: eyecatch, width: 1200, height: 630 } }),
    };
}

/** Two posts without an eyecatch around one that has its own */
const contents = [apiPost('bare-1'), apiPost('dressed', `${MEDIA}/photo.jpg`), apiPost('bare-2')];

const sent = (calls: Call[]) => calls.map((call) => `${call.method} ${call.url.host}${call.url.pathname}`);

describe('microCMS', () => {
    let slept: Mock<typeof Bun.sleep>;

    beforeEach(() => {
        // The pauses before a write is tried again are not waited out here
        slept = spyOn(Bun, 'sleep').mockResolvedValue(undefined as never);
    });

    afterEach(() => mock.restore());

    test('reads the eyecatch of a post, or that it has none', async () => {
        const calls = microcms([...contents, { ...apiPost('emptied'), eyecatch: null }]);
        const posts = await fetchPosts(readEnv);
        expect(posts.map((post) => post.eyecatch)).toEqual([null, `${MEDIA}/photo.jpg`, null, null]);
        expect(calls[0]!.url.searchParams.get('fields')!.split(',')).toContain('eyecatch');
    });

    test('uploads a picture to the media library with the write key', async () => {
        const calls = microcms([]);
        const png = eyecatchPng('abc123');
        expect(await uploadImage(writeEnv, 'eyecatch-abc123.png', png)).toBe(`${MEDIA}/eyecatch-abc123.png`);

        expect(sent(calls)).toEqual(['POST hidden-domain.microcms-management.io/api/v1/media']);
        // No Content-Type of its own: fetch writes the multipart one, with its boundary
        expect(calls[0]!.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-write-key' });
        const file = (calls[0]!.body as FormData).get('file') as File;
        expect([file.name, file.type]).toEqual(['eyecatch-abc123.png', 'image/png']);
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
    });

    test('sets the eyecatch of a post and no other field', async () => {
        const calls = microcms([]);
        await setEyecatch(writeEnv, 'abc123', `${MEDIA}/eyecatch-abc123.png`);

        expect(sent(calls)).toEqual(['PATCH hidden-domain.microcms.io/api/v1/blogs/abc123']);
        expect(calls[0]!.url.search).toBe('');
        expect(calls[0]!.headers).toEqual({ 'Content-Type': 'application/json', 'X-MICROCMS-API-KEY': 'hidden-write-key' });
        expect(JSON.parse(calls[0]!.body as string)).toEqual({ eyecatch: `${MEDIA}/eyecatch-abc123.png` });
    });

    test('writes nothing without the write key, and nowhere but to microCMS', async () => {
        const calls = microcms([]);
        const png = eyecatchPng('abc123');
        const elsewhere = { ...writeEnv, MICROCMS_SERVICE_DOMAIN: 'example.com/#' };
        await expect(uploadImage(readEnv, 'a.png', png)).rejects.toThrow('Missing MICROCMS_WRITE_API_KEY.');
        await expect(setEyecatch(readEnv, 'abc123', `${MEDIA}/a.png`)).rejects.toThrow('Missing MICROCMS_WRITE_API_KEY.');
        await expect(uploadImage(elsewhere, 'a.png', png)).rejects.toBeInstanceOf(BlogSourceError);
        await expect(setEyecatch(elsewhere, 'abc123', `${MEDIA}/a.png`)).rejects.toBeInstanceOf(BlogSourceError);
        await expect(setEyecatch(writeEnv, '../media', `${MEDIA}/a.png`)).rejects.toBeInstanceOf(BlogSourceError);
        expect(calls).toEqual([]);
    });

    test('keeps the domain and the keys out of the errors of a refused write', async () => {
        microcms([], () => new Response('{}', { status: 403 }));
        const upload = await uploadImage(writeEnv, 'a.png', eyecatchPng('abc123')).catch((error) => error);
        const patch = await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`).catch((error) => error);

        for (const error of [upload, patch]) {
            expect(error).toBeInstanceOf(BlogSourceError);
            expect(error.message).not.toContain('hidden');
        }
        expect(upload.message).toBe('microCMS answered 403 for the upload of a.png. Check MICROCMS_SERVICE_DOMAIN and MICROCMS_WRITE_API_KEY.');
        expect(patch.message).toBe('microCMS answered 403 for PATCH /blogs/abc123. Check MICROCMS_SERVICE_DOMAIN and MICROCMS_WRITE_API_KEY.');
        // A refusal is final
        expect(slept).not.toHaveBeenCalled();
    });

    test('quotes what microCMS says is wrong, as one line without the domain or the key', async () => {
        const message = "'eyecatch' is unexpected key\n  for hidden-domain (hidden-write-key)";
        microcms([], () => Response.json({ message }, { status: 400 }));
        const error = await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`).catch((reason) => reason);

        expect(error).toBeInstanceOf(BlogSourceError);
        expect(error.message).toBe("microCMS answered 400 for PATCH /blogs/abc123. It said: 'eyecatch' is unexpected key for *** (***).");
    });

    test('tries a write again when microCMS answers 429 or 5xx, and gives up after three such answers', async () => {
        /** Answers the first `times` writes with a 429 or a 503, by turns */
        const busy = (times: number) => {
            let answered = 0;
            return (call: Call) => (call.method !== 'GET' && answered++ < times ? new Response('{}', { status: answered % 2 ? 429 : 503 }) : undefined);
        };

        let calls = microcms([], busy(1));
        expect(await uploadImage(writeEnv, 'a.png', eyecatchPng('abc123'))).toBe(`${MEDIA}/a.png`);
        expect(calls).toHaveLength(2);
        expect(slept.mock.calls).toEqual([[2000]]);

        slept.mockClear();
        calls = microcms([], busy(2));
        await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`);
        expect(calls).toHaveLength(3);
        // The second pause outlasts the 10-second window of the Management API
        expect(slept.mock.calls).toEqual([[2000], [10000]]);

        slept.mockClear();
        calls = microcms([], busy(3));
        await expect(setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`)).rejects.toThrow(/^microCMS answered (429|503) for PATCH \/blogs\/abc123\.$/);
        expect(calls).toHaveLength(3);
    });

    test('reads once, as before', async () => {
        const calls = microcms([], () => new Response('{}', { status: 503 }));
        await expect(fetchPosts(readEnv)).rejects.toThrow('microCMS answered 503 for /blogs.');
        expect(calls).toHaveLength(1);
        expect(slept).not.toHaveBeenCalled();
    });

    test('says so when a write got no answer and may still have gone through', async () => {
        microcms([], () => {
            throw new DOMException('The operation timed out.', 'TimeoutError');
        });
        await expect(uploadImage(writeEnv, 'a.png', eyecatchPng('abc123'))).rejects.toThrow(
            'No answer from microCMS for the upload of a.png (TimeoutError). The request may still have gone through.',
        );
        const read = await fetchPosts(readEnv).catch((reason) => reason);
        expect(read.message).toBe('No answer from microCMS for /blogs (TimeoutError).');
    });

    test('follows no redirect: it would take the key to another host', async () => {
        const calls = microcms(contents);
        await fetchPosts(readEnv);
        await uploadImage(writeEnv, 'a.png', eyecatchPng('abc123'));
        await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`);
        expect(calls.map((call) => call.redirect)).toEqual(['error', 'error', 'error']);
    });

    test('takes an upload as failed unless it comes back with the URL of the image', async () => {
        for (const body of ['{}', 'null', '{"url":""}', '{"url":42}', 'OK']) {
            microcms([], () => new Response(body, { status: 201 }));
            await expect(uploadImage(writeEnv, 'eyecatch-abc123.png', eyecatchPng('abc123'))).rejects.toThrow(
                'microCMS took the upload but did not say where the image is. Look for eyecatch-abc123.png in the media library.',
            );
        }
    });

    test('takes a PATCH as done on the status alone', async () => {
        microcms([], () => new Response(null, { status: 200 }));
        await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`);
    });
});

describe('build', () => {
    let dist: string;
    let logged: string[];
    let slept: Mock<typeof Bun.sleep>;

    beforeEach(async () => {
        dist = await mkdtemp(join(tmpdir(), 'blog-eyecatch-'));
        logged = [];
        spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line));
        // The pause between uploads is not waited out here
        slept = spyOn(Bun, 'sleep').mockResolvedValue(undefined as never);
    });

    afterEach(async () => {
        mock.restore();
        await rm(dist, { recursive: true, force: true });
    });

    test('without the write key, draws and sends nothing, and builds the blog all the same', async () => {
        const calls = microcms(contents);
        const drawn = spyOn(art, 'eyecatchPng');
        await buildBlog(readEnv, dist);

        expect(sent(calls)).toEqual(['GET hidden-domain.microcms.io/api/v1/blogs']);
        expect(drawn).not.toHaveBeenCalled();
        expect(logged).toContain('Posts without an eyecatch: 2. MICROCMS_WRITE_API_KEY is not set, so none is generated.');
        expect((await readdir(join(dist, 'blog'))).sort()).toEqual(['bare-1.html', 'bare-2.html', 'dressed.html', 'feed.xml']);
    });

    test('with the write key, gives each post without an eyecatch its picture and leaves the others alone', async () => {
        const calls = microcms(contents);
        await buildBlog(writeEnv, dist);

        expect(sent(calls)).toEqual([
            'GET hidden-domain.microcms.io/api/v1/blogs',
            'POST hidden-domain.microcms-management.io/api/v1/media',
            'PATCH hidden-domain.microcms.io/api/v1/blogs/bare-1',
            'POST hidden-domain.microcms-management.io/api/v1/media',
            'PATCH hidden-domain.microcms.io/api/v1/blogs/bare-2',
        ]);
        // The read key reads, the write key writes
        expect(calls.map((call) => call.headers['X-MICROCMS-API-KEY'])).toEqual(['hidden-read-key', ...Array(4).fill('hidden-write-key')]);

        // Each post gets the picture of its own ID, at the URL the upload came back with
        for (const [upload, patch, id] of [[calls[1]!, calls[2]!, 'bare-1'], [calls[3]!, calls[4]!, 'bare-2']] as const) {
            const file = (upload.body as FormData).get('file') as File;
            expect(file.name).toBe(`eyecatch-${id}.png`);
            expect(new Uint8Array(await file.arrayBuffer())).toEqual(eyecatchPng(id));
            expect(JSON.parse(patch.body as string)).toEqual({ eyecatch: `${MEDIA}/eyecatch-${id}.png` });
        }

        // One pause, between the two uploads: the Management API takes 10 requests per 10 seconds
        expect(slept.mock.calls).toEqual([[1100]]);
        expect(logged).toContain('Generated an eyecatch for bare-1');
        expect(logged).toContain('Generated an eyecatch for bare-2');
        expect((await readdir(join(dist, 'blog'))).sort()).toEqual(['bare-1.html', 'bare-2.html', 'dressed.html', 'feed.xml']);
    });

    test('sends nothing when every post has an eyecatch', async () => {
        const calls = microcms([apiPost('dressed', `${MEDIA}/photo.jpg`)]);
        const drawn = spyOn(art, 'eyecatchPng');
        await buildBlog(writeEnv, dist);

        expect(sent(calls)).toEqual(['GET hidden-domain.microcms.io/api/v1/blogs']);
        expect(drawn).not.toHaveBeenCalled();
    });

    test('stops at the first write that fails, and says what it left in the media library', async () => {
        const calls = microcms(contents, (call) => (call.method === 'PATCH' ? new Response('{}', { status: 403 }) : undefined));
        const error = await buildBlog(writeEnv, dist).catch((reason) => reason);

        expect(error).toBeInstanceOf(BlogSourceError);
        expect(error.message).toBe(
            'microCMS answered 403 for PATCH /blogs/bare-1. Check MICROCMS_SERVICE_DOMAIN and MICROCMS_WRITE_API_KEY. ' +
            'The picture was uploaded and stays in the media library as eyecatch-bare-1.png.',
        );
        // bare-2 is not started
        expect(sent(calls)).toHaveLength(3);
        expect(await readdir(dist)).toEqual([]);
    });
});

describe('dry run', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'eyecatch-dry-run-'));
        spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(async () => {
        mock.restore();
        await rm(dir, { recursive: true, force: true });
    });

    test('writes the pictures of the posts it is given, without credentials or the network', async () => {
        const calls = microcms(contents);
        const paths = await dryRun(['abc123', 'x_y-z'], {}, dir);

        expect(paths).toEqual([join(dir, 'abc123.png'), join(dir, 'x_y-z.png')]);
        // The same file the build would upload
        expect(await Bun.file(paths[0]!).bytes()).toEqual(eyecatchPng('abc123'));
        expect(await Bun.file(paths[1]!).bytes()).toEqual(eyecatchPng('x_y-z'));
        expect(calls).toEqual([]);
    });

    test('given no post, writes the pictures the build would make and only reads from microCMS', async () => {
        const calls = microcms(contents);
        // The write key being there changes nothing
        const paths = await dryRun([], writeEnv, dir);

        expect(paths).toEqual([join(dir, 'bare-1.png'), join(dir, 'bare-2.png')]);
        expect((await readdir(dir)).sort()).toEqual(['bare-1.png', 'bare-2.png']);
        expect(sent(calls)).toEqual(['GET hidden-domain.microcms.io/api/v1/blogs']);
        expect(calls[0]!.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-read-key' });
    });

    test('without the credentials, asks for post IDs', async () => {
        const calls = microcms(contents);
        await expect(dryRun([], {}, dir)).rejects.toThrow(
            'Missing MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY, so the posts cannot be read. ' +
            'Name them instead: bun run eyecatch:dry-run <post ID>...',
        );
        expect(calls).toEqual([]);
        expect(await readdir(dir)).toEqual([]);
    });

    test('takes nothing but post IDs', async () => {
        for (const odd of ['../escape', 'a/b', '--help', '-h', '']) {
            await expect(dryRun(['abc123', odd], {}, dir)).rejects.toThrow(`Not a post ID: ${JSON.stringify(odd)}.`);
        }
        expect(await readdir(dir)).toEqual([]);

        // An ID may well start with a hyphen or an underscore
        expect(await dryRun(['-abc', '_abc'], {}, dir)).toEqual([join(dir, '-abc.png'), join(dir, '_abc.png')]);
    });
});
