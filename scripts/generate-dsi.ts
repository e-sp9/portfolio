/**
 * Generate a Nintendo DSi (TWL-001, the first model, in black) 3D model
 * (.glb), opened to about 150 degrees as it is held in play.
 *
 * Built like generate-ds.ts and generate-3ds.ts (three.js math, exported via
 * @gltf-transform, helpers shared in model-geometry.ts). Sources:
 *   - Nintendo's specifications: closed 137 x 74.9 x 18.9 mm, 214 g; two
 *     3.25-inch LCDs of 256 x 192 dots; inner and outer 0.3-megapixel
 *     cameras; an SD card slot; no Game Boy Advance Game Pak slot.
 *   - Nintendo's DSi instruction booklet, "Parts and Controls": the inner
 *     camera and the microphone in the hinge, the speakers beside the upper
 *     screen, the wireless, charge and power LEDs on the left of the hinge;
 *     the +Control Pad over the round POWER button, A / B / X / Y over START
 *     and SELECT; the headphone jack on the front edge, the volume buttons on
 *     the left side, the SD card slot under its cover on the right; L / R, the
 *     DS Card slot, the AC adapter connector and the stylus holder on the back;
 *     the outer camera and its LED on the outer face of the lid; the battery
 *     cover underneath.
 *   - Photos of the hardware (Wikimedia Commons, Category:Nintendo DSi):
 *     "Nintendo-DSi-Bl-Open.jpg" (the open black console from above: controls,
 *     screens, speakers, bumpers, hinge, LEDs), "Nintendo dsi closed.jpg" (the
 *     outer camera near the front right corner, the LEDs on the left knuckle),
 *     "DS Inside Open Comparison.jpg", "DS Bottom Side Comparison.jpg" and
 *     "Back side of DS & 3DS tower.jpg" (the halves' thicknesses beside the DS
 *     and DS Lite, the front edge, the back's ports and L / R).
 * The lower half is 11.4 mm thick, the lid 7.2 mm; the hinge is a barrel as
 * thick as the lid, held between two knuckles at the ends of the lower half.
 *
 * Dimensions are in mm in the closed frame: x to the right, y from the front
 * edge toward the hinge, z up from the bottom. The lid is built opened flat
 * (180 deg, screen up, mirrored about the hinge axis) and folded back to
 * OPEN_DEG at export. The export stands the open console up facing +z
 * (STAND_DEG) and scales it to 1 unit = 137 mm. Every glTF material names its
 * finish in extras.role.
 *
 * Run: bun scripts/generate-dsi.ts
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARC_STEP, arcOutline, buttonGeometry, circle, cutWall, disc, dpadGeometry, drum, exportGLB, fanCap, flatCap,
  indexedGeometry, mergedAt, openShell, plate, polygon, poseClamshell, qToFront, qToLeft, qToRight, qToTop, qX90,
  qY180, qYtoX, recess, recessWall, rimRings, roundedRect, sharpRect, shellGeometry, shoulderBand, srgb, stadium,
  sweepSide, type MaterialDefs, type Outline, type Part,
} from './model-geometry';

const P = Math.PI;

// ─── Dimensions (mm) ─────────────────────────────────────────────────────────

const HW = 68.5;                // half of the 137 mm body
const LEN = 74.9;               // front edge to the back face
const TOTAL_H = 18.9;           // closed thickness
const FZ = 11.4;                // lower half; its face is at z = FZ
const SEAM_Z = 5.6;             // lower half: bottom shell below, top shell above
const SEAM_INSET = 0.3;         // the bottom shell steps in at the parting line
const FACE_RIM = 2;             // rounded edge around the lower half's face
const BOTTOM_RIM = 1.5;
const BACK_R = 2.5;             // the body's back corners, under L / R

// Hinge: a 7.2 mm barrel across the back between the knuckles, as thick as
// the lid, flush with the back face and with the top of the closed console.
const LID_GAP = 0.3;
const BARREL_R = (TOTAL_H - FZ - LID_GAP) / 2;  // 3.6
const AXIS_Y = LEN - BARREL_R;                  // 71.3
const AXIS_Z = TOTAL_H - BARREL_R;              // 15.3
const KNUCKLE_X0 = 54, KNUCKLE_X1 = HW - BACK_R; // the knuckles, 12 mm long, on the face's flat part
const OPEN_DEG = 150;
// Display: the lower half leans back 7 deg like the DS's; the lid then leans
// 23 deg toward the camera.
const STAND_DEG = 7;

// Lid, opened flat: mirrored about the axis, screen face up, as wide as the
// body. Its hinge edge runs straight across 0.3 mm clear of the barrel and the
// knuckles, so it turns round them without touching.
const LID_HW = HW;
const LID_START = AXIS_Y + BARREL_R + 0.3;      // 75.2
const LID_TOP = 2 * AXIS_Y;                     // 142.6, flush with the front edge when closed
const LZ = TOTAL_H;                             // 18.9, screen face
const LID_BACK_Z = FZ + LID_GAP;                // 11.7, outer face
const LID_SEAM = LZ - 2;                        // a thin face plate on a deep back
const LID_RIM = 2;                              // rounded edge around the outer face

/** y on the open lid, `v` mm down from its top edge */
const yLid = (v: number) => LID_TOP - v;

