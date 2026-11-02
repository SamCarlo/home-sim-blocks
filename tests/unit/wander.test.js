// homeblocks 13: world/wander.js keeps a wandering animal inside its box of air cells, deterministically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wanderAt, wanderPoint } from '../../app/src/world/wander.js';

const BOX = { x0: 3, y0: 25, z0: 4, x1: 7, y1: 26, z1: 6 };

test('wander stays inside the box with feet on its floor', () => {
  for (let t = 0; t < 200; t += 0.37) {
    const p = wanderAt(BOX, t, { seed: 5 });
    assert.ok(p.x >= BOX.x0 && p.x <= BOX.x1 + 1, `x ${p.x} at ${t}`);
    assert.ok(p.z >= BOX.z0 && p.z <= BOX.z1 + 1, `z ${p.z} at ${t}`);
    assert.equal(p.y, BOX.y0);
    assert.ok(Number.isFinite(p.yaw));
  }
});

test('wander is a pure function of time and seed', () => {
  assert.deepEqual(wanderAt(BOX, 12.3, { seed: 2 }), wanderAt(BOX, 12.3, { seed: 2 }));
  const a = [0, 1, 2, 3, 4, 5].map((k) => wanderPoint(BOX, 1, k));
  const b = [0, 1, 2, 3, 4, 5].map((k) => wanderPoint(BOX, 2, k));
  assert.notDeepEqual(a, b);
});

test('wander walks, then pauses on the waypoint, and moves continuously', () => {
  const leg = 4, share = 0.5;
  const end = wanderAt(BOX, leg * 0.9, { seed: 3, leg, walkShare: share });
  assert.equal(end.walking, false);
  const wp = wanderPoint(BOX, 3, 1);
  assert.equal(end.x, wp.x);
  assert.equal(end.z, wp.z);
  let prev = wanderAt(BOX, 0, { seed: 3, leg, walkShare: share });
  for (let t = 0.05; t < 40; t += 0.05) {
    const p = wanderAt(BOX, t, { seed: 3, leg, walkShare: share });
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) < 0.5, `jump at ${t}`);
    prev = p;
  }
});

test('a one-cell box never moves', () => {
  const one = { x0: 2, y0: 1, z0: 2, x1: 2, y1: 1, z1: 2 };
  for (const t of [0, 3, 9.5]) assert.deepEqual([wanderAt(one, t).x, wanderAt(one, t).z], [2.5, 2.5]);
});
