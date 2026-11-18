/**
 * Generate a faithful Nintendo 3DS (CTR-001, the original model) 3D model
 * (.glb), opened to about 150 degrees as it is held in play.
 *
 * Built like generate-gbasp.ts (three.js math, exported via @gltf-transform,
 * helpers shared in model-geometry.ts). Sources:
 *   - Nintendo 3DS instruction booklet (Japanese), specifications: closed
 *     74 x 134 x 21 mm; upper screen 3.53 inches, 76.8 x 46.08 mm, 800 x 240
 *     dots; touch screen 3.02 inches, 61.44 x 46.08 mm, 320 x 240 dots.
 *   - Nintendo 3DS Operations Manual (UK), "Component Names and Functions":
 *     inner camera, speakers, 3D depth slider and 3D LED on the upper half;
 *     Circle Pad over the +Control Pad, A / B / X / Y, SELECT / HOME / START
 *     under the touch screen, POWER, the microphone; the audio jack, power and
 *     recharge LEDs on the front edge; the notification LED on the hinge; the
 *     wireless switch and LED on the right side, volume and SD card slot on the
 *     left; L / R, the infrared transceiver, stylus holder, Game Card slot and
 *     the AC adapter and cradle connectors on the back; two outer cameras and
 *     their LED on the lid; the battery cover underneath.
 *   - Photos of the hardware (Wikimedia Commons): a near top-down shot of the
 *     open console (controls, screens, speakers, hinge), front three-quarter
 *     shots, the closed console from the front, front-left, back, bottom, L
 *     and R corners (thicknesses, hinge, ports, cameras).
 *
 * Dimensions are in mm in the closed frame: x to the right, y from the front
 * edge toward the hinge, z up from the bottom. The lid is built opened flat
 * (180 deg, screen up, turned about the hinge axis) and folded back to
 * OPEN_DEG at export. The export stands the open console up facing +z
 * (STAND_DEG) and scales it to 1 unit = 134 mm. Every glTF material names its
 * finish in extras.role.
 *
 * Run: bun scripts/generate-3ds.ts
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  arcOutline, buttonGeometry, circle, cutWall, disc, dpadGeometry, exportGLB, fanCap, fixedOutline, flatCap,
  indexedGeometry, mergedAt, openShell, plate, polygon, poseClamshell, qToFront, qToLeft, qToRight, qToTop, qX90,
  qY180, quad, recess, recessWall, rimRings, roundedRect, sharpRect, shoulderBand, srgb, sweepSide,
  type MaterialDefs, type Outline, type Part, type Ring,
} from './model-geometry';

const P = Math.PI;

// ─── Dimensions (mm) ─────────────────────────────────────────────────────────

const HW = 67;                  // half of the 134 mm width
const LEN = 74;                 // front edge to the back face
const TOTAL_H = 21;             // closed thickness
const FZ = 13.2;                // lower half; its face is at z = FZ
const SEAM_Z = 7;               // lower half: bottom shell below, top shell above
const SEAM_INSET = 0.35;        // the bottom shell steps in at the parting line
const FACE_RIM = 1.4;           // rounded edge around the lower half's face
const BOTTOM_RIM = 1.6;
const FRONT_R = 5;              // the body's front corners
const BACK_R = 3.5;             // its back corners, under L / R and the knuckles

// Hinge: the lid's 9.6 mm barrel, flush with the back face and with the top of
// the closed console. It sits 2 mm deep in a trough behind the face, between
// the lower half's two knuckles.
const BARREL_R = 4.8;
const AXIS_Y = LEN - BARREL_R;                  // 69.2
const AXIS_Z = TOTAL_H - BARREL_R;              // 16.2
const FACE_END = AXIS_Y - BARREL_R - 0.3;       // 64.1, the face stops in front of the barrel
const TROUGH_Z = AXIS_Z - BARREL_R - 0.3;       // 11.1
const KNUCKLE_X = 52.8;                         // the knuckles' inner walls
const KNUCKLE_RIM = 2.5;
const BARREL_X = 52.5;
const OPEN_DEG = 150;
// Display: the lower half leans back 7 deg like the GBA SP's and the DS's; the
// lid then leans 23 deg toward the camera.
const STAND_DEG = 7;

// Lid, opened flat: turned about the axis, screen face up. Beside the knuckles
// it covers the face up to 63 mm when closed: any longer there, its corners
// would touch the knuckles' rounded backs when open. Between them it is one
// shell with its barrel: the screen face runs into the barrel's side, the flat
// outer face meets the barrel along its bottom line. Neither has an end
// there, nor the barrel a side inside the lid, since the clear plastic would
// show them.
const LID_GAP = 0.2;
const LID_TOP = 2 * AXIS_Y;                     // 138.4, the lid's far edge (the closed front edge)
const LID_SIDE_START = LID_TOP - 63;            // 75.4, beside the knuckles
const LZ = 2 * AXIS_Z - (FZ + LID_GAP);         // 19, screen face
const LID_BACK_Z = 2 * AXIS_Z - TOTAL_H;        // 11.4, outer face, level with the barrel's bottom
const LID_SEAM = LZ - 3.2;                      // a thin face plate on a deeper back
const LID_RIM = 1;                              // rounded edge around the screen face
const LID_CHAMFER = 1.4;                        // the outer face's bevel
const BACK_INSET = 0.3;                         // the outer face's plate, inside the face plate's edge
// Between the knuckles, inside the barrel: where the face plate's flat top
// and the back's flat outer face (inside their rim and bevel) meet the barrel
const CREASE_Y = AXIS_Y + Math.sqrt(BARREL_R ** 2 - (LZ - AXIS_Z) ** 2);  // 73.1
const FACE_START = CREASE_Y - LID_RIM;                                    // 72.1, the face plate
const BACK_START = AXIS_Y - BACK_INSET - LID_CHAMFER;                     // 67.5, the back

/** y on the open lid, `v` mm down from its top edge */
const yLid = (v: number) => LID_TOP - v;

