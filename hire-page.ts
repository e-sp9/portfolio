import { safeGetItem, safeSetItem } from './public/storage.js';
import './theme-switch';

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (shares the `portfolio-theme` key with the other pages)
// ═══════════════════════════════════════════════════════════════════════════════

const themeToggle = document.getElementById('theme-toggle');
let isDarkMode = safeGetItem('portfolio-theme') === 'dark';

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDarkMode);
    // The switch follows body.dark-mode (style.css, theme-switch-3d.ts); aria-checked tells assistive tech
    themeToggle?.setAttribute('aria-checked', String(isDarkMode));
}

applyTheme();
themeToggle?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    safeSetItem('portfolio-theme', isDarkMode ? 'dark' : 'light');
    applyTheme();
});
