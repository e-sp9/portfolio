import { classifyReferrer, isHtmlPageRequest, pageviewPath, validateBeaconBody } from './analytics';

interface DataPoint {
    blobs: string[];
    indexes: string[];
    doubles: number[];
}

interface Env {
    ASSETS: { fetch: (req: Request) => Promise<Response> };
    EVENTS?: { writeDataPoint: (point: DataPoint) => void };
}

const CANONICAL_HOST = 'esp-9.dev';

function record(env: Env, point: DataPoint): void {
    try { env.EVENTS?.writeDataPoint(point); } catch { }
}

async function readBeacon(request: Request): Promise<ReturnType<typeof validateBeaconBody>> {
    try {
        const origin = request.headers.get('Origin');
        const site = request.headers.get('Sec-Fetch-Site');
        if (origin ? origin !== new URL(request.url).origin : site !== 'same-origin') return null;
        if (site && site !== 'same-origin') return null;
        if (Number(request.headers.get('Content-Length')) > 2048) return null;
        const reader = request.body?.getReader();
        if (!reader) return null;
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2048) { await reader.cancel(); return null; }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return validateBeaconBody(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { return null; }
}

export default {
    async fetch(request: Request, env: Env, ctx: { waitUntil: (promise: Promise<unknown>) => void }): Promise<Response> {
        const url = new URL(request.url);
        if (url.hostname !== CANONICAL_HOST) {
            url.hostname = CANONICAL_HOST;
            return Response.redirect(url.toString(), 301);
        }
        if (url.pathname === '/api/event' && request.method === 'POST') {
            const body = await readBeacon(request);
            if (body) ctx.waitUntil(Promise.resolve().then(() => record(env, {
                blobs: [body.event, body.page], indexes: [body.event], doubles: [1],
            })));
            return new Response(null, { status: 204 });
        }
        const response = await env.ASSETS.fetch(request);
        if (isHtmlPageRequest(request, response)) {
            ctx.waitUntil(Promise.resolve().then(() => record(env, {
                blobs: ['pageview', response.status === 404 ? 'not_found' : pageviewPath(url.pathname), classifyReferrer(request.headers.get('Referer'), url.searchParams.get('utm_source'), url.hostname)],
                indexes: ['pageview'], doubles: [1],
            })));
        }
        return response;
    },
};
