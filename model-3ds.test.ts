import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { roleOf, type Role } from './model-materials';

// public/models/meshopt/3ds.glb, written by scripts/generate-3ds.ts (1 unit = 134 mm)
const PATH = 'public/models/meshopt/3ds.glb', MM = 134;

async function load() {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await Bun.file(PATH).arrayBuffer(), '');
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    gltf.scene.updateMatrixWorld(true);
    for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
    return { scene: gltf.scene, meshes, byName: new Map(meshes.map((m) => [m.name, m])) };
}

const LID_PARTS = [
    'lid_face', 'lid_back', 'hinge_barrel', 'lens', 'lcd', 'speaker_holes', 'inner_camera', 'pads', 'lid_print', 'lid_leds',
    'slider_slot', 'depth_slider', 'outer_cameras', 'camera_apertures', 'camera_led',
];

/** World positions of a mesh's vertices */
function points(m: THREE.Mesh) {
    const p = m.geometry.getAttribute('position');
    return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
}

/**
 * Pairs of meshes, one from each list, whose surfaces cross: an edge of a
 * triangle in `from` passes through a face in `to`. Only edges that reach
 * into the bounding box of `to` are tried.
 */
function crossings(from: THREE.Mesh[], to: THREE.Mesh[]): string[] {
    const box = new THREE.Box3();
    for (const m of to) box.expandByObject(m);
    const ray = new THREE.Raycaster(), entry = new THREE.Vector3();
    const found = new Set<string>();
    for (const m of from) {
        const p = points(m), idx = m.geometry.index!;
        for (let i = 0; i < idx.count; i += 3) {
            for (let k = 0; k < 3; k++) {
                const a = p[idx.getX(i + k)]!, b = p[idx.getX(i + (k + 1) % 3)]!, len = a.distanceTo(b);
                if (len < 1e-9) continue;
                ray.set(a, b.clone().sub(a).divideScalar(len));
                if (!ray.ray.intersectBox(box, entry) || entry.distanceTo(a) > len) continue;
                ray.far = len;
                const hit = ray.intersectObjects(to, false)[0];
                if (hit) found.add(`${m.name} / ${hit.object.name}`);
            }
        }
    }
    return [...found].sort();
}

