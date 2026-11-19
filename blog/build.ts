// Writes the blog into dist/ as static files, and the posts it recommends into the
// top page there. A step of `bun run build` that comes after the pages are bundled,
// so dist/index.html is there to write into. Without the posts the build stops here.
// On the way, posts that have no eyecatch in microCMS are given a generated one.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { picks, writeEntrance } from './entrance';
import { EYECATCH_HEIGHT, EYECATCH_WIDTH, eyecatchPng } from './eyecatch';
import { BlogSourceError, currentEyecatch, fetchPosts, type Post, setEyecatch, uploadImage, withoutEyecatch } from './microcms';
import { blogFiles } from './site';
import { discoveryFiles } from '../discovery-site';

type Env = Record<string, string | undefined>;

/** Pause between two uploads, in ms. The Management API takes 10 requests per 10 seconds. */
const UPLOAD_INTERVAL = 1_100;

/**
 * Gives every post that has no eyecatch a generated one: draws it, uploads it to the media
 * library and sets it on the post. The post in `posts` gets it too, so the pages this build
 * writes show it. A post that has an eyecatch is left alone, and so is one
 * that is given an eyecatch by hand while this runs: the list read at the start is not what
 * decides, each post is looked at again right before anything is written for it.
 *
 * This is the one place where the build writes to microCMS, and it takes a key of its own.
 * Without MICROCMS_WRITE_API_KEY nothing is drawn or sent, and the build goes on.
 * A post is finished before the next one starts, so a build that fails halfway
 * picks up where it stopped the next time.
 */
async function registerEyecatches(posts: Post[], env: Env): Promise<void> {
    const bare = withoutEyecatch(posts);
    if (bare.length === 0) return;
    if (!env.MICROCMS_WRITE_API_KEY) {
        console.log(`Posts without an eyecatch: ${bare.length}. MICROCMS_WRITE_API_KEY is not set, so none is generated.`);
        return;
    }

    for (const [index, post] of bare.entries()) {
        if (index > 0) await Bun.sleep(UPLOAD_INTERVAL);
        // By its turn a post may have been given an eyecatch, or taken down. Seen before the upload,
        // that leaves no picture behind.
        const current = await currentEyecatch(env, post.id);
        if (current !== null) {
            console.log(`Left ${post.id} alone: ${current === undefined ? 'it is no longer published' : 'it has an eyecatch by now'}.`);
            continue;
        }
        const name = `eyecatch-${post.id}.png`;
        const url = await uploadImage(env, name, eyecatchPng(post.id));
        let set: boolean;
        try {
            // setEyecatch looks once more, right before the PATCH
            set = await setEyecatch(env, post.id, url);
        } catch (error) {
            if (!(error instanceof BlogSourceError)) throw error;
            throw new BlogSourceError(`${error.message} The picture was uploaded and stays in the media library as ${name}.`);
        }
        if (set) post.eyecatch = { url, width: EYECATCH_WIDTH, height: EYECATCH_HEIGHT };
        console.log(
            set
                ? `Generated an eyecatch for ${post.id}`
                : `Left ${post.id} alone: it was given an eyecatch, or taken down, before the picture could be set. The picture stays in the media library as ${name}.`,
        );
    }
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
    const posts = await fetchPosts(env);
    await registerEyecatches(posts, env);
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
