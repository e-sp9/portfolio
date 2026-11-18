/**
 * Generate a faithful Game Boy Advance SP (AGS-101) 3D model (.glb), open at
 * the hinge's click stop of about 150 degrees.
 *
 * Built like generate-gbc.ts (three.js math, exported via @gltf-transform,
 * helpers shared in model-geometry.ts). Sources:
 *   - Nintendo press release, 2003-01-07: closed 84.6 x 82 x 24.3 mm, 143 g,
 *     LCD 61.2 x 40.8 mm, 240 x 160.
 *   - Nintendo's AGS instruction booklet, "List of Components": light switch,
 *     both LEDs, power switch, volume slider, EXT. 1 / EXT. 2, accessory
 *     slots, L / R, battery cover and Game Pak slot.
 *   - iFixit's GBA SP reshell guide: five rubber screw covers on the screen
 *     half, six screws in the bottom shell (four of them in counterbores
 *     outside the battery compartment), one on the battery cover.
 *   - Photos of the hardware: a near top-down shot of the lower half (control
 *     positions), front three-quarter shots of an AGS-001 and an AGS-101,
 *     closed side, back and bottom views (lid, hinge, ports, bottom).
 * The AGS-101 (backlit) has the AGS-001 (frontlit) shell; outside, only the
 * model number on the label differs.
 *
 * Dimensions are in mm in the closed frame: x to the right, y from the front
 * edge toward the hinge, z up from the bottom. The lid is built opened flat
 * (180 deg, screen up, behind the hinge) and folded back to OPEN_DEG at
 * export. The export stands the open console up facing +z (STAND_DEG) and
 * scales it to 1 unit = 82 mm. Every glTF material names its finish in
 * extras.role.
 *
 * Run: bun scripts/generate-gbasp.ts
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARC_STEP, arcOutline, axis, buttonGeometry, disc, dpadGeometry, exportGLB, fanCap, flatCap, indexedGeometry,
  mergedAt, plate, polygon, qToLeft, qToTop, qX90, qY180, recess, recessWall, rimRings, roundedRect,
  shellGeometry, srgb, sweepSide, type Arc, type MaterialDefs, type Outline, type Part,
} from './model-geometry';

const P = Math.PI;

// ─── Dimensions (mm) ─────────────────────────────────────────────────────────

const HW = 41;                  // half of the 82 mm width
const LEN = 84.6;               // closed: front edge to the back of the hinge
const TOTAL_H = 24.3;           // closed thickness
const BASE_H = 15;              // lower half; its face is at z = BASE_H
const LID_T = 8.5;              // lid; the rubber pads keep the 0.8 mm between
const SEAM_Z = 10;              // lower half: bottom shell below, face plate above
const SEAM_INSET = 0.35;        // the bottom shell steps in at the parting line
const FACE_RIM = 2.5;           // rounded edge around the lower half's face
const FZ = BASE_H;

// Hinge: a 9.8 mm barrel, flush with the back and the top of the closed console.
const BARREL_R = 4.9;
const AXIS_Y = LEN - BARREL_R;          // 79.7
const AXIS_Z = TOTAL_H - BARREL_R;      // 19.4
const FACE_END = AXIS_Y - BARREL_R;     // 74.8, the face stops at the barrel
const KNUCKLE_X = 34.3;                 // the lower half's knuckles take the barrel's ends
const OPEN_DEG = 150;
// Display: the lower half leans back 7 deg, near upright like the GBC; the lid
// then leans 23 deg toward the camera. Tilted further up, the face mirrors the
// bright ceiling of the viewer's room environment and washes out in dark mode.
const STAND_DEG = 7;

// Lid, opened flat: from just behind the barrel to LID_TOP, screen face up.
const LID_GAP = 0.4;
const LID_LEN = FACE_END - LID_GAP;                 // 74.4
const LID_START = LEN + LID_GAP;                    // 85.0
const LID_TOP = LID_START + LID_LEN;                // 159.4
const LZ = 2 * AXIS_Z - (TOTAL_H - LID_T);          // 23.0, screen face
const LID_BACK_Z = 2 * AXIS_Z - TOTAL_H;            // 14.5, outer face
const LID_SEAM = (LZ + LID_BACK_Z) / 2;

/** y on the open lid, `v` mm down from its top edge */
const yLid = (v: number) => LID_TOP - v;

// ─── Outlines ────────────────────────────────────────────────────────────────

/** Stadium around the segment p -> q (both ends of radius r). */
function stadium(p: { x: number; y: number }, q: { x: number; y: number }, r: number): Outline {
  const t = Math.atan2(q.y - p.y, q.x - p.x);
  return arcOutline([
    { cx: q.x, cy: q.y, r, a0: t - P / 2, a1: t + P / 2 },
    { cx: p.x, cy: p.y, r, a0: t + P / 2, a1: t + P * 1.5 },
  ]);
}

/**
 * Outline through arcs run in either direction (a1 < a0 bends inward), for
 * plates and holes that are only ever drawn at inset 0.
 */
