import { join } from 'node:path';
import { renderFeed } from './feed';
import type { Post } from './microcms';
import { renderIndex, renderPost } from './pages';

/** blog.css imports style.css, so the pages load one stylesheet. */
async function bundleStyles(): Promise<string> {
    const { outputs } = await Bun.build({ entrypoints: [join(import.meta.dir, '../blog.css')] });
    return outputs[0]!.text();
}

/**
 * Every file the blog adds to the site, by its path under dist/.
 * The build writes them all; the dev server renders the one that is asked for.
 */
export function blogFiles(posts: Post[]): Map<string, () => string | Promise<string>> {
    return new Map<string, () => string | Promise<string>>([
        ['blog.html', () => renderIndex(posts)],
        ['blog.css', bundleStyles],
        ['blog/feed.xml', () => renderFeed(posts)],
        ...posts.map((post, index) => [`blog/${post.id}.html`, () => renderPost(posts, index)] as const),
    ]);
}
