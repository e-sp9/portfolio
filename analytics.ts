export type ReferrerCategory = 'ai' | 'search' | 'social' | 'other' | 'direct';

export function classifyReferrer(referer: string | null, utmSource: string | null, selfHost: string): ReferrerCategory {
    let host: string;
    if (utmSource?.trim()) host = utmSource.trim().toLowerCase().replace(/^www\./, '');
    else {
        if (!referer) return 'direct';
        try {
            const url = new URL(referer);
            if (!['http:', 'https:'].includes(url.protocol)) return 'other';
            if (url.hostname === selfHost) return 'direct';
            host = url.hostname.replace(/^www\./, '');
        } catch { return 'other'; }
    }
    if (['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com',
        'chatgpt', 'openai', 'perplexity', 'claude', 'gemini', 'copilot'].includes(host)) return 'ai';
    if (/^google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(host) ||
        ['google', 'bing', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'search.yahoo.com'].includes(host)) return 'search';
    if (['x.com', 't.co', 'twitter.com', 'twitter'].includes(host)) return 'social';
    return 'other';
}

export function isHtmlPageRequest(request: Request, response: Response): boolean {
    const path = new URL(request.url).pathname;
    return request.method === 'GET' && path !== '/api' && !path.startsWith('/api/') &&
        response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() === 'text/html';
}

export const EVENT_NAMES = ['contact_click_x'] as const;
const CONTACT_PAGES = new Map([['/', '/'], ['/index.html', '/'], ['/hire', '/hire'], ['/hire.html', '/hire']]);

export function validateBeaconBody(body: unknown): { event: typeof EVENT_NAMES[number]; page: string } | null {
    if (!body || typeof body !== 'object') return null;
    const { event, page } = body as Record<string, unknown>;
    if (event !== EVENT_NAMES[0] || typeof page !== 'string') return null;
    const normalizedPage = CONTACT_PAGES.get(page);
    return normalizedPage ? { event, page: normalizedPage } : null;
}
