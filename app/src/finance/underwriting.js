// Underwriting (05 §7): who approves the student, with what probability, and why. Pure, integer cents.
// decide(state) → one decision record per decision this attempt needs (lease, cosigner, roommates, mortgage,
// construction, credit-card). Each record lists its factors and readable reasons so Results (task 31) can explain it,
// and the terms commit (phases/paperwork/commit.js) applies. The draw is seeded by save + kind + attempt index.
import { FINANCE, UNDERWRITING, BUILD } from '../config.js';
import { byId } from '../data/locations/index.js';
import { createRng, seedFor } from '../util/rng.js';
import { scoreLetter, needsScore } from '../letters/score.js';
import { businessFor } from '../content/names.js';
import { formatMoney, sumCents } from './money.js';
import { pmt, totalInterest } from './loans.js';
import { offerFor } from './creditCard.js';
import { cashOf } from './grid.js';
import { homeLoans } from '../life/relocation.js';
import { unpaidUpfront } from './ledgerRecords.js';
import { loanOptions, findOption, programBlock, creditTier, optionLabel } from './loanOptions.js';
import { appliesTo, rentOf } from '../phases/paperwork/flow.js';

/** Decisions that must all be approved for the home (05 §8). Co-signer and card are not required. */
export const REQUIRED_KINDS = { apartment: 'lease', shared: 'roommates', condo: 'mortgage', house: 'mortgage', build: 'construction' };
/** Labels for the decision cards. */
export const DECISION_LABELS = { lease: 'Lease', cosigner: 'Co-signer', roommates: 'Housemates', mortgage: 'Mortgage',
  construction: 'Construction loan', 'credit-card': 'Credit card' };

const pct = (x) => `${Math.round(x * 100)}%`;
const round4 = (x) => Math.round(x * 10000) / 10000;
const factor = (label, value, note = '') => ({ label, value: round4(value), note });

/** letterFactor(L) = 0.55 + 0.45 × L, with L in 0–1 (05 §7). */
export const letterFactor = (L, uw = UNDERWRITING) => uw.letterFactorBase + uw.letterFactorSlope * L;

/** The attempt index the draw uses: how many times the student has been through paperwork before. */
export const attemptIndex = (state) => state.plan.attempts.length;

/** The seeded draw u in [0, 1) for `kind` on this attempt (reloading can't change it). */
export function drawFor(state, kind) {
  return createRng(seedFor(state.meta.seed, 'decision', kind, attemptIndex(state))).next();
}

/** This attempt's letter for letter step `stepId` (or null). Scored on the fly (not stored) if its score is stale. */
export function letterFor(state, stepId, { speller = null } = {}) {
  const id = state.paperwork.steps[stepId]?.values?.letterId
    ?? (state.paperwork.letterIds ?? []).find((x) => state.letters[x]?.type === stepId);
  const letter = id ? state.letters[id] : null;
  if (!letter) return null;
  const stale = needsScore(letter.score) && (speller || letter.score?.likelihood == null);
  const score = stale ? scoreLetter(letter.text ?? '', letter.type, { speller }) : letter.score;
  return { id, type: stepId, likelihood: score.likelihood, band: score.bandLabel ?? score.band };
}

/** The letter factor for one or more letter steps (two letters → their likelihoods are averaged). */
function lettersFactor(state, stepIds, opts) {
  const letters = stepIds.map((id) => letterFor(state, id, opts)).filter(Boolean);
  const L = letters.length ? letters.reduce((t, l) => t + l.likelihood, 0) / letters.length / 100 : 0;
  const note = letters.length
    ? letters.map((l) => `${l.band ?? ''} letter (${Math.round(l.likelihood)})`).join(' + ')
    : 'No letter was sent';
  return { f: letterFactor(L), L, letters, note };
}

