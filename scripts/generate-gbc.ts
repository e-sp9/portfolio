/**
 * Generate a faithful Game Boy Color (CGB-001) 3D model (.glb).
 *
 * Geometry is built with three.js math (no DOM), exported via @gltf-transform.
 * Proportions measured from reference photography of the real hardware
 * (straight-on front and back shots, the main board for side/bottom ports):
 *   body 78 x 133.5 x 27.4 mm  ->  1.0 x 1.712 x 0.351 world units (1 unit = 78 mm).
 *
 * The portfolio viewer (main.ts) replaces the materials and draws
 * EdgesGeometry lines with an 8-degree threshold, so:
 *   - smooth surfaces keep facet angles < 8 deg (no stray lines),
 *   - deliberate feature edges (caps, rims, recesses, steps) read as crisp outlines,
 *   - each glTF material names its finish in extras.role (see MATERIALS), and
 *     the viewer picks the surface by that role (model-materials.ts).
 *
 * Run: bun scripts/generate-gbc.ts
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  arcOutline, box, buttonGeometry, disc, dpadGeometry, exportGLB, fanCap, flatCap, indexedGeometry, mergedAt,
  plate, polygon, qToLeft, qToTop, qX90, qY180, recess, recessWall, rimRings, roundedRect, shellGeometry, srgb,
  sweepSide, type MaterialDefs, type Outline, type Part, type Ring,
} from './model-geometry';

// ─── Dimensions (world units, 1 unit = 78 mm) ────────────────────────────────

const W = 1.0;
const H = 1.712;
const D = 0.351;
const HW = W / 2;               // 0.5
const HH = H / 2;               // 0.856
const HD = D / 2;               // 0.1755
const FZ = HD;                  // front face z
const BZ = -HD;                 // back face z (battery / cartridge hump)
const SEAM_Z = 0.03;            // shell parting line, slightly front of middle

// The back is 2.5 mm thinner above the hump, where the cartridge shows.
const STEP_Y = HH - 0.150 * H;  // hump's top edge
const STRIP_Z = BZ + 0.032;     // back face of the strip above it

/** y coordinate from "fraction of body height measured from the top edge" */
const yTop = (frac: number) => HH - frac * H;

// ─── Outlines ────────────────────────────────────────────────────────────────

/**
 * Rounded rectangle whose bottom edge is a shallow arc of radius `arcR`
 * (lowest at x = 0), blended into the straight sides by `fillet` corners.
 * The GBC body and its screen lens both have this "smile" at the bottom.
 */
function archedOutline(w: number, top: number, bottom: number, topR: number, fillet: number, arcR: number): Outline {
  const hw = w / 2, P = Math.PI;
  const acy = bottom + arcR;
  const fx = hw - fillet;
  const fy = acy - Math.sqrt((arcR - fillet) ** 2 - fx * fx);
  const t = Math.atan2(fy - acy, fx); // where the fillet touches the arc, just right of -90 deg
  return arcOutline([
    { cx: 0, cy: acy, r: arcR, a0: -P - t, a1: t },
    { cx: fx, cy: fy, r: fillet, a0: t, a1: 0 },
    { cx: hw - topR, cy: top - topR, r: topR, a0: 0, a1: P / 2 },
    { cx: -hw + topR, cy: top - topR, r: topR, a0: P / 2, a1: P },
    { cx: -fx, cy: fy, r: fillet, a0: P, a1: P - t },
  ]);
}

// ─── Mesh builders ───────────────────────────────────────────────────────────

interface BackShell {
  zSeam: number; zHigh: number; zLow: number; yStep: number; rimR: number; rimSteps: number;
  /** Cartridge slot behind the strip: open to the back and the top above yStep. */
  slot: { halfW: number; depth: number };
  /** Openings in the strip's and the hump's back faces (recess rims, the battery cover). */
  stripHoles: Outline[]; humpHoles: Outline[];
}

/**
 * Back shell whose upper strip (y > yStep) is thinner than the hump below.
 * Both chains share the outline and the wall up to the strip's rim; the step
 * between them is one planar face, so only the step and the parting line
 * draw edges. The cartridge slot cuts the strip's back face, the top rim and
 * the top face; its walls are a separate part that meets these cut edges.
 */
