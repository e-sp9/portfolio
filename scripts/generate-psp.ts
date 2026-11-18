/**
 * Generate a faithful PlayStation Portable (PSP-1000, the original model) 3D
 * model (.glb).
 *
 * Built like generate-gbasp.ts and generate-ds.ts (three.js math, exported
 * via @gltf-transform, helpers shared in model-geometry.ts). Sources:
 *   - Sony's PSP-1000 instruction manual (Japanese, 2-657-883-01): main
 *     specifications (about 170 x 74 x 23 mm without the largest
 *     protrusions, about 280 g with the battery, a 4.3-inch 16:9 LCD) and the
 *     parts drawings, which are orthographic and were measured at 8.1 px per
 *     mm: the front (L / R, the D-pad's four buttons, the Memory Stick and
 *     wireless LAN lamps, the analog pad, the strap holder, the speakers by
 *     the screen's lower corners, HOME, VOL - / +, the display and sound
 *     buttons, SELECT, START, the face buttons, the POWER and HOLD lamps),
 *     the back (battery cover and its PUSH button, disc cover), the top
 *     (infrared port, USB, OPEN switch), the bottom (headphone / remote jack,
 *     charge terminals, DC IN 5V), the left end (Memory Stick Duo slot,
 *     wireless LAN switch) and the right end (POWER / HOLD switch).
 *   - Photos of the hardware (Wikimedia Commons): front, three-quarter,
 *     back, top, bottom and both ends of a PSP-1000; close-ups of the dotted
 *     grille above the screen, the face buttons and the D-pad.
 *   - The LCD's active area, 95.04 x 53.86 mm (480 x 272 dots).
 *
 * The body is three layers, as on the real one: the glossy front shell, a
 * silver frame around the middle (the ports and switches are on it) and the
 * back shell, whose back is the disc cover between two low domes (the
 * battery cover on the right, the grip on the left). L / R fill the top
 * corners; the frame comes forward in both bottom corners (the strap holder
 * goes through the left one, DC IN is under the right one).
 *
 * Dimensions are in mm: x to the right, y up, z from the back of the grips
 * (0) to the face (23). The export centers it and scales it to 1 unit =
 * 170 mm, facing +z. Every glTF material names its finish in extras.role.
 *
 * Run: bun scripts/generate-psp.ts
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARC_STEP, buttonGeometry, circle, cutWall, exportGLB, fanCap, flatCap, indexedGeometry, openShell,
  outlineNormals, plate, polygon, qToFront, qToTop, qX90, recess, recessWall, rimRings, roundedRect, shellGeometry, srgb, stadium,
  sweepSide, type MaterialDefs, type Outline, type Part, type Ring,
} from './model-geometry';

const P = Math.PI;
const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mx = (p: THREE.Vector2) => v2(-p.x, p.y);

// ─── Dimensions (mm) ─────────────────────────────────────────────────────────

const HH = 37;                          // 170 x 74 mm
// The ends are wide arcs that round into the top and bottom edges.
const END_R = 55, END_CX = 30;          // reaching x = 85
const CORNER_R = 10, CORNER_CX = 66, CORNER_CY = HH - CORNER_R;
const J = Math.atan2(CORNER_CY, CORNER_CX - END_CX);   // 36.9 deg, where they meet

// Layers, from the face back: the front shell, the silver frame, the back
// shell; L / R reach back into it. The back is the disc cover's level; the
// grips rise from it to z = 0.
const FZ = 23;
const FRONT_Z = 16.2;
const BACK_Z = 10.4;
const SHOULDER_Z = 5.7;
const BACK_FLAT = 3.2;
const FACE_RIM = 1.5;                   // the face's rounded edge
const BACK_RIM = 2;
const ZONE_Z = FZ - FACE_RIM;           // 21.5: top of L / R and of the frame's bottom corners
const DOOR_Z = 2.85;                    // the disc cover, a little proud of the back

// Where L / R (top) and the frame's corner pieces (bottom) cut into the face,
// measured on the front drawing; mirrored for the left.
const onEnd = (y: number) => v2(END_CX + Math.sqrt(END_R ** 2 - y ** 2), y);
const P1 = v2(55.4, HH), P2 = v2(60.5, 30.9), P3 = v2(72.5, 29.8), P4 = onEnd(25.5);
const Q1 = v2(54.6, -HH), Q2 = v2(59.6, -31.0), Q3 = v2(73.0, -30.6), Q4 = onEnd(-28.5);
const tP = Math.asin(P4.y / END_R), tQ = Math.asin(Q4.y / END_R);
const ZONE_FILLET = 3;

// ─── Outlines ────────────────────────────────────────────────────────────────

/** An arc (CCW, a0 < a1), or a sharp corner (r = 0) between edges whose outward normals are a0 and a1. */
interface Node { cx: number; cy: number; r: number; a0: number; a1: number }

/**
 * Like arcOutline, for outlines with sharp corners where an arc ends: a
 * corner moves along its miter, so both edges beside it move by the full
 * inset, and it takes the place of the arc's end point there. A corner whose
 * two normals agree is a plain point on a straight edge.
 */
function nodeOutline(nodes: Node[]): Outline {
  const raw = (inset: number) => nodes.flatMap(n => {
    if (n.r === 0) {
      const n0 = v2(Math.cos(n.a0), Math.sin(n.a0)), n1 = v2(Math.cos(n.a1), Math.sin(n.a1));
      const m = n0.add(n1).divideScalar(1 + Math.cos(n.a1 - n.a0));
      return [{ p: v2(n.cx - inset * m.x, n.cy - inset * m.y), corner: true }];
    }
    const steps = Math.max(1, Math.ceil((n.a1 - n.a0) / ARC_STEP - 1e-9));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = n.a0 + (n.a1 - n.a0) * (i / steps);
      return { p: v2(n.cx + Math.cos(t) * (n.r - inset), n.cy + Math.sin(t) * (n.r - inset)), corner: false };
    });
  });
  const base = raw(0);
  // Where two points meet, keep the corner, or the first of two arc ends.
  const keep = base.map((q, i) => {
    const prev = base[(i - 1 + base.length) % base.length]!, next = base[(i + 1) % base.length]!;
    if (q.p.distanceTo(prev.p) < 1e-6 && !(q.corner && !prev.corner)) return false;
    return !(q.p.distanceTo(next.p) < 1e-6 && next.corner && !q.corner);
  });
  return inset => raw(inset).filter((_, i) => keep[i]).map(q => q.p);
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number): Node => ({ cx, cy, r, a0, a1 });
const point = (p: THREE.Vector2, a: number): Node => ({ cx: p.x, cy: p.y, r: 0, a0: a, a1: a });
const tangent = (t: number) => v2(-Math.sin(t), Math.cos(t));   // along a CCW arc at angle t

