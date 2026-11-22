/**
 * Generate a faithful Nintendo DS (NTR-001, the original model) 3D model
 * (.glb), opened to about 150 degrees as it is held in play.
 *
 * Built like generate-gbasp.ts (three.js math, exported via @gltf-transform,
 * helpers shared in model-geometry.ts). Sources:
 *   - Nintendo's specifications: closed 148.7 x 84.7 x 28.9 mm, 275 g; two
 *     3-inch LCDs of 256 x 192 dots (61.4 x 46.1 mm).
 *   - Nintendo's DS instruction booklet, "Nintendo DS Components": POWER
 *     above the +Control Pad, MIC. below it, the recharge and power LEDs on
 *     the front strip, VOL. and the headphone / microphone jacks on the front
 *     edge with the Game Pak slot (SLOT-2), the DS Card slot (SLOT-1), the
 *     external extension connector, the wrist strap attachment, the stylus
 *     holder and L / R on the back, the battery cover underneath.
 *   - Photos of the hardware (Wikimedia Commons): a near top-down shot of the
 *     open console (controls, panels, speakers, bumpers, hinge), a front
 *     three-quarter shot, closed top, front, back and left side views (the
 *     halves' thicknesses, the lid's size, L / R, the ports), the bottom
 *     (battery cover, label, screws, feet).
 * The body is 144.7 x 82.4 mm; L / R stand 2 mm out of its back corners,
 * which makes the official 148.7 x 84.7 mm. The lid is narrower, 135 x 77 mm.
 *
 * Dimensions are in mm in the closed frame: x to the right, y from the front
 * edge toward the hinge, z up from the bottom. The lid is built opened flat
 * (180 deg, screen up, mirrored about the hinge axis) and folded back to
 * OPEN_DEG at export. The export stands the open console up facing +z
 * (STAND_DEG) and scales it to 1 unit = 148.7 mm. Every glTF material names
 * its finish in extras.role.
 *
 * Run: bun scripts/generate-ds.ts
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  arcOutline, buttonGeometry, circle, cutWall, disc, dpadGeometry, dpadOutline, drum, exportGLB, fanCap,
  fixedOutline, flatCap, knuckle, mergedAt, openShell, pit, plate, poseClamshell, qToFront, qToTop, qX90,
  qY180, qYtoX, recess, recessWall, rimRings, roundedRect, sharpRect, shellGeometry, shoulderBand, srgb, stadium, sweepSide,
  type Arc, type KnuckleProfile, type MaterialDefs, type Outline, type Part,
} from './model-geometry';

const P = Math.PI;

// ─── Dimensions (mm) ─────────────────────────────────────────────────────────

const HW = 72.35;               // half of the 144.7 mm body
const LEN = 82.4;               // front edge to the back face
const TOTAL_H = 28.9;           // closed thickness
const FZ = 19.5;                // lower half; its face is at z = FZ
const SEAM_Z = 10.5;            // lower half: bottom shell below, top shell above
const SEAM_INSET = 0.35;        // the bottom shell steps in at the parting line
const FACE_RIM = 3;             // rounded edge around the lower half's face
const BOTTOM_RIM = 2;
const BACK_R = 6;               // the body's back corners, under L / R

// Hinge: a 9 mm barrel across the middle of the back, as thick as the lid,
// flush with the back face and with the top of the closed console.
const LID_GAP = 0.4;
const BARREL_R = (TOTAL_H - FZ - LID_GAP) / 2;  // 4.5
const AXIS_Y = LEN - BARREL_R;                  // 77.9
const AXIS_Z = TOTAL_H - BARREL_R;              // 24.4
const HINGE: KnuckleProfile = {
  len: LEN, faceZ: FZ, faceRim: FACE_RIM, axisY: AXIS_Y, axisZ: AXIS_Z, barrelR: BARREL_R,
  footY: 77.2,                                 // just behind the touch screen's frame
};
const OPEN_DEG = 150;
// Display: the lower half leans back 7 deg like the GBA SP's; the lid then
// leans 23 deg toward the camera.
const STAND_DEG = 7;

// Lid, opened flat: mirrored about the axis, screen face up. Closed, its back
// edge stops 3.1 mm behind the axis; any further, its rounded outer edge would
// dig into the lower half's face on the way open.
const LID_HW = 67.5;                            // 135 mm wide
const LID_LEN = 77;
const LID_START = AXIS_Y - 3.1;                 // 74.8
const LID_TOP = LID_START + LID_LEN;            // 151.8
const LZ = TOTAL_H;                             // 28.9, screen face
const LID_BACK_Z = FZ + LID_GAP;                // 19.9, outer face
const LID_SEAM = LZ - 2.5;                      // a thin face plate on a deep back
const LID_RIM = 3;                              // rounded edge around the outer face
const NOTCH_HW = 31.9, NOTCH_D = 8;             // the barrel sits in a notch in the lid's hinge edge

/** y on the open lid, `v` mm down from its top edge */
const yLid = (v: number) => LID_TOP - v;

