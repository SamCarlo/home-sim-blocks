// Neighborhood by settlement (13 §5, homeblocks 07). Pure: no DOM, no three.
// genNeighborhood(volume, {location, seed, homeKind}) runs after genTerrain and writes the street along +z of the lot
// (sidewalks, curbs, asphalt, center paint; a gravel road when rural), streetlamps, the mailbox at the lot, and neighbor
// lots by settlement: rural = fenced crop fields + 1–2 far farmhouses; small-town/suburb = detached houses in the style
// family's blocks; small-city/mid-city = row houses + floor blocks; big-city = towers + floor blocks. Apartment and condo
// homes see one settlement step denser (NEIGHBORHOOD.stepUp). Neighbors keep NEIGHBORHOOD.gap clear of the lot, the
// street and each other, never stand in water, and are shells (no interiors).
import { WORLD, NEIGHBORHOOD as N } from '../config.js';
import { BLOCK, BLOCKS, styleBlocks } from './blocks.js';
import { fillBox, set, get } from './volume.js';
import { createRng, seedFor } from '../util/rng.js';
import { lotBounds } from './genTerrain.js';
import { STYLE_FAMILY_DATA } from '../data/styleFamilies.js';
import { houseShell, blockShell, towerShell, fenceRing, roofShapeFor } from './shells.js';

const ID = (key) => BLOCK[key].id;
/** Blocks a neighbor site may clear away (trees, crops, flowers). */
const NATURE = new Set(BLOCKS.filter((b) => b.group === 'nature').map((b) => b.id));

/** The settlement the surroundings are drawn as: one step denser for apartment and condo homes. */
export function neighborSettlement(settlement, homeKind = 'house') {
  const s = N[settlement] ? settlement : 'suburb';
  return homeKind === 'apartment' || homeKind === 'condo' ? N.stepUp[s] : s;
}

/** Volume size for a place: big-city surroundings get WORLD.tallY so towers fit. */
export function worldSizeFor(location, homeKind = 'house') {
  return neighborSettlement(location?.settlement, homeKind) === 'big-city' ? { ...WORLD.size, y: WORLD.tallY } : { ...WORLD.size };
}

/** Do inclusive rects a and b overlap once a is grown by pad? */
const hits = (a, b, pad = 0) => a.x0 - pad <= b.x1 && a.x1 + pad >= b.x0 && a.z0 - pad <= b.z1 && a.z1 + pad >= b.z0;

