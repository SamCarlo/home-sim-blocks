// Distant landmarks, one per place (13 §3, §5, homeblocks 08). Pure: no DOM, no three.
// genFar({location, seed, monthIndex?}) → {size, data, origin, scale, key}: a low-res far volume (one far block =
// WORLD.farScale m) that sits past the dense world's −z edge, the direction three/terrain.js puts every landmark (behind
// the lot, away from the street). Far-volume axes match the world: x east, y up, z toward the street, so the volume's
// z = size.z − 1 face is the one nearest the player. y = 0 is a ground plate whose top lines up with WORLD.groundY.
// Snow caps use plain plaster (white on every face): the snow block's sides are dirt-snow and read brown far off.
import { WORLD, FAR } from '../config.js';
import { BLOCK } from './blocks.js';
import { createVolume, fillBox, set, get, topSolidY } from './volume.js';
import { createRng, seedFor } from '../util/rng.js';

const B = (key) => BLOCK[key].id;

// ── shape helpers (all write into far volume v) ────────────────────────────────────────────────────────────────────
/** Ground plate at y = 0; water (or lake) over z ≥ waterZ. */
function plate(v, key, { water = null, waterZ = 0 } = {}) {
  const { x: X, z: Z } = v.size;
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: X - 1, y1: 0, z1: Z - 1 }, B(key));
  if (water) fillBox(v, { x0: 0, y0: 0, z0: waterZ, x1: X - 1, y1: 0, z1: Z - 1 }, B(water));
}

/**
 * A mound: column height h·(1 − d^a)^b over an ellipse (rx, rz) around (cx, cz). key = body; top = surface layer below
 * topBelow·h; cap = layers from capFrom·(h + y0) up; crater {r (0..1 of the radius), depth}; rough = ± seeded jitter;
 * y0 = base layer (the mound starts above it).
 */
function mound(v, rng, { cx, cz, rx, rz, h, a = 1, b = 1, key, top = null, topBelow = 1, cap = null, capFrom = 1,
  crater = null, rough = 0, y0 = 0 }) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
      if (d >= 1) continue;
      let hh = h * Math.pow(1 - Math.pow(d, a), b);
      if (crater && d < crater.r) hh -= crater.depth * (1 - d / crater.r);
      if (rough) hh += (rng.next() - 0.5) * rough;
      const top_ = Math.round(hh);
      for (let y = y0 + 1; y <= y0 + top_; y++) {
        let id = B(key);
        if (cap && y >= capFrom * (h + y0)) id = B(cap);
        else if (top && y === y0 + top_ && y < topBelow * h) id = B(top);
        set(v, x, y, z, id);
      }
    }
  }
}

/** A line of mounds from x0 to x1 (heights 0.65–1 × h, seeded). */
function ridge(v, rng, { x0, x1, cz, n, h, rx, rz, ...rest }) {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1), wob = rng.next();
    mound(v, rng, { ...rest, cx: x0 + (x1 - x0) * f, cz: cz - Math.round(wob * 2), rx: rx * (0.8 + 0.4 * wob),
      rz, h: h * (0.65 + 0.35 * wob) });
  }
}

/** A box (inclusive ends). */
const box = (v, x0, y0, z0, x1, y1, z1, key) => fillBox(v, { x0, y0, z0, x1, y1, z1 }, B(key));

/** A filled disk (ellipse) at layer y. */
function disk(v, cx, y, cz, r, key, rz = r) {
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      if (Math.hypot((x - cx) / r, (z - cz) / rz) <= 1) set(v, x, y, z, B(key));
    }
  }
}

/** A tower w × d × h at (x, z): body key with a band key every `band` layers, optional roof key on top. */
function tower(v, x, z, w, d, h, key, { band = null, every = 3, roof = null } = {}) {
  box(v, x, 1, z, x + w - 1, h, z + d - 1, key);
  if (band) for (let y = every; y < h; y += every) box(v, x, y, z, x + w - 1, y, z + d - 1, band);
  if (roof) box(v, x, h + 1, z, x + w - 1, h + 1, z + d - 1, roof);
}

