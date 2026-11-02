// homeblocks 06: terrain and nature by biome (13 §5, 08 §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVolume, get } from '../../app/src/world/volume.js';
import { BLOCK } from '../../app/src/world/blocks.js';
import { genTerrain, BIOME_LOOK, isSnowMonth, lotBounds } from '../../app/src/world/genTerrain.js';
import { treeShape, TREE_KINDS } from '../../app/src/world/trees.js';
import { createRng } from '../../app/src/util/rng.js';
import { LOCATIONS, byId } from '../../app/src/data/locations/index.js';
import { BIOMES } from '../../app/src/data/enums.js';
import { WORLD } from '../../app/src/config.js';

const id = (k) => BLOCK[k].id;
const hash = (data) => { let h = 0x811c9dc5; for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193); return h >>> 0; };
const gen = (loc, monthIndex = 6, seed = 1) => { const v = createVolume(); return { v, r: genTerrain(v, { location: loc, monthIndex, seed }) }; };
const G = WORLD.groundY;

test('same seed → same volume; another seed differs; full volume under 300 ms', () => {
  const t0 = performance.now();
  const a = gen(byId.pahoa, 0, 7);
  const ms = performance.now() - t0;
  console.log(`genTerrain full ${WORLD.size.x}×${WORLD.size.y}×${WORLD.size.z} (Pāhoa): ${ms.toFixed(1)} ms`);
  assert.ok(ms < 300, `took ${ms} ms`);
  assert.equal(hash(gen(byId.pahoa, 0, 7).v.data), hash(a.v.data));
  assert.notEqual(hash(gen(byId.pahoa, 0, 8).v.data), hash(a.v.data));
});

test('every location: lot and street flat at groundY, no trees on them, bedrock at y 0', () => {
  for (const loc of LOCATIONS) {
    const { v, r } = gen(loc, 0);
    const { lot, street } = lotBounds(v.size);
    for (let z = lot.z0; z <= street.z1; z++) {
      for (let x = lot.x0; x <= lot.x1; x++) {
        assert.equal(r.heightAt(x, z), G, `${loc.id} (${x},${z})`);
        assert.equal(get(v, x, G + 1, z), 0, `${loc.id} something above the lot at (${x},${z})`);
      }
    }
    for (let x = 0; x < v.size.x; x += 7) assert.equal(get(v, x, G + 1, street.z0 + 3), 0, `${loc.id} street (${x})`);
    assert.equal(get(v, 5, 0, 5), id('bedrock'));
    assert.ok(r.treeCount > 0, `${loc.id} has trees`);
  }
});

test('each of the 17 biomes produces its signature top block', () => {
  assert.deepEqual(Object.keys(BIOME_LOOK).sort(), [...BIOMES].sort());
  for (const biome of BIOMES) {
    const loc = { id: `test-${biome}`, biome, seasons: { snowMonths: [] }, hazards: [] };
    const { v, r } = gen(loc, 6);
    const want = id(BIOME_LOOK[biome].top);
    let n = 0;
    for (let z = 0; z < v.size.z; z += 2) for (let x = 40; x < v.size.x; x += 2) if (get(v, x, r.heightAt(x, z), z) === want) n++;
    assert.ok(n > 200, `${biome}: ${BIOME_LOOK[biome].top} on ${n} sampled columns`);
  }
});

test('lava rock in Pāhoa, water on −X for coastal and lake places', () => {
  const count = (v, key) => v.data.reduce((s, b) => s + (b === id(key) ? 1 : 0), 0);
  assert.ok(count(gen(byId.pahoa).v, 'lava-rock') > 50);
  assert.equal(count(gen(byId.katy).v, 'lava-rock'), 0);
  for (const locId of ['honolulu', 'miami', 'homer', 'marquette', 'halifax']) {
    const { v, r } = gen(byId[locId]);
    assert.equal(r.water, true, locId);
    assert.equal(get(v, 3, G - 1, 64), id('water'), `${locId} water at the −X edge`);
  }
  assert.equal(gen(byId.katy).r.water, false);
});

test('snow only in snowy months: ground, bare oaks, frozen lake', () => {
  const snowCount = (v) => v.data.reduce((s, b) => s + (b === id('snow') ? 1 : 0), 0);
  const jan = gen(byId.montpelier, 0), jul = gen(byId.montpelier, 6);
  assert.equal(jan.r.snow, true);
  assert.equal(jul.r.snow, false);
  assert.ok(snowCount(jan.v) > 5000);
  assert.equal(snowCount(jul.v), 0);
  assert.equal(snowCount(gen(byId.pahoa, 0).v), 0, 'Hawaiʻi stays green');
  assert.equal(get(gen(byId.marquette, 0).v, 3, G - 1, 64), id('ice'));
  assert.equal(isSnowMonth(byId.montpelier, 12), true, 'month index wraps by year');
  assert.equal(isSnowMonth(byId.montpelier, 6), false);
});

test('tree shapes: every kind, wilted and bare options', () => {
  for (const kind of TREE_KINDS) {
    const cells = treeShape(kind, createRng(3));
    assert.ok(cells.length >= 2, kind);
    for (const [, , , key] of cells) assert.ok(BLOCK[key], `${kind}: ${key}`);
    const wilted = treeShape(kind, createRng(3), { wilted: true });
    assert.ok(!wilted.some((c) => ['leaves', 'pine-leaves', 'palm-leaves', 'lehua-leaves'].includes(c[3])), `${kind} wilted`);
  }
  assert.ok(treeShape('ohia', createRng(1)).some((c) => c[3] === 'lehua-leaves'), 'ʻōhiʻa has red blossoms');
  assert.ok(!treeShape('oak', createRng(1), { bare: true }).some((c) => c[3] === 'leaves'), 'bare oak');
  assert.ok(treeShape('pine', createRng(1), { snowCap: true }).some((c) => c[3] === 'snow'), 'snow-capped pine');
  assert.throws(() => treeShape('baobab', createRng(1)));
});
