// Chunk mesher and voxel raycast for the dense world volume (13 §3, §11, blocks task 05). Pure: no DOM, three or
// network, so Node tests can count faces. Only exposed faces are emitted: a face is drawn when the neighbor is air, out
// of bounds (except below y = 0), or a different transparent block. No greedy merging: one quad per visible face, which
// keeps per-face texture tiles simple (13 §11 budget: a flat 128 × 96 × 128 world is ≈ 58 k triangles).
//
// Faces go into passes (the adapter gives each pass its own material): 0 opaque, 1 cutout (glass, leaves, crops: alpha
// test), 2 blend (water, ice: real alpha, drawn after), 3 glow (emissive blocks, lit at night).
import { BLOCKS } from './blocks.js';

export const PASSES = ['opaque', 'cutout', 'blend', 'glow'];
const BLEND_KEYS = new Set(['water', 'ice']);

// Each face: normal, then 4 corners (bottom-left, bottom-right, top-right, top-left seen from outside, CCW), and which
// texture slot it uses (0 top, 1 side, 2 bottom).
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], slot: 1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], slot: 1 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], slot: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], slot: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], slot: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], slot: 1 },
];
const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Per-id lookup tables for meshing. `files` is the atlas order (texture file names; tile index = position).
 * → {tile: Int16Array(n·3) top/side/bottom tile, tint: Float32Array(n·3) linear rgb, pass: Uint8Array, clear: Uint8Array
 * (1 = neighbors show through), cols, rows (atlas grid)}.
 */
export function blockTables(files) {
  const n = BLOCKS.length;
  const at = new Map(files.map((f, i) => [f, i]));
  const tile = new Int16Array(n * 3).fill(-1), tint = new Float32Array(n * 3).fill(1);
  const pass = new Uint8Array(n), clear = new Uint8Array(256).fill(1);
  for (const b of BLOCKS) {
    const { top, side, bottom } = b.faces;
    tile.set([at.get(top) ?? -1, at.get(side) ?? -1, at.get(bottom) ?? -1], b.id * 3);
    if (b.tint) {
      const hex = parseInt(b.tint.slice(1), 16);
      tint.set([hex >> 16, (hex >> 8) & 255, hex & 255].map((v) => srgbToLinear(v / 255)), b.id * 3);
    }
    pass[b.id] = b.emissive ? 3 : BLEND_KEYS.has(b.key) ? 2 : b.transparent ? 1 : 0;
    clear[b.id] = b.transparent ? 1 : 0;
  }
  const cols = Math.ceil(Math.sqrt(files.length));
  return { tile, tint, pass, clear, cols, rows: Math.ceil(files.length / cols) };
}

/**
 * Mesh the columns x ∈ [x0, x1), z ∈ [z0, z1) of volume v (all heights). `opts.singlePass` puts every face in pass 0
 * (the far volume). → one entry per pass: {positions, normals, colors, uvs: Float32Array, indices: Uint32Array, faces}.
 */
export function meshChunk(v, tables, { x0 = 0, z0 = 0, x1 = v.size.x, z1 = v.size.z, singlePass = false } = {}) {
  const { x: X, y: Y, z: Z } = v.size, d = v.data;
  const { tile, tint, pass, clear, cols, rows } = tables;
  const out = PASSES.map(() => ({ p: [], n: [], c: [], u: [], faces: 0 }));
  const pad = 0.5 / 128 / cols; // inset half a texel so nearest sampling never bleeds into the next tile
  const XZ = X * Z;
  for (let y = 0; y < Y; y++) {
    for (let z = Math.max(0, z0); z < Math.min(Z, z1); z++) {
      for (let x = Math.max(0, x0); x < Math.min(X, x1); x++) {
        const i = x + X * (z + Z * y), id = d[i];
        if (id === 0) continue;
        const o = out[singlePass ? 0 : pass[id]];
        for (let f = 0; f < 6; f++) {
          const F = FACES[f], nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
          if (ny < 0) continue;
          if (nx >= 0 && nx < X && ny < Y && nz >= 0 && nz < Z) {
            const nb = d[nx + X * nz + XZ * ny];
            if (nb !== 0 && (nb === id || !clear[nb])) continue;
          }
          const t = Math.max(0, tile[id * 3 + F.slot]);
          const tc = t % cols, tr = Math.floor(t / cols);
          const u0 = tc / cols + pad, u1 = (tc + 1) / cols - pad;
          const v0 = 1 - (tr + 1) / rows + pad, v1 = 1 - tr / rows - pad;
          const r = tint[id * 3], g = tint[id * 3 + 1], b = tint[id * 3 + 2];
          for (let k = 0; k < 4; k++) {
            const cc = F.c[k];
            o.p.push(x + cc[0], y + cc[1], z + cc[2]);
            o.n.push(F.n[0], F.n[1], F.n[2]);
            o.c.push(r, g, b);
            o.u.push(UV[k][0] ? u1 : u0, UV[k][1] ? v1 : v0);
          }
          o.faces++;
        }
      }
    }
  }
  return out.map((o) => {
    const indices = new Uint32Array(o.faces * 6);
    for (let q = 0; q < o.faces; q++) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    return { positions: Float32Array.from(o.p), normals: Float32Array.from(o.n), colors: Float32Array.from(o.c),
      uvs: Float32Array.from(o.u), indices, faces: o.faces };
  });
}

/**
 * Voxel raycast (Amanatides–Woo) from origin o along direction dir (world units = blocks). Returns the first non-air
 * cell inside the volume within maxDist: {x, y, z, id, normal: [nx, ny, nz] (the face it entered through), dist}, or null.
 */
export function raycast(v, o, dir, maxDist = 512) {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (!len) return null;
  const D = [dir[0] / len, dir[1] / len, dir[2] / len];
  const cell = [Math.floor(o[0]), Math.floor(o[1]), Math.floor(o[2])];
  const step = D.map((c) => (c > 0 ? 1 : c < 0 ? -1 : 0));
  const tDelta = D.map((c) => (c ? Math.abs(1 / c) : Infinity));
  const tMax = D.map((c, a) => (c > 0 ? (cell[a] + 1 - o[a]) / c : c < 0 ? (cell[a] - o[a]) / c : Infinity));
  const { x: X, y: Y, z: Z } = v.size;
  let normal = [0, 0, 0], t = 0;
  while (t <= maxDist) {
    const [x, y, z] = cell;
    if (x >= 0 && x < X && y >= 0 && y < Y && z >= 0 && z < Z) {
      const id = v.data[x + X * (z + Z * y)];
      if (id) return { x, y, z, id, normal, dist: t };
    }
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    t = tMax[a];
    cell[a] += step[a];
    tMax[a] += tDelta[a];
    normal = [0, 0, 0];
    normal[a] = -step[a];
  }
  return null;
}
