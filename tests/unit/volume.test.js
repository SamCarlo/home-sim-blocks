// World volume and edit diffs (13 §3, §7, task homeblocks 04).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WORLD } from '../../app/src/config.js';
import { createRng } from '../../app/src/util/rng.js';
import { BLOCK } from '../../app/src/world/blocks.js';
import {
  createVolume, idx, coords, get, set, fillBox, hollowBox, line, column, replace, topSolidY, clone, ftToBlocks,
} from '../../app/src/world/volume.js';
import { diff, apply, pack, unpack, rebase, countEdits } from '../../app/src/world/edits.js';

const STONE = BLOCK.stone.id, DIRT = BLOCK.dirt.id, GLASS = BLOCK.glass.id, PLANKS = BLOCK['planks-light'].id;

/** n distinct seeded edits on a WORLD-sized volume (ids 1–98). */
function randomEdits(n, seed = 42) {
  const rng = createRng(seed);
  const total = WORLD.size.x * WORLD.size.y * WORLD.size.z;
  const m = new Map();
  while (m.size < n) m.set(rng.int(0, total - 1), rng.int(1, 98));
  return m;
}

test('WORLD config has the 13 §3/§7/§9 numbers', () => {
  assert.deepEqual(WORLD.size, { x: 128, y: 96, z: 128 });
  assert.equal(WORLD.tallY, 160);
  assert.equal(WORLD.groundY, 24);
  assert.equal(WORLD.farScale, 4);
  assert.equal(WORLD.maxEdits, 20000);
  assert.equal(WORLD.digDepth, 4);
  assert.equal(WORLD.almostFullPct, 0.9);
  assert.ok(WORLD.buildHeight > 0);
});

test('createVolume, idx and coords follow index = x + X * (z + Z * y)', () => {
  const v = createVolume();
  assert.equal(v.data.length, 128 * 96 * 128);
  assert.ok(v.data.every((b) => b === 0));
  assert.equal(idx(v, 3, 5, 7), 3 + 128 * (7 + 128 * 5));
  assert.deepEqual(coords(v, idx(v, 3, 5, 7)), { x: 3, y: 5, z: 7 });
  assert.throws(() => createVolume({ x: 0, y: 1, z: 1 }));
});

test('set ignores out-of-bounds cells; get returns air there', () => {
  const v = createVolume({ x: 4, y: 4, z: 4 });
  for (const [x, y, z] of [[-1, 0, 0], [4, 0, 0], [0, -1, 0], [0, 4, 0], [0, 0, 4], [0.5, 0, 0], [NaN, 0, 0]]) {
    assert.equal(set(v, x, y, z, STONE), false);
  }
  assert.ok(v.data.every((b) => b === 0));
  assert.equal(set(v, 3, 3, 3, STONE), true);
  assert.equal(get(v, 3, 3, 3), STONE);
  assert.equal(get(v, 9, 9, 9), 0);
});

test('fillBox clips, accepts reversed corners and counts cells', () => {
  const v = createVolume({ x: 8, y: 8, z: 8 });
  assert.equal(fillBox(v, { x0: 2, x1: 0, y0: 0, y1: 1, z0: 0, z1: 0 }, DIRT), 6);
  assert.equal(get(v, 1, 1, 0), DIRT);
  assert.equal(fillBox(v, { x0: 6, x1: 20, y0: 0, y1: 0, z0: 0, z1: 0 }, STONE), 2);
  assert.equal(fillBox(v, { x0: 20, x1: 30, y0: 0, y1: 0, z0: 0, z1: 0 }, STONE), 0);
});

test('hollowBox makes walls, floor, ceiling and an air interior', () => {
  const v = createVolume({ x: 10, y: 10, z: 10 });
  fillBox(v, { x0: 0, x1: 9, y0: 0, y1: 9, z0: 0, z1: 9 }, DIRT);
  hollowBox(v, { x0: 1, x1: 5, y0: 1, y1: 5, z0: 1, z1: 5 }, STONE, { floorId: PLANKS, ceilId: GLASS });
  assert.equal(get(v, 1, 3, 3), STONE);      // wall
  assert.equal(get(v, 3, 3, 5), STONE);      // wall
  assert.equal(get(v, 3, 1, 3), PLANKS);     // floor
  assert.equal(get(v, 3, 5, 3), GLASS);      // ceiling
  assert.equal(get(v, 3, 3, 3), 0);          // inside
  assert.equal(get(v, 0, 3, 3), DIRT);       // outside untouched
  assert.equal(get(v, 1, 1, 1), STONE);      // floor corner belongs to the wall
});

test('line, column, replace and topSolidY', () => {
  const v = createVolume({ x: 10, y: 10, z: 10 });
  assert.equal(line(v, { x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 0 }, STONE), 5);
  assert.equal(get(v, 0, 0, 0), STONE);
  assert.equal(get(v, 4, 2, 0), STONE);
  assert.equal(column(v, 7, 7, 0, 3, DIRT), 4);
  assert.equal(topSolidY(v, 7, 7), 3);
  set(v, 7, 8, 7, GLASS);
  assert.equal(topSolidY(v, 7, 7), 8);        // glass is solid
  assert.equal(topSolidY(v, 2, 2), -1);
  assert.equal(topSolidY(v, 50, 2), -1);
  assert.equal(replace(v, { x0: 0, x1: 9, y0: 0, y1: 9, z0: 0, z1: 9 }, DIRT, STONE), 4);
  assert.equal(get(v, 7, 0, 7), STONE);
});

