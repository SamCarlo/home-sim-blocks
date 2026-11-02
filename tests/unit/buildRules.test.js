// homeblocks 17: building rules (world/buildRules.js) on the real voxHome contracts of a renter and an owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { voxHome } from '../../app/src/world/voxHome.js';
import { canEdit, hotbarFor, placeCell, protectedCells, REASONS } from '../../app/src/world/buildRules.js';
import { BLOCK, blockById } from '../../app/src/world/blocks.js';
import { get } from '../../app/src/world/volume.js';
import { byId } from '../../app/src/data/locations/index.js';
import { WORLD } from '../../app/src/config.js';

const apt = voxHome(buildSeed('life-month1-apartment', 0));
const house = voxHome(buildSeed('life-month1-house', 0));
const houseState = buildSeed('life-month1-house', 0);
const inBox = (b, c) => c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1 && c.z >= b.z0 && c.z <= b.z1;

/** An air cell inside box b that is not protected (and optionally a solid one). */
function findCell(w, b, want) {
  const prot = protectedCells(w);
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
    const id = get(w.volume, x, y, z);
    if (!prot.has(`${x},${y},${z}`) && want(id, y)) return { x, y, z };
  }
  return null;
}

test('buildRules: a renter is refused outside their unit and allowed inside it', () => {
  const unit = apt.unit;
  const inside = findCell(apt, unit, (id) => id === 0);
  assert.ok(inside, 'an air cell in the unit');
  assert.deepEqual(canEdit(apt, inside, 'place', BLOCK['planks-light'].id), { ok: true, reason: null });
  // The cell just past the unit's far wall, and a cell in the street, belong to someone else.
  const out = { x: unit.x1 + 2, y: unit.y0, z: unit.z0 };
  const r = canEdit(apt, out, 'place', BLOCK['planks-light'].id);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'outside');
  assert.equal(r.text, REASONS.outside);
  assert.match(r.text, /neighbor's/);
  assert.equal(canEdit(apt, { x: 0, y: WORLD.groundY, z: 0 }, 'break', 0).reason, 'outside');
});

test('buildRules: an owner can build and dig anywhere on the lot, up to build height', () => {
  const lot = house.property[0];
  const air = findCell(house, lot, (id, y) => id === 0 && y > WORLD.groundY);
  assert.ok(canEdit(house, air, 'place', BLOCK.glass.id).ok);
  const solid = findCell(house, lot, (id, y) => id !== 0 && blockById(id).group === 'ground' && id !== BLOCK.bedrock.id && y >= WORLD.groundY - 2);
  assert.ok(solid, 'a ground block on the lot');
  assert.ok(canEdit(house, solid, 'break', get(house.volume, solid.x, solid.y, solid.z)).ok);
  assert.equal(canEdit(house, { ...air, y: lot.y1 + 1 }, 'place', BLOCK.glass.id).reason, 'outside');
  assert.equal(canEdit(house, { x: lot.x1 + 3, y: air.y, z: lot.z0 }, 'place', BLOCK.glass.id).reason, 'outside');
});

test('buildRules: doors, mailbox, plant and animal spots and the path are protected', () => {
  const d = house.door;
  // The door blocks themselves sit one cell inside the step; find one.
  let doorCell = null;
  for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0], [0, 0]]) {
    const id = get(house.volume, d.x + dx, d.y, d.z + dz);
    if (id === BLOCK['door-lower'].id) doorCell = { x: d.x + dx, y: d.y, z: d.z + dz };
  }
  assert.ok(doorCell, 'house door block');
  assert.equal(canEdit(house, doorCell, 'break', BLOCK['door-lower'].id).reason, 'protected');
  assert.equal(canEdit(house, d, 'place', BLOCK.glass.id).reason, 'protected');
  const step = house.path[Math.floor(house.path.length / 2)];
  if (inBox(house.property[0], step)) assert.equal(canEdit(house, step, 'place', BLOCK.glass.id).reason, 'protected');
  const under = { ...house.path[0], y: house.path[0].y - 1 };
  assert.equal(canEdit(house, under, 'break', get(house.volume, under.x, under.y, under.z)).reason, 'protected');
  for (const c of [...house.plantSpots, ...house.animalSpots].filter((c) => inBox(house.property[0], c))) {
    assert.equal(canEdit(house, c, 'place', BLOCK.glass.id).reason, 'protected');
  }
  // A mailbox placed by the player is still protected once it's there.
  const fake = { property: [{ x0: 0, x1: 3, y0: 20, y1: 30, z0: 0, z1: 3 }], volume: null };
  assert.equal(canEdit(fake, { x: 1, y: 24, z: 1 }, 'break', BLOCK.mailbox.id).reason, 'protected');
  assert.equal(canEdit(fake, { x: 1, y: 24, z: 1 }, 'break', BLOCK['door-upper'].id).reason, 'protected');
});

