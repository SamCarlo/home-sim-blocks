// The student's house or shared house in blocks (13 §5, homeblocks 09). Pure: no DOM, no three.
// Turns a `planHouse` plan (feet, lot center = origin, street along +z) into blocks: main block + wings, one slab per
// story with 3-block ceilings, style walls with trim corners and eaves, glass windows, a front door, rooms split by
// partition walls with doorways, switchback stairs between stories, a stepped roof; the yard is in voxHouseYard.js.
import { BLOCK, BLOCKS, styleBlocks } from './blocks.js';
import { get, set, fillBox, hollowBox, idx, ftToBlocks } from './volume.js';
import { canStand, walkPath } from './walk.js';
import { addYard } from './voxHouseYard.js';
import { styleFamily } from '../data/styleFamilies.js';
import { createRng, seedFor } from '../util/rng.js';
import { WORLD, VOX_HOUSE as VH } from '../config.js';

const ID = (k) => BLOCK[k].id;
/** A plan position in feet → a block offset. */
export const ftPos = (ft) => Math.round(ft / WORLD.ftPerBlock);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/** Block roof shape per style look roof (13 §5: gable / hip / flat). */
const ROOF_SHAPE = { gable: 'gable', hip: 'hip', flat: 'flat', shed: 'flat', barrel: 'hip', aframe: 'gable', saltbox: 'gable' };

const hex = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
const dist = (a, b) => a.reduce((t, c, i) => t + (c - b[i]) ** 2, 0);
/** Closest tinted block of a role ('plaster' | 'roof' | 'trim') to a hex color. */
function nearest(role, color) {
  const want = hex(color);
  let best = null, bd = Infinity;
  for (const b of BLOCKS) {
    if (!b.key.startsWith(`${role}-`) || !b.tint) continue;
    const d = dist(hex(b.tint), want);
    if (d < bd) { bd = d; best = b; }
  }
  return best?.id;
}

/**
 * {wall, roof, trim, floor} ids for a style family and palette index. Palette 0 is the family's own set; other
 * palettes use the closest-colored style blocks from any family (only palette 0 has its own blocks, see DEVIATIONS).
 */
export function paletteBlocks(styleKey, variant = null, palette = 0) {
  const own = styleBlocks(styleKey, variant);
  const pal = palette ? styleFamily(styleKey, variant).palettes[palette] : null;
  if (!pal) return own;
  return { ...own, wall: nearest('plaster', pal.wall) ?? own.wall, roof: nearest('roof', pal.roof) ?? own.roof,
    trim: nearest('trim', pal.trim) ?? own.trim };
}

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const interior = (p) => ({ x0: p.x0 + 1, z0: p.z0 + 1, x1: p.x1 - 1, z1: p.z1 - 1 });

/** Split rect into about n rooms with partition walls (y feet..feet+2). Records rooms and the walls between them. */
function partition(v, rect, n, feet, wallId, out) {
  const w = rect.x1 - rect.x0 + 1, d = rect.z1 - rect.z0 + 1;
  const alongX = w >= 7 && (w >= d || d < 7);
  const len = alongX ? w : d;
  if (n <= 1 || len < 7) { out.rooms.push(rect); return; }
  const n1 = n >> 1;
  const cut = clamp(Math.round((len * n1) / n), 3, len - 4);
  const at = (alongX ? rect.x0 : rect.z0) + cut;
  const wall = alongX ? { ...rect, x0: at, x1: at } : { ...rect, z0: at, z1: at };
  fillBox(v, { x0: wall.x0, x1: wall.x1, z0: wall.z0, z1: wall.z1, y0: feet, y1: feet + 2 }, wallId);
  const a = alongX ? { ...rect, x1: at - 1 } : { ...rect, z1: at - 1 };
  const b = alongX ? { ...rect, x0: at + 1 } : { ...rect, z0: at + 1 };
  out.walls.push({ wall, alongX, feet });
  partition(v, a, n1, feet, wallId, out);
  partition(v, b, n - n1, feet, wallId, out);
}

