// homeblocks 09: the student's house and shared house in blocks (13 §3, §5), and walking over a volume (world/walk.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS, byId } from '../../app/src/data/locations/index.js';
import { WORLD } from '../../app/src/config.js';
import { BLOCK } from '../../app/src/world/blocks.js';
import { createVolume, fillBox, get, idx, set } from '../../app/src/world/volume.js';
import { genTerrain } from '../../app/src/world/genTerrain.js';
import { genNeighborhood, worldSizeFor } from '../../app/src/world/genNeighborhood.js';
import { voxHouse, paletteBlocks } from '../../app/src/world/voxHouse.js';
import { canStand, walkSearch, walkPath, canWalk } from '../../app/src/world/walk.js';
import { planHouse } from '../../app/src/phases/design/housePlan.js';
import { SHARED_BEDROOMS } from '../../app/src/phases/design/sharedModel.js';

const EXTRAS = { gardenBeds: 3, fruitTrees: 2, coop: true };

function build(loc, { seed = 1, variant = 'house', extras = EXTRAS, palette = null } = {}) {
  const v = createVolume(worldSizeFor(loc, 'house'));
  genTerrain(v, { location: loc, seed });
  genNeighborhood(v, { location: loc, seed, homeKind: 'house' });
  const plan = planHouse({ style: loc.styleFamily, styleVariant: loc.styleVariant, seed, variant, palette,
    bedrooms: variant === 'shared' ? SHARED_BEDROOMS : null });
  const h = voxHouse(v, { plan, extras, seed });
  return { v, plan, h };
}

/** Every room has a standing cell the street can walk to. */
function check(loc, opts) {
  const { v, plan, h } = build(loc, opts);
  const street = { x: h.exit.x, y: h.exit.y, z: h.exit.z };
  const reach = walkSearch(v, street);
  const tag = `${loc.id} ${opts.variant ?? 'house'} seed ${opts.seed}`;
  assert.ok(reach.size > 50, `${tag}: the street is walkable`);
  assert.ok(reach.has(idx(v, h.door.x, h.door.y, h.door.z)), `${tag}: door reachable from the street`);
  for (const r of h.rooms) {
    let ok = false;
    for (let x = r.box.x0; x <= r.box.x1 && !ok; x++) for (let z = r.box.z0; z <= r.box.z1 && !ok; z++) ok = reach.has(idx(v, x, r.box.y0, z));
    assert.ok(ok, `${tag}: ${r.type} at y ${r.box.y0} reachable from the door`);
    assert.ok(r.box.x1 - r.box.x0 >= 2 && r.box.z1 - r.box.z0 >= 2, `${tag}: rooms are at least 3 × 3`);
  }
  const ratio = h.info.sqft / plan.sqft;
  assert.ok(Math.abs(ratio - 1) <= 0.25, `${tag}: floor area ${h.info.sqft} vs plan ${plan.sqft}`);
  return { v, plan, h };
}

test('walk: stand, step up one, not two, never on a fence', () => {
  const v = createVolume({ x: 16, y: 8, z: 4 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 15, y1: 1, z1: 3 }, BLOCK.stone.id);
  assert.ok(canStand(v, 1, 2, 1));
  fillBox(v, { x0: 4, y0: 2, z0: 0, x1: 4, y1: 2, z1: 3 }, BLOCK.stone.id); // a one-block step
  assert.ok(canWalk(v, { x: 1, y: 2, z: 1 }, { x: 6, y: 2, z: 1 }));
  fillBox(v, { x0: 8, y0: 2, z0: 0, x1: 8, y1: 3, z1: 3 }, BLOCK.stone.id); // a two-block wall
  assert.ok(!canWalk(v, { x: 1, y: 2, z: 1 }, { x: 10, y: 2, z: 1 }));
  set(v, 8, 3, 2, 0); set(v, 8, 2, 2, BLOCK.fence.id); // a fence in the gap is not a step
  assert.ok(!canWalk(v, { x: 1, y: 2, z: 1 }, { x: 10, y: 2, z: 1 }));
  set(v, 8, 2, 2, BLOCK['door-lower'].id); set(v, 8, 3, 2, BLOCK['door-upper'].id); // doors are walked through
  const path = walkPath(v, { x: 1, y: 2, z: 1 }, { x: 10, y: 2, z: 1 });
  assert.ok(path && path[0].x === 1 && path.at(-1).x === 10);
});

