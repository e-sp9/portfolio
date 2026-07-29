interface Env {
    ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const CANONICAL_HOST = 'esp-9.dev';

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.hostname !== CANONICAL_HOST) {
            url.hostname = CANONICAL_HOST;
            return Response.redirect(url.toString(), 301);
        }
        return env.ASSETS.fetch(request);
    },
};
