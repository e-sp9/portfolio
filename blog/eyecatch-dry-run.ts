// Dry run of the eyecatches: writes the pictures the build would make into out/eyecatch/
// and changes nothing in microCMS. It only reads the posts from it, and with post IDs on
// the command line it does not even do that, so it works without any credentials.
//
//   bun run eyecatch:dry-run              every post that has no eyecatch
//   bun run eyecatch:dry-run <id> <id>    these posts, whether they have one or not
//
// A picture depends on the post ID alone: what lands here is what the build would upload.

import { join } from 'node:path';
import { eyecatchPng } from './eyecatch';
import { BlogSourceError, fetchPosts, missingCredentials, POST_ID, withoutEyecatch } from './microcms';

/**
 * Writes <id>.png into `dir` for the post IDs given or, when none is given, for every
 * post without an eyecatch. Returns the paths written.
 */
export async function dryRun(ids: string[], env: Record<string, string | undefined>, dir: string): Promise<string[]> {
    // -h and --help are spelled like content IDs, but nobody means a post by them
    const odd = ids.find((id) => !POST_ID.test(id) || id === '-h' || id === '--help');
    if (odd !== undefined) {
        throw new BlogSourceError(`Not a post ID: ${JSON.stringify(odd)}. Usage: bun run eyecatch:dry-run [post ID]...`);
    }
    const missing = missingCredentials(env);
    if (ids.length === 0 && missing.length > 0) {
        throw new BlogSourceError(
            `Missing ${missing.join(' and ')}, so the posts cannot be read. Name them instead: bun run eyecatch:dry-run <post ID>...`,
        );
    }

    console.log('Dry run: nothing is written to microCMS.');
    let targets: { id: string; title?: string }[] = ids.map((id) => ({ id }));
    if (ids.length === 0) {
        const posts = await fetchPosts(env);
        targets = withoutEyecatch(posts);
        console.log(`Posts without an eyecatch: ${targets.length} of ${posts.length}.`);
    }

    const paths: string[] = [];
    for (const { id, title } of targets) {
        const path = join(dir, `${id}.png`);
        await Bun.write(path, eyecatchPng(id));
        console.log(title === undefined ? path : `${path}  ${title}`);
        paths.push(path);
    }
    return paths;
}

if (import.meta.main) {
    try {
        await dryRun(process.argv.slice(2), process.env, join(import.meta.dir, '../out/eyecatch'));
    } catch (error) {
        if (!(error instanceof BlogSourceError)) throw error;
        console.error(`error: ${error.message}`);
        process.exit(1);
    }
}
