// ─────────────────────────────────────────────────────────────────────────────
// Eyecatch art — the picture a post gets when it has no eyecatch in microCMS.
// A marbled current in the site's blues, veined with accent colours, drawn on
// a coarse pixel grid and dithered like the CRT overlays. No text.
//
// The post ID seeds everything. The drawing keeps to integer hashes and to
// + − × ÷ √ and remainders on doubles, which come out the same on every
// machine (no sines or powers, whose last digits do not), so an ID always
// gives the same pixels.
// ─────────────────────────────────────────────────────────────────────────────

import { deflateSync } from 'node:zlib';

/** The size of the picture a shared link is shown with */
export const EYECATCH_WIDTH = 1200;
export const EYECATCH_HEIGHT = 630;

/** Side of one art pixel. It divides both sides, so the grid is a whole 120 × 63. */
const CELL = 10;
const COLS = EYECATCH_WIDTH / CELL;
const ROWS = EYECATCH_HEIGHT / CELL;

type RGB = readonly [number, number, number];

function rgb(hex: string): RGB {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 0xff, value & 0xff];
}

// ─── Palette ─────────────────────────────────────────────────────────────────

// From deep water to foam: the scale the accent tokens sit on
// (--accent #3b82f6, --accent-hover #2563eb, --accent in dark mode #60a5fa)
const BLUES = ['#172554', '#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#eff6ff'].map(rgb);
const FOAM = BLUES.length - 1;

// Accents: the step of each scale that the status tokens use in dark mode
// (#f87171, #fbbf24, #34d399). A picture takes two warm ones and two cool ones.
const WARM = ['#f472b6', '#f87171', '#fb923c', '#fbbf24'].map(rgb);
const COOL = ['#34d399', '#22d3ee', '#a78bfa'].map(rgb);
const WHITE: RGB = [255, 255, 255];

/** Share of the picture in accent colour that a composition aims for */
const ACCENT_SHARE = 0.12;
/** Cells a hue has to cover before it counts as showing: 0.4% of the picture */
const HUE_SHOWS = 30;

/** 4×4 Bayer matrix: the ordered dither of old consoles, as thresholds in (0, 1) */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);

// ─── Seeded randomness ───────────────────────────────────────────────────────

/** FNV-1a */
function hashString(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
    return hash >>> 0;
}

/** mulberry32: numbers in [0, 1) that depend on the seed alone */
function sequence(seed: number): () => number {
    let state = seed | 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const list = [...items];
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j]!, list[i]!];
    }
    return list;
}

// ─── Noise ───────────────────────────────────────────────────────────────────

const GRADIENT_X = [1, -1, 1, -1, 1, -1, 0, 0];
const GRADIENT_Y = [1, 1, -1, -1, 0, 0, 1, -1];

/** Pull of the gradient at lattice point (ix, iy) on a point (dx, dy) away from it */
function pull(ix: number, iy: number, dx: number, dy: number, seed: number): number {
    let hash = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed;
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    const direction = (hash ^ (hash >>> 16)) & 7;
    return GRADIENT_X[direction]! * dx + GRADIENT_Y[direction]! * dy;
}

/** Gradient noise, about -1 to 1 */
function noise(x: number, y: number, seed: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const dx = x - ix;
    const dy = y - iy;
    const sx = dx * dx * dx * (dx * (dx * 6 - 15) + 10);
    const sy = dy * dy * dy * (dy * (dy * 6 - 15) + 10);
    const a = pull(ix, iy, dx, dy, seed);
    const b = pull(ix + 1, iy, dx - 1, dy, seed);
    const c = pull(ix, iy + 1, dx, dy - 1, seed);
    const d = pull(ix + 1, iy + 1, dx - 1, dy - 1, seed);
    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;
    return top + (bottom - top) * sy;
}

/** Two octaves only: finer folds would be lost on the grid */
function folds(x: number, y: number, seed: number): number {
    return 0.5 * noise(x, y, seed) + 0.25 * noise(x * 2, y * 2, seed + 1013);
}

// ─── The marbling ────────────────────────────────────────────────────────────

