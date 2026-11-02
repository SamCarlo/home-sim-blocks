// The student's apartment or condo building in blocks (13 §5, homeblocks 10). Pure: no DOM, no three.
// Turns a `planBuilding` plan into a walk-up, low-rise, tower, glass tower or townhome row on the lot. The building is a
// solid block with glass in its faces (cheap to mesh); only the student's unit is hollow, plus the stair core up to
// that floor and that floor's corridor, so the street entrance → core → corridor → unit door is a real walk.
// Layout (x across the front, z toward the street, 1 block = 1 m, floor-to-floor VOX_BUILDING.storyH):
//   two rows:  back wall · row 1 units · wall · corridor (2) · wall · row 0 units · front wall, stair core on the left.
//   one row:   back wall · units · wall · corridor (2) · front wall; stair core on the left, or a stair tower in front
//              when the row is too wide for the lot to also hold a side core.
//   townhomes: one row of whole houses with their own front doors; the student's has inside stairs.
import { BLOCK } from './blocks.js';
import { get, set, fillBox, idx, ftToBlocks } from './volume.js';
import { canStand, walkPath } from './walk.js';
import { paletteBlocks, partition, doorway } from './voxHouse.js';
import { facade, groundUse, balcony, switchback, roofTop, glassIn, slabY } from './voxBuildingParts.js';
import { worldSizeFor } from './genNeighborhood.js';
import { unitCell, homeFloors } from '../phases/design/buildingPlan.js';
import { styleFamily } from '../data/styleFamilies.js';
import { createRng, seedFor } from '../util/rng.js';
import { WORLD, VOX_BUILDING as VB } from '../config.js';

const ID = (k) => BLOCK[k].id;
const H = VB.storyH;
const air = (v, x0, x1, z0, z1, y0, y1) => fillBox(v, { x0, x1, z0, z1, y0, y1 }, 0);

/** Height in blocks from the ground to the top of the building's roof features. */
export function buildingBlocksHigh(plan) {
  return H * plan.floors + VB.roofRoom;
}

/** Volume size for a building home: the neighborhood's size, raised to WORLD.tallY (or more) when the building needs it. */
export function buildingWorldSize(location, kind, plan) {
  const s = worldSizeFor(location, kind);
  const need = WORLD.groundY + buildingBlocksHigh(plan) + 2;
  return need > s.y ? { ...s, y: Math.max(WORLD.tallY, need) } : s;
}

/** Block ids for a plan: wall (brick / style plaster / concrete), trim, roof, floor, band. */
function buildingIds(plan) {
  const own = paletteBlocks(plan.style, plan.variant, plan.palette);
  const concrete = plan.form === 'tower' || plan.form === 'glass';
  return { ...own, wall: concrete ? ID('concrete') : plan.wallTex === 'brick' ? ID('brick') : own.wall,
    band: plan.form === 'glass' ? ID('metal') : plan.form === 'tower' ? ID('stone-brick') : own.trim };
}

/** Block layout of the plan: unit width/depth, core kind, the building box and each unit's interior. */
export function buildingLayout(plan, o) {
  const cols = plan.cols, rows = plan.rows, town = plan.form === 'townhomes';
  const nat = Math.max(VB.minUnitW, ftToBlocks(plan.unitW) + 1);
  const fitSide = Math.floor((VB.maxW - 1 - 4) / cols);
  const core = town ? null : fitSide >= VB.sideCoreMinW ? 'side' : 'front';
  const uw = Math.max(VB.minUnitW, Math.min(nat, core === 'side' ? fitSide : Math.floor((VB.maxW - 1) / cols)));
  const Dn = ftToBlocks(plan.depth);
  const ud = town ? Math.max(8, Dn - 2) : rows === 2 ? Math.max(VB.minUnitD, Math.floor((Dn - 6) / 2)) : Math.max(VB.minUnitD, Dn - 5);
  const depth = town ? ud + 2 : rows === 2 ? 2 * ud + 6 : ud + 5;
  const W = (core === 'side' ? 4 : 0) + cols * uw + 1;
  const front = o.z + WORLD.lotHalf - VB.setback;
  const z1 = core === 'front' ? front - 6 : town ? front - 2 : front;
  const box = { x0: o.x - (W >> 1), z1, z0: z1 - depth + 1 };
  box.x1 = box.x0 + W - 1;
  const ux0 = box.x0 + (core === 'side' ? 4 : 0);
  // Corridor (interior z range) and each row's interior z range.
  const corridor = town ? null : rows === 2 ? { z0: box.z0 + ud + 2, z1: box.z0 + ud + 3 } : { z0: box.z0 + ud + 2, z1: box.z0 + ud + 3 };
  const rowZ = (r) => (town || rows === 1 || r === 1 ? { z0: box.z0 + 1, z1: box.z0 + ud } : { z0: box.z0 + ud + 5, z1: box.z1 - 1 });
  const unitRect = (u) => {
    const c = unitCell(plan, u) ?? { col: 0, row: 0 };
    return { col: c.col, row: c.row, x0: ux0 + c.col * uw + 1, x1: ux0 + (c.col + 1) * uw - 1, ...rowZ(c.row) };
  };
  // Stair core interior (3 wide) and its zone cell(row, col) → [x, z].
  let coreBox = null, cell = null;
  if (core === 'side') {
    coreBox = { x0: box.x0 + 1, x1: box.x0 + 3, z0: box.z0 + 1, z1: box.z1 - 1 };
    cell = (r, c) => [coreBox.x0 + r, box.z0 + 1 + c];
  } else if (core === 'front') {
    const cx0 = o.x - 1;
    coreBox = { x0: cx0, x1: cx0 + 2, z0: box.z1 + 1, z1: box.z1 + 5 };
    cell = (r, c) => [cx0 + r, box.z1 + 1 + c];
  }
  return { cols, rows, uw, ud, core, box, ux0, corridor, unitRect, coreBox, cell, town };
}