test('clone is independent', () => {
  const v = createVolume({ x: 2, y: 2, z: 2 });
  const c = clone(v);
  set(c, 0, 0, 0, STONE);
  assert.equal(get(v, 0, 0, 0), 0);
  assert.notEqual(c.size, v.size);
});

test('ftToBlocks table (13 §3)', () => {
  const table = [[0, 1], [1, 1], [3, 1], [5, 2], [8, 2], [9, 3], [10, 3], [12, 4], [20, 6], [33, 10], [100, 30]];
  for (const [ft, blocks] of table) assert.equal(ftToBlocks(ft), blocks, `${ft} ft`);
});

test('pack/unpack round trips: empty, one edit, 20,000 seeded edits', () => {
  assert.equal(unpack(pack(new Map())).size, 0);
  assert.equal(countEdits(pack(new Map())), 0);
  assert.equal(unpack('').size, 0);
  assert.equal(countEdits(''), 0);
  assert.equal(countEdits(null), 0);

  const one = new Map([[1234567, 42]]);
  assert.deepEqual([...unpack(pack(one))], [[1234567, 42]]);
  assert.equal(countEdits(pack(one)), 1);
  assert.deepEqual([...unpack(pack(new Map([[0, 0]])))], [[0, 0]]); // breaking to air at index 0

  const big = randomEdits(20000);
  const str = pack(big);
  const back = unpack(str);
  assert.equal(back.size, 20000);
  for (const [i, id] of big) assert.equal(back.get(i), id);
  assert.equal(countEdits(str), 20000);
  assert.match(str, /^[A-Za-z0-9+/]+=*$/);
});

test('packed size of 20,000 edits is under 150 KB', () => {
  const str = pack(randomEdits(WORLD.maxEdits));
  assert.ok(str.length < 150 * 1024, `${str.length} chars`);
});

test('unpack rejects a corrupt string', () => {
  const str = pack(randomEdits(10));
  assert.throws(() => unpack(str.slice(0, 8)));
});

test('diff → apply reproduces the edited volume; volumes stay untouched', () => {
  const base = createVolume({ x: 16, y: 16, z: 16 });
  fillBox(base, { x0: 0, x1: 15, y0: 0, y1: 4, z0: 0, z1: 15 }, DIRT);
  const cur = clone(base);
  set(cur, 1, 4, 1, 0);            // broke a block
  set(cur, 2, 5, 2, PLANKS);       // placed one
  set(cur, 3, 5, 3, STONE);
  const d = diff(base, cur);
  assert.equal(d.size, 3);
  assert.equal(d.get(idx(base, 1, 4, 1)), 0);
  const rebuilt = apply(base, pack(d));
  assert.deepEqual(rebuilt.data, cur.data);
  assert.equal(get(base, 2, 5, 2), 0);
  assert.deepEqual(apply(base, d).data, cur.data);
  assert.equal(diff(base, base).size, 0);
  assert.throws(() => diff(base, createVolume({ x: 8, y: 8, z: 8 })));
});

test('rebase drops only edits on cells the renovation changed', () => {
  const oldBase = createVolume({ x: 8, y: 8, z: 8 });
  fillBox(oldBase, { x0: 0, x1: 7, y0: 0, y1: 2, z0: 0, z1: 7 }, DIRT);
  const newBase = clone(oldBase);
  hollowBox(newBase, { x0: 0, x1: 3, y0: 3, y1: 6, z0: 0, z1: 3 }, STONE); // the renovation adds a room
  const edits = new Map([
    [idx(oldBase, 1, 4, 1), GLASS],    // inside the new room's interior (was air, still air) → kept
    [idx(oldBase, 0, 4, 0), PLANKS],   // on the new wall → dropped
    [idx(oldBase, 6, 3, 6), PLANKS],   // far from the room → kept
    [idx(oldBase, 6, 2, 6), 0],        // dug a hole, base unchanged → kept
  ]);
  const r = rebase(oldBase, newBase, edits);
  assert.equal(r.dropped, 1);
  assert.deepEqual([...r.edits.keys()].sort((a, b) => a - b),
    [idx(oldBase, 6, 2, 6), idx(oldBase, 1, 4, 1), idx(oldBase, 6, 3, 6)].sort((a, b) => a - b));
  // Packed in → packed out.
  const rp = rebase(oldBase, newBase, pack(edits));
  assert.equal(typeof rp.edits, 'string');
  assert.equal(countEdits(rp.edits), 3);
  // No renovation: nothing dropped.
  assert.equal(rebase(oldBase, clone(oldBase), edits).dropped, 0);
});

test('world/ modules stay pure (no DOM, three or Buffer) and under 400 lines', () => {
  const dir = fileURLToPath(new URL('../../app/src/world/', import.meta.url));
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(dir + f, 'utf8');
    assert.ok(src.split('\n').length < 400, `${f} is too long`);
    assert.doesNotMatch(src, /from\s+['"]three|document\.|window\.|localStorage|\bBuffer\b/, f);
  }
});
