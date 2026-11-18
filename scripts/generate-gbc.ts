/**
 * Generate a faithful Game Boy Color (CGB-001) 3D model (.glb).
 *
 * Geometry is built with three.js math (no DOM), exported via @gltf-transform.
 * Proportions measured from reference photography of the real hardware
 * (straight-on front and back shots, the main board for side/bottom ports):
 *   body 78 x 133.5 x 27.4 mm  ->  1.0 x 1.712 x 0.351 world units (1 unit = 78 mm).
 *
 * The portfolio viewer (main.ts) re-materializes every mesh as translucent
 * glass and draws EdgesGeometry lines with an 8-degree threshold, so:
 *   - smooth surfaces keep facet angles < 8 deg (no stray lines),
 *   - deliberate feature edges (caps, rims, recesses, steps) read as crisp outlines,
 *   - the mesh named "screen" receives the dark glossy screen material,
 *   - the other meshes get one of three glass tiers by bounding-box volume rank,
 *     so part sizes are chosen to keep every part in the tier it had.
 *
 * Run: bun scripts/generate-gbc.ts
 */
import { Document, NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

/** Arc facet angle: 6.4 deg keeps curved walls under the 8-degree edge threshold. */
const ARC_STEP = Math.PI / 28;

// ─── Outlines: convex arcs joined by straight tangents ───────────────────────

interface Corners { tl: number; tr: number; bl: number; br: number }
interface Arc { cx: number; cy: number; r: number; a0: number; a1: number }

/** CCW outline at a given inward offset; every inset yields the same point count. */
type Outline = (inset: number) => THREE.Vector2[];

/**
 * Insetting shrinks every radius around its center, so tangents stay tangent.
 * An arc smaller than the inset keeps a tiny radius and moves its center
 * instead, so the straight edges on either side still move by the full inset.
 * Points where two arcs meet without a straight between them are dropped.
 */
function arcOutline(arcs: Arc[]): Outline {
  const MIN_R = 0.0005;
  const steps = arcs.map(a => Math.max(1, Math.ceil((a.a1 - a.a0) / ARC_STEP - 1e-9)));
  const raw = (inset: number) => arcs.flatMap((a, k) => {
    const r = Math.max(a.r - inset, MIN_R);
    // Shift d with d·n0 = d·n1 = (a.r - inset) - r, n0/n1 the normals at the arc ends.
    const short = Math.min(a.r - inset - MIN_R, 0);
    const det = Math.sin(a.a1 - a.a0);
    const dx = short / det * (Math.sin(a.a1) - Math.sin(a.a0));
    const dy = short / det * (Math.cos(a.a0) - Math.cos(a.a1));
    return Array.from({ length: steps[k]! + 1 }, (_, i) => {
      const t = a.a0 + (a.a1 - a.a0) * (i / steps[k]!);
      return new THREE.Vector2(a.cx + dx + Math.cos(t) * r, a.cy + dy + Math.sin(t) * r);
    });
  });
  const base = raw(0);
  const keep = base.map((p, i) => p.distanceTo(base[(i - 1 + base.length) % base.length]!) > 1e-7);
  return inset => raw(inset).filter((_, i) => keep[i]);
}

function roundedRect(w: number, h: number, radius: number | Corners, cx = 0, cy = 0): Outline {
  const r = typeof radius === 'number' ? { tl: radius, tr: radius, bl: radius, br: radius } : radius;
  const hw = w / 2, hh = h / 2, P = Math.PI;
  return arcOutline([
    { cx: cx + hw - r.br, cy: cy - hh + r.br, r: r.br, a0: -P / 2, a1: 0 },
    { cx: cx + hw - r.tr, cy: cy + hh - r.tr, r: r.tr, a0: 0, a1: P / 2 },
    { cx: cx - hw + r.tl, cy: cy + hh - r.tl, r: r.tl, a0: P / 2, a1: P },
    { cx: cx - hw + r.bl, cy: cy - hh + r.bl, r: r.bl, a0: P, a1: P * 1.5 },
  ]);
}

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

/** Outward 2D normal at each point of a closed CCW outline. */
function outlineNormals(pts: THREE.Vector2[]): THREE.Vector2[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const prev = pts[(i - 1 + n) % n]!, next = pts[(i + 1) % n]!;
    const t = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize();
    return new THREE.Vector2(t.y, -t.x);
  });
}

