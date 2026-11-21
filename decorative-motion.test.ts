import { expect, test } from 'bun:test';

test('the dither and panel dots animate unless reduced motion is requested', async () => {
    const css = await Bun.file(new URL('./style.css', import.meta.url)).text();
    expect(css).toMatch(/#dither\s*\{[^}]*animation:\s*dither-drift 10s linear infinite;/);
    expect(css).toMatch(/\.dot\s*\{[^}]*animation:\s*pulse 2\.5s ease-in-out infinite;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*#dither,\s*\.dot\s*\{\s*animation:\s*none;/);
});
