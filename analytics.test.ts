import { expect, test } from 'bun:test';
import { classifyReferrer, isHtmlPageRequest, validateBeaconBody } from './analytics';
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
    for (const path of ['/', '/hire', '/hire.html']) expect(isHtmlPageRequest(new Request(`https://esp-9.dev${path}`))).toBe(true);
    for (const path of ['/api/event', '/api', '/model.glb', '/image.png']) expect(isHtmlPageRequest(new Request(`https://esp-9.dev${path}`))).toBe(false);
    expect(isHtmlPageRequest(new Request('https://esp-9.dev/', { method: 'POST' }))).toBe(false);
    expect(isHtmlPageRequest(new Request('https://esp-9.dev/page.ext', { headers: { Accept: 'text/html' } }))).toBe(true);
});

test('beacon validator accepts only allowlisted events and paths', () => {
    expect(validateBeaconBody({ event: 'contact_click_x', page: '/hire' })).toEqual({ event: 'contact_click_x', page: '/hire' });
    for (const body of [null, {}, { event: 'evil', page: '/' }, ...['https://evil.test', '//evil.test', '/?secret=x', '/#secret', '/\\evil'].map(page => ({ event: 'contact_click_x', page }))]) {
        expect(validateBeaconBody(body)).toBeNull();
    }
});

async function fetchPage(path: string, events?: { writeDataPoint: (point: any) => void }, init?: RequestInit, contentType = 'text/html') {
    const pending: Promise<unknown>[] = [];
    const response = await worker.fetch(new Request(`https://esp-9.dev${path}`, init), {
        ASSETS: { fetch: async () => new Response('page', { headers: { 'Content-Type': contentType } }) },
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
    expect(points).toHaveLength(1);
});

test('beacons drop invalid, oversized, cross-origin and disallowed data', async () => {
    const points: unknown[] = [];
    const events = { writeDataPoint: (point: unknown) => { points.push(point); } };
    for (const [body, origin] of [
        [JSON.stringify({ event: 'contact_click_x', page: '/hire' }), 'https://esp-9.dev'],
        [JSON.stringify({ event: 'evil', page: '/' }), 'https://esp-9.dev'],
        ['{', 'https://esp-9.dev'], ['x'.repeat(2049), 'https://esp-9.dev'],
        [JSON.stringify({ event: 'contact_click_x', page: '/' }), 'https://evil.test'],
    ]) {
        expect((await fetchPage('/api/event', events, { method: 'POST', body, headers: { Origin: origin! } })).status).toBe(204);
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
