export function shouldClearMomentum(previousReducedMotion: boolean | undefined, reducedMotion: boolean) {
    return reducedMotion && previousReducedMotion !== true;
}

export function idleMotion(reducedMotion: boolean, elapsedTime: number) {
    return {
        autoRotate: !reducedMotion,
        floatTime: reducedMotion ? 0 : elapsedTime,
    };
}
