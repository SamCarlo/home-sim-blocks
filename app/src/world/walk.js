// Walking over a block volume (13 §6, homeblocks 09). Pure: no DOM, no three.
// A walker is 2 blocks tall: it stands in cell (x, y, z) when that cell and the one above are not solid and the cell
// below is solid ground (fences, hedges and leaves don't count as ground: nobody walks on top of them). It moves to
// the 4 side neighbors, stepping up or down at most one block (a step up also needs headroom above where it stands).
import { BLOCK, isSolid } from './blocks.js';
import { get, inBounds, idx, coords } from './volume.js';

const NO_GROUND = new Set(['fence', 'leaves', 'leaves-wilted', 'palm-leaves', 'pine-leaves', 'lehua-leaves', 'cactus'].map((k) => BLOCK[k].id));
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Can a walker stand with its feet in cell (x, y, z)? */
export function canStand(v, x, y, z) {
  if (!inBounds(v, x, y, z) || y < 1) return false;
  const below = get(v, x, y - 1, z);
  return isSolid(below) && !NO_GROUND.has(below) && !isSolid(get(v, x, y, z)) && !isSolid(get(v, x, y + 1, z));
}

const inside = (b, x, y, z) => !b || (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1);

/**
 * Breadth-first search over standing cells from `start` {x, y, z}, inside `bounds` (inclusive box, optional).
 * Returns `Map<cell index, previous cell index (-1 for the start)>`; empty when the start isn't standable.
 */
export function walkSearch(v, start, { bounds = null, goal = null } = {}) {
  const prev = new Map();
  if (!canStand(v, start.x, start.y, start.z)) return prev;
  const s = idx(v, start.x, start.y, start.z);
  const g = goal ? idx(v, goal.x, goal.y, goal.z) : -2;
  prev.set(s, -1);
  const queue = [s];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (i === g) break;
    const { x, y, z } = coords(v, i);
    const headroom = !isSolid(get(v, x, y + 2, z));
    for (const [dx, dz] of SIDES) {
      const nx = x + dx, nz = z + dz;
      for (const dy of [0, 1, -1]) {
        const ny = y + dy;
        if (dy === 1 && !headroom) continue;
        if (dy === -1 && isSolid(get(v, nx, y + 1, nz))) continue;
        if (!inside(bounds, nx, ny, nz) || !canStand(v, nx, ny, nz)) continue;
        const n = idx(v, nx, ny, nz);
        if (!prev.has(n)) { prev.set(n, i); queue.push(n); }
        break;
      }
    }
  }
  return prev;
}

/** Is `to` reachable on foot from `from`? */
export function canWalk(v, from, to, opts = {}) {
  return walkSearch(v, from, { ...opts, goal: to }).has(idx(v, to.x, to.y, to.z));
}

/**
 * Shortest walk from `from` to `to` as waypoints [{x, y, z}] (start, every turn or step, end), or null when there is
 * no way through.
 */
export function walkPath(v, from, to, opts = {}) {
  const prev = walkSearch(v, from, { ...opts, goal: to });
  let i = idx(v, to.x, to.y, to.z);
  if (!prev.has(i)) return null;
  const cells = [];
  for (; i !== -1; i = prev.get(i)) cells.push(coords(v, i));
  cells.reverse();
  return cells.filter((c, k) => {
    if (k === 0 || k === cells.length - 1) return true;
    const a = cells[k - 1], b = cells[k + 1];
    return !(b.x - c.x === c.x - a.x && b.z - c.z === c.z - a.z && b.y === c.y && c.y === a.y);
  });
}