// ─── Mesh builders ───────────────────────────────────────────────────────────

function indexedGeometry(positions: number[], normals: number[], indices: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return orient(g);
}

/**
 * Rewinds every triangle so its face agrees with its vertex normals. Edge
 * lines pair each edge with its reverse in the neighbouring triangle, so one
 * flipped triangle would draw its whole outline.
 */
function orient(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), idx = g.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    const [ia, ib, ic] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const face = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
    n.set(0, 0, 0);
    for (const v of [ia, ib, ic]) n.add(new THREE.Vector3().fromBufferAttribute(nor, v));
    if (face.dot(n) < 0) { idx.setX(i + 1, ic); idx.setX(i + 2, ib); }
  }
  return g;
}

interface Ring { inset: number; z: number; blend: number } // blend 0 = wall normal, 1 = face normal

/** Wall from zStart, then a quarter-round rim (rimSteps facets) onto the face at zEnd. */
function rimRings(zStart: number, zEnd: number, rimR: number, rimSteps: number): Ring[] {
  const dir = Math.sign(zEnd - zStart);
  const rings: Ring[] = [{ inset: 0, z: zStart, blend: 0 }, { inset: 0, z: zEnd - dir * rimR, blend: 0 }];
  for (let i = 1; i <= rimSteps && rimR > 0; i++) {
    const a = (i / rimSteps) * (Math.PI / 2);
    rings.push({ inset: rimR * (1 - Math.cos(a)), z: zEnd - dir * rimR * (1 - Math.sin(a)), blend: i / rimSteps });
  }
  return rings;
}

/**
 * Side surface swept through `rings` of an outline. `chain` picks an open run
 * of outline points; without it the whole outline is swept closed. `cut`
 * drops the quad after chain point i between rings r and r + 1.
 */
function sweepSide(
  outline: Outline, rings: Ring[], dir: number, chain?: number[], cut?: (i: number, r: number) => boolean,
): THREE.BufferGeometry {
  const base = outline(0);
  const wall = outlineNormals(base);
  const ids = chain ?? base.map((_, i) => i);
  const closed = !chain;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const ring of rings) {
    const pts = outline(ring.inset);
    const c = Math.cos(ring.blend * Math.PI / 2), s = Math.sin(ring.blend * Math.PI / 2);
    for (const i of ids) {
      positions.push(pts[i]!.x, pts[i]!.y, ring.z);
      const v = new THREE.Vector3(wall[i]!.x * c, wall[i]!.y * c, dir * s).normalize();
      normals.push(v.x, v.y, v.z);
    }
  }
  const m = ids.length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < (closed ? m : m - 1); i++) {
      if (cut?.(i, r)) continue;
      const a = r * m + i, b = r * m + (i + 1) % m, c = a + m, d = b + m;
      indices.push(a, b, c, b, d, c);
    }
  }
  return indexedGeometry(positions, normals, indices);
}

/** Flat cap over a convex polygon, fanned from its centroid. */
function fanCap(pts: THREE.Vector2[], z: number, faceDir: number): THREE.BufferGeometry {
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(pts.length);
  const positions = [c.x, c.y, z], normals = [0, 0, faceDir], indices: number[] = [];
  pts.forEach((p, i) => {
    positions.push(p.x, p.y, z); normals.push(0, 0, faceDir);
    indices.push(0, 1 + i, 1 + (i + 1) % pts.length);
  });
  return indexedGeometry(positions, normals, indices);
}

/**
 * Planar polygon with optional holes (earcut), mapped into 3D by `to3d` and
 * given one normal. Hole outlines are reused as-is, so walls built from the
 * same points join the face edge to edge.
 */
function polygon(
  pts: THREE.Vector2[], to3d: (p: THREE.Vector2) => THREE.Vector3, normal: THREE.Vector3, holes: THREE.Vector2[][] = [],
): THREE.BufferGeometry {
  const faces = THREE.ShapeUtils.triangulateShape(pts, holes);
  const positions: number[] = [], normals: number[] = [];
  for (const p of [...pts, ...holes.flat()]) {
    const v = to3d(p); positions.push(v.x, v.y, v.z); normals.push(normal.x, normal.y, normal.z);
  }
  return indexedGeometry(positions, normals, faces.flat());
}

