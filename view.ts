import * as THREE from 'three';
import type { ModelDef } from './models';

// ─────────────────────────────────────────────────────────────────────────────
// Where the camera and the model sit on the top page. main.ts places them with
// these, and view.test.ts checks with the same numbers that every model stays
// inside the frame through a whole turn.
// ─────────────────────────────────────────────────────────────────────────────

/** At this width and below the page stacks, and the canvas takes MOBILE_CANVAS of the height */
export const MOBILE_BP = 768;
export const MOBILE_CANVAS = 0.6;

/** Camera per layout before a model's lookUp, looking at the origin */
export const CAMERA: Record<'desktop' | 'mobile', { fov: number; position: [x: number, y: number, z: number] }> = {
    desktop: { fov: 24, position: [0, 0.5, 4.5] },
    mobile: { fov: 28, position: [0, 0.5, 4.8] },
};

/**
 * Share of the canvas height that the virtual screen's frame takes at 1440×900,
 * where the models are fitted (fit, sink). The bands above and below the frame
 * are fixed in px, so they take more of a shorter screen.
 */
export const FRAME_SHARE = 1 - (72 + 72) / 900;

/**
 * Camera zoom for a desktop canvas `height` px tall with a frame `frame` px tall:
 * on a screen where the frame takes less than FRAME_SHARE, the view shrinks by
 * as much, so the models are framed as at 1440×900.
 */
export function frameZoom(height: number, frame: number) {
    return Math.min(1, frame / height / FRAME_SHARE);
}

/** The model floats this high (less its sink) and bobs this far up and down */
export const FLOAT = { height: 0.05, bob: 0.025, speed: 0.7 };

/** Centers `model` on the turntable and faces it to the camera. Returns the scale that gives it its fit. */
export function placeModel(model: THREE.Object3D, def: ModelDef) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

    model.position.sub(center);
    model.rotation.y = def.rotationY ?? 0;
    model.position.y += FLOAT.height;

    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return (def.fit ?? 1.5) / maxDim;
}

/** The model's height `t` seconds in */
export function floatHeight(def: ModelDef, t: number) {
    return FLOAT.height - (def.sink ?? 0) + Math.sin(t * FLOAT.speed) * FLOAT.bob;
}
