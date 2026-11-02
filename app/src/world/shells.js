// Building shells for the neighborhood (13 §5, homeblocks 07). Pure: no DOM, no three.
// Cheap outsides only: houses are hollow boxes with a stepped roof; row houses, floor blocks and towers are solid
// cores with glass set into the outer face, so a whole street costs little to mesh. Boxes are inclusive cells.
import { BLOCK } from './blocks.js';
import { fillBox, hollowBox, set, get } from './volume.js';
import { NEIGHBORHOOD } from '../config.js';

const ID = (key) => BLOCK[key].id;

/** Roof shapes a style family's `house.roof` maps to. */
const ROOF_OF = { gable: 'gable', hip: 'hip', flat: 'flat', shed: 'gable', tile: 'hip', tin: 'gable' };

/** The block roof shape for a style family's house roof key ('gable' when unknown). */
export function roofShapeFor(roofKey) {
  return ROOF_OF[roofKey] ?? 'gable';
}

/**
 * Stepped roof over the footprint {x0, z0, x1, z1} starting at y. shape gable (ridge along x) | hip | flat (slab +
 * trim parapet). Overhangs one block. Returns the top y the roof reached.
 */
export function addRoof(v, { x0, z0, x1, z1 }, y, shape, roofId, trimId = roofId) {
  if (shape === 'flat') {
    fillBox(v, { x0, y0: y, z0, x1, y1: y, z1 }, roofId);
    hollowBox(v, { x0, y0: y + 1, z0, x1, y1: y + 1, z1 }, trimId, { floorId: 0, ceilId: 0 });
    return y + 1;
  }
  let top = y;
  for (let k = 0; ; k++) {
    const za = z0 - 1 + k, zb = z1 + 1 - k;
    const xa = shape === 'hip' ? x0 - 1 + k : x0 - 1, xb = shape === 'hip' ? x1 + 1 - k : x1 + 1;
    if (za > zb || xa > xb) break;
    fillBox(v, { x0: xa, y0: y + k, z0: za, x1: xb, y1: y + k, z1: zb }, roofId);
    top = y + k;
  }
  return top;
}

/** Glass or lit-glass, seeded. */
const pane = (rng, lit) => (rng.chance(lit) ? ID('lit-glass') : ID('glass'));

/**
 * Set window cells into the four outer faces of a box between y0 and y1: one window row per story at story offset
 * `rowAt`, a window every `every` cells along each face (corners stay wall).
 */
export function addWindows(v, { x0, z0, x1, z1 }, y0, y1, rng, { every = 3, rows = [2], lit = NEIGHBORHOOD.litChance } = {}) {
  const H = NEIGHBORHOOD.storyH;
  for (let base = y0; base + H - 1 <= y1 + 1; base += H) {
    for (const r of rows) {
      const y = base + r;
      if (y > y1) continue;
      for (let x = x0 + 2; x <= x1 - 2; x += every) { set(v, x, y, z0, pane(rng, lit)); set(v, x, y, z1, pane(rng, lit)); }
      for (let z = z0 + 2; z <= z1 - 2; z += every) { set(v, x0, y, z, pane(rng, lit)); set(v, x1, y, z, pane(rng, lit)); }
    }
  }
}

/** Door (lower + upper) in the wall cell column (x, y + 1 … y + 2, z). */
function door(v, x, y, z) {
  set(v, x, y + 1, z, ID('door-lower'));
  set(v, x, y + 2, z, ID('door-upper'));
}

/**
 * A detached house shell on ground `base` (top of the foundation): slab floor, hollow walls, windows, a door facing
 * the street (`face` +1 = door on z1, −1 = door on z0), a stepped roof. Returns the box it occupies.
 */
export function houseShell(v, rect, base, { stories = 1, wallId, roofId, trimId, roof = 'gable', face = 1, rng }) {
  const { x0, z0, x1, z1 } = rect, H = NEIGHBORHOOD.storyH;
  const top = base + H * stories;
  hollowBox(v, { x0, y0: base, z0, x1, y1: top, z1 }, wallId, { floorId: ID('slab'), ceilId: 0 });
  fillBox(v, { x0, y0: top, z0, x1, y1: top, z1 }, wallId);
  addWindows(v, rect, base, top - 1, rng);
  door(v, Math.floor((x0 + x1) / 2), base, face > 0 ? z1 : z0);
  const roofTop = addRoof(v, rect, top + 1, roof, roofId, trimId);
  return { x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z1 + 1, y0: base, y1: roofTop };
}

/**
 * A solid building (row-house unit, floor block or tower): a core of `wallId`, glass in the outer face on every story,
 * a trim band at each floor line, a flat roof with a parapet, a door on the street face. Returns its box.
 */
export function blockShell(v, rect, base, { floors, wallId, trimId, roofId, face = 1, rng, every = 2, rows = [1, 2], band = true }) {
  const { x0, z0, x1, z1 } = rect, H = NEIGHBORHOOD.storyH;
  const top = base + H * floors;
  fillBox(v, { x0, y0: base + 1, z0, x1, y1: top, z1 }, wallId);
  if (band) {
    for (let y = base + H; y < top; y += H) hollowBox(v, { x0, y0: y, z0, x1, y1: y, z1 }, trimId, { floorId: 0, ceilId: 0 });
  }
  addWindows(v, rect, base, top - 1, rng, { every, rows });
  door(v, Math.floor((x0 + x1) / 2), base, face > 0 ? z1 : z0);
  const roofTop = addRoof(v, rect, top + 1, 'flat', roofId, trimId);
  return { x0, z0, x1, z1, y0: base, y1: roofTop };
}

/** A tower: blockShell with a glass curtain (windows every cell, two rows per story) and a rooftop machine room. */
export function towerShell(v, rect, base, { floors, wallId, trimId, rng }) {
  const box = blockShell(v, rect, base, { floors, wallId, trimId, roofId: ID('concrete'), rng, every: 1, rows: [1, 2] });
  const cx = Math.floor((rect.x0 + rect.x1) / 2), cz = Math.floor((rect.z0 + rect.z1) / 2);
  fillBox(v, { x0: cx - 2, y0: box.y1, z0: cz - 2, x1: cx + 2, y1: box.y1 + 2, z1: cz + 2 }, ID('metal'));
  return { ...box, y1: box.y1 + 2 };
}

/** Fence ring at y around {x0, z0, x1, z1}, following the ground: `groundAt(x, z)` gives each post's ground. */
export function fenceRing(v, { x0, z0, x1, z1 }, groundAt) {
  const fence = ID('fence');
  const post = (x, z) => { const g = groundAt(x, z); if (g >= 0 && get(v, x, g + 1, z) === 0) set(v, x, g + 1, z, fence); };
  for (let x = x0; x <= x1; x++) { post(x, z0); post(x, z1); }
  for (let z = z0 + 1; z < z1; z++) { post(x0, z); post(x1, z); }
}
