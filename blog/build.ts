// Writes the blog into dist/ as static files. First step of `bun run build`,
// so a build without the posts stops before anything else runs.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BlogSourceError, fetchPosts } from './microcms';
import { blogFiles } from './site';

/**
 * Generates the blog into `dist`.
 *
 * Without the microCMS credentials, or when the posts cannot be fetched, this is an error and
 * nothing is written, locally and on GitHub Actions alike. The deploy workflow gets the keys
 * from GitHub Secrets, so a failure there stops the deploy and the live /blog stays as it is.
 */
export async function buildBlog(env: Record<string, string | undefined>, dist: string): Promise<void> {
    const posts = await fetchPosts(env);
    // A post unpublished since the last build must not linger in a reused dist/
    await rm(join(dist, 'blog'), { recursive: true, force: true });
    const files = blogFiles(posts);
    for (const [path, render] of files) await Bun.write(join(dist, path), await render());
    console.log(`Generated /blog: ${posts.length} posts, ${files.size} files`);
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
