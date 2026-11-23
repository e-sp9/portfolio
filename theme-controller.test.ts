import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import type { initThemeController } from './theme-controller';

test('applies the initial DOM theme and reapplies the current theme for the scene', async () => {
    const { outputs } = await Bun.build({ entrypoints: ['./theme-controller.ts'], format: 'cjs' });
    const module = { exports: {} as { initThemeController: typeof initThemeController } };
    const values = new Map<string, string>();
    let storageReads = 0;
    let darkMode = false;
    let checked = '';
    let click = () => {};
    runInNewContext(await outputs[0]!.text(), {
        module,
        localStorage: {
            getItem(key: string) {
                storageReads++;
                return values.get(key) ?? null;
            },
            setItem: (key: string, value: string) => values.set(key, value),
        },
        document: {
            body: { classList: { toggle: (name: string, on: boolean) => {
                expect(name).toBe('dark-mode');
                darkMode = on;
            } } },
            getElementById: (id: string) => {
                expect(id).toBe('theme-toggle');
                return {
                    setAttribute: (name: string, value: string) => {
                        expect(name).toBe('aria-checked');
                        checked = value;
                    },
                    addEventListener: (event: string, listener: () => void) => {
                        expect(event).toBe('click');
                        click = listener;
                    },
                };
            },
        },
    });

    const applied: boolean[] = [];
    const reapply = module.exports.initThemeController({
        initialDarkMode: true,
        onApply(isDarkMode) {
            expect(darkMode).toBe(isDarkMode);
            expect(checked).toBe(String(isDarkMode));
            applied.push(isDarkMode);
        },
    });
    expect(storageReads).toBe(0);
    expect(applied).toEqual([true]);
    expect(values.has('portfolio-theme')).toBe(false);
    click();
    expect(values.get('portfolio-theme')).toBe('light');
    click();
    expect(values.get('portfolio-theme')).toBe('dark');
    reapply();
    expect(applied).toEqual([true, false, true, true]);
});
