export function idleMotion(reducedMotion: boolean, elapsedTime: number) {
    return {
        autoRotate: !reducedMotion,
        floatTime: reducedMotion ? 0 : elapsedTime,
    };
}
