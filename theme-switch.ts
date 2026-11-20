// ═══════════════════════════════════════════════════════════════════════════════
// THEME SWITCH: loads the 3D switch (theme-switch-3d.ts, with three.js) once the
// page has loaded and gone idle, so it never holds up the page. The button
// draws the same switch in CSS until then, and keeps it without WebGL.
// Every page loads this: the top, /things and /hire through their bundles,
// /blog and /work as /theme-switch.js.
// ═══════════════════════════════════════════════════════════════════════════════

const button = document.getElementById('theme-toggle');

document.querySelectorAll<HTMLAnchorElement>('a.link-row[href="https://x.com/e___sp9"]').forEach(link => {
    link.addEventListener('click', () => {
        try {
            navigator.sendBeacon('/api/event', JSON.stringify({ event: 'contact_click_x', page: location.pathname }));
        } catch { }
    });
});

function whenIdle(run: () => void): void {
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 200);
}

if (button) {
    const load = () => whenIdle(() => {
        import('./theme-switch-3d')
            .then(({ mountSwitch3d }) => mountSwitch3d(button))
            // Not loaded (offline, blocked): the CSS switch stays
            .catch(() => { });
    });
    if (document.readyState === 'complete') load();
    else window.addEventListener('load', load, { once: true });
}
