// Lease (05 §3–§4, task 20): apartment (10 clauses) and room (8 clauses) variants, initials on every clause, three
// "find the trap" questions and a signature. Completion stores a pending lease agreement (docType 'lease') and the
// trap score (first-try correct answers, feedback only) in paperwork.options.leaseTrapScore.
import { LEASE } from '../../../config.js';
import { formatMoney } from '../../../finance/money.js';
import { addAgreement } from '../../../finance/ledger.js';
import { setStep } from '../flow.js';
import { renterTerms, partiesFields, variantOf } from './renterTerms.js';

const money = (c) => formatMoney(c);

/**
 * The late fee if rent arrives on `day` of the month (lease clause 2): nothing through the grace day, then the flat fee
 * plus the per-day fee for each day after the grace day. Cents.
 */
export function lateFee(day, { flatCents = LEASE.lateFeeCents, perDayCents = LEASE.lateFeePerDayCents,
  graceDay = LEASE.lateFeeGraceDay } = {}) {
  if (!(day > graceDay)) return 0;
  return flatCents + perDayCents * (day - graceDay);
}

/** The lease clauses for a variant ('apartment' 10, 'room' 8): [{id, key, title, text}], in order. */
export function leaseClauses(terms) {
  const room = terms.variant === 'room';
  const rentWord = room ? 'room rent' : 'rent';
  const all = [
    { key: 'renewal', title: 'Automatic renewal',
      text: `This lease lasts ${terms.termMonths} months. It renews for another ${terms.termMonths} months by itself `
        + `unless you tell the landlord in writing at least ${LEASE.renewalNoticeDays} days before it ends.` },
    { key: 'rent-due', title: 'Rent and late fees',
      text: `${room ? 'Room rent' : 'Rent'} of ${money(terms.rentCents)} is due on the 1st of each month. If it isn’t `
        + `paid by the ${LEASE.lateFeeGraceDay}th, you owe a ${money(LEASE.lateFeeCents)} late fee plus `
        + `${money(LEASE.lateFeePerDayCents)} for every day after the ${LEASE.lateFeeGraceDay}th.` },
    { key: 'wear-and-tear', title: 'Security deposit',
      text: `Your ${money(terms.depositCents)} deposit is held until you move out. The landlord may keep part of it `
        + 'to pay for damage and for normal wear and tear, like faded paint or worn carpet.' },
    { key: 'repairs', title: 'Repairs', apartmentOnly: true,
      text: `You pay the first ${money(LEASE.repairShareCents)} of any repair to the unit, even if you didn’t cause it.` },
    { key: 'guests', title: 'Guests',
      text: `A guest may stay up to ${LEASE.guestNights} nights in any 6 months. Longer stays need the landlord’s OK in writing.` },
    { key: 'pets', title: 'Pets',
      text: room
        ? 'No pets unless the homeowner and every housemate agree in writing first.'
        : `Pets only with written permission, a ${money(LEASE.petFeeCents)} pet fee and ${money(LEASE.petRentCents)} more each month.` },
    { key: 'breaking', title: 'Moving out early',
      text: `If you leave before the lease ends, you owe a fee of ${LEASE.breakMonths} months’ ${rentWord}.` },
    { key: 'entry', title: 'Landlord entry',
      text: `The landlord may come in after giving ${LEASE.entryNoticeDays} days’ notice, or any time in an emergency.` },
    { key: 'insurance', title: 'Renters insurance', apartmentOnly: true,
      text: 'You must keep renters insurance for your things the whole time you live here.' },
    { key: 'quiet', title: 'Quiet hours', text: `Quiet hours are ${LEASE.quietHours}, every day.` },
  ];
  return all.filter((c) => !(room && c.apartmentOnly)).map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

/** The three "find the trap" questions; the late-fee one is computed from clause 2. */
export function trapQuestions(terms) {
  const day = LEASE.lateQuestionDay;
  const g = LEASE.lateFeeGraceDay;
  const right = lateFee(day);
  const daily = LEASE.lateFeePerDayCents * (day - g);
  const fromFirst = LEASE.lateFeeCents + LEASE.lateFeePerDayCents * day;
  return [
    { id: 'q-date', kind: 'question', required: true, answer: 'renewal',
      label: 'Which clause could cost you money if you forget a date?',
      choices: [
        { value: 'quiet', label: 'Quiet hours', why: 'Quiet hours are about noise, not a deadline.' },
        { value: 'renewal', label: 'Automatic renewal' },
        { value: 'guests', label: 'Guests', why: 'Guest nights add up, but there is no single date to remember.' },
        { value: 'entry', label: 'Landlord entry', why: 'This one is a rule for the landlord, not a date for you.' },
      ],
      explanation: `If you forget to give notice ${LEASE.renewalNoticeDays} days before the end, you are locked in for `
        + `another ${terms.termMonths} months. Put the date on a calendar the day you sign.` },
    { id: 'q-allowed', kind: 'question', required: true, answer: 'wear-and-tear',
      label: 'Which clause probably isn’t allowed?',
      choices: [
        { value: 'rent-due', label: 'Rent and late fees', why: 'Late fees are allowed when the lease spells them out.' },
        { value: 'wear-and-tear', label: 'Security deposit (normal wear and tear)' },
        { value: 'breaking', label: 'Moving out early', why: 'A fee for breaking a lease early is common and allowed.' },
        { value: 'entry', label: 'Landlord entry', why: 'Landlords may enter with notice. In Hawaiʻi the notice is 2 days.' },
      ],
      explanation: 'In Hawaiʻi and most states, a landlord can’t take money from your deposit for normal wear and tear. '
        + 'They can only charge for real damage. A clause that says otherwise is a trap.' },
    { id: 'q-late', kind: 'question', required: true, answer: 'right',
      label: `If rent arrives on the ${day}th, what’s the late fee?`,
      choices: [
        { value: 'daily', label: money(daily), why: `That’s only the daily part. Add the ${money(LEASE.lateFeeCents)} flat fee too.` },
        { value: 'flat', label: money(LEASE.lateFeeCents), why: `The flat fee is just the start. Count the days after the ${g}th.` },
        { value: 'right', label: money(right) },
        { value: 'from-first', label: money(fromFirst), why: `The daily fee starts after the ${g}th, not on the 1st.` },
      ],
      explanation: `${money(LEASE.lateFeeCents)} + ${day - g} days × ${money(LEASE.lateFeePerDayCents)} = ${money(right)}. `
        + 'Paying on time is the cheapest option.' },
  ];
}

/** The lease schema for renter terms (also rebuilt from agreement.terms in the portfolio). */
export function leaseSchema(terms) {
  const room = terms.variant === 'room';
  const clauses = leaseClauses(terms);
  return {
    id: 'lease',
    title: room ? 'Room rental agreement (lease)' : 'Residential lease',
    intro: `This is a contract between you and ${terms.landlord}. Read every clause, initial it, then find the traps. `
      + 'Real leases are longer, but these clauses are the ones that cost people money.',
    submitLabel: 'Sign the lease',
    sections: [
      { id: 'parties', title: 'Who and where', fields: [
        ...partiesFields(terms),
        { id: 'rent', kind: 'computed', label: room ? 'Room rent' : 'Monthly rent', width: 'half', format: 'money',
          compute: () => terms.rentCents },
        { id: 'deposit', kind: 'computed', label: 'Security deposit', width: 'half', format: 'money',
          compute: () => terms.depositCents },
        { id: 'term', kind: 'computed', label: 'Term', width: 'half', compute: () => `${terms.termMonths} months` },
        { id: 'start', kind: 'computed', label: 'Start date', width: 'half', compute: () => terms.startLabel },
      ] },
      { id: 'clauses', title: `The ${clauses.length} clauses`, fields: [
        { id: 'init', kind: 'initials', label: 'Read each clause and initial it', required: true,
          clauses: clauses.map((c) => ({ id: c.id, text: `${c.title}. ${c.text}` })) },
      ] },
      { id: 'traps', title: 'Find the trap', intro: 'Leases can hide clauses that cost you. Answer all three to go on.',
        fields: trapQuestions(terms) },
      { id: 'sign', title: 'Sign', fields: [
        { id: 'signature', kind: 'signature', label: 'Tenant signature', required: true },
        { id: 'landlord-signature', kind: 'computed', label: 'Landlord', compute: () => `${terms.landlordContact} (signs after approval)` },
      ] },
    ],
  };
}

/** How many trap questions were right on the first try (feedback only, 05 §4). */
export function trapScore(values = {}) {
  return ['q-date', 'q-allowed', 'q-late'].filter((id) => values[id]?.firstTry).length;
}

/** Lease terms worth keeping on the agreement (renterTerms plus the clause numbers). */
export function leaseAgreementTerms(terms) {
  return { ...terms, lateFeeCents: LEASE.lateFeeCents, lateFeePerDayCents: LEASE.lateFeePerDayCents,
    lateFeeGraceDay: LEASE.lateFeeGraceDay, renewalNoticeDays: LEASE.renewalNoticeDays, startMonth: terms.startMonth ?? 0 };
}

export default {
  id: 'lease',
  title: 'Lease',
  kind: 'form',
  schema: (state) => leaseSchema(renterTerms(state)),
  /** Store a pending lease agreement with the signed values, plus the trap score; then mark done. */
  complete(state, values, now = 0) {
    const terms = renterTerms(state);
    const room = variantOf(state) === 'room';
    addAgreement(state, {
      type: 'lease', docType: 'lease', title: `${room ? 'Room lease' : 'Apartment lease'} (${terms.placeName})`,
      counterparty: terms.landlord, signedAt: now,
      summary: `${terms.termMonths}-month lease from ${terms.startLabel}: ${money(terms.rentCents)} a month, `
        + `${money(terms.depositCents)} deposit. Waiting for approval.`,
      terms: leaseAgreementTerms(terms), docValues: values,
    });
    state.paperwork.options.leaseTrapScore = trapScore(values);
    setStep(state, 'lease', 'done', values, now);
    return { ok: true, shortfallCents: 0 };
  },
};
