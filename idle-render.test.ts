import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { MODELS } from './models';

test('reduced motion skips idle renders but redraws a dragged model and invalidations', async () => {
    const server = Bun.spawn(['bun', './index.ts'], {
        cwd: process.env.IDLE_RENDER_CWD ?? import.meta.dir,
        env: { ...process.env, PORT: '3197' },
        stdout: 'ignore', stderr: 'ignore',
    });
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
        const page = await browser.newPage({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
        await page.route('**/*.js', async route => {
            const response = await route.fetch();
            const source = await response.text();
            await route.fulfill({ response, body: source
                .replace('function animate(t, delta) {', 'function animate(t, delta) { window.animationFrames = (window.animationFrames || 0) + 1;')
                .replace('renderer.render(scene, camera);',
                    'window.renderCalls = (window.renderCalls || 0) + 1; renderer.render(scene, camera);') });
        });
        const count = () => page.evaluate(() => (window as unknown as { renderCalls: number }).renderCalls ?? 0);
        const deadline = Date.now() + 5000;
        while (true) {
            let ready = false;
            try {
                const response = await fetch('http://localhost:3197', { signal: AbortSignal.timeout(500) });
                ready = response.ok;
                await response.body?.cancel();
            } catch {}
            if (ready) break;
            if (Date.now() >= deadline) throw new Error('Server did not become ready within 5 seconds');
            await Bun.sleep(50);
        }
        await page.goto('http://localhost:3197', { waitUntil: 'networkidle' });
        await page.locator('#loader.hidden').waitFor({ state: 'attached' });
        await page.waitForFunction(() =>
            (window as unknown as { animationFrames: number }).animationFrames >= 200, null, { timeout: 90_000 });
        const start = await count();
        await page.waitForTimeout(2000);
        const idle = await count() - start;
        console.log(`reduced motion idle renders (2s): ${idle}`);
        const before = await page.locator('#three-canvas').screenshot();
        const dragStart = await count();
        await page.mouse.move(350, 300);
        await page.mouse.down();
        await page.mouse.move(550, 340, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(500);
        const drag = await count() - dragStart;
        const after = await page.locator('#three-canvas').screenshot();
        console.log(`drag renders: ${drag}; canvas image changed: ${!before.equals(after)}`);
        expect(drag).toBeGreaterThan(0);
        expect(before.equals(after)).toBe(false);
        expect(idle).toBeLessThanOrEqual(1);
        for (const invalidate of [
            () => page.locator('#theme-toggle').click(),
            () => page.setViewportSize({ width: 810, height: 610 }),
        ]) {
            const previous = await count();
            await invalidate();
            await page.waitForFunction(previous =>
                (window as unknown as { renderCalls: number }).renderCalls > previous, previous);
        }
        await page.locator('#model-next').click();
        await page.locator('#model-label').filter({ hasText: MODELS[1]!.label }).waitFor();
        const loaded = await count();
        await page.waitForFunction(loaded =>
            (window as unknown as { renderCalls: number }).renderCalls > loaded, loaded);
        console.log(`renders after new model loaded: ${await count() - loaded}`);
        const reduced = await count();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.waitForFunction(reduced =>
            (window as unknown as { renderCalls: number }).renderCalls > reduced, reduced);
    } finally {
        await browser.close();
        server.kill();
    }
}, 120_000);
