/**
 * Generate a faithful Game Boy Color (CGB-001) 3D model (.glb).
 *
 * Geometry is built with three.js math (no DOM), exported via @gltf-transform.
 * Proportions measured from reference photography of the real hardware:
 *   body 78 x 133.5 x 27.4 mm  ->  1.0 x 1.712 x 0.351 world units (1 unit = 78 mm).
 *
 * The portfolio viewer (main.ts) re-materializes every mesh as translucent
 * glass and draws EdgesGeometry lines with an 8-degree threshold, so:
 *   - smooth surfaces keep facet angles < 8 deg (no stray lines),
 *   - deliberate feature edges (caps, rims, insets) read as crisp outlines,
 *   - the mesh named "screen" receives the dark glossy screen material.
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
const BZ = -HD;                 // back face z
const SEAM_Z = 0.03;            // shell parting line, slightly front of middle

/** y coordinate from "fraction of body height measured from the top edge" */
const yTop = (frac: number) => HH - frac * H;

// ─── Rounded-rect outline with per-corner radii ──────────────────────────────

interface Corners { tl: number; tr: number; bl: number; br: number }

/**
 * Counter-clockwise rounded-rect outline centered at (cx, cy).
 * Arc facets stay < 8 deg so corner walls never trigger edge lines.
 */
function roundedRectPoints(
  w: number, h: number, r: Corners, cx = 0, cy = 0, arcSteps = 14,
): THREE.Vector2[] {
  const hw = w / 2, hh = h / 2;
  const pts: THREE.Vector2[] = [];
  const corner = (ccx: number, ccy: number, from: number, to: number, rad: number) => {
    for (let i = 0; i <= arcSteps; i++) {
      const a = from + (to - from) * (i / arcSteps);
      pts.push(new THREE.Vector2(ccx + Math.cos(a) * rad, ccy + Math.sin(a) * rad));
    }
  };
  // CCW: BR -> TR -> TL -> BL
  corner(cx + hw - r.br, cy - hh + r.br, -Math.PI / 2, 0, r.br);
  corner(cx + hw - r.tr, cy + hh - r.tr, 0, Math.PI / 2, r.tr);
  corner(cx - hw + r.tl, cy + hh - r.tl, Math.PI / 2, Math.PI, r.tl);
  corner(cx - hw + r.bl, cy - hh + r.bl, Math.PI, Math.PI * 1.5, r.bl);
  return pts;
}

/** Same outline shrunk inward by `inset` (radii shrink too, clamped). */
function insetCorners(r: Corners, inset: number): Corners {
  const m = (v: number) => Math.max(v - inset, 0.002);
  return { tl: m(r.tl), tr: m(r.tr), bl: m(r.bl), br: m(r.br) };
}

// ─── Shell sweep: wall + one rounded rim + flat caps, analytic normals ───────

/**
 * Extrudes a rounded-rect outline from zStart to zEnd (zEnd is the "outer"
 * face). The outer face meets the wall through a quarter-round rim of radius
 * rimR (rimSteps facets, < 8 deg each). Both ends get flat caps.
 */