/** Assemble a decision record; hard fails force probability 0 (the draw is still recorded). */
function record(state, kind, { required, factors, hardFails = [], reasons = [], terms = {} }) {
  const draw = round4(drawFor(state, kind));
  const probability = hardFails.length ? 0 : round4(Math.min(1, factors.reduce((p, f) => p * f.value, 1)));
  const approved = !hardFails.length && draw < probability;
  const why = hardFails.length ? hardFails : approved ? reasons : [...reasons,
    `The decision draw came up ${Math.round(draw * 100)} out of 100, above your ${pct(probability)} chance.`];
  return { id: `${kind}-${attemptIndex(state)}`, kind, label: DECISION_LABELS[kind], required, approved, probability, draw,
    hardFail: hardFails.length > 0, factors, reasons: why, terms };
}

const tierFactor = (tiers, x, key = 'min') => tiers.find((t) => x >= t[key]) ?? tiers.at(-1);
const backFactor = (tiers, back) => tiers.find((t) => back <= t.max) ?? null;

/** Co-signer (05 §7): p = 0.35 + 0.6 × L(cosigner-request). */
function cosignerDecision(state, opts, uw = UNDERWRITING) {
  const lf = lettersFactor(state, ['cosigner-request'], opts);
  const p = uw.cosigner.base + uw.cosigner.slope * lf.L;
  return record(state, 'cosigner', { required: false,
    factors: [factor('Co-signer letter', p, `${pct(uw.cosigner.base)} + ${pct(uw.cosigner.slope)} × letter (${lf.note})`)],
    reasons: ['Your co-signer read your letter and agreed to sign with you.'] });
}

/** Rent ratio, cash and upfront lines shared by the renter decisions. */
function renterBasics(state) {
  const rentCents = rentOf(state);
  const incomeCents = state.player.netMonthlyIncomeCents;
  const upfront = unpaidUpfront(state);
  const upfrontCents = sumCents(upfront.map((l) => l.cents));
  const cashCents = cashOf(state);
  const ratio = rentCents > 0 ? incomeCents / rentCents : Infinity;
  const cashFail = cashCents < upfrontCents
    ? [`You need ${formatMoney(upfrontCents)} for the move-in costs but only have ${formatMoney(cashCents)}.`] : [];
  return { rentCents, incomeCents, upfront, upfrontCents, cashCents, ratio, cashFail };
}

function renterTermsOf(state, b, extra = {}) {
  const line = (k) => b.upfront.find((l) => l.key === k)?.cents ?? 0;
  return { rentCents: b.rentCents, depositCents: line('deposit'), firstMonthCents: line('first-month'), termMonths: 12,
    landlord: businessFor(state, 'landlords', 'landlord'), upfront: b.upfront, upfrontCents: b.upfrontCents, ...extra };
}

/** Lease (apartment, 05 §7). `cosigner` is this attempt's co-signer decision, if the step applied. */
function leaseDecision(state, opts, cosigner, uw = UNDERWRITING.lease) {
  const b = renterBasics(state);
  const score = state.finances.credit.score;
  const hardFails = [...b.cashFail];
  const ratioText = `Your income is ${b.ratio.toFixed(1)}× the rent`;
  let f;
  if (b.ratio < uw.hardFailRatio) {
    hardFails.unshift(`Your income is less than ${uw.hardFailRatio}× the rent, so the landlord can't approve the lease.`);
  } else if (b.ratio >= uw.ratioTiers.at(-1).min) {
    f = factor('Finances', tierFactor(uw.ratioTiers, b.ratio).f, ratioText);
  } else if (cosigner?.approved) {
    f = factor('Finances', uw.cosignerF, `${ratioText}; your co-signer agreed`);
  } else {
    hardFails.unshift("Your income is less than 2.5× the rent and you don't have a co-signer.");
  }
  const credit = tierFactor(uw.creditTiers, score);
  const lf = lettersFactor(state, ['rental-cover'], opts);
  const factors = [f ?? factor('Finances', 0, ratioText), factor('Credit', credit.f, `Score ${score}`),
    factor('Letter', lf.f, lf.note)];
  return record(state, 'lease', { required: true, factors, hardFails,
    reasons: [`${ratioText}.`, `Credit score ${score}.`, `Your cover letter: ${lf.note}.`],
    terms: renterTermsOf(state, b, { cosigned: !!cosigner?.approved }) });
}

