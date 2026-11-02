// The yard around a block house (13 §5, homeblocks 09). Pure: no DOM, no three. Called by voxHouse.js after the walls
// are up: porch / lānai, garage or carport, driveway, front path, fence with gates, garden beds, fruit trees, coop.
import { BLOCK } from './blocks.js';
import { get, set, fillBox, hollowBox } from './volume.js';
import { placeTree } from './trees.js';
import { WORLD, VOX_HOUSE as VH } from '../config.js';

const ID = (k) => BLOCK[k].id;
const ftPos = (ft) => Math.round(ft / WORLD.ftPerBlock);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Fence kind (housePlan FENCES) → block key; 'none' → null. */
const FENCE_BLOCK = { hedge: 'leaves', picket: 'fence', ranch: 'fence', iron: 'metal', lava: 'lava-rock', block: 'stone-brick' };

/** Pave the ground top (y = base) in a box where nothing stands on it. */
function pave(v, { x0, x1, z0, z1 }, base, id, keep = []) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (get(v, x, base + 1, z) !== 0 || keep.includes(get(v, x, base, z))) continue;
    set(v, x, base, z, id);
  }
}

/**
 * Add the yard. ctx = {o, base, main, parts, plan, look, ids, extras, rng, door}. Returns `{lot, parts (garage boxes
 * that need a roof), pathX, plantSpots, animalSpots}`.
 */