function fixedOutline(arcs: Arc[], step = ARC_STEP): Outline {
  const pts = arcs.flatMap(a => {
    const n = Math.max(1, Math.ceil(Math.abs(a.a1 - a.a0) / step - 1e-9));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = a.a0 + (a.a1 - a.a0) * (i / n);
      return new THREE.Vector2(a.cx + Math.cos(t) * a.r, a.cy + Math.sin(t) * a.r);
    });
  }).filter((p, i, all) => p.distanceTo(all[(i - 1 + all.length) % all.length]!) > 1e-7);
  return () => pts;
}

/** Rectangle with sharp corners. */
function sharpRect(w: number, h: number, cx = 0, cy = 0): Outline {
  const pts = [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sy]) => new THREE.Vector2(cx + sx! * w / 2, cy + sy! * h / 2));
  return () => pts;
}

/** Small round hole: 46 facets keep its wall under the 8-degree edge threshold with fewer points than arcOutline. */
function circle(r: number, cx: number, cy: number, seg = 46): Outline {
  const pts = Array.from({ length: seg }, (_, i) =>
    new THREE.Vector2(cx + r * Math.cos(i / seg * 2 * P), cy + r * Math.sin(i / seg * 2 * P)));
  return () => pts;
}

/** Lower half seen from above: the Game Pak slot's mouth is a notch in the front edge. */
const SLOT_HALF_W = 29.5;
const NOTCH_D = 4.5;
const BACK_R = 3;
const baseOutline = arcOutline([
  { cx: HW - 5.5, cy: 5.5, r: 5.5, a0: -P / 2, a1: 0 },
  { cx: HW - BACK_R, cy: LEN - BACK_R, r: BACK_R, a0: 0, a1: P / 2 },
  { cx: -HW + BACK_R, cy: LEN - BACK_R, r: BACK_R, a0: P / 2, a1: P },
  { cx: -HW + 5.5, cy: 5.5, r: 5.5, a0: P, a1: P * 1.5 },
  // Notch: sharp corners, the inner two turning inward.
  { cx: -SLOT_HALF_W, cy: 0, r: 0, a0: -P / 2, a1: 0 },
  { cx: -SLOT_HALF_W, cy: NOTCH_D, r: 0, a0: 0, a1: -P / 2 },
  { cx: SLOT_HALF_W, cy: NOTCH_D, r: 0, a0: -P / 2, a1: -P },
  { cx: SLOT_HALF_W, cy: 0, r: 0, a0: -P, a1: -P / 2 },
]);

// ─── Mesh builders ───────────────────────────────────────────────────────────

function quad(pts: number[][], n: number[]): THREE.BufferGeometry {
  return indexedGeometry(pts.flat(), pts.flatMap(() => n), [0, 1, 2, 0, 2, 3]);
}

/**
 * Cylinder along +y, centered; fan caps keep it lighter than CylinderGeometry.
 * A cap against another part can be left off.
 */
function drum(r: number, len: number, { top = true, bottom = true } = {}, seg = 48): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * 2 * P, x = Math.sin(a), z = Math.cos(a);
    positions.push(r * x, -len / 2, r * z, r * x, len / 2, r * z);
    normals.push(x, 0, z, x, 0, z);
    const j = (i + 1) % seg;
    indices.push(2 * i, 2 * j, 2 * i + 1, 2 * j, 2 * j + 1, 2 * i + 1);
  }
  const ring = Array.from({ length: seg }, (_, i) => new THREE.Vector2(r * Math.sin(i / seg * 2 * P), r * Math.cos(i / seg * 2 * P)));
  const cap = (y: number, n: number) => polygon(ring, p => new THREE.Vector3(p.x, y, p.y), new THREE.Vector3(0, n, 0));
  return mergeGeometries([
    indexedGeometry(positions, normals, indices), ...(top ? [cap(len / 2, 1)] : []), ...(bottom ? [cap(-len / 2, -1)] : []),
  ], false)!;
}

/**
 * Hinge knuckle at one end of the barrel. It belongs to the lower half: it
 * rises from the parting line and rounds over the barrel's axis. Open at the
 * bottom, where it stands on the bottom shell.
 */
