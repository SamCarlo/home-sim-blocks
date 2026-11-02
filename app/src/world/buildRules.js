// Building rules for Explore (13 §9, blocks task 17). Pure: no DOM, no three.
// canEdit decides whether a break or place at a cell is allowed: inside the contract's `property` boxes, not bedrock and
// not below groundY − digDepth, not a protected cell (doors, the student's mailbox, plant/animal spots, the cells of the
// life animation's `path`), not inside the player's body, and only placeable ids (plus the home's own style blocks).
// hotbarFor(location) is the 9-slot hotbar: the home's style blocks, then glass, planks, flowers, decor.
import { BLOCK, blockById, styleBlocks } from './blocks.js';
import { get } from './volume.js';
import { BLOCK_BUILD as BUILD, EXPLORE, WORLD } from '../config.js';

/** Friendly toast text per refusal reason (13 §9). */
export const REASONS = {
  outside: "That's your neighbor's. Build on your own place.",
  bedrock: "That's bedrock. It can't be broken.",
  'too-deep': "That's as deep as you can dig here.",
  protected: 'That spot needs to stay clear so life at home keeps working.',
  player: "You're standing there. Step back first.",
  'not-placeable': "That block can't be placed.",
  occupied: "There's already a block there.",
  empty: 'Nothing to break there.',
};

const inBox = (b, c) => c.x >= Math.min(b.x0, b.x1) && c.x <= Math.max(b.x0, b.x1) && c.y >= Math.min(b.y0, b.y1)
  && c.y <= Math.max(b.y0, b.y1) && c.z >= Math.min(b.z0, b.z1) && c.z <= Math.max(b.z0, b.z1);
const key = (x, y, z) => `${x},${y},${z}`;
const ID = (k) => BLOCK[k].id;
const DOORS = new Set([ID('door-lower'), ID('door-upper')]);

/** Every cell a waypoint polyline walks through (each segment stepped one cell at a time). */
function pathCells(path) {
  const out = [];
  for (let i = 0; i < (path?.length ?? 0); i++) {
    const a = path[i], b = path[i + 1] ?? a;
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z), 1);
    for (let s = 0; s <= n; s++) {
      out.push({ x: Math.round(a.x + ((b.x - a.x) * s) / n), y: Math.round(a.y + ((b.y - a.y) * s) / n), z: Math.round(a.z + ((b.z - a.z) * s) / n) });
    }
  }
  return out;
}

/**
 * The set of protected cell keys for a contract: the door and the cell above it, plant and animal spots with the cell under
 * each, and every cell of `path` with the ground under it and the head room above it. Cached on the contract.
 */
export function protectedCells(contract) {
  if (contract._protected) return contract._protected;
  const s = new Set();
  const add = (c, dy = [0]) => { for (const d of dy) s.add(key(c.x, c.y + d, c.z)); };
  if (contract.door) add(contract.door, [0, 1]);
  for (const c of contract.plantSpots ?? []) add(c, [-1, 0, 1]);
  for (const c of contract.animalSpots ?? []) add(c, [-1, 0, 1]);
  for (const c of pathCells(contract.path)) add(c, [-1, 0, 1]);
  Object.defineProperty(contract, '_protected', { value: s, enumerable: false });
  return s;
}

/** Does the player's body (feet at {x, y, z}) overlap cell c? */
function inBody(p, c, cfg = EXPLORE) {
  const r = cfg.bodyHalf;
  return c.x + 1 > p.x - r && c.x < p.x + r && c.z + 1 > p.z - r && c.z < p.z + r && c.y + 1 > p.y && c.y < p.y + cfg.bodyHeight;
}

/**
 * canEdit(contract, {x, y, z}, action 'break' | 'place', id, {player?, allowed?}) → {ok, reason}. For 'break', `id` is the block there
 * (read from contract.volume when given); for 'place', the block to put down (`allowed`, a Set of extra ids such as the home's
 * tinted style blocks, may place even though they are not `placeable`). `reason` is a REASONS key; `text` its toast.
 */
export function canEdit(contract, cell, action, id, { player = null, allowed = null } = {}) {
  const no = (reason) => ({ ok: false, reason, text: REASONS[reason] });
  const { x, y, z } = cell;
  if (![x, y, z].every(Number.isInteger)) return no('outside');
  if (!(contract.property ?? []).some((b) => inBox(b, cell))) return no('outside');
  const here = contract.volume ? get(contract.volume, x, y, z) : (action === 'break' ? id : 0);
  if (action === 'break') {
    if (here === ID('bedrock')) return no('bedrock');
    if (y < WORLD.groundY - WORLD.digDepth) return no('too-deep');
    if (here === 0) return no('empty');
    if (DOORS.has(here) || here === ID('mailbox') || protectedCells(contract).has(key(x, y, z))) return no('protected');
    return { ok: true, reason: null };
  }
  if (action !== 'place') return no('not-placeable');
  const def = blockById(id);
  if (!def || id === 0 || !(def.placeable || allowed?.has(id))) return no('not-placeable');
  if (y < WORLD.groundY - WORLD.digDepth) return no('too-deep');
  if (protectedCells(contract).has(key(x, y, z))) return no('protected');
  if (here !== 0 && !BUILD.replaceable.includes(blockById(here)?.key)) return no('occupied');
  if (player && def.solid && inBody(player, cell)) return no('player');
  return { ok: true, reason: null };
}

/**
 * hotbarFor({styleFamily, styleVariant}) → 9 block ids: the home's wall, roof, trim and floor (13 §9 "style blocks first"),
 * then glass, planks, flowers and two decor blocks (config.BUILD.hotbarTail). Duplicates are dropped and the tail fills up.
 */
export function hotbarFor(location) {
  const st = location?.styleFamily ? styleBlocks(location.styleFamily, location.styleVariant ?? null) : {};
  const ids = [st.wall, st.roof, st.trim, st.floor, ...BUILD.hotbarTail.map(ID)].filter((v) => v);
  return [...new Set(ids)].slice(0, BUILD.slots);
}

/** The cell a place action fills: the picked cell stepped out along its face normal. */
export function placeCell(hit) {
  return { x: hit.x + hit.normal[0], y: hit.y + hit.normal[1], z: hit.z + hit.normal[2] };
}