// ─── Outlines ────────────────────────────────────────────────────────────────

const bodyOutline = roundedRect(2 * HW, LEN, { tl: BACK_R, tr: BACK_R, bl: 7, br: 7 }, 0, LEN / 2);

const lidOutline = arcOutline([
  { cx: LID_HW - 3.5, cy: LID_START + 3.5, r: 3.5, a0: -P / 2, a1: 0 },
  { cx: LID_HW - 4.5, cy: LID_TOP - 4.5, r: 4.5, a0: 0, a1: P / 2 },
  { cx: -LID_HW + 4.5, cy: LID_TOP - 4.5, r: 4.5, a0: P / 2, a1: P },
  { cx: -LID_HW + 3.5, cy: LID_START + 3.5, r: 3.5, a0: P, a1: P * 1.5 },
  // Notch: sharp corners, the inner two turning inward.
  { cx: -NOTCH_HW, cy: LID_START, r: 0, a0: -P / 2, a1: 0 },
  { cx: -NOTCH_HW, cy: LID_START + NOTCH_D, r: 0, a0: 0, a1: -P / 2 },
  { cx: NOTCH_HW, cy: LID_START + NOTCH_D, r: 0, a0: -P / 2, a1: -P },
  { cx: NOTCH_HW, cy: LID_START, r: 0, a0: -P, a1: -P / 2 },
]);

/** Plus sign of half-span s and half-width t around (cx, cy): sharp corners, the inner four turning inward. */
function cross(s: number, t: number, cx: number, cy: number): Outline {
  const arm: [number, number, number, number][] = [[s, -t, -P / 2, 0], [s, t, 0, P / 2], [t, t, P / 2, 0]];
  return arcOutline([0, 1, 2, 3].flatMap(k => arm.map(([x, y, a0, a1]) => {
    const c = Math.cos(k * P / 2), sn = Math.sin(k * P / 2);
    return { cx: cx + x * c - y * sn, cy: cy + x * sn + y * c, r: 0, a0: a0 + k * P / 2, a1: a1 + k * P / 2 };
  })));
}

/**
 * The A / B / X / Y well: a round pocket of radius r around each button (d
 * from the center, at 0, 90, 180 and 270 deg), each joined to the next by a
 * concave fillet of radius rf.
 */
