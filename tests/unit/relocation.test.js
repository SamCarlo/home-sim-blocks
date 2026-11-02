// Moving from Phase 4 (task 58): the move-out quote, start/cancel, the commit that leaves the old home, and startLife.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeds, buildSeed, finishSteps, SAMPLE_APPLICATION, leaseValuesFor, CARD_ACCEPT } from '../../app/src/dev/seeds.js';
import { LEASE, RELOCATION } from '../../app/src/config.js';
import { mulRate } from '../../app/src/finance/money.js';
import { cashOf, buildGrid, gridCells } from '../../app/src/finance/grid.js';
import { decide, homeApproved } from '../../app/src/finance/underwriting.js';
import { applyChoice } from '../../app/src/phases/plan/detailModel.js';
import { commitPaperwork } from '../../app/src/phases/paperwork/commit.js';
import { buildingOptions, moveIn } from '../../app/src/phases/design/apartmentModel.js';
import { startPlan, setChoice } from '../../app/src/life/monthFlow.js';
import { validateState } from '../../app/src/state/schema.js';
import { moveDates } from '../../app/src/util/dates.js';
import { signDateLabel } from '../../app/src/forms/validate.js';
import {
  moveOutQuote, quoteText, canRelocate, startRelocation, canCancelRelocation, cancelRelocation, moveOut, startLife,
  activeLease, homeLoans, pendingMoveOutCents,
} from '../../app/src/life/relocation.js';

const plain = (s) => s.finances.checkingCents + s.finances.savingsCents;
const APARTMENT_STEPS = ['rental-application', 'rental-cover', 'renters-insurance', 'lease', 'move-in-payment', 'credit-card-offer'];

/** Run a Hilo apartment attempt from Plan to every step done (like a student would), on a relocating save. */
function hiloApartmentPaperwork(s) {
  const cell = gridCells(buildGrid(s)).find((c) => c.locationId === 'hilo' && c.homeTypeId === 'apartment');
  applyChoice(s, cell, 0);
  for (const id of APARTMENT_STEPS) {
    const v = id === 'rental-application' ? SAMPLE_APPLICATION : id === 'lease' ? leaseValuesFor(s)
      : id === 'move-in-payment' ? { 'only-if-approved': true, signature: 'Kai Mana' } : id === 'credit-card-offer' ? CARD_ACCEPT : undefined;
    finishSteps(s, [id], v ? { [id]: v } : {}, 0);
  }
  return s;
}

test('renter quote: deposit back, break fee inside the first lease term only', () => {
  const s = buildSeed('life-relocating');
  const lease = activeLease(s);
  assert.ok(lease, 'the Hilo apartment has an active lease');
  const rent = s.finances.recurring.find((r) => r.source === 'lease').amountCents;
  const q = moveOutQuote(s);
  assert.equal(q.kind, 'break-lease');
  assert.deepEqual(q.lines.map((l) => [l.key, l.cents]), [['deposit', lease.terms.depositCents], ['break-fee', -LEASE.breakMonths * rent]]);
  assert.equal(q.netCents, lease.terms.depositCents - LEASE.breakMonths * rent);
  s.life.monthIndex = LEASE.termMonths; // a full lease lived: no fee
  const after = moveOutQuote(s);
  assert.equal(after.kind, 'end-lease');
  assert.equal(after.netCents, lease.terms.depositCents);
});

test('owner quote: sale price − selling costs − loan payoff, and it can be negative', () => {
  const s = buildSeed('life-relocating-house');
  const price = s.home.purchasePriceCents;
  const [loan] = homeLoans(s);
  const q = moveOutQuote(s);
  assert.equal(q.kind, 'sell');
  assert.equal(q.netCents, price - mulRate(price, RELOCATION.sellingCostPct) - loan.balanceCents);
  s.home.purchasePriceCents = loan.balanceCents; // underwater once the selling costs come out
  assert.ok(moveOutQuote(s).netCents < 0);
  assert.match(quoteText(moveOutQuote(s).netCents), /to pay$/);
  assert.equal(quoteText(150000), '+$1,500 back');
});

test('cashOf counts the pending move-out while looking, and stops once moved out', () => {
  const s = buildSeed('life-relocating-house');
  const net = moveOutQuote(s).netCents;
  assert.equal(pendingMoveOutCents(s), net);
  assert.equal(cashOf(s), plain(s) + net);
  s.relocation.movedOut = true;
  assert.equal(cashOf(s), plain(s));
});

test('start: only from Live at welcome or plan; cancel goes back with life.current untouched', () => {
  const s = buildSeed('life-plan-filled');
  assert.equal(canRelocate(s), true);
  const before = structuredClone(s.life);
  const money = plain(s);
  startRelocation(s);
  assert.equal(s.phase, 'plan');
  assert.deepEqual(s.relocation.from, { kind: 'apartment', locationId: 'hilo', label: s.home.label });
  assert.equal(canRelocate(s), false);
  assert.deepEqual(validateState(s), []);
  // shop: choose a home and pay the first fee, then change our mind
  const cell = gridCells(buildGrid(s)).find((c) => c.locationId === 'hilo' && c.homeTypeId === 'shared');
  applyChoice(s, cell, 0);
  finishSteps(s, ['room-application'], { 'room-application': SAMPLE_APPLICATION }, 0);
  const fee = money - plain(s);
  assert.ok(fee > 0, 'the application fee was paid');
  assert.equal(canCancelRelocation(s), true);
  cancelRelocation(s, 0);
  assert.equal(s.phase, 'life');
  assert.equal(s.relocation, null);
  assert.equal(s.choice, null);
  assert.deepEqual(s.life, before, 'the month, its stage and the answers are exactly as they were');
  assert.equal(plain(s), money - fee, 'fees stay spent');
  assert.equal(s.plan.attempts.at(-1).outcome, 'withdrawn');
  assert.ok(s.finances.applications.every((a) => a.status !== 'pending'));
  assert.deepEqual(validateState(s), []);
});

