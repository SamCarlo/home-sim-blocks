// Trees and plants as small block shapes (13 §4–§5, homeblocks 06). Pure: no DOM, no three.
// A shape is a list of [dx, dy, dz, blockKey] cells relative to the base cell (the first air cell above the ground).
// Kinds: oak, pine, palm, ohia (ʻōhiʻa, red lehua blossoms), cactus, banana, fruit. Options:
//   wilted  → every leaf block becomes wilted brown leaves (a neglected yard, task 13+)
//   bare    → deciduous trees (oak, fruit, ohia stays green) lose their leaves (snow months, 08 §3)
//   snowCap → a snow block on each topmost leaf of a pine
import { BLOCK } from './blocks.js';
import { get, set, inBounds } from './volume.js';

export const TREE_KINDS = ['oak', 'pine', 'palm', 'ohia', 'cactus', 'banana', 'fruit'];

/** Kinds that drop their leaves in snow months. */
const DECIDUOUS = new Set(['oak', 'fruit']);
const LEAF_KEYS = new Set(['leaves', 'pine-leaves', 'palm-leaves', 'lehua-leaves', 'flowers']);

/** A filled blob of leaves: rings of `radius` at each dy, trimming corners at random. */
function canopy(cells, rng, y0, layers, key, alt = null, altP = 0) {
  layers.forEach((r, i) => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && r > 0 && rng.chance(0.75)) continue;
        cells.push([dx, y0 + i, dz, alt && rng.chance(altP) ? alt : key]);
      }
    }
  });
}

const SHAPES = {
  oak(rng) {
    const h = rng.int(4, 5), c = [];
    for (let y = 0; y < h; y++) c.push([0, y, 0, 'trunk']);
    canopy(c, rng, h - 2, [2, 2, 1, 0], 'leaves');
    return c;
  },
  pine(rng) {
    const h = rng.int(6, 8), c = [];
    for (let y = 0; y < h - 1; y++) c.push([0, y, 0, 'trunk']);
    const layers = h >= 8 ? [2, 2, 1, 1, 1, 0, 0] : [2, 1, 1, 1, 0, 0];
    canopy(c, rng, 2, layers, 'pine-leaves');
    return c;
  },
  palm(rng) {
    const h = rng.int(6, 8), c = [];
    const lean = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    let x = 0, z = 0;
    for (let y = 0; y < h; y++) {
      if (y === Math.floor(h / 2)) { x += lean[0]; z += lean[1]; }
      c.push([x, y, z, 'palm-trunk']);
    }
    c.push([x, h, z, 'palm-leaves']);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= 3; k++) c.push([x + ax * k, h - (k === 3 ? 1 : 0), z + az * k, 'palm-leaves']);
    }
    return c;
  },
  ohia(rng) {
    const h = rng.int(3, 4), c = [];
    for (let y = 0; y < h; y++) c.push([0, y, 0, 'trunk']);
    canopy(c, rng, h - 1, [2, 2, 1], 'leaves', 'lehua-leaves', 0.35);
    return c;
  },
  cactus(rng) {
    const h = rng.int(2, 4), c = [];
    for (let y = 0; y < h; y++) c.push([0, y, 0, 'cactus']);
    if (h >= 3) {
      const [ax, az] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      c.push([ax, 1, az, 'cactus'], [ax, 2, az, 'cactus']);
    }
    return c;
  },
  banana(rng) {
    const h = 3, c = [];
    for (let y = 0; y < h; y++) c.push([0, y, 0, 'palm-trunk']);
    c.push([0, h, 0, 'palm-leaves']);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.push([ax, h, az, 'palm-leaves'], [ax * 2, h - 1, az * 2, 'palm-leaves']);
    if (rng.chance(0.7)) c.push([1, h - 1, 0, 'crops']); // a hanging bunch
    return c;
  },
  fruit(rng) {
    const c = [[0, 0, 0, 'trunk'], [0, 1, 0, 'trunk']];
    canopy(c, rng, 2, [1, 1, 0], 'leaves', 'flowers', 0.2);
    return c;
  },
};

/** The cells of one tree: [[dx, dy, dz, key], …]. Seeded by `rng` (util/rng.js). */
export function treeShape(kind, rng, { wilted = false, bare = false, snowCap = false } = {}) {
  const make = SHAPES[kind];
  if (!make) throw new Error(`treeShape: unknown kind ${kind}`);
  let cells = make(rng);
  if (bare && DECIDUOUS.has(kind)) {
    const h = cells.filter((c) => c[3] === 'trunk').length;
    cells = cells.filter((c) => !LEAF_KEYS.has(c[3]));
    cells.push([1, h - 1, 0, 'trunk'], [-1, h, 0, 'trunk'], [0, h - 1, 1, 'trunk']); // bare branches
  } else if (wilted) {
    cells = cells.map(([x, y, z, k]) => [x, y, z, LEAF_KEYS.has(k) && k !== 'flowers' ? 'leaves-wilted' : k]);
  }
  if (snowCap && kind === 'pine') {
    const top = new Map();
    for (const [x, y, z, k] of cells) if (k === 'pine-leaves') top.set(`${x},${z}`, Math.max(top.get(`${x},${z}`) ?? -1, y));
    for (const [key, y] of top) { const [x, z] = key.split(',').map(Number); cells.push([x, y + 1, z, 'snow']); }
  }
  return cells;
}

/** Horizontal reach of a tree kind (for spacing). */
export function treeRadius(kind) {
  return kind === 'palm' ? 4 : kind === 'cactus' ? 1 : kind === 'banana' || kind === 'fruit' ? 2 : 2;
}

/**
 * Write a tree with its base at (x, y, z) into the volume. Only air cells are filled (trees never cut into ground or
 * buildings). Returns the number of cells written; 0 when the base is outside the volume.
 */
export function placeTree(v, kind, x, y, z, rng, opts = {}) {
  if (!inBounds(v, x, y, z)) return 0;
  let n = 0;
  for (const [dx, dy, dz, key] of treeShape(kind, rng, opts)) {
    const cx = x + dx, cy = y + dy, cz = z + dz;
    if (get(v, cx, cy, cz) === 0 && set(v, cx, cy, cz, BLOCK[key].id)) n++;
  }
  return n;
}