// ─── Outlines ────────────────────────────────────────────────────────────────

const bodyOutline = roundedRect(2 * HW, LEN, { tl: BACK_R, tr: BACK_R, bl: FRONT_R, br: FRONT_R }, 0, LEN / 2);

/**
 * The lower half's top shell, in front of the hinge. Its back edge is split
 * where the knuckles stand, so the wall under them can be left to the
 * knuckles' own front walls.
 */
const faceBase = roundedRect(2 * HW, FACE_END, { tl: 0, tr: 0, bl: FRONT_R, br: FRONT_R }, 0, FACE_END / 2);
const faceOutline: Outline = inset => {
  const pts = faceBase(inset);
  const i = pts.findIndex((p, k) => {
    const q = pts[(k + 1) % pts.length]!;
    return Math.abs(p.y - q.y) < 1e-3 && p.y > FACE_END - 2 * FACE_RIM && p.x - q.x > 2 * KNUCKLE_X;
  });
  const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
  const at = (x: number) => new THREE.Vector2(x, p.y + (q.y - p.y) * (p.x - x) / (p.x - q.x));
  pts.splice(i + 1, 0, at(KNUCKLE_X), at(-KNUCKLE_X));
  return pts;
};

/**
 * The lid, opened flat: the middle starts at `start`, in the barrel. Its
 * sides stay square with the barrel's ends at any inset: the rim and the
 * bevel run along the steps beside the knuckles but not along those sides. A
 * sharp corner is one point, whose normal leans to its longer edge; points
 * 0.01 mm from the steps' inner corners keep the steps lit square.
 */
function lidOutline(start: number): Outline {
  const outline = arcOutline([
    { cx: HW, cy: LID_SIDE_START, r: 0, a0: -P / 2, a1: 0 },
    { cx: HW - FRONT_R, cy: LID_TOP - FRONT_R, r: FRONT_R, a0: 0, a1: P / 2 },
    { cx: -HW + FRONT_R, cy: LID_TOP - FRONT_R, r: FRONT_R, a0: P / 2, a1: P },
    { cx: -HW, cy: LID_SIDE_START, r: 0, a0: P, a1: P * 1.5 },
    // The middle: sharp corners, the outer two turning inward.
    { cx: -BARREL_X, cy: LID_SIDE_START, r: 0, a0: -P / 2, a1: -P },
    { cx: -BARREL_X, cy: start, r: 0, a0: -P, a1: -P / 2 },
    { cx: BARREL_X, cy: start, r: 0, a0: -P / 2, a1: 0 },
    { cx: BARREL_X, cy: LID_SIDE_START, r: 0, a0: 0, a1: -P / 2 },
  ]);
  const c = outline(0).findIndex(p => Math.abs(p.x + BARREL_X) < 1e-3 && Math.abs(p.y - start) < 1e-3);
  return inset => {
    const pts = outline(inset);
    // The middle's corners are c - 1 to c + 2, left knuckle to right
    for (let i = c - 1; i <= c + 2; i++) pts[i]!.x = Math.sign(pts[i]!.x) * BARREL_X;
    const near = (i: number, j: number) => pts[i]!.clone().add(pts[j]!.clone().sub(pts[i]!).setLength(0.01));
    pts.splice(c + 2, 0, near(c + 2, c + 1));
    pts.splice(c, 0, near(c - 1, c));
    return pts;
  };
}

/** Picks the outline's segments around its middle (both points on the barrel's ends), which the barrel closes. */
function middle(outline: Outline): (i: number) => boolean {
  const pts = outline(0), onEnd = (p: THREE.Vector2) => Math.abs(Math.abs(p.x) - BARREL_X) < 1e-6;
  return i => onEnd(pts[i]!) && onEnd(pts[(i + 1) % pts.length]!);
}