/** Corner of a CCW outline at c, between the edges from `prev` and to `next`: sharp, or a convex fillet of radius r. */
function corner(prev: THREE.Vector2, c: THREE.Vector2, next: THREE.Vector2, r = 0): Node {
  const d0 = c.clone().sub(prev).normalize(), d1 = next.clone().sub(c).normalize();
  const a0 = Math.atan2(-d0.x, d0.y);
  const a1 = a0 + Math.atan2(d0.cross(d1), d0.dot(d1));
  if (r === 0) return { cx: c.x, cy: c.y, r: 0, a0, a1 };
  // The center is r in from both edges.
  const m = v2(-d0.y, d0.x).add(v2(-d1.y, d1.x)).divideScalar(1 + d0.dot(d1));
  return { cx: c.x + r * m.x, cy: c.y + r * m.y, r, a0, a1 };
}

/** The body seen from the front, with points where L / R and the corner pieces begin. */
const body = nodeOutline([
  arc(END_CX, 0, END_R, -J, tQ), arc(END_CX, 0, END_R, tQ, tP), arc(END_CX, 0, END_R, tP, J),
  arc(CORNER_CX, CORNER_CY, CORNER_R, J, P / 2),
  point(P1, P / 2), point(mx(P1), P / 2),
  arc(-CORNER_CX, CORNER_CY, CORNER_R, P / 2, P - J),
  arc(-END_CX, 0, END_R, P - J, P - tP), arc(-END_CX, 0, END_R, P - tP, P - tQ), arc(-END_CX, 0, END_R, P - tQ, P + J),
  arc(-CORNER_CX, -CORNER_CY, CORNER_R, P + J, P * 1.5),
  point(mx(Q1), P * 1.5), point(Q1, P * 1.5),
  arc(CORNER_CX, -CORNER_CY, CORNER_R, P * 1.5, P * 2 - J),
]);

/** The front shell: the body less L / R and the corner pieces. */
const face = nodeOutline([
  corner(v2(Q1.x - 1, -HH), Q1, Q2), corner(Q1, Q2, Q3), corner(Q2, Q3, Q4, ZONE_FILLET),
  corner(Q3, Q4, Q4.clone().add(tangent(tQ))),
  arc(END_CX, 0, END_R, tQ, tP),
  corner(P4.clone().sub(tangent(tP)), P4, P3), corner(P4, P3, P2, ZONE_FILLET), corner(P3, P2, P1),
  corner(P2, P1, v2(P1.x - 1, HH)),
  corner(v2(-P1.x + 1, HH), mx(P1), mx(P2)), corner(mx(P1), mx(P2), mx(P3)), corner(mx(P2), mx(P3), mx(P4), ZONE_FILLET),
  corner(mx(P3), mx(P4), mx(P4).add(tangent(P - tP))),
  arc(-END_CX, 0, END_R, P - tP, P - tQ),
  corner(mx(Q4).sub(tangent(P - tQ)), mx(Q4), mx(Q3)), corner(mx(Q4), mx(Q3), mx(Q2), ZONE_FILLET),
  corner(mx(Q3), mx(Q2), mx(Q1)), corner(mx(Q2), mx(Q1), v2(-Q1.x + 1, -HH)),
]);

const bodyPts = body(0), facePts = face(0);
const indexOf = (pts: THREE.Vector2[], p: THREE.Vector2) => pts.findIndex(q => q.distanceTo(p) < 1e-6);
/** Indices of a closed outline's points from a to b, going forward. */
function chain(pts: THREE.Vector2[], a: THREE.Vector2, b: THREE.Vector2): number[] {
  const out = [indexOf(pts, a)], end = indexOf(pts, b);
  while (out[out.length - 1] !== end) out.push((out[out.length - 1]! + 1) % pts.length);
  return out;
}
/** A zone between the body and the front shell: the body's edge a -> b, then the front shell's edge back. */
const zone = (a: THREE.Vector2, b: THREE.Vector2) =>
  [...chain(bodyPts, a, b).map(i => bodyPts[i]!), ...chain(facePts, a, b).reverse().slice(1, -1).map(i => facePts[i]!)];

const segMid = (pts: THREE.Vector2[], i: number) => pts[i]!.clone().add(pts[(i + 1) % pts.length]!).multiplyScalar(0.5);
/** Body edges that L / R take. */
const inShoulder = bodyPts.map((_, i) => { const m = segMid(bodyPts, i); return m.y > P4.y - 1e-6 && Math.abs(m.x) > P1.x - 1e-6; });
/** Front shell edges that face L / R or a corner piece rather than the outside. */
const onZone = facePts.map((_, i) => {
  const m = segMid(facePts, i);
  return bodyPts.every((p, k) => distToSeg(m, p, bodyPts[(k + 1) % bodyPts.length]!) > 0.01);
});
function distToSeg(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}
/** Segment indices of a closed outline whose midpoints pass `test`. */
const segs = (pts: THREE.Vector2[], test: (m: THREE.Vector2) => boolean) =>
  pts.map((_, i) => i).filter(i => test(segMid(pts, i)));

// ─── Mesh builders ───────────────────────────────────────────────────────────

/** Circle whose radius shrinks with the inset (wells with sloped walls). */
const ring = (r: number, cx: number, cy: number, seg = 46): Outline => inset => circle(r - inset, cx, cy, seg)(0);