/**
 * Build the building into `v` (terrain + neighborhood already there; lot flat at origin.y). Options: `plan`
 * (planBuilding), `floor` (1-based, a home floor; townhomes 1), `unit` (0-based, row 0 = street), `styleKey`
 * (default plan.style), `origin` {x, y, z} (lot center at ground top), `seed`. Throws when the volume is too short
 * (make it with `buildingWorldSize`). Returns `{door, exit, path, unit (interior box), unitRooms [{type, box}],
 * windows [index], plantSpots, animalSpots, lotBox, entrance, info}`.
 */
export function voxBuilding(v, { plan, floor = null, unit = 0, styleKey = plan.style, origin = null, seed = 0 }) {
  const o = origin ?? { x: v.size.x >> 1, y: WORLD.groundY, z: v.size.z >> 1 };
  const base = o.y;
  if (base + buildingBlocksHigh(plan) >= v.size.y) {
    throw new Error(`voxBuilding: ${plan.floors} floors need ${base + buildingBlocksHigh(plan) + 1} blocks of height, the volume has ${v.size.y} (use buildingWorldSize)`);
  }
  const rng = createRng(seedFor('vox-building', styleKey, plan.variant ?? '', plan.kind, plan.form, plan.seed, seed));
  const ids = buildingIds({ ...plan, style: styleKey });
  const floors = homeFloors(plan);
  const fu = plan.form === 'townhomes' ? 1 : floors.includes(floor) ? floor : floors[floors.length - 1 >> 1] ?? 1;
  const u = Number.isInteger(unit) && unit >= 0 && unit < plan.unitsPerFloor ? unit : 0;
  const L = buildingLayout(plan, o);
  const { box } = L;
  const top = slabY(base, plan.floors + 1);
  const lot = { x0: o.x - WORLD.lotHalf, x1: o.x + WORLD.lotHalf, z0: o.z - WORLD.lotHalf, z1: o.z + WORLD.lotHalf };

  // Solid body (+ the front stair tower), facade, ground use.
  fillBox(v, { ...box, y0: base, y1: top }, ids.wall);
  const tower = L.core === 'front' ? { x0: L.coreBox.x0 - 1, x1: L.coreBox.x1 + 1, z0: box.z1, z1: L.coreBox.z1 + 1 } : null;
  if (tower) fillBox(v, { ...tower, y0: base, y1: top }, ID('concrete'));
  const glassy = plan.form === 'glass' || plan.form === 'tower';
  const inTower = (x, z) => tower && x >= tower.x0 && x <= tower.x1 && z >= tower.z0 && z <= tower.z1 + 1;
  const parkingY = (y) => plan.podium && y < slabY(base, plan.podium + 1);
  facade(v, box, base, plan.floors, { every: glassy ? 1 : 2, rows: plan.form === 'glass' ? [1, 2, 3] : [2, 3],
    band: ids.band, rng, skip: (x, y, z) => inTower(x, z) || parkingY(y) || (plan.groundUse !== 'homes' && y < base + H && z === box.z1) });
  if (tower) facade(v, tower, base, plan.floors, { every: 2, rows: [2], band: 0, rng, lit: 0 });
  groundUse(v, box, base, plan, { skipX: (x) => tower && x >= tower.x0 && x <= tower.x1 });

  // Balconies on every home unit's outer face (row 0 on the street side when there are two rows).
  const balconies = new Map();
  if (plan.features.balconies && !L.town) {
    for (const f of floors) for (let k = 0; k < plan.unitsPerFloor; k++) {
      const r = L.unitRect(k), front = plan.rows === 2 && r.row === 0;
      const cx = (r.x0 + r.x1) >> 1;
      if (front && tower && cx >= tower.x0 - 2 && cx <= tower.x1 + 2) continue;
      const spots = balcony(v, cx, front ? box.z1 : box.z0, slabY(base, f), front ? 1 : -1);
      if (f === fu && k === u) balconies.set('mine', { spots, x: cx, z: front ? box.z1 : box.z0, out: front ? 1 : -1 });
    }
  }

  // Roof and roof features.
  const look = styleFamily(styleKey, plan.variant).look;
  const pitched = { gable: 'gable', hip: 'hip', tile: 'hip' };
  const shape = plan.form === 'townhomes' ? (pitched[look.roof] ?? 'flat') : (pitched[plan.features.rooftop] ?? 'flat');
  const roofCore = L.core === 'side' ? { x0: L.coreBox.x0, x1: L.coreBox.x1, z0: box.z0 + 1, z1: box.z0 + 5 } : null;
  const tank = plan.features.rooftop === 'water-tank' || (plan.form === 'walkup' && ['big-city', 'mid-city'].includes(plan.settlement));
  const high = roofTop(v, box, top, { shape, ids, rng, tank, crown: plan.features.crown, core: roofCore, plan });
  if (tower) roofTop(v, tower, top, { shape: 'flat', ids: { ...ids, trim: ID('concrete') }, rng, tank: false, crown: null, core: null, plan });

  const out = L.town ? townhome(v, { L, plan, base, top, u, ids, rng }) : apartment(v, { L, plan, base, fu, u, ids, balconies, tower });

  // A concrete walk from the sidewalk to the entrance, then the path door → exit.
  const ent = out.entrance;
  for (let z = ent.z; z <= lot.z1; z++) set(v, ent.x, base, z, ID('concrete'));
  const ex = ent.x, ez = lot.z1 + 2;
  const ey = [base + 1, base + 2, base].find((y) => canStand(v, ex, y, ez)) ?? base + 1;
  const exit = { x: ex, y: ey, z: ez };
  const bounds = { x0: lot.x0 - 1, x1: lot.x1 + 1, z0: lot.z0 - 1, z1: lot.z1 + 4, y0: base - 2, y1: high + 2 };
  const path = walkPath(v, out.door, exit, { bounds }) ?? [out.door, exit];
  return {
    door: out.door, exit, path, unit: out.unit, unitRooms: out.rooms, windows: out.windows, plantSpots: out.plantSpots,
    animalSpots: out.animalSpots, entrance: ent,
    lotBox: { ...lot, y0: base - WORLD.digDepth, y1: base + WORLD.buildHeight },
    info: { form: plan.form, floors: plan.floors, floor: fu, unit: u, cols: L.cols, rows: L.rows, unitW: L.uw, unitD: L.ud,
      core: L.core, box: { ...box, y0: base, y1: top }, top: high, ids },
  };
}

