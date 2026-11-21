import { expect, test } from 'bun:test';

test('the dev server serves blog.css without microCMS credentials', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: '3198' };
    delete env.MICROCMS_SERVICE_DOMAIN;
    delete env.MICROCMS_API_KEY;
    const server = Bun.spawn(['bun', './index.ts'], {
        cwd: new URL('..', import.meta.url).pathname,
        env,
        stdout: 'ignore',
        stderr: 'ignore',
    });
    try {
        let response: Response | undefined;
        for (let attempt = 0; attempt < 100; attempt++) {
            response = await fetch('http://localhost:3198/blog.css').catch(() => undefined);
            if (response) break;
            await Bun.sleep(50);
        }
        expect(response).toBeDefined();
        expect(response!.status).toBe(200);
        expect(response!.headers.get('Content-Type')).toContain('text/css');
        expect((await response!.text()).trim().length).toBeGreaterThan(0);
    } finally {
        server.kill();
        await server.exited;
    }
});