/** Flat cap: a fan when the outline is convex and whole, earcut otherwise. */
function flatCap(pts: THREE.Vector2[], z: number, faceDir: number, holes: THREE.Vector2[][] = []): THREE.BufferGeometry {
  const n = pts.length;
  const convex = pts.every((p, i) => {
    const q = pts[(i + 1) % n]!, r = pts[(i + 2) % n]!;
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) >= -1e-12;
  });
  return convex && !holes.length ? fanCap(pts, z, faceDir)
    : polygon(pts, p => new THREE.Vector3(p.x, p.y, z), new THREE.Vector3(0, 0, faceDir), holes);
}

/** Swept outline with flat caps at both ends; the zEnd end gets the rim and any `holes`. */
function shellGeometry(
  outline: Outline, zStart: number, zEnd: number, rimR: number, rimSteps = 13, holes: Outline[] = [],
): THREE.BufferGeometry {
  const dir = Math.sign(zEnd - zStart);
  const rings = rimRings(zStart, zEnd, rimR, rimSteps);
  return mergeGeometries([
    sweepSide(outline, rings, dir),
    flatCap(outline(rings[rings.length - 1]!.inset), zEnd, dir, holes.map(h => h(0))),  // outer face
    flatCap(outline(0), zStart, -dir),                                                  // seam face
  ], false)!;
}

/** Thin plate: outer face at zOut, `thick` deep toward -dir. Crisp unless a rim is given. */
function plate(outline: Outline, zOut: number, thick: number, dir = 1, rimR = 0, rimSteps = 0): THREE.BufferGeometry {
  return shellGeometry(outline, zOut - dir * thick, zOut, rimR, rimSteps);
}

/**
 * Wall of a recess cut into a face at zTop: it runs `depth` into the body
 * (intoDir) while stepping in by `slope`. Its normals face into the recess.
 */
function recessWall(outline: Outline, zTop: number, depth: number, slope: number, intoDir = -1): THREE.BufferGeometry {
  const base = outline(0);
  const wall = outlineNormals(base);
  const bottom = outline(slope);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const [pts, z] of [[base, zTop], [bottom, zTop + intoDir * depth]] as const) {
    pts.forEach((p, i) => {
      positions.push(p.x, p.y, z);
      const v = new THREE.Vector3(-wall[i]!.x * depth, -wall[i]!.y * depth, -intoDir * slope).normalize();
      normals.push(v.x, v.y, v.z);
    });
  }
  const m = base.length;
  for (let i = 0; i < m; i++) {
    const a = i, b = (i + 1) % m;
    indices.push(a, b, a + m, b, b + m, a + m);
  }
  return indexedGeometry(positions, normals, indices);
}

/** Recess with its floor: wall plus a flat cap at the bottom. */
function recess(outline: Outline, zTop: number, depth: number, slope: number, intoDir = -1): THREE.BufferGeometry {
  return mergeGeometries([
    recessWall(outline, zTop, depth, slope, intoDir),
    fanCap(outline(slope), zTop + intoDir * depth, -intoDir),
  ], false)!;
}

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

/** Flat disc (single face) — reads as a crisp circle outline. */
function disc(r: number, segments = 32): THREE.BufferGeometry {
  return new THREE.CircleGeometry(r, segments);
}

/** Axis-aligned box (crisp 90-degree edges everywhere). */
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Convert sRGB hex to linear-space RGBA factor for glTF. */
function srgb(hex: number, alpha = 1): [number, number, number, number] {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  return [c.r, c.g, c.b, alpha];
}

// ─── Part registry ───────────────────────────────────────────────────────────

interface Part {
  name: string;
  geometry: THREE.BufferGeometry;
  material: string;
  position?: [number, number, number];
  rotation?: THREE.Quaternion;
}

const parts: Part[] = [];