/** One layer of the marbling. Layers follow one another across the current. */
interface Band {
    /** In band units; the current decides how many cells that is */
    width: number;
    /** Lightness on the leading edge and on the trailing one: 0 deep water, 1 foam */
    hi: number;
    lo: number;
    /** Index of the accent hue that glows along the leading edge, -1 for none */
    hue: number;
    /** A line of light on the leading edge */
    line: boolean;
}

interface Marbling {
    /** Band coordinate on the corners of the cells: (COLS + 1) × (ROWS + 1) values */
    flow: Float64Array;
    /** Light on the same corners, from about 0 (deep water) to 1 (foam) */
    light: Float64Array;
    bands: Band[];
    /** Where each band starts along the sequence and, last, where the sequence ends */
    starts: number[];
    /** The picture's four accent colours */
    hues: RGB[];
}

/** The current: where on the band sequence each point of the picture lies, and how lit it is. */
function current(seed: number, random: () => number): Pick<Marbling, 'flow' | 'light'> {
    // The water runs along (1, slope); (nx, ny) points across it
    const slope = (random() * 2 - 1) * 0.75;
    const length = Math.sqrt(1 + slope * slope);
    const nx = -slope / length;
    const ny = 1 / length;
    const zoom = 0.6 + random() * 0.4;
    // Folds are drawn out along the current
    const stretch = 0.35 + random() * 0.3;
    const warp = 1.4 + random() * 1.6;
    // Bands across the picture where the water runs straight, and how far the folds push them about
    const lanes = 3.4 + random() * 3.4;
    const push = 2.6 + random() * 3.2;
    const ox = random() * 64;
    const oy = random() * 64;
    // Mean light: some pictures are deep, some pale, none washed out
    const exposure = 0.2 + random() * 0.42;

    const size = (COLS + 1) * (ROWS + 1);
    const flow = new Float64Array(size);
    const light = new Float64Array(size);
    let lightSum = 0;
    for (let gy = 0; gy <= ROWS; gy++) {
        for (let gx = 0; gx <= COLS; gx++) {
            // The picture is 1 high
            const px = gx / ROWS;
            const py = gy / ROWS;
            const across = px * nx + py * ny;
            const x = (px * ny - py * nx) * stretch * zoom + ox;
            const y = across * zoom + oy;
            // Noise read through a copy of itself: this is what folds the layers over
            const fx = x + warp * folds(x, y, seed ^ 0x1111);
            const fy = y + warp * folds(x + 5.2, y + 1.3, seed ^ 0x2222);
            const at = gy * (COLS + 1) + gx;
            flow[at] = across * lanes + push * folds(fx, fy, seed ^ 0x3333);
            // Light and shadow lie along the same folds, only broader
            const lit = 1.7 * folds(fx * 0.6 + 3.1, fy * 0.6 + 7.7, seed ^ 0x4444);
            light[at] = lit;
            lightSum += lit;
        }
    }
    const mean = lightSum / size;
    return { flow, light: light.map((lit) => lit - mean + exposure) };
}

/** A long run of bands: calm sheets, bundles of filaments, and plain layers in between. */
function bandSequence(random: () => number): Band[] {
    // The picture's four hues take turns; the first two carry most of it
    const TURNS = [0, 1, 0, 2, 1, 0, 3, 1, 2];
    let turn = Math.floor(random() * TURNS.length);
    let plain = 0;
    // Never more than two bands in a row without an accent
    const accent = (): number => {
        if (plain < 2 && random() >= 0.45) {
            plain++;
            return -1;
        }
        plain = 0;
        return TURNS[turn++ % TURNS.length]!;
    };

    // Far more bands than one picture crosses, so it never sees the sequence repeat
    const bands: Band[] = [];
    while (bands.length < 48) {
        const kind = random();
        if (kind < 0.3) {
            // A calm sheet
            const hi = 0.45 + random() * 0.55;
            const lo = hi - 0.25 - random() * 0.2;
            const width = 1.2 + random() * 1.4;
            bands.push({ width, hi, lo, hue: accent(), line: random() < 0.8 });
        } else if (kind < 0.55) {
            // A bundle of filaments, light and dark by turns, the light ones sharing a hue
            const hue = accent();
            const count = 3 + Math.floor(random() * 3);
            for (let i = 0; i < count; i++) {
                const hi = i % 2 ? 0.2 + random() * 0.3 : 0.6 + random() * 0.4;
                bands.push({ width: 0.2 + random() * 0.2, hi, lo: hi - 0.1, hue: i % 2 ? -1 : hue, line: false });
            }
        } else {
            const hi = 0.35 + random() * 0.65;
            const lo = hi - 0.3 - random() * 0.25;
            const width = 0.5 + random() * 0.6;
            bands.push({ width, hi, lo, hue: accent(), line: random() < 0.6 });
        }
    }
    return bands;
}

