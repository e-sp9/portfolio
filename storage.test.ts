import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { THINGS } from './things';

const { outputs } = await Bun.build({ entrypoints: ['./things-page.ts'], target: 'browser' });
const script = await outputs[0]!.text();

for (const mode of ['available', 'empty', 'access', 'get', 'set']) {
    test(`things renders and toggles with storage: ${mode}`, () => {
        const classes = new Set<string>();
        let click = () => {};
        let cards = 0;
        let checked = '';
        const values = new Map(mode === 'available' ? [['portfolio-theme', 'dark']] : []);
        const storage = {
            getItem(key: string) {
                if (mode === 'get') throw new DOMException('Blocked', 'SecurityError');
                return values.get(key) ?? null;
            },
            setItem(key: string, value: string) {
                if (mode === 'set') throw new DOMException('Blocked', 'SecurityError');
                values.set(key, value);
            },
        };
        const button = {
            setAttribute: (_: string, value: string) => { checked = value; },
            addEventListener: (_: string, listener: () => void) => { click = listener; },
        };
        const context = {
            window: { addEventListener() {} },
            document: {
                readyState: 'loading',
                body: { classList: { toggle(name: string, on: boolean) { on ? classes.add(name) : classes.delete(name); } } },
                querySelectorAll: () => [],
                getElementById: (id: string) => id === 'theme-toggle' ? button : id === 'things-grid' ? { appendChild() {} } : {},
                createDocumentFragment: () => ({ appendChild() { cards++; } }),
                createElement: () => ({ style: {} }),
            },
            URL,
        };
        Object.defineProperty(context, 'localStorage', { get() {
            if (mode === 'access') throw new DOMException('Blocked', 'SecurityError');
            return storage;
        } });
        runInNewContext(script, context);
        expect(cards).toBe(THINGS.length);
        const initiallyDark = mode === 'available';
        expect(classes.has('dark-mode')).toBe(initiallyDark);
        click();
        expect(classes.has('dark-mode')).toBe(!initiallyDark);
        expect(checked).toBe(String(!initiallyDark));
        if (mode === 'available' || mode === 'empty') {
            expect(values.get('portfolio-theme')).toBe(initiallyDark ? 'light' : 'dark');
        }
    });
}
