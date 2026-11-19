import { expect, test } from 'bun:test';
import { MODELS } from './models';

test('every model in the manifest has its .glb in public/', async () => {
    for (const m of MODELS) expect([m.path, await Bun.file(`public${m.path}`).exists()]).toEqual([m.path, true]);
});

test('the lineup runs in the order the consoles were played, and only the clamshells are seen from below', () => {
    expect(MODELS.map((m) => [m.label, (m.lookUp ?? 0) > 0])).toEqual([
        ['GAME BOY COLOR', false],
        ['GAME BOY ADVANCE SP', true],
        ['NINTENDO DS', true],
        ['NINTENDO DSi', true],
        ['NINTENDO 3DS', true],
        ['PSP', false],
    ]);
});
