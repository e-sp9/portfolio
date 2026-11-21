import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { roleOf, type Role } from './model-materials';

const MM = 170; // scripts/generate-psp.ts exports 1 unit = 170 mm

async function load(path: string) {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await Bun.file(path).arrayBuffer(), '');
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    gltf.scene.updateMatrixWorld(true);
    return { scene: gltf.scene, meshes, byName: new Map(meshes.map((m) => [m.name, m])) };
}

/**
 * Pairs of meshes with triangles in one plane that overlap with some area
 * (more than 0.001 mm², `mm` per unit): the depth test can't tell such faces
 * apart, so they flicker in triangle-shaped patches. (The same check as the
 * DS's in model-materials.test.ts.)
 */
function coplanarOverlaps(scene: THREE.Object3D, mm: number): string[] {
    scene.updateMatrixWorld(true);
    type Tri = { mesh: string; p: THREE.Vector3[]; n: THREE.Vector3; d: number };
    const buckets = new Map<string, Tri[]>();
    const keyOf = (n: THREE.Vector3, d: number) => `${[n.x, n.y, n.z].map((v) => Math.round(v * 500))}|${Math.round(d / 0.02)}`;
    scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.getAttribute('position'), idx = o.geometry.index!;
        for (let i = 0; i < idx.count; i += 3) {
            const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i + k)).applyMatrix4(o.matrixWorld).multiplyScalar(mm));
            const n = new THREE.Triangle(p[0], p[1], p[2]).getNormal(new THREE.Vector3());
            if (n.lengthSq() < 0.5) continue;
            // One normal per plane, whichever way the face looks
            n.multiplyScalar(Math.sign(Math.abs(n.x) > 1e-6 ? n.x : Math.abs(n.y) > 1e-6 ? n.y : n.z));
            const t = { mesh: o.name, p, n, d: n.dot(p[0]!) }, key = keyOf(n, t.d);
            buckets.set(key, [...(buckets.get(key) ?? []), t]);
        }
    });
    const area = (poly: THREE.Vector2[]) => poly.reduce((s, p, i) => s + p.cross(poly[(i + 1) % poly.length]!), 0) / 2;
    // The part of triangle a inside triangle b (Sutherland-Hodgman)
    const clip = (a: THREE.Vector2[], b: THREE.Vector2[]) => {
        const sense = Math.sign(area(b));
        return b.reduce((poly, e0, i) => {
            const e1 = b[(i + 1) % 3]!, side = (p: THREE.Vector2) => sense * (e1.clone().sub(e0).cross(p.clone().sub(e0)));
            return poly.flatMap((p, j) => {
                const q = poly[(j + 1) % poly.length]!, sp = side(p), sq = side(q);
                return [...(sp > 1e-9 ? [p] : []), ...((sp > 1e-9) !== (sq > 1e-9) ? [p.clone().lerp(q, sp / (sp - sq))] : [])];
            });
        }, a);
    };
    const found = new Set<string>();
    for (const [key, list] of buckets) {
        const [n, d] = key.split('|');
        const near = [...list, ...(buckets.get(`${n}|${Number(d) + 1}`) ?? [])];
        list.forEach((a, i) => {
            const u = new THREE.Vector3().crossVectors(a.n, Math.abs(a.n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
            const v = new THREE.Vector3().crossVectors(a.n, u);
            const flat = (t: Tri) => t.p.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
            near.forEach((b, j) => {
                if ((j < list.length && j <= i) || Math.abs(a.d - b.d) > 0.01) return;
                if (Math.abs(area(clip(flat(a), flat(b)))) > 1e-3) found.add([a.mesh, b.mesh].sort().join(' / '));
            });
        });
    }
    return [...found].sort();
}

describe('PSP (PSP-1000)', () => {
    test('every part names a known role', async () => {
        const { meshes } = await load('public/models/psp.glb');
        expect(meshes.filter((m) => !roleOf(m)).map((m) => m.name)).toEqual([]);
    });

    test('parts get the finish of what they are', async () => {
        const { byName } = await load('public/models/psp.glb');
        const expected: Record<string, Role> = {
            front_shell: 'shell', frame: 'shell', corner_pieces: 'shell', back_shell: 'shell',
            battery_cover: 'shell', grip_left: 'shell', umd_door: 'shell', ms_cover: 'shell', button_ring: 'shell', push_button: 'shell',
            lens: 'lens', lcd: 'lcd',
            dpad: 'button', button_triangle: 'button', button_circle: 'button', button_cross: 'button', button_square: 'button',
            button_home: 'button', button_vol_down: 'button', button_vol_up: 'button', button_display: 'button',
            button_sound: 'button', button_select: 'button', button_start: 'button',
            button_l: 'button', button_r: 'button', switch_nubs: 'button', open_slider: 'button',
            analog: 'rubber',
            logos: 'print', symbols: 'print', back_print: 'print', label: 'print', leds: 'print',
            grille_holes: 'cavity', speaker_holes: 'cavity', ports: 'cavity',
        };
        for (const [name, role] of Object.entries(expected)) expect([name, roleOf(byName.get(name)!)]).toEqual([name, role]);
    });

    test('is 170 x 74 x 23 mm without the keys that stand out of it', async () => {
        const { byName } = await load('public/models/psp.glb');
        const box = new THREE.Box3();
        for (const name of ['front_shell', 'frame', 'corner_pieces', 'back_shell', 'battery_cover', 'grip_left', 'button_l', 'button_r']) {
            box.expandByObject(byName.get(name)!);
        }
        const size = box.getSize(new THREE.Vector3()).multiplyScalar(MM);
        expect([size.x, size.y, size.z].map((v) => Math.round(v))).toEqual([170, 74, 23]);
    });

    test('openings are cut through the shell: no shell face lies across one before its back', async () => {
        const { meshes, byName } = await load('public/models/psp.glb');
        for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
        const shells = meshes.filter((m) => roleOf(m) === 'shell');
        const ray = new THREE.Raycaster();
        const covered: string[] = [];
        let checked = 0;
        for (const name of ['grille_holes', 'speaker_holes', 'ports']) {
            // Each back is a fan or a cone; its center is the vertex every triangle of it uses.
            const back = byName.get(name)!, g = back.geometry, idx = g.index!;
            const uses = new Map<number, number>();
            for (let i = 0; i < idx.count; i++) uses.set(idx.getX(i), (uses.get(idx.getX(i)) ?? 0) + 1);
            for (const [v, n] of uses) {
                if (n < 4) continue;
                const at = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), v).applyMatrix4(back.matrixWorld);
                const out = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), v).transformDirection(back.matrixWorld);
                // From 0.1 unit (17 mm, deeper than any opening) in front of the back, straight in
                ray.set(at.clone().addScaledVector(out, 0.1), out.clone().negate());
                const hit = ray.intersectObjects(shells, false)[0];
                if (hit && hit.distance < 0.1 + 0.003) covered.push(`${name} by ${hit.object.name} at ${hit.distance.toFixed(4)}`);
                checked++;
            }
        }
        expect(covered).toEqual([]);
        // 216 grille holes, 2 speakers; ports: 5 on top, 5 underneath, 2 switch slots, DC IN, the headphone and remote jacks
        expect(checked).toBe(216 + 2 + 15);
    });

    test('no two faces lie in one plane over each other', async () => {
        const { scene } = await load('public/models/psp.glb');
        expect(coplanarOverlaps(scene, MM)).toEqual([]);
    });

    test('the frame\'s outer wall only folds along the body\'s outline, so its cut-outs draw no stray lines', async () => {
        const { byName } = await load('public/models/psp.glb');
        const frame = byName.get('frame')!, pos = frame.geometry.getAttribute('position'), idx = frame.geometry.index!;
        const at = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(frame.matrixWorld).multiplyScalar(MM);
        const verts = Array.from({ length: pos.count }, (_, i) => at(i));
        // The body's outline: the frame's lowest ring, in order around the middle
        const zMin = Math.min(...verts.map((p) => p.z));
        const ring = [...new Map(verts.filter((p) => p.z < zMin + 1e-3).map((p) => [`${p.x.toFixed(3)},${p.y.toFixed(3)}`, new THREE.Vector2(p.x, p.y)])).values()]
            .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
        const onWall = (p: THREE.Vector3) => ring.some((a, k) => {
            const b = ring[(k + 1) % ring.length]!, ab = b.clone().sub(a);
            const t = THREE.MathUtils.clamp(new THREE.Vector2(p.x, p.y).sub(a).dot(ab) / ab.lengthSq(), 0, 1);
            return a.clone().addScaledVector(ab, t).distanceTo(new THREE.Vector2(p.x, p.y)) < 0.005;
        });
        // Triangles lying on the outer wall, and the angle between neighbors across each shared edge
        const key = (p: THREE.Vector3) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
        const edges = new Map<string, THREE.Vector3[]>();
        let walls = 0;
        for (let i = 0; i < idx.count; i += 3) {
            const t = [0, 1, 2].map((k) => verts[idx.getX(i + k)]!);
            if (!t.every(onWall)) continue;
            const n = new THREE.Triangle(t[0], t[1], t[2]).getNormal(new THREE.Vector3());
            if (n.lengthSq() < 0.5) continue;
            walls++;
            for (let k = 0; k < 3; k++) {
                const e = [key(t[k]!), key(t[(k + 1) % 3]!)].sort().join('|');
                edges.set(e, [...(edges.get(e) ?? []), n]);
            }
        }
        const folds = [...edges.values()].filter((ns) => ns.length === 2)
            .map(([a, b]) => THREE.MathUtils.radToDeg(a!.angleTo(b!))).filter((deg) => deg > 8);
        expect(walls).toBeGreaterThan(100);
        expect(folds.map((deg) => Math.round(deg))).toEqual([]);
    });
});