const wallRings = (z0: number, z1: number): Ring[] => [{ inset: 0, z: z0, blend: 0 }, { inset: 0, z: z1, blend: 0 }];

/** Places local x / y / z along the given axes, at `at`. */
function placed(g: THREE.BufferGeometry, at: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at));
}

/**
 * Inside of a small round hole cut in a face at zTop: one dark cone to its
 * point `depth` in, for wall and back together.
 */
function pit(r: number, x: number, y: number, zTop: number, depth: number, seg: number): THREE.BufferGeometry {
  const rim = circle(r, x, y, seg)(0);
  const positions = [x, y, zTop - depth], normals = [0, 0, 1], indices: number[] = [];
  rim.forEach((p, i) => {
    const n = v3(-(p.x - x) * depth, -(p.y - y) * depth, r * r).normalize();
    positions.push(p.x, p.y, zTop); normals.push(n.x, n.y, n.z);
    indices.push(0, 1 + i, 1 + (i + 1) % rim.length);
  });
  return indexedGeometry(positions, normals, indices);
}

/** Flat print on a face at z, facing `dir` (+1 front, -1 back): one face, holes allowed. */
const print = (pts: THREE.Vector2[], z: number, dir = 1, holes: THREE.Vector2[][] = []) =>
  polygon(pts, p => v3(p.x, p.y, z), v3(0, 0, dir), holes);
const pts2 = (xy: number[][]) => xy.map(([x, y]) => v2(x!, y!));

interface SideOpening { y: number; len: number; z: number; h: number; r: number; depth: number }

/**
 * Openings cut through a curved run of the body's side wall (the ends are
 * arcs): the run of outline points `idx` between z0 and z1 is unrolled (arc
 * length along it, height), cut there and wrapped back. Its edge points are
 * the sweep's own, so it fills the gap the sweep leaves for it. `frame`
 * gives the wall's axes at an opening, for what stands in it.
 */
function cutSide(outline: Outline, idx: number[], z0: number, z1: number, openings: SideOpening[]) {
  const all = outline(0), nrm = outlineNormals(all);
  const pts = idx.map(i => all[i]!), ns = idx.map(i => nrm[i]!);
  const S = pts.map((_, k) => pts.slice(1, k + 1).reduce((s, p, j) => s + p.distanceTo(pts[j]!), 0));
  const along = (s: number) => {
    let k = 0;
    while (k < pts.length - 2 && S[k + 1]! < s) k++;
    const t = (s - S[k]!) / (S[k + 1]! - S[k]!);
    return { p: pts[k]!.clone().lerp(pts[k + 1]!, t), n: ns[k]!.clone().lerp(ns[k + 1]!, t).normalize(), d: pts[k + 1]!.clone().sub(pts[k]!).normalize() };
  };
  const sAt = (y: number) => {
    const k = pts.findIndex((p, j) => j < pts.length - 1 && (p.y - y) * (pts[j + 1]!.y - y) <= 0);
    return S[k]! + (S[k + 1]! - S[k]!) * (y - pts[k]!.y) / (pts[k + 1]!.y - pts[k]!.y);
  };
  const to3 = (q: THREE.Vector2) => { const a = along(q.x); return v3(a.p.x, a.p.y, q.y); };
  const nAt = (s: number) => { const n = along(s).n; return v3(n.x, n.y, 0); };

  const boundary = [...S.map(s => v2(s, z0)), ...[...S].reverse().map(s => v2(s, z1))];
  const holes = openings.map(o => roundedRect(o.len, o.h, o.r, sAt(o.y), o.z)(0));
  const flat = [...boundary, ...holes.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(boundary, holes);
  const positions: number[] = [], normals: number[] = [];
  flat.forEach(q => { const p = to3(q), n = nAt(q.x); positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); });
  const wall = indexedGeometry(positions, normals, faces.flat());
  // Exact edge points, so the patch meets the sweep around it.
  boundary.forEach((q, i) => {
    const k = i < S.length ? i : boundary.length - 1 - i;
    wall.getAttribute('position').setXYZ(i, pts[k]!.x, pts[k]!.y, q.y);
  });

  const inner: THREE.BufferGeometry[] = [], backs: THREE.BufferGeometry[] = [];
  holes.forEach((h, j) => {
    const depth = openings[j]!.depth, m = h.length;
    const hn = outlineNormals(h);
    const pos: number[] = [], nor: number[] = [], ind: number[] = [];
    for (const dd of [0, depth]) {
      h.forEach((q, i) => {
        const p = to3(q).addScaledVector(nAt(q.x), -dd);
        const a = along(q.x), n = v3(-a.d.x * hn[i]!.x, -a.d.y * hn[i]!.x, -hn[i]!.y).normalize();
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      });
    }
    for (let i = 0; i < m; i++) { const b = (i + 1) % m; ind.push(i, b, i + m, b, b + m, i + m); }
    inner.push(indexedGeometry(pos, nor, ind));
    const c = h.reduce((s, q) => s.add(q), v2(0, 0)).divideScalar(m);
    const back = [c, ...h].map(q => to3(q).addScaledVector(nAt(q.x), -depth));
    const n = nAt(c.x);
    backs.push(indexedGeometry(back.flatMap(p => [p.x, p.y, p.z]), back.flatMap(() => [n.x, n.y, n.z]),
      h.flatMap((_, i) => [0, 1 + i, 1 + (i + 1) % m])));
  });
  const frame = (y: number, z: number) => {
    const s = sAt(y), a = along(s);
    return { at: v3(a.p.x, a.p.y, z), x: v3(a.d.x, a.d.y, 0), y: v3(0, 0, 1), z: nAt(s) };
  };
  return { wall: mergeGeometries([wall, ...inner], false)!, backs: mergeGeometries(backs, false)!, frame };
}

/**
 * A low dome on the back, side s = +1 (the battery cover) or -1 (the grip):
 * from the disc cover's edge out to the end, between GRIP_Y0 and GRIP_Y1,
 * rising BACK_FLAT from the back to z = 0 in the middle. Its edge lies on
 * the back; `edge` is its outline there, for the hole it fills.
 */
