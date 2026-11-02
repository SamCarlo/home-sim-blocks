// Phase 4 month state machine, money strip, wellbeing bars and home description (09 §1–§2, task 42).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeds } from '../../app/src/dev/seeds.js';
import { validateState } from '../../app/src/state/schema.js';
import { LIFE } from '../../app/src/config.js';
import {
  currentStage, welcomeTitle, recap, canLive, defaultChoices, startPlan, setChoice, startLive, finishLive, nextMonth,
  wellbeingBars, moneyStrip,
} from '../../app/src/life/monthFlow.js';
import { describeHome, describeSurroundings, livingThings } from '../../app/src/life/homeDescription.js';
import { LOCATIONS } from '../../app/src/data/locations/index.js';

const NOW = Date.UTC(2026, 9, 2);
const KINDS = ['apartment', 'shared', 'condo', 'house', 'build'];

test('welcomeTitle uses the real calendar', () => {
  assert.equal(welcomeTitle(0), 'Welcome to January, 2033.');
  assert.equal(welcomeTitle(1), 'Welcome to February, 2033.');
  assert.equal(welcomeTitle(12), 'Welcome to January, 2034.');
});

test('every life-month1 seed is a valid month-0 welcome with its home kind', () => {
  for (const kind of KINDS) {
    const s = seeds[`life-month1-${kind}`].build(NOW);
    assert.deepEqual(validateState(s), [], kind);
    assert.equal(s.phase, 'life');
    assert.equal(s.home.kind, kind);
    assert.equal(s.life.monthIndex, 0);
    assert.equal(currentStage(s), 'welcome');
  }
});

test('the month cycles welcome → plan → live → summary → next welcome and records history', () => {
  const s = seeds['life-month1-apartment'].build(NOW);
  startPlan(s);
  assert.equal(currentStage(s), 'plan');
  assert.deepEqual(s.life.current.choices, LIFE.defaults);
  assert.ok(canLive(s.life.current.choices));
  setChoice(s, 'exercise', undefined);
  assert.equal(startLive(s), false, 'refuses with a missing answer');
  assert.equal(currentStage(s), 'plan');
  setChoice(s, 'exercise', 7);
  assert.equal(startLive(s), true);
  assert.equal(currentStage(s), 'live');
  assert.deepEqual(s.life.current.care, { shown: 0, hits: 0 });
  finishLive(s);
  assert.equal(currentStage(s), 'summary');
  nextMonth(s);
  assert.equal(s.life.monthIndex, 1);
  assert.equal(currentStage(s), 'welcome');
  assert.equal(s.life.history.length, 1);
  assert.equal(s.life.history[0].choices.exercise, 7);
  assert.deepEqual(validateState(s), []);
  // last month's answers are pre-selected next time
  assert.equal(defaultChoices(s).exercise, 7);
  assert.throws(() => finishLive(s));
});

test('recap: move-in line first, then last month\'s numbers and warnings', () => {
  const s = seeds['life-month1-house'].build(NOW);
  assert.match(recap(s).line, /just moved in/);
  s.life.history.push({ monthIndex: 0, choices: {}, result: { incomeCents: 320000, expenseCents: 350000,
    warnings: ['You missed a rent payment.'] } });
  const r = recap(s);
  assert.match(r.line, /In January you brought in \$3,200 and spent \$3,500/);
  assert.deepEqual(r.warnings, ['You missed a rent payment.']);
});

test('wellbeing bars: five domains in 09 §1 order with last change', () => {
  const s = seeds['life-month1-condo'].build(NOW);
  const bars = wellbeingBars(s);
  assert.deepEqual(bars.map((b) => b.label), ['Physical health', 'Sense of purpose', 'Financial', 'Social fulfillment', 'Mental health']);
  assert.ok(bars.every((b) => b.value === 60 && b.change === null));
  s.life.history.push({ monthIndex: 0, choices: {}, result: { wellbeingBefore: { physical: 60 }, wellbeingAfter: { physical: 63 } } });
  s.life.wellbeing.physical = 63;
  assert.deepEqual(wellbeingBars(s)[0], { key: 'physical', label: 'Physical health', value: 63, change: 3 });
});

test('money strip: accounts, card owed, investments only when held, net worth', () => {
  const s = seeds['life-month1-house'].build(NOW);
  const keys = moneyStrip(s).map((x) => x.key);
  assert.deepEqual(keys.filter((k) => k !== 'card'), ['checking', 'savings', 'net']);
  assert.equal(keys.includes('card'), !!s.finances.creditCard);
  s.finances.investments.low.valueCents = 50000;
  assert.ok(moneyStrip(s).some((x) => x.key === 'investments' && x.cents === 50000));
});

test('home descriptions name the place and the living things', () => {
  const house = seeds['life-month1-house'].build(NOW);
  assert.match(describeHome(house), /house in Katy with a garden bed, a cat and three chickens\.$/);
  house.home.animals.forEach((a) => { if (a.kind === 'chicken') a.present = false; });
  assert.equal(livingThings(house.home), 'a garden bed and a cat');
  assert.match(describeHome(seeds['life-month1-apartment'].build(NOW)), /^Unit \w+, on floor \d+ of .* in Hilo\./);
  assert.match(describeHome(seeds['life-month1-build'].build(NOW)), /you designed in Pāhoa/);
  for (const kind of KINDS) assert.doesNotMatch(describeHome(seeds[`life-month1-${kind}`].build(NOW)), /undefined|NaN/);
});

test('describeSurroundings names the settlement and the far landmark for every place (13 §11)', () => {
  for (const loc of LOCATIONS) {
    const text = describeSurroundings({ home: { locationId: loc.id } });
    assert.match(text, /^Around it is .+, and far off you can see .+\.$/, loc.id);
    assert.doesNotMatch(text, /undefined/);
  }
  assert.match(describeSurroundings(seeds['life-month1-build'].build(NOW)), /Kīlauea/);
});
