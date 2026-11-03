// Renovating a student-built home (13 §10, blocks task 21): the renovation cost, the permit, commit and the world rebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { canUpgrade, startUpgrade, cancelUpgrade } from '../../app/src/life/upgrade.js';
import { renovationQuote, commitRenovation, hasChanges, renovationDraft, afterRenovation } from '../../app/src/life/renovation.js';
import { addRoom, removeRoom, toggleOpening } from '../../app/src/phases/design/blueprint/model.js';
import { addYardItem } from '../../app/src/phases/design/blueprint/yard.js';
import { voxHome } from '../../app/src/world/voxHome.js';
import { homeKeyFor, siteKeyFor } from '../../app/src/world/homeKey.js';
import { recordEdits, editsOf } from '../../app/src/world/worldState.js';
import { idx } from '../../app/src/world/volume.js';
import { cash } from '../../app/src/finance/ledger.js';
import { RENOVATION } from '../../app/src/config.js';
import { validateState } from '../../app/src/state/schema.js';

const P = RENOVATION.permitCents;
/** The Cozy house plus a 10 × 10 bedroom left of the living room, with a door into it and a window. */
function withBedroom(bp) {
  let n = addRoom(bp, { type: 'bedroom', x: 52, y: 22, w: 10, h: 10 });
  n = toggleOpening(n, { kind: 'door', x: 62, y: 28, tol: 1 });
  return toggleOpening(n, { kind: 'window', x: 52, y: 27, tol: 1 });
}
function renovating() {
  const s = buildSeed('life-renovate-build', 1);
  assert.ok(canUpgrade(s), 'builds can upgrade now');
  startUpgrade(s);
  return s;
}

test('renovationQuote: adding a bedroom costs more than 0 plus the permit', () => {
  const s = renovating();
  const q = renovationQuote(s, withBedroom(renovationDraft(s)));
  assert.ok(q.workCents > 0);
  assert.equal(q.workCents, q.newCents - q.oldCents);
  assert.equal(q.deltaCents, q.workCents + P);
  assert.deepEqual(q.lines.map((l) => l.key), ['work', 'permit']);
});

test('renovationQuote: removing a bedroom costs 0 work, only the permit', () => {
  const s = renovating();
  const bp = renovationDraft(s);
  const q = renovationQuote(s, removeRoom(bp, bp.rooms.find((r) => r.type === 'bedroom').id));
  assert.ok(q.newCents < q.oldCents);
  assert.equal(q.workCents, 0);
  assert.equal(q.deltaCents, P);
  assert.deepEqual(q.lines.map((l) => l.key), ['permit']);
});

test('renovationQuote: the permit is charged once however many changes', () => {
  const s = renovating();
  let bp = withBedroom(renovationDraft(s));
  bp = addYardItem(addYardItem(bp, 'garden-bed'), 'fruit-tree');
  const q = renovationQuote(s, bp);
  assert.equal(q.lines.filter((l) => l.key === 'permit').length, 1);
  assert.ok(!hasChanges(s, renovationDraft(s)) && hasChanges(s, bp));
  const tx0 = s.finances.transactions.length, cash0 = cash(s);
  const r = commitRenovation(s, bp, { voxHomeFn: voxHome });
  assert.ok(r.ok);
  const charged = s.finances.transactions.slice(tx0);
  assert.equal(charged.filter((t) => /permit/i.test(t.label)).length, 1);
  assert.ok(charged.every((t) => t.category === 'home-upgrade'));
  assert.equal(cash0 - cash(s), q.deltaCents);
});

test('commitRenovation: refuses errors and short cash; success updates the home and returns to Live', () => {
  const s = renovating();
  const bad = addRoom(renovationDraft(s), { type: 'bedroom', x: 52, y: 22, w: 10, h: 10 }); // no door, no window
  const tx0 = s.finances.transactions.length;
  const r1 = commitRenovation(s, bad);
  assert.ok(!r1.ok && r1.errors.some((e) => e.code === 'bedroom-window'));
  assert.equal(s.finances.transactions.length, tx0);
  const poor = buildSeed('life-month1-build', 1);
  startUpgrade(poor);
  const r2 = commitRenovation(poor, withBedroom(renovationDraft(poor)));
  assert.ok(!r2.ok && r2.shortfallCents > 0);
  assert.ok(!afterRenovation(poor, withBedroom(renovationDraft(poor))).ok);
  const bp = withBedroom(renovationDraft(s));
  assert.ok(commitRenovation(s, bp, { voxHomeFn: voxHome }).ok);
  assert.equal(s.phase, 'life');
  assert.equal(s.upgrade, null);
  assert.equal(s.home.build.beds, 3);
  assert.deepEqual(s.home.blueprint, bp);
  assert.deepEqual(validateState(s), []);
});

test('renovation: the site key ignores the blueprint, so builds away from the house survive the rebase', () => {
  const s = buildSeed('life-renovate-build', 1);
  const key0 = homeKeyFor(s), site0 = siteKeyFor(s);
  const v = voxHome(s).volume;
  const far = idx(v, 2, 20, 2); // a corner of the world, nowhere near the house
  recordEdits(s, new Map([[far, 1]]), { homeKey: key0 });
  startUpgrade(s);
  const bp = withBedroom(renovationDraft(s));
  assert.ok(commitRenovation(s, bp, { voxHomeFn: voxHome }).ok);
  assert.equal(siteKeyFor(s), site0);
  assert.notEqual(s.world.homeKey, key0);
  assert.equal(s.world.homeKey, homeKeyFor(s));
  assert.equal(editsOf(s.world).get(far), 1);
  assert.equal(s.world.cleared, 0);
});

test('cancel: the draft is thrown away, the live blueprint never changed', () => {
  const s = renovating();
  const before = structuredClone(s.home.blueprint);
  s.upgrade.blueprint = withBedroom(renovationDraft(s));
  assert.deepEqual(s.home.blueprint, before);
  assert.deepEqual(validateState(s), []);
  cancelUpgrade(s);
  assert.deepEqual(s.home.blueprint, before);
  assert.equal(s.upgrade, null);
});