/** Housemates (shared, 05 §7): ratio × intro letter × (1 ± the roommate-agreement bonus). */
function roommatesDecision(state, opts, uw = UNDERWRITING.roommates) {
  const b = renterBasics(state);
  const comfort = state.paperwork.options.roommateComfort ?? 0;
  const lf = lettersFactor(state, ['roommate-intro'], { ...opts });
  const intro = 0.5 + 0.5 * lf.L;
  const factors = [
    factor('Finances', b.ratio >= uw.goodRatio ? 1 : uw.lowRatioF, `Your income is ${b.ratio.toFixed(1)}× your share of the rent`),
    factor('Intro letter', intro, `50% + 50% × letter (${lf.note})`),
    factor('Roommate agreement', 1 + comfort * uw.agreementBonus,
      comfort > 0 ? 'Your house-rule answers made them comfortable' : comfort < 0 ? 'Some of your answers worried them' : 'Neutral answers'),
  ];
  return record(state, 'roommates', { required: true, factors, hardFails: b.cashFail,
    reasons: ['The housemates liked your intro and your answers on the roommate agreement.'],
    terms: renterTermsOf(state, b, { roommateComfort: comfort }) });
}

/**
 * Monthly debts the student already has (open loans and debt-category bills), for the back-end ratio. While moving
 * (task 58) the current home's loan doesn't count: the sale pays it off before the new loan starts.
 */
const otherDebtsCents = (state) => sumCents(
  ...state.finances.loans.filter((l) => !l.closedReason && !(state.relocation && homeLoans(state).includes(l)))
    .map((l) => l.paymentCents ?? 0),
  ...state.finances.recurring.filter((r) => r.category === 'debt').map((r) => r.amountCents));

/** Mortgage (condo/house, 05 §7), using the loan option the student chose (task 21) and the closing's final rate. */
function mortgageDecision(state, opts, uw = UNDERWRITING.mortgage) {
  const r = loanOptions(state);
  const o = findOption(r, state.paperwork.options);
  const score = r.score;
  const gross = r.grossCents;
  const location = byId[state.choice.locationId];
  if (!o) {
    return record(state, 'mortgage', { required: true, factors: [], hardFails: ['No loan was chosen on the loan options step.'] });
  }
  const rate = state.paperwork.options.closing?.finalRate ?? o.rate;
  const piCents = rate === o.rate ? o.piCents : pmt(o.loanCents, rate, o.termMonths);
  const housingCents = o.housingCents - o.piCents + piCents;
  const front = housingCents / gross;
  const back = (housingCents + otherDebtsCents(state)) / gross;
  const upfront = [
    { key: 'down-payment', label: `Down payment (${+(o.downPaymentPct * 100).toFixed(1)}%)`, cents: o.downCents },
    { key: 'closing', label: 'Closing costs', cents: o.closingCents },
    { key: 'fees', label: 'Inspection and appraisal still owed', cents: o.feesCents },
    { key: 'appraisal-gap', label: 'Appraisal gap you agreed to pay', cents: o.gapCents },
    { key: 'repair-credit', label: 'Repair credit from the seller', cents: -o.creditCents },
  ].filter((l) => l.cents !== 0);
  const upfrontCents = Math.max(0, sumCents(upfront.map((l) => l.cents)));
  const cashAfter = r.cashCents - upfrontCents;
  const hardFails = [];
  if (back > uw.maxBack) hardFails.push(`Your housing and debts would be ${pct(back)} of your gross pay. Lenders stop at ${pct(uw.maxBack)}.`);
  if (score < uw.minCredit) hardFails.push(`Your credit score is ${score}. Mortgage lenders need at least ${uw.minCredit}.`);
  const block = programBlock(o, { score, location }, uw);
  if (block) hardFails.push(block);
  if (cashAfter < 0) hardFails.push(`You need ${formatMoney(upfrontCents)} to close but only have ${formatMoney(r.cashCents)}.`);
  const tier = creditTier(score, uw);
  const bt = backFactor(uw.backTiers, back);
  const lowReserves = cashAfter < uw.reserveMonths * housingCents;
  const lf = lettersFactor(state, ['loan-purpose', ...(appliesTo(state, 'credit-explanation') ? ['credit-explanation'] : [])], opts);
  const factors = [
    factor('Finances', bt?.f ?? 0, `Housing is ${pct(front)} of gross pay; with debts ${pct(back)}`),
    factor('Reserves', lowReserves ? uw.reserveF : 1, lowReserves
      ? `Less than ${uw.reserveMonths} months of housing left in savings after closing` : `${formatMoney(cashAfter)} left after closing`),
    factor('Credit', tier?.f ?? 0, `Score ${score}${tier?.rateAdj ? `, rate ${tier.rateAdj > 0 ? '+' : '−'}${Math.abs(tier.rateAdj * 100)} points` : ''}`),
    factor('Letter', lf.f, lf.note),
  ];
  const purchase = state.paperwork.options.purchase;
  const escrow = Object.fromEntries(r.fixedLines.filter((l) => ['property-tax', 'insurance'].includes(l.key))
    .map((l) => [l.key === 'property-tax' ? 'taxCents' : 'insuranceCents', l.cents]));
  return record(state, 'mortgage', { required: true, factors, hardFails,
    reasons: [`${optionLabel(o)} at ${(rate * 100).toFixed(3)}%.`, `Housing ${pct(front)} and all debts ${pct(back)} of your gross pay.`,
      `Credit score ${score}.`, `Your letter: ${lf.note}.`],
    terms: { program: o.program, downPaymentPct: o.downPaymentPct, rate: +rate.toFixed(6), termMonths: o.termMonths, principalCents: o.loanCents,
      paymentCents: piCents, mortgageInsuranceCents: o.mortgageInsuranceCents, insuranceKind: o.insuranceKind,
      priceCents: purchase?.priceCents ?? r.contractCents, housingCents, frontRatio: round4(front), backRatio: round4(back),
      totalInterestCents: totalInterest(o.loanCents, rate, o.termMonths), lender: businessFor(state, 'lenders'),
      escrow: { taxCents: escrow.taxCents ?? 0, insuranceCents: escrow.insuranceCents ?? 0 }, upfront, upfrontCents } });
}