const GRIP_X0 = 37.7, GRIP_Y0 = -31.0, GRIP_Y1 = 30.0;
const gripX1 = (y: number) => END_CX + Math.sqrt((END_R - 2.4) ** 2 - y ** 2);
function gripAt(u: number, v: number, s = 1) {
  const y = GRIP_Y0 + v * (GRIP_Y1 - GRIP_Y0);
  return v3(s * (GRIP_X0 + u * (gripX1(y) - GRIP_X0)), y, BACK_FLAT * (1 - Math.sin(P * u) * Math.sin(P * v)));
}
function grip(s: number) {
  const NU = 12, NV = 14;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, v = j / NV, e = 1e-4;
      const p = gripAt(u, v, s);
      const du = gripAt(Math.min(u + e, 1), v, s).sub(gripAt(Math.max(u - e, 0), v, s));
      const dv = gripAt(u, Math.min(v + e, 1), s).sub(gripAt(u, Math.max(v - e, 0), s));
      const n = du.cross(dv).normalize();
      if (n.z > 0) n.negate();
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z);
      if (i < NU && j < NV) {
        const a = j * (NU + 1) + i;
        indices.push(a, a + 1, a + NU + 1, a + 1, a + NU + 2, a + NU + 1);
      }
    }
  }
  const at = (i: number, j: number) => { const p = gripAt(i / NU, j / NV, s); return v2(p.x, p.y); };
  const edge = [
    ...Array.from({ length: NU }, (_, i) => at(i, 0)), ...Array.from({ length: NV }, (_, j) => at(NU, j)),
    ...Array.from({ length: NU }, (_, i) => at(NU - i, NV)), ...Array.from({ length: NV }, (_, j) => at(0, NV - j)),
  ];
  return { geometry: indexedGeometry(positions, normals, indices), edge };
}

/** Outline of a stroke `w` wide along a polyline, with square ends and mitered turns. */
function stroke(line: THREE.Vector2[], w: number): THREE.Vector2[] {
  const n = line.length, left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
  line.forEach((p, i) => {
    const d0 = (i > 0 ? p.clone().sub(line[i - 1]!) : line[1]!.clone().sub(p)).normalize();
    const d1 = i < n - 1 ? line[i + 1]!.clone().sub(p).normalize() : d0;
    const m = v2(-d0.y, d0.x).add(v2(-d1.y, d1.x)).divideScalar(1 + d0.dot(d1)).multiplyScalar(w / 2);
    left.push(p.clone().add(m)); right.push(p.clone().sub(m));
  });
  return [...left, ...right.reverse()];
}

/** The PSP logo (P, S, P) as center lines, measured on the front drawing and centered. */
const LOGO = [
  [[-10.36, -1.7], [-10.36, 0.1], [-4.39, 0.1], [-4.39, 1.705], [-10.66, 1.705]],
  [[3.01, 1.705], [-0.425, 1.705], [-0.425, -1.685], [-3.87, -1.685]],
  [[4.39, -1.7], [4.39, 0.1], [10.36, 0.1], [10.36, 1.705], [4.09, 1.705]],
];
/** The logo scaled by s around y = dy (mirrored in x when seen from the back), strokes w wide. */
const pspLogo = (s: number, dy: number, mirror: number, w: number) =>
  LOGO.map(line => stroke(line.map(([x, y]) => v2(mirror * s * x!, s * y! + dy)), w));

// ─── Part registry ───────────────────────────────────────────────────────────

const parts: Part[] = [];
const add = (name: string, geometry: THREE.BufferGeometry, material: string) => parts.push({ name, geometry, material });

// ─── Front ───────────────────────────────────────────────────────────────────

// Controls, measured on the front drawing (x from the center line, y from
// the middle of the body's height).
const LENS = { x: 0, y: 2.3, w: 97.2, h: 56.0 };
const DPAD = v2(-65, 3.5);
const PAD = v2(-64.4, -19.0);
const FACE_BTNS = v2(65, 3.5), FACE_SPREAD = 10.6;
const SPEAKERS = [v2(-55.2, -25.8), v2(55.2, -25.8)];

/** HOME, SELECT and START: flat on top, round below. */
function bowl(w: number, h: number, cx: number, cy: number): Outline {
  const R = (w * w / 4 + h * h) / (2 * h), yc = cy - h / 2 + R, rc = 0.6, fy = cy + h / 2 - rc;
  const fx = Math.sqrt((R - rc) ** 2 - (fy - yc) ** 2), t = Math.atan2(fy - yc, fx);
  return nodeOutline([arc(cx, yc, R, P - t, 2 * P + t), arc(cx + fx, fy, rc, t, P / 2), arc(cx - fx, fy, rc, P / 2, P - t)]);
}

const BOTTOM_BTNS: [string, Outline][] = [
  ['button_home', bowl(9, 3.4, -46.7, -31.1)],
  ['button_vol_down', stadium(v2(-33.95, -31.0), v2(-31.25, -31.0), 1.65)],
  ['button_vol_up', stadium(v2(-22.85, -31.0), v2(-20.15, -31.0), 1.65)],
  ['button_display', stadium(v2(17.35, -31.5), v2(20.15, -31.5), 1.8)],
  ['button_sound', stadium(v2(24.6, -31.5), v2(27.4, -31.5), 1.8)],
  ['button_select', bowl(9, 3.4, 36.5, -31.3)],
  ['button_start', bowl(9, 3.4, 47.6, -31.3)],
];

/** The dotted grille above the screen: three staggered rows between L and R. */
const GRILLE: THREE.Vector2[] = [];
for (const [y, x0, off] of [[34.94, 54.1, 0], [33.67, 54.9, 0.5], [32.28, 55.7, 0]] as const) {
  for (let k = -40; k <= 40; k++) {
    const x = (k + off) * 1.53;
    if (Math.abs(x) <= x0) GRILLE.push(v2(x, y));
  }
}
const GRILLE_R = 0.36, GRILLE_SEG = 6;