function steppedBackShell(outline: Outline, o: BackShell): THREE.BufferGeometry {
  const { zSeam, zHigh, zLow, yStep, rimR, rimSteps, slot } = o;
  // Split both straight sides at yStep, and the top edge where the slot cuts it.
  const split: Outline = inset => {
    const pts = outline(inset);
    return pts.flatMap((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      if ((p.y - yStep) * (q.y - yStep) < 0 && Math.abs(p.x - q.x) < 1e-9) return [p, new THREE.Vector2(p.x, yStep)];
      if (p.x > slot.halfW && q.x < -slot.halfW && Math.abs(p.y - q.y) < 1e-9) {
        return [p, new THREE.Vector2(slot.halfW, p.y), new THREE.Vector2(-slot.halfW, p.y)];
      }
      return [p];
    });
  };
  const base = split(0);
  const n = base.length;
  const iR = base.findIndex(p => p.y === yStep && p.x > 0);
  const iL = base.findIndex(p => p.y === yStep && p.x < 0);
  const upper = Array.from({ length: iL - iR + 1 }, (_, k) => iR + k);
  const lower = Array.from({ length: n - iL + iR + 1 }, (_, k) => (iL + k) % n);
  const kSlot = upper.indexOf(base.findIndex(p => p.x === slot.halfW)); // top edge across the slot

  // The extra wall ring at the slot's front face lets the top face stop there.
  const [r0, ...upperRim] = rimRings(zSeam, zHigh, rimR, rimSteps);
  const atSlot: Ring = { inset: 0, z: zHigh + slot.depth, blend: 0 };
  const ringsU = [r0!, atSlot, ...upperRim];
  const ringsL = [r0!, atSlot, upperRim[0]!, ...rimRings(zSeam, zLow, rimR, rimSteps).slice(1)];
  const at = (ring: Ring, i: number) => { const p = split(ring.inset)[i]!; return new THREE.Vector2(p.x, ring.z); };

  const innerU = split(ringsU[ringsU.length - 1]!.inset);
  const innerL = split(ringsL[ringsL.length - 1]!.inset);
  const stepProfile = [
    ...ringsU.slice(2).map(r => at(r, iR)),
    new THREE.Vector2(slot.halfW, zHigh), new THREE.Vector2(-slot.halfW, zHigh),
    ...ringsU.slice(2).reverse().map(r => at(r, iL)),
    ...ringsL.slice(3).map(r => at(r, iL)),
    ...ringsL.slice(3).reverse().map(r => at(r, iR)),
  ];

  // The slot splits the strip's back face into a left and a right piece.
  const right = [...upper.slice(0, kSlot + 1).map(i => innerU[i]!), new THREE.Vector2(slot.halfW, yStep)];
  const left = [...upper.slice(kSlot + 1).map(i => innerU[i]!), new THREE.Vector2(-slot.halfW, yStep)];
  const stripHoles = o.stripHoles.map(h => h(0));
  const side = (sign: number) => stripHoles.filter(h => Math.sign(h[0]!.x) === sign);

  return mergeGeometries([
    sweepSide(split, ringsU, -1, upper, (i, r) => i === kSlot && r >= 1),
    sweepSide(split, ringsL, -1, lower),
    fanCap(base, zSeam, 1),
    flatCap(right, zHigh, -1, side(1)),
    flatCap(left, zHigh, -1, side(-1)),
    flatCap(lower.map(i => innerL[i]!), zLow, -1, o.humpHoles.map(h => h(0))),
    polygon(stepProfile, p => new THREE.Vector3(p.x, yStep, p.y), new THREE.Vector3(0, 1, 0)),
  ], false)!;
}

// ─── Part registry ───────────────────────────────────────────────────────────

const parts: Part[] = [];

function add(
  name: string, geometry: THREE.BufferGeometry, material: string,
  position?: [number, number, number], rotation?: THREE.Quaternion,
) {
  parts.push({ name, geometry, material, position, rotation });
}

// ─── Parts (positions measured from reference photos, front view fractions) ──

/** Body outline: small top corners, a 140 mm arc along the bottom, 9.5 mm fillets. */
const bodyOutline = archedOutline(W, HH, -HH, 0.052, 0.122, 1.795);

/** y of the arched bottom edge at x. */
const bottomY = (x: number) => -HH + 1.795 - Math.sqrt(1.795 ** 2 - x * x);

