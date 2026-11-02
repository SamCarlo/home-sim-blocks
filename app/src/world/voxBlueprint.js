// A student's blueprint build in blocks (13 §5, homeblocks 11). Pure: no DOM, no three.
// Turns `home.blueprint` (lot feet, origin at the lot's front-left corner, y toward the back) into blocks: a slab and a
// hollow 3-high room per blueprint room (walls on the shared lines are the same cells, so they are drawn once), door
// blocks and glass at the openings, a lānai as a deck with posts and a flat roof, a roof per room in the blueprint's
// style and colors, the yard items, the catchment tank and ground-mounted solar. Same result shape as voxHouse.
// Room edges are mapped through one grid per axis (`blueprintGrid`) that keeps the drawn layout but stretches any room
// narrower than VOX_BLUEPRINT.minSpan, so every room is at least 3 × 3 inside (13 §3).
import { BLOCK, BLOCKS } from './blocks.js';
import { get, set, fillBox, idx } from './volume.js';
import { canStand, walkPath } from './walk.js';
import { placeTree } from './trees.js';
import { paletteBlocks, stepRoof } from './voxHouse.js';
import { editWindow } from '../phases/design/blueprint/model.js';
import { createRng, seedFor } from '../util/rng.js';
import { WORLD, VOX_BLUEPRINT as VB } from '../config.js';

const ID = (k) => BLOCK[k].id;
const F = WORLD.ftPerBlock;
const EPS = 1e-6;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const open = (r) => r.type === 'lanai';

/**
 * One axis of the grid: sorted room edges (ft) → block offsets; `spans` [[aFt, bFt, minBlocks]] keep each room ≥ minSpan
 * and each shared wall with a door long enough for one door cell. `at(ft)` interpolates between edges.
 */
function axis(rooms, lo, len, spans) {
  const edges = [...new Set(rooms.flatMap((r) => [r[lo], r[lo] + r[len]]))].sort((a, b) => a - b);
  const near = (e) => edges.findIndex((f) => Math.abs(f - e) < EPS);
  const pos = [];
  edges.forEach((e, i) => {
    let p = Math.round(e / F);
    if (i) p = Math.max(p, pos[i - 1] + 1);
    for (const [a, b, n] of spans) if (Math.abs(b - e) < EPS && near(a) >= 0 && near(a) < i) p = Math.max(p, pos[near(a)] + n);
    pos.push(p);
  });
  const at = (ft) => {
    if (!edges.length) return Math.round(ft / F);
    if (ft <= edges[0]) return pos[0] + Math.round((ft - edges[0]) / F);
    const n = edges.length - 1;
    if (ft >= edges[n]) return pos[n] + Math.round((ft - edges[n]) / F);
    const i = edges.findIndex((e) => e >= ft - EPS);
    if (Math.abs(edges[i] - ft) < EPS) return pos[i];
    const t = (ft - edges[i - 1]) / (edges[i] - edges[i - 1]);
    return Math.round(pos[i - 1] + t * (pos[i] - pos[i - 1]));
  };
  return at;
}

/** Lot feet → block coords: `{X(xFt), Z(yFt)}` with the editing window's center at o.x and its front edge on the lot front. */
export function blueprintGrid(bp, o) {
  const span = (k) => bp.rooms.map((r) => [r[k], r[k] + r[k === 'x' ? 'w' : 'h'], VB.minSpan]);
  const byId = Object.fromEntries(bp.rooms.map((r) => [r.id, r]));
  const doorX = [], doorY = [];
  for (const op of bp.openings) {
    const a = byId[op.roomA], b = byId[op.roomB];
    if (op.kind !== 'door' || !a || !b) continue;
    if (Math.abs(op.x1 - op.x2) < EPS) doorY.push([Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h), VB.doorSpan]);
    else doorX.push([Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w), VB.doorSpan]);
  }
  const ax = axis(bp.rooms, 'x', 'w', [...span('x'), ...doorX]), ay = axis(bp.rooms, 'y', 'h', [...span('y'), ...doorY]);
  const win = editWindow(bp.lot);
  const cx = ax((win.x0 + win.x1) / 2), front = o.z + WORLD.lotHalf;
  return { X: (x) => o.x + ax(x) - cx, Z: (y) => front - (ay(y) - ay(win.y0)) };
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
/**
 * Closest tinted block of a role to a student's color. RGB distance plus double weight on the blue-minus-red tilt, so a
 * cool grey metal roof doesn't land on a warm brown that happens to be as near in plain RGB.
 */
