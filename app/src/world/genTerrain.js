// Terrain and nature by biome (13 §5, 08 §3, homeblocks 06). Pure: no DOM, no three.
// genTerrain(volume, {location, monthIndex, seed}) writes bedrock, stone, the biome's ground layers, coast or lake water
// on the −X side, patches (lava rock, stone, gravel, concrete, crops) and seeded trees, and keeps the lot (±lotHalf
// around the center) and the street band along +z flat at groundY with no trees.
import { WORLD } from '../config.js';
import { BLOCK } from './blocks.js';
import { fillBox, set, get, idx } from './volume.js';
import { createRng, seedFor } from '../util/rng.js';
import { placeTree, treeRadius } from './trees.js';

/** Places with an ocean edge (08 §3; same list as SCENE3D.coastal). */
export const COASTAL_IDS = ['honolulu', 'kailua-kona', 'miami', 'halifax', 'homer'];

/**
 * Per-biome look (13 §5, after three/terrain.js RECIPES). top = signature top block away from the lot; lotTop = the
 * yard; sub = the 3 layers under the top; rise = max height in blocks; trees = [[kind, weight]]; density scales
 * WORLD.treesPer1000; patches = [[blockKey, count, radius]] that replace the top; shore = sand | gravel; water = lake.
 */
export const BIOME_LOOK = {
  'tropical-wet': { top: 'grass', sub: 'dirt', rise: 4, trees: [['ohia', 5], ['palm', 2], ['banana', 1]], density: 1.4 },
  'tropical-dry': { top: 'dirt', lotTop: 'grass', sub: 'dirt', rise: 3, trees: [['palm', 3], ['ohia', 1]], density: 0.5,
    patches: [['lava-rock', 14, 5]], shore: 'sand' },
  'tropical-upland': { top: 'grass', sub: 'dirt', rise: 10, trees: [['oak', 2], ['pine', 1], ['ohia', 1]], density: 0.5 },
  'tropical-urban': { top: 'concrete', lotTop: 'grass', sub: 'dirt', rise: 2, trees: [['palm', 3], ['oak', 1]], density: 3,
    patches: [['grass', 14, 5]], treesOn: 'grass', shore: 'sand' },
  'temperate-urban': { top: 'concrete', lotTop: 'grass', sub: 'dirt', rise: 1, trees: [['oak', 1]], density: 2.5,
    patches: [['grass', 12, 5]], treesOn: 'grass' },
  'temperate-rain': { top: 'grass', sub: 'dirt', rise: 6, trees: [['pine', 4], ['oak', 1]], density: 1.4, patches: [['gravel', 4, 3]] },
  'subtropical-coastal': { top: 'grass', sub: 'sand', rise: 1, trees: [['palm', 3], ['oak', 1]], density: 0.7, shore: 'sand' },
  'subtropical-flat': { top: 'grass', sub: 'dirt', rise: 1, trees: [['oak', 4], ['palm', 1]], density: 0.7 },
  desert: { top: 'red-sand', sub: 'red-sand', rise: 3, trees: [['cactus', 1]], density: 0.8, patches: [['stone', 8, 2]] },
  'desert-mountain': { top: 'red-sand', sub: 'red-sand', rise: 14, trees: [['cactus', 1]], density: 0.7,
    patches: [['stone', 14, 3]], peakStone: 8 },
  plains: { top: 'grass', sub: 'dirt', rise: 2, trees: [['oak', 1]], density: 0.12, fields: 4 },
  alpine: { top: 'grass', sub: 'dirt', rise: 16, trees: [['pine', 1]], density: 1.6, patches: [['stone', 8, 3]], peakStone: 9 },
  'continental-lake': { top: 'grass', sub: 'dirt', rise: 4, trees: [['oak', 3], ['pine', 1]], density: 1.0, water: 'lake', shore: 'sand' },
  'continental-forest': { top: 'grass', sub: 'dirt', rise: 6, trees: [['oak', 3], ['pine', 1]], density: 1.4 },
  'humid-forest': { top: 'grass', sub: 'dirt', rise: 8, trees: [['oak', 4], ['pine', 1]], density: 1.6 },
  maritime: { top: 'grass', sub: 'dirt', rise: 5, trees: [['pine', 3], ['oak', 1]], density: 0.9, patches: [['stone', 5, 2]], water: 'sea' },
  'subarctic-coastal': { top: 'grass', sub: 'dirt', rise: 9, trees: [['pine', 1]], density: 1.0,
    patches: [['stone', 10, 3]], water: 'sea', peakStone: 7 },
};