function shellGeometry(
  w: number, h: number, corners: Corners,
  zStart: number, zEnd: number, rimR: number,
  cx = 0, cy = 0, rimSteps = 13,
): THREE.BufferGeometry {
  const dir = Math.sign(zEnd - zStart); // +1 rim faces +z, -1 faces -z
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Ring definitions: [inset, z, blend] — blend 0 = wall normal, 1 = face normal
  const rings: { inset: number; z: number; blend: number }[] = [];
  rings.push({ inset: 0, z: zStart, blend: 0 });
  rings.push({ inset: 0, z: zEnd - dir * rimR, blend: 0 });
  for (let i = 1; i <= rimSteps; i++) {
    const a = (i / rimSteps) * (Math.PI / 2);
    rings.push({
      inset: rimR * (1 - Math.cos(a)),
      z: zEnd - dir * rimR * (1 - Math.sin(a)),
      blend: a / (Math.PI / 2),
    });
  }

  const base = roundedRectPoints(w, h, corners, cx, cy);
  const n = base.length;
  // Outline normal per point (2D, outward)
  const outNorm: THREE.Vector2[] = base.map((p, i) => {
    const prev = base[(i - 1 + n) % n]!, next = base[(i + 1) % n]!;
    const t = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize();
    return new THREE.Vector2(t.y, -t.x); // rotate -90: outward for CCW outline
  });

  for (const ring of rings) {
    const shrunk = roundedRectPoints(
      w - ring.inset * 2, h - ring.inset * 2, insetCorners(corners, ring.inset), cx, cy,
    );
    for (let i = 0; i < n; i++) {
      const p = shrunk[i]!;
      positions.push(p.x, p.y, ring.z);
      const wall = outNorm[i]!;
      const cosA = Math.cos(ring.blend * Math.PI / 2);
      const sinA = Math.sin(ring.blend * Math.PI / 2);
      const nx = wall.x * cosA, ny = wall.y * cosA, nz = dir * sinA;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i, d = (r + 1) * n + ((i + 1) % n);
      if (dir > 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }

  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  side.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  side.setIndex(indices);

  // Flat caps (outer face + start face), triangulated as fans from centroid.
  const cap = (ringIdx: number, faceDir: number) => {
    const ring = rings[ringIdx]!;
    const shrunk = roundedRectPoints(
      w - ring.inset * 2, h - ring.inset * 2, insetCorners(corners, ring.inset), cx, cy,
    );
    const g = new THREE.BufferGeometry();
    const pos: number[] = [cx, cy, ring.z];
    const nor: number[] = [0, 0, faceDir];
    const idx: number[] = [];
    shrunk.forEach(p => { pos.push(p.x, p.y, ring.z); nor.push(0, 0, faceDir); });
    for (let i = 0; i < n; i++) {
      const a = 1 + i, b = 1 + ((i + 1) % n);
      if (faceDir > 0) idx.push(0, a, b);
      else idx.push(0, b, a);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  };

  return mergeGeometries([
    side,
    cap(rings.length - 1, dir),   // outer face
    cap(0, -dir),                 // seam face
  ], false)!;
}

// ─── Small-part helpers ──────────────────────────────────────────────────────

/** Thin rounded-rect plate: outer face at zOut, extends `thick` toward body. */
function plate(
  w: number, h: number, radius: number, zOut: number, thick: number,
  opts: { rim?: number; rimSteps?: number; cx?: number; cy?: number } = {},
): THREE.BufferGeometry {
  const r = Math.min(radius, Math.min(w, h) / 2 - 0.001);
  const c = { tl: r, tr: r, bl: r, br: r };
  const dir = Math.sign(zOut) || 1;
  return shellGeometry(
    w, h, c,
    zOut - dir * thick, zOut,
    opts.rim ?? Math.min(thick * 0.6, 0.004),
    opts.cx ?? 0, opts.cy ?? 0,
    opts.rimSteps ?? 4,
  );
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

/** Merge many geometries, each pre-translated, into one named mesh. */
function mergedAt(
  geos: { g: THREE.BufferGeometry; at: [number, number, number]; rot?: THREE.Quaternion }[],
): THREE.BufferGeometry {
  const list = geos.map(({ g, at, rot }) => {
    const m = new THREE.Matrix4();
    if (rot) m.makeRotationFromQuaternion(rot);
    m.setPosition(at[0], at[1], at[2]);
    const c = g.clone().applyMatrix4(m);
    return c.index ? c.toNonIndexed() : c;
  });
  return mergeGeometries(list, false)!;
}

const qX90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const qZ90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

// ─── Parts (positions measured from reference photos, front view fractions) ──

function buildParts() {
  const bodyCorners: Corners = { tl: 0.052, tr: 0.052, bl: 0.135, br: 0.135 };

  // Body shells — parting seam ring shows as the case split line
  add('body_front',
    shellGeometry(W, H, bodyCorners, SEAM_Z, FZ, 0.030), 'body');
  add('body_back',
    shellGeometry(W - 0.009, H - 0.009, insetCorners(bodyCorners, 0.0045), SEAM_Z, BZ, 0.052), 'bodyDark');

  // ── Screen area ──
  // Lens: 87% of body width, top edge 5.4% from body top
  const lensW = 0.87, lensH = 0.428 * H;
  const lensCY = yTop(0.054) - lensH / 2;
  add('screen', plate(lensW, lensH, 0.032, FZ + 0.005, 0.008, { cy: lensCY }), 'screen');

  // LCD active area: 44 x 40 mm real
  const lcdH = 0.288 * H;
  add('lcd', plate(0.554, lcdH, 0.010, FZ + 0.009, 0.005, { cy: yTop(0.101) - lcdH / 2 }), 'lcd');

  // "GAME BOY COLOR" logo strip on the lens
  add('logo_strip', plate(0.46, 0.046, 0.010, FZ + 0.0075, 0.003, { cy: yTop(0.44) }), 'label');

  // Power LED, upper-left inside the lens
  add('power_led', new THREE.CylinderGeometry(0.0125, 0.0125, 0.008, 48), 'led',
    [-0.402, yTop(0.187), FZ + 0.009], qX90);

  // ── D-pad (center x -0.281, 64.2% down) ──
  const dpadX = -0.281, dpadY = yTop(0.642);
  add('dpad_well', disc(0.138, 64), 'inset', [dpadX, dpadY, FZ + 0.0015]);

  const S = 0.1205, T = 0.040; // cross half-span / half-arm-width
  const cross = new THREE.Shape([
    [S, -T], [S, T], [T, T], [T, S], [-T, S], [-T, T],
    [-S, T], [-S, -T], [-T, -T], [-T, -S], [T, -S], [T, -T],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  add('dpad', new THREE.ExtrudeGeometry(cross, {
    depth: 0.020, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 4,
  }), 'dark', [dpadX, dpadY, FZ - 0.004]);
  add('dpad_dimple', disc(0.030, 48), 'dark', [dpadX, dpadY, FZ + 0.0225]);

  // ── A / B buttons (8 mm domes, axis tilted ~22 deg) ──
  const btnProfile: THREE.Vector2[] = [new THREE.Vector2(0.049, 0), new THREE.Vector2(0.049, 0.014)];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    btnProfile.push(new THREE.Vector2(0.042 + 0.007 * Math.cos(a), 0.014 + 0.007 * Math.sin(a)));
  }
  btnProfile.push(new THREE.Vector2(0, 0.021));
  const btnGeo = new THREE.LatheGeometry(btnProfile, 48);

  const aPos: [number, number, number] = [0.344, yTop(0.624), FZ - 0.001];
  const bPos: [number, number, number] = [0.156, yTop(0.668), FZ - 0.001];
  add('button_a', btnGeo, 'dark', aPos, qX90);
  add('button_b', btnGeo.clone(), 'dark', bPos, qX90);
  add('button_wells', mergedAt([
    { g: disc(0.076, 56), at: [aPos[0], aPos[1], FZ + 0.001] },
    { g: disc(0.076, 56), at: [bPos[0], bPos[1], FZ + 0.001] },
  ]), 'inset');

  // ── SELECT / START (horizontal pills in stadium wells) ──
  const ssY = yTop(0.798);
  const wellGeo = () => plate(0.129, 0.0668, 0.0324, FZ + 0.0015, 0.003, { rimSteps: 4 });
  add('sel_start_wells', mergedAt([
    { g: wellGeo(), at: [-0.080, ssY, 0] },
    { g: wellGeo(), at: [0.058, ssY, 0] },
  ]), 'inset');
  const pillGeo = new THREE.CapsuleGeometry(0.0155, 0.058, 8, 48);
  add('select_pill', pillGeo, 'dark', [-0.080, ssY, FZ + 0.009], qZ90);
  add('start_pill', pillGeo.clone(), 'dark', [0.058, ssY, FZ + 0.009], qZ90);

  // ── Speaker: hex-packed hole cluster, bottom right ──
  const spX = 0.313, spY = yTop(0.855);
  const holes: { g: THREE.BufferGeometry; at: [number, number, number] }[] = [];
  const pitch = 0.030, rowH = pitch * Math.sqrt(3) / 2, R = 0.107;
  for (let j = -4; j <= 4; j++) {
    const off = (j % 2 !== 0) ? pitch / 2 : 0;
    for (let i = -4; i <= 4; i++) {
      const x = i * pitch + off, y = j * rowH;
      if (Math.hypot(x, y) <= R) {
        holes.push({ g: disc(0.0075, 16), at: [spX + x, spY + y, FZ + 0.0008] });
      }
    }
  }
  add('speaker_holes', mergedAt(holes), 'dark');

  // ── Side-wall grip ridges (5 short bars near the top, both sides) ──
  const ridges: { g: THREE.BufferGeometry; at: [number, number, number] }[] = [];
  for (let i = 0; i < 5; i++) {
    const y = yTop(0.20) + (i / 4) * (yTop(0.11) - yTop(0.20));
    ridges.push({ g: box(0.010, 0.012, 0.130), at: [-HW, y, 0.095] });
    ridges.push({ g: box(0.010, 0.012, 0.130), at: [HW, y, 0.095] });
  }
  add('grip_ridges', mergedAt(ridges), 'body');

  // ── Left side: EXT link port + volume wheel ──
  const extY = yTop(0.215);
  add('ext_frame', box(0.014, 0.105, 0.105), 'bodyDark', [-HW, extY, 0]);
  add('ext_inner', box(0.010, 0.075, 0.075), 'dark', [-0.498, extY, 0]);

  // Thumbwheel spins about Z; only its knurled rim pokes through the slot.
  const volY = yTop(0.34);
  add('vol_slot', box(0.012, 0.128, 0.030), 'dark', [-0.499, volY, 0]);
  add('vol_wheel', new THREE.CylinderGeometry(0.083, 0.083, 0.018, 64), 'dark',
    [-0.422, volY, 0], qX90);

  // ── Right side: power slide switch ──
  const powY = yTop(0.30);
  add('power_slot', box(0.012, 0.128, 0.026), 'dark', [0.499, powY, 0]);
  add('power_nub', box(0.016, 0.052, 0.020), 'dark', [0.504, powY, 0]);

  // ── Top edge: cartridge slot (back half) + IR window (front half) ──
  add('cart_slot', box(0.80, 0.024, 0.20), 'inset', [0, HH - 0.0115, -0.070]);
  add('cart_slit', box(0.70, 0.020, 0.085), 'dark', [0, HH - 0.009, -0.070]);
  add('ir_window', box(0.080, 0.014, 0.135), 'ir', [0.115, HH - 0.0055, 0.0775]);

  // ── Bottom edge: headphone jack ──
  add('phone_ring', new THREE.CylinderGeometry(0.045, 0.045, 0.006, 48), 'body',
    [-0.15, -HH + 0.0005, 0]);
  add('phone_hole', new THREE.CylinderGeometry(0.028, 0.028, 0.005, 32), 'dark',
    [-0.15, -HH + 0.0012, 0]);

  // ── Back: cartridge bay recess, battery cover, screws ──
  const bayH = 0.7575, bayCY = 0.0685 + bayH / 2;
  add('cart_bay', plate(0.82, bayH, 0.040, BZ - 0.004, 0.008, { cy: bayCY, rimSteps: 4 }), 'shade');
  add('connector_slit', box(0.70, 0.030, 0.010), 'dark', [0, 0.775, BZ - 0.007]);

  const covH = 0.6506, covCY = -0.0856 - covH / 2;
  add('battery_cover', plate(0.68, covH, 0.075, BZ - 0.006, 0.007, { cy: covCY, rimSteps: 4 }), 'bodyDark');
  add('battery_latch', box(0.055, 0.022, 0.010), 'dark', [0, -0.715, BZ - 0.009]);

  const qY180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  add('screws', mergedAt([
    { g: disc(0.018, 24), at: [-0.37, 0.728, BZ - 0.001], rot: qY180 },
    { g: disc(0.018, 24), at: [0.37, 0.728, BZ - 0.001], rot: qY180 },
    { g: disc(0.018, 24), at: [-0.405, -0.034, BZ - 0.001], rot: qY180 },
    { g: disc(0.018, 24), at: [0.405, -0.034, BZ - 0.001], rot: qY180 },
  ]), 'dark');

  // ── Embossed Nintendo stadium outline on the front shell ──
  const ringOuter = roundedRectPoints(0.24, 0.0445, { tl: 0.0222, tr: 0.0222, bl: 0.0222, br: 0.0222 }, 0, 0, 10);
  const ringInner = roundedRectPoints(0.224, 0.0285, { tl: 0.0142, tr: 0.0142, bl: 0.0142, br: 0.0142 }, 0, 0, 10);
  const ringShape = new THREE.Shape(ringOuter);
  ringShape.holes.push(new THREE.Path(ringInner.slice().reverse()));
  add('nintendo_ring', new THREE.ExtrudeGeometry(ringShape, { depth: 0.003, bevelEnabled: false }),
    'emboss', [0, yTop(0.549), FZ - 0.0005]);
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