export function nearestTint(role, color) {
  const [r, g, b] = rgb(color);
  let best = null, bd = Infinity;
  for (const blk of BLOCKS) {
    if (!blk.key.startsWith(`${role}-`) || !blk.tint) continue;
    const [r2, g2, b2] = rgb(blk.tint);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2 + 2 * ((b - r) - (b2 - r2)) ** 2;
    if (d < bd) { bd = d; best = blk.id; }
  }
  return best;
}

/** Block ids for the blueprint's own siding, wall, roof and trim colors (fallback: the style family's palette). */
function blueprintBlocks(bp, styleKey, variant, palette) {
  const base = paletteBlocks(styleKey, variant, palette ?? 0);
  const wall = bp.exterior?.siding === 'brick' ? ID('brick') : bp.exterior?.siding === 'log' ? ID('trunk')
    : (bp.exterior?.color && nearestTint('plaster', bp.exterior.color)) || base.wall;
  const wood = ['board', 'board-and-batten', 'log'].includes(bp.exterior?.siding);
  return { ...base, wall, roof: (bp.roof?.color && nearestTint('roof', bp.roof.color)) || base.roof,
    trim: (bp.exterior?.trim && nearestTint('trim', bp.exterior.trim)) || base.trim, floor: wood ? ID('planks-light') : base.floor };
}

/**
 * Build the blueprint into `v` (terrain + neighborhood already there, lot flat at origin.y). Options: `bp` (a blueprint),
 * `styleKey`/`variant`/`palette` (fallback colors), `origin` {x, y, z} (lot center at ground top; default volume center,
 * groundY), `seed`. Returns `{door, exit, path, rooms [{type, box}], windows [index], plantSpots, animalSpots, lotBox,
 * parts, info}` like voxHouse; `info.doors` lists every placed opening `{id, kind, x, y, z}`.
 */
