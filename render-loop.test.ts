import { expect, test } from 'bun:test';
import { createRenderLoop } from './render-loop';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function autoRotationAfterSecond(hz: number) {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 5);
    const controls = new OrbitControls(camera);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    // Isolate auto-rotation from the intentionally frame-based damping response.
    controls.enableDamping = false;
    let next: FrameRequestCallback = () => {};
    const visible = createRenderLoop(
        (_elapsed, delta) => { controls.update(delta); },
        callback => { next = callback; return 1; },
        () => {},
    );
    visible(true);
    next(0);
    const initial = controls.getAzimuthalAngle();
    for (let frame = 1; frame <= hz; frame++) next(frame * 1000 / hz);
    visible(false);
    return controls.getAzimuthalAngle() - initial;
}

test('one second of auto-rotation matches the legacy 60Hz angle at 60Hz and 120Hz', () => {
    const at60 = autoRotationAfterSecond(60);
    const at120 = autoRotationAfterSecond(120);
    expect(at60).toBeCloseTo(-2 * Math.PI / 60 * 0.5, 12);
    expect(at120).toBeCloseTo(at60, 12);
});

function setup() {
    let id = 0;
    const pending = new Map<number, FrameRequestCallback>();
    const times: number[] = [];
    const deltas: number[] = [];
    const setVisible = createRenderLoop(
        (t, delta) => { times.push(t); deltas.push(delta); },
        callback => { pending.set(++id, callback); return id; },
        frame => { pending.delete(frame); },
    );
    const tick = (now: number) => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach(callback => callback(now));
    };
    return { pending, times, deltas, setVisible, tick };
}

test('does not schedule or render while initially invisible', () => {
    const loop = setup();
    loop.setVisible(false);
    loop.tick(1000);
    expect(loop.pending.size).toBe(0);
    expect(loop.times).toEqual([]);
    expect(loop.deltas).toEqual([]);
});

test('renders continuously without duplicate loops and cancels on pause', () => {
    const loop = setup();
    loop.setVisible(true);
    loop.setVisible(true);
    expect(loop.pending.size).toBe(1);
    loop.tick(1000);
    loop.tick(1016);
    expect(loop.times).toEqual([0, 0.016]);
    expect(loop.deltas).toEqual([0, 0.016]);
    loop.setVisible(false);
    loop.setVisible(false);
    loop.tick(2000);
    expect(loop.pending.size).toBe(0);
    expect(loop.times).toEqual([0, 0.016]);
});

test('resumes with a fresh frame but no hidden time or catch-up steps', () => {
    const loop = setup();
    loop.setVisible(true);
    loop.tick(1000);
    loop.tick(1020);
    loop.setVisible(false);
    loop.setVisible(true);
    loop.tick(100000);
    loop.tick(100020);
    expect(loop.times).toEqual([0, 0.02, 0.02, 0.04]);
    expect(loop.deltas).toEqual([0, 0.02, 0, 0.02]);
    expect(loop.pending.size).toBe(1);
});

test('can pause before the first frame', () => {
    const loop = setup();
    loop.setVisible(true);
    loop.setVisible(false);
    loop.tick(1000);
    expect(loop.times).toEqual([]);
    loop.setVisible(true);
    loop.tick(2000);
    expect(loop.times).toEqual([0]);
});