function knuckle(x0: number, x1: number): THREE.BufferGeometry {
  const prof: [THREE.Vector2, THREE.Vector2][] = [[new THREE.Vector2(FACE_END, SEAM_Z), new THREE.Vector2(-1, 0)]];
  for (let i = 0; i <= 24; i++) {
    const n = new THREE.Vector2(Math.cos(P * (1 - i / 24)), Math.sin(P * (1 - i / 24)));
    prof.push([new THREE.Vector2(AXIS_Y + BARREL_R * n.x, AXIS_Z + BARREL_R * n.y), n]);
  }
  prof.push([new THREE.Vector2(LEN, SEAM_Z), new THREE.Vector2(1, 0)]);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  prof.forEach(([p, n]) => {
    for (const x of [x0, x1]) { positions.push(x, p.x, p.y); normals.push(0, n.x, n.y); }
  });
  for (let k = 0; k < prof.length - 1; k++) {
    const a = 2 * k;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const pts = prof.map(([p]) => p);
  return mergeGeometries([
    indexedGeometry(positions, normals, indices),
    polygon(pts, p => new THREE.Vector3(x0, p.x, p.y), new THREE.Vector3(-1, 0, 0)),
    polygon(pts, p => new THREE.Vector3(x1, p.x, p.y), new THREE.Vector3(1, 0, 0)),
  ], false)!;
}

/**
 * L or R (side s = -1 / +1): a band wrapping the bottom shell's back corner,
 * from 7.5 mm up the side to x = 32 along the back, standing 0.9 mm proud.
 */
function shoulder(s: number): THREE.BufferGeometry {
  const z0 = 1.4, z1 = 9.5;
  const chain = (off: number) => {
    const pts: [THREE.Vector2, THREE.Vector2][] = [[new THREE.Vector2(HW + off, LEN - 7.5), new THREE.Vector2(1, 0)]];
    for (let i = 0; i <= 14; i++) {
      const n = new THREE.Vector2(Math.cos(i / 14 * P / 2), Math.sin(i / 14 * P / 2));
      pts.push([new THREE.Vector2(HW - BACK_R + (BACK_R + off) * n.x, LEN - BACK_R + (BACK_R + off) * n.y), n]);
    }
    pts.push([new THREE.Vector2(32, LEN + off), new THREE.Vector2(0, 1)]);
    return pts.map(([p, n]) => [new THREE.Vector2(s * p.x, p.y), new THREE.Vector2(s * n.x, n.y)] as const);
  };
  const outer = chain(0.9), inner = chain(-0.2);
  const pieces: THREE.BufferGeometry[] = [];
  const v3 = (p: THREE.Vector2, z: number) => [p.x, p.y, z];
  for (let k = 0; k < outer.length - 1; k++) {
    const [o0, on0] = outer[k]!, [o1, on1] = outer[k + 1]!, [i0] = inner[k]!, [i1] = inner[k + 1]!;
    const wall = (a: THREE.Vector2, b: THREE.Vector2, na: THREE.Vector2, nb: THREE.Vector2, sign: number) =>
      indexedGeometry([...v3(a, z0), ...v3(b, z0), ...v3(b, z1), ...v3(a, z1)],
        [na, nb, nb, na].flatMap(n => [sign * n.x, sign * n.y, 0]), [0, 1, 2, 0, 2, 3]);
    pieces.push(wall(o0, o1, on0, on1, 1), wall(i0, i1, on0, on1, -1));
    pieces.push(quad([v3(i0, z1), v3(o0, z1), v3(o1, z1), v3(i1, z1)], [0, 0, 1]));
    pieces.push(quad([v3(i0, z0), v3(o0, z0), v3(o1, z0), v3(i1, z0)], [0, 0, -1]));
  }
  const last = outer.length - 1;
  pieces.push(quad([v3(inner[0]![0], z0), v3(outer[0]![0], z0), v3(outer[0]![0], z1), v3(inner[0]![0], z1)], [0, -1, 0]));
  pieces.push(quad([v3(inner[last]![0], z0), v3(outer[last]![0], z0), v3(outer[last]![0], z1), v3(inner[last]![0], z1)], [-s, 0, 0]));
  return mergeGeometries(pieces, false)!;
}

/**
 * Shell under a wider part that closes it at the parting line: the swept side
 * and the outer face only. A second cap in the same plane would double the
 * reflection through the clear plastic.
 */
function openShell(outline: Outline, zStart: number, zEnd: number, rimR: number, holes: Outline[] = []): THREE.BufferGeometry {
  const rings = rimRings(zStart, zEnd, rimR, 13);
  return mergeGeometries([
    sweepSide(outline, rings, Math.sign(zEnd - zStart)),
    flatCap(outline(rings[rings.length - 1]!.inset), zEnd, Math.sign(zEnd - zStart), holes.map(h => h(0))),
  ], false)!;
}

interface Opening { at: THREE.Vector3; w: number; h: number; r: number; depth: number }

/**
 * Openings cut through a flat wall. The wall (`corners`, in order, model
 * coordinates) is drawn again with a hole per opening, and each hole gets an
 * inner wall `depth` deep; its back comes apart, to be dark. `q` turns +z to
 * the wall's outward normal; w and h run along the wall's local x and y.
 */
function cutWall(corners: THREE.Vector3[], q: THREE.Quaternion, openings: Opening[]) {
  const m = new THREE.Matrix4().compose(corners[0]!, q, new THREE.Vector3(1, 1, 1));
  const inv = m.clone().invert();
  const local = (p: THREE.Vector3) => { const l = p.clone().applyMatrix4(inv); return new THREE.Vector2(l.x, l.y); };
  const holes = openings.map(o => { const c = local(o.at); return roundedRect(o.w, o.h, o.r, c.x, c.y); });
  const face = polygon(corners.map(local), p => new THREE.Vector3(p.x, p.y, 0), new THREE.Vector3(0, 0, 1), holes.map(h => h(0)));
  const wall = mergeGeometries([face, ...holes.map((h, i) => recessWall(h, 0, openings[i]!.depth, 0))], false)!.applyMatrix4(m);
  // The face's first vertices are the corners: put back their exact values,
  // so they meet the wall around them without a round-trip error.
  corners.forEach((c, i) => wall.getAttribute('position').setXYZ(i, c.x, c.y, c.z));
  return {
    wall,
    backs: mergeGeometries(holes.map((h, i) => fanCap(h(0), -openings[i]!.depth, 1)), false)!.applyMatrix4(m),
  };
}

/**
 * The Game Pak slot behind the mouth: side walls, floor, and the back wall
 * with the connector's opening (its back returned apart).
 */
function cartSlot(halfW: number, y0: number, y1: number, z0: number) {
  const x = halfW, z1 = SEAM_Z; // its ceiling is the face plate's underside
  const v = (px: number, py: number, pz: number) => new THREE.Vector3(px, py, pz);
  const back = cutWall([v(-x, y1, z0), v(x, y1, z0), v(x, y1, z1), v(-x, y1, z1)], qToFront,
    [{ at: v(0, y1, 6), w: 52, h: 2.2, r: 0, depth: 2 }]);
  return {
    walls: mergeGeometries([
      quad([[-x, y0, z0], [-x, y1, z0], [-x, y1, z1], [-x, y0, z1]], [1, 0, 0]),
      quad([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], [-1, 0, 0]),
      quad([[-x, y0, z0], [x, y0, z0], [x, y1, z0], [-x, y1, z0]], [0, 0, 1]),
      back.wall,
    ], false)!,
    connector: back.backs,
  };
}

// ─── Part registry ───────────────────────────────────────────────────────────

const parts: (Part & { lid?: boolean })[] = [];

function add(
  name: string, geometry: THREE.BufferGeometry, material: string,
  position?: [number, number, number], rotation?: THREE.Quaternion, lid = false,
) {
  parts.push({ name, geometry, material, position, rotation, lid });
}

const qToRight = axis(0, 1, 0, 90);  // +z -> +x (plates on the right side)
const qToBack = qToTop;               // +z -> +y (plates on the hinge edge)
const qToFront = axis(1, 0, 0, 90);   // +z -> -y
const qYtoX = axis(0, 0, 1, -90);     // +y -> +x (cylinders along the hinge)

// ─── Parts ───────────────────────────────────────────────────────────────────

function buildLowerHalf() {
  // Controls, measured on a near top-down photo of the lower half
  // (x from the center line, y from the front edge).
  const dpad = { x: -20.3, y: 48.6 };
  const B = { x: 12.9, y: 45.6 }, A = { x: 25.7, y: 49.1 }; // on a line rising ~15 deg
  const light = { x: 0, y: 66.4 };
  const ssX = 7.1, ssY = 10.3;

  // ── Face plate: cut open at every well, which joins its wall and floor,
  // and at the speaker's 4 x 4 holes (between the D-pad and START / SELECT),
  // 1.2 mm deep to the speaker behind them ──
  const faceOutline = roundedRect(2 * HW, FACE_END, { tl: 3, tr: 3, bl: 5.5, br: 5.5 }, 0, FACE_END / 2);
  const dpadWell = roundedRect(26.5, 26.5, 13.25, dpad.x, dpad.y);
  const abWell = stadium(B, A, 6.3);
  const ssWell = (x: number) => roundedRect(10, 10, 5, x, ssY);
  const lightWell = roundedRect(6.4, 6.4, 3.2, light.x, light.y);
  const wells: [Outline, number, number][] = [ // outline, depth, slope
    [dpadWell, 1.0, 0.9],
    [abWell, 0.9, 0.7],
    [ssWell(-ssX), 0.8, 0.8],
    [ssWell(ssX), 0.8, 0.8],
    [lightWell, 0.5, 0.4],
  ];
  const SPEAKER_D = 1.2;
  const speaker: Outline[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) speaker.push(circle(0.6, (i - 1.5) * 4.1, 29.7 + (j - 1.5) * 4.1));
  }
  add('base_face', mergeGeometries([
    shellGeometry(faceOutline, SEAM_Z, FZ, FACE_RIM, 13, [...wells.map(([o]) => o), ...speaker]),
    ...wells.map(([o, depth, slope]) => recess(o, FZ, depth, slope)),
    ...speaker.map(o => recessWall(o, FZ, SPEAKER_D, 0)),
  ], false)!, 'body');
  add('speaker_holes', mergeGeometries(speaker.map(o => fanCap(o(0), FZ - SPEAKER_D, 1)), false)!, 'hole');

  // ── D-pad (18 mm cross), A / B (7.7 mm), START / SELECT, screen light switch ──
  add('dpad', dpadGeometry(9.0, 3.45, 2.4, 0.35, 0, 0), 'keys', [dpad.x, dpad.y, FZ - 1.0]);
  const abGeo = buttonGeometry(3.85, 1.9, 0.45, 2);
  add('button_a', abGeo, 'keys', [A.x, A.y, FZ - 0.9], qX90);
  add('button_b', abGeo.clone(), 'keys', [B.x, B.y, FZ - 0.9], qX90);
  const ssGeo = buttonGeometry(2.55, 1.5, 0.25, 2);
  add('button_select', ssGeo, 'keys', [-ssX, ssY, FZ - 0.8], qX90);
  add('button_start', ssGeo.clone(), 'keys', [ssX, ssY, FZ - 0.8], qX90);
  add('light_switch', buttonGeometry(2.2, 0.9, 0.15, 2), 'keys', [light.x, light.y, FZ - 0.5], qX90);

  // ── Recharge and power LEDs: light pipes on the right edge, by the hinge ──
  const rimX = HW - FACE_RIM * (1 - Math.SQRT1_2), rimZ = FZ - FACE_RIM * (1 - Math.SQRT1_2);
  add('leds', mergedAt([61.5, 66.8].map(y => ({
    g: plate(sharpRect(1.2, 2.4), 0.08, 0.25), at: [rimX, y, rimZ] as [number, number, number], rot: axis(0, 1, 0, 45),
  }))), 'led');

  // ── Hinge: knuckles on the lower half, the barrel and its rings between ──
  // Behind the face, the lower half drops to the top of the face plate's wall
  // (a trough under the barrel); the knuckles stand at both ends.
  const zt = FZ - FACE_RIM, kx = KNUCKLE_X;
  add('base_spine', mergeGeometries([
    quad([[-kx, FACE_END, zt], [kx, FACE_END, zt], [kx, LEN, zt], [-kx, LEN, zt]], [0, 0, 1]),
    quad([[-kx, LEN, SEAM_Z], [kx, LEN, SEAM_Z], [kx, LEN, zt], [-kx, LEN, zt]], [0, 1, 0]),
  ], false)!, 'body');
  add('knuckles', mergeGeometries([knuckle(-HW, -kx), knuckle(kx, HW)], false)!, 'body');
  const cyl = (x0: number, x1: number, r = BARREL_R, caps = {}) => ({
    g: drum(r, x1 - x0, caps), at: [(x0 + x1) / 2, AXIS_Y, AXIS_Z] as [number, number, number], rot: qYtoX,
  });
  // The lid's half and the hinge cover meet at the center; short rings sit by the knuckles.
  add('hinge_barrel', mergedAt([cyl(-28.2, -0.2), cyl(0.2, 28.2), cyl(-33.9, -28.6), cyl(28.6, 33.9)]), 'body');
  add('hinge_caps', mergedAt([cyl(-HW - 0.3, -HW, 3.3, { top: false }), cyl(HW, HW + 0.3, 3.3, { bottom: false })]), 'body');

  // ── Bottom shell: battery cover, label, screws, strap holes; the Game Pak slot in front ──
  const bottomOutline: Outline = inset => baseOutline(inset + SEAM_INSET);
  const coverFront = 34.2, coverBack = 73.2, coverHW = 32.8;
  const bumpR = (11 ** 2 + 6 ** 2) / 12, bumpCy = coverFront - 6 + bumpR; // tab over the cover's screw
  const bumpA = Math.atan2(coverFront - bumpCy, 11);
  const cover = fixedOutline([
    { cx: coverHW - 2, cy: coverFront + 2, r: 2, a0: -P / 2, a1: 0 },
    { cx: coverHW - 3, cy: coverBack - 3, r: 3, a0: 0, a1: P / 2 },
    { cx: -coverHW + 3, cy: coverBack - 3, r: 3, a0: P / 2, a1: P },
    { cx: -coverHW + 2, cy: coverFront + 2, r: 2, a0: P, a1: P * 1.5 },
    { cx: 0, cy: bumpCy, r: bumpR, a0: -P - bumpA, a1: bumpA },
  ]);
  // The label's back edge curves around that tab.
  const labelFront = 7.4, labelBack = 33.2, labelHW = 38.5;
  const notchR = (16 ** 2 + 6.2 ** 2) / 12.4, notchCy = labelBack - 6.2 + notchR;
  const notchA = Math.atan2(labelBack - notchCy, 16);
  const label = fixedOutline([
    { cx: labelHW - 1.5, cy: labelFront + 1.5, r: 1.5, a0: -P / 2, a1: 0 },
    { cx: labelHW - 1.5, cy: labelBack - 1.5, r: 1.5, a0: 0, a1: P / 2 },
    { cx: 0, cy: notchCy, r: notchR, a0: notchA, a1: -P - notchA },
    { cx: -labelHW + 1.5, cy: labelBack - 1.5, r: 1.5, a0: P / 2, a1: P },
    { cx: -labelHW + 1.5, cy: labelFront + 1.5, r: 1.5, a0: P, a1: P * 1.5 },
  ]);
  const SCREWS: [number, number][] = [[-36.5, 5.0], [36.5, 5.0], [-36.6, 64.6], [36.6, 64.6]];
  const BORE_R = 1.8, BORE_D = 1.5;
  // Wrist strap attachment: a hole by each back corner, beside the accessory slot.
  const STRAP: [number, number][] = [[-30, 77], [30, 77]];
  const STRAP_R = 1.1, STRAP_D = 2.5;
  const bores = SCREWS.map(([x, y]) => roundedRect(2 * BORE_R, 2 * BORE_R, BORE_R, x, y));
  const strapHoles = STRAP.map(([x, y]) => roundedRect(2 * STRAP_R, 2 * STRAP_R, STRAP_R, x, y));

  // The bottom shell's flat walls take its openings. The slot's mouth stays
  // open above the bottom rim; the hinge edge and both sides are drawn again
  // with their ports and switch slots cut through, each with its inner wall.
  const rings = rimRings(SEAM_Z, 0, 2, 13);
  const zLow = rings[1]!.z; // the flat walls run from the bottom rim to the parting line
  const base = bottomOutline(0);
  const wallX = HW - SEAM_INSET, wallY = LEN - SEAM_INSET;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const segment = (test: (p: THREE.Vector2, q: THREE.Vector2) => boolean) =>
    base.findIndex((p, i) => test(p, base[(i + 1) % base.length]!));
  const mouth = segment((p, q) => near(p.y, q.y) && p.y < 10 && p.x < -20 && q.x > 20);
  const hingeWall = segment((p, q) => near(p.y, wallY) && near(q.y, wallY) && p.x > 0 && q.x < 0);
  const rightWall = segment((p, q) => near(p.x, wallX) && near(q.x, wallX) && q.y - p.y > 50);
  const leftWall = segment((p, q) => near(p.x, -wallX) && near(q.x, -wallX) && p.y - q.y > 50);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wallQuad = (i: number) => {
    const p = base[i]!, q = base[(i + 1) % base.length]!;
    return [v(p.x, p.y, zLow), v(q.x, q.y, zLow), v(q.x, q.y, SEAM_Z), v(p.x, p.y, SEAM_Z)];
  };

  // ── Hinge edge: EXT. 1 (link), EXT. 2 (power), accessory slots ──
  const hingeEdge = cutWall(wallQuad(hingeWall), qToBack, [
    { at: v(-8.8, wallY, 4.6), w: 10.5, h: 4.4, r: 0.8, depth: 5 },
    { at: v(10.3, wallY, 4.6), w: 12.8, h: 4.2, r: 0.8, depth: 5 },
    { at: v(-26.9, wallY, 5.8), w: 5.2, h: 6.4, r: 0, depth: 4 },
    { at: v(26.9, wallY, 5.8), w: 5.2, h: 6.4, r: 0, depth: 4 },
  ]);

  // ── Sides: power switch (right, toward the front), volume slider (left, by the hinge).
  // The slot runs through a raised frame and the wall; the nub stands in it. ──
  const FRAME_T = 0.35, SLOT_D = 1.6;
  const slider = (sign: number, y: number, len: number, nubY: number) => {
    const q = sign > 0 ? qToRight : qToLeft;
    const at = v(sign * wallX, y, 5);
    const m = new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));
    const slot = roundedRect(2.0, len - 5, 1.0);
    return {
      wall: cutWall(wallQuad(sign > 0 ? rightWall : leftWall), q, [{ at, w: 2.0, h: len - 5, r: 1.0, depth: SLOT_D }]),
      frame: mergeGeometries([
        openShell(roundedRect(6, len, 0.8), 0, FRAME_T, 0, [slot]),
        recessWall(slot, FRAME_T, FRAME_T, 0),
      ], false)!.applyMatrix4(m),
      nub: plate(sharpRect(1.8, 3.0, 0, nubY - y), FRAME_T + 0.9, FRAME_T + 0.9 + SLOT_D - 0.1).applyMatrix4(m),
    };
  };
  const power = slider(1, 23, 16, 19.5);   // OFF: slid toward the front
  const volume = slider(-1, 65.5, 14, 65.5);

  add('base_bottom', mergeGeometries([
    sweepSide(bottomOutline, rings, -1, undefined, (i, r) => r === 0 && [mouth, hingeWall, rightWall, leftWall].includes(i)),
    hingeEdge.wall, power.wall.wall, volume.wall.wall,
    flatCap(bottomOutline(rings[rings.length - 1]!.inset), 0, -1, [cover, label, ...bores, ...strapHoles].map(h => h(0))),
    // The face plate closes the parting line in front of the hinge; behind it,
    // under the spine and the knuckles, the bottom shell closes itself.
    fanCap([new THREE.Vector2(wallX, FACE_END), ...base.filter(p => p.y > FACE_END), new THREE.Vector2(-wallX, FACE_END)], SEAM_Z, 1),
    ...bores.map(o => recess(o, 0, BORE_D, 0, 1)),
    ...strapHoles.map(o => recessWall(o, 0, STRAP_D, 0, 1)),
    recessWall(label, 0, 0.25, 0, 1),
  ], false)!, 'bodyDark');
  add('ports', hingeEdge.backs, 'hole');
  add('switch_frames', mergeGeometries([power.frame, volume.frame], false)!, 'body');
  add('switch_slots', mergeGeometries([power.wall.backs, volume.wall.backs], false)!, 'hole');
  add('switch_nubs', mergeGeometries([power.nub, volume.nub], false)!, 'keys');

  const mouthY = NOTCH_D + SEAM_INSET, slotHW = SLOT_HALF_W + SEAM_INSET, slotEnd = 32;
  const gamePak = cartSlot(slotHW, mouthY, slotEnd, zLow);
  add('cart_slot', gamePak.walls, 'inset');
  add('cart_slit', gamePak.connector, 'hole');

  add('battery_cover', plate(cover, -0.15, 0.6, -1), 'bodyDark');
  add('cover_panel', openShell(roundedRect(39, 11.7, 1.5, 0, 52.5), -0.15, -0.35, 0), 'body'); // "GAME BOY"
  // Labels are one outer face: print is drawn front side only, so they don't show through the console.
  add('label', flatCap(label(0), 0.25, -1), 'sticker');
  add('screws', mergedAt([
    ...SCREWS.map(([x, y]) => ({ g: disc(BORE_R - 0.4, 24), at: [x, y, BORE_D - 0.05] as [number, number, number], rot: qY180 })),
    { g: disc(1.3, 24), at: [0, coverFront - 2.8, -0.2], rot: qY180 }, // battery cover screw
  ]), 'hole');
  add('strap_holes', mergedAt(STRAP.map(([x, y]) =>
    ({ g: disc(STRAP_R, 24), at: [x, y, STRAP_D] as [number, number, number], rot: qY180 }))), 'hole');

  // ── Hinge edge: L / R ──
  add('button_l', shoulder(-1), 'keys');
  add('button_r', shoulder(1), 'keys');
}

