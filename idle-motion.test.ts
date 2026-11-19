import { expect, test } from 'bun:test';
import { advanceAutoMomentum, idleMotion, removeAutoMomentum, shouldClearMomentum } from './idle-motion';
import { MODELS } from './models';
import { FLOAT, floatHeight } from './view';

test('pure auto history is removed exactly, including after drag damping steps', () => {
    let theta = 0;
    let auto = 0;
    for (let frame = 0; frame < 500; frame++) {
        const angle = frame < 300 ? 2 * Math.PI / 60 / 60 * 0.5 : 0;
        theta -= angle;
        theta *= 1 - 0.04;
        auto = advanceAutoMomentum(auto, angle, 0.04);
        expect(removeAutoMomentum(theta, auto)).toBe(0);
    }
});

test('mixed rotation keeps the manual-only damped remainder during drag and after release', () => {
    let theta = 0;
    let auto = 0;
    let manual = 0;
    for (let frame = 0; frame < 100; frame++) {
        const dragging = frame >= 20 && frame < 60;
        const input = dragging ? 0.015 : 0;
        const angle = dragging ? 0 : 2 * Math.PI / 60 / 60 * 0.5;
        theta += input;
        theta -= angle;
        theta *= 1 - 0.04;
        manual = (manual + input) * (1 - 0.04);
        auto = advanceAutoMomentum(auto, angle, 0.04);
        expect(removeAutoMomentum(theta, auto)).toBeCloseTo(manual, 14);
    }
});

test('manual-only momentum is untouched, even below the rounding threshold', () => {
    for (const theta of [0, 0.1, -0.2, 1e-15]) {
        expect(removeAutoMomentum(theta, 0)).toBe(theta);
    }
    expect(advanceAutoMomentum(0, 0, 0.04)).toBe(0);
});

test('subtraction snaps floating-point residue to zero and undamped updates clear auto momentum', () => {
    expect(removeAutoMomentum(0.1 + 0.2, 0.3)).toBe(0);
    expect(advanceAutoMomentum(0.2, 0.01, 1)).toBe(0);
});

test('momentum is cleared only on entry to reduced motion, including initialization', () => {
    expect(shouldClearMomentum(undefined, true)).toBe(true);
    expect(shouldClearMomentum(undefined, false)).toBe(false);
    expect(shouldClearMomentum(false, true)).toBe(true);
    expect(shouldClearMomentum(true, true)).toBe(false);
    expect(shouldClearMomentum(true, false)).toBe(false);
    expect(shouldClearMomentum(false, false)).toBe(false);
});

test('repeated reduced frames preserve drag inertia and toggling back clears it again', () => {
    let previous: boolean | undefined;
    const clears = [false, true, true, true, false, false, true, true].map(current => {
        const clear = shouldClearMomentum(previous, current);
        previous = current;
        return clear;
    });
    expect(clears).toEqual([false, true, false, false, false, false, true, false]);
});

test('normal motion keeps auto-rotation and the original floating timeline', () => {
    for (const time of [0, 1, 5, 20]) {
        expect(idleMotion(false, time)).toEqual({ autoRotate: true, floatTime: time });
    }
});

test('reduced motion disables auto-rotation and holds every model at its resting height', () => {
    for (const time of [0, 1, 5, 20]) {
        const motion = idleMotion(true, time);
        expect(motion).toEqual({ autoRotate: false, floatTime: 0 });
        for (const model of MODELS) {
            expect(floatHeight(model, motion.floatTime)).toBe(FLOAT.height - (model.sink ?? 0));
        }
    }
});

test('live toggles stop motion and restore the current original timeline', () => {
    const preferences = [false, true, true, false, true, false];
    const motions = preferences.map((reduce, time) => idleMotion(reduce, time));
    expect(motions).toEqual([
        { autoRotate: true, floatTime: 0 },
        { autoRotate: false, floatTime: 0 },
        { autoRotate: false, floatTime: 0 },
        { autoRotate: true, floatTime: 3 },
        { autoRotate: false, floatTime: 0 },
        { autoRotate: true, floatTime: 5 },
    ]);
});