function clover(cx: number, cy: number, d: number, r: number, rf: number): Outline {
  const at = (dist: number, a: number) => new THREE.Vector2(cx + dist * Math.cos(a), cy + dist * Math.sin(a));
  const C = [0, 1, 2, 3].map(k => at(d, k * P / 2));
  // Fillet centers on the diagonals, r + rf from both neighbors.
  const e = (Math.SQRT2 * d + Math.sqrt(4 * (r + rf) ** 2 - 2 * d * d)) / 2;
  const F = [0, 1, 2, 3].map(k => at(e, k * P / 2 + P / 4));
  const ang = (from: THREE.Vector2, to: THREE.Vector2) => Math.atan2(to.y - from.y, to.x - from.x);
  const arcs: Arc[] = [];
  for (let k = 0; k < 4; k++) {
    const c = C[k]!, f = F[k]!;
    const a0 = ang(c, F[(k + 3) % 4]!);
    let a1 = ang(c, f);
    while (a1 <= a0) a1 += 2 * P;
    arcs.push({ cx: c.x, cy: c.y, r, a0, a1 });
    const b0 = ang(f, c);
    let b1 = ang(f, C[(k + 1) % 4]!);
    while (b1 >= b0) b1 -= 2 * P;
    arcs.push({ cx: f.x, cy: f.y, r: rf, a0: b0, a1: b1 });
  }
  return fixedOutline(arcs);
}

// ─── Mesh builders ───────────────────────────────────────────────────────────

/**
 * Well cut into a face at zTop: wall and floor (earcut, for outlines that are
 * not star-shaped). The floor leaves out `under`, the footprint of a part
 * that closes it there, so no two faces lie in one plane.
 */
function well(outline: Outline, zTop: number, depth: number, slope: number, under?: THREE.Vector2[]): THREE.BufferGeometry {
  return mergeGeometries([
    recessWall(outline, zTop, depth, slope), flatCap(outline(slope), zTop - depth, 1, under ? [under] : []),
  ], false)!;
}

// ─── Part registry ───────────────────────────────────────────────────────────

const parts: (Part & { lid?: boolean })[] = [];

function add(
  name: string, geometry: THREE.BufferGeometry, material: string,
  position?: [number, number, number], rotation?: THREE.Quaternion, lid = false,
) {
  parts.push({ name, geometry, material, position, rotation, lid });
}

const qToBack = qToTop;               // +z -> +y (plates on the back face)

// ─── Parts ───────────────────────────────────────────────────────────────────