// ─── Outlines ────────────────────────────────────────────────────────────────

const bodyOutline = roundedRect(2 * HW, LEN, { tl: BACK_R, tr: BACK_R, bl: 5, br: 5 }, 0, LEN / 2);
const lidOutline = roundedRect(2 * LID_HW, LID_TOP - LID_START, { tl: 5, tr: 5, bl: 2.5, br: 2.5 }, 0, (LID_START + LID_TOP) / 2);

/** Plus sign of half-span s and half-width t around (cx, cy): sharp corners, the inner four turning inward. */
function cross(s: number, t: number, cx: number, cy: number): Outline {
  const arm: [number, number, number, number][] = [[s, -t, -P / 2, 0], [s, t, 0, P / 2], [t, t, P / 2, 0]];
  return arcOutline([0, 1, 2, 3].flatMap(k => arm.map(([x, y, a0, a1]) => {
    const c = Math.cos(k * P / 2), sn = Math.sin(k * P / 2);
    return { cx: cx + x * c - y * sn, cy: cy + x * sn + y * c, r: 0, a0: a0 + k * P / 2, a1: a1 + k * P / 2 };
  })));
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

/**
 * Hinge knuckle of the lower half: the barrel's radius on a short foot that
 * stands on the face in front of the axis; behind it, it drops flush with the
 * back face to where the face's rounded edge begins. Open where it meets the
 * body; its end faces follow that edge.
 */
function knuckle(x0: number, x1: number): THREE.BufferGeometry {
  const foot = AXIS_Y - 0.7;
  const a0 = -Math.acos((foot - AXIS_Y) / BARREL_R);  // where the foot meets the barrel, below and in front
  const steps = Math.ceil((2 * P + a0) / ARC_STEP);
  const side: [THREE.Vector2, THREE.Vector2][] = [[new THREE.Vector2(foot, FZ), new THREE.Vector2(-1, 0)]];
  for (let i = 0; i <= steps; i++) {
    const a = a0 - (2 * P + a0) * (i / steps);       // forward, over the top, to the back
    const n = new THREE.Vector2(Math.cos(a), Math.sin(a));
    side.push([new THREE.Vector2(AXIS_Y + BARREL_R * n.x, AXIS_Z + BARREL_R * n.y), n]);
  }
  side.push([new THREE.Vector2(LEN, FZ - FACE_RIM), new THREE.Vector2(1, 0)]);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  side.forEach(([p, n]) => {
    for (const x of [x0, x1]) { positions.push(x, p.x, p.y); normals.push(0, n.x, n.y); }
  });
  for (let k = 0; k < side.length - 1; k++) {
    const a = 2 * k;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // The end faces close along the face's rounded back edge (as rimRings steps it), then the face.
  const rim = Array.from({ length: 13 }, (_, i) => {
    const a = (i + 1) / 13 * P / 2;
    return new THREE.Vector2(LEN - FACE_RIM + FACE_RIM * Math.cos(a), FZ - FACE_RIM + FACE_RIM * Math.sin(a));
  });
  const pts = [...side.map(([p]) => p), ...rim];
  return mergeGeometries([
    indexedGeometry(positions, normals, indices),
    polygon(pts, p => new THREE.Vector3(x0, p.x, p.y), new THREE.Vector3(-1, 0, 0)),
    polygon(pts, p => new THREE.Vector3(x1, p.x, p.y), new THREE.Vector3(1, 0, 0)),
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
  // Controls, measured on the near top-down photo of the open console
  // (x from the center line, y from the front edge).
  const dpad = { x: -51.5, y: 47.5 };
  const abxy = { x: 51.5, y: 46.5 }, ABXY_D = 7.4;  // A, X, Y, B: right, top, left, bottom
  const power = { x: -52.5, y: 16 };
  const ss = { x: 43.5, start: 21.5, select: 14.5 };

  // ── Face: the touch screen sunk 0.8 mm straight into it; the round POWER
  // button under the +Control Pad, START over SELECT under A / B / X / Y ──
  const touch = sharpRect(68, 51, 0, 37.5);
  const DPAD_S = 10, DPAD_T = 3.4;
  const dpadWell = cross(10.6, 4.0, dpad.x, dpad.y);
  const powerWell = circle(3.2, power.x, power.y);
  const abxyAt = [0, 1, 2, 3].map(k => ({ x: abxy.x + ABXY_D * Math.cos(k * P / 2), y: abxy.y + ABXY_D * Math.sin(k * P / 2) }));
  const abxyWells = abxyAt.map(({ x, y }) => circle(3.8, x, y));
  const ssWells = [ss.start, ss.select].map(y => circle(2.3, ss.x, y));
  // The D-pad's base closes its well's floor under it (the points dpadGeometry uses).
  const dpadBase = [
    [DPAD_S, -DPAD_T], [DPAD_S, DPAD_T], [DPAD_T, DPAD_T], [DPAD_T, DPAD_S], [-DPAD_T, DPAD_S], [-DPAD_T, DPAD_T],
    [-DPAD_S, DPAD_T], [-DPAD_S, -DPAD_T], [-DPAD_T, -DPAD_T], [-DPAD_T, -DPAD_S], [DPAD_T, -DPAD_S], [DPAD_T, -DPAD_T],
  ].map(([x, y]) => new THREE.Vector2(dpad.x + x!, dpad.y + y!));
  const wells: [Outline, number, number, THREE.Vector2[]?][] = [ // outline, depth, slope, footprint on the floor
    [dpadWell, 1.2, 0.3, dpadBase],
    [powerWell, 0.8, 0],
    ...abxyWells.map(o => [o, 0.8, 0] as [Outline, number, number]),
    ...ssWells.map(o => [o, 0.6, 0] as [Outline, number, number]),
  ];
  add('base_face', mergeGeometries([
    shellGeometry(bodyOutline, SEAM_Z, FZ, FACE_RIM, 13, [touch, ...wells.map(([o]) => o)]),
    ...wells.map(([o, depth, slope, under]) => well(o, FZ, depth, slope, under)),
    recessWall(touch, FZ, 0.8, 0),
  ], false)!, 'body');
  add('touch_screen', fanCap(touch(0), FZ - 0.8, 1), 'lcd');
  // POWER at the left of its button, START and SELECT at the right of theirs
  add('print', mergeGeometries([
    sharpRect(6, 1.1, -60.2, power.y + 2.6), sharpRect(6, 1.1, ss.x + 6, ss.start), sharpRect(6.6, 1.1, ss.x + 6.3, ss.select),
  ].map(o => flatCap(o(0), FZ + 0.05, 1)), false)!, 'label');

  // ── +Control Pad (20 mm cross), A / B / X / Y (6.5 mm), START, SELECT, POWER ──
  add('dpad', dpadGeometry(DPAD_S, DPAD_T, 2.4, 0.4, 3.0, 0.3), 'keys', [dpad.x, dpad.y, FZ - 1.2]);
  const abGeo = buttonGeometry(3.25, 1.7, 0.35, 2);
  ['button_a', 'button_x', 'button_y', 'button_b'].forEach((name, k) =>
    add(name, k ? abGeo.clone() : abGeo, 'keys', [abxyAt[k]!.x, abxyAt[k]!.y, FZ - 0.8], qX90));
  const ssGeo = buttonGeometry(1.85, 1.0, 0.15, 2);
  add('button_start', ssGeo, 'keys', [ss.x, ss.start, FZ - 0.6], qX90);
  add('button_select', ssGeo.clone(), 'keys', [ss.x, ss.select, FZ - 0.6], qX90);
  add('button_power', buttonGeometry(2.6, 1.1, 0.25, 2), 'power', [power.x, power.y, FZ - 0.8], qX90);

  // ── Hinge: the knuckles at both ends hold the lid's barrel; the wireless,
  // charge and power LEDs on top of the left one ──
  add('knuckles', mergeGeometries([knuckle(-KNUCKLE_X1, -KNUCKLE_X0), knuckle(KNUCKLE_X0, KNUCKLE_X1)], false)!, 'body');
  add('leds', mergeGeometries([-62.5, -60, -57.5].map(x => flatCap(sharpRect(0.6, 1.4, x, AXIS_Y)(0), TOTAL_H + 0.08, 1)), false)!, 'led');

  // ── Bottom shell: ports cut through its four walls; battery cover, label,
  // screws and feet underneath ──
  const bottomOutline: Outline = inset => bodyOutline(inset + SEAM_INSET);
  const rings = rimRings(SEAM_Z, 0, BOTTOM_RIM, 13);
  const zLow = rings[1]!.z; // the flat walls run from the bottom rim to the parting line
  const base = bottomOutline(0);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const segment = (test: (p: THREE.Vector2, q: THREE.Vector2) => boolean) =>
    base.findIndex((p, i) => test(p, base[(i + 1) % base.length]!));
  const frontY = SEAM_INSET, backY = LEN - SEAM_INSET, wallX = HW - SEAM_INSET;
  const frontWall = segment((p, q) => near(p.y, frontY) && near(q.y, frontY) && p.x < 0 && q.x > 0);
  const backWall = segment((p, q) => near(p.y, backY) && near(q.y, backY) && p.x > 0 && q.x < 0);
  const rightWall = segment((p, q) => near(p.x, wallX) && near(q.x, wallX) && p.y < q.y);
  const leftWall = segment((p, q) => near(p.x, -wallX) && near(q.x, -wallX) && p.y > q.y);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wallQuad = (i: number) => {
    const p = base[i]!, q = base[(i + 1) % base.length]!;
    return [v(p.x, p.y, zLow), v(q.x, q.y, zLow), v(q.x, q.y, SEAM_Z), v(p.x, p.y, SEAM_Z)];
  };
  const PZ = 3.6;  // the ports' center line, halfway up the walls

  // Front edge: the headphone jack at the right.
  const front = cutWall(wallQuad(frontWall), qToFront, [{ at: v(40, frontY, PZ), w: 3.6, h: 3.6, r: 1.8, depth: 8 }]);
  // Back: the DS Card slot, the AC adapter connector and the stylus holder, left to right.
  const STYLUS = v(46, backY, PZ);
  const back = cutWall(wallQuad(backWall), qToBack, [
    { at: v(-8, backY, PZ), w: 35, h: 3.0, r: 0, depth: 12 },
    { at: v(24, backY, PZ), w: 5.6, h: 2.4, r: 0.6, depth: 4 },
    { at: STYLUS, w: 4.0, h: 3.0, r: 1.0, depth: 8 },
  ]);
  // Left side: the volume buttons. Right side: the SD card slot under its cover.
  // (w runs along z on the sides, h along y.)
  const VOL = v(-wallX, 20, PZ), SD = v(wallX, 26, PZ);
  const left = cutWall(wallQuad(leftWall), qToLeft, [{ at: VOL, w: 2.4, h: 12, r: 1.0, depth: 1.6 }]);
  const right = cutWall(wallQuad(rightWall), qToRight, [{ at: SD, w: 3.2, h: 26, r: 0.8, depth: 0.8 }]);
  const local = (at: THREE.Vector3, q: THREE.Quaternion) => new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));

  const cover = roundedRect(40, 36, 2.5, -30, 30);
  const label = sharpRect(44, 26, 26, 44);
  const SCREWS: [number, number][] = [[61, 10], [61, 64]];
  const BORE_R = 1.6, BORE_D = 1.2;
  const bores = SCREWS.map(([x, y]) => roundedRect(2 * BORE_R, 2 * BORE_R, BORE_R, x, y));
  const walls = [frontWall, backWall, leftWall, rightWall];

  add('base_bottom', mergeGeometries([
    sweepSide(bottomOutline, rings, -1, undefined, (i, r) => r === 0 && walls.includes(i)),
    front.wall, back.wall, left.wall, right.wall,
    flatCap(bottomOutline(rings[rings.length - 1]!.inset), 0, -1, [cover, label, ...bores].map(h => h(0))),
    ...bores.map(o => recess(o, 0, BORE_D, 0, 1)),
    recessWall(label, 0, 0.25, 0, 1),
  ], false)!, 'body');
  add('ports', mergeGeometries([front.backs, back.backs, left.backs], false)!, 'hole');
  add('sd_slot', right.backs, 'hole');
  add('sd_cover', plate(roundedRect(2.6, 25.4, 0.5), -0.15, 0.4).applyMatrix4(local(SD, qToRight)), 'body');
  add('volume_buttons', plate(roundedRect(1.8, 11.2, 0.8), 0.5, 1.6).applyMatrix4(local(VOL, qToLeft)), 'keys');
  add('stylus', openShell(roundedRect(3.4, 2.4, 0.8), -5.6, -0.6, 0).applyMatrix4(local(STYLUS, qToBack)), 'keys');

  add('battery_cover', plate(cover, -0.15, 0.6, -1), 'body');
  // The label is one outer face: print is drawn front side only, so it doesn't show through the console.
  add('label', flatCap(label(0), 0.25, -1), 'sticker');
  add('screws', mergedAt([
    ...SCREWS.map(([x, y]) => ({ g: disc(BORE_R - 0.4, 24), at: [x, y, BORE_D - 0.05] as [number, number, number], rot: qY180 })),
    { g: disc(1.2, 24), at: [-30, 44, -0.2], rot: qY180 }, // battery cover screw
  ]), 'hole');
  add('feet', mergeGeometries([[50, 9], [-58, 9]].map(([x, y]) => openShell(circle(1.8, x!, y!), 0, -0.5, 0)), false)!, 'rubber');

  // ── L / R: bands wrapping the back corners, 9 mm up the sides and 17 mm
  // along the back, standing 0.6 mm out ──
  const shoulder = (s: number) => shoulderBand(s, {
    hw: HW, len: LEN, r: BACK_R, fromY: LEN - 9, toX: HW - 17, z0: 2.5, z1: 9, inner: -0.4, outer: 0.6,
  });
  add('button_l', shoulder(-1), 'keys');
  add('button_r', shoulder(1), 'keys');
}

function buildLid() {
  const lid = true;

  // ── Hinge barrel between the knuckles: the inner camera in a raised
  // ring at its middle, looking out the way the screen does, and the
  // microphone beside it ──
  const BARREL_HW = KNUCKLE_X0 - 0.4;
  add('hinge_barrel', drum(BARREL_R, 2 * BARREL_HW), 'body', [0, AXIS_Y, AXIS_Z], qYtoX, lid);
  const CAM_TOP = AXIS_Z + BARREL_R + 0.6, CAM_R = 1.1;
  add('camera_ring', mergeGeometries([
    openShell(circle(2.0, 0, AXIS_Y), AXIS_Z + 2.8, CAM_TOP, 0, [circle(CAM_R, 0, AXIS_Y)]),
    recessWall(circle(CAM_R, 0, AXIS_Y), CAM_TOP, 0.3, 0),
  ], false)!, 'ring', undefined, undefined, lid);
  add('inner_camera', fanCap(circle(CAM_R, 0, AXIS_Y)(0), CAM_TOP - 0.3, 1), 'hole', undefined, undefined, lid);
  add('mic_hole', fanCap(circle(0.4, 6.5, AXIS_Y)(0), AXIS_Z + BARREL_R + 0.02, 1), 'hole', undefined, undefined, lid);

  // ── Screen face: the lens 0.3 mm deep in a pocket, a rubber bumper near
  // each corner, a speaker slot on either side of the screen, the LEDs'
  // icons at the lower left ──
  const lens = roundedRect(74, 54, 1.5, 0, yLid(34));
  const pocket: Outline = inset => lens(inset - 0.5);
  const POCKET_D = 0.8, LENS_TOP = LZ - 0.3;
  const BUMPERS: [number, number][] = [[-59, 5.5], [59, 5.5], [-59, 57], [59, 57]];
  const bumperWells = BUMPERS.map(([x, d]) => sharpRect(4, 4, x, yLid(d)));
  const speakers = [-1, 1].map(s => stadium({ x: s * 54.5, y: yLid(33) }, { x: s * 49.5, y: yLid(33) }, 0.7));
  const SPEAKER_D = 1.0;
  add('lid_face', mergeGeometries([
    shellGeometry(lidOutline, LID_SEAM, LZ, 1.2, 13, [pocket, ...bumperWells, ...speakers]),
    // The lens closes the pocket's floor under it.
    well(pocket, LZ, POCKET_D, 0.1, lens(0)),
    ...bumperWells.map(o => recess(o, LZ, 0.4, 0)),
    ...speakers.map(o => recessWall(o, LZ, SPEAKER_D, 0)),
  ], false)!, 'body', undefined, undefined, lid);
  add('speaker_holes', mergeGeometries(speakers.map(o => fanCap(o(0), LZ - SPEAKER_D, 1)), false)!, 'hole', undefined, undefined, lid);
  add('lens', shellGeometry(lens, LZ - POCKET_D, LENS_TOP, 0), 'screen', undefined, undefined, lid);
  // LCD window, a little larger than the 66 x 49.5 mm picture; open below, where it lies on the lens
  add('lcd', openShell(sharpRect(67.5, 51, 0, yLid(34)), LENS_TOP, LENS_TOP + 0.27, 0), 'lcd', undefined, undefined, lid);
  add('bumpers', mergeGeometries(BUMPERS.map(([x, d]) => openShell(sharpRect(3.2, 3.2, x, yLid(d)), LZ - 0.4, LZ + 0.3, 0)), false)!,
    'rubber', undefined, undefined, lid);
  add('lid_print', flatCap(sharpRect(7, 1.8, -58.5, yLid(62.5))(0), LZ + 0.05, 1), 'label', undefined, undefined, lid);

  // ── Outer face: matte, the outer camera in a glossy ring near the front
  // right corner (closed), its LED beside it ──
  const outer: Outline = inset => lidOutline(inset + 0.3);
  const cam = { x: 45, y: yLid(12) };
  const camWell = circle(3.4, cam.x, cam.y);
  const CAM_D = 0.3;
  add('lid_back', mergeGeometries([
    openShell(outer, LID_SEAM, LID_BACK_Z, LID_RIM, [camWell]),
    recessWall(camWell, LID_BACK_Z, CAM_D, 0, 1),
  ], false)!, 'lidBack', undefined, undefined, lid);
  add('outer_camera', fanCap(camWell(0), LID_BACK_Z + CAM_D, -1), 'screen', undefined, undefined, lid);
  add('camera_aperture', fanCap(circle(1.2, cam.x, cam.y)(0), LID_BACK_Z + CAM_D - 0.05, -1), 'hole', undefined, undefined, lid);
  add('camera_led', fanCap(circle(0.45, 54, yLid(9.5))(0), LID_BACK_Z - 0.05, -1), 'led', undefined, undefined, lid);
}

/** Colors (black, a launch color) are for other glTF viewers; the portfolio uses `role`. */
const MATERIALS: MaterialDefs = {
  body:    { color: srgb(0x2b2c2f), metallic: 0.05, roughness: 0.55, role: 'shell' },  // matte black
  lidBack: { color: srgb(0x26272a), metallic: 0.05, roughness: 0.60, role: 'shell' },
  screen:  { color: srgb(0x141418), metallic: 0.05, roughness: 0.10, role: 'lens' },   // upper screen glass, outer camera
  lcd:     { color: srgb(0x2a2d2c), metallic: 0.00, roughness: 0.60, role: 'lcd' },    // both screens
  label:   { color: srgb(0x8a8d92), metallic: 0.00, roughness: 0.40, role: 'print' },  // POWER, START, SELECT, LED icons
  sticker: { color: srgb(0x3a3b3f), metallic: 0.00, roughness: 0.50, role: 'print' },  // bottom label
  ring:    { color: srgb(0x18181b), metallic: 0.10, roughness: 0.15, role: 'print' },  // the inner camera's ring
  led:     { color: srgb(0x3a6a3e), metallic: 0.00, roughness: 0.25, role: 'print' },
  keys:    { color: srgb(0x1f2023), metallic: 0.05, roughness: 0.35, role: 'button' }, // buttons, L / R, volume, stylus
  power:   { color: srgb(0x8e9196), metallic: 0.30, roughness: 0.35, role: 'button' }, // the light gray POWER button
  rubber:  { color: srgb(0x3a3b3e), metallic: 0.00, roughness: 0.80, role: 'rubber' }, // bumpers, feet
  hole:    { color: srgb(0x1c1c20), metallic: 0.05, roughness: 0.60, role: 'cavity' }, // holes, ports, cameras, screws
};

buildLowerHalf();
buildLid();
// Fold the lid to OPEN_DEG, stand the console up (STAND_DEG), 1 unit = 137 mm.
const posed = poseClamshell(parts, { axisY: AXIS_Y, axisZ: AXIS_Z, openDeg: OPEN_DEG, standDeg: STAND_DEG, unitMm: 137 });
await exportGLB(posed, MATERIALS, 'NintendoDSi', './public/models/meshopt/dsi.glb');