function buildFront() {
  const lens = roundedRect(LENS.w, LENS.h, 1.5, LENS.x, LENS.y);
  const dpadWell = ring(13, DPAD.x, DPAD.y, 56);
  const padWell = ring(5.9, PAD.x, PAD.y);
  const faceBtn = [P / 2, 0, -P / 2, P].map(a => v2(FACE_BTNS.x + FACE_SPREAD * Math.cos(a), FACE_BTNS.y + FACE_SPREAD * Math.sin(a)));
  const faceWells = faceBtn.map(c => ring(5.2, c.x, c.y));
  const speakers = SPEAKERS.map(c => roundedRect(3.9, 2.7, 1.0, c.x, c.y));
  const grille = GRILLE.map(c => circle(GRILLE_R, c.x, c.y, GRILLE_SEG));
  const holes = [lens, dpadWell, padWell, ...faceWells, ...BOTTOM_BTNS.map(([, o]) => o), ...speakers, ...grille];

  // ── Front shell: its sides from the frame up and round over onto the face;
  // where it meets L / R and the corner pieces, they cover its side up to
  // their tops ──
  const SPEAKER_D = 1.5;
  add('front_shell', mergeGeometries([
    sweepSide(face, rimRings(FRONT_Z, FZ, FACE_RIM, 13), 1, undefined, (i, r) => r === 0 && onZone[i]!),
    flatCap(face(FACE_RIM), FZ, 1, holes.map(h => h(0))),
    recess(dpadWell, FZ, 1.0, 0.5),
    recess(padWell, FZ, 1.6, 0.2),
    ...faceWells.map(o => recess(o, FZ, 1.2, 0.3)),
    ...speakers.map(o => recessWall(o, FZ, SPEAKER_D, 0)),
  ], false)!, 'body');
  add('speaker_holes', mergeGeometries(speakers.map(o => fanCap(o(0), FZ - SPEAKER_D, 1)), false)!, 'hole');
  add('grille_holes', mergeGeometries(GRILLE.map(c => pit(GRILLE_R, c.x, c.y, FZ, 1.0, GRILLE_SEG)), false)!, 'hole');

  // ── Screen: the faceplate is clear and painted black around a flush window ──
  add('lens', shellGeometry(lens, FZ - 0.6, FZ, 0), 'screen');
  // The picture, 95.04 x 53.86 mm; open below, where it lies on the lens
  add('lcd', openShell(roundedRect(95.04, 53.86, 0, LENS.x, LENS.y), FZ, FZ + 0.1, 0), 'lcd');

  // ── D-pad: four separate buttons in a round dish; each a home plate whose
  // point faces the middle ──
  const dpadBtn = nodeOutline([
    corner(v2(-4.2, 6.6), v2(0, 3.0), v2(4.2, 6.6), 0.6),
    corner(v2(0, 3.0), v2(4.2, 6.6), v2(4.2, 12.1), 0.6),
    corner(v2(4.2, 6.6), v2(4.2, 12.1), v2(-4.2, 12.1), 1.2),
    corner(v2(4.2, 12.1), v2(-4.2, 12.1), v2(-4.2, 6.6), 1.2),
    corner(v2(-4.2, 12.1), v2(-4.2, 6.6), v2(0, 3.0), 0.6),
  ]);
  const DPAD_TOP = FZ + 1.2;
  const turn = (g: THREE.BufferGeometry, k: number) =>
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-k * P / 2).setPosition(DPAD.x, DPAD.y, 0));
  add('dpad', mergeGeometries([0, 1, 2, 3].map(k => turn(openShell(dpadBtn, FZ - 1.0, DPAD_TOP, 0), k)), false)!, 'keys');
  const arrow = pts2([[0, 10.0], [-0.75, 8.75], [0.75, 8.75]]);
  const symbols: THREE.BufferGeometry[] = [0, 1, 2, 3].map(k => turn(print(arrow, DPAD_TOP + 0.05), k));

  // ── Analog pad: a flat round nub in its own well ──
  const NUB_R = 5.25, nubRim = 0.5, nub: THREE.Vector2[] = [v2(NUB_R, 0), v2(NUB_R, 2.05)];
  for (let i = 1; i <= 12; i++) {
    const a = i / 12 * P / 2;
    nub.push(v2(NUB_R - nubRim + nubRim * Math.cos(a), 2.05 + nubRim * Math.sin(a)));
  }
  nub.push(v2(3.2, 2.5), v2(1.6, 2.47), v2(0, 2.46));
  add('analog', new THREE.LatheGeometry(nub, 48).applyQuaternion(qX90).translate(PAD.x, PAD.y, FZ - 1.6), 'stick');

  // ── Face buttons and the ring that joins them ──
  const FACE_TOP = FZ - 1.2 + 2.3 + 0.3;
  const btn = buttonGeometry(4.6, 2.3, 0.3, 3).applyQuaternion(qX90);
  ['button_triangle', 'button_circle', 'button_cross', 'button_square'].forEach((name, k) =>
    add(name, btn.clone().translate(faceBtn[k]!.x, faceBtn[k]!.y, FZ - 1.2), 'keys'));
  add('button_ring', mergeGeometries([0, 1, 2, 3].map(k => {
    const a0 = k * P / 2 + 31 * P / 180, a1 = k * P / 2 + 59 * P / 180, n = 6;
    const arcPts = (r: number) => Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + (a1 - a0) * i / n;
      return v2(FACE_BTNS.x + r * Math.cos(a), FACE_BTNS.y + r * Math.sin(a));
    });
    const sector = [...arcPts(10.9), ...arcPts(10.3).reverse()];
    return openShell(() => sector, FZ, FZ + 0.2, 0);
  }), false)!, 'body');
  const sym = FACE_TOP + 0.05;
  const tri = (s: number) => [0, 1, 2].map(i => v2(s * Math.cos(P / 2 + i * 2 * P / 3), s * Math.sin(P / 2 + i * 2 * P / 3) - 0.35));
  const at = (pts: THREE.Vector2[], c: THREE.Vector2) => pts.map(p => p.clone().add(c));
  const plus = (L: number, w: number, a: number) => pts2([[L, -w], [L, w], [w, w], [w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w], [-w, -L], [w, -L], [w, -w]])
    .map(p => p.rotateAround(v2(0, 0), a));
  symbols.push(
    print(at(tri(1.75), faceBtn[0]!), sym, 1, [at(tri(1.15), faceBtn[0]!)]),
    print(circle(1.45, faceBtn[1]!.x, faceBtn[1]!.y, 32)(0), sym, 1, [circle(1.15, faceBtn[1]!.x, faceBtn[1]!.y, 32)(0)]),
    print(at(plus(1.55, 0.16, P / 4), faceBtn[2]!), sym),
    print(roundedRect(2.5, 2.5, 0, faceBtn[3]!.x, faceBtn[3]!.y)(0), sym, 1, [roundedRect(1.9, 1.9, 0, faceBtn[3]!.x, faceBtn[3]!.y)(0)]),
  );

  // ── HOME, VOL - / +, display, sound, SELECT, START: low keys that fill their holes ──
  const KEY_TOP = FZ + 0.7;
  for (const [name, o] of BOTTOM_BTNS) add(name, openShell(o, FZ - 0.6, KEY_TOP, 0), 'keys');
  symbols.push(
    print(roundedRect(1.5, 0.3, 0, -32.6, -31.0)(0), KEY_TOP + 0.05),
    print(at(plus(0.75, 0.15, 0), v2(-21.5, -31.0)), KEY_TOP + 0.05),
  );
  add('symbols', mergeGeometries(symbols, false)!, 'label');

  // ── Printing: PSP under the screen, SONY above the face buttons, the
  // PlayStation mark above the D-pad; the four lamps ──
  add('logos', mergeGeometries([
    ...pspLogo(1, -30.5, 1, 0.6).map(g => print(g, FZ + 0.05)),
    print(roundedRect(13.9, 2.1, 0, 60.15, 26.05)(0), FZ + 0.05),
    print(pts2([[-71.3, 22.9], [-70.5, 22.9], [-70.5, 24.7], [-69.0, 24.7], [-68.3, 25.3], [-68.3, 26.2], [-69.0, 26.8], [-71.3, 26.8]]), FZ + 0.05),
    print(pts2([[-73.0, 22.5], [-71.8, 22.0], [-67.6, 22.0], [-67.4, 22.4], [-68.6, 22.7], [-72.4, 22.7]]), FZ + 0.05),
  ], false)!, 'label');
  add('leds', mergeGeometries([[-79.0, -14.3], [-76.2, -22.2], [79.4, -14.5], [76.7, -22.0]]
    .map(([x, y]) => print(circle(0.45, x!, y!, 16)(0), FZ + 0.05)), false)!, 'led');
}