/** Rooms inside rect at feet: partition, doorways, then types (living nearest `near`). */
function roomsIn(v, rect, n, feet, near, types) {
  const part = { rooms: [], walls: [] };
  partition(v, rect, n, feet, ID('plaster'), part);
  for (const { wall, alongX } of part.walls) {
    const cells = [];
    for (let x = wall.x0; x <= wall.x1; x++) for (let z = wall.z0; z <= wall.z1; z++) cells.push([x, z]);
    doorway(v, cells, alongX ? [1, 0] : [0, 1], feet);
  }
  const d = (r) => Math.hypot((r.x0 + r.x1) / 2 - near.x, (r.z0 + r.z1) / 2 - near.z);
  return part.rooms.sort((a, b) => d(a) - d(b)).map((r, i) => ({ type: types[i] ?? 'den', box: { ...r, y0: feet, y1: feet + 2 } }));
}

const roomCount = (r) => {
  const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
  return Math.min(4, Math.max(1, Math.floor((w + 1) / 4) * Math.floor((d + 1) / 4)));
};

/** Stair core + corridor + the hollow unit for walk-ups, low-rises, towers and glass towers. */
function apartment(v, { L, plan, base, fu, u, ids, balconies, tower }) {
  const { box, coreBox, cell } = L;
  // Stair core: hollow from the ground floor up to the student's floor, switchback stairs between.
  for (let f = 1; f <= fu; f++) {
    const s = slabY(base, f);
    air(v, coreBox.x0, coreBox.x1, coreBox.z0, coreBox.z1, s + 1, s + 3);
  }
  switchback(v, cell, base, fu - 1, ID('stone-brick'));
  // Street entrance into the core (row B), a lit glass door frame.
  const [bx] = cell(1, 0);
  const ez = L.core === 'side' ? box.z1 : tower.z1;
  set(v, bx, base + 1, ez, ID('door-lower')); set(v, bx, base + 2, ez, ID('door-upper'));
  const entrance = { x: bx, y: base + 1, z: ez + 1 };
  // The corridor on the student's floor and its doorway to the core.
  const s = slabY(base, fu), feet = s + 1;
  air(v, L.ux0 + 1, box.x1 - 1, L.corridor.z0, L.corridor.z1, feet, feet + 2);
  if (L.core === 'side') air(v, box.x0 + 4, box.x0 + 4, L.corridor.z0, L.corridor.z1, feet, feet + 1);
  else air(v, bx, bx, box.z1, box.z1, feet, feet + 1);
  for (let x = L.ux0 + 1; x < box.x1; x += 6) set(v, x, feet + 2, L.corridor.z0, ID('lamp'));
  // The unit: hollow, floored, with its door to the corridor.
  const r = L.unitRect(u);
  air(v, r.x0, r.x1, r.z0, r.z1, feet, feet + 2);
  fillBox(v, { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: s, y1: s }, ids.floor);
  const dx = (r.x0 + r.x1) >> 1;
  const wallZ = r.z0 > L.corridor.z1 ? r.z0 - 1 : r.z1 + 1;
  const into = wallZ === r.z0 - 1 ? -1 : 1; // corridor side of the door
  set(v, dx, feet, wallZ, ID('door-lower')); set(v, dx, feet + 1, wallZ, ID('door-upper'));
  const door = { x: dx, y: feet, z: wallZ + into };
  // Windows: the glass in the unit's outer faces.
  const faceCells = [];
  const outerZ = r.z1 + 1 === box.z1 ? box.z1 : r.z0 - 1 === box.z0 ? box.z0 : null;
  for (let y = feet; y <= feet + 2; y++) {
    if (outerZ != null) for (let x = r.x0; x <= r.x1; x++) faceCells.push([x, y, outerZ]);
    if (r.x0 - 1 === box.x0) for (let z = r.z0; z <= r.z1; z++) faceCells.push([box.x0, y, z]);
    if (r.x1 + 1 === box.x1) for (let z = r.z0; z <= r.z1; z++) faceCells.push([box.x1, y, z]);
  }
  // Balcony (or lānai on the ground floor): a 2-high opening in the outer wall.
  const mine = balconies.get('mine');
  let plantSpots;
  if (mine) {
    air(v, mine.x, mine.x, mine.z, mine.z, feet, feet + 1);
    plantSpots = mine.spots.filter((c) => c.x !== mine.x);
  }
  const windows = glassIn(v, faceCells);
  const rooms = roomsIn(v, { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }, roomCount(r), feet, { x: dx, z: wallZ },
    ['living', 'bedroom', 'bathroom', 'kitchen']);
  air(v, dx, dx, wallZ - into, wallZ - into, feet, feet + 1); // the entry cell stays open even when a partition lines up
  if (!plantSpots) {
    plantSpots = windows.slice(0, 3).map((i) => {
      const x = i % v.size.x, z = Math.floor(i / v.size.x) % v.size.z;
      return { x: Math.min(r.x1, Math.max(r.x0, x)), y: feet, z: Math.min(r.z1, Math.max(r.z0, z)) };
    });
  }
  const living = rooms[0].box;
  const animalSpots = [{ x: living.x0, y: feet, z: living.z0 }, { x: living.x1, y: feet, z: living.z1 }]
    .filter((c) => canStand(v, c.x, c.y, c.z));
  return { door, entrance, unit: { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: feet, y1: feet + 2 }, rooms, windows,
    plantSpots, animalSpots };
}