/** Generate the street and the neighbors into v (after genTerrain). Returns {settlement, neighbors, counts, lamps, mailbox}. */
export function genNeighborhood(v, { location, seed = 0, homeKind = 'house' } = {}) {
  const settlement = neighborSettlement(location?.settlement, homeKind);
  const { x: X, y: Y, z: Z } = v.size;
  const G = Math.min(WORLD.groundY, Y - 2);
  const rng = createRng(seedFor(seed, 'neighborhood', location?.id ?? settlement, homeKind));
  const { lot, street } = lotBounds(v.size);
  const fam = STYLE_FAMILY_DATA[location?.styleFamily] ? location.styleFamily : 'texas-suburban';
  const style = styleBlocks(fam, location?.styleVariant ?? null);
  const water = ID('water');
  const scanTop = Math.min(Y - 1, G + 40);

  /** Top ground y at (x, z) ignoring trees and crops; −1 over water. */
  const groundAt = (x, z) => {
    for (let y = scanTop; y > 0; y--) {
      const b = get(v, x, y, z);
      if (b === 0 || NATURE.has(b)) continue;
      return b === water ? -1 : y;
    }
    return 0;
  };

  const street_ = writeStreet(v, { street, lot, G, rural: settlement === 'rural', X });

  // ---- Sites -------------------------------------------------------------------------------------------------
  const placed = [];
  const free = (r) => r.x0 >= 1 && r.z0 >= 1 && r.x1 <= X - 2 && r.z1 <= Z - 2
    && !hits(r, lot, N.gap) && !hits(r, street, N.gap) && !placed.some((p) => hits(r, p.rect, N.gap));
  /** Check water and slope, clear trees, lay a foundation; returns the base y or null. */
  const prepSite = (r, { maxStep = N.maxStep, flatten = true } = {}) => {
    let lo = Infinity, hi = -Infinity;
    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const g = groundAt(x, z);
        if (g < 0) return null;
        lo = Math.min(lo, g); hi = Math.max(hi, g);
      }
    }
    if (hi - lo > maxStep) return null;
    for (let z = r.z0 - 1; z <= r.z1 + 1; z++) {
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
        for (let y = scanTop; y > lo; y--) if (NATURE.has(get(v, x, y, z))) set(v, x, y, z, 0);
      }
    }
    if (flatten) {
      const found = ID('stone-brick');
      for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) for (let y = groundAt(x, z) + 1; y <= hi; y++) set(v, x, y, z, found);
    }
    return hi;
  };

  // Bands of frontage: across the street (doors face −z), the lot's side (face +z), behind the lot, a second row across.
  const across = street.z1 + 1 + N.setback, near = street.z0 - 1 - N.setback;
  const bands = {
    across: (d) => ({ z0: across, z1: across + d - 1, face: -1 }),
    near: (d) => ({ z0: near - d + 1, z1: near, face: 1 }),
    back: (d) => ({ z0: lot.z0 - N.gap - 1 - d + 1, z1: lot.z0 - N.gap - 1, face: 1 }),
    across2: (d) => ({ z0: across + 18, z1: across + 18 + d - 1, face: -1 }),
  };
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  /** Candidate rects of w × d in the named bands, nearest the lot first (seeded jitter). */
  const candidates = (w, d, names, { far = 0 } = {}) => {
    const out = [];
    for (const name of names) {
      const b = bands[name](d);
      for (let x0 = 1; x0 + w - 1 <= X - 2; x0++) {
        const r = { x0, z0: b.z0, x1: x0 + w - 1, z1: b.z1 };
        const dist = Math.hypot((r.x0 + r.x1) / 2 - cx, (r.z0 + r.z1) / 2 - cz);
        if (dist < far) continue;
        out.push({ r, face: b.face, score: dist + rng.float(0, 8) });
      }
    }
    return out.sort((a, b) => a.score - b.score);
  };
  /** Put one item: first free candidate whose site preps; build(rect, base, face) → box. */
  const placeOne = (kind, w, d, names, build, opts = {}) => {
    for (const c of candidates(w, d, names, opts)) {
      if (!free(c.r)) continue;
      const base = prepSite(c.r, opts);
      if (base === null) continue;
      const box = build(c.r, base, c.face);
      placed.push({ kind, rect: c.r, box });
      return true;
    }
    return false;
  };
  const count = ([a, b]) => rng.int(a, b);
  const walls = [style.wall, style.wall, style.wall, style.trim, ID('planks-light'), ID('brick')];
  const cityWalls = [ID('brick'), ID('stone-brick'), style.wall, ID('concrete'), ID('plaster')];
  const roofShape = roofShapeFor(STYLE_FAMILY_DATA[fam].house?.roof);
  const house = (stories) => (r, base, face) => houseShell(v, r, base, {
    stories, face, rng, wallId: rng.pick(walls), roofId: rng.chance(0.8) ? style.roof : ID('roof'), trimId: style.trim,
    roof: rng.chance(0.75) ? roofShape : rng.pick(['gable', 'hip']),
  });
  const floorBlock = (floors) => (r, base, face) => blockShell(v, r, base, {
    floors, face, rng, wallId: rng.pick(cityWalls), trimId: style.trim, roofId: ID('concrete'),
  });

  const cfg = N[settlement];
  if (settlement === 'rural') {
    for (let i = count(cfg.farmhouses); i > 0; i--) {
      placeOne('farmhouse', rng.int(9, 12), rng.int(8, 10), ['across', 'across2', 'back', 'near'], house(rng.int(1, 2)), { far: cfg.farMin });
    }
    for (let i = count(cfg.fields); i > 0; i--) {
      placeOne('field', rng.int(12, 20), rng.int(10, 14), ['across', 'across2', 'back', 'near'], (r) => field(v, r, groundAt), { flatten: false, maxStep: 6 });
    }
  } else if (settlement === 'small-town' || settlement === 'suburb') {
    for (let i = count(cfg.houses); i > 0; i--) {
      // Hilly places: fall back to a smaller house, a deeper row and a taller foundation.
      const build = house(count(cfg.stories));
      if (!placeOne('house', rng.int(9, 11), rng.int(8, 10), ['across', 'near'], build)) {
        placeOne('house', 7, 7, ['across', 'near', 'back', 'across2'], build, { maxStep: N.maxStep + 3 });
      }
    }
  } else if (settlement === 'small-city' || settlement === 'mid-city') {
    for (let i = count(cfg.blocks); i > 0; i--) {
      placeOne('block', rng.int(12, 16), rng.int(12, 14), ['across', 'back', 'near'], floorBlock(count(cfg.floors)));
    }
    for (let i = count(cfg.rows); i > 0; i--) {
      // A shorter terrace when the long one finds no flat, dry frontage.
      const uw = 6;
      for (const units of [rng.int(4, 6), 3, 2]) {
        const build = (r, base, face) => rowHouses(v, r, base, face, units, uw, { rng, cityWalls, style });
        if (placeOne('row', units * uw, 10, ['across', 'near', 'back', 'across2'], build, { maxStep: N.maxStep + 2 })) break;
      }
    }
  } else {
    const maxFloors = Math.floor((Y - 6 - G) / N.storyH);
    for (let i = count(cfg.towers); i > 0; i--) {
      const floors = Math.min(maxFloors, count(cfg.towerFloors));
      placeOne('tower', rng.int(12, 16), rng.int(12, 16), ['across', 'back', 'across2', 'near'], (r, base) => towerShell(v, r, base, {
        floors, rng, wallId: rng.pick([ID('concrete'), ID('metal'), ID('stone-brick')]), trimId: ID('metal'),
      }));
    }
    for (let i = count(cfg.blocks); i > 0; i--) {
      placeOne('block', rng.int(12, 16), rng.int(12, 14), ['near', 'across', 'back', 'across2'], floorBlock(count(cfg.floors)));
    }
  }

  const counts = {};
  for (const p of placed) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  return { settlement, neighbors: placed.map((p) => ({ kind: p.kind, rect: p.rect, box: p.box })), counts, ...street_ };
}