test('voxHouse: door reachable from the street, every room from the door, area within 25 %', () => {
  for (const loc of LOCATIONS) for (const variant of ['house', 'shared']) check(loc, { seed: 1, variant });
  for (const id of ['katy', 'hilo', 'brooklyn', 'clarksdale', 'yellow-pine', 'chattanooga']) for (const seed of [2, 3]) {
    check(byId[id], { seed, variant: 'house' });
    check(byId[id], { seed, variant: 'shared' });
  }
});

test('voxHouse: deterministic', () => {
  const a = build(byId.katy, { seed: 4 }), b = build(byId.katy, { seed: 4 });
  assert.deepEqual(a.v.data, b.v.data);
  assert.deepEqual(a.h.path, b.h.path);
  assert.deepEqual(a.h.rooms, b.h.rooms);
});

test('voxHouse: matches the plan (stories, walls in the style, windows, door, roof above the walls)', () => {
  const { v, plan, h } = build(byId.hilo, { seed: 2, palette: 0 });
  const main = h.parts[0], ids = paletteBlocks('hawaii-plantation', null, 0);
  assert.equal(main.stories, plan.main.stories);
  assert.equal(get(v, main.x0, WORLD.groundY + 2, (main.z0 + main.z1) >> 1) === ids.wall
    || get(v, main.x0, WORLD.groundY + 2, (main.z0 + main.z1) >> 1) === BLOCK.glass.id, true);
  assert.equal(get(v, h.door.x, h.door.y, h.door.z - 1), BLOCK['door-lower'].id);
  assert.ok(h.windows.length >= 4 && h.windows.every((i) => v.data[i] === BLOCK.glass.id));
  assert.ok(main.roofTop > main.top, 'a roof sits on the walls');
  assert.equal(h.parts.length, 1 + plan.wings.length + (plan.garage === 'garage-2' ? 1 : 0));
  const types = h.rooms.map((r) => r.type);
  assert.ok(types.includes('living') && types.includes('bedroom'));
  assert.ok(h.lotBox.y0 < WORLD.groundY && h.lotBox.y1 > main.roofTop);
});

test('voxHouse: two-story houses have stairs; a two-car garage in Katy', () => {
  const { v, h } = build(byId.katy, { seed: 1 });
  assert.ok(h.info.stories >= 2);
  assert.ok(h.rooms.some((r) => r.box.y0 > WORLD.groundY + 4), 'rooms upstairs');
  const stair = BLOCK['planks-dark'].id;
  assert.ok(v.data.some((id, i) => id === stair), 'stair blocks');
  assert.ok(h.parts.some((p) => p.kind === 'garage'));
});

test('voxHouse: extras appear only when set', () => {
  const count = (v, key) => v.data.reduce((n, id) => n + (id === BLOCK[key].id), 0);
  const loc = byId.hilo;
  const without = build(loc, { seed: 2, extras: {} });
  const withAll = build(loc, { seed: 2, extras: EXTRAS });
  assert.equal(count(without.v, 'coop'), 0);
  assert.ok(count(withAll.v, 'coop') > 0);
  assert.ok(count(withAll.v, 'crops') - count(without.v, 'crops') >= 3 * 6, 'three garden beds of crops');
  assert.equal(withAll.h.plantSpots.length, 4); // three beds + the porch
  assert.equal(without.h.plantSpots.length, 1);
  const trunks = (v) => count(v, 'trunk');
  assert.ok(trunks(withAll.v) > trunks(without.v), 'fruit trees');
  assert.equal(withAll.h.animalSpots.length, 3);
});

test('voxHouse: other palettes use the closest-colored style blocks', () => {
  const p0 = paletteBlocks('hawaii-plantation', null, 0), p1 = paletteBlocks('hawaii-plantation', null, 1);
  assert.notEqual(p0.roof, p1.roof);
  assert.ok(BLOCK[Object.values(BLOCK).find((b) => b.id === p1.roof).key].key.startsWith('roof-'));
});
