import { expect, test } from 'bun:test';

test('the dither, panel dots and loading indicators animate unless reduced motion is requested', async () => {
    const css = await Bun.file(new URL('./style.css', import.meta.url)).text();
    expect(css).toMatch(/#dither\s*\{[^}]*animation:\s*dither-drift 10s linear infinite;/);
    expect(css).toMatch(/\.dot\s*\{[^}]*animation:\s*pulse 2\.5s ease-in-out infinite;/);
    expect(css).toMatch(/\.loader-text\s*\{[^}]*animation:\s*blink 1\.2s step-end infinite;/);
    expect(css).toMatch(/#model-label\.loading\s*\{[^}]*animation:\s*blink 1\.2s step-end infinite;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*#dither,\s*\.dot,\s*\.loader-text,\s*#model-label\.loading\s*\{\s*animation:\s*none;/);
});
