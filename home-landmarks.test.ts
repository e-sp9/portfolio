import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';

test('homepage has a main landmark and an ordered heading hierarchy', async () => {
    const server = Bun.spawn(['bun', './index.ts'], {
        cwd: import.meta.dir,
        env: { ...process.env, PORT: '3197' },
        stdout: 'ignore',
        stderr: 'ignore',
    });
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.route('**/*.js', route => route.abort());
        await page.goto('http://localhost:3197', { waitUntil: 'networkidle' });
        expect(await page.getByRole('main').count()).toBe(1);
        expect(await page.getByRole('heading', { level: 1 }).allTextContents()).toEqual(['RYOTA KATADA']);
        expect(await page.getByRole('heading').evaluateAll(headings => headings.map(heading => [
            heading.tagName, heading.textContent?.trim(),
        ]))).toEqual([
            ['H1', 'RYOTA KATADA'],
            ['H2', 'SKILLS'],
            ['H2', 'CAREER'],
            ['H2', 'WORK'],
            ['H2', 'MAKING'],
            ['H2', 'WRITING'],
            ['H2', 'LINKS'],
        ]);
        expect(await page.getByRole('heading', { level: 2, name: 'WORK', exact: true }).count()).toBe(1);
        expect(await page.getByRole('heading', { name: 'WORK', exact: true }).getByRole('link').count()).toBe(0);
    } finally {
        await browser.close();
        server.kill();
        await server.exited;
    }
}, 30_000);
