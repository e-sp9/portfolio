// Writes the blog into dist/ as static files. First step of `bun run build`,
// so a local build without the microCMS credentials stops before anything else runs.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BlogSourceError, fetchPosts, missingCredentials } from './microcms';
import { blogFiles } from './site';

/**
 * Generates the blog into `dist`.
 *
 * Without the microCMS credentials this is an error that names them: a local build never
 * quietly produces a site without the blog. GitHub Actions is the exception. The keys are
 * kept in the local .env only, so the deploy workflow has none; there the blog is left out
 * with a warning, and the rest of the site builds and deploys as it did before the blog.
 */
export async function buildBlog(env: Record<string, string | undefined>, dist: string): Promise<void> {
    const missing = missingCredentials(env);
    if (env.GITHUB_ACTIONS && missing.length > 0) {
        // The ::warning:: prefix makes the line an annotation on the workflow run
        console.warn(`::warning title=Blog not generated::${missing.join(' and ')} not set, so the site is built without /blog.`);
        return;
    }

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
