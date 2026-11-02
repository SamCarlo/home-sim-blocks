// Furniture in blocks (13 §4 decor, §5 voxInteriors, homeblocks 12). Pure: no DOM, no three.
// `furnish(volume, rooms, {styleKey, seed, keep})` puts furniture blocks into each typed room box (interior, feet..feet+2):
// beds in bedrooms, table + chairs in kitchens/dining rooms, counters + a shelf in kitchens, couch + rug in living rooms,
// tub + toilet + sink counter in bathrooms, a lamp in every room. It never blocks a doorway: the cell inside every opening
// in a room's walls stays free, stairs (anything already in the room) keep a free ring, `keep` cells (plant and animal
// spots) stay free, and no piece may split the room's free floor into more pieces (so all doors still meet).
import { BLOCK, isSolid } from './blocks.js';
import { get, set } from './volume.js';
import { createRng, seedFor } from '../util/rng.js';
import { VOX_INTERIORS as VI } from '../config.js';

const ID = (k) => BLOCK[k].id;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const RUGS = ['rug-red', 'rug-blue', 'rug-green', 'rug-tan'];

/** Pieces per room type, in placing order. `[block, length]`; 'table' pieces get chairs next to them. */
const PIECES = {
  bedroom: [['bed', 2], ['shelf', 1]],
  living: [['couch', 2], ['shelf', 1]],
  kitchen: [['counter', 2], ['counter', 1], ['shelf', 1], ['table', 1]],
  dining: [['table', 1], ['shelf', 1]],
  bathroom: [['tub', 2], ['toilet', 1], ['counter', 1]],
  office: [['table', 1], ['shelf', 1]],
  den: [['couch', 1], ['shelf', 1]],
  laundry: [['counter', 1], ['shelf', 1]],
  closet: [['shelf', 1]],
};
const NO_FURNITURE = new Set(['lanai', 'garage', 'porch', 'hallway']);

/** The free-floor grid of one room: cells where a 2-tall piece could stand. */
function roomGrid(v, b) {
  const W = b.x1 - b.x0 + 1, D = b.z1 - b.z0 + 1, y = b.y0;
  const free = new Uint8Array(W * D);
  for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) {
    const x = b.x0 + i, z = b.z0 + k;
    let clear = isSolid(get(v, x, y - 1, z));
    for (let dy = 0; dy <= 2 && clear; dy++) clear = get(v, x, y + dy, z) === 0;
    free[i + W * k] = clear ? 1 : 0;
  }
  return { W, D, free };
}

/** Cells that must stay free: inside every wall opening, around stairs/other blocks, and `keep` cells. */
function reservedCells(v, b, g, keep) {
  const { W, D, free } = g, res = new Uint8Array(W * D), y = b.y0;
  const mark = (i, k) => { if (i >= 0 && k >= 0 && i < W && k < D) res[i + W * k] = 1; };
  for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) {
    const x = b.x0 + i, z = b.z0 + k;
    // An edge cell whose outer neighbor (the wall) can be walked through is a doorway's inside cell.
    for (const [dx, dz] of SIDES) {
      const ox = x + dx, oz = z + dz;
      if (ox >= b.x0 && ox <= b.x1 && oz >= b.z0 && oz <= b.z1) continue;
      if (!isSolid(get(v, ox, y, oz)) && !isSolid(get(v, ox, y + 1, oz))) mark(i, k);
    }
    // Stairs and anything already standing in the room keep a free ring for access.
    if (!free[i + W * k]) { mark(i, k); for (const [dx, dz] of SIDES) mark(i + dx, k + dz); }
  }
  for (const c of keep) if (c.y >= b.y0 - 1 && c.y <= b.y1) mark(c.x - b.x0, c.z - b.z0);
  return res;
}

/** How many 4-connected pieces the free, unfurnished floor of a room is in (stair cells don't join pieces). */
function pieces(g, used) {
  const { W, D, free } = g, n = W * D, seen = new Uint8Array(n);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !free[s] || used[s]) continue;
    count++;
    seen[s] = 1;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const i = q[h] % W, k = (q[h] / W) | 0;
      for (const [dx, dz] of SIDES) {
        const a = i + dx, c = k + dz, m = a + W * c;
        if (a >= 0 && c >= 0 && a < W && c < D && !seen[m] && free[m] && !used[m]) { seen[m] = 1; q.push(m); }
      }
    }
  }
  return count;
}

/** Candidate placements of a `len`-long piece: along walls first (seeded order), then the middle. */
function candidates(g, len, rng, wallFirst = true) {
  const { W, D } = g, out = [];
  for (let i = 0; i < W; i++) for (let k = 0; k < D; k++) {
    for (const [dx, dz] of len > 1 ? [[1, 0], [0, 1]] : [[0, 0]]) {
      const cells = Array.from({ length: len }, (_, s) => [i + dx * s, k + dz * s]);
      if (cells.some(([a, c]) => a >= W || c >= D)) continue;
      const wall = cells.every(([a, c]) => (dx ? c === 0 || c === D - 1 : dz ? a === 0 || a === W - 1 : a === 0 || c === 0 || a === W - 1 || c === D - 1));
      out.push({ cells, wall });
    }
  }
  const shuffled = rng.shuffle(out);
  return wallFirst ? [...shuffled.filter((c) => c.wall), ...shuffled.filter((c) => !c.wall)] : shuffled;
}