// ─── Frame, L / R and the corner pieces ──────────────────────────────────────

function buildFrame() {
  // ── Top edge: infrared port, two screws, USB, the OPEN switch ──
  const top = cutWall([v3(-P1.x, HH, BACK_Z), v3(P1.x, HH, BACK_Z), v3(P1.x, HH, FRONT_Z), v3(-P1.x, HH, FRONT_Z)], qToTop, [
    { at: v3(-35.8, HH, 13.4), w: 9.6, h: 2.6, r: 1.0, depth: 1.2 },
    { at: v3(-17.4, HH, 13.3), w: 2.4, h: 2.4, r: 1.2, depth: 1.5 },
    { at: v3(0.25, HH, 13.4), w: 6.8, h: 2.4, r: 0.5, depth: 4 },
    { at: v3(17.6, HH, 13.3), w: 2.4, h: 2.4, r: 1.2, depth: 1.5 },
    { at: v3(33.5, HH, 12.8), w: 10.6, h: 3.6, r: 0.8, depth: 1.6 },
  ]);
  // ── Bottom edge: two slots, a screw, the label, the charge terminals ──
  const bx = [-CORNER_CX, -Q1.x, Q1.x, CORNER_CX];
  const bottom = cutWall([...bx.map(x => v3(x, -HH, BACK_Z)), ...[...bx].reverse().map(x => v3(x, -HH, FRONT_Z))], qToFront, [
    { at: v3(-48.3, -HH, 13.3), w: 3.9, h: 2.2, r: 1.1, depth: 1.5 },
    { at: v3(0.5, -HH, 13.3), w: 2.0, h: 2.0, r: 1.0, depth: 1.5 },
    { at: v3(48.3, -HH, 13.3), w: 3.9, h: 2.2, r: 1.1, depth: 1.5 },
    { at: v3(61.4, -HH, 13.3), w: 1.0, h: 2.6, r: 0, depth: 1.0 },
    { at: v3(63.6, -HH, 13.3), w: 1.0, h: 2.6, r: 0, depth: 1.0 },
  ]);
  // ── Ends: POWER / HOLD on the right, the wireless LAN switch on the left ──
  const rightRun = segs(bodyPts, m => m.x > 70 && m.y > -27 && m.y < -10);
  const leftRun = segs(bodyPts, m => m.x < -70 && m.y > -27 && m.y < -10);
  const run = (s: number[]) => [...s, (s[s.length - 1]! + 1) % bodyPts.length];
  const power = cutSide(body, run(rightRun), BACK_Z, FRONT_Z, [{ y: -18.5, len: 9.0, z: 13.3, h: 2.6, r: 1.0, depth: 1.6 }]);
  const wlan = cutSide(body, run(leftRun), BACK_Z, FRONT_Z, [{ y: -18.6, len: 7.5, z: 13.9, h: 2.4, r: 1.0, depth: 1.6 }]);
  const flatSegs = [...segs(bodyPts, m => Math.abs(m.y - HH) < 1e-6 && Math.abs(m.x) < P1.x), ...segs(bodyPts, m => Math.abs(m.y + HH) < 1e-6)];
  const patched = new Set([...flatSegs, ...rightRun, ...leftRun]);
  add('frame', mergeGeometries([
    sweepSide(body, wallRings(BACK_Z, FRONT_Z), 1, undefined, i => inShoulder[i]! || patched.has(i)),
    top.wall, bottom.wall, power.wall, wlan.wall,
  ], false)!, 'frame');

  // Switch nubs: POWER / HOLD in the middle, wireless LAN off (down)
  // In front of the slots' backs, so no face lies on one
  const nub = plate(roundedRect(2.4, 1.8, 0.5), 1.0, 2.2);
  const onWall = (f: ReturnType<typeof power.frame>) => placed(nub.clone(), f.at, f.x, f.y, f.z);
  add('switch_nubs', mergeGeometries([onWall(power.frame(-18.5, 13.3)), onWall(wlan.frame(-20.6, 13.9))], false)!, 'keys');
  add('open_slider', placed(plate(roundedRect(5.0, 2.8, 0.6), 0.8, 2.0), v3(31.0, HH, 12.8), v3(1, 0, 0), v3(0, 0, -1), v3(0, 1, 0)), 'keys');
  add('label', polygon(pts2([[-45, 11.2], [-2.5, 11.2], [-2.5, 15.4], [-45, 15.4]]), p => v3(p.x, -HH - 0.05, p.y), v3(0, -1, 0)), 'sticker');

  // ── L / R: the top corners, from the back shell up to just under the face ──
  const shoulder = (a: THREE.Vector2, b: THREE.Vector2) => mergeGeometries([
    sweepSide(body, wallRings(SHOULDER_Z, ZONE_Z), 1, chain(bodyPts, a, b)),
    polygon(zone(a, b), p => v3(p.x, p.y, ZONE_Z), v3(0, 0, 1)),
  ], false)!;
  add('button_r', shoulder(P4, P1), 'shoulder');
  add('button_l', shoulder(mx(P1), mx(P4)), 'shoulder');

  // ── Corner pieces: the frame comes forward in the bottom corners. The strap
  // holder goes through the left one; DC IN 5V is under the right one ──
  const strap = stadium(v2(-67.0, -32.9), v2(-60.5, -33.3), 1.05);
  const rightIdx = chain(bodyPts, Q1, Q4), leftIdx = chain(bodyPts, mx(Q4), mx(Q1));
  const dcFlat = rightIdx.findIndex((k, j) => j < rightIdx.length - 1 && Math.abs(bodyPts[k]!.y + HH) < 1e-6 && Math.abs(bodyPts[rightIdx[j + 1]!]!.y + HH) < 1e-6);
  const dc = cutWall([v3(Q1.x, -HH, FRONT_Z), v3(CORNER_CX, -HH, FRONT_Z), v3(CORNER_CX, -HH, ZONE_Z), v3(Q1.x, -HH, ZONE_Z)], qToFront,
    [{ at: v3(62.5, -HH, 18.85), w: 3.6, h: 3.6, r: 1.8, depth: 3 }]);
  add('corner_pieces', mergeGeometries([
    sweepSide(body, wallRings(FRONT_Z, ZONE_Z), 1, rightIdx, i => i === dcFlat), dc.wall,
    polygon(zone(Q1, Q4), p => v3(p.x, p.y, ZONE_Z), v3(0, 0, 1)),
    sweepSide(body, wallRings(FRONT_Z, ZONE_Z), 1, leftIdx),
    polygon(zone(mx(Q4), mx(Q1)), p => v3(p.x, p.y, ZONE_Z), v3(0, 0, 1), [strap(0)]),
    recessWall(strap, ZONE_Z, ZONE_Z - BACK_FLAT, 0),
  ], false)!, 'frame');

  return { strap, backs: [top.backs, bottom.backs, power.backs, wlan.backs, dc.backs] };
}

