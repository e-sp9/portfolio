import { expect, test } from 'bun:test';

test('homepage fonts load without a render-blocking stylesheet and retain a no-script fallback', async () => {
    const html = await Bun.file(new URL('./index.html', import.meta.url)).text();
    expect(html).toContain('href="https://fonts.gstatic.com" crossorigin');
    expect(html).toContain('rel="stylesheet" media="print" onload="this.onload=null;this.media=\'all\'"');
    expect(html).toMatch(/<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*rel="stylesheet">[\s\S]*<\/noscript>/);
});
