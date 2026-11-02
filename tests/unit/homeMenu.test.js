// The "My home" menu and moving with a block world (13 §7, §10, blocks task 19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { homeMenuItems, hasUpgrades, UPGRADE_KINDS } from '../../app/src/life/homeMenu.js';
import { startRelocation, cancelRelocation, startLife } from '../../app/src/life/relocation.js';
import { startPlan } from '../../app/src/life/monthFlow.js';
import { ensureWorld } from '../../app/src/world/worldState.js';
import { homeKeyFor } from '../../app/src/world/homeKey.js';
import { validateState } from '../../app/src/state/schema.js';

const ids = (items) => items.map((i) => i.id);

test('menu: explore, upgrade (coming soon) and move on the welcome stage', () => {
  const s = buildSeed('life-world-built');
  const items = homeMenuItems(s);
  assert.deepEqual(ids(items), ['explore', 'upgrade', 'move']);
  assert.equal(items[0].disabled, false);
  assert.equal(items[1].disabled, true);
  assert.equal(items[1].note, 'Coming soon');
  assert.equal(items[2].disabled, false);
  assert.equal(homeMenuItems(s, { upgradeReady: true })[1].disabled, false);
});

test('menu: explore hidden in classic view, disabled while loading; move closed on the summary', () => {
  const s = buildSeed('life-summary');
  assert.deepEqual(ids(homeMenuItems(s, { explore: false })), ['upgrade', 'move']);
  const items = homeMenuItems(s, { exploreReady: false });
  assert.equal(items[0].disabled, true);
  const move = items.find((i) => i.id === 'move');
  assert.equal(move.disabled, true);
  assert.match(move.note, /next month/);
});

test('every home kind has something to upgrade; unknown kinds hide the item', () => {
  for (const k of ['house', 'build', 'apartment', 'condo', 'shared']) assert.ok(hasUpgrades(k));
  assert.equal(UPGRADE_KINDS.length, 5);
  const s = buildSeed('life-world-built');
  s.home.kind = 'boat';
  assert.deepEqual(ids(homeMenuItems(s)), ['explore', 'move']);
});

test('a cancelled move leaves state.world exactly as it was', () => {
  const s = buildSeed('life-world-built');
  const before = JSON.stringify(s.world);
  assert.ok(s.world.editCount > 0);
  startPlan(s);
  startRelocation(s);
  assert.equal(JSON.stringify(s.world), before, 'looking keeps the world');
  cancelRelocation(s, 0);
  assert.equal(JSON.stringify(s.world), before, 'cancelling keeps the world');
  assert.deepEqual(validateState(s), []);
});

test('moving in to a new home resets state.world for the new homeKey', () => {
  const s = buildSeed('life-world-built');
  const oldKey = s.world.homeKey;
  startRelocation(s);
  s.home = { ...s.home, locationId: 'hilo', kind: 'apartment', label: 'A new place' };
  startLife(s);
  assert.equal(s.world, null, 'the old builds stay with the old home');
  assert.deepEqual(validateState(s), []);
  const key = homeKeyFor(s);
  assert.notEqual(key, oldKey);
  const w = ensureWorld(s, key);
  assert.equal(w.homeKey, key);
  assert.equal(w.editCount, 0);
  assert.equal(w.pose, null);
});

test('startLife during an upgrade keeps the world for the rebase', () => {
  const s = buildSeed('life-world-built');
  const before = JSON.stringify(s.world);
  s.upgrade = { startedMonth: s.life.monthIndex, stage: 'design', homeBefore: structuredClone(s.home), worldBefore: structuredClone(s.world) };
  startLife(s);
  assert.equal(JSON.stringify(s.world), before);
});