function buildLid() {
  const lid = true;
  const lidOutline = roundedRect(2 * HW, LID_LEN, { tl: 5.5, tr: 5.5, bl: 3.2, br: 3.2 }, 0, LID_START + LID_LEN / 2);

  // ── Screen face: the lens sits 0.3 mm deep in a pocket; five rubber screw covers ──
  const lens = roundedRect(70, 54.3, 2.5, 0, yLid(34.35));
  const pocket: Outline = inset => lens(inset - 0.6);
  const POCKET_D = 0.8, LENS_TOP = LZ - 0.3;
  const pads: [number, number][] = [[-34.5, 4], [0, 4], [34.5, 4], [-34.5, 66.9], [34.5, 66.9]];
  const padWell = ([x, v]: [number, number]) => roundedRect(4.6, 4.6, 2.3, x, yLid(v));
  const wells: [Outline, number, number][] = [[pocket, POCKET_D, 0.1], ...pads.map(p => [padWell(p), 0.4, 0.15] as [Outline, number, number])];
  // Small slots in both sides at the parting line, near each end: the flat
  // part of each side wall is drawn again with them cut through.
  const rings = rimRings(LID_SEAM, LZ, 1.5, 13);
  const edge = lidOutline(0);
  const side = (sign: number) => edge.findIndex((p, i) => {
    const q = edge[(i + 1) % edge.length]!;
    return Math.abs(p.x - sign * HW) < 1e-3 && Math.abs(q.x - sign * HW) < 1e-3 && sign * (q.y - p.y) > 50;
  });
  const slits = (sign: number) => {
    const i = side(sign), p = edge[i]!, q = edge[(i + 1) % edge.length]!;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    return cutWall([v(p.x, p.y, LID_SEAM), v(q.x, q.y, LID_SEAM), v(q.x, q.y, rings[1]!.z), v(p.x, p.y, rings[1]!.z)],
      sign > 0 ? qToRight : qToLeft,
      [7, 67.4].map(d => ({ at: v(sign * HW, yLid(d), LID_SEAM + 0.85), w: 0.8, h: 2.6, r: 0, depth: 1.2 })));
  };
  const right = slits(1), left = slits(-1);
  add('lid_face', mergeGeometries([
    sweepSide(lidOutline, rings, 1, undefined, (i, r) => r === 0 && (i === side(1) || i === side(-1))),
    right.wall, left.wall,
    flatCap(lidOutline(rings[rings.length - 1]!.inset), LZ, 1, wells.map(([o]) => o(0))),
    flatCap(lidOutline(0), LID_SEAM, -1),
    ...wells.map(([o, depth, slope]) => recess(o, LZ, depth, slope)),
  ], false)!, 'body', undefined, undefined, lid);
  add('lid_slits', mergeGeometries([right.backs, left.backs], false)!, 'hole', undefined, undefined, lid);
  add('lens', shellGeometry(lens, LZ - POCKET_D, LENS_TOP, 0), 'screen', undefined, undefined, lid);

  // LCD window, a little larger than the 61.2 x 40.8 mm picture
  add('lcd', plate(sharpRect(62.5, 43, 0, yLid(33.7)), LENS_TOP + 0.27, 0.27), 'lcd', undefined, undefined, lid);
  // "GAME BOY ADVANCE SP" under the picture
  add('logo_strip', plate(sharpRect(38, 3.0, 0, yLid(58.4)), LENS_TOP + 0.16, 0.16), 'label', undefined, undefined, lid);
  const padGeo = drum(2.0, 1.0, { bottom: false });
  add('pads', mergedAt(pads.map(([x, v]) => ({ g: padGeo, at: [x, yLid(v), LZ + 0.1] as [number, number, number], rot: qX90 }))),
    'rubber', undefined, undefined, lid);

  // ── Outer face: the Nintendo badge near the front edge ──
  const back: Outline = inset => lidOutline(inset + SEAM_INSET);
  const badge = roundedRect(20, 6.5, 3.25, 0, yLid(9.7));
  add('lid_back', mergeGeometries([
    openShell(back, LID_SEAM, LID_BACK_Z, 2.5, [badge]),
    recessWall(badge, LID_BACK_Z, 0.1, 0.05, 1),
  ], false)!, 'bodyDark', undefined, undefined, lid);
  add('badge', flatCap(badge(0.05), LID_BACK_Z + 0.1, -1), 'badge', undefined, undefined, lid);
}

