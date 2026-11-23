import { esc } from './blog/html';
import { THEME_TOGGLE_SCRIPT } from './blog/theme-toggle';

export const PAGE_ICONS = `    <meta name="theme-color" content="#f5f5f5">
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

/**
 * The Google Fonts stylesheet, loaded without blocking first paint (media="print"
 * until it loads), with a blocking fallback when scripts are off
 */
export function renderFonts(interWeights: string): string {
    const href = `https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Inter:wght@${interWeights}&display=swap`;
    return `    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="${href}"
        rel="stylesheet" media="print" onload="this.onload=null;this.media='all'">
    <noscript>
        <link
            href="${href}"
            rel="stylesheet">
    </noscript>`;
}

interface PageShell {
    bodyClass: string;
    section: { label: string; href?: string };
    screenId: string;
    main: string;
    credit: string;
    beforeTheme?: string;
}

export function renderPageShell(page: PageShell): string {
    return `<body class="${esc(page.bodyClass)}">
    <!-- Apply saved theme before first paint to avoid a light flash -->
    <script>
        try {
            if (localStorage.getItem('portfolio-theme') === 'dark') document.body.classList.add('dark-mode');
        } catch (_) { }
    </script>
    <!-- CRT Effects -->
    <div id="scanlines"></div>
    <div id="dither"></div>

    <!-- Header -->
    <div id="exp-header">
        <div class="exp-left">
            <a class="exp-label" href="/">RYOTA KATADA</a>
            <span class="exp-sep">/</span>
            ${page.section.href ? `<a class="exp-type" href="${esc(page.section.href)}">${esc(page.section.label)}</a>` : `<span class="exp-type">${esc(page.section.label)}</span>`}
        </div>
        <div class="exp-right">
            <button type="button" id="theme-toggle" class="exp-btn" role="switch" aria-checked="false" aria-label="Dark mode">
                <span class="ts-visual"></span>
            </button>
            <a id="home-btn" class="exp-btn" href="/">&#x2190; HOME</a>
            <a id="blog-btn" class="exp-btn" href="/blog">BLOG</a>
        </div>
    </div>

    <!-- Virtual Screen -->
    <main id="${esc(page.screenId)}">
${page.main}
    </main>

    <!-- Footer -->
    <div id="exp-footer">
        <span class="ef-credit">${esc(page.credit)}</span>
        <span class="ef-copy">&copy; 2026 RYOTA KATADA</span>
    </div>

${page.beforeTheme ?? ''}${THEME_TOGGLE_SCRIPT}
    <!-- The switch in 3D, once the page has loaded (theme-switch.ts) -->
    <script type="module" src="/theme-switch.js"></script>
</body>

</html>
`;
}
