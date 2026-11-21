export function createRenderLoop(
    render: (elapsed: number) => void,
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
        if (previous !== null) elapsed += (now - previous) / 1000;
        previous = now;
        render(elapsed);
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