/**
 * Colours the cells with the band sequence shifted by `phase`, and scores the result:
 * first by how many hues show (three is plenty), then by how near the accent colour
 * comes to its share of the picture.
 */
function compose({ flow, light, bands, starts, hues }: Marbling, phase: number): { cells: Uint8Array; score: number } {
    const total = starts[bands.length]!;
    const cells = new Uint8Array(COLS * ROWS * 3);
    const shown = hues.map(() => 0);
    for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
            // The corners of the cell give the band coordinate at its centre and how fast it changes
            const at = cy * (COLS + 1) + cx;
            const a = flow[at]!;
            const b = flow[at + 1]!;
            const c = flow[at + COLS + 1]!;
            const d = flow[at + COLS + 2]!;
            const dx = (b + d - a - c) / 2;
            const dy = (c + d - a - b) / 2;
            const perCell = Math.sqrt(dx * dx + dy * dy) + 1e-9;
            const lit = (light[at]! + light[at + 1]! + light[at + COLS + 1]! + light[at + COLS + 2]!) / 4;

            // Wrapped into [0, total), also when the sum is negative
            const u = ((((a + b + c + d) / 4 + phase) % total) + total) % total;
            let i = 0;
            while (starts[i + 1]! <= u) i++;
            const band = bands[i]!;
            const into = u - starts[i]!;
            // In cells: how wide the band is here, and how far this cell is from its leading edge
            const span = band.width / perCell;
            const fromEdge = into / perCell;
            const threshold = BAYER[(cy & 3) * 4 + (cx & 3)]!;

            // A band shades from its bright leading edge into shadow, like a sheet lying on the next.
            // Narrower than a few cells, that would flicker from cell to cell: it flattens to its mean.
            const detail = Math.max(0, Math.min(1, (span - 1.2) / 2.5));
            const shade = band.hi - (band.hi - band.lo) * (0.5 + (Math.sqrt(into / band.width) - 0.5) * detail);
            const level = Math.max(0, Math.min(FOAM, (shade * 0.55 + lit * 0.65 - 0.1) * FOAM));
            const step = Math.floor(level);
            let colour = BLUES[step < FOAM && level - step > threshold ? step + 1 : step]!;

            if (band.line && span > 4 && fromEdge < 1) {
                // A line of light on the leading edge, where the band is wide enough to carry it
                colour = WHITE;
            } else if (band.hue >= 0 && span > 1.5) {
                // The accent is solid in the first cell and dithers away over nine at most:
                // a vein with a glow, never a field of colour
                const glow = 1 - fromEdge / Math.min(span * 0.85, 9);
                if (fromEdge < 1 || (glow > 0 && glow * glow * 1.25 > threshold + 0.1)) {
                    colour = hues[band.hue]!;
                    shown[band.hue]! += 1;
                }
            }
            cells.set(colour, (cy * COLS + cx) * 3);
        }
    }

    const variety = Math.min(3, shown.filter((count) => count >= HUE_SHOWS).length);
    const share = shown.reduce((sum, count) => sum + count, 0) / (COLS * ROWS);
    return { cells, score: variety - 4 * Math.abs(share - ACCENT_SHARE) };
}

