export function createRenderLoop(
    render: (elapsed: number, delta: number) => void,
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
) {
    let frame: number | null = null;
    let previous: number | null = null;
    let elapsed = 0;
    let active = false;

    function tick(now: number) {
        frame = null;
        if (!active) return;
        const delta = previous === null ? 0 : (now - previous) / 1000;
        elapsed += delta;
        previous = now;
        render(elapsed, delta);
        if (active) frame = requestFrame(tick);
    }

    return (visible: boolean) => {
        if (active === visible) return;
        active = visible;
        previous = null;
        if (active) frame = requestFrame(tick);
        else if (frame !== null) {
            cancelFrame(frame);
            frame = null;
        }
    };
}
