// Construction loan application (05 §3–§4, task 23): a simplified loan application plus the budget tier (Tiny 600,
// Cozy 1,000, Family 1,600 sq ft) with live project cost, 20% down, monthly payment after completion and cash needed.
// Completion records a hard inquiry and a pending 'construction' application, stores options.buildTier and
// options.designBudgetCents, and rewrites the choice snapshot for the tier (finance/build.js refreshBuildSnapshot).
import { BUILD, CREDIT, FINANCE } from '../../../config.js';
import { byId } from '../../../data/locations/index.js';
import { formatMoney } from '../../../finance/money.js';
import { addApplication, inquiryMonth } from '../../../finance/ledger.js';
import { recordInquiry } from '../../../finance/creditScore.js';
import { cashOf } from '../../../finance/grid.js';
import { projectCost, tierTable, refreshBuildSnapshot } from '../../../finance/build.js';
import { pctText } from '../../../finance/costs.js';
import { setStep } from '../flow.js';
import { gameIdField } from './renterTerms.js';
import { estimatedGross } from './mortgage-application.js';

/** Cash still needed for tier `tierId`: the project's upfront total minus what paperwork already paid (earnest money). */
export function cashNeeded(state, tierId) {
  const p = projectCost(byId[state.choice.locationId], { tierId });
  const paid = Object.values(state.paperwork.paidUpfront ?? {}).reduce((t, c) => t + c, 0);
  return Math.max(0, p.cashNeededCents - paid);
}

const lineOf = (p, key) => p.upfront.find((l) => l.key === key)?.cents ?? 0;
const piOf = (p) => p.monthly.find((l) => l.key === 'principal-interest')?.cents ?? 0;