function buildParts() {
  // Controls, measured on a straight-on front photo.
  const dpadX = -0.286, dpadY = yTop(0.665);
  const aPos: [number, number] = [0.350, yTop(0.6505)];
  const bPos: [number, number] = [0.1725, yTop(0.682)];
  const ssY = yTop(0.829), ssX = 0.0724;

  // Lens: black print 67 x 60.5 mm, its bottom edge a 225 mm arc. It sits
  // 0.3 mm below the face in a pocket 1.2 mm larger all round.
  const lens = archedOutline(0.860, yTop(0.053), yTop(0.5065), 0.038, 0.035, 2.885);
  const POCKET = 0.016, LENS_TOP = FZ - 0.004;
  const pocket: Outline = inset => lens(inset - 0.015);

  // ── Body shells — parting seam ring shows as the case split line ──
  // The front face is cut open at every recess and joins its walls. The
  // floors are separate meshes below, so each keeps its glass tier.
  const DPAD_WELL = 0.010, BTN_WELL = 0.008;
  const dpadWell = roundedRect(0.316, 0.316, 0.158, dpadX, dpadY);
  const btnWell = (p: [number, number]) => roundedRect(0.142, 0.142, 0.071, p[0], p[1]);
  const ssWell = (x: number) => roundedRect(0.141, 0.082, 0.041, x, ssY);
  const frontRecesses: [Outline, number, number][] = [ // outline, depth, slope
    [pocket, POCKET, 0.002],
    [dpadWell, DPAD_WELL, 0.012],
    [btnWell(aPos), BTN_WELL, 0.007],
    [btnWell(bPos), BTN_WELL, 0.007],
    [ssWell(-ssX), BTN_WELL, 0.005],
    [ssWell(ssX), BTN_WELL, 0.005],
  ];
  add('body_front', mergeGeometries([
    shellGeometry(bodyOutline, SEAM_Z, FZ, 0.030, 13, frontRecesses.map(([o]) => o)),
    ...frontRecesses.map(([o, depth, slope]) => recessWall(o, FZ, depth, slope)),
  ], false)!, 'body');

  // Back shell, inset slightly so the seam reads as a groove. Its faces are
  // cut open at the cartridge slot, the screw counterbores, the label recess
  // and the battery cover. Counterbores drop to one common depth: shallow on
  // the strip, deep in the hump.
  const backOutline: Outline = inset => bodyOutline(inset + 0.0045);
  const SLOT = { halfW: 0.368, depth: 0.105 };
  const SCREW_Z = BZ + 0.038;
  const screwsTop: [number, number][] = [[-0.404, yTop(0.105)], [0.404, yTop(0.105)]];
  const screwsMid: [number, number][] = [[-0.415, yTop(0.418)], [0.415, yTop(0.418)]];
  const boreTop = screwsTop.map(([x, y]) => roundedRect(0.06, 0.06, 0.03, x, y));
  const boreMid = screwsMid.map(([x, y]) => roundedRect(0.052, 0.052, 0.026, x, y));
  const label = roundedRect(0.70, 0.32, 0.015, 0, yTop(0.4075));

  // The cover's latch tab is part of its outline (one line, not a second part
  // that would show through the glass on top of SELECT / START). Crisp plate,
  // so the outline is only ever taken at inset 0.
  const covH = 0.555, covCY = yTop(0.525) - covH / 2, covBottom = covCY - covH / 2;
  const coverRect = roundedRect(0.82, covH, { tl: 0.035, tr: 0.035, bl: 0.075, br: 0.075 }, 0, covCY);
  const tab = [[-0.05, covBottom], [-0.05, covBottom - 0.03], [0.05, covBottom - 0.03], [0.05, covBottom]];
  const cover: Outline = () => [...coverRect(0), ...tab.map(([x, y]) => new THREE.Vector2(x!, y!))];

  add('body_back', mergeGeometries([
    steppedBackShell(backOutline, {
      zSeam: SEAM_Z, zHigh: STRIP_Z, zLow: BZ, yStep: STEP_Y, rimR: 0.052, rimSteps: 13,
      slot: SLOT, stripHoles: boreTop, humpHoles: [...boreMid, label, cover],
    }),
    ...boreTop.map(o => recess(o, STRIP_Z, SCREW_Z - STRIP_Z, 0, 1)),
    ...boreMid.map(o => recess(o, BZ, SCREW_Z - BZ, 0, 1)),
    recessWall(label, BZ, 0.003, 0.002, 1),
  ], false)!, 'bodyDark');

  // ── Screen area ──
  add('screen_bezel', plate(inset => pocket(inset + 0.002), FZ - POCKET, 0.001), 'body'); // pocket floor
  add('screen', shellGeometry(lens, FZ - POCKET, LENS_TOP, 0), 'screen');

  // LCD window: 44 x 40 mm
  add('lcd', plate(roundedRect(0.564, 0.513, 0.008, 0, yTop(0.102) - 0.2565), LENS_TOP + 0.0035, 0.0035), 'lcd');

  // "GAME BOY COLOR" logo strip on the lens
  add('logo_strip', plate(roundedRect(0.48, 0.050, 0.010, 0, yTop(0.4515)), LENS_TOP + 0.002, 0.002), 'label');

  // Power LED, upper-left inside the lens
  add('power_led', new THREE.CylinderGeometry(0.0095, 0.0095, 0.003, 48), 'led',
    [-0.402, yTop(0.192), LENS_TOP + 0.0015], qX90);

  // ── D-pad (19 mm cross in a 25 mm well) ──
  add('dpad_well', disc(0.146, 64), 'inset', [dpadX, dpadY, FZ - DPAD_WELL]);
  const S = 0.1205, T = 0.0405, DPAD_H = 0.036;
  add('dpad', dpadGeometry(S, T, DPAD_H, 0.005, 0.023, 0.003), 'dark', [dpadX, dpadY, FZ - DPAD_WELL]);
  add('dpad_marks', dpadArrows(S, T, DPAD_H - 0.0022), 'dark', [dpadX, dpadY, FZ - DPAD_WELL]);

  // ── A / B buttons (8.5 mm domes on a line rising ~17 deg) ──
  const btnGeo = buttonGeometry(0.0545, 0.028, 0.006);
  add('button_a', btnGeo, 'dark', [aPos[0], aPos[1], FZ - BTN_WELL], qX90);
  add('button_b', btnGeo.clone(), 'dark', [bPos[0], bPos[1], FZ - BTN_WELL], qX90);
  add('button_wells', mergedAt([
    { g: disc(0.064, 48), at: [aPos[0], aPos[1], FZ - BTN_WELL] },
    { g: disc(0.064, 48), at: [bPos[0], bPos[1], FZ - BTN_WELL] },
  ]), 'inset');

  // ── SELECT / START (rubber pills in side-by-side stadium wells) ──
  add('sel_start_wells', mergeGeometries([-ssX, ssX].map(x =>
    plate(inset => ssWell(x)(inset + 0.005), FZ - BTN_WELL, 0.003)), false)!, 'inset');
  const pillGeo = shellGeometry(roundedRect(0.087, 0.0346, 0.0173), FZ - BTN_WELL, FZ + 0.014, 0.012, 12);
  add('select_pill', pillGeo, 'rubber', [-ssX, ssY, 0]);
  add('start_pill', pillGeo.clone(), 'rubber', [ssX, ssY, 0]);

  // ── Speaker: hex-packed hole cluster, bottom right ──
  const spX = 0.324, spY = yTop(0.876);
  const holes: { g: THREE.BufferGeometry; at: [number, number, number] }[] = [];
  const pitch = 0.030, rowH = pitch * Math.sqrt(3) / 2, R = 0.105;
  for (let j = -4; j <= 4; j++) {
    const off = (j % 2 !== 0) ? pitch / 2 : 0;
    for (let i = -4; i <= 4; i++) {
      const x = i * pitch + off, y = j * rowH;
      if (Math.hypot(x, y) <= R) {
        holes.push({ g: disc(0.0062, 12), at: [spX + x, spY + y, FZ + 0.0008] });
      }
    }
  }
  add('speaker_holes', mergedAt(holes), 'hole');

  // ── Side-wall grip ridges (5 short bars near the top, both sides) ──
  const ridges: { g: THREE.BufferGeometry; at: [number, number, number] }[] = [];
  for (let i = 0; i < 5; i++) {
    const y = yTop(0.175) + (i / 4) * (yTop(0.085) - yTop(0.175));
    ridges.push({ g: box(0.008, 0.013, 0.105), at: [-HW, y, 0.0875] });
    ridges.push({ g: box(0.008, 0.013, 0.105), at: [HW, y, 0.0875] });
  }
  add('grip_ridges', mergedAt(ridges), 'body');

  // ── Left side: EXT link port (raised bezel) + volume wheel ──
  const extY = yTop(0.235);
  add('ext_frame', plate(roundedRect(0.077, 0.128, 0.02), 0.006, 0.010), 'bodyDark', [-HW, extY, 0], qToLeft);
  add('ext_inner', plate(roundedRect(0.051, 0.103, 0.012), 0.004, 0.010), 'hole', [-HW, extY, 0], qToLeft);

  // Thumbwheel spins about Z; only its rim pokes through the slot.
  const volY = yTop(0.34);
  add('vol_slot', box(0.012, 0.128, 0.030), 'hole', [-0.499, volY, 0]);
  add('vol_wheel', new THREE.CylinderGeometry(0.083, 0.083, 0.018, 64), 'dark',
    [-0.422, volY, 0], qX90);

  // ── Right side: power slide switch ──
  const powY = yTop(0.28);
  add('power_slot', box(0.012, 0.128, 0.026), 'hole', [0.499, powY, 0]);
  add('power_nub', box(0.016, 0.052, 0.020), 'dark', [0.504, powY, 0]);

  // ── Top edge: empty cartridge slot (open to the back above the hump) + IR window ──
  // The slot runs down to the cartridge connector at the bottom of the cartridge.
  const SLOT_BOTTOM = yTop(0.46);
  add('cart_slot', cartSlot(SLOT.halfW, SLOT.depth, SLOT_BOTTOM), 'inset');
  add('cart_slit', box(0.72, 0.012, 0.097), 'hole', [0, SLOT_BOTTOM + 0.006, STRIP_Z + 0.0515]);
  add('ir_window', plate(roundedRect(0.165, 0.08, 0.012), 0.003, 0.007), 'ir', [-0.283, HH, 0.075], qToTop);

  // ── Bottom edge: headphone jack (right of center) and DC input (left) ──
  const jacks: [number, number, number][] = [[0.077, 0.045, 0.028], [-0.064, 0.030, 0.017]];
  add('phone_ring', mergedAt(jacks.map(([x, r]) => ({
    g: new THREE.CylinderGeometry(r, r, 0.006, 48), at: [x, bottomY(x) + 0.0005, -0.01] as [number, number, number],
  }))), 'body');
  add('phone_hole', mergedAt(jacks.map(([x, , r]) => ({
    g: new THREE.CylinderGeometry(r, r, 0.002, 48), at: [x, bottomY(x) - 0.0025, -0.01] as [number, number, number],
  }))), 'hole');

  // ── Back: label recess floor, battery cover, screw heads on the counterbore floors ──
  add('back_label', plate(inset => label(inset + 0.002), BZ + 0.003, 0.003, -1), 'shade');
  add('battery_cover', plate(cover, BZ - 0.002, 0.006, -1), 'bodyDark');

  add('screws', mergedAt([...screwsTop, ...screwsMid].map(([x, y]) =>
    ({ g: disc(0.020, 24), at: [x, y, SCREW_Z - 0.0005] as [number, number, number], rot: qY180 }))), 'hole');

  // ── Embossed Nintendo stadium outline on the front shell ──
  const ringOuter = roundedRect(0.273, 0.0565, 0.02825, 0, 0);
  const ringShape = new THREE.Shape(ringOuter(0));
  ringShape.holes.push(new THREE.Path(ringOuter(0.006).reverse()));
  add('nintendo_ring', new THREE.ExtrudeGeometry(ringShape, { depth: 0.0022, bevelEnabled: false }),
    'emboss', [0, yTop(0.561), FZ]);
}

