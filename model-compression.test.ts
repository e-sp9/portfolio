import { expect, test } from 'bun:test';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MODELS } from './models';

for (const def of MODELS) {
    test(`${def.label} requires meshopt and retains named meshes and material roles`, async () => {
        const bytes = await Bun.file(`public${def.path}`).arrayBuffer();
        const view = new DataView(bytes);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, view.getUint32(12, true))));
        expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
        expect(json.bufferViews.some((v: any) => v.extensions?.EXT_meshopt_compression)).toBe(true);
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
        for (const mesh of json.meshes) expect(gltf.scene.getObjectByName(mesh.name)).toBeDefined();
        for (const material of json.materials) {
            expect(material.name.length).toBeGreaterThan(0);
            expect(material.extras.role).toBeDefined();
        }
    });
}

test('compressed models fail explicitly without the meshopt decoder', async () => {
    const bytes = await Bun.file(`public${MODELS[0]!.path}`).arrayBuffer();
    await expect(new GLTFLoader().parseAsync(bytes, '')).rejects.toThrow('setMeshoptDecoder');
});
