import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';
import { THINGS } from './things';

const PORT = 3196;
const ORIGIN = `http://localhost:${PORT}`;

async function waitForServer() {
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(ORIGIN)).ok) return;
        } catch {}
        await Bun.sleep(100);
    }
    throw new Error('dev server did not start');
}

test('/things exposes photo alt text and gives each card one link and one Tab stop', async () => {
    const server = Bun.spawn(['bun', './index.ts'], {
        cwd: import.meta.dir,
        env: { ...process.env, PORT: String(PORT) },
        stdout: 'ignore',
        stderr: 'ignore',
    });
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        await waitForServer();
        for (const [width, height] of [[390, 844], [1440, 900]] as const) {
            const context = await browser.newContext({ viewport: { width, height } });
            // Product sites are external: answer them locally so the photo click is checked offline.
            await context.route(url => url.origin !== ORIGIN, route =>
                route.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));
            const page = await context.newPage();
            await page.goto(`${ORIGIN}/things`);
            const cards = page.locator('#things-grid .thing');
            await cards.last().waitFor();
            expect(await cards.count()).toBe(THINGS.length);

            for (const [i, thing] of THINGS.entries()) {
                const card = cards.nth(i);
                expect(await card.getByRole('img', { name: thing.alt ?? thing.name, exact: true }).count()).toBe(1);
                const links = card.getByRole('link');
                expect(await links.count()).toBe(1);
                expect(await links.getAttribute('href')).toBe(thing.link);
                expect(await links.innerText()).toBe(thing.name);
            }

            const tabStops: string[] = [];
            for (let i = 0; i < THINGS.length * 2 + 20; i++) {
                await page.keyboard.press('Tab');
                const stop = await page.evaluate(() => {
                    const el = document.activeElement;
                    return el?.closest('#things-grid') ? `${el.closest('.thing')!.querySelector('.thing-id')!.textContent} ${el.textContent!.trim()}` : null;
                });
                if (stop === tabStops[0]) break;
                if (stop) tabStops.push(stop);
            }
            expect(tabStops).toEqual(THINGS.map((thing, i) => `#${String(i + 1).padStart(3, '0')} ${thing.name}`));

            for (const i of [0, THINGS.length - 1]) {
                const photo = cards.nth(i).locator('.thing-photo');
                await photo.scrollIntoViewIfNeeded();
                // A real pointer click at the photo's centre, whatever element receives it.
                const box = (await photo.boundingBox())!;
                const [popup] = await Promise.all([
                    context.waitForEvent('page'),
                    page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
                ]);
                expect(popup.url()).toBe(THINGS[i]!.link);
                await popup.close();
            }
            await context.close();
        }
    } finally {
        await browser.close();
        server.kill();
    }
}, 60_000);
