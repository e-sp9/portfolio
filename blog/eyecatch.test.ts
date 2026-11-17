import { afterEach, beforeEach, describe, expect, type Mock, mock, spyOn, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { buildBlog } from './build';
import * as art from './eyecatch';
import { EYECATCH_HEIGHT, EYECATCH_WIDTH, eyecatchPng, paintEyecatch } from './eyecatch';
import { dryRun } from './eyecatch-dry-run';
import { BlogSourceError, currentEyecatch, fetchPosts, setEyecatch, uploadImage } from './microcms';

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
        const to = pixels.subarray(y * stride, (y + 1) * stride);
        // Sub: each byte is the difference from the same channel of the pixel before
        if (filter === 1) row.forEach((byte, x) => (to[x] = byte + (x < 3 ? 0 : to[x - 3]!)));
        // Up: the difference from the row above
        else if (filter === 2) row.forEach((byte, x) => (to[x] = byte + pixels[(y - 1) * stride + x]!));
        else throw new Error(`Unexpected filter ${filter} on row ${y}`);
    }
    return { width, height, pixels };
}

/** Side of one dot of the picture, in pixels */
const DOT = 3;
const COLS = EYECATCH_WIDTH / DOT;
const ROWS = EYECATCH_HEIGHT / DOT;

/**
 * The two accents, each by its red minus green and its green minus blue. The grain moves the
 * three channels of a dot by the same amount, so these tell an accent whatever the grain did.
 */
const AMBER = { red: 0xe3, gaps: [0xe3 - 0xa0, 0xa0 - 0x3a] };
const CORAL = { red: 0xdd, gaps: [0xdd - 0x66, 0x66 - 0x50] };

/** What a picture is made of, read dot by dot */
function read(pixels: Uint8Array) {
    const dots = COLS * ROWS;
    const counts = { amber: 0, coral: 0, blue: 0, strays: 0, sameAsTheDotBefore: 0 };
    let vividest = 0;
    /** How far the grain moved the accent dots, whose colour without it is known */
    const grain = new Set<number>();
    let before = -1;
    for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
            const at = ((cy * DOT + 1) * EYECATCH_WIDTH + cx * DOT + 1) * 3;
            const [r, g, b] = [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!];
            const colour = (r << 16) | (g << 8) | b;
            if (cx > 0 && colour === before) counts.sameAsTheDotBefore++;
            before = colour;
            const accent = [AMBER, CORAL].find(({ gaps }) => r - g === gaps[0] && g - b === gaps[1]);
            if (accent) {
                counts[accent === AMBER ? 'amber' : 'coral']++;
                grain.add(r - accent.red);
                continue;
            }
            // The ground: grey, or grey leaning to blue. Anything else is a stray.
            if (r > g + 1 || g > b + 1) counts.strays++;
            const chroma = b - r;
            vividest = Math.max(vividest, chroma);
            // Past this the eye calls it blue (the palest blue of the scale, #93a5bd, is at 42)
            if (chroma >= 40) counts.blue++;
        }
    }
    return {
        amber: counts.amber / dots,
        coral: counts.coral / dots,
        blue: counts.blue / dots,
        strays: counts.strays,
        sameAsTheDotBefore: counts.sameAsTheDotBefore / dots,
        vividest,
        grain: [...grain].sort((a, b) => a - b),
    };
}

