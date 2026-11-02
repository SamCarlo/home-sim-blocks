// Results numbers (05 §8, task 31). Pure: everything the Results screen shows, computed from the save and the stored
// underwriting decisions *before* commit runs, with the same helpers commit uses, so the screen and the ledger agree.
// resultsSummary(state, decisions) → {approved, home, card, receive, payNow, monthly, loan, lease, insurance, cardTerms,
// ifYouDontPay, nextSteps, letterSteps}.
import { CREDIT, LIFE, LEASE } from '../../config.js';
import { sumCents, mulRate, formatMoney } from '../../finance/money.js';
import { cashOf } from '../../finance/grid.js';
import { homeApproved } from '../../finance/underwriting.js';
import { payoffExample, durationText } from '../../finance/creditCard.js';
import { lateFee } from './steps/lease.js';
import { recurringFor, baseMonth } from './commit.js';
import { moveOutQuote } from '../../life/relocation.js';

const money = (c) => formatMoney(c);

/** The letter steps behind each decision kind (credit-explanation is added when it was written this attempt). */
export function letterStepsFor(kind, state) {
  const base = { lease: ['rental-cover'], cosigner: ['cosigner-request'], roommates: ['roommate-intro'],
    mortgage: ['loan-purpose'], construction: ['construction-purpose'] }[kind] ?? [];
  const extra = (kind === 'mortgage' || kind === 'construction') && state.paperwork.steps['credit-explanation']?.status === 'done'
    ? ['credit-explanation'] : [];
  return [...base, ...extra];
}

/** "Finances ×0.85 · Letter ×0.92 · Credit ×1.0" (05 §8). */
export const factorLine = (d) => d.factors.map((f) => `${f.label} ×${+f.value.toFixed(2)}`).join(' · ');

/** The loan commit will open for an approved home decision, as {label, paymentCents, pmiCents} (no id yet), or null. */
export function loanPreview(home) {
  const t = home?.terms ?? {};
  if (home?.kind === 'mortgage') return { id: 'new', label: `${t.termMonths / 12}-year mortgage`, paymentCents: t.paymentCents, pmiCents: t.mortgageInsuranceCents ?? 0 };
  if (home?.kind === 'construction') return { id: 'new', label: 'Construction-to-permanent loan', paymentCents: t.paymentCents, pmiCents: 0 };
  return null;
}

/** Cash paid at commit: the decision's upfront lines (a repair credit is negative) plus a secured card's deposit. */
function payNowFor(state, home, card, approved) {
  const lines = approved ? (home.terms.upfront ?? []).map((l) => ({ label: l.label, cents: l.cents })) : [];
  if (card?.approved && card.terms.depositCents) lines.push({ label: 'Secured card deposit (you get it back when you close the card)', cents: card.terms.depositCents });
  const totalCents = Math.max(0, sumCents(lines.map((l) => l.cents)));
  const cashBeforeCents = cashOf(state);
  const alreadyPaidCents = sumCents(Object.values(state.paperwork.paidUpfront ?? {}));
  return { lines, totalCents, cashBeforeCents, cashAfterCents: cashBeforeCents - totalCents, alreadyPaidCents };
}

/** "If you don't pay…" (05 §8, 09 §6) with the student's own numbers. */
function consequences(home, card, approved) {
  const out = [];
  const t = home?.terms ?? {};
  const streak = LIFE.evictionStreak;
  const hit = CREDIT.missedPaymentCost;
  if (approved && (home.kind === 'lease' || home.kind === 'roommates')) {
    const day10 = lateFee(10);
    out.push({ key: 'rent', title: `Rent (${money(t.rentCents)} a month)`, items: [
      `Rent is due on the 1st. After the ${LEASE.lateFeeGraceDay}th there's a ${money(LEASE.lateFeeCents)} late fee plus ${money(LEASE.lateFeePerDayCents)} a day (${money(day10)} by the 10th).`,
      `After ${LEASE.lateFeeGraceDay} days the landlord sends a written notice.`,
      `A missed month costs about ${hit} to 100 points on your credit score.`,
      `In the game, ${streak} missed rent payments in a row means eviction: you have to leave and find a new home.`] });
  }
  if (approved && (home.kind === 'mortgage' || home.kind === 'construction')) {
    const fee = mulRate(t.paymentCents, LIFE.lateFees.housingPct);
    const down = (home.terms.upfront ?? []).find((l) => l.key === 'down-payment')?.cents ?? Math.max(0, (t.priceCents ?? 0) - (t.principalCents ?? 0));
    out.push({ key: 'mortgage', title: `${home.kind === 'mortgage' ? 'Mortgage' : 'Loan'} (${money(t.paymentCents)} a month)`, items: [
      `More than 15 days late: a ${Math.round(LIFE.lateFees.housingPct * 100)}% late fee (${money(fee)}).`,
      `30 days late: the lender reports it and your credit score drops about ${hit} points.`,
      `After 120 days the lender can foreclose. In the game, ${streak} missed payments in a row means foreclosure: you lose the home and the ${money(down)} you put down, and your score drops another ${CREDIT.foreclosureCost} points.`] });
  }
  if (card?.approved) {
    const ex = payoffExample({ apr: card.terms.apr });
    out.push({ key: 'card', title: `Credit card (${money(card.terms.limitCents)} limit)`, items: [
      `Pay at least the minimum by the due date or there's a ${money(card.terms.lateFeeCents ?? CREDIT.card.lateFeeCents)} late fee.`,
      `Paying late can raise your rate to the penalty APR of ${(CREDIT.card.penaltyApr * 100).toFixed(2)}% and drops your score about ${hit} points.`,
      `If you only pay the minimum on ${money(ex.balanceCents)}, it takes ${durationText(ex.minimum.months)} and costs ${money(ex.minimum.interestCents)} in interest. Paying the full statement costs $0.`] });
  }
  return out;
}

