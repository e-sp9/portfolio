// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (shares the `portfolio-theme` key with the other pages)
// ═══════════════════════════════════════════════════════════════════════════════

const themeToggle = document.getElementById('theme-toggle');
// Set before first paint by the inline script in hire.html
let isDarkMode = document.body.classList.contains('dark-mode');

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDarkMode);
    // The fill follows body.dark-mode in CSS; aria-pressed tells assistive tech
    themeToggle?.querySelectorAll<HTMLElement>('[data-theme]').forEach((option) => {
        option.setAttribute('aria-pressed', String((option.dataset.theme === 'dark') === isDarkMode));
    });
}

applyTheme();
// Each side switches to its own theme
themeToggle?.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('[data-theme]');
    if (!option) return;
    isDarkMode = option.dataset.theme === 'dark';
    try {
        localStorage.setItem('portfolio-theme', isDarkMode ? 'dark' : 'light');
    } catch { }
    applyTheme();
});
