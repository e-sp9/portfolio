import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
    testMatch: '*.e2e.ts',
    expect: { timeout: 10_000 },
    use: {
        baseURL,
        viewport: { width: 900, height: 640 },
        launchOptions: {
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
    },
    webServer: {
        command: 'bun index.ts',
        env: { PORT: '3100' },
        url: baseURL,
    },
});
