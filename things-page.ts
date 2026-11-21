import { safeGetItem, safeSetItem } from './public/storage.js';
import { THINGS, type Thing } from './things';
import './theme-switch';

// ═══════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE (shares the `portfolio-theme` key with the top page)
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

// ═══════════════════════════════════════════════════════════════════════════════
// CARDS
// ═══════════════════════════════════════════════════════════════════════════════

function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function renderCard(thing: Thing, index: number): HTMLElement {
    const card = document.createElement('article');
    card.className = 'thing panel';
    card.style.animationDelay = `${index * 60}ms`;

    const id = String(index + 1).padStart(3, '0');
    const alt = esc(thing.alt ?? thing.name);
    const link = esc(thing.link);

    card.innerHTML = `
        <a class="thing-photo" href="${link}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
            <img src="${esc(thing.image)}" alt="${alt}" loading="lazy" decoding="async">
        </a>
        <div class="thing-body">
            <div class="thing-meta">
                <span class="thing-cat">${esc(thing.category.toUpperCase())}</span>
                <span class="thing-id">#${id}</span>
            </div>
            <h2 class="thing-title"><a class="thing-name" href="${link}" target="_blank" rel="noopener">${esc(thing.name)}</a></h2>
            <p class="thing-note">${esc(thing.note)}</p>
            <a class="thing-link link-row" href="${link}" target="_blank" rel="noopener">
                <span class="link-icon">&#9654;</span>
                <span class="link-label">${esc(hostOf(thing.link))}</span>
                <span class="link-arrow">&#x2197;</span>
            </a>
        </div>
    `;
    return card;
}

const grid = document.getElementById('things-grid');
const count = document.getElementById('things-count');

if (grid) {
    const frag = document.createDocumentFragment();
    THINGS.forEach((thing, i) => frag.appendChild(renderCard(thing, i)));
    grid.appendChild(frag);
}

if (count) {
    count.textContent = `${String(THINGS.length).padStart(2, '0')} ITEMS`;
}