function add(
  name: string, geometry: THREE.BufferGeometry, material: string,
  position?: [number, number, number], rotation?: THREE.Quaternion,
) {
  parts.push({ name, geometry, material, position, rotation });
}

/** Merge many geometries, each pre-transformed, into one named mesh. */
function mergedAt(
  geos: { g: THREE.BufferGeometry; at?: [number, number, number]; rot?: THREE.Quaternion }[],
): THREE.BufferGeometry {
  const list = geos.map(({ g, at = [0, 0, 0], rot }) => {
    const m = new THREE.Matrix4();
    if (rot) m.makeRotationFromQuaternion(rot);
    m.setPosition(at[0], at[1], at[2]);
    const c = g.clone().applyMatrix4(m);
    c.deleteAttribute('uv');
    return c;
  });
  const indexed = list.every(c => c.index);
  return mergeGeometries(indexed ? list : list.map(c => c.index ? c.toNonIndexed() : c), false)!;
}

const axis = (x: number, y: number, z: number, deg: number) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), deg * Math.PI / 180);
const qX90 = axis(1, 0, 0, 90);    // +y -> +z (lathes, cylinders facing front)
const qToTop = axis(1, 0, 0, -90); // +z -> +y (plates on the top edge)
const qToLeft = axis(0, 1, 0, -90); // +z -> -x (plates on the left side)
const qY180 = axis(0, 1, 0, 180);  // +z -> -z (discs on the back)

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
  add('select_pill', pillGeo, 'dark', [-ssX, ssY, 0]);
  add('start_pill', pillGeo.clone(), 'dark', [ssX, ssY, 0]);

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
  add('speaker_holes', mergedAt(holes), 'dark');

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
  add('ext_inner', plate(roundedRect(0.051, 0.103, 0.012), 0.004, 0.010), 'dark', [-HW, extY, 0], qToLeft);

  // Thumbwheel spins about Z; only its rim pokes through the slot.
  const volY = yTop(0.34);
  add('vol_slot', box(0.012, 0.128, 0.030), 'dark', [-0.499, volY, 0]);
  add('vol_wheel', new THREE.CylinderGeometry(0.083, 0.083, 0.018, 64), 'dark',
    [-0.422, volY, 0], qX90);

  // ── Right side: power slide switch ──
  const powY = yTop(0.28);
  add('power_slot', box(0.012, 0.128, 0.026), 'dark', [0.499, powY, 0]);
  add('power_nub', box(0.016, 0.052, 0.020), 'dark', [0.504, powY, 0]);

  // ── Top edge: empty cartridge slot (open to the back above the hump) + IR window ──
  // The slot runs down to the cartridge connector at the bottom of the cartridge.
  const SLOT_BOTTOM = yTop(0.46);
  add('cart_slot', cartSlot(SLOT.halfW, SLOT.depth, SLOT_BOTTOM), 'inset');
  add('cart_slit', box(0.72, 0.012, 0.097), 'dark', [0, SLOT_BOTTOM + 0.006, STRIP_Z + 0.0515]);
  add('ir_window', plate(roundedRect(0.165, 0.08, 0.012), 0.003, 0.007), 'ir', [-0.283, HH, 0.075], qToTop);

  // ── Bottom edge: headphone jack (right of center) and DC input (left) ──
  const jacks: [number, number, number][] = [[0.077, 0.045, 0.028], [-0.064, 0.030, 0.017]];
  add('phone_ring', mergedAt(jacks.map(([x, r]) => ({
    g: new THREE.CylinderGeometry(r, r, 0.006, 48), at: [x, bottomY(x) + 0.0005, -0.01] as [number, number, number],
  }))), 'body');
  add('phone_hole', mergedAt(jacks.map(([x, , r]) => ({
    g: new THREE.CylinderGeometry(r, r, 0.002, 48), at: [x, bottomY(x) - 0.0025, -0.01] as [number, number, number],
  }))), 'dark');

  // ── Back: label recess floor, battery cover, screw heads on the counterbore floors ──
  add('back_label', plate(inset => label(inset + 0.002), BZ + 0.003, 0.003, -1), 'shade');
  add('battery_cover', plate(cover, BZ - 0.002, 0.006, -1), 'bodyDark');

  add('screws', mergedAt([...screwsTop, ...screwsMid].map(([x, y]) =>
    ({ g: disc(0.020, 24), at: [x, y, SCREW_Z - 0.0005] as [number, number, number], rot: qY180 }))), 'dark');

  // ── Embossed Nintendo stadium outline on the front shell ──
  const ringOuter = roundedRect(0.273, 0.0565, 0.02825, 0, 0);
  const ringShape = new THREE.Shape(ringOuter(0));
  ringShape.holes.push(new THREE.Path(ringOuter(0.006).reverse()));
  add('nintendo_ring', new THREE.ExtrudeGeometry(ringShape, { depth: 0.0022, bevelEnabled: false }),
    'emboss', [0, yTop(0.561), FZ]);
}

