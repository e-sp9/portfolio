// Writes the blog into dist/ as static files, and the posts it recommends into the
// top page there. A step of `bun run build` that comes after the pages are bundled,
// so dist/index.html is there to write into. Without the posts the build stops here.
// On the way, posts that have no eyecatch in microCMS are given a generated one.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { picks, writeEntrance } from './entrance';
import { EYECATCH_HEIGHT, EYECATCH_WIDTH, eyecatchPng } from './eyecatch';
import { BlogSourceError, currentEyecatch, type Eyecatch, fetchPosts, type Post, setEyecatch, uploadImage, withoutEyecatch } from './microcms';
import { blogFiles } from './site';
import { discoveryFiles } from '../discovery-site';

type Env = Record<string, string | undefined>;

/** Pause between two uploads, in ms. The Management API takes 10 requests per 10 seconds. */
const UPLOAD_INTERVAL = 1_100;

/**
 * Gives posts without an eyecatch a generated one, and returns the posts to render.
 * Uses any eyecatch found by the freshness checks and excludes posts those checks find unpublished.
 *
 * This is the one place where the build writes to microCMS, and it takes a key of its own.
 * Without MICROCMS_WRITE_API_KEY nothing is drawn or sent, and the build goes on.
 * A post is finished before the next one starts, so a build that fails halfway
 * picks up where it stopped the next time.
 */
async function registerEyecatches(posts: Post[], env: Env): Promise<Post[]> {
    const bare = withoutEyecatch(posts);
    if (bare.length === 0) return posts;
    if (!env.MICROCMS_WRITE_API_KEY) {
        console.log(`Posts without an eyecatch: ${bare.length}. MICROCMS_WRITE_API_KEY is not set, so none is generated.`);
        return posts;
    }

    const unpublished = new Set<string>();
    for (const [index, post] of bare.entries()) {
        if (index > 0) await Bun.sleep(UPLOAD_INTERVAL);
        const eyecatch = await registerEyecatch(env, post.id);
        if (eyecatch === undefined) unpublished.add(post.id);
        else post.eyecatch = eyecatch;
    }
    return posts.filter((post) => !unpublished.has(post.id));
}

async function registerEyecatch(env: Env, id: string): Promise<Eyecatch | undefined> {
    // By its turn a post may have been given an eyecatch, or taken down.
    const current = await currentEyecatch(env, id);
    if (current !== null) {
        console.log(`Left ${id} alone: ${current === undefined ? 'it is no longer published' : 'it has an eyecatch by now'}.`);
        return current;
    }
    const name = `eyecatch-${id}.png`;
    const url = await uploadImage(env, name, eyecatchPng(id));
    let eyecatch: Eyecatch | undefined;
    try {
        eyecatch = await setEyecatch(env, id, { url, width: EYECATCH_WIDTH, height: EYECATCH_HEIGHT });
    } catch (error) {
        if (!(error instanceof BlogSourceError)) throw error;
        throw new BlogSourceError(`${error.message} The picture was uploaded and stays in the media library as ${name}.`);
    }
    console.log(
        eyecatch?.url === url
            ? `Generated an eyecatch for ${id}`
            : `Left ${id} alone: it was ${eyecatch ? 'given an eyecatch' : 'taken down'} before the picture could be set. The picture stays in the media library as ${name}.`,
    );
    return eyecatch;
}

/**
 * Generates the blog into `dist`, and puts the posts tagged for the top page into its
 * dist/index.html (blog/entrance.ts).
 *
 * Without the microCMS credentials, or when the posts cannot be fetched, this is an error and
 * nothing is written, locally and on GitHub Actions alike. The deploy workflow gets the keys
 * from GitHub Secrets, so a failure there stops the deploy and the live /blog stays as it is.
 */
export async function buildBlog(env: Env, dist: string): Promise<void> {
    const posts = await registerEyecatches(await fetchPosts(env), env);
    // A post unpublished since the last build must not linger in a reused dist/
    await rm(join(dist, 'blog'), { recursive: true, force: true });
    const files = blogFiles(posts);
    for (const [path, render] of files) await Bun.write(join(dist, path), await render());
    // From the same posts as the pages above, so every pick links to an article this build wrote
    await writeEntrance(dist, posts);
    for (const [path, content] of await discoveryFiles(posts)) await Bun.write(join(dist, path), content);
    console.log(`Generated /blog: ${posts.length} posts, ${files.size} files, ${picks(posts).length} on the top page`);
}

if (import.meta.main) {
    try {
        await buildBlog(process.env, join(import.meta.dir, '../dist'));
    } catch (error) {
        if (!(error instanceof BlogSourceError)) throw error;
        console.error(`error: ${error.message}`);
        process.exit(1);
    }
}
