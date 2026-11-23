import { readStorage, writeStorage } from './storage';

const THEME_KEY = 'portfolio-theme';

interface ThemeControllerOptions {
    initialDarkMode?: boolean;
    onApply?: (isDarkMode: boolean) => void;
}

export function initThemeController({
    initialDarkMode = readStorage(THEME_KEY) === 'dark',
    onApply,
}: ThemeControllerOptions = {}): () => void {
    const themeToggle = document.getElementById('theme-toggle');
    let isDarkMode = initialDarkMode;

    function applyTheme() {
        document.body.classList.toggle('dark-mode', isDarkMode);
        // The switch follows body.dark-mode (style.css, theme-switch-3d.ts); aria-checked tells assistive tech
        themeToggle?.setAttribute('aria-checked', String(isDarkMode));
        onApply?.(isDarkMode);
    }

    applyTheme();
    themeToggle?.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        writeStorage(THEME_KEY, isDarkMode ? 'dark' : 'light');
        applyTheme();
    });
    return applyTheme;
}
