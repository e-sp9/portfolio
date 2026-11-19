import { expect, test } from 'bun:test';
import { idleMotion } from './idle-motion';
import { MODELS } from './models';
import { FLOAT, floatHeight } from './view';

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
