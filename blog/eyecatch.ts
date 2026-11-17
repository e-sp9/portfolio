// ─────────────────────────────────────────────────────────────────────────────
// Eyecatch art — the picture a post gets when it has no eyecatch in microCMS.
// A marbled current in a quiet blue between ink and paper, with a warm vein or
// two, drawn in fine dots under a grain like that of film. No text.
//
// The post ID seeds everything, the grain included. The drawing keeps to
// integer hashes and to + − × ÷ √ and remainders on doubles, which come out
// the same on every machine (no sines or powers, whose last digits do not),
// so an ID always gives the same pixels.
// ─────────────────────────────────────────────────────────────────────────────

import { deflateSync } from 'node:zlib';

/** The size of the picture a shared link is shown with */
export const EYECATCH_WIDTH = 1200;
export const EYECATCH_HEIGHT = 630;

/** Side of one dot. It divides both sides, so the grid is a whole 400 × 210. */
const CELL = 3;
const COLS = EYECATCH_WIDTH / CELL;
const ROWS = EYECATCH_HEIGHT / CELL;

type RGB = readonly [number, number, number];

function rgb(hex: string): RGB {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 0xff, value & 0xff];
}

// ─── Palette ─────────────────────────────────────────────────────────────────

// The ground, from ink to paper. Both ends are the site's neutrals (paper is --bg, #f5f5f5).
// In between lies the hue of the accent tokens (--accent, #3b82f6) at about a third of
// its saturation: blue enough to be the site's, too quiet to fill the picture.
const GROUND = ['#0f1216', '#191f2a', '#28364d', '#3d5578', '#5f7a9f', '#93a5bd', '#c3cbd6', '#dfe2e6', '#eeeeee', '#f5f5f5'].map(rgb);
const PAPER = GROUND.length - 1;

// The accents: the warning and error tokens (#f59e0b, #ef4444), toned down.
// A picture has one of them, or both.
const ACCENTS = ['#e3a03a', '#dd6650'].map(rgb);

/** Share of the picture in accent colour that a composition aims for */
const ACCENT_SHARE = 0.04;
/** Share of the picture an accent has to cover before it counts as showing */
const SHOWS = 0.004;
/** How far the grain moves the brightness of a dot, either way, out of 255 */
const GRAIN = 18;

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

/** 32 bits that depend on a point of the grid and the seed alone */
function scatter(ix: number, iy: number, seed: number): number {
    let hash = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed;
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    return (hash ^ (hash >>> 16)) >>> 0;
}

// ─── Noise ───────────────────────────────────────────────────────────────────

const GRADIENT_X = [1, -1, 1, -1, 1, -1, 0, 0];
const GRADIENT_Y = [1, 1, -1, -1, 0, 0, 1, -1];

/** Pull of the gradient at lattice point (ix, iy) on a point (dx, dy) away from it */
function pull(ix: number, iy: number, dx: number, dy: number, seed: number): number {
    const direction = scatter(ix, iy, seed) & 7;
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

/** Two octaves only: the picture is calmer for its broad folds */
function folds(x: number, y: number, seed: number): number {
    return 0.5 * noise(x, y, seed) + 0.25 * noise(x * 2, y * 2, seed + 1013);
}

// ─── The marbling ────────────────────────────────────────────────────────────

/** One layer of the marbling. Layers follow one another across the current. */
interface Band {
    /** In band units; the current decides how many cells that is */
    width: number;
    /** Lightness on the leading edge and on the trailing one: 0 ink, 1 paper */
    hi: number;
    lo: number;
    /** Index of the accent that glows along the leading edge, -1 for none */
    hue: number;
    /** A hairline of paper on the leading edge */
    line: boolean;
}

interface Marbling {
    /** Band coordinate on the corners of the cells: (COLS + 1) × (ROWS + 1) values */
    flow: Float64Array;
    /** Light on the same corners, from about 0 (ink) to 1 (paper) */
    light: Float64Array;
    bands: Band[];
    /** Where each band starts along the sequence and, last, where the sequence ends */
    starts: number[];
    /** The picture's accents: one colour or two */
    hues: RGB[];
}

/** The current: where on the band sequence each point of the picture lies, and how lit it is. */
function current(seed: number, random: () => number): Pick<Marbling, 'flow' | 'light'> {
    // The ink runs along (1, slope); (nx, ny) points across it
    const slope = (random() * 2 - 1) * 0.75;
    const length = Math.sqrt(1 + slope * slope);
    const nx = -slope / length;
    const ny = 1 / length;
    const zoom = 0.6 + random() * 0.4;
    // Folds are drawn out along the current
    const stretch = 0.35 + random() * 0.3;
    const warp = 1.4 + random() * 1.6;
    // Bands across the picture where the ink runs straight, and how far the folds push them about
    const lanes = 2.8 + random() * 2.6;
    const push = 2.2 + random() * 2.8;
    const ox = random() * 64;
    const oy = random() * 64;
    // Mean light: some pictures are deep, some pale
    const exposure = 0.28 + random() * 0.36;

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
            // Light and shadow lie along the same folds, only broader. They are strong enough to
            // take much of the picture to paper or to ink, and leave the blue to what is in between.
            const lit = 2.3 * folds(fx * 0.6 + 3.1, fy * 0.6 + 7.7, seed ^ 0x4444);
            light[at] = lit;
            lightSum += lit;
        }
    }
    const mean = lightSum / size;
    return { flow, light: light.map((lit) => lit - mean + exposure) };
}

