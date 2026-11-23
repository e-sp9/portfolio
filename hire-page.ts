import { initThemeController } from './theme-controller';
import './theme-switch';

// Set before first paint by the inline script in hire.html
initThemeController({ initialDarkMode: document.body.classList.contains('dark-mode') });
