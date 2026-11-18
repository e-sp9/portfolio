// Writes /work into dist/ as static files. A step of `bun run build`.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { workFiles } from './site';

/** Generates /work into `dist`. */
export async function buildWork(dist: string): Promise<void> {
    // A case renamed or taken out since the last build must not linger in a reused dist/
    await rm(join(dist, 'work'), { recursive: true, force: true });
    const files = workFiles();
    for (const [path, render] of files) await Bun.write(join(dist, path), await render());
    console.log(`Generated /work: ${files.size} files`);
}

if (import.meta.main) {
    await buildWork(join(import.meta.dir, '../dist'));
}
