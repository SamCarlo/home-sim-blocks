import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVolume, fillBox, set } from '../../app/src/world/volume.js';
import { BLOCK } from '../../app/src/world/blocks.js';
import { collides, createPlayer, poseOf, stepPlayer, turn } from '../../app/src/world/firstPerson.js';
import { EXPLORE } from '../../app/src/config.js';

const STONE = BLOCK.stone.id;
/** 16 × 12 × 16 world, floor top at y = 4 (cells y 0..3 solid). */
function flat() {
  const v = createVolume({ x: 16, y: 12, z: 16 });
  fillBox(v, { x0: 0, x1: 15, y0: 0, y1: 3, z0: 0, z1: 15 }, STONE);
  return v;
}
const run = (v, p, input, secs) => { for (let t = 0; t < secs; t += 1 / 60) stepPlayer(v, p, input, 1 / 60); return p; };

test('a player at a spawn cell stands on the floor and does not sink', () => {
  const v = flat();
  const p = createPlayer({ x: 8, y: 4, z: 8, yaw: 0 });
  assert.deepEqual([p.x, p.z], [8.5, 8.5]);
  assert.equal(collides(v, p.x, p.y, p.z), false);
  run(v, p, {}, 1);
  assert.ok(Math.abs(p.y - 4) < 1e-6, `y ${p.y}`);
  assert.equal(p.onGround, true);
});

test('forward at yaw 0 walks toward −z at the vendor walk speed', () => {
  const v = flat();
  const p = run(v, createPlayer({ x: 8, y: 4, z: 12, yaw: 0 }), { forward: true }, 1);
  assert.ok(Math.abs(p.x - 8.5) < 1e-6);
  assert.ok(Math.abs((12.5 - p.z) - EXPLORE.walkSpeed) < 0.15, `moved ${12.5 - p.z}`);
  const q = run(v, createPlayer({ x: 8, y: 4, z: 8, yaw: Math.PI / 2 }), { forward: true }, 0.5);
  assert.ok(q.x < 8.5 - 1, 'yaw π/2 looks toward −x');
});

test('a two-block wall stops the body at its face, a one-block step is climbed', () => {
  const v = flat();
  fillBox(v, { x0: 0, x1: 15, y0: 4, y1: 5, z0: 5, z1: 5 }, STONE);
  const p = run(v, createPlayer({ x: 8, y: 4, z: 8 }), { forward: true }, 2);
  assert.ok(Math.abs(p.z - (6 + EXPLORE.bodyHalf)) < 0.01, `z ${p.z}`);
  const w = flat();
  fillBox(w, { x0: 0, x1: 15, y0: 4, y1: 4, z0: 5, z1: 5 }, STONE);
  const q = createPlayer({ x: 8, y: 4, z: 8 });
  let onStep = false;
  for (let t = 0; t < 2; t += 1 / 60) { stepPlayer(w, q, { forward: true }, 1 / 60); if (q.z > 5.3 && q.z < 5.7) onStep ||= Math.abs(q.y - 5) < 1e-6; }
  assert.ok(onStep && q.z < 4, `crossed the step to z ${q.z}`);
});

test('jump clears one block and lands; the volume edge is a wall; ceilings stop a jump', () => {
  const v = flat();
  const p = createPlayer({ x: 8, y: 4, z: 8 });
  run(v, p, {}, 0.1);
  stepPlayer(v, p, { jump: true }, 1 / 60);
  let top = p.y;
  for (let i = 0; i < 60; i++) { stepPlayer(v, p, {}, 1 / 60); top = Math.max(top, p.y); }
  assert.ok(top > 5.1 && top < 5.5, `peak ${top}`);
  assert.ok(Math.abs(p.y - 4) < 1e-6 && p.onGround);
  const e = run(v, createPlayer({ x: 1, y: 4, z: 8, yaw: Math.PI / 2 }), { forward: true }, 1);
  assert.ok(e.x >= EXPLORE.bodyHalf);
  set(v, 8, 6, 8, STONE); // ceiling 2 blocks over the floor: a jump bumps it
  const c = createPlayer({ x: 8, y: 4, z: 8 });
  run(v, c, {}, 0.1);
  stepPlayer(v, c, { jump: true }, 1 / 60);
  let peak = 0;
  for (let i = 0; i < 60; i++) { stepPlayer(v, c, {}, 1 / 60); peak = Math.max(peak, c.y); }
  assert.ok(peak + EXPLORE.bodyHeight <= 6 + 1e-3, `head reached ${peak + EXPLORE.bodyHeight}`);
});

test('turn clamps pitch, keyboard look turns, pose rounds', () => {
  const p = createPlayer({ x: 0, y: 0, z: 0 });
  turn(p, 0, 5);
  assert.equal(p.pitch, EXPLORE.pitchLimit);
  const v = flat();
  const q = createPlayer({ x: 8, y: 4, z: 8 });
  stepPlayer(v, q, { turnLeft: true }, 0.05);
  assert.ok(Math.abs(q.yaw - EXPLORE.turnSpeed * 0.05) < 1e-9);
  assert.deepEqual(Object.keys(poseOf(q)), ['x', 'y', 'z', 'yaw', 'pitch']);
  assert.equal(createPlayer(poseOf(q)).x, poseOf(q).x, 'a saved pose is used as is');
});
