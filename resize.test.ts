import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';

test('height-only resizes preserve the dragged orbit on mobile and desktop', async () => {
    const server = Bun.spawn(['bun', './index.ts'], {
        cwd: import.meta.dir,
        env: { ...process.env, PORT: '3198' },
        stdout: 'ignore',
        stderr: 'ignore',
    });
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
        for (const [width, height, resizedHeight] of [[390, 844, 780], [1440, 900, 800]] as const) {
            const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
            await page.route('**/*.js', async route => {
                const response = await route.fetch();
                const source = await response.text();
                await route.fulfill({ response, body: source.replace('function handleResize() {',
                    'function handleResize() { window.readAzimuth = (settle = false) => { if (settle) for (let i = 0; i < 400; i++) controls.update(); return controls.getAzimuthalAngle(); };') });
            });
            await page.goto('http://localhost:3198', { waitUntil: 'networkidle' });
            await page.locator('#loader.hidden').waitFor({ state: 'attached' });
            const angle = (settle = false) => page.evaluate(settle =>
                (window as unknown as { readAzimuth(settle: boolean): number }).readAzimuth(settle), settle);
            const initial = await angle();
            const box = (await page.locator('#three-canvas').boundingBox())!;
            await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 12 });
            await page.mouse.up();
            // Advance drag damping deterministically, independent of software WebGL's frame rate.
            const before = await angle(true);
            expect(Math.abs(before - initial)).toBeGreaterThan(0.2);
            await page.setViewportSize({ width, height: resizedHeight });
            await page.waitForTimeout(500);
            const after = await angle();
            console.log(`${width}px azimuth: ${before} -> ${after}`);
            expect(after).toBeCloseTo(before, 3);
            await page.close();
        }
    } finally {
        await browser.close();
        server.kill();
    }
}, 60_000);
