import { classifyReferrer, isHtmlPageRequest, validateBeaconBody } from './analytics';

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

async function recordBeacon(request: Request, env: Env): Promise<void> {
    try {
        const origin = request.headers.get('Origin');
        const site = request.headers.get('Sec-Fetch-Site');
        if (origin ? origin !== new URL(request.url).origin : site !== 'same-origin') return;
        if (site && site !== 'same-origin') return;
        if (Number(request.headers.get('Content-Length')) > 2048) return;
        const reader = request.body?.getReader();
        if (!reader) return;
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2048) { await reader.cancel(); return; }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const body = validateBeaconBody(JSON.parse(new TextDecoder().decode(bytes)));
        if (body) record(env, { blobs: [body.event, body.page], indexes: [body.event], doubles: [1] });
    } catch { }
}

export default {
    async fetch(request: Request, env: Env, ctx: { waitUntil: (promise: Promise<unknown>) => void }): Promise<Response> {
        const url = new URL(request.url);
        if (url.hostname !== CANONICAL_HOST) {
            url.hostname = CANONICAL_HOST;
            return Response.redirect(url.toString(), 301);
        }
        if (url.pathname === '/api/event' && request.method === 'POST') {
            await recordBeacon(request, env);
            return new Response(null, { status: 204 });
        }
        const response = await env.ASSETS.fetch(request);
        if (isHtmlPageRequest(request, response)) {
            ctx.waitUntil(Promise.resolve().then(() => record(env, {
                blobs: ['pageview', url.pathname, classifyReferrer(request.headers.get('Referer'), url.searchParams.get('utm_source'), url.hostname)],
                indexes: ['pageview'], doubles: [1],
            })));
        }
        return response;
    },
};