/** Try to place one piece; returns its cells or null. */
function place(v, b, g, res, used, id, len, rng, opts = {}) {
  for (const c of opts.list ?? candidates(g, len, rng, opts.wallFirst ?? true)) {
    const js = c.cells.map(([a, k]) => a + g.W * k);
    if (js.some((j) => !g.free[j] || used[j] || res[j])) continue;
    const before = pieces(g, used);
    for (const j of js) used[j] = 1;
    if (pieces(g, used) > before) { for (const j of js) used[j] = 0; continue; }
    for (const [a, k] of c.cells) set(v, b.x0 + a, b.y0, b.z0 + k, id);
    return c.cells;
  }
  return null;
}

/** Chairs on free cells next to a table cell. */
function chairsAround(v, b, g, res, used, [ti, tk], rng, max) {
  const list = rng.shuffle(SIDES.map(([dx, dz]) => ({ cells: [[ti + dx, tk + dz]] })))
    .filter((c) => c.cells.every(([a, k]) => a >= 0 && k >= 0 && a < g.W && k < g.D));
  let n = 0;
  while (n < max && place(v, b, g, res, used, ID('chair'), 1, rng, { list })) n++;
  return n;
}

/**
 * Furnish typed rooms in `v`. `rooms` = [{type, box {x0,x1,z0,z1,y0 (feet), y1}}]; options `styleKey`, `seed`, `keep`
 * [{x,y,z}] cells to leave free. A living room also gets a bed when no room is a bedroom (studios) and a counter
 * and a table when none is a kitchen.
 * Returns `{pieces [{room, key, cells [{x,y,z}]}], lamps [{x,y,z}], rugs}`.
 */
export function furnish(v, rooms, { styleKey = '', seed = 0, keep = [] } = {}) {
  const rng = createRng(seedFor('furnish', styleKey, seed));
  const pieces = [], lamps = [];
  let rugs = 0;
  const hasKitchen = rooms.some((r) => r.type === 'kitchen'), hasBedroom = rooms.some((r) => r.type === 'bedroom');
  rooms.forEach((room, ri) => {
    const b = room.box;
    if (room.type === 'lanai' || room.type === 'garage' || room.type === 'porch') return;
    const g = roomGrid(v, b);
    if (!g.free.some((f) => f)) return;
    const res = reservedCells(v, b, g, keep);
    const used = new Uint8Array(g.W * g.D);
    const at = (cells) => cells.map(([a, k]) => ({ x: b.x0 + a, y: b.y0, z: b.z0 + k }));
    let list = PIECES[room.type] ?? (NO_FURNITURE.has(room.type) ? [] : PIECES.den);
    if (room.type === 'living' && !hasBedroom) list = [['bed', 2], ...list];
    if (room.type === 'living' && !hasKitchen) list = [...list, ['counter', 2], ['table', 1]];
    for (const [key, len] of list) {
      const cells = place(v, b, g, res, used, ID(key), len, rng, { wallFirst: key !== 'table' || g.W * g.D <= 9 })
        ?? (len > 1 ? place(v, b, g, res, used, ID(key), 1, rng) : null);
      if (!cells) continue;
      pieces.push({ room: ri, key, cells: at(cells) });
      if (key === 'table') {
        const n = chairsAround(v, b, g, res, used, cells[0], rng, g.W * g.D >= VI.bigRoom ? 2 : 1);
        if (n) pieces.push({ room: ri, key: 'chair', n });
      }
    }
    // A lamp in a corner (any wall cell when the corners are taken).
    const corners = [[0, 0], [g.W - 1, 0], [0, g.D - 1], [g.W - 1, g.D - 1]].map((c) => ({ cells: [c] }));
    const lamp = place(v, b, g, res, used, ID('lamp'), 1, rng, { list: rng.shuffle(corners) })
      ?? place(v, b, g, res, used, ID('lamp'), 1, rng);
    if (lamp) lamps.push(...at(lamp));
    // A rug under the middle of living rooms and bedrooms (it replaces the floor, so it never blocks).
    if ((room.type === 'living' || room.type === 'bedroom') && g.W >= 3 && g.D >= 3) {
      const rug = ID(RUGS[rng.int(0, RUGS.length - 1)]);
      const ci = g.W >> 1, ck = g.D >> 1;
      for (let a = ci - 1; a <= ci + (g.W > 4 ? 1 : 0); a++) for (let k = ck - 1; k <= ck + (g.D > 4 ? 1 : 0); k++) {
        if (a < 0 || k < 0 || a >= g.W || k >= g.D || !g.free[a + g.W * k]) continue;
        const x = b.x0 + a, z = b.z0 + k;
        if (isSolid(get(v, x, b.y0 - 1, z))) { set(v, x, b.y0 - 1, z, rug); rugs++; }
      }
    }
  });
  return { pieces, lamps, rugs };
}