/** Arrow marks near each arm tip, all on one plane just above the sloped arms. */
function dpadArrows(S: number, T: number, z: number): THREE.BufferGeometry {
  const near = T + (S - T) * 0.5, far = T + (S - T) * 0.72, half = 0.0115;
  const tri = [[near, -half], [far, 0], [near, half]] as const;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  ([[1, 0], [0, 1], [-1, 0], [0, -1]] as const).forEach(([ux, uy], k) => {
    for (const [u, v] of tri) { positions.push(ux * u - uy * v, uy * u + ux * v, z); normals.push(0, 0, 1); }
    indices.push(k * 3, k * 3 + 1, k * 3 + 2);
  });
  return indexedGeometry(positions, normals, indices);
}

/**
 * The empty cartridge slot: side walls, front wall, the back wall inside the
 * hump and the floor at the connector. Above the hump it is open to the back
 * and the top; those open edges meet the cuts in the back shell, and the side
 * walls follow the shell's top rim.
 */
function cartSlot(halfW: number, depth: number, yBottom: number): THREE.BufferGeometry {
  const yT = HH - 0.0045, r = 0.052, zB = STRIP_Z, zF = STRIP_Z + depth;
  const side: THREE.Vector2[] = [ // (z, y)
    new THREE.Vector2(zB, yBottom), new THREE.Vector2(zF, yBottom), new THREE.Vector2(zF, yT),
  ];
  for (let i = 0; i <= 13; i++) {
    const a = (i / 13) * (Math.PI / 2);
    side.push(new THREE.Vector2(zB + r * (1 - Math.sin(a)), yT - r * (1 - Math.cos(a))));
  }
  side.push(new THREE.Vector2(zB, STEP_Y)); // where the back wall inside the hump begins
  const rect = (pts: number[][]) => pts.map(([a, b]) => new THREE.Vector2(a!, b!));
  return mergeGeometries([
    polygon(side, p => new THREE.Vector3(-halfW, p.y, p.x), new THREE.Vector3(1, 0, 0)),
    polygon(side, p => new THREE.Vector3(halfW, p.y, p.x), new THREE.Vector3(-1, 0, 0)),
    polygon(rect([[-halfW, yBottom], [halfW, yBottom], [halfW, yT], [-halfW, yT]]),
      p => new THREE.Vector3(p.x, p.y, zF), new THREE.Vector3(0, 0, -1)),
    polygon(rect([[-halfW, yBottom], [halfW, yBottom], [halfW, STEP_Y], [-halfW, STEP_Y]]),
      p => new THREE.Vector3(p.x, p.y, zB), new THREE.Vector3(0, 0, 1)),
    polygon(rect([[-halfW, zB], [halfW, zB], [halfW, zF], [-halfW, zF]]),
      p => new THREE.Vector3(p.x, yBottom, p.y), new THREE.Vector3(0, 1, 0)),
  ], false)!;
}

