/** Escapes text for HTML or XML, in element content and in quoted attributes. */
export function esc(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the character references the rich editor writes (it escapes little else). */
export function unesc(html: string): string {
    return html.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (reference, dec, hex, name) => {
        if (name) return ENTITIES[name] ?? reference;
        const codePoint = dec ? Number(dec) : parseInt(hex, 16);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : reference;
    });
}