/** Plus sign of half-span s and half-width t around (cx, cy): sharp corners, the inner four turning inward. */
function cross(s: number, t: number, cx: number, cy: number): Outline {
  const arm: [number, number, number, number][] = [[s, -t, -P / 2, 0], [s, t, 0, P / 2], [t, t, P / 2, 0]];
  return arcOutline([0, 1, 2, 3].flatMap(k => arm.map(([x, y, a0, a1]) => {
    const c = Math.cos(k * P / 2), sn = Math.sin(k * P / 2);
    return { cx: cx + x * c - y * sn, cy: cy + x * sn + y * c, r: 0, a0: a0 + k * P / 2, a1: a1 + k * P / 2 };
  })));
}

// ─── Mesh builders ───────────────────────────────────────────────────────────

/** Wall from zStart, then a flat 45-degree bevel `c` wide onto the face at zEnd. */
function chamferRings(zStart: number, zEnd: number, c: number): Ring[] {
  const zc = zEnd - Math.sign(zEnd - zStart) * c;
  // The bevel's edges repeat with its own normal; the zero-height bands between draw nothing.
  return [
    { inset: 0, z: zStart, blend: 0 }, { inset: 0, z: zc, blend: 0 },
    { inset: 0, z: zc, blend: 0.5 }, { inset: c, z: zEnd, blend: 0.5 },
    { inset: c, z: zEnd, blend: 1 },
  ];
}

/**
 * Inside of a small round hole cut in a face at zTop: one dark cone to its
 * point `depth` in, for wall and back together. Its 46 facets stay under the
 * 8-degree edge threshold, so only the rim draws.
 */
function pit(r: number, x: number, y: number, zTop: number, depth: number): THREE.BufferGeometry {
  const rim = circle(r, x, y)(0);
  const positions = [x, y, zTop - depth], normals = [0, 0, 1], indices: number[] = [];
  rim.forEach((p, i) => {
    const n = new THREE.Vector3(-(p.x - x) * depth, -(p.y - y) * depth, r * r).normalize();
    positions.push(p.x, p.y, zTop); normals.push(n.x, n.y, n.z);
    indices.push(0, 1 + i, 1 + (i + 1) % rim.length);
  });
  return indexedGeometry(positions, normals, indices);
}

/**
 * Circle Pad cap along +y from its base: a straight wall, a crisp shoulder,
 * then a shallow dish to the center (each facet under the edge threshold).
 */
function padGeometry(r: number, wallH: number, dish: number, steps = 3): THREE.BufferGeometry {
  const sphereR = (r * r + dish * dish) / (2 * dish);
  const a0 = Math.asin(r / sphereR);
  const profile = [new THREE.Vector2(r, 0), new THREE.Vector2(r, wallH)];
  for (let i = 1; i <= steps; i++) {
    const a = a0 * (1 - i / steps);
    profile.push(new THREE.Vector2(sphereR * Math.sin(a), wallH - sphereR * (Math.cos(a) - Math.cos(a0))));
  }
  return new THREE.LatheGeometry(profile, 48);
}

/** Transform from a wall's own frame (+z out of the wall at `at`) to the model. */
const onWall = (at: THREE.Vector3, q: THREE.Quaternion) => new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));

// ─── Part registry ───────────────────────────────────────────────────────────

const parts: (Part & { lid?: boolean })[] = [];

function add(
  name: string, geometry: THREE.BufferGeometry, material: string,
  position?: [number, number, number], rotation?: THREE.Quaternion, lid = false,
) {
  parts.push({ name, geometry, material, position, rotation, lid });
}

const qToBack = qToTop;               // +z -> +y (plates on the back face)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ─── Parts ───────────────────────────────────────────────────────────────────