/**
 * Pairs of meshes with triangles in one plane that overlap with some area
 * (more than 0.001 mm², `mm` per unit): the depth test can't tell such faces
 * apart, so they flicker in triangle-shaped patches.
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

describe('Nintendo 3DS', () => {
    test('every part names a known role', async () => {
        const { meshes } = await load();
        expect(meshes.filter((m) => !roleOf(m)).map((m) => m.name)).toEqual([]);
    });

    test('parts get the finish of what they are', async () => {
        const { byName } = await load();
        const expected: Record<string, Role> = {
            base_face: 'shell', base_bottom: 'shell', knuckles: 'shell', base_spine: 'shell', screen_frame: 'shell',
            battery_cover: 'shell', sd_cover: 'shell', lid_face: 'shell', lid_back: 'shell', hinge_barrel: 'shell',
            lens: 'lens', ir_window: 'lens', outer_cameras: 'lens', lcd: 'lcd', touch_screen: 'lcd',
            print: 'print', jack_ring: 'print', leds: 'print', lid_print: 'print', lid_leds: 'print', camera_led: 'print',
            dpad: 'button', button_a: 'button', button_b: 'button', button_x: 'button', button_y: 'button',
            button_select: 'button', button_home: 'button', button_start: 'button', button_power: 'button',
            button_l: 'button', button_r: 'button', switch_nubs: 'button', depth_slider: 'button', stylus: 'button',
            circle_pad: 'rubber', pads: 'rubber',
            speaker_holes: 'cavity', mic_hole: 'cavity', ports: 'cavity', front_ports: 'cavity', slider_slot: 'cavity',
            inner_camera: 'cavity', camera_apertures: 'cavity', screws: 'cavity',
        };
        for (const [name, role] of Object.entries(expected)) expect([name, roleOf(byName.get(name)!)]).toEqual([name, role]);
    });

    test('openings are cut through the shell: no shell face lies across one before its back', async () => {
        const { meshes, byName } = await load();
        const shells = meshes.filter((m) => roleOf(m) === 'shell');
        const ray = new THREE.Raycaster();
        const covered: string[] = [];
        let checked = 0;
        for (const name of ['speaker_holes', 'mic_hole', 'ports', 'front_ports', 'slider_slot', 'inner_camera', 'outer_cameras']) {
            // Each back is a fan or a cone; its center is the vertex every triangle of it uses.
            const back = byName.get(name)!, g = back.geometry, idx = g.index!;
            const uses = new Map<number, number>();
            for (let i = 0; i < idx.count; i++) uses.set(idx.getX(i), (uses.get(idx.getX(i)) ?? 0) + 1);
            for (const [v, n] of uses) {
                if (n < 4) continue;
                const at = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), v).applyMatrix4(back.matrixWorld);
                const out = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), v).transformDirection(back.matrixWorld);
                // From 0.2 unit (27 mm, deeper than the Game Card slot) in front of the back, straight in
                ray.set(at.clone().addScaledVector(out, 0.2), out.clone().negate());
                const hit = ray.intersectObjects(shells, false)[0];
                if (hit && hit.distance < 0.2 + 0.005) covered.push(`${name} by ${hit.object.name} at ${hit.distance.toFixed(4)}`);
                checked++;
            }
        }
        expect(covered).toEqual([]);
        // 10 speaker holes, the microphone, 8 openings in the back, 5 in the top shell's walls,
        // the depth slider's slot, the inner and the two outer cameras
        expect(checked).toBe(10 + 1 + 8 + 5 + 1 + 1 + 2);
    });

    test('no two faces lie in one plane over each other', async () => {
        const { scene } = await load();
        expect(coplanarOverlaps(scene, MM)).toEqual([]);
    });

    test('the lid and its barrel are one closed shell: nothing shows between them or at their ends', async () => {
        const { byName } = await load();
        const barrel = byName.get('hinge_barrel')!, shell = [barrel, byName.get('lid_face')!, byName.get('lid_back')!];
        // The axis runs along x through the barrel's middle, 4.8 mm in from every point of its round side.
        const box = new THREE.Box3().setFromObject(barrel), halfLen = box.getSize(new THREE.Vector3()).x / 2;
        const g = barrel.geometry, axis = new THREE.Vector3();
        let n = 0;
        for (let i = 0; i < g.getAttribute('position').count; i++) {
            const normal = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), i).transformDirection(barrel.matrixWorld);
            if (Math.abs(normal.x) > 0.5) continue;
            axis.add(new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), i).applyMatrix4(barrel.matrixWorld).addScaledVector(normal, -4.8 / MM));
            n++;
        }
        axis.divideScalar(n).setX(box.getCenter(new THREE.Vector3()).x);
        // "Out" is the lid's screen side; "along" runs in the lid's plane, from the axis toward the screen.
        const cam = byName.get('inner_camera')!;
        const out = new THREE.Vector3().fromBufferAttribute(cam.geometry.getAttribute('normal'), 0).transformDirection(cam.matrixWorld);
        const along = new THREE.Vector3(1, 0, 0).cross(out).normalize();
        if (along.dot(new THREE.Box3().setFromObject(byName.get('lcd')!).getCenter(new THREE.Vector3()).sub(axis)) < 0) along.negate();
        // The first face a ray meets must be the outside of the lid or of the barrel, never nothing
        // (a slot) nor one seen from within (an open seam).
        const ray = new THREE.Raycaster(), open: string[] = [];
        let checked = 0;
        const check = (from: THREE.Vector3, dir: THREE.Vector3, where: string) => {
            ray.set(from, dir);
            const hit = ray.intersectObjects(shell, false)[0];
            const inside = hit && hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) > 0;
            if (!hit || inside) open.push(`${where}: ${hit ? `inside ${hit.object.name}` : 'nothing'}`);
            checked++;
        };
        const at = (x: number, d: number, h: number) => axis.clone().setX(axis.x + x / MM).addScaledVector(along, d / MM).addScaledVector(out, h / MM);
        // Straight through the lid from either side, from behind the axis to short of the screen
        // panel's pocket and the steps beside the knuckles: all along the barrel, closely at its ends
        const ends = [0.05, 0.2, 0.5, 1, 1.5].flatMap((e) => [-1, 1].map((s) => s * (halfLen * MM - e)));
        const xs = [...Array.from({ length: 21 }, (_, i) => (i / 10 - 1) * (halfLen * MM - 2)), ...ends];
        for (const x of xs) {
            for (let k = 0; k < 58; k++) {
                const d = -4.55 + 0.2 * k;
                for (const side of [1, -1]) check(at(x, d, side * 20), out.clone().multiplyScalar(-side), `x ${x.toFixed(2)} d ${d.toFixed(2)} from the ${side > 0 ? 'screen' : 'back'}`);
            }
        }
        // Along the axis, from beyond either end, at points inside the barrel or the lid's thickness
        // short of the steps: the ends are closed.
        for (let d = -4.4; d < 6.1; d += 0.4) {
            for (let h = -4.6; h < 2.7; h += 0.4) {
                if (d < 0 && Math.hypot(d, h) > 4.6) continue;
                for (const s of [1, -1]) check(at(s * (halfLen * MM + 5), d, h), new THREE.Vector3(-s, 0, 0), `end ${s > 0 ? '+x' : '-x'} d ${d.toFixed(1)} h ${h.toFixed(1)}`);
            }
        }
        expect(checked).toBeGreaterThan(xs.length * 58 * 2);
        expect(open).toEqual([]);
    });

    test('the open lid stays clear of the lower half', async () => {
        const { meshes, byName } = await load();
        const lower = meshes.filter((m) => !LID_PARTS.includes(m.name));
        expect(lower.length + LID_PARTS.length).toBe(meshes.length);
        // "Up" is the touch screen's normal: the lower half's face looks that way.
        const ts = byName.get('touch_screen')!;
        const up = new THREE.Vector3().fromBufferAttribute(ts.geometry.getAttribute('normal'), 0).transformDirection(ts.matrixWorld);
        const bounds = new THREE.Box3();
        for (const m of lower) bounds.expandByObject(m);
        const ray = new THREE.Raycaster();
        const inside: string[] = [];
        let checked = 0;
        for (const name of LID_PARTS) {
            for (const p of points(byName.get(name)!)) {
                if (!bounds.containsPoint(p)) continue;
                checked++;
                // Going up from a point inside a part, the first face it meets is that part's own top, from within.
                ray.set(p, up);
                const hit = ray.intersectObjects(lower, false)[0];
                if (hit && hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).dot(up) > 0) {
                    inside.push(`${name} in ${hit.object.name}`);
                }
            }
        }
        expect(checked).toBeGreaterThan(0);
        expect([...new Set(inside)]).toEqual([]);
        // Nor do their surfaces cross anywhere between the vertices.
        const lid = meshes.filter((m) => LID_PARTS.includes(m.name));
        expect([...crossings(lid, lower), ...crossings(lower, lid)]).toEqual([]);
    });
});
