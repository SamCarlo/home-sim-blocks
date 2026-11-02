// Commit the paperwork (05 §8): apply the underwriting decisions to the save. Pure: mutates the store.update draft it
// is given. Approved → charge what's still owed upfront, open the loan, add the monthly bills, activate the agreements,
// move to design. Denied → void the agreements, refund earnest money if the contingency was kept, record the attempt,
// reset paperwork (letters and fees stay) and go back to plan. The credit card is handled on its own either way.
// A student moving from Phase 4 (state.relocation, task 58) leaves the old home first (life/relocation.js moveOut), and
// the new bills and loan start in the current life month instead of month 0.
// Callers: store.update((s) => commitPaperwork(s, decisions, now), {checkpoint: result.approved ? 'paperwork-committed' : 'paperwork-denied'}).
import { CREDIT } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { freshPaperwork } from '../../state/schema.js';
import { charge, post, addRecurring, openLoan, pmiSource, setAgreementStatus, resolveApplication, markUpfrontPaid,
  available, PAPERWORK_MONTH } from '../../finance/ledger.js';
import { homeApproved } from '../../finance/underwriting.js';
import { formatMoney } from '../../finance/money.js';
import { moveOut } from '../../life/relocation.js';

const M = PAPERWORK_MONTH;
const CARD_APP_KINDS = new Set(['credit-card', 'card']);
const CARD_AGREEMENT_TYPES = new Set(['card', 'credit-card']);

/** The life month the new home starts in: 0 for a first home, the next unlived month after a move (task 58). */
export const baseMonth = (state) => state.life?.monthIndex ?? 0;

/** Monthly line `key` from the chosen home's snapshot, or null. */
const monthlyLine = (state, key) => (state.choice.snapshot?.breakdown?.monthly ?? []).find((l) => l.key === key) ?? null;

/**
 * The recurring bills an approved home adds (05 §8): housing payment, PMI/MIP, escrowed tax, HOA, special assessment,
 * rent, insurance, utilities and the location's living costs. `loan` is the opened loan (buyers/builders) or null.
 * Housing bills for a build start when the house is finished (`terms.buildMonths`); the interest reserve and
 * temporary-housing lines paid upfront cover the months before. Everything is offset by `baseMonth`.
 */
export function recurringFor(state, home, loan) {
  const type = state.choice.homeTypeId;
  const loc = byId[state.choice.locationId];
  const o = state.paperwork.options;
  const base = baseMonth(state);
  const startsMonth = base + (type === 'build' ? (home.terms.buildMonths ?? 0) : 0);
  const items = [];
  const add = (label, amountCents, category, source, extra = {}) => {
    if (amountCents > 0) items.push({ label, amountCents, category, source, startsMonth, ...extra });
  };
  if (loan) {
    add(`${loan.label} payment`, loan.paymentCents, 'housing', `loan:${loan.id}`);
    if (loan.pmiCents) add(home.terms.insuranceKind === 'mip' ? 'FHA mortgage insurance (MIP)' : 'PMI', loan.pmiCents, 'housing', pmiSource(loan.id));
    add('Property tax (escrow)', monthlyLine(state, 'property-tax')?.cents ?? 0, 'housing', 'escrow');
    add('HOA dues', monthlyLine(state, 'hoa')?.cents ?? 0, 'housing', 'hoa');
    const sa = o.specialAssessment;
    if (sa?.monthlyCents) add(sa.label ?? 'Special assessment', sa.monthlyCents, 'housing', 'hoa', sa.months ? { endsMonth: startsMonth + sa.months - 1 } : {});
  } else {
    add('Rent', home.terms.rentCents ?? monthlyLine(state, 'rent')?.cents ?? 0, 'housing', 'lease');
  }
  if (o.insurance?.recurring) {
    const r = o.insurance.recurring;
    add(r.label, Math.abs(r.amountCents), 'insurance', 'insurance');
  } else {
    for (const k of ['renters-insurance', 'insurance', 'hazard']) {
      const l = monthlyLine(state, k);
      if (l) add(l.label, l.cents, 'insurance', 'insurance');
    }
  }
  add('Utilities', monthlyLine(state, 'utilities')?.cents ?? 0, 'utilities', 'utility');
  // Living costs (03 §2 living) start right away, wherever the student lives while building.
  const living = loc.living ?? {};
  const now = (label, cents, category) => { if (cents > 0) items.push({ label, amountCents: cents, category, source: 'living', startsMonth: base }); };
  now('Groceries', living.groceriesMonthlyCents ?? 0, 'food');
  now(`Transportation (${living.transport?.mode ?? 'car'})`, living.transport?.monthlyCents ?? 0, 'transportation');
  now('Phone', living.phoneMonthlyCents ?? 0, 'utilities');
  now('Internet', living.internetMonthlyCents ?? 0, 'utilities');
  return items;
}