/** A row of n seeded towers between x0 and x1, set back between z0 and z1. */
function skyline(v, rng, { x0, x1, z0, z1, n, hMin, hMax, keys, bands = [], wMin = 3, wMax = 6 }) {
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const w = rng.int(wMin, wMax), d = rng.int(wMin, wMax), h = rng.int(hMin, hMax);
    const x = Math.round(x0 + i * step + rng.next() * Math.max(0, step - w)), z = rng.int(z0, Math.max(z0, z1 - d));
    const k = i % keys.length;
    tower(v, x, z, w, d, h, keys[k], { band: bands[k] ?? null, every: 2 + (i % 2) });
  }
}

/** A steam plume: disks of `plume` rising from (x, y0, z), widening and leaning `lean` blocks east by the top. */
function plume(v, rng, { x, z, y0, h, lean, r0 = 1.5, r1 = 6 }) {
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1), cx = x + lean * t * t, r = r0 + (r1 - r0) * t;
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      for (let dz = -Math.ceil(r * 0.6); dz <= Math.ceil(r * 0.6); dz++) {
        if (Math.hypot(dx / r, dz / (r * 0.6)) > 1 || rng.chance(0.12)) continue;
        if (get(v, Math.round(cx + dx), y0 + i, z + dz) === 0) set(v, Math.round(cx + dx), y0 + i, z + dz, B('plume'));
      }
    }
  }
}

/** Little buildings for small towns: n houses of plaster/brick/planks with roofs. */
function town(v, rng, { x0, x1, z0, z1, n, keys = ['plaster', 'brick', 'planks-light'], roof = 'roof', hMax = 3 }) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1 - 3), z = rng.int(z0, z1 - 2), h = rng.int(1, hMax);
    tower(v, x, z, rng.int(2, 3), 2, h, keys[i % keys.length], { roof });
  }
}

