import { expect, test } from 'bun:test';
import { hideInitialLoader } from './loader';

test('initial load completes and starts the reveal synchronously', () => {
    const fill = { style: { width: '50%' } } as HTMLElement;
    const classes = new Set<string>();
    const loader = { classList: { add: (name: string) => classes.add(name) } } as unknown as HTMLElement;
    hideInitialLoader(fill, loader);
    expect(fill.style.width).toBe('100%');
    expect(classes.has('hidden')).toBe(true);
});

test('missing loader elements are harmless', () => {
    expect(() => hideInitialLoader(null, null)).not.toThrow();
    const fill = { style: { width: '0%' } } as HTMLElement;
    hideInitialLoader(fill, null);
    expect(fill.style.width).toBe('100%');
});

test('the loader has a short fade and no transition for reduced motion', async () => {
    const css = await Bun.file(new URL('./style.css', import.meta.url)).text();
    expect(css).toMatch(/#loader\s*\{[^}]*transition:\s*opacity 0\.2s, visibility 0\.2s;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*#loader\s*\{\s*transition:\s*none;/);
});

test('homepage fonts load without a render-blocking stylesheet and retain a no-script fallback', async () => {
    const html = await Bun.file(new URL('./index.html', import.meta.url)).text();
    expect(html).toContain('href="https://fonts.gstatic.com" crossorigin');
    expect(html).toContain('rel="stylesheet" media="print" onload="this.onload=null;this.media=\'all\'"');
    expect(html).toMatch(/<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*rel="stylesheet">[\s\S]*<\/noscript>/);
});
