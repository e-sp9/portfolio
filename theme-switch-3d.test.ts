import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { OPENING, PLATE, ROCKER, TILT, buildSwitch, setTheme } from './theme-switch-3d';

/** Where a point of the rocker's face ends up, in the switch's frame */
function facePoint(rocker: THREE.Object3D, y: number): THREE.Vector3 {
    rocker.updateMatrixWorld(true);
    return rocker.localToWorld(new THREE.Vector3(0, y, ROCKER.depth / 2));
}

describe('wall switch', () => {
    test('light presses the top of the rocker in, dark the bottom', () => {
        const model = buildSwitch();
        const ends = () => ({
            top: facePoint(model.rocker, ROCKER.height / 2).z,
            bottom: facePoint(model.rocker, -ROCKER.height / 2).z,
        });

        setTheme(model, false);
        const light = ends();
        expect(light.top).toBeLessThan(0);
        expect(light.bottom).toBeGreaterThan(0);

        setTheme(model, true);
        const dark = ends();
        expect(dark.bottom).toBeLessThan(0);
        expect(dark.top).toBeGreaterThan(0);
    });

    test('the rocker clears the opening through the whole throw, overshoot included', () => {
        const model = buildSwitch();
        // Behind the face the bevel narrows the opening
        const half = {
            x: OPENING.width / 2 - PLATE.bevel,
            y: OPENING.height / 2 - PLATE.bevel,
        };
        const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) =>
            new THREE.Vector3(sx * ROCKER.width / 2, sy * ROCKER.height / 2, sz * ROCKER.depth / 2))));
        // 7% past the end of the throw, either way
        const reach = TILT + 0.07 * 2 * TILT;
        for (let step = 0; step <= 20; step++) {
            model.rocker.rotation.x = -reach + (2 * reach * step) / 20;
            model.rocker.updateMatrixWorld(true);
            for (const corner of corners) {
                const p = model.rocker.localToWorld(corner.clone());
                // Inside the opening wherever it is within the plate
                if (p.z > -PLATE.depth) {
                    expect(Math.abs(p.x)).toBeLessThan(half.x);
                    expect(Math.abs(p.y)).toBeLessThan(half.y);
                }
            }
        }
    });
});