/** The application schema for the chosen build lot. */
export function constructionSchema(state) {
  const loc = byId[state?.choice?.locationId];
  const cost = (v) => projectCost(loc, { tierId: v.tier || BUILD.defaultTier });
  const score = state?.finances?.credit?.score ?? CREDIT.startingScore;
  return {
    id: 'construction-loan-application',
    title: 'Construction loan application',
    intro: 'A construction-to-permanent loan pays the builder as the house goes up, then turns into a normal 30-year '
      + 'loan when you move in. First choose how big a house to build.',
    submitLabel: 'Sign and submit',
    sections: [
      { id: 'borrower', title: '1. Borrower and income', fields: [
        { id: 'name', kind: 'computed', label: 'Full name', width: 'half', compute: (v, s) => s?.player?.characterName ?? '' },
        gameIdField(state),
        { id: 'employer', kind: 'text', label: 'Employer', required: true, width: 'half', minLength: 2, maxLength: 40,
          hint: 'Who pays you (a made-up business is fine).' },
        { id: 'job-title', kind: 'text', label: 'Job title', required: true, width: 'half', minLength: 2, maxLength: 40,
          default: (s) => s?.player?.jobTitle ?? '' },
        { id: 'net', kind: 'computed', label: 'Monthly take-home pay (net)', width: 'half', format: 'money',
          compute: (v, s) => s?.player?.netMonthlyIncomeCents ?? 0 },
        { id: 'gross', kind: 'computed', label: 'Estimated monthly gross pay', width: 'half', format: 'money',
          compute: (v, s) => estimatedGross(s?.player?.netMonthlyIncomeCents) },
      ] },
      { id: 'tier', title: '2. How big a house?', fields: [
        { id: 'tiers', kind: 'table', label: 'Compare the three sizes', columns: [
          { key: 'label', label: 'Size' }, { key: 'project', label: 'Project cost', align: 'right', format: 'money' },
          { key: 'down', label: '20% down', align: 'right', format: 'money' },
          { key: 'monthly', label: 'Monthly after move-in', align: 'right', format: 'money' },
          { key: 'cash', label: 'Cash needed', align: 'right', format: 'money' }],
        rows: (v, s) => tierTable(loc).map(({ tier, cost: p }) => ({ label: `${tier.label}, ${tier.sqft.toLocaleString('en-US')} sq ft`,
          project: p.project.projectCents, down: lineOf(p, 'down-payment'), monthly: p.monthlyCents, cash: cashNeeded(s, tier.id) })) },
        { id: 'tier', kind: 'radio', label: 'Budget tier', required: true, default: BUILD.defaultTier,
          options: BUILD.tiers.map((t) => ({ value: t.id, label: `${t.label} (${t.sqft.toLocaleString('en-US')} sq ft): ${t.blurb}` })),
          validate: (val, v, s) => {
            const need = cashNeeded(s, val);
            const have = cashOf(s);
            return need > have ? `You need ${formatMoney(need - have)} more cash for this size. Pick a smaller house.` : null;
          } },
        { id: 'project', kind: 'computed', label: 'Project cost (lot + building + site work)', width: 'half', format: 'money',
          compute: (v) => cost(v).project.projectCents },
        { id: 'down', kind: 'computed', label: `Down payment (${pctText(FINANCE.build.downPaymentPct)})`, width: 'half',
          format: 'money', compute: (v) => lineOf(cost(v), 'down-payment') },
        { id: 'loan', kind: 'computed', label: 'Loan amount', width: 'half', format: 'money', compute: (v) => cost(v).project.loanCents },
        { id: 'payment', kind: 'computed', label: `Loan payment after move-in (${pctText(FINANCE.build.rate)}, 30 years)`,
          width: 'half', format: 'money', compute: (v) => piOf(cost(v)) },
        { id: 'monthly', kind: 'computed', label: 'Total monthly housing after move-in', width: 'half', format: 'money',
          compute: (v) => cost(v).monthlyCents },
        { id: 'cash', kind: 'computed', label: 'Cash you need before move-in', width: 'half', format: 'money',
          compute: (v, s) => cashNeeded(s, v.tier || BUILD.defaultTier) },
        { id: 'budget', kind: 'computed', label: 'Design budget for your blueprint', width: 'half', format: 'money',
          compute: (v) => cost(v).designBudgetCents },
        { kind: 'info', tone: 'teach', label: 'Your design budget',
          text: [`Design budget = size × ${formatMoney(loc?.housing?.build?.buildCostPerSqftCents ?? 0)} per sq ft here × 1.10.`,
            'In Phase 3 you draw your house. Rooms, roof, windows and yard all cost money, and the plan has to stay inside this budget.'] },
      ] },
      { id: 'sign', title: '3. Credit check and signature', fields: [
        { kind: 'info', tone: score < BUILD.minCreditScore ? 'warn' : 'note', label: 'Construction lenders are strict',
          text: [`Most construction lenders want a credit score of ${BUILD.minCreditScore} or higher. Yours is ${score} before this check.`,
            `This is a hard credit check: your score drops about ${CREDIT.hardInquiryCost} points.`] },
        { id: 'auth', kind: 'checkbox', required: true,
          label: 'I allow the lender to check my credit, and I promise everything on this form is true.' },
        { id: 'signature', kind: 'signature', label: 'Signature', required: true },
      ] },
    ],
  };
}

export default {
  id: 'construction-loan-application',
  title: 'Construction loan application',
  kind: 'form',
  schema: (state) => constructionSchema(state),
  /** Hard inquiry + pending construction application; store the tier and design budget; re-snapshot for the tier. */
  complete(state, values, now = 0) {
    const c = state.choice;
    const tierId = values.tier || BUILD.defaultTier;
    const o = state.paperwork.options;
    o.buildTier = tierId;
    o.designBudgetCents = projectCost(byId[c.locationId], { tierId }).designBudgetCents;
    o.designBudgetBaseCents = o.designBudgetCents;
    refreshBuildSnapshot(state);
    o.pulledScore = state.finances.credit.score;   // the score the lender sees (05 §7 floor; before this inquiry)
    recordInquiry(state, 'construction', inquiryMonth(state));
    addApplication(state, { kind: 'construction', target: `${c.locationId}|${c.homeTypeId}`, feeCents: 0, at: now });
    setStep(state, 'construction-loan-application', 'done', { ...values, tier: tierId }, now);
    return { ok: true, shortfallCents: 0 };
  },
};
