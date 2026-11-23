import { expect, test } from 'bun:test';
import { classifyReferrer, isHtmlPageRequest, pageviewPath, validateBeaconBody } from './analytics';
import worker from './worker';

test('referrer categories and UTM precedence', () => {
    for (const host of ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'www.perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']) {
        expect(classifyReferrer(`https://${host}/private?q=secret`, null, 'esp-9.dev')).toBe('ai');
    }
    for (const source of ['chatgpt.com', 'openai', 'perplexity', 'claude', 'gemini', 'copilot']) {
        expect(classifyReferrer('https://google.com/', source, 'esp-9.dev')).toBe('ai');
    }
    for (const host of ['google.com', 'www.google.co.jp', 'bing.com']) {
        expect(classifyReferrer(`https://${host}`, null, 'esp-9.dev')).toBe('search');
    }
    for (const host of ['x.com', 't.co', 'twitter.com']) {
        expect(classifyReferrer(`https://${host}`, null, 'esp-9.dev')).toBe('social');
    }
    expect(classifyReferrer('https://chatgpt.com', 'bing', 'esp-9.dev')).toBe('search');
    expect(classifyReferrer('https://chatgpt.com', 'unknown', 'esp-9.dev')).toBe('other');
    expect(classifyReferrer('https://esp-9.dev/hire', null, 'esp-9.dev')).toBe('direct');
    for (const ref of [null, '']) expect(classifyReferrer(ref, null, 'esp-9.dev')).toBe('direct');
    for (const ref of ['garbage', 'https://chatgpt.com.evil.test', 'https://unknown.test']) {
        expect(classifyReferrer(ref, null, 'esp-9.dev')).toBe('other');
    }
});

