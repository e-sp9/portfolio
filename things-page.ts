import { THINGS, type Thing } from './things';
import { initThemeController } from './theme-controller';
import './theme-switch';

initThemeController();

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
        <div class="thing-photo">
            <img src="${esc(thing.image)}" alt="${alt}" loading="lazy" decoding="async">
        </div>
        <div class="thing-body">
            <div class="thing-meta">
                <span class="thing-cat">${esc(thing.category.toUpperCase())}</span>
                <span class="thing-id">#${id}</span>
            </div>
            <h2 class="thing-title"><a class="thing-name" href="${link}" target="_blank" rel="noopener">${esc(thing.name)}</a></h2>
            <p class="thing-note">${esc(thing.note)}</p>
            <div class="thing-link link-row">
                <span class="link-icon">&#9654;</span>
                <span class="link-label">${esc(hostOf(thing.link))}</span>
                <span class="link-arrow">&#x2197;</span>
            </div>
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
