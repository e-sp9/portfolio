/**
 * Generate the favicon set from a single 16x16 pixel grid.
 *
 * Motif: a pixel-art Game Boy with a "▶" on its screen. The site's centerpiece
 * is the floating Game Boy models, and "▶" is the link marker used in the
 * panels, so the tab icon is the page in miniature. Colors come from the
 * design tokens (accent blue body, near-black screen, off-white pixels), and
 * the blue body reads on both light and dark tab bars.
 *
 * Every output is an integer multiple of the 16px grid, so pixels stay crisp:
 *   public/favicon.svg           vector, crispEdges
 *   public/favicon-16.png        1x
 *   public/favicon-32.png        2x
 *   public/favicon.ico           16 + 32 (PNG-encoded entries)
 *   public/apple-touch-icon.png  180px, 10x grid on an opaque --bg tile
 *
 * Run: bun scripts/generate-favicon.ts
 */
import { deflateSync } from 'node:zlib';

// ─── Palette (design tokens) ─────────────────────────────────────────────────

const PALETTE: Record<string, string> = {
    B: '#3b82f6', // --accent        body
    S: '#2563eb', // --accent-hover  body shade (right / bottom edge)
    K: '#0a0a0a', // --val           screen, d-pad
    W: '#f5f5f5', // --bg            screen glyph, A/B buttons
};
const TILE_BG = '#f5f5f5'; // --bg, apple-touch-icon background

// ─── 16x16 grid ('.' = transparent) ──────────────────────────────────────────

const GRID = [
    '...BBBBBBBBBB...',
    '..BBBBBBBBBBBS..',
    '..BKKKKKKKKKBS..',
    '..BKKWKKKKKKBS..',
    '..BKKWWKKKKKBS..',
    '..BKKWWWKKKKBS..',
    '..BKKWWKKKKKBS..',
    '..BKKWKKKKKKBS..',
    '..BKKKKKKKKKBS..',
    '..BBBBBBBBBBBS..',
    '..BBKBBBBBBWBS..',
    '..BKKKBBBBBBBS..',
    '..BBKBBBBWBBBS..',
    '..BBBBBBBBBBBS..',
    '..BBBBBBBBBBS...',
    '...SSSSSSSSS....',
];
const N = GRID.length;

// ─── SVG ─────────────────────────────────────────────────────────────────────

function svg(): string {
    // Merge horizontal runs of the same color into one <rect>.
    const rects: string[] = [];
    GRID.forEach((row, y) => {
        for (let x = 0; x < N;) {
            const c = row[x]!;
            let w = 1;
            while (x + w < N && row[x + w] === c) w++;
            if (c !== '.') rects.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${PALETTE[c]}"/>`);
            x += w;
        }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">\n${rects.join('\n')}\n</svg>\n`;
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(buf: Uint8Array): number {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
}

function rgba(hex: string): [number, number, number, number] {
    const v = parseInt(hex.slice(1), 16);
    return [v >> 16, (v >> 8) & 0xff, v & 0xff, 255];
}

/** Render the grid at `scale`x, centered on a `size`px canvas. */
function png(size: number, scale: number, bg?: string): Buffer {
    const offset = (size - N * scale) / 2;
    const fill = bg ? rgba(bg) : [0, 0, 0, 0];
    const raw = Buffer.alloc(size * (size * 4 + 1)); // 1 filter byte per row
    for (let y = 0; y < size; y++) {
        const gy = Math.floor((y - offset) / scale);
        for (let x = 0; x < size; x++) {
            const gx = Math.floor((x - offset) / scale);
            const c = GRID[gy]?.[gx] ?? '.';
            raw.set(c === '.' ? fill : rgba(PALETTE[c]!), y * (size * 4 + 1) + 1 + x * 4);
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', new Uint8Array(0)),
    ]);
}

// ─── ICO (PNG-encoded entries) ───────────────────────────────────────────────

function ico(images: { size: number; data: Buffer }[]): Buffer {
    const header = Buffer.alloc(6 + images.length * 16);
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({ size, data }, i) => {
        const e = 6 + i * 16;
        header.set([size, size, 0, 0], e);
        header.writeUInt16LE(1, e + 4);  // planes
        header.writeUInt16LE(32, e + 6); // bpp
        header.writeUInt32LE(data.length, e + 8);
        header.writeUInt32LE(offset, e + 12);
        offset += data.length;
    });
    return Buffer.concat([header, ...images.map((i) => i.data)]);
}

// ─── Write ───────────────────────────────────────────────────────────────────

const png16 = png(16, 1);
const png32 = png(32, 2);

await Bun.write('public/favicon.svg', svg());
await Bun.write('public/favicon-16.png', png16);
await Bun.write('public/favicon-32.png', png32);
await Bun.write('public/favicon.ico', ico([{ size: 16, data: png16 }, { size: 32, data: png32 }]));
await Bun.write('public/apple-touch-icon.png', png(180, 10, TILE_BG));

console.log('favicon set written to public/');