describe('eyecatch art', () => {
    test('is a 1200×630 PNG of the painted pixels', () => {
        const png = eyecatchPng('abc123');
        const { width, height, pixels } = decodePng(png);
        expect([width, height]).toEqual([1200, 630]);
        expect(digest(pixels)).toBe(digest(paintEyecatch('abc123')));
        // The media library takes 5MB per upload. The grain does not compress well, but this is far from it.
        expect(png.length).toBeLessThan(512 * 1024);
    });

    test('gives a post the same picture every time, grain and all, and each post its own', () => {
        // Pinned: if this changes, posts get a different picture than the dry run showed before
        expect(digest(paintEyecatch('abc123'))).toBe('c9a8b97b7fd4c549252c468fc2b79954bd3d1b39b54ba43d826786aba309c301');
        expect(eyecatchPng('abc123')).toEqual(eyecatchPng('abc123'));
        expect(digest(paintEyecatch('abc124'))).not.toBe(digest(paintEyecatch('abc123')));
    });

    test('is drawn in dots of 3px', () => {
        const pixels = paintEyecatch('abc123');
        // Every dot is of one colour
        let mixed = 0;
        for (let cy = 0; cy < ROWS; cy++) {
            for (let cx = 0; cx < COLS; cx++) {
                const corner = (cy * DOT * EYECATCH_WIDTH + cx * DOT) * 3;
                for (let y = 0; y < DOT; y++) {
                    for (let x = 0; x < DOT; x++) {
                        const at = corner + (y * EYECATCH_WIDTH + x) * 3;
                        if (pixels[at] !== pixels[corner] || pixels[at + 1] !== pixels[corner + 1] || pixels[at + 2] !== pixels[corner + 2]) mixed++;
                    }
                }
            }
        }
        expect(mixed).toBe(0);
        // And a dot is no bigger than that: the grain sees to it that the next one is hardly ever the same
        expect(read(pixels).sameAsTheDotBefore).toBeLessThan(0.1);
    });

    test('keeps to a quiet blue between ink and paper, with one warm accent or two', () => {
        const pictures = Array.from({ length: 24 }, (_, i) => ({ id: `post-${i}`, ...read(paintEyecatch(`post-${i}`)) }));
        const ids = (which: (picture: (typeof pictures)[number]) => boolean) => pictures.filter(which).map((picture) => picture.id);

        // Nothing but the ground and the two accents
        expect(ids((picture) => picture.strays > 0)).toEqual([]);
        // The blue is quiet: the accent token it comes from, #3b82f6, has 187 between its red and its blue
        expect(ids((picture) => picture.vividest > 70)).toEqual([]);
        // And it does not fill the pictures: about half of the dots are blue, the rest paper, grey or ink
        expect(ids((picture) => picture.blue > 0.9)).toEqual([]);
        expect(pictures.reduce((sum, picture) => sum + picture.blue, 0) / pictures.length).toBeLessThan(0.6);

        // Every picture has its vein of amber or of coral, some have both, and none is flooded
        const shows = (share: number) => share >= 0.004;
        expect(ids((picture) => !shows(picture.amber) && !shows(picture.coral))).toEqual([]);
        expect(ids((picture) => picture.amber + picture.coral > 0.16)).toEqual([]);
        expect(ids((picture) => shows(picture.amber) && shows(picture.coral)).length).toBeGreaterThan(0);
        expect(ids((picture) => shows(picture.amber) !== shows(picture.coral)).length).toBeGreaterThan(0);
    });

    test('lays a grain over the whole picture', () => {
        for (const id of ['abc123', 'abc124']) {
            const { grain, sameAsTheDotBefore } = read(paintEyecatch(id));
            // Each dot is moved by up to 18 either way, and by every amount in between
            expect(grain[0]).toBeGreaterThanOrEqual(-18);
            expect(grain[0]).toBeLessThan(-14);
            expect(grain.at(-1)).toBeLessThanOrEqual(18);
            expect(grain.at(-1)).toBeGreaterThan(14);
            expect(grain.length).toBeGreaterThan(30);
            // No patch of the picture is left flat
            expect(sameAsTheDotBefore).toBeLessThan(0.1);
        }
    });
});

// ─── A stand-in for microCMS ─────────────────────────────────────────────────

interface Call {
    method: string;
    url: URL;
    headers: Record<string, string>;
    body: unknown;
    redirect: unknown;
    /** Answered by the CDN from what it kept, without microCMS being asked */
    cached: boolean;
}

/** A post as the stand-in keeps it */
interface Stored {
    id: string;
    createdAt: string;
    eyecatch?: { url: string; width: number; height: number };
}

/**
 * Answers `fetch` as microCMS would, behind its CDN. microCMS lists its posts, takes uploads, and
 * a PATCH sets the eyecatch of the post it names. The CDN is at its worst: a read it has answered
 * once, it goes on answering the same way for the same key, whatever has happened to the posts since.
 * Returns the requests it was sent and the posts as they stand. `on` sees each request first: it
 * can change the posts, as an editor would in the meantime, answer in microCMS's place, or throw.
 */