// ── shape builders (13 §5 groups; each key passes its own parameters and colors) ───────────────────────────────────
const SHAPES = {
  /** A low shield with a crater and a leaning plume (Kīlauea). */
  volcanoPlume(v, rng, p) {
    plate(v, p.ground);
    mound(v, rng, { cx: p.cx, cz: 10, rx: p.rx, rz: 11, h: p.h, a: 1.5, key: 'lava-rock', top: 'grass', topBelow: 0.55,
      crater: { r: 0.22, depth: 4 }, rough: 1 });
    plume(v, rng, { x: p.cx + 4, z: 10, y0: p.h - 2, h: p.plumeH, lean: p.lean });
  },
  /** A broad shield; snow cap and observatory domes (Maunakea) or summit cinder cones and the sea (Hualālai). */
  shield(v, rng, p, ctx) {
    plate(v, p.ground, { water: p.water, waterZ: 19 });
    const capFrom = p.cap ? (ctx.winter ? p.capWinter : p.capFrom) : 1;
    mound(v, rng, { cx: p.cx, cz: 9, rx: p.rx, rz: 10, h: p.h, a: p.a3 ? 3 : 1.4, b: 1, key: p.key, top: p.top, topBelow: p.topBelow,
      cap: p.cap, capFrom, rough: 1.2 });
    for (const [dx, s] of p.cones ?? []) {
      const y = topSolidY(v, p.cx + dx, 9) - 1;
      mound(v, rng, { cx: p.cx + dx, cz: 9, rx: s * 1.4, rz: s, h: s, a: 1.5, key: p.coneKey ?? p.key, cap: p.cap, capFrom, y0: y });
    }
    for (const [dx, k] of p.domes ?? []) {
      const x = p.cx + dx, y = topSolidY(v, x, 9) + 1;
      box(v, x, y, 8, x + 1, y + 1, 9, k);
    }
    if (p.front) ridge(v, rng, { x0: 8, x1: 88, cz: 17, n: 5, h: 4, rx: 10, rz: 2, key: p.front });
  },
  /** Layered ridges, far ones hazy (pine ridges, Allegheny, Mule Mountains, Kohala hills). */
  ridges(v, rng, p) {
    plate(v, p.ground);
    p.layers.forEach((L, i) => ridge(v, rng, { x0: -4, x1: 100, cz: L.cz, n: L.n, h: L.h, rx: L.rx, rz: L.rz ?? 5,
      a: L.a ?? 1, b: L.b ?? 1, key: L.key, top: L.top, topBelow: L.topBelow ?? 1, cap: L.cap, capFrom: L.capFrom ?? 1,
      rough: L.rough ?? 0 }));
    for (const m of p.mist ?? []) box(v, m[0], m[1], m[2], m[3], m[1], m[2] + 1, 'plume');
  },
  /** A volcano peak with a city and its needle tower in front (Rainier + Space Needle). */
  needleMountain(v, rng, p) {
    plate(v, p.ground);
    mound(v, rng, { cx: p.peakX, cz: 7, rx: 30, rz: 7, h: p.peakH, a: 1, b: 1.25, key: 'far-haze', cap: 'plaster', capFrom: 0.5,
      rough: 1 });
    skyline(v, rng, { x0: 4, x1: 44, z0: 12, z1: 18, n: 8, hMin: 6, hMax: 22, keys: ['glass', 'concrete', 'metal'],
      bands: ['concrete', null, null] });
    const x = p.needleX, z = 20;
    box(v, x, 1, z, x, 30, z, 'plaster');
    box(v, x - 1, 1, z, x - 1, 3, z, 'plaster'); box(v, x + 1, 1, z, x + 1, 3, z, 'plaster');
    disk(v, x, 30, z, 2.5, 'plaster', 1.6); disk(v, x, 31, z, 2, 'metal', 1.2);
    box(v, x, 32, z, x, 37, z, 'plaster');
  },
  /** A wall of towers by the water (Manhattan, Biscayne Bay). */
  skyline(v, rng, p) {
    plate(v, p.ground, { water: 'water', waterZ: p.waterZ });
    skyline(v, rng, { x0: 2, x1: 94, z0: 2, z1: p.waterZ - 1, n: p.n, hMin: p.hMin, hMax: p.hMax, keys: p.keys,
      bands: p.bands, wMin: p.wMin, wMax: p.wMax });
    if (p.spire) {
      const x = p.spire;
      tower(v, x, 6, 7, 6, 40, 'stone-brick', { band: 'lit-glass', every: 4 });
      box(v, x + 1, 41, 7, x + 5, 46, 10, 'stone-brick'); box(v, x + 2, 47, 8, x + 4, 49, 9, 'stone-brick');
      box(v, x + 3, 50, 8, x + 3, 55, 8, 'metal');
    }
  },
  /** Red mountains with a resort strip in front (Las Vegas). */
  stripMountains(v, rng, p) {
    plate(v, 'red-sand');
    ridge(v, rng, { x0: -6, x1: 102, cz: 5, n: 7, h: 34, rx: 18, rz: 5, key: 'far-ochre', cap: 'stone', capFrom: 0.8, rough: 1.5 });
    skyline(v, rng, { x0: 28, x1: 70, z0: 13, z1: 21, n: 7, hMin: 8, hMax: 24, keys: ['gold', 'plaster', 'glass'],
      bands: [null, 'gold', 'concrete'] });
  },
  /** A flat-topped mountain with cliff sides (Lookout Mountain). */
  mesa(v, rng, p) {
    plate(v, 'grass');
    ridge(v, rng, { x0: 0, x1: 34, cz: 6, n: 4, h: 12, rx: 12, rz: 5, a: 2, b: 0.5, key: 'far-forest' });
    mound(v, rng, { cx: 60, cz: 9, rx: 30, rz: 9, h: 22, a: 5, b: 1, key: 'stone', rough: 1 });
    for (let x = 28; x <= 92; x++) for (let z = 0; z < 20; z++) {
      const y = topSolidY(v, x, z);
      if (y >= 18) box(v, x, y - 2, z, x, y, z, 'far-forest');
    }
  },
  /** A lighthouse on a green headland with the harbour town behind (Halifax). */
  lighthouse(v, rng, p) {
    plate(v, 'grass', { water: 'water', waterZ: 10 });
    skyline(v, rng, { x0: 2, x1: 46, z0: 2, z1: 9, n: 9, hMin: 3, hMax: 12, keys: ['brick', 'plaster', 'glass'],
      bands: [null, null, 'concrete'], wMin: 3, wMax: 5 });
    ridge(v, rng, { x0: 50, x1: 96, cz: 3, n: 3, h: 10, rx: 14, rz: 4, a: 2, b: 0.5, key: 'far-forest' });
    mound(v, rng, { cx: 70, cz: 17, rx: 14, rz: 5, h: 5, a: 2, b: 0.5, key: 'stone', top: 'grass' });
    const x = 70, z = 17, y0 = topSolidY(v, x, z) + 1;
    for (let y = y0; y < y0 + 13; y++) box(v, x, y, z, x + 1, y, z + 1, Math.floor((y - y0) / 3) % 2 ? 'rug-red' : 'plaster');
    box(v, x, y0 + 13, z, x + 1, y0 + 14, z + 1, 'lit-glass');
    box(v, x, y0 + 15, z, x + 1, y0 + 15, z + 1, 'rug-red');
  },
  /** Flat country with a water tower on legs (Katy). */
  waterTower(v, rng, p) {
    plate(v, 'grass');
    ridge(v, rng, { x0: 0, x1: 96, cz: 3, n: 12, h: 5, rx: 6, rz: 3, a: 2, b: 0.5, key: 'far-forest' });
    town(v, rng, { x0: 4, x1: 48, z0: 12, z1: 20, n: 7 });
    const x = 64, z = 16;
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(v, x + dx, 1, z + dz, x + dx, 14, z + dz, 'metal');
    box(v, x, 1, z, x, 14, z, 'metal');
    for (let y = 15; y <= 20; y++) disk(v, x, y, z, y === 15 || y === 20 ? 3 : 4, 'plaster');
    disk(v, x, 21, z, 2, 'metal'); set(v, x, 22, z, B('metal'));
  },
  /** A capitol with a gold dome before green hills (Montpelier). */
  dome(v, rng, p) {
    plate(v, 'grass');
    ridge(v, rng, { x0: -4, x1: 100, cz: 4, n: 6, h: 22, rx: 16, rz: 5, a: 2, b: 0.6, key: 'far-forest', rough: 1 });
    const x = 48, z = 16;
    box(v, x - 12, 1, z - 3, x + 12, 7, z + 3, 'stone-brick');
    for (let dx = -4; dx <= 4; dx += 2) box(v, x + dx, 1, z + 4, x + dx, 7, z + 4, 'plaster');
    box(v, x - 5, 8, z + 4, x + 5, 8, z + 4, 'plaster');
    for (let y = 8; y <= 11; y++) disk(v, x, y, z, 4, 'plaster');
    for (let i = 0; i <= 5; i++) disk(v, x, 12 + i, z, Math.sqrt(Math.max(0, 25 - i * i)) || 0.5, 'gold');
    box(v, x, 18, z, x, 20, z, 'gold');
    town(v, rng, { x0: 4, x1: 32, z0: 12, z1: 21, n: 5, keys: ['planks-light', 'plaster', 'brick'] });
  },
  /** Grass sandhills with a farm windmill (Valentine). */
  windmill(v, rng, p) {
    plate(v, 'grass');
    ridge(v, rng, { x0: -6, x1: 102, cz: 6, n: 6, h: 10, rx: 16, rz: 6, a: 2, b: 0.5, key: 'sand', top: 'grass', topBelow: 0.7 });
    const x = 62, z = 19;
    for (let y = 1; y <= 13; y++) {
      const r = y < 5 ? 2 : y < 10 ? 1 : 0;
      for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) set(v, x + dx, y, z + dz, B('metal'));
    }
    const cy = 15;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      for (let s = 1; s <= 4; s++) set(v, x + Math.round(dx * s * (dx && dy ? 0.72 : 1)), cy + Math.round(dy * s * (dx && dy ? 0.72 : 1)), z + 1, B('metal'));
    }
    set(v, x, cy, z + 1, B('planks-dark')); set(v, x, 14, z, B('metal'));
    box(v, x, cy, z - 4, x, cy, z, 'metal'); box(v, x, cy - 1, z - 5, x, cy + 1, z - 4, 'metal');
    box(v, x + 6, 1, z - 2, x + 9, 2, z + 1, 'metal'); // stock tank
  },
  /** A long ore dock out into the lake, pines beyond (Marquette). */
  dock(v, rng, p) {
    plate(v, 'grass', { water: 'water', waterZ: 7 });
    ridge(v, rng, { x0: -4, x1: 100, cz: 2, n: 8, h: 12, rx: 9, rz: 3, a: 1, b: 1, key: 'far-forest', rough: 1 });
    box(v, 0, 1, 7, 95, 1, 8, 'sand');
    for (let x = 12; x <= 84; x += 4) box(v, x, 1, 15, x, 6, 15, 'brick');
    box(v, 10, 7, 14, 86, 10, 16, 'brick');
    box(v, 10, 11, 14, 86, 11, 16, 'metal');
    box(v, 4, 1, 14, 9, 10, 16, 'concrete');
  },
  /** Snowy mountains across the bay and the long sand spit (Homer). */
  spit(v, rng, p) {
    plate(v, 'water');
    ridge(v, rng, { x0: -6, x1: 102, cz: 3, n: 8, h: 38, rx: 13, rz: 4, key: 'far-haze', cap: 'plaster', capFrom: 0.55, rough: 1.5 });
    box(v, 0, 0, 0, 95, 0, 3, 'stone');
    for (let i = 0; i <= 60; i++) {
      const x = 30 + i, z = Math.round(22 - i * 0.16);
      box(v, x, 1, z, x, 1, z + 1, 'sand');
    }
    town(v, rng, { x0: 80, x1: 92, z0: 12, z1: 15, n: 3, keys: ['planks-light', 'planks-dark'] });
  },
  /** Flat fields, a crossroads, telephone poles and the signpost (Clarksdale). */
  crossroads(v, rng, p) {
    plate(v, 'dirt');
    for (let z = 1; z < 24; z += 2) box(v, 0, 1, z, 95, 1, z, 'crops');
    box(v, 0, 0, 15, 95, 1, 16, 'gravel'); box(v, 46, 0, 0, 47, 1, 23, 'gravel');
    ridge(v, rng, { x0: 0, x1: 96, cz: 1, n: 14, h: 4, rx: 5, rz: 2, a: 2, b: 0.5, key: 'far-forest' });
    for (let x = 4; x < 96; x += 9) { box(v, x, 1, 14, x, 8, 14, 'trunk'); box(v, x - 1, 8, 14, x + 1, 8, 14, 'planks-dark'); }
    const x = 50, z = 18;
    box(v, x, 1, z, x, 10, z, 'metal');
    box(v, x - 3, 9, z, x + 3, 9, z, 'road-paint'); box(v, x, 8, z - 3, x, 8, z + 3, 'road-paint');
    box(v, x - 3, 10, z, x + 3, 10, z, 'rug-blue');
  },
};