/**
 * A long run of bands: calm sheets, bundles of filaments, and plain layers in between.
 * Few of them carry an accent. `accents` is how many the picture has: one or two.
 */
function bandSequence(random: () => number, accents: number): Band[] {
    let plain = 0;
    // About one band in five, and never more than five in a row without
    const accent = (): number => {
        if (plain < 5 && random() >= 0.22) {
            plain++;
            return -1;
        }
        plain = 0;
        // The second accent, where there is one, is the rarer
        return accents > 1 && random() < 0.3 ? 1 : 0;
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
            bands.push({ width, hi, lo, hue: accent(), line: random() < 0.35 });
        } else if (kind < 0.55) {
            // A bundle of filaments, light and dark by turns, the light ones sharing an accent
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
            bands.push({ width, hi, lo, hue: accent(), line: random() < 0.25 });
        }
    }
    return bands;
}

/** What the marbling shows at one cell */
interface Dot {
    /** Index of the accent the cell is in, -1 when it is in none */
    accent: number;
    /** On a hairline of paper */
    line: boolean;
    /** Lightness of the ground: 0 ink, PAPER paper */
    level: number;
}

/**
 * Fills in `dot` for the cell (cx, cy), with the band sequence shifted by `phase`.
 * `chance` is the cell's own number in [0, 1): it settles where an accent thins out.
 */
function look({ flow, light, bands, starts }: Marbling, phase: number, cx: number, cy: number, chance: number, dot: Dot): void {
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
    const total = starts[bands.length]!;
    const u = ((((a + b + c + d) / 4 + phase) % total) + total) % total;
    let i = 0;
    while (starts[i + 1]! <= u) i++;
    const band = bands[i]!;
    const into = u - starts[i]!;
    // In cells: how wide the band is here, and how far this cell is from its leading edge
    const span = band.width / perCell;
    const fromEdge = into / perCell;

    // A band shades from its bright leading edge into shadow, like a sheet lying on the next.
    // Narrower than a few cells, that would flicker from cell to cell: it flattens to its mean.
    const detail = Math.max(0, Math.min(1, (span - 1.2) / 2.5));
    const shade = band.hi - (band.hi - band.lo) * (0.5 + (Math.sqrt(into / band.width) - 0.5) * detail);
    // The scale is stretched a step past its end, so the lightest tenth of it is plain paper
    dot.level = Math.max(0, Math.min(PAPER, (shade * 0.55 + lit * 0.65 - 0.1) * GROUND.length));

    // A hairline on the leading edge, where the band is wide enough (40px) to carry it
    dot.line = band.line && span > 40 / CELL && fromEdge < 1;
    dot.accent = -1;
    if (!dot.line && band.hue >= 0 && span > 1.5) {
        // The accent is solid along the edge and thins out over 90px at most, dot by dot:
        // a vein with a glow, never a field of colour
        const glow = 1 - fromEdge / Math.min(span * 0.85, 90 / CELL);
        if (fromEdge < 1.5 || (glow > 0 && glow * glow * 1.25 > chance + 0.1)) dot.accent = band.hue;
    }
}

/** The cell's own number in [0, 1) for `look`: the lower half of its 32 bits. The upper half is its grain. */
function chanceOf(bits: number): number {
    return (bits & 0xffff) / 65536;
}

/**
 * How well a shift of the band sequence suits the picture: first by how many of its accents
 * show, then by how near the accent colour comes to its share. Every third cell each way is
 * enough to tell.
 */