function buildLowerHalf() {
  // Controls and panels, measured on a near top-down photo of the open console
  // (x from the center line, y from the front edge).
  const pad = { x: -50.4, y: 45.8 };
  const dpad = { x: -51, y: 22.5 };
  const abxy = { x: 49.3, y: 44.3 }, ABXY_D = 7.35;  // A, X, Y, B: right, top, left, bottom
  const power = { x: 42.4, y: 9.8 };

  // ── Face: the touch screen's frame stands 0.5 mm proud, from the hinge
  // almost to the front edge, with SELECT / HOME / START and the microphone
  // in its lower strip; the controls sit in wells beside it ──
  const FTOP = FZ + 0.5;
  const frame = roundedRect(69.2, 58.2, 1.2, 0, 32.3);
  const touch = roundedRect(62.6, 47.2, 0, 0, 36);
  const keys = [-21, 0, 21].map(x => roundedRect(15.6, 3, 1, x, 7.6));
  const mic = { x: 31.5, y: 5, r: 0.45 };
  const padWell = roundedRect(22.4, 22.4, 11.2, pad.x, pad.y);
  const dpadWell = cross(9.5, 3.3, dpad.x, dpad.y);
  const abxyAt = [0, 1, 2, 3].map(k => ({ x: abxy.x + ABXY_D * Math.cos(k * P / 2), y: abxy.y + ABXY_D * Math.sin(k * P / 2) }));
  const abxyWells = abxyAt.map(p => roundedRect(7.6, 7.6, 3.8, p.x, p.y));
  const powerWell = roundedRect(6.8, 6.8, 1.8, power.x, power.y);

  // The top shell's flat walls take their openings: the audio jack and the
  // wrist strap attachments in front, volume on the left, the wireless switch
  // on the right. Under the knuckles its back wall is left out.
  const rings = rimRings(SEAM_Z, FZ, FACE_RIM, 13);
  const zHigh = rings[1]!.z;   // the flat walls run from the parting line up to the rim
  const face = faceOutline(0);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const segment = (pts: THREE.Vector2[], test: (p: THREE.Vector2, q: THREE.Vector2) => boolean) =>
    pts.findIndex((p, i) => test(p, pts[(i + 1) % pts.length]!));
  const frontWall = segment(face, (p, q) => near(p.y, 0) && near(q.y, 0));
  const rightWall = segment(face, (p, q) => near(p.x, HW) && near(q.x, HW));
  const leftWall = segment(face, (p, q) => near(p.x, -HW) && near(q.x, -HW));
  const underKnuckles = [
    segment(face, (p, q) => near(p.y, FACE_END) && near(p.x, HW) && near(q.x, KNUCKLE_X)),
    segment(face, (p, q) => near(p.y, FACE_END) && near(p.x, -KNUCKLE_X) && near(q.x, -HW)),
  ];
  const faceWall = (i: number) => {
    const p = face[i]!, q = face[(i + 1) % face.length]!;
    return [v(p.x, p.y, SEAM_Z), v(q.x, q.y, SEAM_Z), v(q.x, q.y, zHigh), v(p.x, p.y, zHigh)];
  };
  const JACK = v(0, 0, 9.4);
  const front = cutWall(faceWall(frontWall), qToFront, [
    { at: JACK, w: 3.5, h: 3.5, r: 1.75, depth: 6 },
    { at: v(-60, 0, 8), w: 2.4, h: 0.9, r: 0, depth: 2 },
    { at: v(60, 0, 8), w: 2.4, h: 0.9, r: 0, depth: 2 },
  ]);
  const SLOT_D = 1.2;
  const slider = (sign: number, y0: number, y1: number, nubY: number) => {
    const q = sign > 0 ? qToRight : qToLeft;
    const at = v(sign * HW, (y0 + y1) / 2, 9.4);
    return {
      cut: cutWall(faceWall(sign > 0 ? rightWall : leftWall), q, [{ at, w: 1.4, h: y1 - y0, r: 0.7, depth: SLOT_D }]),
      nub: plate(sharpRect(1.1, 2.6, 0, nubY - at.y), 0.6, 0.6 + SLOT_D - 0.1).applyMatrix4(onWall(at, q)),
    };
  };
  const volume = slider(-1, 46, 58, 52);
  const wireless = slider(1, 47, 54, 52.2);

  // The D-pad well's floor is cut to the D-pad's base (the same points dpadGeometry uses).
  const S = 9, T = 2.8;
  const dpadBase = [[S, -T], [S, T], [T, T], [T, S], [-T, S], [-T, T], [-S, T], [-S, -T], [-T, -T], [-T, -S], [T, -S], [T, -T]]
    .map(([x, y]) => new THREE.Vector2(dpad.x + x!, dpad.y + y!));
  add('base_face', mergeGeometries([
    sweepSide(faceOutline, rings, 1, undefined,
      (i, r) => r === 0 && [frontWall, rightWall, leftWall, ...underKnuckles].includes(i)),
    front.wall, volume.cut.wall, wireless.cut.wall,
    flatCap(faceOutline(FACE_RIM), FZ, 1, [frame, padWell, dpadWell, ...abxyWells, powerWell].map(h => h(0))),
    flatCap(faceOutline(0), SEAM_Z, -1),
    recess(padWell, FZ, 1.3, 1.3),
    recessWall(dpadWell, FZ, 1, 0),
    flatCap(dpadWell(0), FZ - 1, 1, [dpadBase]),
    ...abxyWells.map(o => recess(o, FZ, 0.8, 0)),
    recess(powerWell, FZ, 0.7, 0),
  ], false)!, 'body');
  add('front_ports', mergeGeometries([front.backs, volume.cut.backs, wireless.cut.backs], false)!, 'hole');
  add('switch_nubs', mergeGeometries([volume.nub, wireless.nub], false)!, 'keys');
  // The audio jack's dark collar, the power and recharge LEDs on the front
  // edge, the wireless LED behind the switch
  add('jack_ring', flatCap(circle(2.2, 0, 0)(0), 0.05, 1, [circle(1.75, 0, 0)(0)]).applyMatrix4(onWall(JACK, qToFront)), 'label');
  add('leds', mergeGeometries([
    ...[42, 54.2].map(x => flatCap(sharpRect(1.1, 1.1)(0), 0.05, 1).applyMatrix4(onWall(v(x, 0, 11), qToFront))),
    flatCap(sharpRect(1, 1.2)(0), 0.05, 1).applyMatrix4(onWall(v(HW, 57.5, 9.4), qToRight)),
    // Notification LED, on the right knuckle's top
    flatCap(sharpRect(1.4, 1)(0), TOTAL_H + 0.05, 1).translate(59.6, 68.6, 0),
  ], false)!, 'led');

  add('screen_frame', mergeGeometries([
    openShell(frame, FZ - 0.6, FTOP, 0, [touch, ...keys, circle(mic.r, mic.x, mic.y)]),
    recessWall(touch, FTOP, 0.9, 0.35),
  ], false)!, 'body');
  add('touch_screen', fanCap(touch(0.35), FTOP - 0.9, 1), 'lcd');
  add('mic_hole', pit(mic.r, mic.x, mic.y, FTOP, 1), 'hole');
  ['button_select', 'button_home', 'button_start'].forEach((name, k) =>
    add(name, openShell(keys[k]!, FTOP - 0.5, FTOP + 0.2, 0), 'keys'));

  // ── Circle Pad (14.2 mm cap), +Control Pad (18 mm cross), A / B / X / Y
  // (6.6 mm), POWER ──
  add('circle_pad', padGeometry(7.1, 3.2, 0.3), 'pad', [pad.x, pad.y, FZ - 1.3], qX90);
  add('dpad', dpadGeometry(S, T, 2.2, 0.3, 0, 0), 'keys', [dpad.x, dpad.y, FZ - 1]);
  const abGeo = buttonGeometry(3.3, 1.7, 0.35, 2);
  ['button_a', 'button_x', 'button_y', 'button_b'].forEach((name, k) =>
    add(name, k ? abGeo.clone() : abGeo, 'keys', [abxyAt[k]!.x, abxyAt[k]!.y, FZ - 0.8], qX90));
  add('button_power', openShell(roundedRect(5.4, 5.4, 1.2, power.x, power.y), FZ - 0.7, FZ + 0.5, 0), 'keys');

  // ── Hinge: a knuckle at each end, the trough between them under the barrel ──
  const knuckle = (s: number) => roundedRect(HW - KNUCKLE_X, LEN - FACE_END,
    s > 0 ? { tl: 0, tr: BACK_R, bl: 0, br: 0 } : { tl: BACK_R, tr: 0, bl: 0, br: 0 },
    s * (HW + KNUCKLE_X) / 2, (FACE_END + LEN) / 2);
  add('knuckles', mergeGeometries([-1, 1].map(s => openShell(knuckle(s), SEAM_Z, TOTAL_H, KNUCKLE_RIM)), false)!, 'body');
  const kx = KNUCKLE_X;
  add('base_spine', mergeGeometries([
    quad([[-kx, FACE_END, TROUGH_Z], [kx, FACE_END, TROUGH_Z], [kx, LEN, TROUGH_Z], [-kx, LEN, TROUGH_Z]], [0, 0, 1]),
    quad([[-kx, LEN, SEAM_Z], [kx, LEN, SEAM_Z], [kx, LEN, TROUGH_Z], [-kx, LEN, TROUGH_Z]], [0, 1, 0]),
  ], false)!, 'body');

  // ── Bottom shell: the back wall's ports and the SD card slot's cover on the
  // left are cut through its flat walls; the battery cover underneath ──
  const bottomOutline: Outline = inset => bodyOutline(inset + SEAM_INSET);
  const bRings = rimRings(SEAM_Z, 0, BOTTOM_RIM, 13);
  const zLow = bRings[1]!.z;  // the flat walls run from the bottom rim to the parting line
  const base = bottomOutline(0);
  const backY = LEN - SEAM_INSET, wallX = HW - SEAM_INSET;
  const backWall = segment(base, (p, q) => near(p.y, backY) && near(q.y, backY) && p.x > 0 && q.x < 0);
  const sdWall = segment(base, (p, q) => near(p.x, -wallX) && near(q.x, -wallX));
  const baseWall = (i: number) => {
    const p = base[i]!, q = base[(i + 1) % base.length]!;
    return [v(p.x, p.y, zLow), v(q.x, q.y, zLow), v(q.x, q.y, SEAM_Z), v(p.x, p.y, SEAM_Z)];
  };

  // Back, left to right (measured on photos of both back corners): a small
  // square hole, the infrared transceiver, the stylus holder, the Game Card
  // slot, the AC adapter connector between the charging cradle's contacts,
  // another small hole.
  const IR = v(-36, backY, 4.4), STYLUS = v(-21, backY, 4.4);
  const back = cutWall(baseWall(backWall), qToBack, [
    { at: v(-45, backY, 4.4), w: 1.4, h: 1.4, r: 0, depth: 2 },
    { at: IR, w: 6.6, h: 3.2, r: 0.4, depth: 0.8 },
    { at: STYLUS, w: 5.6, h: 4, r: 1, depth: 8 },
    { at: v(4, backY, 4.6), w: 36.5, h: 4.2, r: 0, depth: 20 },
    { at: v(27.8, backY, 4.4), w: 1.6, h: 2.4, r: 0.3, depth: 0.6 },
    { at: v(35, backY, 4.4), w: 7.4, h: 3, r: 0.8, depth: 5 },
    { at: v(42.2, backY, 4.4), w: 1.6, h: 2.4, r: 0.3, depth: 0.6 },
    { at: v(46.6, backY, 4.4), w: 1.2, h: 1.2, r: 0, depth: 1.5 },
  ]);
  const SD = v(-wallX, 21, 4.3);
  // The SD card slot's cover sits in an opening 0.25 mm wider all round; behind it the shell goes on.
  const sd = cutWall(baseWall(sdWall), qToLeft, [{ at: SD, w: 3.8, h: 24, r: 0.6, depth: 0.6 }]);

  const cover = roundedRect(124, 62.5, 2.5, 0, 36);
  add('base_bottom', mergeGeometries([
    sweepSide(bottomOutline, bRings, -1, undefined, (i, r) => r === 0 && (i === backWall || i === sdWall)),
    back.wall, sd.wall,
    flatCap(bottomOutline(bRings[bRings.length - 1]!.inset), 0, -1, [cover(0)]),
    // The top shell closes the parting line in front of the hinge; behind it,
    // under the trough and the knuckles, the bottom shell closes itself.
    fanCap([new THREE.Vector2(wallX, FACE_END), ...base.filter(p => p.y > FACE_END), new THREE.Vector2(-wallX, FACE_END)], SEAM_Z, 1),
  ], false)!, 'bodyLight');
  add('ports', back.backs, 'hole');
  add('sd_slot', sd.backs, 'bodyLight');
  add('sd_cover', plate(roundedRect(3.3, 23.5, 0.4), -0.1, 0.35).applyMatrix4(onWall(SD, qToLeft)), 'bodyLight');
  // The IR window's dark glass, just inside its opening
  add('ir_window', flatCap(roundedRect(6.6, 3.2, 0.4)(0), -0.3, 1).applyMatrix4(onWall(IR, qToBack)), 'screen');
  add('stylus', openShell(roundedRect(4.4, 2.8, 0.6), -5.6, -0.6, 0).applyMatrix4(onWall(STYLUS, qToBack)), 'keys');

  // ── Battery cover: most of the bottom, held by two screws by the back edge,
  // printed with the logo (the small print of the ratings is left out) ──
  add('battery_cover', plate(cover, -0.15, 0.6, -1), 'bodyLight');
  add('screws', mergedAt([-38, 31].map(x =>
    ({ g: disc(1.2, 24), at: [x, 64.6, -0.2] as [number, number, number], rot: qY180 }))), 'hole');
  // Print is one outer face, drawn front side only, so it doesn't show through the console.
  const badge = fixedOutline([
    { cx: 7, cy: 12, r: 2.7, a0: -P / 2, a1: P / 2 },
    { cx: -7, cy: 12, r: 2.7, a0: P / 2, a1: P * 1.5 },
  ]);
  add('print', mergeGeometries([
    sharpRect(38, 5.5, 0, 51),  // NINTENDO 3DS
    badge,                      // Nintendo
  ].map(o => flatCap(o(0), -0.2, -1)), false)!, 'label');

  // ── L / R: bands wrapping the back corners, 7.5 mm up the sides and 17.5 mm
  // along the back ──
  const shoulder = (s: number) => shoulderBand(s, {
    hw: HW, len: LEN, r: BACK_R, fromY: LEN - 7.5, toX: HW - 17.5, z0: 1.6, z1: 6.8, inner: -0.25, outer: 0.5,
  });
  add('button_l', shoulder(-1), 'keys');
  add('button_r', shoulder(1), 'keys');
}