/** Construction-to-permanent loan (build, 05 §7). The credit floor uses the score the lender pulled (see DEVIATIONS). */
function constructionDecision(state, opts, uw = UNDERWRITING.construction, config = FINANCE) {
  const o = state.paperwork.options;
  const project = o.project ?? state.choice.snapshot?.breakdown?.project ?? {};
  const monthly = state.choice.snapshot.breakdown.monthly;
  const score = state.finances.credit.score;
  const pulled = o.pulledScore ?? score;
  const tier = creditTier(score);
  const rate = config.build.rate + (tier?.rateAdj ?? 0);
  const termMonths = config.build.termMonths;
  const principalCents = project.loanCents ?? 0;
  const piCents = pmt(principalCents, rate, termMonths);
  const fixedCents = sumCents(monthly.filter((l) => !['principal-interest', 'utilities'].includes(l.key)).map((l) => l.cents));
  const housingCents = piCents + fixedCents;
  const gross = Math.round(state.player.netMonthlyIncomeCents / config.netToGross);
  const back = (housingCents + otherDebtsCents(state)) / gross;
  const downPct = project.projectCents ? (project.projectCents - principalCents) / project.projectCents : 0;
  const upfront = unpaidUpfront(state);
  const upfrontCents = sumCents(upfront.map((l) => l.cents));
  const cashCents = cashOf(state);
  const hardFails = [];
  if (pulled < uw.minCredit) hardFails.push(`Construction lenders need a credit score of ${uw.minCredit}. Yours was ${pulled}.`);
  if (back > uw.maxBack) hardFails.push(`Your housing and debts would be ${pct(back)} of your gross pay. Construction lenders stop at ${pct(uw.maxBack)}.`);
  if (downPct < uw.minDownPct - 1e-9) hardFails.push(`Construction loans need ${pct(uw.minDownPct)} down. Yours is ${pct(downPct)}.`);
  if (!o.contractorId) hardFails.push('You haven\'t hired a contractor.');
  if (!o.permit?.approved) hardFails.push('You don\'t have a building permit yet.');
  if (cashCents < upfrontCents) hardFails.push(`You need ${formatMoney(upfrontCents)} in cash to start building but only have ${formatMoney(cashCents)}.`);
  const bt = backFactor(uw.backTiers, back);
  const lf = lettersFactor(state, ['construction-purpose', ...(appliesTo(state, 'credit-explanation') ? ['credit-explanation'] : [])], opts);
  const factors = [
    factor('Finances', bt?.f ?? 0, `Housing and debts are ${pct(back)} of gross pay`),
    ...(o.contractorId === 'a' ? [factor('Contractor', BUILD.risk.lenderFactor ?? uw.contractorAF,
      "The bank is nervous about your contractor's reviews")] : []),
    factor('Credit', tier?.f ?? 0, `Score ${score}`),
    factor('Letter', lf.f, lf.note),
  ];
  return record(state, 'construction', { required: true, factors, hardFails,
    reasons: [`Construction-to-permanent loan of ${formatMoney(principalCents)} at ${(rate * 100).toFixed(3)}%.`,
      `Housing and debts ${pct(back)} of your gross pay.`, `Credit score ${score}.`, `Your letter: ${lf.note}.`],
    terms: { rate: +rate.toFixed(6), termMonths, principalCents, paymentCents: piCents, priceCents: project.projectCents ?? 0, housingCents,
      backRatio: round4(back), buildMonths: project.months ?? 0, totalInterestCents: totalInterest(principalCents, rate, termMonths),
      lender: businessFor(state, 'lenders'), upfront, upfrontCents } });
}