// ─── Back ────────────────────────────────────────────────────────────────────

function buildBack(strap: Outline, ports: THREE.BufferGeometry[]) {
  const door = roundedRect(73.8, 61.6, 1.0, 0, -0.2);
  const cover = grip(1), left = grip(-1);

  // ── Back shell: its sides from the frame back, round over onto the back;
  // L / R stand on it in the top corners. Headphone / remote jack underneath ──
  const rings = rimRings(BACK_Z, BACK_FLAT, BACK_RIM, 13);
  rings.splice(1, 0, { inset: 0, z: SHOULDER_Z, blend: 0 });
  const jackSeg = segs(bodyPts, m => Math.abs(m.y + HH) < 1e-6 && m.x < -Q1.x);
  const jacks = cutWall([
    v3(-CORNER_CX, -HH, BACK_FLAT + BACK_RIM), v3(-Q1.x, -HH, BACK_FLAT + BACK_RIM), v3(-Q1.x, -HH, SHOULDER_Z),
    v3(-Q1.x, -HH, BACK_Z), v3(-CORNER_CX, -HH, BACK_Z), v3(-CORNER_CX, -HH, SHOULDER_Z),
  ], qToFront, [
    // Shallow: the strap holder's slot passes just above them
    { at: v3(-63.8, -HH, 7.6), w: 3.4, h: 3.4, r: 1.7, depth: 2.0 },
    { at: v3(-58.0, -HH, 7.6), w: 6.0, h: 2.4, r: 0.5, depth: 2.0 },
  ]);
  add('back_shell', mergeGeometries([
    sweepSide(body, rings, -1, undefined, (i, r) => (r === 0 && inShoulder[i]!) || (r <= 1 && jackSeg.includes(i))),
    jacks.wall,
    flatCap(body(BACK_RIM), BACK_FLAT, -1, [door(0), cover.edge, left.edge, strap(0)]),
  ], false)!, 'bodyDark');
  add('ports', mergeGeometries([...ports, jacks.backs], false)!, 'hole');

  // ── The grips: the battery cover on the right, the grip on the left; the
  // disc cover between them ──
  add('battery_cover', cover.geometry, 'cover');
  add('grip_left', left.geometry, 'bodyDark');
  add('umd_door', openShell(door, BACK_FLAT, DOOR_Z, 0), 'cover');

  // PUSH, the battery cover's latch at its outer edge, standing out of the dome
  const u = (78.95 - GRIP_X0) / (gripX1(0) - GRIP_X0), v = (0 - GRIP_Y0) / (GRIP_Y1 - GRIP_Y0);
  const s0 = gripAt(u, v), slope = Math.atan2(gripAt(u + 1e-3, v).z - gripAt(u - 1e-3, v).z, gripAt(u + 1e-3, v).x - gripAt(u - 1e-3, v).x);
  const nOut = v3(Math.sin(slope), 0, -Math.cos(slope));
  add('push_button', placed(plate(roundedRect(5.1, 16.4, 1.0), 0, 1.4, -1), s0.clone().addScaledVector(nOut, 0.5),
    v3(Math.cos(slope), 0, Math.sin(slope)), v3(0, 1, 0), v3(-Math.sin(slope), 0, Math.cos(slope))), 'cover');

  // ── Memory Stick Duo slot cover, on the left end ──
  add('ms_cover', msCover(-1.6, -25.0, 5.6, 10.0), 'bodyDark');

  // ── Printing: the ring and PSP on the disc cover, UMD and SONY above ──
  const ringPts = (r: number) => circle(r, 0, 0, 72)(0);
  add('back_print', mergeGeometries([
    print(ringPts(26.35), DOOR_Z - 0.05, -1, [ringPts(19.0)]),
    ...pspLogo(1.3, 0, -1, 0.3).map(g => print(g, DOOR_Z - 0.05, -1)),
    print(roundedRect(7.1, 1.8, 0, -29.45, 31.9)(0), BACK_FLAT - 0.05, -1),
    print(roundedRect(12.0, 2.1, 0, 44.1, 32.55)(0), BACK_FLAT - 0.05, -1),
  ], false)!, 'label');
}