// ─── Export ──────────────────────────────────────────────────────────────────

const MATERIALS: MaterialDefs = {
  body:     { color: srgb(0x7259ab), metallic: 0.05, roughness: 0.45, role: 'shell' }, // grape purple
  bodyDark: { color: srgb(0x63479a), metallic: 0.05, roughness: 0.50, role: 'shell' },
  shade:    { color: srgb(0x54387f), metallic: 0.05, roughness: 0.55, role: 'print' }, // back label
  screen:   { color: srgb(0x14141c), metallic: 0.05, roughness: 0.10, role: 'lens' },
  lcd:      { color: srgb(0x8a9490), metallic: 0.00, roughness: 0.35, role: 'lcd' },
  dark:     { color: srgb(0x232329), metallic: 0.05, roughness: 0.45, role: 'button' }, // d-pad, A/B, wheel, switch
  rubber:   { color: srgb(0x232329), metallic: 0.05, roughness: 0.45, role: 'rubber' }, // SELECT / START
  hole:     { color: srgb(0x232329), metallic: 0.05, roughness: 0.45, role: 'cavity' }, // holes, slots, screws
  inset:    { color: srgb(0x4a3d6b), metallic: 0.05, roughness: 0.55, role: 'shell' }, // wells
  label:    { color: srgb(0x8f95a3), metallic: 0.00, roughness: 0.40, role: 'print' },
  emboss:   { color: srgb(0x5a4488), metallic: 0.05, roughness: 0.50, role: 'shell' },
  led:      { color: srgb(0x8a1622), metallic: 0.00, roughness: 0.25, role: 'print' },
  ir:       { color: srgb(0x4a1018), metallic: 0.00, roughness: 0.15, role: 'lens' },
};

buildParts();
await exportGLB(parts, MATERIALS, 'GameBoyColor', './public/models/meshopt/gbc.glb');
