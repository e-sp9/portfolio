export function hideInitialLoader(fill: HTMLElement | null, loader: HTMLElement | null): void {
    if (fill) fill.style.width = '100%';
    loader?.classList.add('hidden');
}