/** The student's townhome: hollow on every floor, inside stairs, its own front door, a patio and a fenced back yard. */
function townhome(v, { L, plan, base, top, u, ids, rng }) {
  const { box } = L;
  const r = L.unitRect(u);
  // Party-wall trim on the front and back faces between townhomes, and every front door.
  for (let c = 0; c <= L.cols; c++) {
    const x = L.ux0 + c * L.uw;
    fillBox(v, { x0: x, x1: x, z0: box.z1, z1: box.z1, y0: base + 1, y1: top }, ids.trim);
    fillBox(v, { x0: x, x1: x, z0: box.z0, z1: box.z0, y0: base + 1, y1: top }, ids.trim);
  }
  for (let c = 0; c < L.cols; c++) {
    const x = L.ux0 + c * L.uw + (L.uw >> 1);
    set(v, x, base + 1, box.z1, ID('door-lower')); set(v, x, base + 2, box.z1, ID('door-upper'));
    set(v, x, base + 3, box.z1 + 1, ID('slab'));
  }
  const dx = r.x0 - 1 + (L.uw >> 1); // same column as the front doors above
  // Hollow every floor; stairs along the back of the left side when there is more than one floor.
  for (let f = 1; f <= plan.floors; f++) {
    const s = slabY(base, f);
    air(v, r.x0, r.x1, r.z0, r.z1, s + 1, s + 3);
    fillBox(v, { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: s, y1: s }, ids.floor);
  }
  const cell = (row, col) => [r.x0 + row, r.z0 + col];
  switchback(v, cell, base, plan.floors - 1, ID('planks-dark'));
  const rooms = [];
  const types = plan.floors > 1 ? [['living', 'kitchen'], ['bedroom', 'bathroom'], ['bedroom', 'den']] : [['living', 'bedroom', 'bathroom', 'kitchen']];
  for (let f = 1; f <= plan.floors; f++) {
    const feet = slabY(base, f) + 1;
    const rect = plan.floors > 1 ? { x0: r.x0, x1: r.x1, z0: r.z0 + 4, z1: r.z1 } : { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
    const n = Math.min(types[Math.min(f - 1, 2)].length, roomCount(rect));
    rooms.push(...roomsIn(v, rect, n, feet, { x: dx, z: f === 1 ? r.z1 : r.z0 }, types[Math.min(f - 1, 2)]));
  }
  air(v, dx, dx, r.z1, r.z1, base + 1, base + 2); // the entry cell inside the front door
  // Windows in the unit's front and back faces (fresh, so every floor has them).
  const windows = [];
  for (let f = 1; f <= plan.floors; f++) {
    const y = slabY(base, f) + 2;
    for (let x = r.x0; x <= r.x1; x++) {
      for (const z of [box.z0, box.z1]) {
        if (z === box.z1 && f === 1 && Math.abs(x - dx) <= 0) continue;
        if (get(v, x, y, z) === ID('door-upper')) continue;
        if ((x - r.x0) % 2 === 1 || r.x1 - r.x0 < 2) { set(v, x, y, z, ID('glass')); windows.push(idx(v, x, y, z)); }
      }
    }
  }
  // Patio (lānai) in front, a fenced yard behind.
  const plantSpots = [];
  for (let x = r.x0; x <= r.x1; x++) {
    set(v, x, base, box.z1 + 1, ID('slab'));
    if (x !== dx) plantSpots.push({ x, y: base + 1, z: box.z1 + 1 });
  }
  const yard = { x0: r.x0 - 1, x1: r.x1 + 1, z0: box.z0 - 4, z1: box.z0 - 1 };
  for (let x = yard.x0; x <= yard.x1; x++) if (get(v, x, base + 1, yard.z0) === 0) set(v, x, base + 1, yard.z0, ID('fence'));
  for (let z = yard.z0; z < box.z0; z++) for (const x of [yard.x0, yard.x1]) if (get(v, x, base + 1, z) === 0) set(v, x, base + 1, z, ID('fence'));
  air(v, dx, dx, box.z0, box.z0, base + 1, base + 2); // back door to the yard
  const animalSpots = [];
  for (let x = r.x0; x <= r.x1; x += 2) animalSpots.push({ x, y: base + 1, z: box.z0 - 2 });
  void rng;
  const door = { x: dx, y: base + 1, z: box.z1 + 1 };
  return { door, entrance: door, unit: { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: base + 1, y1: slabY(base, plan.floors) + 3 },
    rooms, windows, plantSpots, animalSpots: animalSpots.filter((c) => canStand(v, c.x, c.y, c.z)) };
}
