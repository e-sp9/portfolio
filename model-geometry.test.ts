import { expect, test } from 'bun:test';
import { dpadOutline } from './scripts/model-geometry';

test('D-pad outline keeps the same ordered footprint when translated', () => {
    const points: [number, number][] = [
        [5, -2], [5, 2], [2, 2], [2, 5], [-2, 5], [-2, 2],
        [-5, 2], [-5, -2], [-2, -2], [-2, -5], [2, -5], [2, -2],
    ];
    expect(dpadOutline(5, 2).map(p => p.toArray())).toEqual(points);
    expect(dpadOutline(5, 2, 8, -3).map(p => p.toArray())).toEqual(points.map(([x, y]) => [x + 8, y - 3]));
});