export function voxBlueprint(v, { bp, styleKey, variant = null, palette = 0, origin = null, seed = 0 }) {
  const o = origin ?? { x: v.size.x >> 1, y: WORLD.groundY, z: v.size.z >> 1 };
  const base = o.y, top = base + 4, L = WORLD.lotHalf;
  const lot = { x0: o.x - L, x1: o.x + L, z0: o.z - L, z1: o.z + L };
  const ids = blueprintBlocks(bp, styleKey, variant, palette);
  const rng = createRng(seedFor('vox-blueprint', styleKey ?? '', seed));
  const { X, Z } = blueprintGrid(bp, o);
  const rects = bp.rooms.map((r) => ({ room: r, x0: X(r.x), x1: X(r.x + r.w), z0: Z(r.y + r.h), z1: Z(r.y) }));
  const byId = Object.fromEntries(rects.map((q) => [q.room.id, q]));
  const inRect = (q, x, z) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1;
  const inside = (q, x, z) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1;
  const anyRoom = (x, z) => rects.some((q) => inRect(q, x, z));
  const closed = rects.filter((q) => !open(q.room));

  // Slabs, walls (3 high) and a ceiling per room; trim on the outside corners and along the eaves.
  for (const q of rects) {
    fillBox(v, { ...q, y0: base + 1, y1: top }, 0);
    fillBox(v, { ...q, y0: base, y1: base }, open(q.room) ? ID('planks-light') : q.room.type === 'garage' ? ID('concrete') : ids.floor);
  }
  for (const q of closed) {
    fillBox(v, { ...q, y0: base + 1, y1: base + 3 }, ids.wall);
    fillBox(v, { x0: q.x0 + 1, x1: q.x1 - 1, z0: q.z0 + 1, z1: q.z1 - 1, y0: base + 1, y1: base + 3 }, 0);
    fillBox(v, { ...q, y0: top, y1: top }, ids.floor);
  }
  const edge = (x, z) => !rects.some((q) => inside(q, x, z)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !anyRoom(x + dx, z + dz));
  for (const q of closed) {
    for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) if ((x === q.x0 || x === q.x1 || z === q.z0 || z === q.z1) && edge(x, z)) set(v, x, top, z, ids.trim);
    for (const [x, z] of [[q.x0, q.z0], [q.x1, q.z0], [q.x0, q.z1], [q.x1, q.z1]]) {
      if (closed.filter((p) => inRect(p, x, z)).length === 1 && !rects.some((p) => p !== q && inRect(p, x, z))) fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: base + 1, y1: base + 3 }, ids.trim);
    }
  }
  // Lānai: posts on the open corners and a flat roof slab.
  for (const q of rects.filter((p) => open(p.room))) {
    for (const [x, z] of [[q.x0, q.z0], [q.x1, q.z0], [q.x0, q.z1], [q.x1, q.z1]]) if (get(v, x, base + 1, z) === 0) fillBox(v, { x0: x, x1: x, z0: z, z1: z, y0: base + 1, y1: base + 3 }, ids.trim);
    for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) if (get(v, x, top, z) === 0) set(v, x, top, z, ids.roof);
  }
  // Garages: the outside front wall opens 3 high.
  for (const q of closed.filter((p) => p.room.type === 'garage')) {
    for (let x = q.x0 + 1; x < q.x1; x++) if (!anyRoom(x, q.z1 + 1)) fillBox(v, { x0: x, x1: x, z0: q.z1, z1: q.z1, y0: base + 1, y1: base + 3 }, 0);
  }

  // Openings: the wall cell nearest the drawn center whose sides are the right rooms / outside.
  const windows = [], doors = [], entries = [];
  const air = (x, y, z) => get(v, x, y, z) === 0;
  for (const op of bp.openings) {
    const a = byId[op.roomA], b = op.roomB ? byId[op.roomB] : null;
    if (!a) continue;
    const vert = Math.abs(op.x1 - op.x2) < EPS;
    const side = vert ? (Math.abs(op.x1 - a.room.x) < EPS ? 'left' : 'right') : (Math.abs(op.y1 - a.room.y) < EPS ? 'front' : 'back');
    const [nx, nz] = { left: [-1, 0], right: [1, 0], front: [0, 1], back: [0, -1] }[side];
    const line = vert ? (side === 'left' ? a.x0 : a.x1) : (side === 'front' ? a.z1 : a.z0);
    const t = vert ? Z((op.y1 + op.y2) / 2) : X((op.x1 + op.x2) / 2);
    let lo = vert ? a.z0 : a.x0, hi = vert ? a.z1 : a.x1;
    if (b) { lo = Math.max(lo, vert ? b.z0 : b.x0); hi = Math.min(hi, vert ? b.z1 : b.x1); }
    const cells = [];
    for (let k = lo + 1; k < hi; k++) cells.push(k);
    cells.sort((p, q) => Math.abs(p - t) - Math.abs(q - t));
    const at = (k) => (vert ? [line, k] : [k, line]);
    const ok = (x, z) => {
      const inn = inside(a, x - nx, z - nz);
      const out = b ? inside(b, x + nx, z + nz) : !anyRoom(x + nx, z + nz);
      return inn && out;
    };
    if (open(a.room) && (!b || open(b.room))) { // an open lānai edge: no wall, but an outside one is still a way in
      if (!b && op.kind === 'door') { const k = cells[0] ?? t; const [x, z] = at(k); entries.push({ side, x: x + nx, z: z + nz }); doors.push({ id: op.id, kind: 'opening', x, y: base + 1, z }); }
      continue;
    }
    if (op.kind === 'door') {
      const k = cells.find((c) => { const [x, z] = at(c); return ok(x, z) && get(v, x, base + 1, z) !== ID('door-lower'); });
      if (k == null) continue;
      const [x, z] = at(k);
      set(v, x, base + 1, z, ID('door-lower')); set(v, x, base + 2, z, ID('door-upper'));
      doors.push({ id: op.id, kind: 'door', x, y: base + 1, z });
      if (!b) entries.push({ side, x: x + nx, z: z + nz });
      else if (open(b.room)) entries.push({ side, x: x + nx, z: z + nz, via: b });
    } else {
      const n = Math.max(1, Math.round((op.widthFt ?? 4) / F));
      const k = cells.find((c) => { const [x, z] = at(c); return ok(x, z) && get(v, x, base + 2, z) === ids.wall && air(x + nx, base + 2, z + nz); });
      if (k == null) continue;
      for (let j = 0; j < n; j++) {
        const [x, z] = at(k + j - (n >> 1));
        if (!ok(x, z) || get(v, x, base + 2, z) !== ids.wall) continue;
        set(v, x, base + 2, z, ID('glass'));
        windows.push(idx(v, x, base + 2, z));
      }
    }
  }

  // Roofs: one per closed room at the shared eave height, biggest first (later ones skip cells already roofed).
  const shape = VB.roofShape[bp.roof?.style] ?? 'gable';
  const parts = [];
  const areaOf = (q) => (q.x1 - q.x0 + 1) * (q.z1 - q.z0 + 1);
  for (const q of [...closed].sort((p, r) => areaOf(r) - areaOf(p))) {
    const ridge = q.x1 - q.x0 >= q.z1 - q.z0 ? 'x' : 'z';
    const roofTop = stepRoof(v, q, top + 1, { shape, ridge, run: 1, roofId: ids.roof, trimId: ids.trim, wallId: ids.wall, ok: (x, y, z) => air(x, y, z) });
    parts.push({ kind: 'room', type: q.room.type, x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, stories: 1, top, roofTop });
  }
  for (const q of rects.filter((p) => open(p.room))) parts.push({ kind: 'lanai', type: 'lanai', x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, stories: 1, top, roofTop: top });

  // The front door: the outside cell of the front-most way in (a front-facing one first).
  const fp = rects.length ? { x0: Math.min(...rects.map((q) => q.x0)), x1: Math.max(...rects.map((q) => q.x1)), z0: Math.min(...rects.map((q) => q.z0)), z1: Math.max(...rects.map((q) => q.z1)) }
    : { x0: o.x - 3, x1: o.x + 3, z0: o.z - 3, z1: o.z + 3 };
  entries.sort((p, q) => (q.side === 'front') - (p.side === 'front') || q.z - p.z);
  const entry = entries.find((e) => !e.via) ?? entries[0];
  const door = entry ? { x: entry.x, y: base + 1, z: entry.z } : { x: (fp.x0 + fp.x1) >> 1, y: base + 1, z: fp.z1 + 1 };
  const pathX = door.x;

  // Yard items in the same grid, shifted into the lot.
  const box = (it) => {
    const x0 = X(it.x), z1 = Z(it.y);
    const w = Math.max(1, X(it.x + it.w) - x0), d = Math.max(1, z1 - Z(it.y + it.h));
    const bx = clamp(x0, lot.x0 + 1, lot.x1 - w), bz = clamp(z1, lot.z0 + d, lot.z1 - 1);
    return { x0: bx, x1: bx + w - 1, z0: bz - d + 1, z1: bz };
  };
  const pave = (r, id, keep = []) => {
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
      if (anyRoom(x, z) || get(v, x, base + 1, z) !== 0 || keep.includes(get(v, x, base, z))) continue;
      set(v, x, base, z, id);
    }
  };
  const plantSpots = [], animalSpots = [];
  const kinds = (k) => bp.yard.filter((it) => it.kind === k);
  const drives = kinds('driveway').map((it) => ({ ...box(it) }));
  for (const d of drives) pave({ ...d, z1: lot.z1 }, ID('concrete'));
  for (const it of kinds('patio')) pave(box(it), ID('slab'));
  pave({ x0: pathX, x1: pathX, z0: door.z, z1: lot.z1 }, ID('gravel'), [ID('planks-light'), ID('concrete'), ID('slab')]);
  for (const it of kinds('garden-bed')) {
    const r = box(it);
    pave(r, ID('dirt'));
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) if (get(v, x, base, z) === ID('dirt') && air(x, base + 1, z)) set(v, x, base + 1, z, ID('crops'));
    plantSpots.push({ x: (r.x0 + r.x1) >> 1, y: base + 1, z: r.z1 + 1 });
  }
  plantSpots.push({ x: door.x + 1, y: base + 1, z: door.z });
  for (const it of kinds('rain-garden')) {
    const r = box(it);
    pave(r, ID('dirt'));
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
      if (get(v, x, base, z) !== ID('dirt')) continue;
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) set(v, x, base, z, ID('water'));
      else if (air(x, base + 1, z) && (x + z) % 2 === 0) set(v, x, base + 1, z, ID('flowers'));
    }
  }
  for (const it of kinds('fruit-tree')) { const r = box(it); placeTree(v, 'fruit', (r.x0 + r.x1) >> 1, base + 1, (r.z0 + r.z1) >> 1, rng); }
  for (const it of kinds('coop')) {
    const r = box(it), x = (r.x0 + r.x1) >> 1, z = (r.z0 + r.z1) >> 1;
    fillBox(v, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z, y0: base + 1, y1: base + 2 }, ID('coop'));
    animalSpots.push({ x, y: base + 1, z: z + 1 });
  }
  animalSpots.push({ x: door.x - 1, y: base + 1, z: door.z + 1 });
  for (const it of kinds('fence')) {
    const r = box(it);
    const f = { x0: Math.max(lot.x0, r.x0), x1: Math.min(lot.x1, r.x1), z0: Math.max(lot.z0, r.z0), z1: Math.min(lot.z1, r.z1) };
    const gate = (x, z) => z === f.z1 && (Math.abs(x - pathX) <= 1 || drives.some((d) => x >= d.x0 - 1 && x <= d.x1 + 1));
    const post = (x, z) => { if (!gate(x, z) && !anyRoom(x, z) && air(x, base + 1, z)) set(v, x, base + 1, z, ID('fence')); };
    for (let x = f.x0; x <= f.x1; x++) { post(x, f.z0); post(x, f.z1); }
    for (let z = f.z0 + 1; z < f.z1; z++) { post(f.x0, z); post(f.x1, z); }
  }

  // Catchment tank on the left of the house, solar panels on the ground behind it.
  const mid = (fp.z0 + fp.z1) >> 1;
  if (bp.catchmentGallons > 0) {
    const rad = bp.catchmentGallons >= VB.tankBigGallons ? 2 : 1;
    const cx = Math.max(lot.x0 + rad + 1, fp.x0 - rad - 2);
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      if (rad > 1 && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
      if (!anyRoom(cx + dx, mid + dz)) fillBox(v, { x0: cx + dx, x1: cx + dx, z0: mid + dz, z1: mid + dz, y0: base + 1, y1: base + 3 }, ID('catchment-tank'));
    }
  }
  if (bp.solarKw > 0) {
    const n = Math.round(bp.solarKw * VB.solarPerKw), cols = Math.min(n, 8);
    const x0 = ((fp.x0 + fp.x1) >> 1) - (cols >> 1), z0 = Math.max(lot.z0 + 1, fp.z0 - 4);
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % cols), z = z0 - Math.floor(i / cols) * 2;
      if (!anyRoom(x, z) && air(x, base + 1, z)) set(v, x, base + 1, z, ID('solar-panel'));
    }
  }
  const glass = ID('glass');
  for (let i = windows.length - 1; i >= 0; i--) if (v.data[windows[i]] !== glass) windows.splice(i, 1);

  // Rooms keep the blueprint's order and types; boxes are the interiors at feet..feet+2.
  const rooms = rects.map((q) => ({ type: q.room.type, id: q.room.id, box: { x0: q.x0 + 1, x1: q.x1 - 1, z0: q.z0 + 1, z1: q.z1 - 1, y0: base + 1, y1: base + 3 } }));
  const ez = lot.z1 + 2;
  const ey = [base + 1, base + 2, base].find((y) => canStand(v, pathX, y, ez)) ?? base + 1;
  const exit = { x: pathX, y: ey, z: ez };
  const bounds = { x0: lot.x0 - 1, x1: lot.x1 + 1, z0: Math.min(lot.z0, fp.z0) - 1, z1: lot.z1 + 4, y0: base - 2, y1: base + 4 };
  const path = walkPath(v, door, exit, { bounds }) ?? [door, exit];
  const floorBlocks = rects.reduce((t, q) => t + (q.x1 - q.x0 - 1) * (q.z1 - q.z0 - 1), 0);
  return {
    door, exit, path, rooms, windows, plantSpots, animalSpots,
    lotBox: { x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1, y0: base - WORLD.digDepth, y1: base + WORLD.buildHeight },
    parts,
    info: { stories: 1, rooms: rooms.length, wanted: bp.rooms.length, floorBlocks, sqft: Math.round(floorBlocks * F ** 2),
      roof: shape, palette, ids, doors, footprint: fp },
  };
}