const ID = (key) => BLOCK[key].id;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Seeded 2D value noise in [0, 1) at lattice spacing `cell`. */
function valueNoise(seed, cell) {
  const lat = (ix, iz) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const fx = x / cell, fz = z / cell, ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = smooth(fx - ix), tz = smooth(fz - iz);
    const a = lat(ix, iz), b = lat(ix + 1, iz), c = lat(ix, iz + 1), d = lat(ix + 1, iz + 1);
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
  };
}

/** Is `month` (0–11) a snow month for this location (08 §3)? */
export function isSnowMonth(location, monthIndex) {
  const m = (((monthIndex | 0) % 12) + 12) % 12;
  return (location?.seasons?.snowMonths ?? []).includes(m);
}

/** The lot and street rectangles for a volume of `size` (cells, inclusive). */
export function lotBounds(size = WORLD.size) {
  const cx = Math.floor(size.x / 2), cz = Math.floor(size.z / 2), L = WORLD.lotHalf;
  return {
    lot: { x0: cx - L, x1: cx + L, z0: cz - L, z1: cz + L },
    street: { x0: 0, x1: size.x - 1, z0: cz + L + 1, z1: cz + L + WORLD.streetDepth },
  };
}

/** Water kind for a location: 'sea' | 'lake' | null. */
export function waterKind(location) {
  const look = BIOME_LOOK[location?.biome];
  if (look?.water) return look.water;
  return COASTAL_IDS.includes(location?.id) ? 'sea' : null;
}

/**
 * Generate the ground into `v` (which should be all air). location = a data/locations record. Returns
 * {heightAt(x, z) (top solid y; water columns give the seabed), water, waterKind, snow, treeCount, top, lot, street}.
 */
