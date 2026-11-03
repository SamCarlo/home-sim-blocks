// Upgrading the home you have (13 §7, §10, blocks task 20): quote, commit, cancel and the world rebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { canUpgrade, startUpgrade, upgradeQuote, commitUpgrade, cancelUpgrade, clearedNote, catAllowed } from '../../app/src/life/upgrade.js';
import { voxHome } from '../../app/src/world/voxHome.js';
import { homeKeyFor, siteKeyFor } from '../../app/src/world/homeKey.js';
import { editsOf } from '../../app/src/world/worldState.js';
import { cash } from '../../app/src/finance/ledger.js';
import { DESIGN, LEASE } from '../../app/src/config.js';
import { validateState } from '../../app/src/state/schema.js';

const H = DESIGN.house;

test('canUpgrade / startUpgrade: Live at welcome, keeps a deep copy of home and world, opens design', () => {
  const s = buildSeed('life-upgrade-house', 1);
  assert.ok(canUpgrade(s));
  startUpgrade(s);
  assert.equal(s.phase, 'design');
  assert.equal(s.upgrade.stage, 'design');
  assert.deepEqual(s.upgrade.homeBefore, s.home);
  assert.notEqual(s.upgrade.homeBefore, s.home);
  assert.deepEqual(s.upgrade.worldBefore, s.world);
  assert.ok(!canUpgrade(s));
  assert.deepEqual(validateState(s), []);
  const live = buildSeed('life-upgrade-house', 1);
  live.life.current = { stage: 'live' };
  assert.ok(!canUpgrade(live));
});

test('upgradeQuote charges only what is new; removing never refunds', () => {
  const s = buildSeed('life-upgrade-house', 1); // 1 bed, no coop, cat
  startUpgrade(s);
  const q = upgradeQuote(s, { gardenBeds: 2, coop: true });
  assert.deepEqual(q.lines.map((l) => l.key), ['beds', 'coop']);
  assert.equal(q.deltaCents, H.bedCents + H.coopCents);
  assert.equal(upgradeQuote(s, { gardenBeds: 0 }).deltaCents, 0); // can't go below what's there
  assert.equal(upgradeQuote(s, { gardenBeds: 0 }).custom.gardenBeds, 1);
  assert.equal(upgradeQuote(s, { pet: 'dog' }).deltaCents, 0); // already has a cat
  assert.equal(upgradeQuote(s, { palette: 2 }).deltaCents, 0); // paint is free, like at move-in
});

test('commitUpgrade: one charge per line, home updated, builds kept, homeKey and site key behave', () => {
  const s = buildSeed('life-upgrade-house', 1);
  const before = cash(s), editsBefore = editsOf(s.world), keyBefore = homeKeyFor(s), siteBefore = siteKeyFor(s);
  const stage = s.life.current.stage, txBefore = s.finances.transactions.length;
  startUpgrade(s);
  const r = commitUpgrade(s, { gardenBeds: 2, coop: true }, { voxHomeFn: voxHome });
  assert.ok(r.ok);
  assert.equal(cash(s), before - H.bedCents - H.coopCents);
  const tx = s.finances.transactions.slice(txBefore);
  assert.ok(tx.length >= 2 && tx.every((t) => t.category === 'home-upgrade' && t.month === s.life.monthIndex));
  assert.equal(s.phase, 'life');
  assert.equal(s.upgrade, null);
  assert.equal(s.life.current.stage, stage);
  assert.equal(s.home.house.gardenBeds, 2);
  assert.ok(s.home.house.coop);
  assert.equal(s.home.plants.filter((p) => p.kind === 'garden-bed').length, 2);
  assert.equal(s.home.animals.filter((a) => a.kind === 'chicken').length, H.hens);
  assert.notEqual(homeKeyFor(s), keyBefore);
  assert.equal(siteKeyFor(s), siteBefore);
  assert.equal(s.world.homeKey, homeKeyFor(s));
  // The planter is on the front yard: the renovation (bed + coop out back) leaves it alone.
  const after = editsOf(s.world);
  assert.equal(after.size + s.world.cleared, editsBefore.size);
  assert.equal(s.world.editCount, after.size);
  for (const [i, id] of after) assert.equal(editsBefore.get(i), id);
  // The new bed and coop exist in the new base.
  const vh = voxHome(s);
  assert.equal(vh.plants.filter((p) => p.kind === 'garden-bed').length, 2);
  assert.deepEqual(validateState(s), []);
});

test('commitUpgrade refuses when short and changes nothing', () => {
  const s = buildSeed('life-upgrade-house', 1);
  s.finances.checkingCents = 0; s.finances.savingsCents = 0;
  startUpgrade(s);
  const snap = JSON.stringify(s);
  const r = commitUpgrade(s, { coop: true }, { voxHomeFn: voxHome });
  assert.ok(!r.ok);
  assert.equal(r.shortfallCents, H.coopCents);
  assert.equal(JSON.stringify(s), snap);
});

test('cancelUpgrade: home and world back exactly, nothing charged', () => {
  const s = buildSeed('life-upgrade-house', 1);
  const home = JSON.stringify(s.home), world = JSON.stringify(s.world), money = cash(s);
  startUpgrade(s);
  s.home.pickDraft = { gardenBeds: 3 };
  cancelUpgrade(s);
  assert.equal(JSON.stringify(s.home), home);
  assert.equal(JSON.stringify(s.world), world);
  assert.equal(cash(s), money);
  assert.equal(s.phase, 'life');
  assert.equal(s.upgrade, null);
});

test('renters: plants and a cat (apartment adds the lease pet fee and pet rent)', () => {
  const s = buildSeed('life-month1-apartment', 1);
  assert.ok(catAllowed(s));
  startUpgrade(s);
  const pots = s.home.plants.length;
  const q = upgradeQuote(s, { plants: pots + 1, cat: true });
  assert.equal(q.deltaCents, DESIGN.plantCents + H.petCents.cat + LEASE.petFeeCents);
  const key = homeKeyFor(s);
  const r = commitUpgrade(s, { plants: pots + 1, cat: true }, { voxHomeFn: voxHome });
  assert.ok(r.ok);
  assert.equal(s.home.plants.length, pots + 1);
  assert.ok(s.home.animals.some((a) => a.kind === 'cat'));
  assert.ok(s.finances.recurring.some((x) => x.source === 'pet-rent'));
  assert.equal(homeKeyFor(s), key); // plants don't change the key
});

test('clearedNote', () => {
  assert.equal(clearedNote(null), '');
  assert.equal(clearedNote({ cleared: 0 }), '');
  assert.equal(clearedNote({ cleared: 1 }), 'Your renovation cleared 1 of your blocks.'.replace('blocks', 'block'));
  assert.equal(clearedNote({ cleared: 5 }), 'Your renovation cleared 5 of your blocks.');
});
