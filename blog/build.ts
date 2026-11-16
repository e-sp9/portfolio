// Writes the blog into dist/ as static files. First step of `bun run build`,
// so a build without the microCMS credentials stops before anything else runs.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BlogSourceError, fetchPosts } from './microcms';
import { blogFiles } from './site';

const DIST = join(import.meta.dir, '../dist');

try {
    const posts = await fetchPosts();
    // A post unpublished since the last build must not linger in a reused dist/
    await rm(join(DIST, 'blog'), { recursive: true, force: true });
    const files = blogFiles(posts);
    for (const [path, render] of files) await Bun.write(join(DIST, path), await render());
    console.log(`Generated /blog: ${posts.length} posts, ${files.size} files`);
} catch (error) {
    if (!(error instanceof BlogSourceError)) throw error;
    console.error(`error: ${error.message}`);
    process.exit(1);
}