export function genTerrain(v, { location, monthIndex = 0, seed = 0 } = {}) {
  const biome = BIOME_LOOK[location?.biome] ? location.biome : 'tropical-wet';
  const look = BIOME_LOOK[biome];
  const { x: X, y: Y, z: Z } = v.size;
  const G = Math.min(WORLD.groundY, Y - 2);
  const base = seedFor(seed, 'terrain', location?.id ?? biome);
  const rng = createRng(base);
  const n1 = valueNoise(base ^ 0x5bd1e995, 26), n2 = valueNoise(base ^ 0x27d4eb2d, 9);
  const { lot, street } = lotBounds(v.size);
  const wk = waterKind(location);
  const waterX = wk ? Math.min(WORLD.waterX, Math.floor(X / 4)) : -1;
  const shoreX = waterX + WORLD.shoreWidth;
  const snow = isSnowMonth(location, monthIndex);

  // Height field: flat on the lot, street band and shore, rising away from them.
  const heights = new Int16Array(X * Z);
  const flatDist = (x, z) => {
    const dx = Math.max(lot.x0 - x, 0, x - lot.x1), dz = Math.max(lot.z0 - z, 0, z - lot.z1);
    const dl = Math.max(dx, dz);
    const ds = Math.max(street.z0 - z, 0, z - street.z1);
    return Math.min(dl, ds);
  };
  for (let z = 0; z < Z; z++) {
    for (let x = 0; x < X; x++) {
      let fade = smooth(flatDist(x, z) / WORLD.flatFade);
      if (wk) fade *= smooth((x - shoreX) / WORLD.flatFade);
      const n = 0.75 * n1(x, z) + 0.25 * n2(x, z);
      let h = G + Math.round(fade * look.rise * n);
      if (wk && x < waterX) h = G - 3 - Math.min(3, Math.floor((waterX - x) / 4));
      heights[x + X * z] = Math.min(h, Y - 12);
    }
  }
  const heightAt = (x, z) => (x >= 0 && z >= 0 && x < X && z < Z ? heights[x + X * z] : G);

  // Columns: bedrock, stone, sub layers, top (sand/gravel on the shore, stone on high peaks).
  const bedrock = ID('bedrock'), stone = ID('stone'), sub = ID(look.sub), water = ID('water');
  const topId = ID(look.top), lotTop = ID(look.lotTop ?? look.top);
  const shoreId = ID(look.shore ?? 'gravel');
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: X - 1, y1: 0, z1: Z - 1 }, bedrock);
  const tops = new Uint8Array(X * Z);
  for (let z = 0; z < Z; z++) {
    for (let x = 0; x < X; x++) {
      const h = heights[x + X * z];
      for (let y = 1; y <= h - 4; y++) v.data[idx(v, x, y, z)] = stone;
      for (let y = Math.max(1, h - 3); y < h; y++) v.data[idx(v, x, y, z)] = sub;
      const onLot = x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1;
      let t = onLot ? lotTop : topId;
      if (wk && x < shoreX) t = shoreId;
      if (look.peakStone && h - G >= look.peakStone) t = stone;
      tops[x + X * z] = t;
      v.data[idx(v, x, h, z)] = t;
      if (wk && x < waterX) for (let y = h + 1; y < G; y++) v.data[idx(v, x, y, z)] = water;
    }
  }

  // Open = outside the lot, street band and shore; safe for patches and trees.
  const margin = 2;
  const open = (x, z) => x >= 1 && z >= 1 && x < X - 1 && z < Z - 1
    && !(x >= lot.x0 - margin && x <= lot.x1 + margin && z >= lot.z0 - margin && z <= lot.z1 + margin)
    && !(z >= street.z0 - 1 && z <= street.z1 + 1)
    && !(wk && x < shoreX + 1);
  const setTop = (x, z, id) => { const h = heights[x + X * z]; tops[x + X * z] = id; set(v, x, h, z, id); };
  const blob = (key, r) => {
    for (let k = 0; k < 20; k++) {
      const cx = rng.int(0, X - 1), cz = rng.int(0, Z - 1);
      if (!open(cx, cz)) continue;
      const rr = r + rng.int(0, Math.max(1, Math.floor(r / 2)));
      for (let z = cz - rr; z <= cz + rr; z++) {
        for (let x = cx - rr; x <= cx + rr; x++) {
          if (!open(x, z) || (x - cx) ** 2 + (z - cz) ** 2 > rr * rr - rng.int(0, rr)) continue;
          setTop(x, z, ID(key));
        }
      }
      return;
    }
  };
  for (const [key, count, r] of look.patches ?? []) for (let i = 0; i < count; i++) blob(key, r);
  if ((location?.hazards ?? []).includes('lava') && biome !== 'tropical-dry') for (let i = 0; i < 10; i++) blob('lava-rock', 4);

  // Plains fields: crop rows on tilled dirt.
  const cropsId = ID('crops'), dirtId = ID('dirt');
  for (let f = 0; f < (look.fields ?? 0); f++) {
    const w = rng.int(8, 16), d = rng.int(8, 14);
    const x0 = rng.int(1, X - w - 2), z0 = rng.int(1, Z - d - 2);
    for (let z = z0; z < z0 + d; z++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!open(x, z)) continue;
        setTop(x, z, dirtId);
        if (!snow && (z - z0) % 2 === 0) set(v, x, heights[x + X * z] + 1, z, cropsId);
      }
    }
  }

  // Trees: seeded scatter on open ground, spaced by radius.
  const treesOn = look.treesOn ? ID(look.treesOn) : null;
  const okTop = new Set([topId, ID('grass'), ID('red-sand'), ID('dirt')]);
  const weights = look.trees, total = weights.reduce((s, [, w]) => s + w, 0);
  const pickKind = () => { let r = rng.next() * total; for (const [k, w] of weights) { if ((r -= w) < 0) return k; } return weights[0][0]; };
  const taken = new Uint8Array(X * Z);
  const attempts = Math.round((X * Z / 1000) * WORLD.treesPer1000 * look.density);
  let treeCount = 0;
  for (let i = 0; i < attempts; i++) {
    const x = rng.int(2, X - 3), z = rng.int(2, Z - 3);
    const kind = pickKind(), r = treeRadius(kind);
    if (!open(x, z) || taken[x + X * z]) continue;
    const t = tops[x + X * z];
    if (treesOn !== null ? t !== treesOn : !okTop.has(t)) continue;
    const y = heights[x + X * z] + 1;
    if (y + 10 >= Y || get(v, x, y, z) !== 0) continue;
    const tr = createRng(seedFor(base, 'tree', i));
    if (!placeTree(v, kind, x, y, z, tr, { bare: snow, snowCap: snow })) continue;
    treeCount++;
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const tx = x + dx, tz = z + dz;
        if (tx >= 0 && tz >= 0 && tx < X && tz < Z) taken[tx + X * tz] = 1;
      }
    }
  }

  // Snow cover: the exposed ground goes white; a lake freezes over.
  if (snow) {
    const snowId = ID('snow'), ice = ID('ice');
    const covers = new Set([ID('grass'), ID('dirt'), ID('red-sand'), ID('sand'), ID('gravel'), ID('concrete'), stone]);
    for (let z = 0; z < Z; z++) {
      for (let x = 0; x < X; x++) {
        const h = heights[x + X * z];
        if (wk && x < waterX) { if (wk === 'lake') set(v, x, G - 1, z, ice); continue; }
        if (covers.has(get(v, x, h, z)) && get(v, x, h + 1, z) !== cropsId) set(v, x, h, z, snowId);
      }
    }
  }

  return { heightAt, water: !!wk, waterKind: wk, snow, treeCount, top: look.top, lot, street };
}
