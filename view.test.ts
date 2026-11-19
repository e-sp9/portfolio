import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { MODELS } from './models';
import { CAMERA, FLOAT, MOBILE_BP, MOBILE_CANVAS, frameZoom, placeModel } from './view';

/**
 * The band of the canvas a model must stay in, in px from its top: inside the
 * virtual screen (style.css --vs-top / --vs-bottom, 40px at 1000px and below),
 * and on mobile below the fixed 48px header.
 */
const VIEWPORTS = [
    { w: 1440, h: 900, band: [72, 828] },
    { w: 1366, h: 768, band: [72, 696] },
    { w: 1280, h: 720, band: [72, 648] },
    { w: 1000, h: 700, band: [40, 660] },
    { w: 1000, h: 480, band: [40, 440] },
    { w: 390, h: 844, band: [48, 844 * MOBILE_CANVAS] },
    { w: 320, h: 568, band: [48, 568 * MOBILE_CANVAS] },
];

test('every model stays inside the frame through a whole turn, at either end of its bob', async () => {
    const out: string[] = [];
    for (const def of MODELS) {
        const model = (await new GLTFLoader().parseAsync(await Bun.file(`public${def.path}`).arrayBuffer(), '')).scene;
        model.scale.setScalar(placeModel(model, def));
        const all: THREE.Vector3[] = [];
        for (const bob of [FLOAT.bob, -FLOAT.bob]) {
            model.position.y = FLOAT.height - (def.sink ?? 0) + bob;
            model.updateMatrixWorld(true);
            model.traverse((o) => {
                if (!(o instanceof THREE.Mesh)) return;
                const p = o.geometry.getAttribute('position');
                for (let i = 0; i < p.count; i++) all.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
            });
        }
        // A point's height on screen is a ratio of two linear functions, so the
        // highest and lowest points are corners of the convex hull
        const points = new Set<THREE.Vector3>();
        for (const face of new ConvexHull().setFromPoints(all).faces) {
            let edge = face.edge;
            do { points.add(edge.head().point); edge = edge.next; } while (edge !== face.edge);
        }
        for (const { w, h, band } of VIEWPORTS) {
            const mobile = w <= MOBILE_BP;
            const view = mobile ? CAMERA.mobile : CAMERA.desktop;
            const canvasH = mobile ? h * MOBILE_CANVAS : h;
            const camera = new THREE.PerspectiveCamera(view.fov, w / canvasH, 0.1, 100);
            camera.zoom = mobile ? 1 : frameZoom(h, band[1]! - band[0]!);
            camera.updateProjectionMatrix();
            const orbit = new THREE.Spherical().setFromVector3(new THREE.Vector3(...view.position));
            orbit.phi += def.lookUp ?? 0;
            const turned = orbit.clone(), v = new THREE.Vector3();
            let top = Infinity, bottom = -Infinity;
            // The auto-rotation turns the camera around the model
            for (let deg = 0; deg < 360; deg++) {
                turned.theta = orbit.theta + deg * Math.PI / 180;
                camera.position.setFromSpherical(turned);
                camera.lookAt(0, 0, 0);
                camera.updateMatrixWorld(true);
                for (const p of points) {
                    const y = (1 - v.copy(p).project(camera).y) / 2 * canvasH;
                    top = Math.min(top, y);
                    bottom = Math.max(bottom, y);
                }
            }
            if (top < band[0]! || bottom > band[1]!) {
                out.push(`${def.label} at ${w}×${h}: ${top.toFixed(1)}..${bottom.toFixed(1)}, frame ${band[0]}..${band[1]!.toFixed(1)}`);
            }
        }
    }
    expect(out).toEqual([]);
});