/** Landmark key → [shape, its parameters]. Every key in enums.LANDMARKS has one (tests check). */
export const LANDMARK_SHAPES = {
  'kilauea-plume': ['volcanoPlume', { ground: 'grass', cx: 40, rx: 46, h: 12, plumeH: 40, lean: 22 }],
  maunakea: ['shield', { ground: 'grass', cx: 48, rx: 54, h: 30, key: 'stone', top: 'grass', topBelow: 0.45, cap: 'plaster',
    capFrom: 0.72, capWinter: 0.55, cones: [[-10, 3], [8, 3]], domes: [[-3, 'plaster'], [1, 'plaster'], [4, 'metal']] }],
  hualalai: ['shield', { ground: 'dirt', water: 'water', cx: 56, rx: 46, h: 24, key: 'lava-rock', top: 'grass', topBelow: 0.6,
    coneKey: 'far-ochre', cones: [[-6, 3], [0, 4], [7, 3]], front: 'lava-rock' }],
  'kohala-hills': ['ridges', { ground: 'grass', layers: [
    { cz: 4, n: 6, h: 18, rx: 16, rz: 5, a: 2, b: 0.5, key: 'far-forest' },
    { cz: 12, n: 7, h: 10, rx: 12, rz: 5, a: 2, b: 0.5, key: 'grass' }],
  mist: [[4, 12, 6, 40], [56, 15, 3, 92], [24, 8, 13, 70]] }],
  leahi: ['shield', { ground: 'sand', water: 'water', cx: 60, rx: 30, h: 20, a3: true, key: 'far-ochre', top: 'grass', topBelow: 0.5 }],
  'needle-rainier': ['needleMountain', { ground: 'grass', peakX: 66, peakH: 52, needleX: 26 }],
  'manhattan-skyline': ['skyline', { ground: 'concrete', waterZ: 19, n: 18, hMin: 14, hMax: 44, spire: 44, wMin: 3, wMax: 6,
    keys: ['glass', 'brick', 'concrete', 'stone-brick'], bands: ['concrete', 'lit-glass', 'glass', null] }],
  'biscayne-skyline': ['skyline', { ground: 'sand', waterZ: 16, n: 13, hMin: 10, hMax: 34, wMin: 3, wMax: 4,
    keys: ['plaster', 'glass', 'plaster'], bands: ['glass', 'plaster', null] }],
  'water-tower': ['waterTower', {}],
  'strip-mountains': ['stripMountains', {}],
  'lookout-mountain': ['mesa', {}],
  'harbour-lighthouse': ['lighthouse', {}],
  'pine-ridges': ['ridges', { ground: 'grass', layers: [
    { cz: 3, n: 7, h: 44, rx: 15, rz: 4, key: 'far-haze', cap: 'plaster', capFrom: 0.85, rough: 1.5 },
    { cz: 12, n: 8, h: 24, rx: 12, rz: 5, key: 'far-forest', rough: 1.5 }] }],
  'ore-dock': ['dock', {}],
  'gold-dome': ['dome', {}],
  'allegheny-ridges': ['ridges', { ground: 'grass', layers: [
    { cz: 3, n: 3, h: 24, rx: 40, rz: 4, a: 2, b: 0.5, key: 'far-haze' },
    { cz: 10, n: 3, h: 16, rx: 40, rz: 4, a: 2, b: 0.5, key: 'grass' },
    { cz: 17, n: 3, h: 9, rx: 40, rz: 4, a: 2, b: 0.5, key: 'far-forest' }] }],
  'delta-crossroads': ['crossroads', {}],
  'mule-mountains': ['ridges', { ground: 'red-sand', layers: [
    { cz: 4, n: 9, h: 32, rx: 11, rz: 5, key: 'far-ochre', cap: 'stone', capFrom: 0.8, rough: 2 },
    { cz: 13, n: 6, h: 16, rx: 12, rz: 5, key: 'red-sand', rough: 2 }] }],
  'sandhills-windmill': ['windmill', {}],
  'kachemak-spit': ['spit', {}],
};