/** A cover lying 0.25 mm proud on the left end, between y0 and y1 (going down) and z0 to z1. */
function msCover(y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const a0 = P - Math.asin(y0 / END_R), a1 = P - Math.asin(y1 / END_R);
  const n = Math.max(1, Math.ceil((a1 - a0) / ARC_STEP));
  const at = (r: number, a: number, z: number) => [-END_CX + r * Math.cos(a), r * Math.sin(a), z];
  const angles = Array.from({ length: n + 1 }, (_, i) => a0 + (a1 - a0) * i / n);
  const pieces: THREE.BufferGeometry[] = [];
  angles.slice(0, -1).forEach((a, i) => {
    const b = angles[i + 1]!;
    const pos = [at(55.25, a, z0), at(55.25, b, z0), at(55.25, b, z1), at(55.25, a, z1)];
    const nor = [a, b, b, a].flatMap(t => [Math.cos(t), Math.sin(t), 0]);
    pieces.push(indexedGeometry(pos.flat(), nor, [0, 1, 2, 0, 2, 3]));
    for (const [z, d] of [[z1, 1], [z0, -1]] as const) {
      pieces.push(indexedGeometry([at(54.9, a, z), at(55.25, a, z), at(55.25, b, z), at(54.9, b, z)].flat(),
        Array.from({ length: 4 }, () => [0, 0, d]).flat(), [0, 1, 2, 0, 2, 3]));
    }
  });
  for (const [a, d] of [[a0, -1], [a1, 1]] as const) {
    const t = tangent(a).multiplyScalar(d);
    pieces.push(indexedGeometry([at(54.9, a, z0), at(55.25, a, z0), at(55.25, a, z1), at(54.9, a, z1)].flat(),
      Array.from({ length: 4 }, () => [t.x, t.y, 0]).flat(), [0, 1, 2, 0, 2, 3]));
  }
  return mergeGeometries(pieces, false)!;
}

// ─── Pose and export ─────────────────────────────────────────────────────────

/** Centers the console and scales it to 1 unit = 170 mm. */
function pose(list: Part[]): Part[] {
  const bounds = new THREE.Box3();
  for (const p of list) { p.geometry.deleteAttribute('uv'); p.geometry.computeBoundingBox(); bounds.union(p.geometry.boundingBox!); }
  const size = bounds.getSize(v3(0, 0, 0)), center = bounds.getCenter(v3(0, 0, 0));
  console.log(`  size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm`);
  const unit = new THREE.Matrix4().makeScale(1 / 170, 1 / 170, 1 / 170).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  return list.map(p => ({ name: p.name, material: p.material, geometry: p.geometry.applyMatrix4(unit) }));
}

/** Colors (Piano Black, the launch color) are for other glTF viewers; the portfolio uses `role`. */
const MATERIALS: MaterialDefs = {
  body:     { color: srgb(0x111114), metallic: 0.10, roughness: 0.10, role: 'shell' },  // glossy black front
  frame:    { color: srgb(0xb4b8be), metallic: 0.60, roughness: 0.35, role: 'shell' },  // silver frame
  bodyDark: { color: srgb(0x1a1a1e), metallic: 0.05, roughness: 0.55, role: 'shell' },  // back shell
  cover:    { color: srgb(0x1e1e22), metallic: 0.05, roughness: 0.55, role: 'shell' },  // battery and disc covers
  screen:   { color: srgb(0x0c0c0e), metallic: 0.05, roughness: 0.08, role: 'lens' },
  lcd:      { color: srgb(0x2a2d2c), metallic: 0.00, roughness: 0.60, role: 'lcd' },
  keys:     { color: srgb(0x141416), metallic: 0.05, roughness: 0.15, role: 'button' },
  shoulder: { color: srgb(0xc8cbd0), metallic: 0.40, roughness: 0.30, role: 'button' }, // L / R
  stick:    { color: srgb(0x2a2a2c), metallic: 0.00, roughness: 0.85, role: 'rubber' }, // analog pad
  label:    { color: srgb(0xd4d6da), metallic: 0.30, roughness: 0.40, role: 'print' },
  sticker:  { color: srgb(0xc9cbd0), metallic: 0.00, roughness: 0.50, role: 'print' },
  led:      { color: srgb(0x3a6a5e), metallic: 0.00, roughness: 0.25, role: 'print' },
  hole:     { color: srgb(0x0e0e10), metallic: 0.05, roughness: 0.60, role: 'cavity' },
};

buildFront();
const frame = buildFrame();
buildBack(frame.strap, frame.backs);
await exportGLB(pose(parts), MATERIALS, 'PlayStationPortable', './public/models/psp.glb');
