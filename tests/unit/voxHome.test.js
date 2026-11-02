// homeblocks 12: furniture (world/voxInteriors.js) and the voxel home contract (world/voxHome.js) over the five life seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { voxHome, homeKeyFor } from '../../app/src/world/voxHome.js';
import { furnish } from '../../app/src/world/voxInteriors.js';
import { createVolume, fillBox, hollowBox, get, set, idx } from '../../app/src/world/volume.js';
import { BLOCK, isSolid } from '../../app/src/world/blocks.js';
import { canStand, canWalk, walkSearch } from '../../app/src/world/walk.js';
import { VOX_INTERIORS } from '../../app/src/config.js';

const KINDS = ['apartment', 'condo', 'house', 'shared', 'build'];
const inBox = (b, c) => c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1 && c.z >= b.z0 && c.z <= b.z1;
const worlds = {};
const states = {};
for (const k of KINDS) {
  states[k] = buildSeed(`life-month1-${k}`, 0);
  const t0 = Date.now();
  worlds[k] = voxHome(states[k]);
  worlds[k].ms = Date.now() - t0;
}

test('voxHome: the 13 §6 contract is complete for all five kinds', () => {
  for (const k of KINDS) {
    const w = worlds[k];
    for (const key of ['volume', 'far', 'homeKey', 'door', 'exit', 'path', 'spawn', 'plantSpots', 'animalSpots', 'windows', 'property', 'unit', 'info']) {
      assert.ok(key in w, `${k}: ${key}`);
    }
    assert.equal(w.volume.data.length, w.volume.size.x * w.volume.size.y * w.volume.size.z, `${k}: volume`);
    assert.equal(w.far.data.length, w.far.size.x * w.far.size.y * w.far.size.z, `${k}: far`);
    for (const f of ['origin', 'scale']) assert.ok(w.far[f] != null, `${k}: far.${f}`);
    assert.ok(w.homeKey.startsWith(`${k}:`), `${k}: homeKey ${w.homeKey}`);
    assert.ok(w.path.length >= 2 && w.windows.length > 0 && w.plantSpots.length > 0, `${k}: path/windows/plant spots`);
    assert.ok(w.windows.every((i) => [BLOCK.glass.id, BLOCK['lit-glass'].id].includes(w.volume.data[i])), `${k}: windows are glass`);
    assert.equal(w.info.kind, k);
    assert.ok(w.info.blocks > w.info.homeBlocks && w.info.homeBlocks > 0, `${k}: info counts`);
    assert.equal(w.unit === null, k === 'house' || k === 'build', `${k}: unit only for renters/condos`);
    assert.ok(w.ms < VOX_INTERIORS.maxMs, `${k}: ${w.ms} ms`);
  }
});

test('voxHome: path walkable, spawn inside by the door, property holds spawn and door', () => {
  for (const k of KINDS) {
    const w = worlds[k], v = w.volume, s = w.spawn;
    assert.ok(canWalk(v, w.door, w.exit), `${k}: door → exit`);
    for (const p of w.path) assert.ok(canStand(v, p.x, p.y, p.z), `${k}: waypoint ${JSON.stringify(p)}`);
    assert.equal(get(v, s.x, s.y, s.z), 0, `${k}: spawn is air`);
    assert.ok(isSolid(get(v, s.x, s.y - 1, s.z)), `${k}: floor under spawn`);
    assert.ok(Number.isFinite(s.yaw), `${k}: yaw`);
    // Shared renters start just inside their own room's door (their property); everyone else inside the home's door.
    if (k === 'shared') assert.ok(inBox(w.unit, s), 'shared: spawn in the student\'s room');
    else assert.ok(Math.abs(s.x - w.door.x) + Math.abs(s.z - w.door.z) <= 3, `${k}: spawn by the door`);
    assert.ok(w.property.some((b) => inBox(b, s)), `${k}: property contains spawn`);
    assert.ok(w.property.some((b) => inBox(b, w.door)), `${k}: property contains the door`);
    // Every room still reachable from the door after furnishing.
    const reach = walkSearch(v, w.door);
    for (const r of w.rooms.filter((r) => r.type !== 'lanai')) {
      let ok = false;
      for (let x = r.box.x0; x <= r.box.x1 && !ok; x++) for (let z = r.box.z0; z <= r.box.z1 && !ok; z++) ok = reach.has(idx(v, x, r.box.y0, z));
      assert.ok(ok, `${k}: ${r.type} reachable from the door`);
    }
  }
});

