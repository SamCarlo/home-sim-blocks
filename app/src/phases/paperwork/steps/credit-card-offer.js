// Credit card offer (05 §6, task 30): the teacher's explanation, a Schumer box, the worked payoff example, an autopay
// choice and accept/decline. Accepting records a hard inquiry, a pending 'credit-card' application and a pending
// agreement; underwriting (task 29) reads paperwork.options.card and the card opens at Results if approved.
// Declining is kept as a void agreement so the portfolio shows it. The offer is one-time: once a card is open or an
// earlier offer was answered, this step only says so.
import { CREDIT } from '../../../config.js';
import { formatMoney } from '../../../finance/money.js';
import { offerFor, payoffExample, durationText } from '../../../finance/creditCard.js';
import { addAgreement, addApplication, inquiryMonth } from '../../../finance/ledger.js';
import { recordInquiry } from '../../../finance/creditScore.js';
import { businessFor } from '../../../content/names.js';
import { setStep } from '../flow.js';

/** The teacher's explanation, verbatim (05 §6). */
export const CARD_EXPLANATION = 'A credit card can help you build credit and cover expenses if you ever have a burst of '
  + 'spending, like car repairs, a vacation, or the holidays. If you pay the full balance every month, you pay no interest. '
  + 'If you carry a balance, interest adds up fast.';

const pct = (r) => `${(r * 100).toFixed(2)}%`;
const money = (c) => formatMoney(c, { showCents: c % 100 !== 0 });

/** The Schumer box rows for an offer: [{item, terms}]. */
export function schumerRows(o) {
  return [
    { item: 'Annual Percentage Rate (APR) for purchases', terms: `${pct(o.apr)}` },
    { item: 'Penalty APR and when it applies', terms: `Up to ${pct(o.penaltyApr)} if you pay late` },
    { item: 'How to avoid paying interest', terms: `Pay your full balance by the due date. Your due date is at least ${o.graceDays} days after each statement (the grace period).` },
    { item: 'Minimum payment', terms: `The greater of ${money(o.minPaymentFloorCents)} or ${o.minPaymentPct * 100}% of the balance plus that month’s interest` },
    { item: 'Credit limit', terms: money(o.limitCents) },
    { item: 'Annual fee', terms: o.annualFeeCents ? money(o.annualFeeCents) : 'None' },
    { item: 'Late payment fee', terms: `Up to ${money(o.lateFeeCents)}` },
    ...(o.secured ? [{ item: 'Security deposit', terms: `${money(o.depositCents)} from savings, given back if you close the card` }] : []),
  ];
}

/** The worked example's sentences for an offer. */
export function exampleText(o) {
  const ex = payoffExample(o);
  return [
    `Say you charge ${money(ex.balanceCents)} and then pay only the minimum each month (it starts at `
      + `${money(ex.firstMinimumCents)} and never drops under ${money(o.minPaymentFloorCents)}). It takes `
      + `${ex.minimum.months} months (${durationText(ex.minimum.months)}) to pay off, and you pay `
      + `${money(ex.minimum.interestCents)} in interest on top of the ${money(ex.balanceCents)}.`,
    `Pay ${money(ex.fixed.paymentCents)} a month instead and it’s gone in ${ex.fixed.months} months, with `
      + `${money(ex.fixed.interestCents)} in interest.`,
    'Pay the full balance every month and the interest is $0.',
  ];
}