/** Open the card from an approved decision (05 §6); a secured card's deposit comes out of savings. → the card or null. */
function openCard(state, d) {
  const t = d.terms;
  if (t.depositCents) {
    const r = charge(state, 'savings', t.depositCents, { month: M, label: 'Secured card deposit (refunded if you close the card)', category: 'fees' });
    if (!r.ok) {
      d.approved = false;
      d.reasons = [`You didn't have the ${formatMoney(t.depositCents)} deposit for the secured card.`];
      return null;
    }
  }
  state.finances.creditCard = { limitCents: t.limitCents, balanceCents: 0, apr: t.apr, minPaymentRule: 'standard',
    lateFeeCents: t.lateFeeCents ?? CREDIT.card.lateFeeCents, graceDays: t.graceDays ?? CREDIT.card.graceDays,
    autopay: t.autopay ?? 'full', openedMonth: M, secured: !!t.secured, depositCents: t.depositCents ?? 0, carriedLastMonth: false };
  return state.finances.creditCard;
}

/** The card on its own (05 §8): opens if accepted and approved, whatever happened to the home. */
function commitCard(state, card) {
  const opened = card?.approved ? openCard(state, card) : null;
  for (const a of state.finances.applications) {
    if (a.status === 'pending' && CARD_APP_KINDS.has(a.kind)) resolveApplication(state, a.id, { approved: !!opened, reasons: card?.reasons ?? [] });
  }
  for (const a of state.finances.agreements) {
    if (a.status === 'pending' && CARD_AGREEMENT_TYPES.has(a.type)) setAgreementStatus(state, a.id, opened ? 'active' : 'void');
  }
  return opened;
}

/** Charge the decision's still-unpaid upfront lines from savings (then checking) in month −1. All or nothing → cents. */
function chargeUpfront(state, home) {
  const lines = (home.terms.upfront ?? []).filter((l) => l.cents > 0);
  const credit = -(home.terms.upfront ?? []).filter((l) => l.cents < 0).reduce((t, l) => t + l.cents, 0);
  const total = lines.reduce((t, l) => t + l.cents, 0) - credit;
  if (available(state, 'savings') + available(state, 'checking') < total) {
    throw new Error(`commitPaperwork: ${total} cents owed upfront but not enough cash (underwriting should have denied this)`);
  }
  let creditLeft = credit;
  for (const l of lines) {
    const cents = l.cents - Math.min(creditLeft, l.cents);
    creditLeft -= l.cents - cents;
    if (cents > 0) charge(state, 'savings', cents, { month: M, label: l.label, category: 'housing' });
    markUpfrontPaid(state, l.key, l.cents);
  }
  return total;
}

