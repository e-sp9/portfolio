/** The shared inline controller for the theme switch. */
export const THEME_TOGGLE_SCRIPT = `    <!-- Theme toggle (shares the \`portfolio-theme\` key with the other pages) -->
    <script>
        (() => {
            const toggle = document.getElementById('theme-toggle');
            let dark = document.body.classList.contains('dark-mode');
            // The switch follows body.dark-mode (style.css, theme-switch-3d.ts); aria-checked tells assistive tech
            const apply = () => {
                document.body.classList.toggle('dark-mode', dark);
                toggle.setAttribute('aria-checked', String(dark));
            };
            apply();
            toggle.addEventListener('click', () => {
                dark = !dark;
                try {
                    localStorage.setItem('portfolio-theme', dark ? 'dark' : 'light');
                } catch (_) { }
                apply();
            });
        })();
    </script>`;
