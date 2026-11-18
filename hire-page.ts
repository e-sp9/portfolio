// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (shares the `portfolio-theme` key with the other pages)
// ═══════════════════════════════════════════════════════════════════════════════

const themeToggle = document.getElementById('theme-toggle');
// Set before first paint by the inline script in hire.html
let isDarkMode = document.body.classList.contains('dark-mode');

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDarkMode);
    if (!themeToggle) return;
    themeToggle.textContent = isDarkMode ? 'LIGHT' : 'DARK';
    themeToggle.classList.toggle('active', isDarkMode);
}

applyTheme();
themeToggle?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    try {
        localStorage.setItem('portfolio-theme', isDarkMode ? 'dark' : 'light');
    } catch { }
    applyTheme();
});