/** Open the loan for an approved mortgage or construction decision, or null for renters. */
function openHomeLoan(state, home) {
  const t = home.terms;
  const base = baseMonth(state);
  if (home.kind === 'mortgage') {
    return openLoan(state, { kind: 'mortgage', label: `${t.termMonths / 12}-year mortgage`, lender: t.lender,
      principalCents: t.principalCents, rate: t.rate, termMonths: t.termMonths, paymentCents: t.paymentCents, startMonth: base,
      priceCents: t.priceCents, pmiCents: t.mortgageInsuranceCents ?? 0, escrow: t.escrow });
  }
  if (home.kind === 'construction') {
    return openLoan(state, { kind: 'construction-perm', label: 'Construction-to-permanent loan', lender: t.lender,
      principalCents: t.principalCents, rate: t.rate, termMonths: t.termMonths, paymentCents: t.paymentCents,
      startMonth: base + (t.buildMonths ?? 0), priceCents: t.priceCents });
  }
  return null;
}

/**
 * Apply `decisions` (from finance/underwriting.js decide) to the state (05 §8). Mutates and returns
 * {approved, chargedCents, loan, recurring[], card}. Stores the decisions in paperwork.decisions first.
 */
export function commitPaperwork(state, decisions, now = 0) {
  const choice = state.choice;
  if (!choice) throw new Error('commitPaperwork needs a chosen home');
  const approved = homeApproved(decisions);
  const home = decisions.find((d) => d.required);
  const cardDecision = decisions.find((d) => d.kind === 'credit-card') ?? null;
  state.paperwork.decisions = decisions;
  const reasons = decisions.filter((d) => d.required).flatMap((d) => d.reasons);
  const result = { approved, chargedCents: 0, loan: null, recurring: [], card: null };

  if (approved) {
    if (state.relocation && !state.relocation.movedOut) result.movedOut = moveOut(state);
    result.chargedCents = chargeUpfront(state, home);
    result.loan = openHomeLoan(state, home);
    result.recurring = recurringFor(state, home, result.loan).map((r) => addRecurring(state, r));
    result.card = commitCard(state, cardDecision);
    for (const a of state.finances.agreements) if (a.status === 'pending') setAgreementStatus(state, a.id, 'active');
    for (const a of state.finances.applications) {
      if (a.status === 'pending') resolveApplication(state, a.id, { approved: true, reasons: home.reasons });
    }
    state.plan.attempts.push({ locationId: choice.locationId, homeTypeId: choice.homeTypeId, outcome: 'approved', reasons, at: now });
    state.home = { kind: choice.homeTypeId, locationId: choice.locationId, styleFamily: byId[choice.locationId].styleFamily,
      label: 'To be chosen', plants: [], animals: [],
      ...(home.terms.priceCents && home.kind !== 'lease' && home.kind !== 'roommates' ? { purchasePriceCents: home.terms.priceCents } : {}) };
    state.paperwork.committed = true;
    state.paperwork.lettersRevealed = true;
    state.phase = 'design';
    return result;
  }

  // Denied: the card still opens on its own; everything else for this home is undone. Fees stay spent.
  result.card = commitCard(state, cardDecision);
  for (const a of state.finances.agreements) if (a.status === 'pending') setAgreementStatus(state, a.id, 'void');
  for (const a of state.finances.applications) {
    if (a.status === 'pending') resolveApplication(state, a.id, { approved: false, reasons: home?.reasons ?? reasons });
  }
  const land = state.paperwork.options.land;
  if (land?.contingency && land.earnestCents > 0 && (state.paperwork.paidUpfront?.['down-payment'] ?? 0) >= land.earnestCents) {
    post(state, { month: M, label: 'Earnest money refunded (financing contingency)', amountCents: land.earnestCents,
      account: 'savings', category: 'housing' });
    result.refundCents = land.earnestCents;
  }
  state.plan.attempts.push({ locationId: choice.locationId, homeTypeId: choice.homeTypeId, outcome: 'denied', reasons, at: now });
  state.choice = null;
  state.paperwork = freshPaperwork();
  state.phase = 'plan';
  return result;
}