function buildLid() {
  const lid = true;

  // ── Screen face: a black glass panel over nearly all of it, 0.3 mm deep in
  // a pocket, with the upper screen, the inner camera and both speakers'
  // five holes; rubber cushions near the top corners; the 3D depth slider in
  // the right side ──
  const lens = roundedRect(130.4, 59.4, { tl: 3.2, tr: 3.2, bl: 0.6, br: 0.6 }, 0, yLid(31.5));
  const pocket: Outline = inset => lens(inset - 0.5);
  const POCKET_D = 0.8, LENS_TOP = LZ - 0.3;
  const cam = { x: 0, y: yLid(6.8) };
  const HOLE_R = 0.45;
  const speaker: [number, number][] = [];
  for (const sx of [-54.5, 54.5]) {
    for (const [dx, dv] of [[0, 0], [3.25, 0], [-3.25, 0], [0, 3.25], [0, -3.25]] as const) speaker.push([sx + dx, yLid(33 + dv)]);
  }

  const rings = rimRings(LID_SEAM, LZ, LID_RIM, 13);
  const outline = lidOutline(FACE_START), inMiddle = middle(outline);
  const edge = outline(0);
  const rightSide = edge.findIndex((p, i) => {
    const q = edge[(i + 1) % edge.length]!;
    return Math.abs(p.x - HW) < 1e-3 && Math.abs(q.x - HW) < 1e-3 && q.y - p.y > 50;
  });
  const p0 = edge[rightSide]!, p1 = edge[(rightSide + 1) % edge.length]!;
  const SLIDER = v(HW, yLid(44.5), (LID_SEAM + rings[1]!.z) / 2);
  const slot = cutWall([v(p0.x, p0.y, LID_SEAM), v(p1.x, p1.y, LID_SEAM), v(p1.x, p1.y, rings[1]!.z), v(p0.x, p0.y, rings[1]!.z)],
    qToRight, [{ at: SLIDER, w: 1.2, h: 14, r: 0, depth: 1.2 }]);
  add('lid_face', mergeGeometries([
    sweepSide(outline, rings, 1, undefined, (i, r) => (r === 0 && i === rightSide) || inMiddle(i)),
    slot.wall,
    flatCap(outline(LID_RIM), LZ, 1, [pocket(0)]),
    flatCap(outline(0), LID_SEAM, -1),
    recessWall(pocket, LZ, POCKET_D, 0.1),
    // The pocket's floor is the ring around the panel: under the panel, the panel's own back closes it.
    flatCap(pocket(0.1), LZ - POCKET_D, 1, [lens(0)]),
  ], false)!, 'body', undefined, undefined, lid);
  add('slider_slot', slot.backs, 'hole', undefined, undefined, lid);
  // Set at OFF, the end toward the hinge
  add('depth_slider', plate(sharpRect(0.9, 2.4, 0, yLid(50) - SLIDER.y), 0.7, 0.7 + 1.1).applyMatrix4(onWall(SLIDER, qToRight)),
    'keys', undefined, undefined, lid);

  add('lens', mergeGeometries([
    openShell(lens, LZ - POCKET_D, LENS_TOP, 0, [...speaker.map(([x, y]) => circle(HOLE_R, x, y)), circle(1.5, cam.x, cam.y)]),
    recessWall(circle(1.5, cam.x, cam.y), LENS_TOP, 0.5, 0),
  ], false)!, 'screen', undefined, undefined, lid);
  add('speaker_holes', mergeGeometries(speaker.map(([x, y]) => pit(HOLE_R, x, y, LENS_TOP, 1.2)), false)!,
    'hole', undefined, undefined, lid);
  add('inner_camera', fanCap(circle(1.5, cam.x, cam.y)(0), LENS_TOP - 0.5, 1), 'hole', undefined, undefined, lid);
  // Upper screen window, a little larger than the 76.8 x 46.08 mm picture
  add('lcd', openShell(sharpRect(78.4, 47.6, 0, yLid(35.4)), LENS_TOP, LENS_TOP + 0.27, 0), 'lcd', undefined, undefined, lid);
  add('pads', mergeGeometries([-1, 1].map(s => openShell(sharpRect(1, 11, s * 64.4, yLid(9.5)), LENS_TOP - 0.1, LENS_TOP + 0.35, 0)), false)!,
    'rubber', undefined, undefined, lid);
  // The camera's collar, the depth slider's wedge (wide at full 3D, narrowing to OFF)
  add('lid_print', mergeGeometries([
    flatCap(circle(2.3, cam.x, cam.y)(0), LENS_TOP + 0.05, 1, [circle(1.5, cam.x, cam.y)(0)]),
    polygon([new THREE.Vector2(64.8, yLid(49.5)), new THREE.Vector2(64.8, yLid(38)), new THREE.Vector2(63.9, yLid(38))],
      p => new THREE.Vector3(p.x, p.y, LENS_TOP + 0.05), new THREE.Vector3(0, 0, 1)),
  ], false)!, 'label', undefined, undefined, lid);
  add('lid_leds', flatCap(sharpRect(1.2, 1.2, 62, yLid(38.6))(0), LENS_TOP + 0.05, 1), 'led', undefined, undefined, lid);

  // ── Outer face: a glossy plate with a beveled edge; the two outer cameras
  // 35 mm apart near the far edge, their LED beside the right one ──
  const backOutline = lidOutline(BACK_START);
  const outer: Outline = inset => backOutline(inset + BACK_INSET);
  const backInMiddle = middle(outer);
  const cams = [-17.5, 17.5].map(x => circle(2.6, x, yLid(8.5)));
  const CAM_D = 0.35;
  add('lid_back', mergeGeometries([
    sweepSide(outer, chamferRings(LID_SEAM, LID_BACK_Z, LID_CHAMFER), -1, undefined, backInMiddle),
    flatCap(outer(LID_CHAMFER), LID_BACK_Z, -1, cams.map(c => c(0))),
    ...cams.map(c => recessWall(c, LID_BACK_Z, CAM_D, 0, 1)),
  ], false)!, 'lidBack', undefined, undefined, lid);
  add('outer_cameras', mergeGeometries(cams.map(c => fanCap(c(0), LID_BACK_Z + CAM_D, -1)), false)!, 'screen', undefined, undefined, lid);
  add('camera_apertures', mergeGeometries([-17.5, 17.5].map(x => fanCap(circle(1, x, yLid(8.5))(0), LID_BACK_Z + CAM_D - 0.05, -1)), false)!,
    'hole', undefined, undefined, lid);
  add('camera_led', fanCap(circle(0.45, 24.5, yLid(7.5))(0), LID_BACK_Z - 0.05, -1), 'led', undefined, undefined, lid);

  // ── Hinge barrel between the knuckles, outside the lid: from the crease
  // where the screen face runs into it, over the top and the back, to its
  // bottom line, 48 sides to a turn. Its ends are the flat sides of the lid's
  // middle as well: round the barrel, then along the outer face, up the back's
  // bevel and the face plate's rim at the steps, and back along the screen
  // face to the crease. ──
  // Angles run from the top toward the back; the crease is in front of the top.
  const onBarrel = (a: number) => new THREE.Vector2(AXIS_Y - BARREL_R * Math.sin(a), AXIS_Z + BARREL_R * Math.cos(a));
  const a0 = -Math.asin((CREASE_Y - AXIS_Y) / BARREL_R);
  const arc = [onBarrel(a0)];
  for (let k = Math.floor(a0 / (2 * P) * 48) + 1; k <= 24; k++) arc.push(onBarrel(k / 48 * 2 * P));
  const steps = [
    ...chamferRings(LID_SEAM, LID_BACK_Z, LID_CHAMFER).reverse().map(r => new THREE.Vector2(LID_SIDE_START + BACK_INSET + r.inset, r.z)),
    ...rings.map(r => new THREE.Vector2(LID_SIDE_START + r.inset, r.z)),
  ];
  const end = [...arc, ...steps].filter((p, i, all) => p.distanceTo(all[(i + 1) % all.length]!) > 1e-6);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  arc.forEach((p, k) => {
    for (const x of [-BARREL_X, BARREL_X]) {
      positions.push(x, p.x, p.y);
      normals.push(0, (p.x - AXIS_Y) / BARREL_R, (p.y - AXIS_Z) / BARREL_R);
    }
    if (k) indices.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
  });
  add('hinge_barrel', mergeGeometries([
    indexedGeometry(positions, normals, indices),
    ...[-1, 1].map(s => polygon(end, p => v(s * BARREL_X, p.x, p.y), v(s, 0, 0))),
  ], false)!, 'body', undefined, undefined, lid);
}

