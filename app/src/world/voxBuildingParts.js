// Parts for apartment and condo buildings in blocks (13 §5, homeblocks 10). Pure: no DOM, no three.
// Facade windows and floor bands, ground-floor use (shops, lobby glass, parking decks), balconies, the switchback stair
// line in a core, and roof features (parapet or pitched roof, AC boxes, water tank, stair bulkhead, glass crowns).
import { BLOCK } from './blocks.js';
import { get, set, fillBox, idx } from './volume.js';
import { addRoof } from './shells.js';
import { VOX_BUILDING as VB } from '../config.js';

const ID = (k) => BLOCK[k].id;
const H = VB.storyH;

/** Slab y of floor f (1-based) for a building whose ground slab is at base. */
export const slabY = (base, f) => base + H * (f - 1);

/**
 * Windows on the four outer faces of box b for floors 1..floors: `every` cells apart, at story offsets `rows`
 * (1 = feet), corners stay wall. Optional trim/metal band on every slab line. Returns nothing.
 */
export function facade(v, b, base, floors, { every, rows, band, rng, lit = VB.litChance, skip = () => false }) {
  const pane = () => (rng.chance(lit) ? ID('lit-glass') : ID('glass'));
  for (let f = 1; f <= floors; f++) {
    const s = slabY(base, f);
    if (band && f > 1) {
      for (let x = b.x0; x <= b.x1; x++) { set(v, x, s, b.z0, band); set(v, x, s, b.z1, band); }
      for (let z = b.z0; z <= b.z1; z++) { set(v, b.x0, s, z, band); set(v, b.x1, s, z, band); }
    }
    for (const r of rows) {
      const y = s + r;
      for (let x = b.x0 + 1; x < b.x1; x += every) {
        if (!skip(x, y, b.z1)) set(v, x, y, b.z1, pane());
        if (!skip(x, y, b.z0)) set(v, x, y, b.z0, pane());
      }
      for (let z = b.z0 + 1; z < b.z1; z += every) {
        if (!skip(b.x0, y, z)) set(v, b.x0, y, z, pane());
        if (!skip(b.x1, y, z)) set(v, b.x1, y, z, pane());
      }
    }
  }
}

/** Ground-floor use on the street face (z1): shop windows + awning, lobby glass, or parking decks with rails. */
export function groundUse(v, b, base, plan, { skipX = () => false }) {
  const glass = ID('glass'), lit = ID('lit-glass');
  if (plan.groundUse === 'shops') {
    for (let x = b.x0 + 1; x < b.x1; x++) {
      if (skipX(x)) continue;
      for (const y of [base + 1, base + 2, base + 3]) set(v, x, y, b.z1, y === base + 3 ? ID('metal') : x % 4 === 0 ? lit : glass);
      if (get(v, x, base + 4, b.z1 + 1) === 0) set(v, x, base + 4, b.z1 + 1, ID('slab')); // awning
    }
  } else if (plan.groundUse === 'lobby') {
    for (let x = b.x0 + 1; x < b.x1; x++) if (!skipX(x)) for (const y of [base + 1, base + 2]) set(v, x, y, b.z1, lit);
  } else if (plan.groundUse === 'parking') {
    for (let f = 1; f <= plan.podium; f++) {
      const y = slabY(base, f) + 2;
      for (let x = b.x0 + 1; x < b.x1; x++) if (!skipX(x)) { set(v, x, y, b.z1, ID('fence')); set(v, x, y, b.z0, ID('fence')); }
      for (let z = b.z0 + 1; z < b.z1; z++) { set(v, b.x0, y, z, ID('fence')); set(v, b.x1, y, z, ID('fence')); }
    }
  }
}

/**
 * A balcony on face z (out = +1 street side, −1 back) centered on x for the floor whose slab is at s: a 2-deep slab
 * (balconyW + 2 wide), a rail on the outer row and the two sides. Returns the standing cells [{x, y, z}].
 */
export function balcony(v, x, z, s, out) {
  const w = VB.balconyW, xa = x - (w >> 1), xb = xa + w - 1;
  const z1 = z + out, z2 = z + 2 * out, slab = ID('slab'), fence = ID('fence');
  for (let xx = xa - 1; xx <= xb + 1; xx++) for (const zz of [z1, z2]) {
    set(v, xx, s, zz, slab);
    if (zz === z2 || xx === xa - 1 || xx === xb + 1) set(v, xx, s + 1, zz, fence);
  }
  const cells = [];
  for (let xx = xa; xx <= xb; xx++) cells.push({ x: xx, y: s + 1, z: z1 });
  return cells;
}

/**
 * Switchback stairs in a 3 × 4 zone, `cell(row, col)` → [x, z] (row 0 = A, 1 = B, 2 = C; col 0..3). Climbs `stories`
 * stories from the slab at base: even stories climb row A, odd stories row C, row B is always floor (as voxHouse).
 */