function buildLowerHalf() {
  // Controls and panels, measured on a near top-down photo of the open console
  // (x from the center line, y from the front edge).
  const dpad = { x: -55.2, y: 49.6 };
  const abxy = { x: 55.2, y: 49.6 }, ABXY_D = 7.75;  // A, X, Y, B: right, top, left, bottom
  const power = { x: -54.6, y: 70.3 };
  const ssY = 70.4;

  // ── Face: three panels sunk 0.5 mm, the touch screen's frame between the
  // two control panels; the microphone and both LEDs on the front strip ──
  const PANEL_D = 0.5, PZ = FZ - PANEL_D;
  const panelL = roundedRect(30, 57.3, 1.5, -54.2, 47.85);
  const panelR = roundedRect(30, 57.3, 1.5, 54.2, 47.85);
  const frame = roundedRect(69.8, 57.7, 1.5, 0, 48.05);
  const dpadWell = cross(11.3, 4.25, dpad.x, dpad.y);
  const powerWell = roundedRect(13.6, 5.3, 1.2, power.x, power.y);
  const abxyWell = clover(abxy.x, abxy.y, ABXY_D, 4.4, 1.5);
  const ssWell = stadium({ x: 46.7, y: ssY }, { x: 63.1, y: ssY }, 2.1);
  const touch = sharpRect(61, 45.75, 0, 52.7);
  const mic = sharpRect(0.8, 3.0, -31.3, 12.6);
  const leds = [26.5, 29.7].map(x => sharpRect(0.8, 2.8, x, 12.3));
  const panels: [Outline, Outline[]][] = [[panelL, [dpadWell, powerWell]], [panelR, [abxyWell, ssWell]], [frame, [touch]]];
  // The D-pad's base closes its well's floor under it (the points dpadGeometry uses).
  const DPAD_S = 10.8, DPAD_T = 3.75;
  const dpadBase = dpadOutline(DPAD_S, DPAD_T, dpad.x, dpad.y);
  const wells: [Outline, number, number, THREE.Vector2[]?][] = [ // outline, depth, slope, footprint on the floor
    [dpadWell, 1.2, 0.3, dpadBase],
    [powerWell, 0.8, 0.5],
    [abxyWell, 0.8, 0],
    [ssWell, 0.6, 0.3],
  ];
  add('base_face', mergeGeometries([
    shellGeometry(bodyOutline, SEAM_Z, FZ, FACE_RIM, 13, [...panels.map(([o]) => o), mic, ...leds]),
    ...panels.map(([o, holes]) => mergeGeometries([
      recessWall(o, FZ, PANEL_D, 0), flatCap(o(0), PZ, 1, holes.map(h => h(0))),
    ], false)!),
    ...wells.map(([o, depth, slope, under]) => well(o, PZ, depth, slope, under)),
    recessWall(touch, PZ, 0.8, 0),
    recessWall(mic, FZ, 1.2, 0),
  ], false)!, 'body');
  add('mic_hole', fanCap(mic(0), FZ - 1.2, 1), 'hole');
  add('touch_screen', fanCap(touch(0), PZ - 0.8, 1), 'lcd');
  // "NINTENDO DS" under the touch screen, at its right; open below, where it lies on the frame
  add('logo_strip', openShell(sharpRect(23.3, 4.7, 18.75, 24.85), PZ, PZ + 0.12, 0), 'label');
  add('leds', mergeGeometries(leds.map(o => plate(o, FZ + 0.05, 0.35)), false)!, 'led');

  // ── +Control Pad (21.6 mm cross), A / B / X / Y (7.1 mm), SELECT / START, POWER ──
  add('dpad', dpadGeometry(DPAD_S, DPAD_T, 2.7, 0.4, 3.2, 0.35), 'keys', [dpad.x, dpad.y, PZ - 1.2]);
  const abGeo = buttonGeometry(3.55, 1.9, 0.35, 2);
  const names = ['button_a', 'button_x', 'button_y', 'button_b'];
  names.forEach((name, k) => add(name, k ? abGeo.clone() : abGeo, 'keys',
    [abxy.x + ABXY_D * Math.cos(k * P / 2), abxy.y + ABXY_D * Math.sin(k * P / 2), PZ - 0.8], qX90));
  // SELECT and START share the well: round at the outer ends, square where they meet.
  // The keys are open below, where they stand on the wells' floors.
  const pill = (sq: number, round: number) => {
    const s = Math.sign(sq - round);
    return fixedOutline([
      { cx: round, cy: ssY, r: 1.6, a0: s > 0 ? P / 2 : -P / 2, a1: s > 0 ? P * 1.5 : P / 2 },
      { cx: sq, cy: ssY - 1.6 * s, r: 0, a0: 0, a1: 0 },
      { cx: sq, cy: ssY + 1.6 * s, r: 0, a0: 0, a1: 0 },
    ]);
  };
  add('button_select', openShell(pill(53.9, 46.8), PZ - 0.6, FZ, 0), 'keys');
  add('button_start', openShell(pill(55.9, 63.0), PZ - 0.6, FZ, 0), 'keys');
  add('button_power', openShell(sharpRect(9.7, 4.0, power.x, power.y), PZ - 0.8, PZ + 0.4, 0), 'keys');

  // ── Hinge: the lower half's cheeks at both ends and its tongue right of
  // center hold the barrel; the lid's long knuckle and ring turn between them ──
  add('knuckles', mergeGeometries([knuckle(-31.4, -26.85, HINGE), knuckle(-0.15, 21.15, HINGE), knuckle(26.85, 31.4, HINGE)], false)!, 'body');
  const cyl = (x0: number, x1: number) => ({
    g: drum(BARREL_R, x1 - x0), at: [(x0 + x1) / 2, AXIS_Y, AXIS_Z] as [number, number, number], rot: qYtoX,
  });
  add('hinge_barrel', mergedAt([cyl(-26.55, -0.45), cyl(21.45, 26.55)]), 'body');

  // ── Bottom shell: ports cut through the front and back walls; battery
  // cover, label, logo, screws and feet underneath ──
  const bottomOutline: Outline = inset => bodyOutline(inset + SEAM_INSET);
  const rings = rimRings(SEAM_Z, 0, BOTTOM_RIM, 13);
  const zLow = rings[1]!.z; // the flat walls run from the bottom rim to the parting line
  const base = bottomOutline(0);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const segment = (test: (p: THREE.Vector2, q: THREE.Vector2) => boolean) =>
    base.findIndex((p, i) => test(p, base[(i + 1) % base.length]!));
  const frontY = SEAM_INSET, backY = LEN - SEAM_INSET;
  const frontWall = segment((p, q) => near(p.y, frontY) && near(q.y, frontY) && p.x < 0 && q.x > 0);
  const backWall = segment((p, q) => near(p.y, backY) && near(q.y, backY) && p.x > 0 && q.x < 0);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wallQuad = (i: number) => {
    const p = base[i]!, q = base[(i + 1) % base.length]!;
    return [v(p.x, p.y, zLow), v(q.x, q.y, zLow), v(q.x, q.y, SEAM_Z), v(p.x, p.y, SEAM_Z)];
  };

  // Front edge: the Game Pak slot (SLOT-2) in the middle, VOL. at the left,
  // the microphone and headphone jacks at the right.
  const VOL = v(-48, frontY, 8);
  const front = cutWall(wallQuad(frontWall), qToFront, [
    { at: v(0, frontY, 6.25), w: 59, h: 7.8, r: 0, depth: 25 },
    { at: VOL, w: 14, h: 2.0, r: 0, depth: 1.6 },
    { at: v(46.4, frontY, 7.7), w: 2.6, h: 1.8, r: 0, depth: 6 },
    { at: v(51.6, frontY, 7.7), w: 3.6, h: 3.6, r: 1.8, depth: 8 },
  ]);
  // Back: the external extension connector, the DS Card slot (SLOT-1), the
  // wrist strap attachment and the stylus holder, left to right.
  const STYLUS = v(36.8, backY, 5.4);
  const back = cutWall(wallQuad(backWall), qToBack, [
    { at: v(-30.2, backY, 5.9), w: 12.6, h: 6.0, r: 0, depth: 5 },
    { at: v(0, backY, 6.2), w: 35, h: 4.4, r: 0, depth: 10 },
    { at: v(27.6, backY, 5.4), w: 4.6, h: 3.0, r: 0, depth: 3 },
    { at: STYLUS, w: 4.4, h: 4.4, r: 2.2, depth: 8 },
  ]);
  const local = (at: THREE.Vector3, q: THREE.Quaternion) => new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));

  const cover = roundedRect(44, 56.7, 2.5, -44.2, 44.95);
  const label = sharpRect(50.4, 33.3, 4.4, 57.45);
  const logo = roundedRect(35.3, 9.8, 1.0, 1.5, 28.4);  // NINTENDO DS, molded in a recess
  const SCREWS: [number, number][] = [[63.4, 18.6], [63.4, 66.5]];
  const BORE_R = 1.8, BORE_D = 1.5;
  const bores = SCREWS.map(([x, y]) => roundedRect(2 * BORE_R, 2 * BORE_R, BORE_R, x, y));

  add('base_bottom', mergeGeometries([
    sweepSide(bottomOutline, rings, -1, undefined, (i, r) => r === 0 && (i === frontWall || i === backWall)),
    front.wall, back.wall,
    flatCap(bottomOutline(rings[rings.length - 1]!.inset), 0, -1, [cover, label, logo, ...bores].map(h => h(0))),
    ...bores.map(o => recess(o, 0, BORE_D, 0, 1)),
    recessWall(label, 0, 0.25, 0, 1),
    recess(logo, 0, 0.3, 0.1, 1),
  ], false)!, 'bodyDark');
  add('ports', mergeGeometries([front.backs, back.backs], false)!, 'hole');
  add('volume_nub', plate(sharpRect(4.0, 1.6, 3.5, 0), 0.8, 2.3).applyMatrix4(local(VOL, qToFront)), 'keys');
  add('stylus', openShell(circle(1.9, 0, 0), -5.6, -0.6, 0).applyMatrix4(local(STYLUS, qToBack)), 'keys');

  add('battery_cover', plate(cover, -0.15, 0.6, -1), 'bodyDark');
  // The label is one outer face: print is drawn front side only, so it doesn't show through the console.
  add('label', flatCap(label(0), 0.25, -1), 'sticker');
  add('screws', mergedAt([
    ...SCREWS.map(([x, y]) => ({ g: disc(BORE_R - 0.4, 24), at: [x, y, BORE_D - 0.05] as [number, number, number], rot: qY180 })),
    { g: disc(1.3, 24), at: [-26.2, 52.2, -0.2], rot: qY180 }, // battery cover screw
  ]), 'hole');
  add('feet', mergeGeometries([
    openShell(sharpRect(3.4, 3.4, 47.8, 21.9), 0, -0.5, 0),
    openShell(sharpRect(3.4, 3.4, -46.4, 21.9), -0.15, -0.65, 0), // on the battery cover
  ], false)!, 'rubber');

  // ── L / R: bands wrapping the back corners, 11 mm up the sides and 18 mm
  // along the back, standing 2 mm out ──
  const shoulder = (s: number) => shoulderBand(s, {
    hw: HW, len: LEN, r: BACK_R, fromY: LEN - 11, toX: HW - 18, z0: 5, z1: 13.5, inner: -0.5, outer: 2,
  });
  add('button_l', shoulder(-1), 'keys');
  add('button_r', shoulder(1), 'keys');
}