/** The offer document for these terms (also the read-only portfolio view; terms = offerFor + issuer). */
export function cardSchema(o) {
  const issuer = o.issuer ?? 'The bank';
  return {
    id: 'credit-card-offer',
    title: `${issuer} ${o.secured ? 'secured ' : ''}credit card offer`,
    intro: `${issuer} is offering you a credit card. Read the terms, then accept or decline. Either answer is fine.`,
    submitLabel: 'Submit my answer',
    sections: [
      { id: 'why', title: '1. What a credit card is for', fields: [
        { kind: 'info', tone: 'teach', label: 'Why have one?', text: CARD_EXPLANATION },
        { id: 'card', kind: 'computed', label: 'Your offer', width: 'half',
          compute: () => `${o.secured ? 'Secured card' : 'Regular card'}, ${money(o.limitCents)} limit` },
        { id: 'score', kind: 'computed', label: 'Based on your credit score', width: 'half', compute: () => String(o.score) },
        ...(o.secured ? [{ kind: 'info', tone: 'note', label: 'A secured card',
          text: `Your score is under ${CREDIT.card.tiers.at(-2).minScore}, so the bank offers a secured card. You put down a `
            + `${money(o.depositCents)} deposit and that is your limit. Use it well and your score goes up.` }] : []),
      ] },
      { id: 'terms', title: '2. The terms (the “Schumer box”)', fields: [
        { id: 'box', kind: 'table', label: 'Interest rates and fees', columns: [
          { key: 'item', label: 'What it is' }, { key: 'terms', label: 'Your card' }], rows: schumerRows(o) },
        { kind: 'info', tone: 'note', label: 'What APR means',
          text: `APR is the yearly interest rate. Each month you carry a balance, the bank adds about ${pct(o.apr / 12)} `
            + '(the APR ÷ 12) of it as interest.' },
      ] },
      { id: 'example', title: '3. What a balance really costs', fields: [
        { kind: 'info', tone: 'teach', label: `A worked example at ${pct(o.apr)} APR`, text: exampleText(o) },
      ] },
      { id: 'choice', title: '4. Your answer', fields: [
        { id: 'decision', kind: 'radio', label: 'Do you want this card?', required: true,
          options: [{ value: 'accept', label: 'Accept the card' }, { value: 'decline', label: 'No thanks' }] },
        { id: 'autopay', kind: 'radio', label: 'Autopay from checking each month', required: true, default: 'full',
          when: (v) => v.decision === 'accept',
          options: [{ value: 'full', label: 'Pay the full balance (recommended: no interest ever)' },
            { value: 'minimum', label: 'Pay only the minimum' }] },
        { kind: 'info', tone: 'warn', label: 'Minimum payments are expensive',
          when: (v) => v.decision === 'accept' && v.autopay === 'minimum',
          text: `Anything you don’t pay is charged ${pct(o.apr)} interest. You can switch to full payments later.` },
        { kind: 'info', tone: 'warn', label: 'This is a hard credit check', when: (v) => v.decision === 'accept',
          text: `Applying for a card lowers your score about ${CREDIT.hardInquiryCost} points for ${CREDIT.inquiryRecoverMonths} months.`
            + (o.secured ? ` The ${money(o.depositCents)} deposit comes out of savings when the card opens.` : '') },
        { id: 'auth', kind: 'checkbox', required: true, when: (v) => v.decision === 'accept',
          label: 'I read the terms. I allow the bank to check my credit.' },
        { id: 'signature', kind: 'signature', label: 'Signature', required: true, when: (v) => v.decision === 'accept' },
        { kind: 'info', tone: 'note', label: 'Declining is fine', when: (v) => v.decision === 'decline',
          text: 'No credit check and no card. This offer won’t come back, but you can live without a card.' },
      ] },
    ],
  };
}

const attempt = (state) => state.plan.attempts.length;
const offerAgreements = (state) => state.finances.agreements.filter((x) => x.docType === 'credit-card-offer');

/** This attempt's answer (the agreement it made), or null. */
export const currentAnswer = (state) => offerAgreements(state).find((a) => a.terms?.attempt === attempt(state)) ?? null;

/** An earlier answer to the one-time offer: 'open' (a card exists), 'declined', 'accepted' (an earlier attempt) or null. */
export function priorAnswer(state) {
  if (state.finances.creditCard) return 'open';
  const a = offerAgreements(state).find((x) => x.terms?.attempt !== attempt(state));
  if (!a) return null;
  return a.terms?.declined ? 'declined' : 'accepted';
}

/** The terms for this player: offerFor + issuer name. */
export const cardTerms = (state) => ({ ...offerFor(state), issuer: businessFor(state, 'lenders', 'card-issuer') });

function priorSchema(answer) {
  const text = answer === 'declined' ? 'You declined the credit card offer on an earlier try. The offer was one-time.'
    : 'You already answered the credit card offer, so there’s nothing to do here.';
  return { id: 'credit-card-offer', title: 'Credit card offer', submitLabel: 'Continue',
    sections: [{ id: 'done', title: 'Already answered', fields: [{ kind: 'info', tone: 'note', label: 'One-time offer', text }] }] };
}

export default {
  id: 'credit-card-offer',
  title: 'Credit card offer',
  kind: 'form',
  schema: (state) => {
    const cur = currentAnswer(state);
    if (cur) return cardSchema(cur.terms);
    const prior = priorAnswer(state);
    return prior ? priorSchema(prior) : cardSchema(cardTerms(state));
  },
  /** Accept: hard inquiry + pending application + pending agreement. Decline: a void agreement. Then mark done. */
  complete(state, values, now = 0) {
    const id = 'credit-card-offer';
    const prior = currentAnswer(state) ? null : priorAnswer(state);
    if (prior) {
      state.paperwork.options.card = { accepted: false, prior };
      setStep(state, id, 'done', values, now);
      return { ok: true, shortfallCents: 0 };
    }
    const terms = cardTerms(state);
    const accepted = values.decision === 'accept';
    const autopay = accepted ? (values.autopay ?? 'full') : null;
    if (accepted) {
      recordInquiry(state, 'credit-card', inquiryMonth(state));
      addApplication(state, { kind: 'credit-card', target: terms.kind, feeCents: 0, at: now });
    }
    addAgreement(state, { type: 'credit-card', docType: id, status: accepted ? 'pending' : 'void',
      title: `${terms.secured ? 'Secured credit' : 'Credit'} card offer`, counterparty: terms.issuer, signedAt: accepted ? now : null,
      summary: accepted
        ? `${money(terms.limitCents)} limit at ${pct(terms.apr)} APR, autopay ${autopay === 'full' ? 'the full balance' : 'the minimum'}. Opens if approved.`
        : 'You declined this offer.',
      terms: { ...terms, autopay, declined: !accepted, attempt: attempt(state) }, docValues: values });
    state.paperwork.options.card = { accepted, autopay, pulledScore: terms.score };
    setStep(state, id, 'done', values, now);
    return { ok: true, shortfallCents: 0 };
  },
};
