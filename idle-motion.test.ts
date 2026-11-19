import { expect, test } from 'bun:test';
import { idleMotion, shouldClearMomentum } from './idle-motion';
import { MODELS } from './models';
import { FLOAT, floatHeight } from './view';

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
