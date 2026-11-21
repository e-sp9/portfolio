// Writes the 404 page into dist/ as static files. A step of `bun run build`.

import { join } from 'node:path';
import { notFoundFiles } from './page';

/** Generates dist/404.html and its stylesheet into `dist`. */
export async function buildNotFound(dist: string): Promise<void> {
    const files = notFoundFiles();
    for (const [path, render] of files) await Bun.write(join(dist, path), await render());
    console.log(`Generated 404: ${files.size} files`);
}

if (import.meta.main) {
    await buildNotFound(join(import.meta.dir, '../dist'));
}
