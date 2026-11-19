export function advanceAutoMomentum(momentum: number, autoRotationAngle: number, dampingFactor: number) {
    return (momentum - autoRotationAngle) * (1 - dampingFactor);
}

export function removeAutoMomentum(theta: number, autoMomentum: number) {
    if (autoMomentum === 0) return theta;
    const remainder = theta - autoMomentum;
    return Math.abs(remainder) < 1e-12 ? 0 : remainder;
}

export function shouldClearMomentum(previousReducedMotion: boolean | undefined, reducedMotion: boolean) {
    return reducedMotion && previousReducedMotion !== true;
}

export function idleMotion(reducedMotion: boolean, elapsedTime: number) {
    return {
        autoRotate: !reducedMotion,
        floatTime: reducedMotion ? 0 : elapsedTime,
    };
}