export function addYard(v, { o, base, main, parts, plan, look, ids, extras = {}, rng, door }) {
  const L = WORLD.lotHalf;
  const lot = { x0: o.x - L, x1: o.x + L, z0: o.z - L, z1: o.z + L };
  const inLot = (p) => ({ x: clamp(o.x + ftPos(p.x), lot.x0 + 2, lot.x1 - 2), z: clamp(o.z + ftPos(p.z), lot.z0 + 2, lot.z1 - 3) });
  const extra = [];
  const deck = ID('planks-light'), concrete = ID('concrete');

  // Porch / lānai in front of the door (stoop: a stone step; patio: a deck without a roof).
  const P = Math.min(VH.porchMax, Math.max(2, Math.round(plan.main.porchD / WORLD.ftPerBlock)));
  if (look.porch === 'stoop') {
    pave(v, { x0: door.x - 1, x1: door.x + 1, z0: door.z, z1: door.z }, base, ID('stone-brick'));
  } else if (look.porch && look.porch !== 'none') {
    const pw = clamp(Math.round(plan.main.porchW / WORLD.ftPerBlock), 3, main.x1 - main.x0 + 1);
    const x0 = clamp(door.x - (pw >> 1), main.x0, main.x1 - pw + 1);
    const decks = [{ x0, x1: x0 + pw - 1, z0: main.z1 + 1, z1: main.z1 + P }];
    if (look.porch === 'wraparound') decks.push({ x0: main.x1 + 1, x1: main.x1 + P, z0: main.z0 + 1, z1: main.z1 + P });
    for (const d of decks) {
      pave(v, d, base, deck);
      if (look.porch === 'patio') continue;
      for (const [x, z] of [[d.x0, d.z1], [d.x1, d.z1], [d.x1, d.z0]]) {
        if (get(v, x, base + 1, z) === 0) fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: base + 1, y1: base + 3 }, ids.trim);
      }
      for (let x = d.x0; x <= d.x1; x++) for (let z = d.z0; z <= d.z1; z++) if (get(v, x, base + 4, z) === 0) set(v, x, base + 4, z, ids.roof);
    }
  }

  // Garage (two-car, beside the house), carport or a plain driveway, then the driveway to the street.
  let drive = null;
  if (plan.garage === 'garage-2') {
    const g = { kind: 'garage', x1: main.x0, x0: main.x0 - VH.garage.w + 1, z1: main.z1, z0: main.z1 - VH.garage.d + 1, stories: 1, top: base + VH.storyH };
    g.x0 = Math.max(g.x0, lot.x0 + 1);
    hollowBox(v, { x0: g.x0, y0: base, z0: g.z0, x1: g.x1, y1: g.top, z1: g.z1 }, ids.wall, { floorId: concrete, ceilId: ids.floor });
    fillBox(v, { x0: g.x0 + 1, x1: g.x1 - 1, z0: g.z1, z1: g.z1, y0: base + 1, y1: base + 3 }, 0);
    extra.push(g);
    drive = { x0: g.x0 + 1, x1: g.x1 - 1, z0: g.z1 + 1 };
  } else if (plan.garage === 'carport') {
    const c = { x0: main.x1 + 1, x1: Math.min(lot.x1 - 1, main.x1 + VH.carport.w), z1: main.z1, z0: main.z1 - VH.carport.d + 1 };
    pave(v, c, base, concrete);
    for (const [x, z] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]]) fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: base + 1, y1: base + 3 }, ids.trim);
    for (let x = c.x0; x <= c.x1; x++) for (let z = c.z0; z <= c.z1; z++) if (get(v, x, base + 4, z) === 0) set(v, x, base + 4, z, ids.roof);
    drive = { x0: c.x0, x1: Math.min(c.x1, c.x0 + 2), z0: c.z1 + 1 };
  } else if (plan.driveX != null) {
    const x = clamp(o.x + ftPos(plan.driveX), lot.x0 + 2, lot.x1 - 2);
    drive = { x0: x - 1, x1: x + 1, z0: main.z1 - 2 };
  }
  if (drive) pave(v, { ...drive, z1: lot.z1 }, base, concrete);

  // Front path from the porch (or door) to the street, then the fence with gates at the path and driveway.
  const pathX = door.x;
  pave(v, { x0: pathX, x1: pathX, z0: door.z, z1: lot.z1 }, base, ID('gravel'), [deck, ID('stone-brick'), concrete]);
  const fenceKey = FENCE_BLOCK[plan.fence];
  if (fenceKey) {
    const f = ID(fenceKey);
    const gate = (x, z) => z === lot.z1 && (Math.abs(x - pathX) <= 1 || (drive && x >= drive.x0 - 1 && x <= drive.x1 + 1));
    const post = (x, z) => { if (!gate(x, z) && get(v, x, base + 1, z) === 0) set(v, x, base + 1, z, f); };
    for (let x = lot.x0; x <= lot.x1; x++) { post(x, lot.z0); post(x, lot.z1); }
    for (let z = lot.z0 + 1; z < lot.z1; z++) { post(lot.x0, z); post(lot.x1, z); }
  }

  // Garden beds, fruit trees and the coop at the plan's spots.
  const plantSpots = [];
  const beds = Math.min(extras.gardenBeds | 0, plan.spots.beds.length);
  for (let i = 0; i < beds; i++) {
    const { x, z } = inLot(plan.spots.beds[i]);
    const r = { x0: x - 1, x1: x - 1 + VH.bed.w - 1, z0: z, z1: z + VH.bed.d - 1 };
    pave(v, r, base, ID('dirt'));
    for (let bx = r.x0; bx <= r.x1; bx++) for (let bz = r.z0; bz <= r.z1; bz++) if (get(v, bx, base + 1, bz) === 0) set(v, bx, base + 1, bz, ID('crops'));
    plantSpots.push({ x, y: base + 1, z });
  }
  plantSpots.push({ x: door.x + 1, y: base + 1, z: door.z });
  const trees = Math.min(extras.fruitTrees | 0, plan.spots.trees.length);
  for (let i = 0; i < trees; i++) {
    const { x, z } = inLot(plan.spots.trees[i]);
    placeTree(v, 'fruit', x, base + 1, z, rng);
  }
  const pet = inLot(plan.spots.pet);
  const animalSpots = [{ x: pet.x, y: base + 1, z: pet.z }, { x: door.x - 1, y: base + 1, z: door.z }];
  if (extras.coop) {
    const { x, z } = inLot(plan.spots.coop);
    fillBox(v, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z, y0: base + 1, y1: base + 2 }, ID('coop'));
    animalSpots.push({ x, y: base + 1, z: z + 1 });
  }
  return { lot, parts: extra, pathX, plantSpots, animalSpots };
}
