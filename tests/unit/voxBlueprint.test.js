// homeblocks 11: a student's blueprint build in blocks (13 §5): doors on walls, every room reachable, rooms preserved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { byId } from '../../app/src/data/locations/index.js';
import { BLOCK } from '../../app/src/world/blocks.js';
import { createVolume, get, idx } from '../../app/src/world/volume.js';
import { genTerrain } from '../../app/src/world/genTerrain.js';
import { genNeighborhood, worldSizeFor } from '../../app/src/world/genNeighborhood.js';
import { voxBlueprint } from '../../app/src/world/voxBlueprint.js';
import { walkSearch } from '../../app/src/world/walk.js';
import { lotOf } from '../../app/src/phases/design/blueprint/model.js';
import { TEMPLATES, TEMPLATE_IDS, templateBlueprint } from '../../app/src/phases/design/blueprint/templates.js';
import { addYardItem, setFence } from '../../app/src/phases/design/blueprint/yard.js';

const YARD = ['garden-bed', 'garden-bed', 'fruit-tree', 'coop', 'driveway', 'patio', 'rain-garden'];

function build(locId, template, { yard = true, seed = 1 } = {}) {
  const loc = byId[locId];
  let bp = templateBlueprint(template, lotOf(loc));
  assert.ok(bp, `${template} fits ${locId}`);
  if (yard) {
    for (const k of YARD) bp = addYardItem(bp, k);
    bp = { ...setFence(bp, true), solarKw: 4, catchmentGallons: 10000 };
  }
  const v = createVolume(worldSizeFor(loc, 'house'));
  genTerrain(v, { location: loc, seed });
  genNeighborhood(v, { location: loc, seed, homeKind: 'house' });
  return { v, bp, r: voxBlueprint(v, { bp, styleKey: loc.styleFamily, variant: loc.styleVariant, seed }) };
}

const onEdge = (box, x, z) => ((x === box.x0 - 1 || x === box.x1 + 1) && z >= box.z0 - 1 && z <= box.z1 + 1)
  || ((z === box.z0 - 1 || z === box.z1 + 1) && x >= box.x0 - 1 && x <= box.x1 + 1);

for (const id of TEMPLATE_IDS) {
  test(`blueprint ${id} in blocks: rooms, doors, reachability (Pāhoa, Katy)`, () => {
    assert.ok(TEMPLATES[id]);
    for (const loc of ['pahoa', 'katy']) {
      const { v, bp, r } = build(loc, id);
      const tag = `${loc} ${id}`;
      assert.equal(r.rooms.length, bp.rooms.length, `${tag}: room count`);
      assert.deepEqual(r.rooms.map((rm) => rm.type), bp.rooms.map((rm) => rm.type), `${tag}: room types in order`);
      const roomOf = Object.fromEntries(r.rooms.map((rm) => [rm.id, rm]));
      const lanai = (rid) => bp.rooms.find((rm) => rm.id === rid)?.type === 'lanai';
      for (const op of bp.openings.filter((o) => o.kind === 'door')) {
        const placed = r.info.doors.find((d) => d.id === op.id);
        assert.ok(placed, `${tag}: door ${op.id} placed`);
        if (lanai(op.roomA) && (!op.roomB || lanai(op.roomB))) continue; // an open lānai edge has no wall
        assert.equal(get(v, placed.x, placed.y, placed.z), BLOCK['door-lower'].id, `${tag}: ${op.id} is a door block`);
        assert.equal(get(v, placed.x, placed.y + 1, placed.z), BLOCK['door-upper'].id, `${tag}: ${op.id} upper half`);
        assert.ok(onEdge(roomOf[op.roomA].box, placed.x, placed.z), `${tag}: ${op.id} sits on ${op.roomA}'s wall`);
        if (op.roomB) assert.ok(onEdge(roomOf[op.roomB].box, placed.x, placed.z), `${tag}: ${op.id} sits on ${op.roomB}'s wall`);
      }
      const reach = walkSearch(v, r.door);
      assert.ok(reach.has(idx(v, r.exit.x, r.exit.y, r.exit.z)), `${tag}: the street is reachable from the front door`);
      for (const rm of r.rooms) {
        let ok = false;
        for (let x = rm.box.x0; x <= rm.box.x1 && !ok; x++) for (let z = rm.box.z0; z <= rm.box.z1 && !ok; z++) ok = reach.has(idx(v, x, rm.box.y0, z));
        assert.ok(ok, `${tag}: ${rm.type} ${rm.id} reachable from the front door`);
        assert.ok(rm.box.x1 - rm.box.x0 >= 2 && rm.box.z1 - rm.box.z0 >= 2, `${tag}: ${rm.id} at least 3 × 3 inside`);
      }
      assert.equal(r.windows.length >= bp.openings.filter((o) => o.kind === 'window').length, true, `${tag}: every window has glass`);
      for (const w of r.windows) assert.equal(v.data[w], BLOCK.glass.id);
      assert.ok(r.path.length >= 2);
    }
  });
}

test('blueprint yard, catchment and solar become blocks; builds are deterministic', () => {
  const { v, r } = build('pahoa', 'family');
  const count = (key) => { let n = 0; for (const b of v.data) if (b === BLOCK[key].id) n++; return n; };
  for (const key of ['crops', 'coop', 'catchment-tank', 'solar-panel', 'fence']) assert.ok(count(key) > 0, `${key} drawn`);
  assert.ok(r.plantSpots.length >= 3 && r.animalSpots.length >= 2);
  const again = build('pahoa', 'family');
  assert.deepEqual(Buffer.from(again.v.data).equals(Buffer.from(v.data)), true, 'same blueprint + seed → same blocks');
  const bare = build('pahoa', 'tiny', { yard: false });
  let tanks = 0;
  for (const b of bare.v.data) if (b === BLOCK['catchment-tank'].id) tanks++;
  assert.equal(tanks, 0, 'no tank without catchment');
});
