import './theme-switch';

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (shares the `portfolio-theme` key with the other pages)
// ═══════════════════════════════════════════════════════════════════════════════

const themeToggle = document.getElementById('theme-toggle');
// Set before first paint by the inline script in hire.html
let isDarkMode = document.body.classList.contains('dark-mode');

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDarkMode);
    // The switch follows body.dark-mode (style.css, theme-switch-3d.ts); aria-checked tells assistive tech
    themeToggle?.setAttribute('aria-checked', String(isDarkMode));
}

applyTheme();
themeToggle?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    try {
        localStorage.setItem('portfolio-theme', isDarkMode ? 'dark' : 'light');
    } catch { }
    applyTheme();
});
