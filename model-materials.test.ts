import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyMaterialTheme, assignMaterials, roleOf, type Role } from './model-materials';

async function load(path: string) {
    const gltf = await new GLTFLoader().parseAsync(await Bun.file(path).arrayBuffer(), '');
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    return { scene: gltf.scene, meshes, byName: new Map(meshes.map((m) => [m.name, m])) };
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

/** A unit-cube mesh scaled to `size`, whose material names `role` */
function part(name: string, size: number, role?: string) {
    const material = new THREE.MeshStandardMaterial();
    if (role) material.userData.role = role;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
    mesh.name = name;
    return mesh;
}

describe('assignMaterials', () => {
    test('a part with a role gets that role, shared by every part with it', () => {
        const model = new THREE.Group().add(part('a', 1, 'button'), part('b', 2, 'button'), part('c', 3, 'shell'));
        const set = assignMaterials(model);
        const [a, b, c] = model.children as THREE.Mesh[];
        expect(a!.material).toBe(set.roles.get('button')!);
        expect(b!.material).toBe(a!.material);
        expect(c!.material).toBe(set.roles.get('shell')!);
        expect([...set.roles.keys()].sort()).toEqual(['button', 'shell']);
    });

    test('parts without a role fall back: "screen" by name, the rest by volume in thirds', () => {
        const model = new THREE.Group().add(
            part('Screen', 0.5), part('xs', 1), part('s', 2), part('m', 3), part('l', 4), part('xl', 5), part('lens', 6, 'lens'),
        );
        const set = assignMaterials(model);
        const mat = (name: string) => (model.getObjectByName(name) as THREE.Mesh).material;
        expect(mat('Screen')).toBe(set.screen);
        expect(mat('lens')).toBe(set.roles.get('lens')!);
        // 5 parts: ceil(5/3) = 2 largest, then up to ceil(10/3) = 4, then the rest
        expect(['xl', 'l', 'm', 's', 'xs'].map(mat)).toEqual([set.tiers[0], set.tiers[0], set.tiers[1], set.tiers[1], set.tiers[2]]);
    });

    test('an unknown role is ignored', () => {
        expect(roleOf(part('x', 1, 'chrome'))).toBeUndefined();
        expect(roleOf(part('x', 1))).toBeUndefined();
    });

    test('fallback materials keep their theme values', () => {
        const set = assignMaterials(new THREE.Group());
        applyMaterialTheme(set, false);
        expect(set.tiers.map((m) => m.opacity)).toEqual([0.03, 0.30, 0.42]);
        expect(set.screen.emissiveIntensity).toBe(0.15);
        applyMaterialTheme(set, true);
        expect(set.tiers.map((m) => m.opacity)).toEqual([0.08, 0.50, 0.60]);
        expect(set.screen.emissiveIntensity).toBe(0.4);
    });
});

describe('Game Boy Color', () => {
    test('every part names a known role', async () => {
        const { meshes } = await load('public/models/gbc.glb');
        expect(meshes.filter((m) => !roleOf(m)).map((m) => m.name)).toEqual([]);
    });

    test('parts get the finish of what they are', async () => {
        const { byName } = await load('public/models/gbc.glb');
        const expected: Record<string, Role> = {
            body_front: 'shell', body_back: 'shell', battery_cover: 'shell',
            screen: 'lens', lcd: 'lcd', logo_strip: 'print',
            dpad: 'button', button_a: 'button', button_b: 'button',
            select_pill: 'rubber', start_pill: 'rubber',
            screws: 'cavity', speaker_holes: 'cavity', cart_slit: 'cavity', phone_hole: 'cavity',
        };
        for (const [name, role] of Object.entries(expected)) expect([name, roleOf(byName.get(name)!)]).toEqual([name, role]);
    });

    test('only the lens reflects; the LCD under it has no coat of its own', async () => {
        const { scene } = await load('public/models/gbc.glb');
        const set = assignMaterials(scene);
        const lens = set.roles.get('lens')!, lcd = set.roles.get('lcd')!;
        expect(lens.clearcoat).toBeGreaterThan(0);
        expect(lcd.clearcoat).toBe(0);
        expect(lcd.envMapIntensity).toBeLessThan(lens.envMapIntensity);
        expect(lcd.roughness).toBeGreaterThan(lens.roughness);
    });

    test('theme switches change the role materials', async () => {
        const { scene } = await load('public/models/gbc.glb');
        const set = assignMaterials(scene);
        const shell = set.roles.get('shell')!;
        applyMaterialTheme(set, false);
        const light = [shell.opacity, shell.userData.gloss.rim.value];
        applyMaterialTheme(set, true);
        expect([shell.opacity, shell.userData.gloss.rim.value]).not.toEqual(light);
        expect(set.roles.get('lens')!.transparent).toBe(false);
        expect(set.roles.get('shell')!.transparent).toBe(true);
    });
});

describe('Game Boy Advance SP', () => {
    test('every part names a known role', async () => {
        const { meshes } = await load('public/models/gbasp.glb');
        expect(meshes.filter((m) => !roleOf(m)).map((m) => m.name)).toEqual([]);
    });

    test('parts get the finish of what they are', async () => {
        const { byName } = await load('public/models/gbasp.glb');
        const expected: Record<string, Role> = {
            base_face: 'shell', base_bottom: 'shell', lid_face: 'shell', lid_back: 'shell',
            knuckles: 'shell', hinge_barrel: 'shell', battery_cover: 'shell',
            lens: 'lens', lcd: 'lcd', logo_strip: 'print', badge: 'print', label: 'print', leds: 'print',
            dpad: 'button', button_a: 'button', button_b: 'button', button_select: 'button', button_start: 'button',
            light_switch: 'button', button_l: 'button', button_r: 'button',
            pads: 'rubber',
            speaker_holes: 'cavity', ports: 'cavity', screws: 'cavity', strap_holes: 'cavity', cart_slit: 'cavity',
        };
        for (const [name, role] of Object.entries(expected)) expect([name, roleOf(byName.get(name)!)]).toEqual([name, role]);
    });

    test('openings are cut through the shell: no shell face lies across one before its back', async () => {
        const { scene, meshes, byName } = await load('public/models/gbasp.glb');
        scene.updateMatrixWorld(true);
        for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
        const shells = meshes.filter((m) => roleOf(m) === 'shell');
        const ray = new THREE.Raycaster();
        const covered: string[] = [];
        let checked = 0;
        for (const name of ['speaker_holes', 'ports', 'switch_slots', 'lid_slits', 'cart_slit']) {
            // Each back is a fan; its center is the vertex every triangle of the fan uses.
            const back = byName.get(name)!, g = back.geometry, idx = g.index!;
            const uses = new Map<number, number>();
            for (let i = 0; i < idx.count; i++) uses.set(idx.getX(i), (uses.get(idx.getX(i)) ?? 0) + 1);
            for (const [v, n] of uses) {
                if (n < 4) continue;
                const at = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), v).applyMatrix4(back.matrixWorld);
                const out = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), v).transformDirection(back.matrixWorld);
                // From 0.1 unit (8 mm, deeper than any opening) in front of the back, straight in
                ray.set(at.clone().addScaledVector(out, 0.1), out.clone().negate());
                const hit = ray.intersectObjects(shells, false)[0];
                if (hit && hit.distance < 0.1 + 0.005) covered.push(`${name} by ${hit.object.name} at ${hit.distance.toFixed(4)}`);
                checked++;
            }
        }
        expect(covered).toEqual([]);
        expect(checked).toBe(16 + 4 + 2 + 4 + 1);
    });
});

