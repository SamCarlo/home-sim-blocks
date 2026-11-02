// Mortgage application (05 §3–§4, task 21): a simplified Uniform Residential Loan Application for a condo or house.
// Completion records a hard credit inquiry (score −5, config CREDIT) and a pending 'mortgage' application. No fee:
// the lender's costs are part of closing.
import { FINANCE, CREDIT } from '../../../config.js';
import { byId } from '../../../data/locations/index.js';
import { homeType } from '../../../data/homeTypes.js';
import { addApplication, inquiryMonth } from '../../../finance/ledger.js';
import { recordInquiry } from '../../../finance/creditScore.js';
import { setStep } from '../flow.js';
import { gameIdField } from './renterTerms.js';

/** Estimated monthly gross income from take-home pay (05 §7: gross = net ÷ FINANCE.netToGross), in cents. */
export const estimatedGross = (netCents, config = FINANCE) => Math.round((netCents ?? 0) / config.netToGross);

const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/** The application schema for the chosen condo/house. */
export function mortgageSchema(state) {
  const loc = byId[state?.choice?.locationId];
  const typeId = state?.choice?.homeTypeId ?? 'house';
  const priceCents = loc?.housing?.[typeId]?.priceCents ?? 0;
  const label = homeType(typeId).label.toLowerCase();
  return {
    id: 'mortgage-application',
    title: 'Mortgage application',
    intro: 'A mortgage is a loan to buy a home. The bank reads this form, checks your credit and decides how much it '
      + 'is safe to lend you. Everything you write is made up for the game.',
    submitLabel: 'Sign and submit',
    sections: [
      { id: 'borrower', title: '1. Borrower', fields: [
        { id: 'name', kind: 'computed', label: 'Full name', width: 'half', compute: (v, s) => s?.player?.characterName ?? '' },
        gameIdField(state),
        { id: 'living', kind: 'select', label: 'Where do you live now?', required: true, width: 'half',
          options: [{ value: 'family', label: 'With family' }, { value: 'renting', label: 'Renting a place' },
            { value: 'roommates', label: 'With roommates' }, { value: 'dorm', label: 'School housing' }] },
        { id: 'first-home', kind: 'radio', label: 'Is this your first home purchase?', required: true, width: 'half',
          options: yesNo },
      ] },
      { id: 'employment', title: '2. Employment and income', fields: [
        { id: 'employer', kind: 'text', label: 'Employer', required: true, width: 'half', minLength: 2, maxLength: 40,
          hint: 'Who pays you (a made-up business is fine).' },
        { id: 'job-title', kind: 'text', label: 'Job title', required: true, width: 'half', minLength: 2, maxLength: 40,
          default: (s) => s?.player?.jobTitle ?? '' },
        { id: 'years', kind: 'select', label: 'Years at this job', required: true, width: 'half',
          options: [{ value: 'new', label: 'Less than 1 year' }, { value: '1-2', label: '1 to 2 years' },
            { value: '2+', label: 'More than 2 years' }] },
        { id: 'net', kind: 'computed', label: 'Monthly take-home pay (net)', width: 'half', format: 'money',
          compute: (v, s) => s?.player?.netMonthlyIncomeCents ?? 0 },
        { id: 'gross', kind: 'computed', label: 'Estimated monthly gross pay', width: 'half', format: 'money',
          compute: (v, s) => estimatedGross(s?.player?.netMonthlyIncomeCents) },
        { kind: 'info', tone: 'teach', label: 'Lenders use gross income, before taxes',
          text: [`Gross pay is what you earn before taxes come out. We estimate it as your take-home pay ÷ ${FINANCE.netToGross}.`,
            'Most lenders want your total housing cost to stay under about 36% of your gross pay.'] },
      ] },
      { id: 'assets', title: '3. Assets', fields: [
        { id: 'assets', kind: 'table', label: 'Money you have now', columns: [
          { key: 'item', label: 'Account' }, { key: 'cents', label: 'Balance', align: 'right', format: 'money' }],
        rows: (v, s) => {
          const c = s?.finances?.checkingCents ?? 0;
          const sv = s?.finances?.savingsCents ?? 0;
          return [{ item: 'Checking', cents: c }, { item: 'Savings', cents: sv }, { item: 'Total', cents: c + sv }];
        } },
        { kind: 'info', tone: 'note', label: 'Why they ask',
          text: 'The bank wants to see enough cash for the down payment, closing costs and a few months of payments.' },
      ] },
      { id: 'liabilities', title: '4. Debts', fields: [
        { kind: 'info', tone: 'note', label: 'None so far',
          text: 'Car loans, student loans and credit card balances would be listed here. Every monthly debt payment '
            + 'counts against what you can borrow.' },
      ] },
      { id: 'property', title: '5. The property', fields: [
        { id: 'address', kind: 'computed', label: 'Property', width: 'half',
          compute: () => `A ${label} in ${loc?.fullName ?? ''}` },
        { id: 'price', kind: 'computed', label: 'Purchase price', width: 'half', format: 'money', compute: () => priceCents },
        { id: 'loan-type', kind: 'computed', label: 'Loan type and down payment', width: 'half',
          compute: () => 'You choose on the next step' },
      ] },
      { id: 'declarations', title: '6. Declarations', fields: [
        { id: 'occupy', kind: 'radio', label: 'Will you live in this home yourself?', required: true, options: yesNo,
          validate: (val) => (val === 'no'
            ? 'This loan is only for a home you will live in. Investors need a different, more expensive loan.' : null) },
        { id: 'bankruptcy', kind: 'radio', label: 'Have you declared bankruptcy in the last 7 years?', required: true,
          width: 'half', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
          validate: (val) => (val === 'yes' ? 'Your game character has never declared bankruptcy. Choose No.' : null) },
      ] },
      { id: 'sign', title: '7. Credit check and signature', fields: [
        { kind: 'info', tone: 'warn', label: 'This is a hard credit check',
          text: `When a lender checks your credit for a loan, your score drops about ${CREDIT.hardInquiryCost} points. `
            + `It comes back after ${CREDIT.inquiryRecoverMonths} months.` },
        { id: 'auth', kind: 'checkbox', required: true,
          label: 'I allow the lender to check my credit, and I promise everything on this form is true.' },
        { id: 'signature', kind: 'signature', label: 'Signature', required: true },
      ] },
    ],
  };
}

export default {
  id: 'mortgage-application',
  title: 'Mortgage application',
  kind: 'form',
  schema: (state) => mortgageSchema(state),
  /** Hard inquiry (−5) + pending mortgage application, then mark done. No money moves. */
  complete(state, values, now = 0) {
    const c = state.choice;
    recordInquiry(state, 'mortgage', inquiryMonth(state));
    addApplication(state, { kind: 'mortgage', target: `${c.locationId}|${c.homeTypeId}`, feeCents: 0, at: now });
    setStep(state, 'mortgage-application', 'done', values, now);
    return { ok: true, shortfallCents: 0 };
  },
};
