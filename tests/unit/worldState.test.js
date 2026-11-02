// Block world saves (13 §7, blocks task 18): schema v3, migration, world/worldState.js, Firestore size at the cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, validateState, STATE_VERSION } from '../../app/src/state/schema.js';
import { migrate } from '../../app/src/state/migrate.js';
import { ensureWorld, recordEdits, restoreEdits, savePose, editsOf, fullness, newWorld } from '../../app/src/world/worldState.js';
import { createVolume } from '../../app/src/world/volume.js';
import { pack } from '../../app/src/world/edits.js';
import { saveDoc, MAX_STATE_JSON } from '../../app/src/persistence/firestore.js';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { homeKeyFor } from '../../app/src/world/homeKey.js';
import { voxHome } from '../../app/src/world/voxHome.js';
import { WORLD } from '../../app/src/config.js';
import { createRng } from '../../app/src/util/rng.js';

const init = () => createInitialState({ uid: 'u1', username: 'lani', classCode: 'DEMO', now: 1 });

test('schema v3: new saves have world and upgrade null; bad shapes are caught', () => {
  assert.equal(STATE_VERSION, 3);
  const s = init();
  assert.equal(s.world, null);
  assert.equal(s.upgrade, null);
  assert.deepEqual(validateState(s), []);
  s.world = newWorld('house:abc');
  assert.deepEqual(validateState(s), []);
  s.world.pose = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 };
  s.upgrade = { startedMonth: 2, stage: 'design', homeBefore: {}, worldBefore: null };
  assert.deepEqual(validateState(s), []);
  for (const bad of [{ ...s.world, edits: 5 }, { ...s.world, editCount: -1 }, { ...s.world, pose: { x: 1 } }, { ...s.world, homeKey: '' }, 'x']) {
    assert.ok(validateState({ ...s, world: bad }).length > 0, JSON.stringify(bad));
  }
  assert.ok(validateState({ ...s, upgrade: { stage: 'design' } }).length > 0);
});

test('migrate v2 → v3 adds world and upgrade', () => {
  const v2 = init();
  delete v2.world;
  delete v2.upgrade;
  v2.version = 2;
  v2.life.monthIndex = 7;
  const out = migrate(v2);
  assert.equal(out.version, 3);
  assert.equal(out.world, null);
  assert.equal(out.upgrade, null);
  assert.equal(out.life.monthIndex, 7);
  assert.deepEqual(validateState(out), []);
  assert.equal('world' in v2, false);
});

test('ensureWorld keeps the same home, resets on a move, keeps during an upgrade', () => {
  const s = init();
  const w = ensureWorld(s, 'house:a', { hotbar: [1, 2] });
  w.edits = 'x'; w.editCount = 1;
  assert.equal(ensureWorld(s, 'house:a'), w);
  assert.equal(s.world.editCount, 1);
  s.upgrade = { startedMonth: 1, stage: 'design' };
  ensureWorld(s, 'house:b');
  assert.equal(s.world.homeKey, 'house:a', 'kept for the rebase during an upgrade');
  s.upgrade = null;
  ensureWorld(s, 'condo:c');
  assert.deepEqual(s.world, newWorld('condo:c'), 'a move resets the world (builds stay with the old home)');
});

test('recordEdits packs, counts and enforces the cap; restoreEdits writes them back', () => {
  const s = init();
  const edits = new Map([[5, 3], [100, 7], [4000, 0]]);
  const r = recordEdits(s, edits, { homeKey: 'house:k', hotbar: [9] });
  assert.deepEqual(r, { ok: true, almostFull: false, full: false, count: 3 });
  assert.equal(s.world.editCount, 3);
  assert.deepEqual([...editsOf(s.world)], [...edits]);
  assert.deepEqual(s.world.hotbar, [9]);
  assert.deepEqual(validateState(s), []);

  const v = createVolume({ x: 32, y: 8, z: 32 });
  v.data[4000] = 2;
  const base = new Map();
  assert.equal(restoreEdits({ volume: v, homeKey: 'house:k' }, s.world, base), v);
  assert.deepEqual([v.data[5], v.data[100], v.data[4000]], [3, 7, 0]);
  assert.deepEqual([...base], [[5, 0], [100, 0], [4000, 2]]);
  const v2 = createVolume({ x: 32, y: 8, z: 32 });
  restoreEdits({ volume: v2, homeKey: 'house:other' }, s.world);
  assert.equal(v2.data[5], 0, 'another home ignores the edits');

  const big = new Map();
  for (let i = 0; i < WORLD.maxEdits; i++) big.set(i * 3, 2);
  const atCap = recordEdits(s, big);
  assert.equal(atCap.ok, true);
  assert.equal(atCap.full, true);
  big.set(-1 >>> 0, 2);
  const over = recordEdits(s, big);
  assert.equal(over.ok, false);
  assert.equal(s.world.editCount, WORLD.maxEdits, 'over the cap writes nothing');
  assert.deepEqual(fullness(Math.ceil(WORLD.maxEdits * 0.9) - 1), { almostFull: false, full: false });
  assert.deepEqual(fullness(Math.ceil(WORLD.maxEdits * 0.9)), { almostFull: true, full: false });
});

test('savePose rounds and needs a world', () => {
  const s = init();
  assert.equal(savePose(s, { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }), null);
  ensureWorld(s, 'house:a');
  assert.deepEqual(savePose(s, { x: 1.23456, y: 25, z: 3.9999, yaw: -1.5707963, pitch: 0.1 }), { x: 1.235, y: 25, z: 4, yaw: -1.571, pitch: 0.1 });
});

test('a save with 20,000 edits stays under the Firestore adapter limit', () => {
  const s = buildSeed('life-month1-house');
  const r = createRng(18); const rng = () => r.next();
  const cells = 128 * WORLD.tallY * 128;
  const m = new Map();
  while (m.size < WORLD.maxEdits) m.set(Math.floor(rng() * cells), 1 + Math.floor(rng() * 110));
  s.world = { ...newWorld('house:x'), edits: pack(m), editCount: m.size };
  const doc = saveDoc(s, 1);
  assert.ok(doc.stateJson.length < MAX_STATE_JSON, `${doc.stateJson.length} chars`);
  assert.ok(s.world.edits.length < 140000, `packed edits ${s.world.edits.length} chars`);
});

test('life-world-built: its edits sit on the Katy house and change the world', () => {
  const s = buildSeed('life-world-built');
  assert.deepEqual(validateState(s), []);
  assert.equal(s.world.homeKey, homeKeyFor(s));
  assert.ok(s.world.editCount >= 30 && s.world.editCount <= 50);
  assert.ok(s.world.pose);
  const vh = voxHome(s, { monthIndex: 0 });
  const before = vh.volume.data.slice();
  restoreEdits(vh, s.world);
  let changed = 0;
  for (const [i, id] of editsOf(s.world)) { if (before[i] !== id) changed++; assert.equal(vh.volume.data[i], id); }
  assert.equal(changed, s.world.editCount, 'every saved edit differs from the generated world');
});