// ─── Pose and export ─────────────────────────────────────────────────────────

/** Folds the lid to OPEN_DEG, stands the console up (STAND_DEG), centers it, 1 unit = 82 mm. */
function pose(list: typeof parts): Part[] {
  const fold = (180 - OPEN_DEG) * P / 180;
  const open = new THREE.Matrix4().makeTranslation(0, AXIS_Y, AXIS_Z)
    .multiply(new THREE.Matrix4().makeRotationX(fold))
    .multiply(new THREE.Matrix4().makeTranslation(0, -AXIS_Y, -AXIS_Z));
  const stand = new THREE.Matrix4().makeRotationX(-STAND_DEG * P / 180);
  const posed = list.map(p => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.position ?? [0, 0, 0])), p.rotation ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    if (p.lid) m.premultiply(open);
    m.premultiply(stand);
    const geometry = p.geometry.clone().applyMatrix4(m);
    geometry.deleteAttribute('uv');
    return { name: p.name, material: p.material, geometry };
  });
  const bounds = new THREE.Box3();
  for (const p of posed) { p.geometry.computeBoundingBox(); bounds.union(p.geometry.boundingBox!); }
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  console.log(`  posed size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`);
  const unit = new THREE.Matrix4().makeScale(1 / 82, 1 / 82, 1 / 82)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  for (const p of posed) p.geometry.applyMatrix4(unit);
  return posed;
}