test('voxHome: furnished rooms (beds, kitchen, bath fixtures, a lamp each) and plants', () => {
  const count = (w, key) => w.furniture.pieces.filter((p) => p.key === key).length;
  for (const k of KINDS) {
    const w = worlds[k];
    assert.ok(count(w, 'bed') >= 1, `${k}: a bed`);
    assert.ok(count(w, 'counter') >= 1, `${k}: a counter`);
    assert.ok(w.furniture.lamps.length >= 1, `${k}: lamps`);
    const potted = (states[k].home.plants ?? []).filter((p) => p.kind === 'potted' && p.alive !== false);
    for (const p of w.plants.filter((q) => q.kind === 'potted')) assert.equal(get(w.volume, p.x, p.y, p.z), BLOCK['potted-plant'].id, `${k}: pot ${p.id}`);
    assert.equal(w.plants.filter((q) => q.kind === 'potted').length, potted.length, `${k}: every pot placed`);
  }
  const h = worlds.house;
  assert.ok(count(h, 'tub') >= 1 && count(h, 'toilet') >= 1, 'house: bath fixtures');
});

test('voxHome: homeKey stable across calls, different across kinds; deterministic world', () => {
  const keys = new Set(KINDS.map((k) => worlds[k].homeKey));
  assert.equal(keys.size, KINDS.length);
  for (const k of ['house', 'apartment']) {
    assert.equal(homeKeyFor(states[k]), worlds[k].homeKey);
    const again = voxHome(states[k]);
    assert.equal(again.homeKey, worlds[k].homeKey);
    assert.deepEqual(again.volume.data, worlds[k].volume.data, `${k}: same blocks`);
  }
  // Plants and animals don't change the key; the home's own picks do.
  const s = structuredClone(states.house);
  s.home.plants = [];
  assert.equal(homeKeyFor(s), worlds.house.homeKey);
  s.home.house.seed = (s.home.house.seed ?? 0) + 1;
  assert.notEqual(homeKeyFor(s), worlds.house.homeKey);
});

test('furnish: never blocks a doorway and keeps the floor in one piece', () => {
  const v = createVolume({ x: 12, y: 8, z: 12 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 11, y1: 0, z1: 11 }, BLOCK.stone.id);
  hollowBox(v, { x0: 2, y0: 0, z0: 2, x1: 6, y1: 4, z1: 6 }, BLOCK.brick.id, { floorId: BLOCK.slab.id, ceilId: BLOCK.slab.id });
  set(v, 4, 1, 6, BLOCK['door-lower'].id); set(v, 4, 2, 6, BLOCK['door-upper'].id);
  set(v, 2, 1, 4, 0); set(v, 2, 2, 4, 0); // an opening in the west wall
  const box = { x0: 3, x1: 5, z0: 3, z1: 5, y0: 1, y1: 3 };
  for (const type of ['bedroom', 'kitchen', 'living', 'bathroom']) {
    const w = { size: v.size, data: v.data.slice() };
    const out = furnish(w, [{ type, box }], { seed: 3 });
    assert.ok(out.pieces.length + out.lamps.length > 0, `${type}: something placed`);
    assert.equal(get(w, 4, 1, 5), 0, `${type}: cell inside the door`);
    assert.equal(get(w, 3, 1, 4), 0, `${type}: cell inside the opening`);
    assert.ok(canWalk(w, { x: 4, y: 1, z: 7 }, { x: 1, y: 1, z: 4 }), `${type}: door to opening through the room`);
  }
});
