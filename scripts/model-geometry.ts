/**
 * Geometry helpers shared by the handheld model generators
 * (generate-gbc.ts, generate-gbasp.ts).
 *
 * The portfolio viewer (main.ts) replaces the materials and draws
 * EdgesGeometry lines with an 8-degree threshold, so:
 *   - smooth surfaces keep facet angles < 8 deg (no stray lines),
 *   - deliberate feature edges (caps, rims, recesses, steps) read as crisp outlines,
 *   - each glTF material names its finish in extras.role, and the viewer
 *     picks the surface by that role (model-materials.ts).
 */
import { Document, NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Role } from '../model-materials';

/** Arc facet angle: 6.4 deg keeps curved walls under the 8-degree edge threshold. */
export const ARC_STEP = Math.PI / 28;

// ─── Outlines: convex arcs joined by straight tangents ───────────────────────

export interface Corners { tl: number; tr: number; bl: number; br: number }
export interface Arc { cx: number; cy: number; r: number; a0: number; a1: number }

/** CCW outline at a given inward offset; every inset yields the same point count. */
export type Outline = (inset: number) => THREE.Vector2[];

/**
 * Insetting shrinks every radius around its center, so tangents stay tangent.
 * An arc smaller than the inset keeps a tiny radius and moves its center
 * instead, so the straight edges on either side still move by the full inset.
 * Points where two arcs meet without a straight between them are dropped.
 * A zero radius makes a sharp corner (one point); with a1 < a0 it turns inward.
 * Keep other radii above the deepest inset taken: an arc shrunk to the tiny
 * radius packs its points closer than the viewer's edge lines can tell apart,
 * and a cap over them draws stray lines.
 */
export function arcOutline(arcs: Arc[]): Outline {
  const MIN_R = 0.0005;
  const steps = arcs.map(a => a.r === 0 ? 0 : Math.max(1, Math.ceil((a.a1 - a.a0) / ARC_STEP - 1e-9)));
  const raw = (inset: number) => arcs.flatMap((a, k) => {
    const r = Math.max(a.r - inset, MIN_R);
    // Shift d with d·n0 = d·n1 = (a.r - inset) - r, n0/n1 the normals at the arc ends.
    const short = Math.min(a.r - inset - MIN_R, 0);
    const det = Math.sin(a.a1 - a.a0);
    const dx = short / det * (Math.sin(a.a1) - Math.sin(a.a0));
    const dy = short / det * (Math.cos(a.a0) - Math.cos(a.a1));
    return Array.from({ length: steps[k]! + 1 }, (_, i) => {
      const t = steps[k] ? a.a0 + (a.a1 - a.a0) * (i / steps[k]!) : a.a0;
      return new THREE.Vector2(a.cx + dx + Math.cos(t) * r, a.cy + dy + Math.sin(t) * r);
    });
  });
  const base = raw(0);
  const keep = base.map((p, i) => p.distanceTo(base[(i - 1 + base.length) % base.length]!) > 1e-7);
  return inset => raw(inset).filter((_, i) => keep[i]);
}

export function roundedRect(w: number, h: number, radius: number | Corners, cx = 0, cy = 0): Outline {
  const r = typeof radius === 'number' ? { tl: radius, tr: radius, bl: radius, br: radius } : radius;
  const hw = w / 2, hh = h / 2, P = Math.PI;
  return arcOutline([
    { cx: cx + hw - r.br, cy: cy - hh + r.br, r: r.br, a0: -P / 2, a1: 0 },
    { cx: cx + hw - r.tr, cy: cy + hh - r.tr, r: r.tr, a0: 0, a1: P / 2 },
    { cx: cx - hw + r.tl, cy: cy + hh - r.tl, r: r.tl, a0: P / 2, a1: P },
    { cx: cx - hw + r.bl, cy: cy - hh + r.bl, r: r.bl, a0: P, a1: P * 1.5 },
  ]);
}

