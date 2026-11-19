import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════════
// THE THEME SWITCH, IN 3D
// A Japanese wall light switch: a tall plate with one small rocker in the
// middle (after the Panasonic WNP5101MWP). In light mode the upper half of the
// rocker is pressed in, in dark mode the lower half. theme-switch.ts loads this
// after the page; until then, and without WebGL, the button draws the same
// switch in CSS (style.css). Sizes are in millimetres.
// ═══════════════════════════════════════════════════════════════════════════════

export const PLATE = { width: 70, height: 120, depth: 6, radius: 6, bevel: 2 };
/** The opening, at the face of the plate; the bevel narrows it by 2 x 2 mm behind */
export const OPENING = { width: 31, height: 43 };
export const ROCKER = { width: 26, height: 38, depth: 5 };
/** How far the rocker tips either way */
export const TILT = THREE.MathUtils.degToRad(13);

const COLORS = {
    light: { body: '#efece4', gap: '#8f8a7e', mark: '#bdb8ac' },
    dark: { body: '#242424', gap: '#050505', mark: '#4c4c4c' },
};
/**
 * Light from high above: faces turned up (the edge of the rocker that stands
 * out, the top of the bevel) catch it, faces turned down fall into shade, and
 * the front stays near the colour above. Dark needs more of it to show at all.
 */
const LIGHTS = {
    light: { ambient: 2.2, key: 2.2 },
    dark: { ambient: 2.0, key: 7 },
};

/** Positive tips the top of the rocker out, which presses the lower half in */
export const tiltFor = (dark: boolean) => (dark ? TILT : -TILT);

const FLIP_MS = 150;
/** Ease out, overshooting by about 7% of the throw */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

function roundedRect<T extends THREE.Path>(path: T, width: number, height: number, radius: number): T {
    const x = -width / 2;
    const y = -height / 2;
    path.moveTo(x + radius, y);
    path.lineTo(x + width - radius, y);
    path.quadraticCurveTo(x + width, y, x + width, y + radius);
    path.lineTo(x + width, y + height - radius);
    path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    path.lineTo(x + radius, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - radius);
    path.lineTo(x, y + radius);
    path.quadraticCurveTo(x, y, x + radius, y);
    return path;
}

/** A rounded slab whose front face sits at z = 0: the bevel rounds its edges */
function slab(shape: THREE.Shape, depth: number, bevel: number): THREE.ExtrudeGeometry {
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: depth - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 8,
    });
    geometry.translate(0, 0, -(depth - bevel));
    return geometry;
}

export interface SwitchModel {
    group: THREE.Group;
    rocker: THREE.Object3D;
    materials: Record<keyof typeof COLORS.light, THREE.MeshStandardMaterial>;
    lights: Record<keyof typeof LIGHTS.light, THREE.Light>;
}

export function buildSwitch(): SwitchModel {
    const materials = {
        body: new THREE.MeshStandardMaterial({ roughness: 0.45 }),
        gap: new THREE.MeshStandardMaterial({ roughness: 1 }),
        mark: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    };
    const group = new THREE.Group();

    // The plate, the bevel shrinking it to 70 x 120 at the edges
    const outline = roundedRect(new THREE.Shape(), PLATE.width - 2 * PLATE.bevel,
        PLATE.height - 2 * PLATE.bevel, PLATE.radius);
    outline.holes.push(roundedRect(new THREE.Path(), OPENING.width, OPENING.height, 2));
    const plate = new THREE.Mesh(slab(outline, PLATE.depth, PLATE.bevel), materials.body);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    // What shows round the rocker: the body of the switch, in shadow
    const back = new THREE.Mesh(new THREE.BoxGeometry(OPENING.width, OPENING.height, 1), materials.gap);
    back.position.z = -PLATE.depth - 0.5;
    back.receiveShadow = true;
    group.add(back);

    // The rocker, pivoting on its centre, flush with the plate when level
    const rocker = new THREE.Group();
    const handle = new THREE.Mesh(
        slab(roundedRect(new THREE.Shape(), ROCKER.width - 3.2, ROCKER.height - 3.2, 1.5), ROCKER.depth, 1.6),
        materials.body,
    );
    handle.position.z = ROCKER.depth / 2;
    handle.castShadow = true;
    handle.receiveShadow = true;
    rocker.add(handle);
    // The small upright line on its right
    const mark = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 0.4), materials.mark);
    mark.position.set(ROCKER.width / 2 - 5, 0, ROCKER.depth / 2 + 0.1);
    rocker.add(mark);
    rocker.position.z = -ROCKER.depth / 2;
    group.add(rocker);

    const ambient = new THREE.AmbientLight(0xffffff);
    group.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff);
    key.position.set(-0.3, 1, 0.35);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -40;
    key.shadow.camera.right = 40;
    key.shadow.camera.top = 65;
    key.shadow.camera.bottom = -65;
    key.shadow.bias = -0.0005;
    group.add(key);

    return { group, rocker, materials, lights: { ambient, key } };
}