test('canRelocate is false mid-month and after the summary', () => {
  const s = buildSeed('life-live-house');
  assert.equal(canRelocate(s), false);
  assert.throws(() => startRelocation(s), /only from Live/);
  assert.equal(canRelocate(buildSeed('life-summary')), false);
  assert.equal(canRelocate(buildSeed('plan-comfortable')), false);
});

test('moving: commit leaves the old home, the new one starts this month, the cat comes along', () => {
  // A Hilo apartment renter with a cat, three months in, moves to another Hilo apartment.
  let s = null, decisions = null;
  for (let seed = 1; seed < 60 && !decisions; seed++) {
    const t = buildSeed('life-relocating');
    t.meta.seed = seed;
    t.home.animals.push({ id: 'a1', kind: 'cat', name: 'Mochi', spot: 'yard', present: true, adoptedMonth: 0 });
    hiloApartmentPaperwork(t);
    const d = decide(t);
    if (homeApproved(d)) { s = t; decisions = d; }
  }
  assert.ok(s, 'some draw approves the new lease');
  const base = s.life.monthIndex;
  const historyLength = s.life.history.length;
  const oldRecurring = [...s.finances.recurring];
  const oldLease = activeLease(s);
  const quote = moveOutQuote(s);
  const cashBefore = cashOf(s);
  const res = commitPaperwork(s, decisions, 0);
  assert.equal(res.approved, true);
  assert.deepEqual(res.movedOut.lines, quote.lines);
  assert.equal(cashBefore - cashOf(s), res.chargedCents, 'cashOf already counted the move-out');
  assert.equal(s.finances.agreements.find((a) => a.id === oldLease.id).status, 'ended');
  assert.ok(oldRecurring.length > 0);
  assert.equal(s.finances.recurring.length, res.recurring.length, 'only the new home’s bills are left');
  assert.ok(s.finances.recurring.every((r) => r.startsMonth === base), 'new bills start this month');
  assert.equal(s.finances.recurring.filter((r) => r.source === 'lease').length, 1);
  const newLease = activeLease(s);
  assert.equal(newLease.terms.startMonth, base);
  assert.equal(newLease.signedMonth, base);
  assert.equal(newLease.terms.startLabel, moveDates(base).moveInLabel);
  assert.equal(s.phase, 'design');
  assert.equal(s.relocation.movedOut, true);
  assert.equal(canCancelRelocation(s), false);
  // Move in: the calendar keeps going, the cat joins the new home.
  const o = buildingOptions(s)[0];
  const r = moveIn(s, { index: 0, floor: o.floors[0], unit: 0, plants: 0 });
  assert.equal(r.ok, true);
  assert.equal(s.phase, 'life');
  assert.equal(s.life.monthIndex, base);
  assert.equal(s.life.history.length, historyLength);
  assert.deepEqual(s.life.current, { stage: 'welcome' });
  assert.equal(s.relocation, null);
  assert.deepEqual(s.home.animals.map((a) => [a.kind, a.name]), [['cat', 'Mochi']]);
  assert.deepEqual(validateState(s), []);
});

test('moveOut on a house: sale posted, loan closed as sold, hens stay behind', () => {
  const s = buildSeed('life-relocating-house');
  const money = plain(s);
  const q = moveOutQuote(s);
  moveOut(s);
  assert.equal(plain(s), money + q.netCents);
  assert.equal(homeLoans(s).length, 0);
  assert.equal(s.finances.loans[0].closedReason, 'sold');
  assert.equal(s.finances.recurring.length, 0);
  assert.deepEqual(s.relocation.pets.map((a) => a.kind), ['cat']);
  assert.ok(s.finances.agreements.filter((a) => a.type === 'credit-card').every((a) => a.status === 'active'), 'the card stays open');
});

test('startLife keeps the month after an eviction instead of restarting January 2033', () => {
  const s = buildSeed('life-overdue');
  s.life.monthIndex = 7;
  s.life.current = null;
  startLife(s);
  assert.equal(s.life.monthIndex, 7);
  assert.deepEqual(s.life.current, { stage: 'welcome' });
  assert.equal(s.phase, 'life');
});

test('paperwork dates follow the start month', () => {
  assert.deepEqual(moveDates(0), { signLabel: 'December 2032', moveInLabel: 'January 1, 2033' });
  assert.deepEqual(moveDates(14), { signLabel: 'February 2034', moveInLabel: 'March 1, 2034' });
  assert.equal(signDateLabel(seeds['paperwork-apartment-start'].build(0)), 'December 2032');
  const s = buildSeed('life-relocating');
  assert.equal(signDateLabel(s), 'March 2033');
});

test('the plan answers survive a relocation round-trip from the plan stage', () => {
  const s = buildSeed('life-month1-apartment');
  startPlan(s);
  setChoice(s, 'exercise', 7);
  startRelocation(s);
  assert.equal(s.relocation.stage, 'plan');
  cancelRelocation(s, 0);
  assert.equal(s.life.current.stage, 'plan');
  assert.equal(s.life.current.choices.exercise, 7);
});
