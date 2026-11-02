// homeblocks 07: neighborhood by settlement (13 §5). Tree canopies (and pine snow caps) from genTerrain may overhang the street band.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS, byId } from '../../app/src/data/locations/index.js';
import { WORLD, NEIGHBORHOOD } from '../../app/src/config.js';
import { BLOCK, blockById } from '../../app/src/world/blocks.js';
import { createVolume, get } from '../../app/src/world/volume.js';
import { genTerrain, lotBounds } from '../../app/src/world/genTerrain.js';
import { genNeighborhood, neighborSettlement, worldSizeFor } from '../../app/src/world/genNeighborhood.js';

function build(loc, { seed = 1, homeKind = 'house' } = {}) {
  const v = createVolume(worldSizeFor(loc, homeKind));
  genTerrain(v, { location: loc, seed });
  const n = genNeighborhood(v, { location: loc, seed, homeKind });
  return { v, n };
}

const STREET_FURNITURE = new Set(['metal', 'lamp', 'fence', 'mailbox'].map((k) => BLOCK[k].id));
const overlaps = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;

test('lot stays empty and the street band holds only street furniture', () => {
  for (const homeKind of ['house', 'apartment']) {
    for (const loc of LOCATIONS) {
      const { v, n } = build(loc, { homeKind });
      const { lot, street } = lotBounds(v.size);
      const G = WORLD.groundY;
      for (const nb of n.neighbors) {
        assert.ok(!overlaps(nb.rect, lot), `${loc.id} ${nb.kind} overlaps the lot`);
        assert.ok(!overlaps(nb.rect, street), `${loc.id} ${nb.kind} overlaps the street`);
        if (nb.box.y1) assert.ok(!overlaps(nb.box, lot) && !overlaps(nb.box, street), `${loc.id} ${nb.kind} roof reaches the lot/street`);
      }
      for (let y = G + 1; y < v.size.y; y++) {
        for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) assert.equal(get(v, x, y, z), 0, `${loc.id} lot block at ${x},${y},${z}`);
        for (let z = street.z0; z <= street.z1; z++) {
          for (let x = 0; x < v.size.x; x++) {
            const b = get(v, x, y, z);
            if (b !== 0 && b !== BLOCK.water.id && blockById(b).group !== 'nature' && b !== BLOCK.snow.id) assert.ok(STREET_FURNITURE.has(b), `${loc.id} block ${b} above the street at ${x},${y},${z}`);
          }
        }
      }
      assert.ok(n.mailbox, `${loc.id} has a mailbox`);
      assert.ok(n.lamps.length >= 2, `${loc.id} has streetlamps`);
    }
  }
});

test('counts per settlement are in range', () => {
  const inRange = (val, [a, b], msg) => assert.ok(val >= a && val <= b, `${msg}: ${val} not in [${a}, ${b}]`);
  for (const homeKind of ['house', 'condo']) {
    for (const loc of LOCATIONS) {
      for (const seed of [1, 2, 3]) {
        const { n } = build(loc, { seed, homeKind });
        const c = (k) => n.counts[k] ?? 0, cfg = NEIGHBORHOOD[n.settlement], at = `${loc.id} ${homeKind} seed ${seed}`;
        if (n.settlement === 'rural') {
          inRange(c('farmhouse'), cfg.farmhouses, `${at} farmhouses`);
          inRange(c('field'), [1, cfg.fields[1]], `${at} fields`);
        } else if (n.settlement === 'small-town' || n.settlement === 'suburb') {
          inRange(c('house'), [4, 8], `${at} houses`);
        } else if (n.settlement === 'big-city') {
          inRange(c('tower'), cfg.towers, `${at} towers`);
          assert.equal(c('house') + c('field'), 0);
        } else {
          inRange(c('block'), cfg.blocks, `${at} floor blocks`);
          inRange(c('row'), [1, cfg.rows[1]], `${at} row houses`);
        }
      }
    }
  }
});

test('rural farmhouses are far; big-city towers are tall', () => {
  const { v, n } = build(byId.pahoa);
  const { lot } = lotBounds(v.size);
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  for (const f of n.neighbors.filter((x) => x.kind === 'farmhouse')) {
    assert.ok(Math.hypot((f.rect.x0 + f.rect.x1) / 2 - cx, (f.rect.z0 + f.rect.z1) / 2 - cz) >= NEIGHBORHOOD.rural.farMin);
  }
  const city = build(byId.brooklyn);
  assert.equal(city.v.size.y, WORLD.tallY);
  const tallest = Math.max(...city.n.neighbors.map((x) => x.box.y1));
  assert.ok(tallest > 96, `a tower rises above the normal world height (${tallest})`);
  assert.ok(tallest < WORLD.tallY);
});

test('apartments and condos step the settlement up', () => {
  assert.equal(neighborSettlement('rural', 'apartment'), 'small-town');
  assert.equal(neighborSettlement('suburb', 'condo'), 'small-city');
  assert.equal(neighborSettlement('mid-city', 'apartment'), 'big-city');
  assert.equal(neighborSettlement('big-city', 'condo'), 'big-city');
  assert.equal(neighborSettlement('suburb', 'house'), 'suburb');
  assert.equal(neighborSettlement('suburb', 'shared'), 'suburb');
  assert.equal(neighborSettlement('rural', 'build'), 'rural');
});

test('deterministic per seed', () => {
  for (const id of ['katy', 'hilo', 'pahoa', 'brooklyn']) {
    const a = build(byId[id], { seed: 7 }), b = build(byId[id], { seed: 7 }), c = build(byId[id], { seed: 8 });
    assert.deepEqual(a.v.data, b.v.data, `${id} same seed, same world`);
    assert.notDeepEqual(a.v.data, c.v.data, `${id} another seed changes it`);
  }
});

test('full terrain + neighborhood stays under 500 ms', () => {
  let worst = 0, worstId = '';
  for (const loc of LOCATIONS) {
    for (const homeKind of ['house', 'apartment']) {
      const t0 = performance.now();
      build(loc, { homeKind });
      const ms = performance.now() - t0;
      if (ms > worst) { worst = ms; worstId = `${loc.id} ${homeKind}`; }
    }
  }
  console.log(`terrain + neighborhood worst: ${worstId} ${worst.toFixed(1)} ms`);
  assert.ok(worst < 500, `${worstId} took ${worst.toFixed(0)} ms`);
});