function microcms(contents: object[], on: (call: Call, posts: Stored[]) => Response | void = () => {}): { calls: Call[]; posts: Stored[] } {
    const posts = structuredClone(contents) as Stored[];
    const calls: Call[] = [];
    const kept = new Map<string, string>();
    spyOn(globalThis, 'fetch').mockImplementation((async (url: string, init: RequestInit = {}) => {
        const call: Call = {
            method: init.method ?? 'GET',
            url: new URL(url),
            headers: init.headers as Record<string, string>,
            body: init.body,
            redirect: init.redirect,
            cached: false,
        };
        calls.push(call);
        const instead = on(call, posts);
        if (instead) return instead;
        if (call.method === 'GET') {
            const asked = `${call.headers['X-MICROCMS-API-KEY']} ${url}`;
            call.cached = kept.has(asked);
            if (!call.cached) {
                const offset = Number(call.url.searchParams.get('offset') ?? 0);
                const limit = Number(call.url.searchParams.get('limit') ?? 10);
                const listed = posts.filter(matching(call.url.searchParams.get('filters')));
                kept.set(asked, JSON.stringify({ contents: listed.slice(offset, offset + limit), totalCount: listed.length }));
            }
            return new Response(kept.get(asked), { headers: { 'Content-Type': 'application/json' } });
        }
        if (call.method === 'POST') {
            const file = (call.body as FormData).get('file') as File;
            return Response.json({ url: `${MEDIA}/${file.name}` }, { status: 201 });
        }
        const post = posts.find((stored) => stored.id === call.url.pathname.split('/').pop())!;
        post.eyecatch = picture((JSON.parse(call.body as string) as { eyecatch: string }).eyecatch);
        return Response.json({ id: post.id });
    }) as unknown as typeof fetch);
    return { calls, posts };
}

/** The one kind of filter the stand-in knows: posts created between two instants */
function matching(filters: string | null): (post: Stored) => boolean {
    if (filters === null) return () => true;
    const [, after, before] = /^createdAt\[greater_than\](.+)\[and\]createdAt\[less_than\](.+)$/.exec(filters)!;
    return (post) => new Date(after!) < new Date(post.createdAt) && new Date(post.createdAt) < new Date(before!);
}

const BLOGS = 'hidden-domain.microcms.io/api/v1/blogs';
const UPLOADS = 'hidden-domain.microcms-management.io/api/v1/media';
const MEDIA = 'https://images.microcms-assets.io/assets/service/media';
/** An eyecatch an editor sets by hand */
const BY_HAND = `${MEDIA}/by-hand.jpg`;
const readEnv = { MICROCMS_SERVICE_DOMAIN: 'hidden-domain', MICROCMS_API_KEY: 'hidden-read-key' };
const writeEnv = { ...readEnv, MICROCMS_WRITE_API_KEY: 'hidden-write-key' };

/** An image field as microCMS returns it */
const picture = (url: string) => ({ url, width: 1200, height: 630 });

function apiPost(id: string, eyecatch?: string): object {
    return {
        id,
        title: `Post ${id}`,
        content: '<p>c</p>',
        createdAt: '2024-08-20T09:00:00.000Z',
        publishedAt: '2024-08-22T15:00:00.000Z',
        ...(eyecatch && { eyecatch: picture(eyecatch) }),
    };
}

/** Two posts without an eyecatch around one that has its own */
const contents = [apiPost('bare-1'), apiPost('dressed', `${MEDIA}/photo.jpg`), apiPost('bare-2')];

/** A look is the read of the posts as they are now that goes before a write */
const isLook = (call: Call) => call.url.searchParams.has('filters');

/** The requests in short: what they are, and the host and path they go to */
const sent = (calls: Call[]) => calls.map((call) => `${isLook(call) ? 'LOOK' : call.method} ${call.url.host}${call.url.pathname}`);

/** The eyecatch each post has in the end */
const eyecatchesOf = (posts: Stored[]) => posts.map((post) => post.eyecatch?.url ?? null);