/** The card offer the student accepted: paperwork.options.card = {accepted, autopay} (task 30), or the older cardAccepted flag. */
export function cardAccepted(state) {
  const o = state.paperwork.options;
  return o.card ? o.card.accepted === true : o.cardAccepted === true;
}

/**
 * Credit card (05 §6–§7): approved on the tiers at ≥ 600; below that it becomes the secured card, always approved.
 * The tier uses the score the issuer pulled before its own inquiry (options.card.pulledScore, task 30), else the current one.
 */
function cardDecision(state) {
  const card = state.paperwork.options.card ?? {};
  const o = offerFor(state, { score: card.pulledScore ?? state.finances.credit.score });
  return record(state, 'credit-card', { required: false,
    factors: [factor('Credit', 1, `Score ${o.score}: ${o.secured ? 'secured card' : 'regular card'}`)],
    reasons: [o.secured ? `Score ${o.score}: a secured card with a ${formatMoney(o.depositCents)} deposit.`
      : `Score ${o.score}: a ${formatMoney(o.limitCents)} limit at ${(o.apr * 100).toFixed(2)}% APR.`],
    terms: { kind: o.kind, secured: o.secured, limitCents: o.limitCents, apr: o.apr, depositCents: o.depositCents,
      autopay: card.autopay ?? 'full', lateFeeCents: o.lateFeeCents, graceDays: o.graceDays } });
}

/**
 * Every decision this attempt needs (05 §7), in display order: [cosigner], lease | roommates | mortgage | construction,
 * [credit-card]. `speller` (optional) rescores letters whose score was made without it. Pure: the state isn't changed.
 */
export function decide(state, { speller = null } = {}) {
  const type = state.choice?.homeTypeId;
  if (!REQUIRED_KINDS[type]) throw new Error('decide() needs a chosen home');
  const opts = { speller };
  const out = [];
  if (type === 'apartment' || type === 'shared') {
    const cosigner = appliesTo(state, 'cosigner-request') ? cosignerDecision(state, opts) : null;
    if (cosigner) out.push(cosigner);
    out.push(type === 'apartment' ? leaseDecision(state, opts, cosigner) : roommatesDecision(state, opts));
  } else if (type === 'build') {
    out.push(constructionDecision(state, opts));
  } else {
    out.push(mortgageDecision(state, opts));
  }
  if (cardAccepted(state)) out.push(cardDecision(state));
  return out;
}

/** True when every required decision was approved. */
export const homeApproved = (decisions) => decisions.filter((d) => d.required).every((d) => d.approved);