test('buildRules: bedrock and depth limits, the player body, placeable ids', () => {
  const box = { property: [{ x0: 0, x1: 4, y0: 0, y1: 40, z0: 0, z1: 4 }], volume: null };
  assert.equal(canEdit(box, { x: 1, y: 0, z: 1 }, 'break', BLOCK.bedrock.id).reason, 'bedrock');
  assert.equal(canEdit(box, { x: 1, y: WORLD.groundY - WORLD.digDepth - 1, z: 1 }, 'break', BLOCK.stone.id).reason, 'too-deep');
  assert.ok(canEdit(box, { x: 1, y: WORLD.groundY - WORLD.digDepth, z: 1 }, 'break', BLOCK.stone.id).ok);
  assert.equal(canEdit(box, { x: 1, y: 24, z: 1 }, 'break', 0).reason, 'empty');
  const player = { x: 1.5, y: 24, z: 1.5 };
  assert.equal(canEdit(box, { x: 1, y: 25, z: 1 }, 'place', BLOCK.glass.id, { player }).reason, 'player');
  assert.ok(canEdit(box, { x: 2, y: 25, z: 1 }, 'place', BLOCK.glass.id, { player }).ok);
  assert.ok(canEdit(box, { x: 1, y: 25, z: 1 }, 'place', BLOCK.flowers.id, { player }).ok, 'non-solid flowers can go at your feet');
  assert.equal(canEdit(box, { x: 1, y: 30, z: 1 }, 'place', BLOCK.bedrock.id).reason, 'not-placeable');
  assert.equal(canEdit(box, { x: 1, y: 30, z: 1 }, 'place', BLOCK['door-lower'].id).reason, 'not-placeable');
  assert.equal(canEdit(box, { x: 1.5, y: 30, z: 1 }, 'place', BLOCK.glass.id).reason, 'outside');
  // Tinted style blocks are not `placeable` but the hotbar may place them.
  const loc = byId[houseState.home.locationId];
  const bar = hotbarFor(loc);
  assert.equal(canEdit(box, { x: 1, y: 30, z: 1 }, 'place', bar[0]).reason, 'not-placeable');
  assert.ok(canEdit(box, { x: 1, y: 30, z: 1 }, 'place', bar[0], { allowed: new Set(bar) }).ok);
});

test('buildRules: hotbar has 9 unique slots, style blocks first, and placeCell steps along the normal', () => {
  for (const id of Object.keys(byId)) {
    const bar = hotbarFor(byId[id]);
    assert.equal(bar.length, 9, id);
    assert.equal(new Set(bar).size, 9, id);
    assert.ok(bar.includes(BLOCK.glass.id) && bar.includes(BLOCK.flowers.id), id);
    assert.match(blockById(bar[0]).key, /^plaster-/, id);
  }
  assert.deepEqual(placeCell({ x: 3, y: 24, z: 5, normal: [0, 1, 0] }), { x: 3, y: 25, z: 5 });
  assert.deepEqual(placeCell({ x: 3, y: 24, z: 5, normal: [-1, 0, 0] }), { x: 2, y: 24, z: 5 });
});
