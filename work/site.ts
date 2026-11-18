import { join } from 'node:path';
import { CASES } from './cases';
import { renderCase, renderIndex } from './pages';

/** work.css imports style.css, so the pages load one stylesheet. */
async function bundleStyles(): Promise<string> {
    const { outputs } = await Bun.build({ entrypoints: [join(import.meta.dir, '../work.css')] });
    return outputs[0]!.text();
}

/**
 * Every file /work adds to the site, by its path under dist/.
 * The build writes them all; the dev server renders the one that is asked for.
 */
export function workFiles(): Map<string, () => string | Promise<string>> {
    return new Map<string, () => string | Promise<string>>([
        ['work.html', renderIndex],
        ['work.css', bundleStyles],
        ...CASES.map((item, index) => [`work/${item.slug}.html`, () => renderCase(index)] as const),
    ]);
}

const CONTENT_TYPES: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
};

/**
 * Serves /work in development, rendered on request.
 * Paths resolve the way Cloudflare's static assets do (/work → work.html).
 */
export async function serveWork(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/|\/$/g, '');
    const file = /\.\w+$/.test(path) ? path : `${path}.html`;
    const render = workFiles().get(file);
    if (!render) return new Response('Not Found', { status: 404 });
    const type = CONTENT_TYPES[file.slice(file.lastIndexOf('.') + 1)];
    return new Response(await render(), { headers: type ? { 'Content-Type': type } : undefined });
}
