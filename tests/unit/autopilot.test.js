// "Live like this for a year" (task 58): life/autopilot.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../../app/src/dev/seeds.js';
import { LIFE } from '../../app/src/config.js';
import { liveYear, finishAutopilot, addBlackCat } from '../../app/src/life/autopilot.js';
import { monthBills } from '../../app/src/life/planMonth.js';
import { rangeReview, yearReview } from '../../app/src/life/monthReport.js';
import { validateState } from '../../app/src/state/schema.js';

test('lives 12 months with full care, skips the December review, ends on the recap', () => {
  const s = buildSeed('life-plan-filled');
  const choices = { ...s.life.current.choices };
  const run = liveYear(s);
  assert.deepEqual({ ...run, cat: undefined }, { fromMonth: 0, toMonth: 11, monthsLived: 12, stoppedReason: null, cat: undefined });
  assert.equal(s.life.monthIndex, 12);
  assert.equal(s.life.history.length, 12);
  assert.equal(s.life.current.stage, 'autopilot');
  assert.deepEqual(s.life.current.autopilot, run);
  assert.ok(s.life.history.every((m) => m.choices.exercise === choices.exercise && m.choices.extraWork === choices.extraWork));
  assert.ok(s.life.history.every((m) => m.result.careRate === 1 || m.result.careRate === null));
  assert.ok(s.home.plants.every((p) => p.alive !== false), 'every plant was cared for');
  assert.equal(s.life.reflections.length, 0, 'the skipped year in review saves nothing');
  assert.deepEqual(validateState(s), []);
  // the recap's totals are the year's
  assert.deepEqual({ ...rangeReview(s.life.history, 0, 11) }, (({ year, ...r }) => r)(yearReview(s.life.history, 2033)));
});

test('every run adopts a free black stray cat', () => {
  const s = buildSeed('life-plan-filled');
  liveYear(s);
  const cats = s.home.animals.filter((a) => a.stray);
  assert.equal(cats.length, 1);
  assert.equal(cats[0].color, LIFE.autopilot.blackCatColor);
  assert.ok(LIFE.autopilot.blackCatNames.includes(cats[0].name));
  const food = (st) => monthBills(st, st.life.history.at(-1).choices).lifestyle.filter((b) => b.category === 'pets');
  assert.deepEqual(food(s), [], 'strays find their own food');
  assert.ok(s.life.history.every((m) => !(m.result.byCategory?.pets)), 'no pet spending all year');
  // a second run brings a second cat with a different name
  finishAutopilot(s, '', 0);
  s.life.current = { stage: 'plan', choices: { ...s.life.history.at(-1).choices } };
  liveYear(s, { months: 1 });
  const two = s.home.animals.filter((a) => a.stray);
  assert.equal(two.length, 2);
  assert.notEqual(two[0].name, two[1].name);
});

test('a missed housing payment stops the run after that month', () => {
  const s = buildSeed('life-plan-filled');
  s.player.netMonthlyIncomeCents = 0;
  s.finances.checkingCents = 0;
  s.finances.savingsCents = 0;
  const run = liveYear(s);
  assert.equal(run.monthsLived, 1);
  assert.equal(run.stoppedReason, 'missed-housing');
  assert.equal(s.life.current.stage, 'autopilot');
  assert.equal(s.life.monthIndex, 1);
});

test('an eviction ends the run in Plan with the notice', () => {
  const s = buildSeed('life-plan-filled');
  s.player.netMonthlyIncomeCents = 0;
  s.finances.checkingCents = 0;
  s.finances.savingsCents = 0;
  s.finances.credit.lateHousingStreak = LIFE.evictionStreak - 1;
  const run = liveYear(s);
  assert.equal(run.stoppedReason, 'evicted');
  assert.equal(s.phase, 'plan');
  assert.equal(s.home, null);
  assert.equal(s.plan.notice.kind, 'eviction');
});

test('refuses outside the plan stage or with unanswered questions', () => {
  const welcome = buildSeed('life-month1-apartment');
  assert.equal(liveYear(welcome), null);
  const s = buildSeed('life-plan-filled');
  delete s.life.current.choices.exercise;
  const before = structuredClone(s);
  assert.equal(liveYear(s), null);
  assert.deepEqual(s, before);
});

test('finishAutopilot keeps a reflection and goes to the welcome', () => {
  const s = buildSeed('life-autopilot-done');
  finishAutopilot(s, '  Spend less on going out.  ', 99);
  assert.deepEqual(s.life.current, { stage: 'welcome' });
  assert.deepEqual(s.life.reflections.at(-1), { kind: 'autopilot', fromMonth: 0, monthIndex: 11, text: 'Spend less on going out.', savedAt: 99 });
  assert.throws(() => finishAutopilot(s, ''), /outside the autopilot stage/);
});

test('addBlackCat gives fresh ids after other animals', () => {
  const s = buildSeed('life-month1-house');
  const n = s.home.animals.length;
  const cat = addBlackCat(s);
  assert.equal(cat.id, `a${n + 1}`);
  assert.equal(cat.stray, true);
});