/**
 * D-pad cross, base at z = 0: arms slope down toward their tips, the center
 * square stays flat around a shallow dimple. The slopes stay under the edge
 * threshold, so only the outline, the corners and the dimple draw lines.
 */
function dpadGeometry(S: number, T: number, h: number, drop: number, dimpleR: number, dimpleD: number): THREE.BufferGeometry {
  const zAt = (x: number, y: number) => h - drop * Math.max(0, (Math.max(Math.abs(x), Math.abs(y)) - T) / (S - T));
  const cross = [
    [S, -T], [S, T], [T, T], [T, S], [-T, S], [-T, T],
    [-S, T], [-S, -T], [-T, -T], [-T, -S], [T, -S], [T, -T],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const pieces: THREE.BufferGeometry[] = [];

  // Center square with the dimple cut out, then the dimple bowl.
  const rim = Array.from({ length: 64 }, (_, i) =>
    new THREE.Vector2(Math.cos(i / 64 * Math.PI * 2) * dimpleR, Math.sin(i / 64 * Math.PI * 2) * dimpleR));
  const square = [[T, -T], [T, T], [-T, T], [-T, -T]].map(([x, y]) => new THREE.Vector2(x, y));
  const faces = THREE.ShapeUtils.triangulateShape(square, [rim]);
  const sq = [...square, ...rim];
  pieces.push(indexedGeometry(sq.flatMap(p => [p.x, p.y, h]), sq.flatMap(() => [0, 0, 1]), faces.flat()));

  const RINGS = 6, positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let k = 0; k <= RINGS; k++) {
    const rho = dimpleR * (1 - k / RINGS);
    const z = h - dimpleD * (1 - (rho / dimpleR) ** 2);
    const slope = 2 * dimpleD * rho / dimpleR ** 2;
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2;
      positions.push(Math.cos(a) * rho, Math.sin(a) * rho, z);
      const n = new THREE.Vector3(-slope * Math.cos(a), -slope * Math.sin(a), 1).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  for (let k = 0; k < RINGS; k++) {
    for (let i = 0; i < 64; i++) {
      const a = k * 64 + i, b = k * 64 + (i + 1) % 64;
      indices.push(a, b, a + 64, b, b + 64, a + 64);
    }
  }
  pieces.push(indexedGeometry(positions, normals, indices));

  // Arms: one sloped quad each, sharing the square's sides.
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const px = -uy, py = ux; // across the arm
    const pts = ([[T, -T], [S, -T], [S, T], [T, T]] as const).map(([u, v]) => [ux * u + px * v, uy * u + py * v] as const);
    const n = new THREE.Vector3(ux * drop / (S - T), uy * drop / (S - T), 1).normalize();
    pieces.push(indexedGeometry(
      pts.flatMap(([x, y]) => [x, y, zAt(x, y)]), pts.flatMap(() => [n.x, n.y, n.z]), [0, 1, 2, 0, 2, 3]));
  }

  // Walls and base.
  cross.forEach((p, i) => {
    const q = cross[(i + 1) % cross.length]!;
    const n = new THREE.Vector3(q.y - p.y, -(q.x - p.x), 0).normalize();
    pieces.push(indexedGeometry(
      [p.x, p.y, 0, q.x, q.y, 0, q.x, q.y, zAt(q.x, q.y), p.x, p.y, zAt(p.x, p.y)],
      Array.from({ length: 4 }, () => [n.x, n.y, n.z]).flat(), [0, 1, 2, 0, 2, 3]));
  });
  pieces.push(polygon(cross, p => new THREE.Vector3(p.x, p.y, 0), new THREE.Vector3(0, 0, -1)));
  return mergeGeometries(pieces, false)!;
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

/** A/B cap along +y from its base: straight wall, crisp shoulder, low spherical dome. */
function buttonGeometry(r: number, wallH: number, sag: number): THREE.BufferGeometry {
  const sphereR = (r * r + sag * sag) / (2 * sag);
  const a0 = Math.asin(r / sphereR);
  const profile = [new THREE.Vector2(r, 0), new THREE.Vector2(r, wallH)];
  for (let i = 1; i <= 6; i++) {
    const a = a0 * (1 - i / 6);
    profile.push(new THREE.Vector2(sphereR * Math.sin(a), wallH + sphereR * (Math.cos(a) - Math.cos(a0))));
  }
  return new THREE.LatheGeometry(profile, 48);
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

// ─── Export via gltf-transform ───────────────────────────────────────────────

const MATERIALS: Record<string, { color: [number, number, number, number]; metallic: number; roughness: number }> = {
  body:     { color: srgb(0x7259ab), metallic: 0.05, roughness: 0.45 }, // grape purple
  bodyDark: { color: srgb(0x63479a), metallic: 0.05, roughness: 0.50 },
  shade:    { color: srgb(0x54387f), metallic: 0.05, roughness: 0.55 }, // recessed areas
  screen:   { color: srgb(0x14141c), metallic: 0.05, roughness: 0.10 },
  lcd:      { color: srgb(0x8a9490), metallic: 0.00, roughness: 0.35 },
  dark:     { color: srgb(0x232329), metallic: 0.05, roughness: 0.45 }, // buttons etc.
  inset:    { color: srgb(0x4a3d6b), metallic: 0.05, roughness: 0.55 }, // wells
  label:    { color: srgb(0x8f95a3), metallic: 0.00, roughness: 0.40 },
  emboss:   { color: srgb(0x5a4488), metallic: 0.05, roughness: 0.50 },
  led:      { color: srgb(0x8a1622), metallic: 0.00, roughness: 0.25 },
  ir:       { color: srgb(0x4a1018), metallic: 0.00, roughness: 0.15 },
};

async function exportGLB() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const root = doc.createNode('GameBoyColor');
  scene.addChild(root);
  doc.getRoot().setDefaultScene(scene);

  const mats = new Map<string, ReturnType<Document['createMaterial']>>();
  for (const [name, def] of Object.entries(MATERIALS)) {
    mats.set(name, doc.createMaterial(name)
      .setBaseColorFactor(def.color)
      .setMetallicFactor(def.metallic)
      .setRoughnessFactor(def.roughness));
  }

  let triangles = 0;
  for (const part of parts) {
    const geo = part.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const norAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
    const position = doc.createAccessor().setType('VEC3')
      .setArray(new Float32Array(posAttr.array)).setBuffer(buffer);
    const normal = doc.createAccessor().setType('VEC3')
      .setArray(new Float32Array(norAttr.array)).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setMaterial(mats.get(part.material)!);
    if (geo.index) {
      const arr = posAttr.count > 65535
        ? new Uint32Array(geo.index.array)
        : new Uint16Array(geo.index.array);
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buffer));
      triangles += geo.index.count / 3;
    } else {
      triangles += posAttr.count / 3;
    }
    const mesh = doc.createMesh(part.name).addPrimitive(prim);
    const node = doc.createNode(part.name).setMesh(mesh);
    if (part.position) node.setTranslation(part.position);
    if (part.rotation) {
      const q = part.rotation;
      node.setRotation([q.x, q.y, q.z, q.w]);
    }
    root.addChild(node);
  }

  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  const outputPath = './public/models/gbc.glb';
  await Bun.write(outputPath, glb);
  console.log(`Generated ${outputPath}`);
  console.log(`  meshes: ${parts.length}, triangles: ${triangles}, size: ${(glb.byteLength / 1024).toFixed(1)} KB`);
}

buildParts();
await exportGLB();