function score(marbling: Marbling, phase: number, seed: number): number {
    const shown = marbling.hues.map(() => 0);
    const dot: Dot = { accent: -1, line: false, level: 0 };
    let cells = 0;
    for (let cy = 0; cy < ROWS; cy += 3) {
        for (let cx = 0; cx < COLS; cx += 3) {
            look(marbling, phase, cx, cy, chanceOf(scatter(cx, cy, seed)), dot);
            if (dot.accent >= 0) shown[dot.accent]! += 1;
            cells++;
        }
    }
    const variety = shown.filter((count) => count >= SHOWS * cells).length;
    const share = shown.reduce((sum, count) => sum + count, 0) / cells;
    return variety - 4 * Math.abs(share - ACCENT_SHARE);
}

/** Colours the cells, with the band sequence shifted by `phase`, and lays the grain over them. */
function colour(marbling: Marbling, phase: number, seed: number): Uint8Array {
    const cells = new Uint8Array(COLS * ROWS * 3);
    const dot: Dot = { accent: -1, line: false, level: 0 };
    for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
            const bits = scatter(cx, cy, seed);
            look(marbling, phase, cx, cy, chanceOf(bits), dot);
            const flat = dot.line ? GROUND[PAPER]! : dot.accent >= 0 ? marbling.hues[dot.accent]! : null;
            // The ground is the scale read between its steps: no banding for the grain to sit on
            const step = Math.min(PAPER - 1, Math.floor(dot.level));
            const lower = GROUND[step]!;
            const upper = GROUND[step + 1]!;
            // Grain: every dot is a little lighter or darker than it would be, by chance.
            // Two draws added up, so that most dots are only a little off and a few are a lot.
            const grain = Math.round(((((bits >>> 16) & 0xff) + (bits >>> 24) - 255) * GRAIN) / 255);
            for (let channel = 0; channel < 3; channel++) {
                const tone = flat ? flat[channel]! : Math.round(lower[channel]! + (upper[channel]! - lower[channel]!) * (dot.level - step));
                cells[(cy * COLS + cx) * 3 + channel] = Math.max(0, Math.min(255, tone + grain));
            }
        }
    }
    return cells;
}

/** The picture for a post as RGB bytes, row by row. The same ID always gives the same pixels. */
export function paintEyecatch(id: string): Uint8Array {
    const seed = hashString(id);
    const random = sequence(seed);
    // Either accent can be the main one, and about half the pictures have the other as well
    const ordered = random() < 0.5 ? ACCENTS : [...ACCENTS].reverse();
    const hues = random() < 0.55 ? ordered : ordered.slice(0, 1);
    const field = current(seed, random);
    const bands = bandSequence(random, hues.length);
    const starts = [0];
    for (const band of bands) starts.push(starts[starts.length - 1]! + band.width);
    const marbling: Marbling = { ...field, bands, starts, hues };

    // The band sequence can be shifted anywhere along the current. Of eight shifts the
    // best-scoring one is kept, so every post gets its vein of colour and none drowns in it.
    const total = starts[bands.length]!;
    let phase = random() * total;
    let best = score(marbling, phase, seed);
    for (let i = 1; i < 8; i++) {
        const other = random() * total;
        const points = score(marbling, other, seed);
        if (points > best) [phase, best] = [other, points];
    }
    const cells = colour(marbling, phase, seed);

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
    // Every row follows a filter byte. The grain leaves deflate little to find, but a dot is
    // still several pixels each way: a row that repeats the one above is stored as filter 2 (Up)
    // and zeros, any other as filter 1 (Sub), the difference of each pixel from the one before.
    const rows = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) {
        const row = pixels.subarray(y * stride, (y + 1) * stride);
        const at = y * (stride + 1);
        if (y > 0 && Buffer.compare(row, pixels.subarray((y - 1) * stride, y * stride)) === 0) {
            rows[at] = 2;
            continue;
        }
        rows[at] = 1;
        for (let i = 0; i < stride; i++) rows[at + 1 + i] = row[i]! - (i < 3 ? 0 : row[i - 3]!);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(rows)),
        chunk('IEND', new Uint8Array(0)),
    ]);
}

/** The picture for a post as a PNG file. */
export function eyecatchPng(id: string): Uint8Array<ArrayBuffer> {
    return encodePng(paintEyecatch(id), EYECATCH_WIDTH, EYECATCH_HEIGHT);
}