function buildLid() {
  const lid = true;

  // ── Screen face: the lens 0.3 mm deep in a pocket, a rubber bumper near
  // each corner, the stereo speakers' 4 x 7 holes beside the screen ──
  const lens = roundedRect(69.2, 56.8, 1.5, 0, yLid(37.2));
  const pocket: Outline = inset => lens(inset - 0.5);
  const POCKET_D = 0.8, LENS_TOP = LZ - 0.3;
  const BUMPERS: [number, number][] = [[-43.6, 6.7], [43.6, 6.7], [-43.6, 67.1], [43.6, 67.1]];
  const bumperWells = BUMPERS.map(([x, d]) => sharpRect(4.4, 4.4, x, yLid(d)));
  const HOLE_R = 0.45, SPEAKER_D = 1.2;
  const speaker: [number, number][] = [];
  for (const sx of [-50, 50]) {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 4; j++) speaker.push([sx + (i - 3) * 3.25, yLid(54 + (j - 1.5) * 4.5)]);
    }
  }
  const holes = speaker.map(([x, y]) => circle(HOLE_R, x, y));
  add('lid_face', mergeGeometries([
    shellGeometry(lidOutline, LID_SEAM, LZ, 1.2, 13, [pocket, ...bumperWells, ...holes]),
    // The lens closes the pocket's floor under it.
    well(pocket, LZ, POCKET_D, 0.1, lens(0)),
    ...bumperWells.map(o => recess(o, LZ, 0.4, 0)),
  ], false)!, 'body', undefined, undefined, lid);
  add('speaker_holes', mergeGeometries(speaker.map(([x, y]) => pit(HOLE_R, x, y, LZ, SPEAKER_D)), false)!,
    'hole', undefined, undefined, lid);
  add('lens', shellGeometry(lens, LZ - POCKET_D, LENS_TOP, 0), 'screen', undefined, undefined, lid);
  // LCD window, a little larger than the 61.4 x 46.1 mm picture; open below, where it lies on the lens
  add('lcd', openShell(sharpRect(63, 47.5, 0, yLid(37.3)), LENS_TOP, LENS_TOP + 0.27, 0), 'lcd', undefined, undefined, lid);
  add('bumpers', mergeGeometries(BUMPERS.map(([x, d]) => openShell(sharpRect(3.6, 3.6, x, yLid(d)), LZ - 0.4, LZ + 0.3, 0)), false)!,
    'rubber', undefined, undefined, lid);

  // ── Outer face: two grooves along it set off the middle, the Nintendo
  // badge near the front edge ──
  const outer: Outline = inset => lidOutline(inset + 0.3);
  const grooves = [-36, 36].map(x => sharpRect(0.7, 69.4, x, 113.3));
  const badge = stadium({ x: -9.3, y: yLid(7) }, { x: 9.3, y: yLid(7) }, 3);
  add('lid_back', mergeGeometries([
    openShell(outer, LID_SEAM, LID_BACK_Z, LID_RIM, [...grooves, badge]),
    ...grooves.map(o => recess(o, LID_BACK_Z, 0.3, 0, 1)),
    recessWall(badge, LID_BACK_Z, 0.15, 0.05, 1),
  ], false)!, 'lidBack', undefined, undefined, lid);
  add('badge', flatCap(badge(0.05), LID_BACK_Z + 0.15, -1), 'badge', undefined, undefined, lid);
}

