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
});

describe('Game Boy Advance (no roles)', () => {
    test('keeps the volume tiers it has always had', async () => {
        const { scene, meshes } = await load('public/models/gba.glb');
        expect(meshes.filter((m) => roleOf(m))).toEqual([]);
        const set = assignMaterials(scene);
        const tierOf = (m: THREE.Mesh) => m.material === set.screen ? 'screen' : `tier${set.tiers.indexOf(m.material as THREE.MeshPhysicalMaterial)}`;
        expect(Object.fromEntries(meshes.map((m) => [m.name, tierOf(m)]))).toEqual({
            Gameboy_Base: 'tier0', Frame_Screen: 'tier0', Screen: 'screen',
            Side_Button_01: 'tier0', Side_Button_02: 'tier0', Side_Button_03: 'tier0', Side_Button_04: 'tier0',
            Cross_Button: 'tier1', Front_Button_03: 'tier1', Front_Button_04: 'tier1',
            Screw_01: 'tier1', Screw_03: 'tier1', Screw_05: 'tier1',
            Front_Button_01: 'tier2', Front_Button_02: 'tier2', Front_Button_05: 'tier2', Screw_02: 'tier2', Screw_04: 'tier2',
        });
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
});