export function switchback(v, cell, base, stories, stepId) {
  const col = (x, z, y0, y1, id) => fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0, y1 }, id);
  for (let s = 0; s < stories; s++) {
    const b = base + H * s, even = s % 2 === 0, row = even ? 0 : 2;
    const [ax, az] = cell(1, even ? 0 : 3), [lx, lz] = cell(1, even ? 3 : 0);
    col(ax, az, b + 1, b + 3, 0);
    col(lx, lz, b + H + 1, b + H + 3, 0);
    for (let k = 0; k < 4; k++) {
      const [x, z] = cell(row, even ? k : 3 - k);
      col(x, z, b + 1, b + 1 + k, stepId);
      col(x, z, b + 2 + k, b + 4 + k, 0);
    }
  }
}

/**
 * Roof over box b (its top slab at top): a pitched roof ('gable' | 'hip') or a trim parapet, then (flat only) AC boxes,
 * a water tank on legs, a stair bulkhead over `core` and a glass crown. Returns the highest y written.
 */
export function roofTop(v, b, top, { shape, ids, rng, tank, crown, core, plan }) {
  if (shape === 'gable' || shape === 'hip') return addRoof(v, b, top + 1, shape, ids.roof, ids.trim);
  const y = top + 1;
  for (let x = b.x0; x <= b.x1; x++) { set(v, x, y, b.z0, ids.trim); set(v, x, y, b.z1, ids.trim); }
  for (let z = b.z0; z <= b.z1; z++) { set(v, b.x0, y, z, ids.trim); set(v, b.x1, y, z, ids.trim); }
  let high = y;
  if (core) {
    fillBox(v, { x0: core.x0, x1: core.x1, z0: core.z0, z1: core.z1, y0: y, y1: y + 2 }, ID('concrete'));
    high = y + 2;
  }
  const free = (x, z, w, d, hh) => {
    for (let xx = x; xx < x + w; xx++) for (let zz = z; zz < z + d; zz++) for (let yy = y; yy < y + hh; yy++) {
      if (get(v, xx, yy, zz) !== 0 || xx <= b.x0 || xx >= b.x1 || zz <= b.z0 || zz >= b.z1) return false;
    }
    return true;
  };
  const spot = (w, d, hh) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.int(b.x0 + 1, Math.max(b.x0 + 1, b.x1 - w)), z = rng.int(b.z0 + 1, Math.max(b.z0 + 1, b.z1 - d));
      if (free(x, z, w, d, hh)) return [x, z];
    }
    return null;
  };
  const n = rng.int(VB.acBoxes[0], VB.acBoxes[1]);
  for (let i = 0; i < n; i++) {
    const p = spot(2, 1, 1);
    if (p) fillBox(v, { x0: p[0], x1: p[0] + 1, z0: p[1], z1: p[1], y0: y, y1: y }, ID('metal'));
  }
  if (tank) {
    const p = spot(3, 3, 6);
    if (p) {
      const [x, z] = p;
      for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) fillBox(v, { x0: x + dx, x1: x + dx, z0: z + dz, z1: z + dz, y0: y, y1: y + 1 }, ID('trunk'));
      fillBox(v, { x0: x, x1: x + 2, z0: z, z1: z + 2, y0: y + 2, y1: y + 4 }, ID('planks-dark'));
      set(v, x + 1, y + 5, z + 1, ID('planks-dark'));
      high = Math.max(high, y + 5);
    }
  }
  if (crown && crown !== 'flat') {
    const cz = (b.z0 + b.z1) >> 1;
    if (crown === 'fin') {
      fillBox(v, { x0: b.x1 - 1, x1: b.x1 - 1, z0: cz - 2, z1: cz + 2, y0: y, y1: y + 7 }, ID('metal'));
      high = Math.max(high, y + 7);
    } else {
      // setback / slant / curve: two stepped glass tiers over the middle of the roof.
      for (let k = 0; k < 2; k++) {
        const ins = 3 + k * 2, yy = y + k * 3;
        const r = { x0: b.x0 + ins, x1: b.x1 - ins, z0: b.z0 + ins, z1: b.z1 - ins };
        if (r.x0 > r.x1 || r.z0 > r.z1) break;
        fillBox(v, { ...r, y0: yy, y1: yy + 2 }, ID('glass'));
        fillBox(v, { ...r, y0: yy + 3, y1: yy + 3 }, ID('metal'));
        high = Math.max(high, yy + 3);
      }
    }
  }
  return high;
}

/** Indices of glass cells in face cells [x, y, z]. */
export function glassIn(v, cells) {
  const g = ID('glass'), l = ID('lit-glass');
  return cells.filter(([x, y, z]) => [g, l].includes(get(v, x, y, z))).map(([x, y, z]) => idx(v, x, y, z));
}