/** Outward 2D normal at each point of a closed CCW outline. */
export function outlineNormals(pts: THREE.Vector2[]): THREE.Vector2[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const prev = pts[(i - 1 + n) % n]!, next = pts[(i + 1) % n]!;
    const t = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize();
    return new THREE.Vector2(t.y, -t.x);
  });
}

// ─── Mesh builders ───────────────────────────────────────────────────────────

export function indexedGeometry(positions: number[], normals: number[], indices: number[]): THREE.BufferGeometry {
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

export interface Ring { inset: number; z: number; blend: number } // blend 0 = wall normal, 1 = face normal

/** Wall from zStart, then a quarter-round rim (rimSteps facets) onto the face at zEnd. */
export function rimRings(zStart: number, zEnd: number, rimR: number, rimSteps: number): Ring[] {
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
export function sweepSide(
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
export function fanCap(pts: THREE.Vector2[], z: number, faceDir: number): THREE.BufferGeometry {
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
export function polygon(
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
export function flatCap(pts: THREE.Vector2[], z: number, faceDir: number, holes: THREE.Vector2[][] = []): THREE.BufferGeometry {
  const n = pts.length;
  const convex = pts.every((p, i) => {
    const q = pts[(i + 1) % n]!, r = pts[(i + 2) % n]!;
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) >= -1e-12;
  });
  return convex && !holes.length ? fanCap(pts, z, faceDir)
    : polygon(pts, p => new THREE.Vector3(p.x, p.y, z), new THREE.Vector3(0, 0, faceDir), holes);
}

/** Swept outline with flat caps at both ends; the zEnd end gets the rim and any `holes`. */
export function shellGeometry(
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
export function plate(outline: Outline, zOut: number, thick: number, dir = 1, rimR = 0, rimSteps = 0): THREE.BufferGeometry {
  return shellGeometry(outline, zOut - dir * thick, zOut, rimR, rimSteps);
}

/**
 * Wall of a recess cut into a face at zTop: it runs `depth` into the body
 * (intoDir) while stepping in by `slope`. Its normals face into the recess.
 */
export function recessWall(outline: Outline, zTop: number, depth: number, slope: number, intoDir = -1): THREE.BufferGeometry {
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
export function recess(outline: Outline, zTop: number, depth: number, slope: number, intoDir = -1): THREE.BufferGeometry {
  return mergeGeometries([
    recessWall(outline, zTop, depth, slope, intoDir),
    fanCap(outline(slope), zTop + intoDir * depth, -intoDir),
  ], false)!;
}

/** Flat disc (single face) — reads as a crisp circle outline. */
export function disc(r: number, segments = 32): THREE.BufferGeometry {
  return new THREE.CircleGeometry(r, segments);
}

/** Axis-aligned box (crisp 90-degree edges everywhere). */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Convert sRGB hex to linear-space RGBA factor for glTF. */
export function srgb(hex: number, alpha = 1): [number, number, number, number] {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  return [c.r, c.g, c.b, alpha];
}

/** Merge many geometries, each pre-transformed, into one named mesh. */
export function mergedAt(
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

export const axis = (x: number, y: number, z: number, deg: number) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), deg * Math.PI / 180);
export const qX90 = axis(1, 0, 0, 90);    // +y -> +z (lathes, cylinders facing front)
export const qToTop = axis(1, 0, 0, -90); // +z -> +y (plates on the top edge)
export const qToLeft = axis(0, 1, 0, -90); // +z -> -x (plates on the left side)
export const qY180 = axis(0, 1, 0, 180);  // +z -> -z (discs on the back)

// ─── Controls ────────────────────────────────────────────────────────────────

/**
 * D-pad cross, base at z = 0: arms slope down toward their tips, the center
 * square stays flat around a shallow dimple. The slopes stay under the edge
 * threshold, so only the outline, the corners and the dimple draw lines.
 */
export function dpadGeometry(S: number, T: number, h: number, drop: number, dimpleR: number, dimpleD: number): THREE.BufferGeometry {
  const zAt = (x: number, y: number) => h - drop * Math.max(0, (Math.max(Math.abs(x), Math.abs(y)) - T) / (S - T));
  const cross = [
    [S, -T], [S, T], [T, T], [T, S], [-T, S], [-T, T],
    [-S, T], [-S, -T], [-T, -T], [-T, -S], [T, -S], [T, -T],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const pieces: THREE.BufferGeometry[] = [];

  // Center square with the dimple cut out, then the dimple bowl (none when dimpleR is 0).
  const square = [[T, -T], [T, T], [-T, T], [-T, -T]].map(([x, y]) => new THREE.Vector2(x, y));
  if (dimpleR > 0) pieces.push(...dimpledSquare(square, h, dimpleR, dimpleD));
  else pieces.push(fanCap(square, h, 1));

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

/** The D-pad's center square at height h with a dimple cut out, and the dimple bowl. */
function dimpledSquare(square: THREE.Vector2[], h: number, dimpleR: number, dimpleD: number): THREE.BufferGeometry[] {
  const rim = Array.from({ length: 64 }, (_, i) =>
    new THREE.Vector2(Math.cos(i / 64 * Math.PI * 2) * dimpleR, Math.sin(i / 64 * Math.PI * 2) * dimpleR));
  const faces = THREE.ShapeUtils.triangulateShape(square, [rim]);
  const sq = [...square, ...rim];
  const top = indexedGeometry(sq.flatMap(p => [p.x, p.y, h]), sq.flatMap(() => [0, 0, 1]), faces.flat());

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
  return [top, indexedGeometry(positions, normals, indices)];
}

/**
 * A/B cap along +y from its base: straight wall, crisp shoulder, low spherical
 * dome in `domeSteps` facets (keep each under the 8-degree edge threshold).
 */
export function buttonGeometry(r: number, wallH: number, sag: number, domeSteps = 6): THREE.BufferGeometry {
  const sphereR = (r * r + sag * sag) / (2 * sag);
  const a0 = Math.asin(r / sphereR);
  const profile = [new THREE.Vector2(r, 0), new THREE.Vector2(r, wallH)];
  for (let i = 1; i <= domeSteps; i++) {
    const a = a0 * (1 - i / domeSteps);
    profile.push(new THREE.Vector2(sphereR * Math.sin(a), wallH + sphereR * (Math.cos(a) - Math.cos(a0))));
  }
  return new THREE.LatheGeometry(profile, 48);
}

// ─── Export via gltf-transform ───────────────────────────────────────────────

export interface Part {
  name: string;
  geometry: THREE.BufferGeometry;
  material: string;
  position?: [number, number, number];
  rotation?: THREE.Quaternion;
}

/**
 * Colors are for other glTF viewers; the portfolio ignores them and uses
 * `role`, one of ROLES in model-materials.ts (written to the material's extras).
 */
export type MaterialDefs = Record<string, { color: [number, number, number, number]; metallic: number; roughness: number; role: Role }>;

export async function exportGLB(parts: Part[], materials: MaterialDefs, rootName: string, outputPath: string) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const root = doc.createNode(rootName);
  scene.addChild(root);
  doc.getRoot().setDefaultScene(scene);

  const mats = new Map<string, ReturnType<Document['createMaterial']>>();
  for (const [name, def] of Object.entries(materials)) {
    mats.set(name, doc.createMaterial(name)
      .setBaseColorFactor(def.color)
      .setMetallicFactor(def.metallic)
      .setRoughnessFactor(def.roughness)
      .setExtras({ role: def.role }));
  }

  let triangles = 0, vertices = 0;
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
    vertices += posAttr.count;
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
  await Bun.write(outputPath, glb);
  console.log(`Generated ${outputPath}`);
  console.log(`  meshes: ${parts.length}, vertices: ${vertices}, triangles: ${triangles}, size: ${(glb.byteLength / 1024).toFixed(1)} KB`);
}