/** What to try next after a denial (12 §7: plain, kind, always a path forward). */
function nextStepsFor(home, letters) {
  const tips = [];
  const low = (label) => home.factors.some((f) => f.label === label && f.value < 1);
  if (home.hardFail) tips.push('Look for homes marked green on the plan table: their costs fit your pay and savings.');
  else if (low('Finances')) tips.push('A cheaper home raises your chances: the lower the housing cost compared with your pay, the better.');
  if (home.kind === 'lease' && home.hardFail && /co-signer/.test(home.reasons.join(' '))) {
    tips.push('Pick a home where the rent is less than 40% of your take-home pay, or one where a co-signer letter is offered.');
  }
  if (letters.some((l) => (l.likelihood ?? 100) < 70)) tips.push('Rewrite your letter. Start with the first thing under "What hurt" in its report.');
  if (low('Credit')) tips.push('Your credit score goes up a little every month you pay every bill on time.');
  if (low('Contractor')) tips.push('A contractor with better reviews makes the bank less nervous.');
  if (low('Reserves')) tips.push('Keep more savings after closing, for example with a smaller down payment or a cheaper home.');
  if (!home.hardFail) tips.push(`Your chance was ${Math.round(home.probability * 100)}%. Applying again gets a brand-new decision.`);
  tips.push('Your letters stay in your portfolio, and the money you didn\'t spend on fees is still yours.');
  return tips;
}

/**
 * Everything the Results screen shows (05 §8). `letters` = [{likelihood}] for this attempt (for the next-step tips).
 * Pure: reads the state, never changes it.
 */
export function resultsSummary(state, decisions, { letters = [] } = {}) {
  const approved = homeApproved(decisions);
  const home = decisions.find((d) => d.required) ?? null;
  const card = decisions.find((d) => d.kind === 'credit-card') ?? null;
  const t = home?.terms ?? {};
  const loan = approved ? loanPreview(home) : null;

  const receive = [];
  if (loan) receive.push({ label: `${loan.label} from ${t.lender}`, cents: t.principalCents,
    note: home.kind === 'mortgage' ? 'Paid straight to the seller for you. You never hold this money.' : 'Paid to your builder as the work gets done.' });
  if (card?.approved) receive.push({ label: `${card.terms.secured ? 'Secured credit card' : 'Credit card'} limit`, cents: card.terms.limitCents,
    note: 'Not money you have: it is how much you can borrow on the card.' });

  const payNow = payNowFor(state, home, card, approved);

  let monthly = null;
  if (approved) {
    const items = recurringFor(state, home, loan).map((r) => ({ label: r.label, cents: r.amountCents, category: r.category, startsMonth: r.startsMonth, endsMonth: r.endsMonth ?? null }));
    const totalCents = sumCents(items.map((i) => i.cents));
    const incomeCents = state.player.netMonthlyIncomeCents;
    const base = baseMonth(state); // 0 for a first home, the current month after a move (task 58)
    const firstCents = sumCents(items.filter((i) => i.startsMonth === base).map((i) => i.cents));
    monthly = { items, totalCents, incomeCents, leftCents: incomeCents - totalCents, firstCents, baseMonth: base,
      laterStart: items.some((i) => i.startsMonth > base) };
  }

  const loanSummary = loan ? { lender: t.lender, label: loan.label, principalCents: t.principalCents, rate: t.rate, termMonths: t.termMonths,
    paymentCents: t.paymentCents, totalInterestCents: t.totalInterestCents, totalPaidCents: t.principalCents + t.totalInterestCents,
    priceCents: t.priceCents, buildMonths: t.buildMonths ?? null } : null;
  const lease = approved && (home.kind === 'lease' || home.kind === 'roommates')
    ? { landlord: t.landlord, rentCents: t.rentCents, depositCents: t.depositCents, firstMonthCents: t.firstMonthCents, termMonths: t.termMonths, cosigned: !!t.cosigned }
    : null;
  const ins = state.paperwork.options.insurance;
  const insurance = approved && ins ? { title: ins.title, insurer: ins.insurer, quoteLabel: ins.quoteLabel, monthlyCents: ins.monthlyCents,
    deductibleCents: ins.deductibleCents, addOns: ins.addOns ?? [] } : null;
  const cardTerms = card?.approved ? { ...card.terms } : null;

  // Moving from Live (task 58): what leaving the old home brings or costs. cashOf already counts it in payNow.
  const moveOut = approved && state.relocation && !state.relocation.movedOut ? moveOutQuote(state) : null;
  return { approved, home, card, receive, payNow, moveOut, monthly, loan: loanSummary, lease, insurance, cardTerms,
    ifYouDontPay: consequences(home, card, approved), nextSteps: approved || !home ? [] : nextStepsFor(home, letters) };
}
