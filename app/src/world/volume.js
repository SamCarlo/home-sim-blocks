// The dense world volume (13 §3, homeblocks 04). Pure: no DOM, no three. Every generator writes into one of these.
// Axes: x east, y up, z toward the street. Index = x + X * (z + Z * y). Values are Uint8 block ids, 0 = air.
// A box is {x0, y0, z0, x1, y1, z1} with BOTH ends inclusive; corners may come in either order.

import { WORLD } from '../config.js';
import { isSolid } from './blocks.js';

/** Create an all-air volume of `size` {x, y, z} (defaults to WORLD.size) → {size, data: Uint8Array}. */
export function createVolume(size = WORLD.size) {
  const s = { x: size.x | 0, y: size.y | 0, z: size.z | 0 };
  if (s.x <= 0 || s.y <= 0 || s.z <= 0) throw new Error(`createVolume: bad size ${JSON.stringify(size)}`);
  return { size: s, data: new Uint8Array(s.x * s.y * s.z) };
}

/** True when (x, y, z) is an integer cell inside the volume. */
export function inBounds(v, x, y, z) {
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
    && x >= 0 && y >= 0 && z >= 0 && x < v.size.x && y < v.size.y && z < v.size.z;
}

/** Flat index of (x, y, z) (no bounds check). */
export function idx(v, x, y, z) {
  return x + v.size.x * (z + v.size.z * y);
}

/** Cell coordinates {x, y, z} of a flat index. */
export function coords(v, i) {
  const { x: X, z: Z } = v.size;
  const x = i % X;
  const rest = (i - x) / X;
  const z = rest % Z;
  return { x, y: (rest - z) / Z, z };
}

/** Block id at (x, y, z); 0 (air) outside the volume. */
export function get(v, x, y, z) {
  return inBounds(v, x, y, z) ? v.data[idx(v, x, y, z)] : 0;
}

/** Set (x, y, z) to `id`. Out-of-bounds cells are ignored. Returns true when the cell was inside. */
export function set(v, x, y, z, id) {
  if (!inBounds(v, x, y, z)) return false;
  v.data[idx(v, x, y, z)] = id;
  return true;
}

/** Normalize a box to sorted integer corners clipped to the volume, or null when it misses the volume entirely. */
export function clipBox(v, box) {
  const lo = (a, b) => Math.round(Math.min(a, b));
  const hi = (a, b) => Math.round(Math.max(a, b));
  const b = {
    x0: Math.max(0, lo(box.x0, box.x1)), x1: Math.min(v.size.x - 1, hi(box.x0, box.x1)),
    y0: Math.max(0, lo(box.y0, box.y1)), y1: Math.min(v.size.y - 1, hi(box.y0, box.y1)),
    z0: Math.max(0, lo(box.z0, box.z1)), z1: Math.min(v.size.z - 1, hi(box.z0, box.z1)),
  };
  return b.x0 > b.x1 || b.y0 > b.y1 || b.z0 > b.z1 ? null : b;
}

/** Fill every cell of `box` with `id` (clipped). Returns the number of cells written. */
export function fillBox(v, box, id) {
  const b = clipBox(v, box);
  if (!b) return 0;
  const { x: X, z: Z } = v.size;
  const w = b.x1 - b.x0 + 1;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let z = b.z0; z <= b.z1; z++) {
      const start = b.x0 + X * (z + Z * y);
      v.data.fill(id, start, start + w);
    }
  }
  return w * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1);
}

/**
 * A room shell: walls of `wallId` on the four sides, a floor (bottom layer) and ceiling (top layer) of `floorId` /
 * `ceilId` (default `wallId`; pass 0 for none, i.e. air), and air inside. Clipped to the volume.
 */
export function hollowBox(v, box, wallId, { floorId = wallId, ceilId = wallId } = {}) {
  const b = clipBox(v, box);
  if (!b) return;
  fillBox(v, b, wallId);
  if (b.x1 - b.x0 >= 2 && b.z1 - b.z0 >= 2 && b.y1 - b.y0 >= 2) {
    fillBox(v, { x0: b.x0 + 1, x1: b.x1 - 1, y0: b.y0 + 1, y1: b.y1 - 1, z0: b.z0 + 1, z1: b.z1 - 1 }, 0);
  }
  const inner = { x0: b.x0 + 1, x1: b.x1 - 1, z0: b.z0 + 1, z1: b.z1 - 1 };
  if (inner.x0 <= inner.x1 && inner.z0 <= inner.z1) {
    fillBox(v, { ...inner, y0: b.y0, y1: b.y0 }, floorId);
    if (b.y1 > b.y0) fillBox(v, { ...inner, y0: b.y1, y1: b.y1 }, ceilId);
  }
}

/** A straight 3D line of `id` from a {x, y, z} to b {x, y, z} (both ends included, DDA). Returns cells written. */
export function line(v, a, b, id) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  let n = 0;
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    if (set(v, Math.round(a.x + dx * t), Math.round(a.y + dy * t), Math.round(a.z + dz * t), id)) n++;
  }
  return n;
}

/** A vertical column of `id` at (x, z) from y0 to y1 (inclusive, either order). Returns cells written. */
export function column(v, x, z, y0, y1, id) {
  return fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0, y1 }, id);
}

/** Change every `fromId` cell in `box` to `toId`. Returns the number of cells changed. */
export function replace(v, box, fromId, toId) {
  const b = clipBox(v, box);
  if (!b || fromId === toId) return 0;
  let n = 0;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let z = b.z0; z <= b.z1; z++) {
      const row = v.size.x * (z + v.size.z * y);
      for (let x = b.x0; x <= b.x1; x++) {
        if (v.data[row + x] === fromId) { v.data[row + x] = toId; n++; }
      }
    }
  }
  return n;
}

/** The highest y at (x, z) holding a solid block, or -1 when the column is empty or outside the volume. */
export function topSolidY(v, x, z) {
  if (!inBounds(v, x, 0, z)) return -1;
  for (let y = v.size.y - 1; y >= 0; y--) {
    if (isSolid(v.data[idx(v, x, y, z)])) return y;
  }
  return -1;
}

/** A deep copy (new data buffer). */
export function clone(v) {
  return { size: { ...v.size }, data: v.data.slice() };
}

/** Plan feet → blocks (13 §3): max(1, round(ft / 3.28)). */
export function ftToBlocks(ft) {
  return Math.max(1, Math.round(ft / WORLD.ftPerBlock));
}
