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