/** Colors (Platinum, the launch color) are for other glTF viewers; the portfolio uses `role`. */
const MATERIALS: MaterialDefs = {
  body:     { color: srgb(0xc3c6ca), metallic: 0.40, roughness: 0.35, role: 'shell' }, // platinum
  lidBack:  { color: srgb(0xb9bcc0), metallic: 0.40, roughness: 0.35, role: 'shell' },
  bodyDark: { color: srgb(0x2a2b2e), metallic: 0.05, roughness: 0.50, role: 'shell' }, // black bottom shell
  screen:   { color: srgb(0x141418), metallic: 0.05, roughness: 0.10, role: 'lens' },
  lcd:      { color: srgb(0x2a2d2c), metallic: 0.00, roughness: 0.60, role: 'lcd' },   // both screens
  label:    { color: srgb(0x6b6e73), metallic: 0.00, roughness: 0.40, role: 'print' }, // NINTENDO DS logo
  sticker:  { color: srgb(0x3a3b3f), metallic: 0.00, roughness: 0.50, role: 'print' }, // bottom label
  badge:    { color: srgb(0x9a9da2), metallic: 0.30, roughness: 0.30, role: 'print' }, // Nintendo badge
  keys:     { color: srgb(0x2b2c30), metallic: 0.05, roughness: 0.45, role: 'button' }, // buttons, L / R, VOL., stylus
  rubber:   { color: srgb(0xa3a6aa), metallic: 0.00, roughness: 0.80, role: 'rubber' }, // bumpers, feet
  hole:     { color: srgb(0x1c1c20), metallic: 0.05, roughness: 0.60, role: 'cavity' }, // holes, ports, screws
  led:      { color: srgb(0x3a6a3e), metallic: 0.00, roughness: 0.25, role: 'print' },
};

buildLowerHalf();
buildLid();
// Fold the lid to OPEN_DEG, stand the console up (STAND_DEG), 1 unit = 148.7 mm.
const posed = poseClamshell(parts, { axisY: AXIS_Y, axisZ: AXIS_Z, openDeg: OPEN_DEG, standDeg: STAND_DEG, unitMm: 148.7 });
await exportGLB(posed, MATERIALS, 'NintendoDS', './public/models/meshopt/ds.glb');