/** Colors (AGS-101 Pearl Blue) are for other glTF viewers; the portfolio uses `role`. */
const MATERIALS: MaterialDefs = {
  body:     { color: srgb(0xa9c8dc), metallic: 0.30, roughness: 0.35, role: 'shell' }, // pearl blue
  bodyDark: { color: srgb(0x9bbbd0), metallic: 0.30, roughness: 0.40, role: 'shell' },
  inset:    { color: srgb(0x8eaec4), metallic: 0.25, roughness: 0.45, role: 'shell' }, // Game Pak slot
  screen:   { color: srgb(0x141418), metallic: 0.05, roughness: 0.10, role: 'lens' },
  lcd:      { color: srgb(0x2a2d2c), metallic: 0.00, roughness: 0.60, role: 'lcd' },
  label:    { color: srgb(0xc9cdd3), metallic: 0.00, roughness: 0.40, role: 'print' }, // logo on the lens
  sticker:  { color: srgb(0x26262a), metallic: 0.00, roughness: 0.50, role: 'print' }, // bottom label
  badge:    { color: srgb(0x141418), metallic: 0.05, roughness: 0.10, role: 'print' }, // Nintendo badge
  keys:     { color: srgb(0xc6c8cc), metallic: 0.05, roughness: 0.45, role: 'button' }, // buttons, L / R, nubs
  rubber:   { color: srgb(0x9fc2d8), metallic: 0.00, roughness: 0.80, role: 'rubber' }, // screw covers
  hole:     { color: srgb(0x1c1c20), metallic: 0.05, roughness: 0.60, role: 'cavity' }, // holes, ports, screws
  led:      { color: srgb(0x8a1622), metallic: 0.00, roughness: 0.25, role: 'print' },
};

buildLowerHalf();
buildLid();
await exportGLB(pose(parts), MATERIALS, 'GameBoyAdvanceSP', './public/models/gbasp.glb');