/** Sets the colours and light of a theme, or a blend of the two (0 light, 1 dark) */
function paint(model: SwitchModel, darkness: number): void {
    for (const key of Object.keys(model.materials) as (keyof typeof COLORS.light)[]) {
        model.materials[key].color
            .set(COLORS.light[key])
            .lerp(new THREE.Color(COLORS.dark[key]), darkness);
    }
    for (const key of Object.keys(model.lights) as (keyof typeof LIGHTS.light)[]) {
        model.lights[key].intensity = THREE.MathUtils.lerp(LIGHTS.light[key], LIGHTS.dark[key], darkness);
    }
}

export function setTheme(model: SwitchModel, dark: boolean): void {
    model.rocker.rotation.x = tiltFor(dark);
    paint(model, dark ? 1 : 0);
}

/**
 * Puts the switch in the button: one WebGL context, drawn only when the theme
 * changes (the rocker flips over FLIP_MS) and when the size does. Leaves the
 * CSS switch in place if WebGL is not there.
 */
export function mountSwitch3d(button: HTMLElement): void {
    const holder = button.querySelector<HTMLElement>('.ts-visual');
    if (!holder) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'ts-canvas';
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
        return;
    }
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    const model = buildSwitch();
    scene.add(model.group);

    // From a little to the right of and above the front, the plate filling the height
    const camera = new THREE.PerspectiveCamera(16, 1, 100, 1000);
    camera.position.set(0.24, 0.18, 1).setLength(470);
    camera.lookAt(0, 0, -3);

    const render = () => renderer.render(scene, camera);
    const resize = () => {
        const { width, height } = holder.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
    };

    let dark = document.body.classList.contains('dark-mode');
    setTheme(model, dark);
    holder.append(canvas);
    resize();
    button.classList.add('is-3d');
    new ResizeObserver(resize).observe(holder);
    // The pixel ratio changes with the zoom
    window.addEventListener('resize', resize);

    // From where the last flip got to, should the switch be pressed again mid-flip
    let darkness = dark ? 1 : 0;
    let frame = 0;
    const flip = () => {
        cancelAnimationFrame(frame);
        const from = { tilt: model.rocker.rotation.x, darkness };
        const to = { tilt: tiltFor(dark), darkness: dark ? 1 : 0 };
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setTheme(model, dark);
            darkness = to.darkness;
            render();
            return;
        }
        const start = performance.now();
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / FLIP_MS);
            model.rocker.rotation.x = from.tilt + (to.tilt - from.tilt) * easeOutBack(t);
            darkness = from.darkness + (to.darkness - from.darkness) * t;
            paint(model, darkness);
            render();
            if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
    };
    // The page scripts own the theme; the switch follows body.dark-mode
    new MutationObserver(() => {
        const next = document.body.classList.contains('dark-mode');
        if (next === dark) return;
        dark = next;
        flip();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        button.classList.remove('is-3d');
    });
    canvas.addEventListener('webglcontextrestored', () => {
        button.classList.add('is-3d');
        render();
    });
}