describe('Nintendo DS', () => {
    test('every part names a known role', async () => {
        const { meshes } = await load('public/models/ds.glb');
        expect(meshes.filter((m) => !roleOf(m)).map((m) => m.name)).toEqual([]);
    });

    test('parts get the finish of what they are', async () => {
        const { byName } = await load('public/models/ds.glb');
        const expected: Record<string, Role> = {
            base_face: 'shell', base_bottom: 'shell', lid_face: 'shell', lid_back: 'shell',
            knuckles: 'shell', hinge_barrel: 'shell', battery_cover: 'shell',
            lens: 'lens', lcd: 'lcd', touch_screen: 'lcd',
            logo_strip: 'print', badge: 'print', label: 'print', leds: 'print',
            dpad: 'button', button_a: 'button', button_b: 'button', button_x: 'button', button_y: 'button',
            button_select: 'button', button_start: 'button', button_power: 'button',
            button_l: 'button', button_r: 'button', volume_nub: 'button', stylus: 'button',
            bumpers: 'rubber', feet: 'rubber',
            speaker_holes: 'cavity', mic_hole: 'cavity', ports: 'cavity', screws: 'cavity',
        };
        for (const [name, role] of Object.entries(expected)) expect([name, roleOf(byName.get(name)!)]).toEqual([name, role]);
    });

    test('openings are cut through the shell: no shell face lies across one before its back', async () => {
        const { scene, meshes, byName } = await load('public/models/ds.glb');
        scene.updateMatrixWorld(true);
        for (const m of meshes) (m.material as THREE.Material).side = THREE.DoubleSide;
        const shells = meshes.filter((m) => roleOf(m) === 'shell');
        const ray = new THREE.Raycaster();
        const covered: string[] = [];
        let checked = 0;
        for (const name of ['speaker_holes', 'mic_hole', 'ports']) {
            // Each back is a fan or a cone; its center is the vertex every triangle of it uses.
            const back = byName.get(name)!, g = back.geometry, idx = g.index!;
            const uses = new Map<number, number>();
            for (let i = 0; i < idx.count; i++) uses.set(idx.getX(i), (uses.get(idx.getX(i)) ?? 0) + 1);
            for (const [v, n] of uses) {
                if (n < 4) continue;
                const at = new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), v).applyMatrix4(back.matrixWorld);
                const out = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), v).transformDirection(back.matrixWorld);
                // From 0.2 unit (30 mm, deeper than the Game Pak slot) in front of the back, straight in
                ray.set(at.clone().addScaledVector(out, 0.2), out.clone().negate());
                const hit = ray.intersectObjects(shells, false)[0];
                if (hit && hit.distance < 0.2 + 0.005) covered.push(`${name} by ${hit.object.name} at ${hit.distance.toFixed(4)}`);
                checked++;
            }
        }
        expect(covered).toEqual([]);
        expect(checked).toBe(56 + 1 + 8);
    });

    test('no two faces lie in one plane over each other', async () => {
        const { scene } = await load('public/models/ds.glb');
        expect(coplanarOverlaps(scene, 148.7)).toEqual([]);
    });

    test('the open lid stays clear of the lower half\'s face', async () => {
        const { scene, byName } = await load('public/models/ds.glb');
        scene.updateMatrixWorld(true);
        const points = (name: string) => {
            const m = byName.get(name)!, p = m.geometry.getAttribute('position');
            return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
        };
        // The touch screen lies flat in the face: its normal is the face's.
        const ts = byName.get('touch_screen')!;
        const up = new THREE.Vector3().fromBufferAttribute(ts.geometry.getAttribute('normal'), 0).transformDirection(ts.matrixWorld);
        const along = new THREE.Vector3(1, 0, 0).cross(up).normalize(); // front edge toward the hinge
        const face = points('base_face');
        const top = Math.max(...face.map((p) => p.dot(up)));
        const [a0, a1] = [Math.min(...face.map((p) => p.dot(along))), Math.max(...face.map((p) => p.dot(along)))];
        const halfW = Math.max(...face.map((p) => Math.abs(p.x)));
        const below = ['lid_face', 'lid_back', 'lens', 'lcd', 'bumpers', 'badge', 'speaker_holes'].flatMap(points)
            .filter((p) => Math.abs(p.x) < halfW && p.dot(along) > a0 && p.dot(along) < a1)
            .filter((p) => p.dot(up) < top);
        expect(below.length).toBe(0);
    });
});
