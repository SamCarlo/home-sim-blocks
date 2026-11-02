// world/mesher.js (blocks task 05): exposed-face culling, passes, atlas UVs and the voxel raycast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, textureFiles } from '../../app/src/world/blocks.js';
import { createVolume, set, fillBox } from '../../app/src/world/volume.js';
import { PASSES, blockTables, meshChunk, raycast } from '../../app/src/world/mesher.js';

const T = blockTables(textureFiles());
const id = (k) => BLOCK[k].id;
const faces = (parts) => parts.reduce((a, p) => a + p.faces, 0);

test('tables: passes, clear flags and atlas grid', () => {
  assert.equal(T.pass[id('stone')], 0);
  assert.equal(T.pass[id('glass')], 1);
  assert.equal(T.pass[id('leaves')], 1);
  assert.equal(T.pass[id('water')], 2);
  assert.equal(T.pass[id('lit-glass')], 3);
  assert.equal(T.clear[id('stone')], 0);
  assert.equal(T.clear[0], 1);
  assert.ok(T.cols * T.rows >= textureFiles().length);
  for (const b of [id('grass'), id('brick')]) for (let s = 0; s < 3; s++) assert.ok(T.tile[b * 3 + s] >= 0);
  assert.deepEqual(PASSES, ['opaque', 'cutout', 'blend', 'glow']);
});

test('a lone block has 6 faces, the bottom layer skips its underside', () => {
  const v = createVolume({ x: 8, y: 8, z: 8 });
  set(v, 3, 3, 3, id('stone'));
  const parts = meshChunk(v, T);
  assert.equal(parts[0].faces, 6);
  assert.equal(parts[0].indices.length, 36);
  assert.equal(parts[0].positions.length, 6 * 4 * 3);
  set(v, 1, 0, 1, id('stone'));
  assert.equal(faces(meshChunk(v, T)), 11);
});

test('shared faces between opaque or identical transparent blocks are culled', () => {
  const v = createVolume({ x: 8, y: 8, z: 8 });
  set(v, 2, 2, 2, id('stone'));
  set(v, 3, 2, 2, id('stone'));
  assert.equal(faces(meshChunk(v, T)), 10);
  const g = createVolume({ x: 8, y: 8, z: 8 });
  set(g, 2, 2, 2, id('glass'));
  set(g, 3, 2, 2, id('glass'));
  assert.equal(meshChunk(g, T)[1].faces, 10);
  // Stone next to glass: the stone face behind the glass is still drawn.
  set(g, 3, 2, 2, id('stone'));
  const parts = meshChunk(g, T);
  assert.equal(parts[0].faces, 6);
  assert.equal(parts[1].faces, 5);
});

test('a flat 128 x 96 x 128 world meshes only its surface (13 §11 budget)', () => {
  const v = createVolume();
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 127, y1: 24, z1: 127 }, id('dirt'));
  const n = faces(meshChunk(v, T));
  assert.equal(n, 128 * 128 + 4 * 128 * 25); // top + 4 outer sides; no hidden faces
  assert.ok(n * 2 <= 400000);
});

test('chunks partition the faces; singlePass merges passes', () => {
  const v = createVolume({ x: 64, y: 16, z: 64 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 63, y1: 3, z1: 63 }, id('stone'));
  fillBox(v, { x0: 10, y0: 4, z0: 10, x1: 40, y1: 4, z1: 40 }, id('water'));
  const whole = faces(meshChunk(v, T));
  let sum = 0;
  for (let cx = 0; cx < 2; cx++) for (let cz = 0; cz < 2; cz++) {
    sum += faces(meshChunk(v, T, { x0: cx * 32, z0: cz * 32, x1: cx * 32 + 32, z1: cz * 32 + 32 }));
  }
  assert.equal(sum, whole);
  const single = meshChunk(v, T, { singlePass: true });
  assert.equal(single[0].faces, whole);
  assert.equal(single[2].faces, 0);
});

test('raycast finds the first block and the face it entered', () => {
  const v = createVolume({ x: 16, y: 16, z: 16 });
  fillBox(v, { x0: 0, y0: 0, z0: 0, x1: 15, y1: 4, z1: 15 }, id('grass'));
  set(v, 8, 5, 8, id('brick'));
  const down = raycast(v, [8.5, 12, 8.5], [0, -1, 0]);
  assert.deepEqual([down.x, down.y, down.z, down.id], [8, 5, 8, id('brick')]);
  assert.deepEqual(down.normal, [0, 1, 0]);
  const side = raycast(v, [-20, 5.5, 8.5], [1, 0, 0]);
  assert.deepEqual([side.x, side.y, side.z], [8, 5, 8]);
  assert.deepEqual(side.normal, [-1, 0, 0]);
  assert.equal(raycast(v, [8.5, 12, 8.5], [0, 1, 0]), null);
  assert.equal(raycast(v, [0, 0, 0], [0, 0, 0]), null);
});
