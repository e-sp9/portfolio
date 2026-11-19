import { join } from 'node:path';
import type { Post } from './blog/microcms';
import { CASES } from './work/cases';
import { renderLlms, renderRobots, renderSitemap } from './discovery';

export async function discoveryFiles(posts: Post[]): Promise<Map<string, string>> {
    const [index, hire] = await Promise.all(['index.html', 'hire.html'].map(path => Bun.file(join(import.meta.dir, path)).text()));
    return new Map([
        ['sitemap.xml', renderSitemap(posts, CASES)],
        ['robots.txt', renderRobots()],
        ['llms.txt', renderLlms(index!, hire!, posts, CASES)],
    ]);
}
