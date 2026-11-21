import { expect, test } from 'bun:test';
import { createRenderLoop } from './render-loop';

function setup() {
    let id = 0;
    const pending = new Map<number, FrameRequestCallback>();
    const times: number[] = [];
    const setVisible = createRenderLoop(
        t => times.push(t),
        callback => { pending.set(++id, callback); return id; },
        frame => { pending.delete(frame); },
    );
    const tick = (now: number) => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach(callback => callback(now));
    };
    return { pending, times, setVisible, tick };
}

test('does not schedule or render while initially invisible', () => {
    const loop = setup();
    loop.setVisible(false);
    loop.tick(1000);
    expect(loop.pending.size).toBe(0);
    expect(loop.times).toEqual([]);
});

test('renders continuously without duplicate loops and cancels on pause', () => {
    const loop = setup();
    loop.setVisible(true);
    loop.setVisible(true);
    expect(loop.pending.size).toBe(1);
    loop.tick(1000);
    loop.tick(1016);
    expect(loop.times).toEqual([0, 0.016]);
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