/** A few sparks on the deep water: single cells, and the plus that pixel art uses for a glint. */
function twinkle(cells: Uint8Array, random: () => number): void {
    const spark = (cx: number, cy: number) => cells.set(WHITE, (cy * COLS + cx) * 3);
    // #2563eb or deeper
    const deep = (cx: number, cy: number) => {
        const at = (cy * COLS + cx) * 3;
        return cells[at]! + cells[at + 1]! + cells[at + 2]! <= 380;
    };
    let sparks = 5 + Math.floor(random() * 5);
    // A pale picture has little deep water: the tries run out and it gets fewer sparks, or none
    for (let tries = 0; sparks > 0 && tries < 400; tries++) {
        const cx = 2 + Math.floor(random() * (COLS - 4));
        const cy = 2 + Math.floor(random() * (ROWS - 4));
        const plus = random() < 0.45;
        // Only on open water, clear of the lines, the veins and the other sparks
        if (!(deep(cx, cy) && deep(cx - 1, cy) && deep(cx + 1, cy) && deep(cx, cy - 1) && deep(cx, cy + 1))) continue;
        spark(cx, cy);
        if (plus) {
            spark(cx - 1, cy);
            spark(cx + 1, cy);
            spark(cx, cy - 1);
            spark(cx, cy + 1);
        }
        sparks--;
    }
}

/** The picture for a post as RGB bytes, row by row. The same ID always gives the same pixels. */
export function paintEyecatch(id: string): Uint8Array {
    const seed = hashString(id);
    const random = sequence(seed);
    // Two warm accents and two cool ones, by turns; a warm one leads more often than not
    const warm = shuffled(WARM, random);
    const cool = shuffled(COOL, random);
    const hues = random() < 0.65 ? [warm[0]!, cool[0]!, warm[1]!, cool[1]!] : [cool[0]!, warm[0]!, cool[1]!, warm[1]!];
    const field = current(seed, random);
    const bands = bandSequence(random);
    const starts = [0];
    for (const band of bands) starts.push(starts[starts.length - 1]! + band.width);
    const marbling: Marbling = { ...field, bands, starts, hues };

    // The band sequence can be shifted anywhere along the current. Of eight shifts the
    // best-scoring one is kept, so every post gets its veins of colour and none drowns in them.
    const total = starts[bands.length]!;
    let best = compose(marbling, random() * total);
    for (let i = 1; i < 8; i++) {
        const other = compose(marbling, random() * total);
        if (other.score > best.score) best = other;
    }
    const cells = best.cells;
    twinkle(cells, random);

    const stride = EYECATCH_WIDTH * 3;
    const pixels = new Uint8Array(stride * EYECATCH_HEIGHT);
    for (let cy = 0; cy < ROWS; cy++) {
        const top = cy * CELL * stride;
        for (let x = 0; x < EYECATCH_WIDTH; x++) {
            const from = (cy * COLS + Math.floor(x / CELL)) * 3;
            pixels[top + x * 3] = cells[from]!;
            pixels[top + x * 3 + 1] = cells[from + 1]!;
            pixels[top + x * 3 + 2] = cells[from + 2]!;
        }
        // The other rows of the cell repeat the first
        for (let row = 1; row < CELL; row++) pixels.copyWithin(top + row * stride, top, top + stride);
    }
    return pixels;
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

function chunk(type: string, data: Uint8Array): Buffer {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(Bun.hash.crc32(body), body.length + 4);
    return out;
}

/** Encodes RGB bytes as an 8-bit truecolour PNG. */
function encodePng(pixels: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
    const stride = width * 3;
    // Every row follows a filter byte. A row that repeats the one above is stored as filter 2 (Up)
    // and zeros; on a grid of square cells that is most rows, and deflate folds them to nothing.
    const rows = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) {
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const repeats = y > 0 && Buffer.compare(row, pixels.subarray((y - 1) * stride, y * stride)) === 0;
        if (repeats) rows[y * (stride + 1)] = 2;
        else rows.set(row, y * (stride + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(rows, { level: 9 })),
        chunk('IEND', new Uint8Array(0)),
    ]);
}

/** The picture for a post as a PNG file. */
export function eyecatchPng(id: string): Uint8Array<ArrayBuffer> {
    return encodePng(paintEyecatch(id), EYECATCH_WIDTH, EYECATCH_HEIGHT);
}