/** Open a 2-high doorway in a 1-thick wall line where both sides can be stood on; middle first. */
function doorway(v, cells, side, feet) {
  const mid = cells.length >> 1;
  const order = cells.map((_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  for (const i of order) {
    const [x, z] = cells[i], [dx, dz] = side;
    set(v, x, feet, z, 0); set(v, x, feet + 1, z, 0);
    if (canStand(v, x + dx, feet, z + dz) && canStand(v, x - dx, feet, z - dz)) return [x, z];
    set(v, x, feet, z, get(v, x, feet + 2, z)); set(v, x, feet + 1, z, get(v, x, feet + 2, z));
  }
  return null;
}

/** Stepped roof over rect at y. Gable ends are flush walls; only cells `ok(x, y, z)` are written. */
function stepRoof(v, r, y, { shape, ridge, run, roofId, trimId, wallId, ok }) {
  const put = (x, yy, z, id) => { if (ok(x, yy, z)) set(v, x, yy, z, id); };
  if (shape === 'flat') {
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
      put(x, y, z, roofId);
      if (x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1) put(x, y + 1, z, trimId);
    }
    return y + 1;
  }
  let top = y;
  for (let k = 0; ; k++) {
    const s = k * run - 1;
    const sx = shape === 'hip' || ridge === 'z' ? s : k === 0 ? -1 : 0;
    const sz = shape === 'hip' || ridge !== 'z' ? s : k === 0 ? -1 : 0;
    const x0 = r.x0 + sx, x1 = r.x1 - sx, z0 = r.z0 + sz, z1 = r.z1 - sz;
    if (x0 > x1 || z0 > z1) break;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const end = shape === 'gable' && k > 0 && (ridge === 'z' ? z === r.z0 || z === r.z1 : x === r.x0 || x === r.x1);
      put(x, y + k, z, end ? wallId : roofId);
    }
    top = y + k;
  }
  return top;
}

/**
 * Build the house into `v` (terrain already there, lot flat at origin.y). Options: `plan` (planHouse result),
 * `styleKey`/`variant` (default plan.style / plan.styleVariant), `extras {gardenBeds, fruitTrees, coop}`, `origin`
 * {x, y, z} (lot center at ground top), `seed`. Returns `{door, exit, path, rooms [{type, box}], windows [index],
 * plantSpots, animalSpots, lotBox, parts, info}`.
 */