/** A fenced crop field following the ground: dirt top, crop rows (none on snow), fence ring. */
function field(v, r, groundAt) {
  const dirt = ID('dirt'), crops = ID('crops'), snow = ID('snow');
  for (let z = r.z0 + 1; z < r.z1; z++) {
    for (let x = r.x0 + 1; x < r.x1; x++) {
      const g = groundAt(x, z);
      if (g < 0 || get(v, x, g, z) === snow) continue;
      set(v, x, g, z, dirt);
      if ((z - r.z0) % 2 === 1) set(v, x, g + 1, z, crops);
    }
  }
  fenceRing(v, r, groundAt);
  return { ...r, y0: 0, y1: 0 };
}

/** A terrace of `units` row houses (each uw wide, 2–3 stories, own wall color) sharing walls. */
function rowHouses(v, r, base, face, units, uw, { rng, cityWalls, style }) {
  let y1 = base;
  for (let i = 0; i < units; i++) {
    const u = { x0: r.x0 + i * uw, z0: r.z0, x1: r.x0 + (i + 1) * uw - 1, z1: r.z1 };
    const box = blockShell(v, u, base, { floors: rng.int(2, 3), face, rng, wallId: rng.pick(cityWalls), trimId: style.trim,
      roofId: ID('concrete'), band: false, rows: [2] });
    y1 = Math.max(y1, box.y1);
  }
  return { ...r, y0: base, y1 };
}

/**
 * The street band: sidewalk, curb, asphalt with a dashed center line, curb, sidewalk (rural: a gravel road with the
 * verges left as they are), streetlamps along the lot side (and the far side in town), the mailbox at the lot.
 * Columns over water are skipped. Returns {lamps, mailbox, roadZ}.
 */
function writeStreet(v, { street, lot, G, rural, X }) {
  const { z0, z1 } = street;
  const roadZ0 = z0 + 3, roadZ1 = z1 - 3;
  const solidAt = (x, z) => { const b = get(v, x, G, z); return b !== 0 && b !== ID('water'); };
  const midZ = Math.floor((roadZ0 + roadZ1) / 2);
  for (let x = 0; x < X; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!solidAt(x, z)) continue;
      let id;
      if (rural) id = z >= roadZ0 && z <= roadZ1 ? ID('gravel') : 0;
      else if (z >= roadZ0 && z <= roadZ1) id = z === midZ && x % 4 < 2 ? ID('road-paint') : ID('asphalt');
      else if (z === roadZ0 - 1 || z === roadZ1 + 1) id = ID('stone');
      else id = ID('concrete');
      if (id) set(v, x, G, z, id);
    }
  }
  const lamps = [];
  const lamp = (x, z) => {
    if (!solidAt(x, z)) return;
    fillBox(v, { x0: x, y0: G + 1, z0: z, x1: x, y1: G + 3, z1: z }, ID('metal'));
    set(v, x, G + 4, z, ID('lamp'));
    lamps.push({ x, z });
  };
  const every = rural ? N.lampEvery * 2 : N.lampEvery;
  for (let x = 6; x < X - 2; x += every) lamp(x, z0);
  if (!rural) for (let x = 6 + every / 2; x < X - 2; x += every) lamp(x, z1);
  // Mailbox on a post at the front corner of the lot.
  const mx = lot.x0 + 3;
  let mailbox = null;
  if (solidAt(mx, z0)) {
    set(v, mx, G + 1, z0, ID('fence'));
    set(v, mx, G + 2, z0, ID('mailbox'));
    mailbox = { x: mx, y: G + 2, z: z0 };
  }
  return { lamps, mailbox, roadZ: [roadZ0, roadZ1] };
}
