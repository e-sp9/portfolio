import { expect, test } from 'bun:test';
import { MODELS } from './models';

test('every model in the manifest has its .glb in public/', async () => {
    for (const m of MODELS) expect([m.path, await Bun.file(`public${m.path}`).exists()]).toEqual([m.path, true]);
});