export function voxHouse(v, { plan, styleKey = plan.style, variant = plan.styleVariant, extras = {}, origin = null, seed = 0 }) {
  const look = styleFamily(styleKey, variant).look;
  const ids = paletteBlocks(styleKey, variant, plan.palette);
  const rng = createRng(seedFor('vox-house', styleKey, variant ?? '', plan.variant, seed));
  const o = origin ?? { x: v.size.x >> 1, y: WORLD.groundY, z: v.size.z >> 1 };
  const base = o.y, H = VH.storyH, M = VH.minSide;

  // Main block and wings (wings share a wall with the main block and stay within its side).
  const stories = Math.max(1, Math.round(plan.main.stories));
  // Keep the area when a narrow side is widened to the minimum (Delta shotgun houses are 14 ft wide).
  const fit = (w, d, maxD = Infinity) => {
    const bw = Math.max(M, ftToBlocks(w));
    return [bw, Math.min(maxD, Math.max(M, Math.round((w * d) / (bw * WORLD.ftPerBlock ** 2))))];
  };
  const [W, D0] = fit(plan.main.w, plan.main.d);
  const D = Math.max(stories > 1 && W < 6 ? 6 : M, D0);
  const cz = o.z + ftPos(plan.houseZ);
  const main = { kind: 'main', x0: o.x - (W >> 1), z0: cz - (D >> 1), stories };
  main.x1 = main.x0 + W - 1; main.z1 = main.z0 + D - 1;
  const parts = [main];
  for (const wg of plan.wings) {
    const ws = Math.min(Math.max(1, wg.stories), stories);
    if (wg.side === 'back') {
      const [ww0, wd] = fit(wg.w, wg.d), ww = Math.min(W, ww0);
      const x0 = clamp(o.x + ftPos(wg.x) - (ww >> 1), main.x0, main.x1 - ww + 1);
      parts.push({ kind: 'wing', side: 'back', x0, x1: x0 + ww - 1, z1: main.z0, z0: main.z0 - wd + 1, stories: ws });
    } else {
      const [ww, wd] = fit(wg.w, wg.d, D);
      const z0 = clamp(cz + ftPos(wg.z) - (wd >> 1), main.z0, main.z1 - wd + 1);
      const x0 = wg.side === 'right' ? main.x1 : main.x0 - ww + 1;
      parts.push({ kind: 'wing', side: wg.side, x0, x1: x0 + ww - 1, z0, z1: z0 + wd - 1, stories: ws });
    }
  }
  for (const p of parts) p.top = base + H * p.stories;

  // Shells: walls, a slab per story, trim corners and a trim band at the eaves.
  for (const p of parts) {
    hollowBox(v, { x0: p.x0, y0: base, z0: p.z0, x1: p.x1, y1: p.top, z1: p.z1 }, ids.wall, { floorId: ids.floor, ceilId: ids.floor });
    const r = interior(p);
    for (let s = 1; s < p.stories; s++) fillBox(v, { ...r, y0: base + H * s, y1: base + H * s }, ids.floor);
  }
  for (const p of parts) {
    for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x0, p.z1], [p.x1, p.z1]]) {
      if (parts.some((q) => q !== p && inRect(interior(q), x, z))) continue;
      fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: base + 1, y1: p.top - 1 }, ids.trim);
    }
    for (let x = p.x0; x <= p.x1; x++) for (const z of [p.z0, p.z1]) set(v, x, p.top, z, ids.trim);
    for (let z = p.z0; z <= p.z1; z++) for (const x of [p.x0, p.x1]) set(v, x, p.top, z, ids.trim);
  }

  // Rooms: share the requested count over the floors by area (the main ground floor first: living + kitchen).
  const floors = [];
  for (let s = 0; s < stories; s++) for (const p of parts) if (s < p.stories) floors.push({ part: p, s, rect: interior(p), feet: base + H * s + 1 });
  const cap = (n) => Math.max(1, Math.floor((n + 1) / 4));
  for (const f of floors) {
    f.area = (f.rect.x1 - f.rect.x0 + 1) * (f.rect.z1 - f.rect.z0 + 1);
    f.cap = cap(f.rect.x1 - f.rect.x0 + 1) * cap(f.rect.z1 - f.rect.z0 + 1);
    f.n = 1;
  }
  const want = 2 + plan.beds + plan.baths;
  if (floors[0].cap >= 2) floors[0].n = 2;
  for (let left = want - floors.reduce((t, f) => t + f.n, 0); left > 0; left--) {
    const open = floors.filter((f) => f.n < f.cap).sort((a, b) => b.area / (b.n + 1) - a.area / (a.n + 1));
    if (!open.length) break;
    open[0].n++;
  }
  const out = { rooms: [], walls: [] };
  for (const f of floors) {
    const before = out.rooms.length;
    partition(v, f.rect, f.n, f.feet, ids.wall, out);
    f.rooms = out.rooms.slice(before).map((r) => ({ rect: r, feet: f.feet }));
  }

  // Stairs: a 3-row × 4-column zone in a corner of the main block away from the wings and the front door, switchback
  // (even stories climb row A, odd stories row C; row B is always floor).
  const r = interior(main);
  const dx = clamp(o.x + ftPos(plan.main.doorX), main.x0 + 1, main.x1 - 1);
  const rw = r.x1 - r.x0 + 1, rd = r.z1 - r.z0 + 1;
  const corner = ([rx, fz, colsX]) => (row, col) => {
    const a = colsX ? col : row, c = colsX ? row : col;
    return [rx ? r.x1 - a : r.x0 + a, fz ? r.z1 - c : r.z0 + c];
  };
  const zoneOf = (cellAt) => {
    const cs = [cellAt(0, 0), cellAt(2, 3)];
    return { x0: Math.min(cs[0][0], cs[1][0]), x1: Math.max(cs[0][0], cs[1][0]), z0: Math.min(cs[0][1], cs[1][1]), z1: Math.max(cs[0][1], cs[1][1]) };
  };
  const clashes = (zn) => {
    const g = { x0: zn.x0 - 1, x1: zn.x1 + 1, z0: zn.z0 - 1, z1: zn.z1 + 1 };
    // A wing clashes only when every main-side cell along its shared wall is taken (no room left for its doorway).
    const sideCells = (p) => (p.side === 'back' ? range(p.x0 + 1, p.x1 - 1).map((x) => [x, main.z0 + 1])
      : range(p.z0 + 1, p.z1 - 1).map((z) => [p.side === 'right' ? main.x1 - 1 : main.x0 + 1, z]));
    return inRect(g, dx, main.z1 - 1) || parts.slice(1).some((p) => sideCells(p).every(([x, z]) => inRect(zn, x, z)));
  };
  const fits = [rw >= 4 && rd >= 3, rw >= 3 && rd >= 4];
  const options = [[0, 0], [1, 0], [0, 1], [1, 1]].flatMap(([a, b]) => [true, false].filter((_, i) => fits[i]).map((cx) => [a, b, cx]));
  const cell = options.map(corner).find((c) => !clashes(zoneOf(c))) ?? corner(options[0] ?? [0, 0, rw >= 4]);
  if (stories > 1) {
    const zone = zoneOf(cell);
    for (let s = 0; s < stories; s++) fillBox(v, { ...zone, y0: base + H * s + 1, y1: base + H * s + 3 }, 0);
    for (let s = 0; s < stories - 1; s++) {
      const b = base + H * s, even = s % 2 === 0, row = even ? 0 : 2;
      const [ax, az] = cell(1, even ? 0 : 3), [lx, lz] = cell(1, even ? 3 : 0);
      fillBox(v, { x0: ax, x1: ax, z0: az, z1: az, y0: b + 1, y1: b + 3 }, 0);
      fillBox(v, { x0: lx, x1: lx, z0: lz, z1: lz, y0: b + H + 1, y1: b + H + 3 }, 0);
      for (let k = 0; k < 4; k++) {
        const [x, z] = cell(row, even ? k : 3 - k);
        fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: b + 1, y1: b + 1 + k }, ID('planks-dark'));
        fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: b + 2 + k, y1: b + 4 + k }, 0);
      }
    }
  }

  // Doorways: between rooms, between the main block and each wing, and the front door.
  for (const { wall, alongX, feet } of out.walls) {
    const cells = [];
    for (let x = wall.x0; x <= wall.x1; x++) for (let z = wall.z0; z <= wall.z1; z++) cells.push([x, z]);
    doorway(v, cells, alongX ? [1, 0] : [0, 1], feet);
  }
  for (const p of parts.slice(1)) {
    for (let s = 0; s < p.stories; s++) {
      const cells = [];
      if (p.side === 'back') for (let x = p.x0 + 1; x < p.x1; x++) cells.push([x, main.z0]);
      else for (let z = p.z0 + 1; z < p.z1; z++) cells.push([p.side === 'right' ? main.x1 : main.x0, z]);
      doorway(v, cells, p.side === 'back' ? [0, 1] : [1, 0], base + H * s + 1);
    }
  }
  set(v, dx, base + 1, main.z1, ID('door-lower'));
  set(v, dx, base + 2, main.z1, ID('door-upper'));
  fillBox(v, { x0: dx, x1: dx, z0: main.z1 - 1, z1: main.z1 - 1, y0: base + 1, y1: base + 2 }, 0);
  const door = { x: dx, y: base + 1, z: main.z1 + 1 };

  // Windows every 2–3 blocks on outside walls, one row per story, where both sides are open.
  const windows = [];
  const every = rng.int(VH.windowEvery[0], VH.windowEvery[1]);
  const inOther = (p, x, z) => parts.some((q) => q !== p && inRect(q, x, z));
  for (const p of parts) {
    const faces = [
      { cells: (k) => [p.x0 + k, p.z1], n: p.x1 - p.x0, out: [0, 1] }, { cells: (k) => [p.x0 + k, p.z0], n: p.x1 - p.x0, out: [0, -1] },
      { cells: (k) => [p.x0, p.z0 + k], n: p.z1 - p.z0, out: [-1, 0] }, { cells: (k) => [p.x1, p.z0 + k], n: p.z1 - p.z0, out: [1, 0] },
    ];
    for (let s = 0; s < p.stories; s++) {
      const y = base + H * s + 2;
      for (const f of faces) {
        for (let k = 2; k <= f.n - 2; k += every) {
          const [x, z] = f.cells(k), [ox, oz] = f.out;
          if (inOther(p, x, z) || inOther(p, x + ox, z + oz) || get(v, x + ox, y, z + oz) !== 0 || get(v, x - ox, y, z - oz) !== 0) continue;
          if (z === main.z1 && Math.abs(x - dx) <= 1 && s === 0) continue;
          set(v, x, y, z, ID('glass'));
          windows.push(idx(v, x, y, z));
        }
      }
    }
  }

  // Yard: porch, garage/carport, driveway, path, fence, beds, fruit trees, coop.
  const yard = addYard(v, { o, base, main, parts, plan, look, ids, extras, rng, door });
  const glass = ID('glass');
  for (let i = windows.length - 1; i >= 0; i--) if (v.data[windows[i]] !== glass) windows.splice(i, 1);

  // Roofs: the main block first, wings lower; never into another part's box.
  const shape = ROOF_SHAPE[look.roof] ?? 'gable';
  const run = (look.pitch ?? 0.5) < VH.lowPitch ? 2 : 1;
  const all = [...parts, ...yard.parts];
  for (const p of all) {
    const ok = (x, y, z) => get(v, x, y, z) === 0 && !all.some((q) => q !== p && inRect(q, x, z) && y <= q.top);
    p.roofTop = stepRoof(v, p, p.top + 1, { shape: p.roof ?? shape, ridge: look.ridge, run, roofId: ids.roof, trimId: ids.trim, wallId: ids.wall, ok });
  }

  // Rooms with types: living room by the door, then kitchen, bedrooms and bathrooms.
  // A small house still gets a bedroom and a bathroom before a separate kitchen (the living room then has the kitchen).
  const types = ['living', 'bedroom', 'bathroom', 'kitchen'];
  for (let i = 1; i < Math.max(plan.beds, plan.baths); i++) {
    if (i < plan.beds) types.push('bedroom');
    if (i < plan.baths) types.push('bathroom');
  }
  const ground = floors[0].rooms.sort((a, b) => Math.hypot((a.rect.x0 + a.rect.x1) / 2 - dx, a.rect.z1 - main.z1)
    - Math.hypot((b.rect.x0 + b.rect.x1) / 2 - dx, b.rect.z1 - main.z1));
  const ordered = [...ground, ...floors.slice(1).flatMap((f) => f.rooms)];
  const rooms = ordered.map((rm, i) => ({ type: types[i] ?? 'den', box: { ...rm.rect, y0: rm.feet, y1: rm.feet + 2 } }));

  // Exit on the sidewalk in front of the gate, and the walk there.
  const lot = yard.lot;
  const ex = yard.pathX, ez = lot.z1 + 2;
  const ey = [base + 1, base + 2, base].find((y) => canStand(v, ex, y, ez)) ?? base + 1;
  const exit = { x: ex, y: ey, z: ez };
  const bounds = { x0: lot.x0 - 1, x1: lot.x1 + 1, z0: lot.z0 - 1, z1: lot.z1 + 4, y0: base - 2, y1: base + 4 };
  const path = walkPath(v, door, exit, { bounds }) ?? [door, exit];
  const blocks = (p) => (p.x1 - p.x0 + 1) * (p.z1 - p.z0 + 1);
  const loft = look.roof === 'aframe' ? 1.5 : 1; // the A-frame's loft under the roof counts as half a story (housePlan)
  const floorBlocks = parts.reduce((t, p) => t + blocks(p) * (p === main ? p.stories * loft : p.stories), 0);
  return {
    door, exit, path, rooms, windows, plantSpots: yard.plantSpots, animalSpots: yard.animalSpots,
    lotBox: { x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1, y0: base - WORLD.digDepth, y1: base + WORLD.buildHeight },
    parts: all.map(({ kind, side, x0, x1, z0, z1, stories: st, top, roofTop }) => ({ kind, side, x0, x1, z0, z1, stories: st, top, roofTop })),
    info: { stories, rooms: rooms.length, wanted: want, floorBlocks, sqft: Math.round(floorBlocks * WORLD.ftPerBlock ** 2),
      roof: shape, palette: plan.palette, ids },
  };
}
