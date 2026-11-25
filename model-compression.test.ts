import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { NodeIO, type Accessor, type Primitive } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder as TransformMeshoptDecoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MODELS } from './models';

const vertexSemantics = ['POSITION', 'NORMAL'] as const;

function accessorSignature(accessor: Accessor | null) {
    if (!accessor) return null;
    const array = accessor.getArray()!;
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    return [
        accessor.getType(),
        accessor.getComponentType(),
        accessor.getNormalized(),
        createHash('sha256').update(bytes).digest('hex'),
    ];
}

function expectSharedVertexAccessors(primitives: Primitive[]) {
    const positions = new Map<string, Accessor>();
    const normals = new Map<string, Accessor>();
    const indices = new Set<Accessor>();
    let shared = 0;
    for (const primitive of primitives) {
        for (const semantic of vertexSemantics) {
            const accessor = primitive.getAttribute(semantic)!;
            const key = JSON.stringify(accessorSignature(accessor));
            const seen = semantic === 'POSITION' ? positions : normals;
            if (seen.has(key)) {
                expect(accessor === seen.get(key)).toBe(true);
                shared++;
            } else {
                seen.set(key, accessor);
            }
        }
        const index = primitive.getIndices();
        if (index) {
            expect(indices.has(index)).toBe(false);
            indices.add(index);
        }
    }
    expect(shared).toBeGreaterThan(0);
    const usedNormals = new Set(normals.values());
    for (const position of positions.values()) expect(usedNormals.has(position)).toBe(false);
}

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

    test(`${def.label} shares only identical vertex accessors and decodes like the unshared export`, async () => {
        await TransformMeshoptDecoder.ready;
        const io = new NodeIO().registerExtensions([EXTMeshoptCompression])
            .registerDependencies({ 'meshopt.decoder': TransformMeshoptDecoder });
        const doc = await io.read(`public${def.path}`);
        const root = doc.getRoot();
        expectSharedVertexAccessors(root.listMeshes().flatMap(mesh => mesh.listPrimitives()));
        const meshes = root.listMeshes().map(mesh => [
            mesh.getName(),
            mesh.listPrimitives().map(primitive => {
                const vertex = vertexSemantics.map(semantic => accessorSignature(primitive.getAttribute(semantic)));
                const material = primitive.getMaterial()!;
                return [primitive.getMode(), vertex, accessorSignature(primitive.getIndices()), material.getName(), material.getExtras().role];
            }),
        ]);

        const nodes = root.listNodes().map(node => [
            node.getName(), node.getMesh()?.getName(), node.getMatrix(),
            node.listChildren().map(child => child.getName()),
        ]);
        // Decoded from the unshared generators on main (33d6c8a).
        const decoded = createHash('sha256').update(JSON.stringify({ meshes, nodes })).digest('hex');
        expect(decoded).toMatchSnapshot();
    });
}

test('compressed models fail explicitly without the meshopt decoder', async () => {
    const bytes = await Bun.file(`public${MODELS[0]!.path}`).arrayBuffer();
    await expect(new GLTFLoader().parseAsync(bytes, '')).rejects.toThrow('setMeshoptDecoder');
});

test('tabs opened before compression can still load their original model URLs', async () => {
    const loader = new GLTFLoader();
    for (const model of ['gbc', 'gbasp', 'ds', 'dsi', '3ds', 'psp']) {
        const bytes = await Bun.file(`public/models/${model}.glb`).arrayBuffer();
        const gltf = await loader.parseAsync(bytes, '');
        expect(gltf.scene.children.length).toBeGreaterThan(0);
    }
});
