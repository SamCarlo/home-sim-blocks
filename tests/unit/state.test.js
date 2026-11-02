import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, validateState, STATE_VERSION } from '../../app/src/state/schema.js';
import { migrate, MigrationError } from '../../app/src/state/migrate.js';
import { summarize } from '../../app/src/state/summary.js';
import { createStore } from '../../app/src/state/store.js';
import { hashString } from '../../app/src/util/rng.js';
import { seeds, buildSeed } from '../../app/src/dev/seeds.js';

const init = () => createInitialState({ uid: 'local-abc', username: 'kai', classCode: 'DEMO', now: 1000 });

test('initial state validates and is JSON-safe', () => {
  const s = init();
  assert.deepEqual(validateState(s), []);
  assert.equal(s.version, STATE_VERSION);
  assert.equal(s.meta.seed, hashString('local-abc'));
  assert.equal(s.phase, 'intake');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('broken states report errors', () => {
  assert.ok(validateState(null).length);
  const s = init();
  s.phase = 'moon';
  s.finances.savingsCents = 12.5;
  s.life.current = { stage: 'nap' };
  delete s.finances.loans;
  const errs = validateState(s).join('\n');
  for (const frag of ['phase', 'savingsCents', 'life.current', 'finances.loans']) assert.match(errs, new RegExp(frag));
});

test('every seed validates', () => {
  for (const name of Object.keys(seeds)) assert.deepEqual(validateState(buildSeed(name, 5)), [], name);
  assert.equal(buildSeed('plan-comfortable').phase, 'plan');
  assert.equal(buildSeed('plan-comfortable').finances.savingsCents, 2000000);
  assert.throws(() => buildSeed('nope'), /Unknown seed/);
});

test('migrate: current passes through, future refused, steps run in order', () => {
  const s = init();
  assert.equal(migrate(s), s);
  assert.throws(() => migrate({ ...s, version: 99 }), (e) => e instanceof MigrationError && e.code === 'future');
  assert.throws(() => migrate({}), MigrationError);
  const steps = { 1: (x) => { x.added = 'v2'; }, 2: (x) => { x.added += '+v3'; } };
  const v1 = { ...s, version: 1 };
  const out = migrate(v1, steps, 3);
  assert.equal(out.version, 3);
  assert.equal(out.added, 'v2+v3');
  assert.equal(v1.version, 1); // input untouched
});

test('migrate v1 → v2 adds the relocation slot', () => {
  const v1 = init();
  delete v1.relocation;
  v1.version = 1;
  v1.life.monthIndex = 4;
  const out = migrate(v1);
  assert.equal(out.version, 2);
  assert.equal(out.relocation, null);
  assert.equal(out.life.monthIndex, 4);
  assert.deepEqual(validateState(out), []);
  assert.equal('relocation' in v1, false);
});

test('summary computes cash and net worth defensively', () => {
  const s = buildSeed('plan-comfortable');
  s.finances.checkingCents = 50000;
  s.finances.investments.low.valueCents = 10000;
  s.finances.creditCard = { balanceCents: 3000 };
  const sum = summarize(s);
  assert.equal(sum.cashCents, 2050000);
  assert.equal(sum.netWorthCents, 2050000 + 10000 - 3000);
  assert.equal(sum.monthLabel, 'January 2033');
  assert.equal(sum.wellbeingAvg, 60);
  assert.equal(summarize({}).cashCents, 0);
});

test('store: update clones, bumps updatedAt, notifies with the checkpoint flag', () => {
  let t = 1000;
  const s0 = init();
  const store = createStore(s0, { now: () => t });
  const seen = [];
  const unsub = store.subscribe((s, info) => seen.push([s.phase, info.checkpoint]));
  t = 2000;
  store.update((s) => { s.phase = 'plan'; }, { checkpoint: 'intake-submit' });
  assert.equal(s0.phase, 'intake');           // the original was not mutated
  assert.equal(store.getState().phase, 'plan');
  assert.equal(store.getState().meta.updatedAt, 2000);
  store.update((s) => ({ ...s, phase: 'design' }));
  assert.deepEqual(seen, [['plan', 'intake-submit'], ['design', null]]);
  unsub();
  store.update((s) => { s.phase = 'life'; });
  assert.equal(seen.length, 2);
});
