import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { THINGS } from './things';
import { readStorage, writeStorage } from './storage';

const { outputs } = await Bun.build({ entrypoints: ['./things-page.ts'], target: 'browser' });
const script = await outputs[0]!.text();

function withStorage(descriptor: PropertyDescriptor, run: () => void) {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
    try {
        run();
    } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
        else Reflect.deleteProperty(globalThis, 'localStorage');
    }
}

test('storage helper reads, writes and returns null for missing keys', () => {
    const values = new Map<string, string>();
    withStorage({ value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
    } }, () => {
        expect(readStorage('theme')).toBeNull();
        writeStorage('theme', 'dark');
        expect(readStorage('theme')).toBe('dark');
    });
});

test('storage helper tolerates a throwing storage getter', () => {
    withStorage({ get() { throw new DOMException('Blocked', 'SecurityError'); } }, () => {
        expect(readStorage('theme')).toBeNull();
        expect(() => writeStorage('theme', 'dark')).not.toThrow();
    });
});

test('storage helper tolerates getItem throwing', () => {
    withStorage({ value: { getItem() { throw new DOMException('Blocked', 'SecurityError'); } } }, () => {
        expect(readStorage('theme')).toBeNull();
    });
});

test('storage helper tolerates setItem throwing', () => {
    withStorage({ value: { setItem() { throw new DOMException('Full', 'QuotaExceededError'); } } }, () => {
        expect(() => writeStorage('theme', 'dark')).not.toThrow();
    });
});

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
