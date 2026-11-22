import { expect, test } from 'bun:test';
import { dpadOutline, knuckle, pit } from './scripts/model-geometry';

test('D-pad outline keeps the same ordered footprint when translated', () => {
    const points: [number, number][] = [
        [5, -2], [5, 2], [2, 2], [2, 5], [-2, 5], [-2, 2],
        [-5, 2], [-5, -2], [-2, -2], [-2, -5], [2, -5], [2, -2],
    ];
    expect(dpadOutline(5, 2).map(p => p.toArray())).toEqual(points);
    expect(dpadOutline(5, 2, 8, -3).map(p => p.toArray())).toEqual(points.map(([x, y]) => [x + 8, y - 3]));
});

test('pit is a cone from its rim on the face to a point depth in', () => {
    const g = pit(0.5, 3, -2, 10, 1.2);
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(47);
    expect(g.getIndex()!.count).toBe(46 * 3);
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([3, -2, Math.fround(8.8)]);
    for (let i = 1; i < pos.count; i++) {
        expect(pos.getZ(i)).toBe(10);
        expect(Math.hypot(pos.getX(i) - 3, pos.getY(i) + 2)).toBeCloseTo(0.5, 5);
    }
    expect(pit(0.5, 3, -2, 10, 1.2, 24).getAttribute('position').count).toBe(25);
});

test('knuckle spans x0..x1 around the barrel, back to the back face', () => {
    const h = { len: 82.4, faceZ: 19.5, faceRim: 3, axisY: 77.9, axisZ: 24.4, barrelR: 4.5, footY: 77.2 };
    const g = knuckle(-31.4, -26.85, h);
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    expect(min.x).toBeCloseTo(-31.4, 5);
    expect(max.x).toBeCloseTo(-26.85, 5);
    expect(min.y).toBeCloseTo(h.axisY - h.barrelR, 2);  // the barrel is faceted
    expect(max.y).toBeCloseTo(h.len, 5);
    expect(min.z).toBeCloseTo(h.faceZ - h.faceRim, 5);
    expect(max.z).toBeCloseTo(h.axisZ + h.barrelR, 2);
});
