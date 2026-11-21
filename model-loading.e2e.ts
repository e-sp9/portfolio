import { expect, test } from '@playwright/test';

test('the first model can be retried without blocking the rest of the site', async ({ page }) => {
    await page.route('**/models/gbc.glb', route => route.abort('failed'), { times: 1 });
    const firstFailure = page.waitForEvent('requestfailed', request => request.url().endsWith('/models/gbc.glb'));
    await page.goto('/');
    await firstFailure;

    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('MODEL LOAD FAILED');
    const things = page.getByRole('link', { name: 'THINGS' });
    await things.click({ trial: true });
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(page.getByRole('switch', { name: 'Dark mode' })).toBeChecked();

    const retry = page.getByRole('button', { name: 'Retry model load' });
    const retryResponse = page.waitForResponse(response => response.url().endsWith('/models/gbc.glb'));
    await retry.click();
    expect((await retryResponse).ok()).toBe(true);
    await expect(page.locator('#model-label')).toHaveText('GAME BOY COLOR');
    await expect(page.locator('#model-count')).toHaveText(/^1\/\d+$/);
    await expect(page.locator('#loader')).toBeHidden();
    await expect(retry).toBeHidden();
    await expect(page.getByRole('button', { name: 'Next model' })).toBeEnabled();
    await things.click();
    await expect(page).toHaveURL('/things');
});

test('normal startup dismisses the loader after loading the default model', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.locator('#model-label')).toHaveText('GAME BOY COLOR');
    await expect(page.getByRole('button', { name: 'Retry model load' })).toBeHidden();
});

test('unavailable WebGL does not block navigation', async ({ page }) => {
    await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
            if (type.startsWith('webgl')) return null;
            return Reflect.apply(getContext, this, [type, ...args]);
        };
    });
    await page.goto('/');
    await expect(page.locator('#loader')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('3D VIEW UNAVAILABLE');
    await page.getByRole('link', { name: 'THINGS' }).click();
    await expect(page).toHaveURL('/things');
});
