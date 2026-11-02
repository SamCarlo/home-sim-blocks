// homeblocks 10: apartment and condo buildings in blocks (13 §5): walk-ups, low-rises, towers, glass towers, townhomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS, byId } from '../../app/src/data/locations/index.js';
import { WORLD, VOX_BUILDING as VB } from '../../app/src/config.js';
import { createVolume, idx } from '../../app/src/world/volume.js';
import { genTerrain } from '../../app/src/world/genTerrain.js';
import { genNeighborhood } from '../../app/src/world/genNeighborhood.js';
import { voxBuilding, buildingWorldSize, buildingLayout } from '../../app/src/world/voxBuilding.js';
import { walkSearch } from '../../app/src/world/walk.js';
import { planBuilding, homeFloors, unitCell } from '../../app/src/phases/design/buildingPlan.js';

function build(loc, kind, seed, { floor = 'top', unit = 'last', plan = null } = {}) {
  plan ??= planBuilding({ style: loc.styleFamily, variant: loc.styleVariant, seed, kind, settlement: loc.settlement });
  const v = createVolume(buildingWorldSize(loc, kind, plan));
  genTerrain(v, { location: loc, seed });
  genNeighborhood(v, { location: loc, seed, homeKind: kind });
  const floors = homeFloors(plan);
  const f = floor === 'top' ? floors.at(-1) : floor;
  const u = unit === 'last' ? plan.unitsPerFloor - 1 : unit;
  return { v, plan, f, u, b: voxBuilding(v, { plan, floor: f, unit: u, seed }) };
}

/** Door reachable from the street through the entrance; every room reachable; unit box on the chosen floor/cell. */
function check({ v, plan, f, u, b }, tag) {
  const reach = walkSearch(v, b.exit);
  assert.ok(reach.has(idx(v, b.entrance.x, b.entrance.y, b.entrance.z)), `${tag}: entrance reachable from the street`);
  assert.ok(reach.has(idx(v, b.door.x, b.door.y, b.door.z)), `${tag}: unit door reachable from the street`);
  for (const r of b.unitRooms) {
    let ok = false;
    for (let x = r.box.x0; x <= r.box.x1 && !ok; x++) for (let z = r.box.z0; z <= r.box.z1 && !ok; z++) ok = reach.has(idx(v, x, r.box.y0, z));
    assert.ok(ok, `${tag}: ${r.type} reachable`);
  }
  assert.ok(b.path.length >= 2 && b.path[0].x === b.door.x && b.path.at(-1).z === b.exit.z, `${tag}: path door → exit`);
  const feet = WORLD.groundY + VB.storyH * (f - 1) + 1;
  assert.equal(b.unit.y0, plan.form === 'townhomes' ? WORLD.groundY + 1 : feet, `${tag}: unit on floor ${f}`);
  const L = buildingLayout(plan, { x: v.size.x >> 1, y: WORLD.groundY, z: v.size.z >> 1 });
  const cell = unitCell(plan, u);
  assert.equal(b.unit.x0, L.ux0 + cell.col * L.uw + 1, `${tag}: unit column ${cell.col}`);
  if (plan.rows === 2) assert.ok(cell.row === 0 ? b.unit.z1 === L.box.z1 - 1 : b.unit.z0 === L.box.z0 + 1, `${tag}: unit row ${cell.row}`);
  assert.ok(b.unit.x1 - b.unit.x0 >= 2 && b.unit.z1 - b.unit.z0 >= 2, `${tag}: unit at least 3 × 3`);
  assert.ok(b.info.box.x0 >= b.lotBox.x0 && b.info.box.x1 <= b.lotBox.x1, `${tag}: inside the lot`);
  assert.ok(b.info.top < v.size.y, `${tag}: never clipped`);
  assert.ok(b.windows.length > 0, `${tag}: unit has windows`);
}

test('all five forms generate and the unit is reachable through the core', () => {
  const seen = new Set();
  for (const loc of LOCATIONS) for (const kind of ['apartment', 'condo']) for (const seed of [1, 2]) {
    const r = build(loc, kind, seed);
    seen.add(r.plan.form);
    check(r, `${loc.id} ${kind} seed ${seed} ${r.plan.form}`);
  }
  assert.deepEqual([...seen].sort(), ['glass', 'lowrise', 'tower', 'townhomes', 'walkup']);
});

test('first floor, every unit cell of a two-row building, and a high tower floor', () => {
  const loc = byId.honolulu;
  const plan = planBuilding({ style: loc.styleFamily, variant: loc.styleVariant, seed: 1, kind: 'apartment', settlement: loc.settlement });
  assert.equal(plan.form, 'tower');
  const r = build(loc, 'apartment', 1);
  check(r, 'honolulu tower top floor');
  assert.ok(r.v.size.y >= WORLD.tallY && r.b.unit.y0 > 100, 'tall volume, high unit');
  const hilo = byId.hilo;
  const p2 = planBuilding({ style: hilo.styleFamily, variant: hilo.styleVariant, seed: 1, kind: 'condo', settlement: hilo.settlement });
  for (let u = 0; u < p2.unitsPerFloor; u++) check(build(hilo, 'condo', 1, { floor: homeFloors(p2)[0], unit: u }), `hilo condo unit ${u}`);
});

test('a row too wide for a side core gets a front stair tower', () => {
  const loc = byId.brooklyn;
  const base = planBuilding({ style: loc.styleFamily, variant: loc.styleVariant, seed: 1, kind: 'apartment', settlement: loc.settlement });
  const plan = { ...base, form: 'walkup', floors: 5, firstFloor: 1, groundUse: 'homes', podium: 0, cols: 8, rows: 1, unitsPerFloor: 8, unitW: 26 };
  const r = build(loc, 'apartment', 1, { plan, floor: 4, unit: 6 });
  assert.equal(r.b.info.core, 'front');
  check(r, 'brooklyn 8-wide walkup');
});

test('deterministic and a too-short volume throws', () => {
  const loc = byId.miami;
  const a = build(loc, 'condo', 3), b = build(loc, 'condo', 3);
  assert.deepEqual(a.b.path, b.b.path);
  assert.ok(Buffer.from(a.v.data).equals(Buffer.from(b.v.data)));
  const tall = planBuilding({ style: byId.honolulu.styleFamily, variant: byId.honolulu.styleVariant, seed: 1, kind: 'condo', settlement: 'big-city' });
  if (tall.floors > 12) assert.throws(() => voxBuilding(createVolume(WORLD.size), { plan: tall, floor: tall.floors, unit: 0 }), /buildingWorldSize/);
});
