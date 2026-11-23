import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { startDevServer } from './dev-server';
import { MODELS } from './models';

test('failed switches preserve the displayed selection and allow switching and wraparound', async () => {
    const server = await startDevServer(['bun', 'run', 'dev'], 3199);
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
        const page = await browser.newPage();
        await page.goto(server.url, { waitUntil: 'networkidle' });
        const label = page.locator('#model-label');
        const count = page.locator('#model-count');
        const expectSelection = async (index: number) => {
            await label.filter({ hasText: MODELS[index]!.label }).waitFor();
            expect(await label.textContent()).toBe(MODELS[index]!.label);
            expect(await count.textContent()).toBe(`${index + 1}/${MODELS.length}`);
        };
        await expectSelection(0);
        await page.route('**' + MODELS[1]!.path, route => route.abort(), { times: 1 });
        const failure = page.waitForEvent('requestfailed', request => request.url().endsWith(MODELS[1]!.path));
        await page.locator('#model-next').click();
        await failure;
        await page.waitForFunction(() => !document.querySelector('#model-label')?.classList.contains('loading'));
        expect(await label.textContent()).toBe(MODELS[0]!.label);
        expect(await count.textContent()).toBe(`1/${MODELS.length}`);
        await page.locator('#model-next').click();
        await expectSelection(1);
        await page.locator('#model-prev').click();
        await expectSelection(0);
        await page.locator('#model-prev').click();
        await expectSelection(MODELS.length - 1);
        await page.locator('#model-next').click();
        await expectSelection(0);
    } finally {
        await browser.close();
        await server.stop();
    }
}, 60_000);
