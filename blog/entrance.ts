// ─────────────────────────────────────────────────────────────────────────────
// The way into the blog from the top page: the WRITING panel of index.html.
// The posts it recommends are the ones tagged おすすめ in microCMS. The build
// writes them into the bundled page (dist/index.html), so which posts show is
// decided in microCMS: tagging a post updates it, and its webhook starts a deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { join } from 'node:path';
import { esc } from './html';
import type { Post } from './microcms';

/** Name of the tag that puts a post on the top page */
export const PICK_TAG = 'おすすめ';

/** Element of index.html the picks go into. Left empty, it is hidden and the panel opens on the link to /blog. */
const SLOT = '#writing-picks';

/** The posts to recommend, newest first. None when no post has the tag, or the tag does not exist. */
export function picks(posts: Post[]): Post[] {
    return posts.filter((post) => post.tags.includes(PICK_TAG));
}

/** The picks as links to their articles, ready for the slot */
export function renderPicks(picked: Post[]): string {
    return picked
        .map((post) => `<a class="writing-entry" href="/blog/${esc(post.id)}"><span class="writing-title">${esc(post.title)}</span></a>`)
        .join('');
}

/**
 * Writes the picks into the top page that `bun build` put in `dist`, in place of whatever the
 * slot held. A page without the slot is an error, so a panel taken out or renamed is noticed
 * instead of the picks quietly going missing.
 *
 * The height estimates of style.css (--fit-*) leave the panel out, picks and all, so it never makes
 * the text smaller: each pick lengthens the right sidebar, which scrolls.
 */
export async function writeEntrance(dist: string, posts: Post[]): Promise<void> {
    const path = join(dist, 'index.html');
    const page = Bun.file(path);
    if (!(await page.exists())) {
        throw new Error(`${path} is missing: the pages are bundled before the blog is built, as \`bun run build\` does.`);
    }
    let found = false;
    const html = new HTMLRewriter()
        .on(SLOT, {
            element(slot) {
                found = true;
                slot.setInnerContent(renderPicks(picks(posts)), { html: true });
            },
        })
        .transform(await page.text());
    if (!found) throw new Error(`The top page has no ${SLOT} for the posts tagged ${PICK_TAG}.`);
    await Bun.write(path, html);
}