// Lēʻahi is a tuff cone: a shield builder with a wide crater and the Waikīkī towers on its left.
const leahiExtra = (v, rng) => {
  for (let x = 30; x <= 90; x++) for (let z = 0; z < 19; z++) {
    const d = Math.hypot((x - 60) / 17, (z - 9) / 6);
    if (d < 1) for (let y = Math.round(5 + 3 * d); y <= 24; y++) set(v, x, y, z, 0);
  }
  mound(v, rng, { cx: 42, cz: 9, rx: 7, rz: 4, h: 6, a: 1, key: 'far-ochre', y0: topSolidY(v, 42, 9) - 1 }); // the Lēʻahi summit
  skyline(v, rng, { x0: 2, x1: 34, z0: 12, z1: 18, n: 7, hMin: 8, hMax: 22, keys: ['plaster', 'glass'], bands: ['glass', null] });
};

/** Far-volume origin in world blocks for a far volume of `size` (13 §3: past the −z edge, centered on the lot in x). */
export function farOrigin(size = FAR.size, worldSize = WORLD.size) {
  const s = WORLD.farScale;
  return { x: worldSize.x / 2 - (size.x * s) / 2, y: WORLD.groundY - s, z: -(size.z + FAR.gap) * s };
}

/**
 * The far scene for a place (13 §3, §5). {location: {landmark, seasons?}, seed, monthIndex?, worldSize?} →
 * {key, size, data, origin, scale}. Unknown landmark → an empty volume with only the ground plate.
 */
export function genFar({ location, seed = 0, monthIndex = 0, worldSize = WORLD.size }) {
  const key = location?.landmark ?? location?.key ?? null;
  const v = createVolume(FAR.size);
  const rng = createRng(seedFor(seed, 'far', key));
  const winter = [11, 0, 1].includes(((monthIndex % 12) + 12) % 12);
  const entry = LANDMARK_SHAPES[key];
  if (entry) {
    SHAPES[entry[0]](v, rng, entry[1], { winter });
    if (key === 'leahi') leahiExtra(v, rng);
  } else plate(v, 'grass');
  return { key, size: v.size, data: v.data, origin: farOrigin(v.size, worldSize), scale: WORLD.farScale };
}