test('HTML request detection excludes API and non-GET', () => {
    const html = new Response('', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    for (const path of ['/', '/hire', '/hire.html', '/foo.php']) expect(isHtmlPageRequest(new Request(`https://esp-9.dev${path}`), html)).toBe(true);
    for (const path of ['/api/event', '/api']) expect(isHtmlPageRequest(new Request(`https://esp-9.dev${path}`), html)).toBe(false);
    expect(isHtmlPageRequest(new Request('https://esp-9.dev/', { method: 'POST' }), html)).toBe(false);
    expect(isHtmlPageRequest(new Request('https://esp-9.dev/', { headers: { Accept: 'text/html' } }), new Response(''))).toBe(false);
});

test('beacon validator accepts only allowlisted events and paths', () => {
    expect(validateBeaconBody({ event: 'contact_click_x', page: '/hire' })).toEqual({ event: 'contact_click_x', page: '/hire' });
    for (const [page, normalized] of [['/', '/'], ['/index.html', '/'], ['/hire.html', '/hire']] as const) {
        expect(validateBeaconBody({ event: 'contact_click_x', page })).toEqual({ event: 'contact_click_x', page: normalized });
    }
    for (const body of [null, {}, { event: 'evil', page: '/' }, ...['https://evil.test', '//evil.test', '/?secret=x', '/#secret', '/\\evil'].map(page => ({ event: 'contact_click_x', page }))]) {
        expect(validateBeaconBody(body)).toBeNull();
    }
});

test('pageview paths normalize published route shapes and redact other paths', () => {
    expect(pageviewPath('/')).toBe('/');
    expect(pageviewPath('/index.html')).toBe('/');
    for (const path of ['/hire', '/things', '/work', '/blog', '/work/staffing-db', '/work/vc-crm', '/blog/aZ_09-id']) {
        for (const alias of [path, `${path}/`, `${path}.html`]) expect(pageviewPath(alias)).toBe(path);
    }
    for (const path of ['', '/users/alice@example.com', '/work/alice@example', '/work/UPPER', '/work/with_underscore',
        '/blog/alice@example', '/blog/a.b', '/blog/a%20b', '/blog/id/extra', '/hire//', '/unknown']) {
        expect(pageviewPath(path)).toBe('unknown');
    }
});

test('blog archive pageview paths normalize aliases and redact noncanonical paths', () => {
    for (const path of ['/blog/page/2', '/blog/page/9', '/blog/page/10', '/blog/page/21']) {
        for (const alias of [path, `${path}/`, `${path}.html`]) expect(pageviewPath(alias)).toBe(path);
    }
    for (const suffix of ['0', '1', '01', '02', '-2', 'abc', '2.5', '2junk', '2/extra']) {
        expect(pageviewPath(`/blog/page/${suffix}`)).toBe('unknown');
    }
});

async function fetchPage(path: string, events?: { writeDataPoint: (point: any) => void }, init?: RequestInit, contentType = 'text/html', status = 200) {
    const pending: Promise<unknown>[] = [];
    const response = await worker.fetch(new Request(`https://esp-9.dev${path}`, init), {
        ASSETS: { fetch: async () => new Response('page', { status, headers: { 'Content-Type': contentType } }) },
        EVENTS: events,
    }, { waitUntil: promise => { pending.push(promise); } });
    await Promise.all(pending);
    return response;
}

test('page is returned with missing or throwing analytics binding', async () => {
    expect(await (await fetchPage('/')).text()).toBe('page');
    expect(await (await fetchPage('/', { writeDataPoint() { throw new Error('unavailable'); } })).text()).toBe('page');
});

test('pageview records only path/category and non-HTML assets are not recorded', async () => {
    const points: unknown[] = [];
    const events = { writeDataPoint: (point: unknown) => { points.push(point); } };
    await fetchPage('/hire?private=secret', events, { headers: { Referer: 'https://chatgpt.com/private' } });
    expect(points).toEqual([{ blobs: ['pageview', '/hire', 'ai'], indexes: ['pageview'], doubles: [1] }]);
    await fetchPage('/model.glb', events, undefined, 'application/octet-stream');
    await fetchPage('/missing', events, undefined, 'text/plain');
    await fetchPage('/api', events);
    await fetchPage('/api/example', events);
    await fetchPage('/', events, { method: 'POST' });
    expect(points).toHaveLength(1);
    await fetchPage('/foo.php', events);
    expect(points[1]).toEqual({ blobs: ['pageview', 'unknown', 'direct'], indexes: ['pageview'], doubles: [1] });
});

test('blog archive pageview writes the canonical path only for successful HTML', async () => {
    const points: unknown[] = [];
    const events = { writeDataPoint: (point: unknown) => { points.push(point); } };
    const init = { headers: { Referer: 'https://chatgpt.com/' } };
    expect((await fetchPage('/blog/page/2?private=secret', events, init)).status).toBe(200);
    expect((await fetchPage('/blog/page/99', events, init, 'text/html', 404)).status).toBe(404);
    expect((await fetchPage('/blog/page/02', events, init)).status).toBe(200);
    expect(points).toEqual([
        { blobs: ['pageview', '/blog/page/2', 'ai'], indexes: ['pageview'], doubles: [1] },
        { blobs: ['pageview', 'not_found', 'ai'], indexes: ['pageview'], doubles: [1] },
        { blobs: ['pageview', 'unknown', 'ai'], indexes: ['pageview'], doubles: [1] },
    ]);
});

test('HTML 404s are redacted, other errors excluded and unexpected successful paths redacted', async () => {
    const points: unknown[] = [];
    const events = { writeDataPoint: (point: unknown) => { points.push(point); } };
    for (const status of [500, 301]) await fetchPage('/hire', events, undefined, 'text/html', status);
    expect(points).toEqual([]);
    await fetchPage('/users/alice@example.com', events, { headers: { Referer: 'https://chatgpt.com/' } });
    await fetchPage('/users/alice@example.com?private=secret', events, { headers: { Referer: 'https://chatgpt.com/' } }, 'text/html', 404);
    expect(points).toEqual([
        { blobs: ['pageview', 'unknown', 'ai'], indexes: ['pageview'], doubles: [1] },
        { blobs: ['pageview', 'not_found', 'ai'], indexes: ['pageview'], doubles: [1] },
    ]);
});

test('validated beacon writes are scheduled rather than executed synchronously', async () => {
    const pending: Promise<unknown>[] = [];
    const points: unknown[] = [];
    const response = await worker.fetch(new Request('https://esp-9.dev/api/event', {
        method: 'POST', headers: { Origin: 'https://esp-9.dev' },
        body: JSON.stringify({ event: 'contact_click_x', page: '/hire' }),
    }), {
        ASSETS: { fetch: async () => { throw new Error('must not fetch'); } },
        EVENTS: { writeDataPoint: point => { points.push(point); } },
    }, { waitUntil(promise) {
        expect(promise).toBeInstanceOf(Promise);
        expect(points).toEqual([]);
        pending.push(promise);
    } });
    expect(response.status).toBe(204);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(points).toEqual([{ blobs: ['contact_click_x', '/hire'], indexes: ['contact_click_x'], doubles: [1] }]);
});

test('beacon returns 204 with missing or throwing analytics binding', async () => {
    for (const events of [undefined, { writeDataPoint() { throw new Error('unavailable'); } }]) {
        const response = await fetchPage('/api/event', events, {
            method: 'POST', headers: { Origin: 'https://esp-9.dev' },
            body: JSON.stringify({ event: 'contact_click_x', page: '/hire' }),
        });
        expect(response.status).toBe(204);
    }
});

test('beacons drop invalid, oversized, cross-origin and disallowed data', async () => {
    const points: unknown[] = [];
    const events = { writeDataPoint: (point: unknown) => { points.push(point); } };
    for (const [body, origin] of [
        [JSON.stringify({ event: 'contact_click_x', page: '/hire' }), 'https://esp-9.dev'],
        [JSON.stringify({ event: 'evil', page: '/' }), 'https://esp-9.dev'],
        ['{', 'https://esp-9.dev'], ['x'.repeat(2049), 'https://esp-9.dev'],
        [JSON.stringify({ event: 'contact_click_x', page: '/' }), 'https://evil.test'],
        [JSON.stringify({ event: 'contact_click_x', page: '/' }), 'http://esp-9.dev'],
        [JSON.stringify({ event: 'contact_click_x', page: '/' }), 'https://esp-9.dev:8443'],
        [JSON.stringify({ event: 'contact_click_x', page: '/users/alice@example.com' }), 'https://esp-9.dev'],
    ] as const) {
        expect((await fetchPage('/api/event', events, { method: 'POST', body, headers: { Origin: origin } })).status).toBe(204);
    }
    expect(points).toEqual([{ blobs: ['contact_click_x', '/hire'], indexes: ['contact_click_x'], doubles: [1] }]);
});

test('beacon requires same-origin fetch metadata when Origin is absent', async () => {
    const points: unknown[] = [];
    const events = { writeDataPoint: (point: unknown) => { points.push(point); } };
    for (const site of [null, 'cross-site', 'same-origin']) {
        await fetchPage('/api/event', events, {
            method: 'POST', body: JSON.stringify({ event: 'contact_click_x', page: '/hire' }),
            headers: site ? { 'Sec-Fetch-Site': site } : {},
        });
    }
    expect(points).toEqual([{ blobs: ['contact_click_x', '/hire'], indexes: ['contact_click_x'], doubles: [1] }]);
});

test('www redirect preserves status, path and query before assets or analytics', async () => {
    const response = await worker.fetch(new Request('https://www.esp-9.dev/hire?x=1'), {
        ASSETS: { fetch: async () => { throw new Error('must not fetch'); } },
        EVENTS: { writeDataPoint() { throw new Error('must not record'); } },
    }, { waitUntil() { throw new Error('must not schedule'); } });
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('https://esp-9.dev/hire?x=1');
});