describe('microCMS', () => {
    let slept: Mock<typeof Bun.sleep>;

    beforeEach(() => {
        // The pauses before a request is tried again are not waited out here
        slept = spyOn(Bun, 'sleep').mockResolvedValue(undefined as never);
    });

    afterEach(() => mock.restore());

    test('reads the eyecatch of a post, or that it has none', async () => {
        const { calls } = microcms([...contents, { ...apiPost('emptied'), eyecatch: null }]);
        const posts = await fetchPosts(readEnv);
        expect(posts.map((post) => post.eyecatch)).toEqual([null, picture(`${MEDIA}/photo.jpg`), null, null]);
        expect(calls[0]!.url.searchParams.get('fields')!.split(',')).toContain('eyecatch');
    });

    test('looks at a post as it is now: with a URL nobody has asked before', async () => {
        const { calls, posts } = microcms(contents);
        // Two looks at the same moment, as two builds running side by side would make them
        expect(await Promise.all([currentEyecatch(readEnv, 'bare-1'), currentEyecatch(readEnv, 'bare-1')])).toEqual([null, null]);
        posts[0]!.eyecatch = picture(BY_HAND);
        // The stand-in's CDN would answer a URL it has seen with the post as it was
        expect(await currentEyecatch(readEnv, 'bare-1')).toBe(BY_HAND);
        expect(await currentEyecatch(readEnv, 'dressed')).toBe(`${MEDIA}/photo.jpg`);
        expect(await currentEyecatch(readEnv, 'gone')).toBeUndefined();

        expect(calls.some((call) => call.cached)).toBe(false);
        // What is new each time is a filter that leaves no post out: created between an instant
        // from before microCMS existed and one centuries away, each written as microCMS shows dates
        const range = /^createdAt\[greater_than\](19[7-9]\d-\d\d-\d\dT\d\d:\d\d:\d\dZ)\[and\]createdAt\[less_than\](2[1-9]\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ)$/;
        const ranges = calls.map((call) => range.exec(call.url.searchParams.get('filters')!)!);
        expect(new Set(ranges.map(([, after]) => after)).size).toBe(5);
        expect(new Set(ranges.map(([, , before]) => before)).size).toBe(5);
        for (const call of calls) {
            expect(call.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-read-key' });
            expect(call.url.searchParams.get('fields')!.split(',')).toContain('eyecatch');
        }
    });

    test('looks through every page of the posts', async () => {
        const many = Array.from({ length: 150 }, (_, i) => apiPost(`post-${i}`, i === 149 ? BY_HAND : undefined));
        const { calls } = microcms(many);
        expect(await currentEyecatch(readEnv, 'post-149')).toBe(BY_HAND);
        expect(await currentEyecatch(readEnv, 'post-3')).toBeNull();
        expect(await currentEyecatch(readEnv, 'gone')).toBeUndefined();
        // Two pages for the last post, one for an early one, two to know that a post is not there
        expect(calls.map((call) => call.url.searchParams.get('offset'))).toEqual(['0', '100', '0', '0', '100']);
    });

    test('uploads a picture to the media library with the write key', async () => {
        const { calls } = microcms([]);
        const png = eyecatchPng('abc123');
        expect(await uploadImage(writeEnv, 'eyecatch-abc123.png', png)).toBe(`${MEDIA}/eyecatch-abc123.png`);

        expect(sent(calls)).toEqual([`POST ${UPLOADS}`]);
        // No Content-Type of its own: fetch writes the multipart one, with its boundary
        expect(calls[0]!.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-write-key' });
        const file = (calls[0]!.body as FormData).get('file') as File;
        expect([file.name, file.type]).toEqual(['eyecatch-abc123.png', 'image/png']);
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
    });

    test('sets the eyecatch of a post that has none, and no other field', async () => {
        const { calls, posts } = microcms([apiPost('abc123')]);
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/eyecatch-abc123.png`)).toBe(true);

        // It looks at the post as it is now, with the read key, and then writes
        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`]);
        expect(calls[0]!.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-read-key' });
        expect(calls[1]!.url.search).toBe('');
        expect(calls[1]!.headers).toEqual({ 'Content-Type': 'application/json', 'X-MICROCMS-API-KEY': 'hidden-write-key' });
        expect(JSON.parse(calls[1]!.body as string)).toEqual({ eyecatch: `${MEDIA}/eyecatch-abc123.png` });
        expect(eyecatchesOf(posts)).toEqual([`${MEDIA}/eyecatch-abc123.png`]);
    });

    test('does not overwrite an eyecatch the post has been given in the meantime', async () => {
        const { calls, posts } = microcms([apiPost('abc123', BY_HAND)]);
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/eyecatch-abc123.png`)).toBe(false);

        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`]);
        expect(eyecatchesOf(posts)).toEqual([BY_HAND]);
    });

    test('does not write to a post that is no longer published', async () => {
        const { calls } = microcms([apiPost('another')]);
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/eyecatch-abc123.png`)).toBe(false);
        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`]);
    });

    test('looks at the post again before every attempt of the PATCH', async () => {
        // The first PATCH is answered 503. Before the second, an editor sets an eyecatch.
        const { calls, posts } = microcms([apiPost('abc123')], (call, stored) => {
            if (call.method !== 'PATCH') return;
            stored[0]!.eyecatch = picture(BY_HAND);
            return new Response('{}', { status: 503 });
        });
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/eyecatch-abc123.png`)).toBe(false);

        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`, `LOOK ${BLOGS}`]);
        // The second look is not the first one asked again, which the CDN would answer as before
        expect(calls[2]!.url.href).not.toBe(calls[0]!.url.href);
        expect(calls[2]!.cached).toBe(false);
        expect(eyecatchesOf(posts)).toEqual([BY_HAND]);
    });

    test('takes a PATCH that went through despite the error it was answered with as done', async () => {
        const { calls } = microcms([apiPost('abc123')], (call, stored) => {
            if (call.method !== 'PATCH') return;
            stored[0]!.eyecatch = picture(`${MEDIA}/eyecatch-abc123.png`);
            return new Response('{}', { status: 503 });
        });
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/eyecatch-abc123.png`)).toBe(true);
        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`, `LOOK ${BLOGS}`]);
    });

    test('writes nothing without the write key, and nowhere but to microCMS', async () => {
        const { calls } = microcms([apiPost('abc123')]);
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
        microcms([apiPost('abc123')], (call) => (call.method === 'GET' ? undefined : new Response('{}', { status: 403 })));
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
        microcms([apiPost('abc123')], (call) => (call.method === 'PATCH' ? Response.json({ message }, { status: 400 }) : undefined));
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

        let { calls } = microcms([], busy(1));
        expect(await uploadImage(writeEnv, 'a.png', eyecatchPng('abc123'))).toBe(`${MEDIA}/a.png`);
        expect(calls).toHaveLength(2);
        expect(slept.mock.calls).toEqual([[2000]]);

        slept.mockClear();
        ({ calls } = microcms([apiPost('abc123')], busy(2)));
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`)).toBe(true);
        // A look before each attempt
        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`]);
        // The second pause outlasts the 10-second window of the Management API
        expect(slept.mock.calls).toEqual([[2000], [10000]]);

        slept.mockClear();
        ({ calls } = microcms([apiPost('abc123')], busy(3)));
        await expect(setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`)).rejects.toThrow(/^microCMS answered (429|503) for PATCH \/blogs\/abc123\.$/);
        expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(3);
    });

    test('is as patient with the look before a write as with the write', async () => {
        let refused = false;
        const { calls } = microcms([apiPost('abc123')], (call) => {
            if (call.method !== 'GET' || refused) return;
            refused = true;
            return new Response('{}', { status: 503 });
        });
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`)).toBe(true);

        expect(sent(calls)).toEqual([`LOOK ${BLOGS}`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/abc123`]);
        expect(slept.mock.calls).toEqual([[2000]]);
    });

    test('reads the list once, as before', async () => {
        const { calls } = microcms([], () => new Response('{}', { status: 503 }));
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
        const { calls } = microcms([apiPost('abc123')]);
        await fetchPosts(readEnv);
        await uploadImage(writeEnv, 'a.png', eyecatchPng('abc123'));
        await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`);
        expect(calls.map((call) => `${call.method} ${call.redirect}`)).toEqual(['GET error', 'POST error', 'GET error', 'PATCH error']);
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
        microcms([apiPost('abc123')], (call) => (call.method === 'PATCH' ? new Response(null, { status: 200 }) : undefined));
        expect(await setEyecatch(writeEnv, 'abc123', `${MEDIA}/a.png`)).toBe(true);
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
        const { calls } = microcms(contents);
        const drawn = spyOn(art, 'eyecatchPng');
        await buildBlog(readEnv, dist);

        expect(sent(calls)).toEqual([`GET ${BLOGS}`]);
        expect(drawn).not.toHaveBeenCalled();
        expect(logged).toContain('Posts without an eyecatch: 2. MICROCMS_WRITE_API_KEY is not set, so none is generated.');
        expect((await readdir(join(dist, 'blog'))).sort()).toEqual(['bare-1.html', 'bare-2.html', 'dressed.html', 'feed.xml']);
    });

    test('with the write key, gives each post without an eyecatch its picture and leaves the others alone', async () => {
        const { calls, posts } = microcms(contents);
        await buildBlog(writeEnv, dist);

        // After the list, each post is looked at again before its upload and before its PATCH
        expect(sent(calls)).toEqual([
            `GET ${BLOGS}`,
            `LOOK ${BLOGS}`,
            `POST ${UPLOADS}`,
            `LOOK ${BLOGS}`,
            `PATCH ${BLOGS}/bare-1`,
            `LOOK ${BLOGS}`,
            `POST ${UPLOADS}`,
            `LOOK ${BLOGS}`,
            `PATCH ${BLOGS}/bare-2`,
        ]);
        // The read key reads, the write key writes
        for (const call of calls) expect(call.headers['X-MICROCMS-API-KEY']).toBe(call.method === 'GET' ? 'hidden-read-key' : 'hidden-write-key');
        // No read is a URL asked before: none can be answered with what the CDN kept
        expect(calls.some((call) => call.cached)).toBe(false);

        // Each post gets the picture of its own ID, at the URL the upload came back with
        for (const [upload, patch, id] of [[calls[2]!, calls[4]!, 'bare-1'], [calls[6]!, calls[8]!, 'bare-2']] as const) {
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
        expect(eyecatchesOf(posts)).toEqual([`${MEDIA}/eyecatch-bare-1.png`, `${MEDIA}/photo.jpg`, `${MEDIA}/eyecatch-bare-2.png`]);
    });

    test('sends nothing when every post has an eyecatch', async () => {
        const { calls } = microcms([apiPost('dressed', `${MEDIA}/photo.jpg`)]);
        const drawn = spyOn(art, 'eyecatchPng');
        await buildBlog(writeEnv, dist);

        expect(sent(calls)).toEqual([`GET ${BLOGS}`]);
        expect(drawn).not.toHaveBeenCalled();
    });

    test('leaves alone a post that is given an eyecatch by hand after the list was read', async () => {
        // An editor sets an eyecatch on bare-2 while the build is busy with bare-1
        const { calls, posts } = microcms(contents, (call, stored) => {
            if (call.method === 'POST') stored[2]!.eyecatch = picture(BY_HAND);
        });
        const drawn = spyOn(art, 'eyecatchPng');
        await buildBlog(writeEnv, dist);

        expect(sent(calls)).toEqual([
            `GET ${BLOGS}`,
            `LOOK ${BLOGS}`,
            `POST ${UPLOADS}`,
            `LOOK ${BLOGS}`,
            `PATCH ${BLOGS}/bare-1`,
            // By its turn bare-2 has an eyecatch: nothing is drawn, uploaded or written for it
            `LOOK ${BLOGS}`,
        ]);
        expect(drawn.mock.calls).toEqual([['bare-1']]);
        expect(logged).toContain('Left bare-2 alone: it has an eyecatch by now.');
        expect(eyecatchesOf(posts)).toEqual([`${MEDIA}/eyecatch-bare-1.png`, `${MEDIA}/photo.jpg`, BY_HAND]);
    });

    test('leaves alone a post that is given an eyecatch by hand while its picture is uploading', async () => {
        // The editor's eyecatch arrives after the look before the upload, and before the PATCH
        const { calls, posts } = microcms(contents, (call, stored) => {
            const uploading = call.method === 'POST' && ((call.body as FormData).get('file') as File).name;
            if (uploading === 'eyecatch-bare-1.png') stored[0]!.eyecatch = picture(BY_HAND);
        });
        await buildBlog(writeEnv, dist);

        expect(sent(calls)).toEqual([
            `GET ${BLOGS}`,
            `LOOK ${BLOGS}`,
            `POST ${UPLOADS}`,
            // The look before the PATCH finds the eyecatch: there is no PATCH for bare-1
            `LOOK ${BLOGS}`,
            `LOOK ${BLOGS}`,
            `POST ${UPLOADS}`,
            `LOOK ${BLOGS}`,
            `PATCH ${BLOGS}/bare-2`,
        ]);
        expect(logged).toContain(
            'Left bare-1 alone: it was given an eyecatch, or taken down, before the picture could be set. ' +
            'The picture stays in the media library as eyecatch-bare-1.png.',
        );
        expect(eyecatchesOf(posts)).toEqual([BY_HAND, `${MEDIA}/photo.jpg`, `${MEDIA}/eyecatch-bare-2.png`]);
    });

    test('leaves alone a post that is taken down after the list was read', async () => {
        const { calls, posts } = microcms(contents, (call, stored) => {
            // bare-1 is unpublished before its turn comes
            if (isLook(call) && stored[0]!.id === 'bare-1') stored.shift();
        });
        await buildBlog(writeEnv, dist);

        expect(sent(calls)).toEqual([`GET ${BLOGS}`, `LOOK ${BLOGS}`, `LOOK ${BLOGS}`, `POST ${UPLOADS}`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/bare-2`]);
        expect(logged).toContain('Left bare-1 alone: it is no longer published.');
        expect(eyecatchesOf(posts)).toEqual([`${MEDIA}/photo.jpg`, `${MEDIA}/eyecatch-bare-2.png`]);
    });

    test('run again, does not go by what the CDN kept from the build before', async () => {
        // The first build fails at the PATCH of bare-1. By then it has read the list and looked at bare-1 twice.
        let refusing = true;
        const { calls, posts } = microcms(contents, (call) => (refusing && call.method === 'PATCH' ? new Response('{}', { status: 403 }) : undefined));
        await expect(buildBlog(writeEnv, dist)).rejects.toBeInstanceOf(BlogSourceError);
        expect(sent(calls)).toEqual([`GET ${BLOGS}`, `LOOK ${BLOGS}`, `POST ${UPLOADS}`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/bare-1`]);

        // An editor sets an eyecatch on bare-1, and the build is run again. The CDN has not caught up:
        // it answers every URL it has seen as it did the first time.
        posts[0]!.eyecatch = picture(BY_HAND);
        refusing = false;
        const again = calls.length;
        await buildBlog(writeEnv, dist);
        const second = calls.slice(again);

        // The list is such a URL, and still shows bare-1 without an eyecatch. The looks are not:
        // microCMS itself answers them, bare-1 is left alone and bare-2 goes on as usual.
        expect(sent(second)).toEqual([`GET ${BLOGS}`, `LOOK ${BLOGS}`, `LOOK ${BLOGS}`, `POST ${UPLOADS}`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/bare-2`]);
        expect(second.map((call) => call.cached)).toEqual([true, false, false, false, false, false]);
        expect(logged).toContain('Left bare-1 alone: it has an eyecatch by now.');
        expect(eyecatchesOf(posts)).toEqual([BY_HAND, `${MEDIA}/photo.jpg`, `${MEDIA}/eyecatch-bare-2.png`]);
    });

    test('stops at the first write that fails, and says what it left in the media library', async () => {
        const { calls } = microcms(contents, (call) => (call.method === 'PATCH' ? new Response('{}', { status: 403 }) : undefined));
        const error = await buildBlog(writeEnv, dist).catch((reason) => reason);

        expect(error).toBeInstanceOf(BlogSourceError);
        expect(error.message).toBe(
            'microCMS answered 403 for PATCH /blogs/bare-1. Check MICROCMS_SERVICE_DOMAIN and MICROCMS_WRITE_API_KEY. ' +
            'The picture was uploaded and stays in the media library as eyecatch-bare-1.png.',
        );
        // bare-2 is not started
        expect(sent(calls)).toEqual([`GET ${BLOGS}`, `LOOK ${BLOGS}`, `POST ${UPLOADS}`, `LOOK ${BLOGS}`, `PATCH ${BLOGS}/bare-1`]);
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
        const { calls } = microcms(contents);
        const paths = await dryRun(['abc123', 'x_y-z'], {}, dir);

        expect(paths).toEqual([join(dir, 'abc123.png'), join(dir, 'x_y-z.png')]);
        // The same file the build would upload
        expect(await Bun.file(paths[0]!).bytes()).toEqual(eyecatchPng('abc123'));
        expect(await Bun.file(paths[1]!).bytes()).toEqual(eyecatchPng('x_y-z'));
        expect(calls).toEqual([]);
    });

    test('given no post, writes the pictures the build would make and only reads from microCMS', async () => {
        const { calls } = microcms(contents);
        // The write key being there changes nothing
        const paths = await dryRun([], writeEnv, dir);

        expect(paths).toEqual([join(dir, 'bare-1.png'), join(dir, 'bare-2.png')]);
        expect((await readdir(dir)).sort()).toEqual(['bare-1.png', 'bare-2.png']);
        expect(sent(calls)).toEqual([`GET ${BLOGS}`]);
        expect(calls[0]!.headers).toEqual({ 'X-MICROCMS-API-KEY': 'hidden-read-key' });
    });

    test('without the credentials, asks for post IDs', async () => {
        const { calls } = microcms(contents);
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