/** Colors (Aqua Blue, a launch color) are for other glTF viewers; the portfolio uses `role`. */
const MATERIALS: MaterialDefs = {
  body:      { color: srgb(0x168fb8), metallic: 0.40, roughness: 0.35, role: 'shell' }, // aqua blue, metallic flake
  bodyLight: { color: srgb(0x3cb8d6), metallic: 0.10, roughness: 0.25, role: 'shell' }, // glossy bottom shell
  lidBack:   { color: srgb(0x12475e), metallic: 0.30, roughness: 0.10, role: 'shell' }, // glossy outer face
  screen:    { color: srgb(0x141418), metallic: 0.05, roughness: 0.10, role: 'lens' },  // glass panel, IR window, cameras
  lcd:       { color: srgb(0x2a2d2c), metallic: 0.00, roughness: 0.60, role: 'lcd' },   // both screens
  label:     { color: srgb(0xc9cdd3), metallic: 0.00, roughness: 0.40, role: 'print' }, // printing, camera collar
  led:       { color: srgb(0x3a6a9e), metallic: 0.00, roughness: 0.25, role: 'print' },
  keys:      { color: srgb(0x1a92b8), metallic: 0.10, roughness: 0.35, role: 'button' }, // buttons, L / R, sliders, stylus
  pad:       { color: srgb(0xc9c9d2), metallic: 0.00, roughness: 0.80, role: 'rubber' }, // Circle Pad cap
  rubber:    { color: srgb(0x26262a), metallic: 0.00, roughness: 0.80, role: 'rubber' }, // cushions on the lid
  hole:      { color: srgb(0x1c1c20), metallic: 0.05, roughness: 0.60, role: 'cavity' }, // holes, ports, screws
};

buildLowerHalf();
buildLid();
// Fold the lid to OPEN_DEG, stand the console up (STAND_DEG), 1 unit = 134 mm.
const posed = poseClamshell(parts, { axisY: AXIS_Y, axisZ: AXIS_Z, openDeg: OPEN_DEG, standDeg: STAND_DEG, unitMm: 134 });
await exportGLB(posed, MATERIALS, 'Nintendo3DS', './public/models/3ds.glb');
