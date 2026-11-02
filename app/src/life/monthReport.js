// The numbers behind the month summary and the year in review (09 §11, task 47). Pure: no DOM. Everything is read
// from finalizeMonth's `result` (and the month's plan for the paycheck/overtime split), so the summary shows exactly
// what was charged. Money is integer cents.
import { LIFE } from '../config.js';
import { monthName, yearMonth } from '../util/dates.js';
import { WELLBEING_DOMAINS } from './monthFlow.js';

/** Expense rows in display order (09 §11): key, label and the ledger categories they gather. */
export const EXPENSE_GROUPS = [
  { key: 'housing', label: 'Housing', categories: ['housing'] },
  { key: 'utilities', label: 'Utilities & insurance', categories: ['utilities', 'insurance'] },
  { key: 'food', label: 'Food', categories: ['food'] },
  { key: 'transportation', label: 'Transportation', categories: ['transportation'] },
  { key: 'lifestyle', label: 'Lifestyle, pets & garden', categories: ['lifestyle', 'pets', 'garden'] },
  { key: 'events', label: 'Surprises & events', categories: [] },
  { key: 'debt', label: 'Interest & late fees', categories: ['interest', 'fees'] },
];

/**
 * Money in and out for the month: `{income [{key, label, cents}], expenses [{key, label, cents}], incomeCents,
 * expenseCents, netCents}`. Rows always add up to the result's totals: paid event costs are pulled out of their ledger
 * category into "Surprises & events", and anything left over lands in "Other".
 */
export function moneyRows(result, plan = null) {
  const by = result.byCategory ?? {};
  const out = (cat) => Math.max(0, -(by[cat] ?? 0));
  const skipped = new Set((result.wentWithout ?? []).map((w) => w.label));
  const eventByCat = {};
  for (const e of result.events ?? []) {
    if (e.amountCents >= 0 || skipped.has(e.label)) continue;
    eventByCat[e.category] = (eventByCat[e.category] ?? 0) - e.amountCents;
  }
  const eventsCents = Object.values(eventByCat).reduce((a, b) => a + b, 0);
  const expenses = EXPENSE_GROUPS.map((g) => ({ key: g.key, label: g.label,
    cents: g.key === 'events' ? eventsCents
      : g.categories.reduce((t, c) => t + Math.max(0, out(c) - (eventByCat[c] ?? 0)), 0) }));
  const other = result.expenseCents - expenses.reduce((t, r) => t + r.cents, 0);
  if (other) expenses.push({ key: 'other', label: 'Other', cents: other });

  const paycheck = Math.min(plan?.income?.paycheckCents ?? result.incomeCents, result.incomeCents);
  const overtime = Math.min(plan?.income?.overtimeCents ?? 0, result.incomeCents - paycheck);
  const income = [
    { key: 'paycheck', label: 'Paycheck', cents: paycheck },
    ...(overtime ? [{ key: 'overtime', label: 'Overtime', cents: overtime }] : []),
  ];
  const rest = result.incomeCents - paycheck - overtime;
  if (rest) income.push({ key: 'other', label: 'Other money in', cents: rest });
  return { income, expenses: expenses.filter((r) => r.cents !== 0), incomeCents: result.incomeCents,
    expenseCents: result.expenseCents, netCents: result.incomeCents - result.expenseCents };
}

/**
 * Wellbeing before → after per domain with its reason chips: `[{key, label, before, after, change, chips [{delta,
 * text}]}]`, in the wellbeing card's order. The change includes the monthly pull toward the middle, so it can differ
 * from the chips' sum.
 */
export function wellbeingRows(result) {
  return WELLBEING_DOMAINS.map(({ key, label }) => {
    const before = Math.round(result.wellbeingBefore?.[key] ?? 0), after = Math.round(result.wellbeingAfter?.[key] ?? 0);
    const chips = (result.deltas ?? []).filter((d) => d.domain === key && d.delta)
      .map((d) => ({ delta: d.delta, text: d.reason }));
    return { key, label, before, after, change: after - before, chips };
  });
}

/**
 * The housing notice for the summary (12 §7: plain, kind, with a path forward), or null. `streak` is the save's
 * `finances.credit.lateHousingStreak` after the month. → `{level 'first'|'final', title, text, tryNext[]}`.
 */
export function housingNotice(result, streak, homeKind = '') {
  if (!(result.missed ?? []).some((m) => m.kind === 'housing')) return null;
  const owner = ['house', 'condo', 'build'].includes(homeKind);
  const bill = owner ? 'mortgage' : 'rent';
  const tryNext = [
    'Pick up extra shifts next month (“Busy month” or “Maximum hustle”). Overtime pay lands at the end of the month.',
    'Cut lifestyle spending and skip new pets or plants until you catch up.',
    `Your ${bill} is paid first on the 1st, so keep enough in checking and savings to cover it.`,
  ];
  if (streak >= LIFE.finalNoticeStreak) {
    return { level: 'final', title: 'Final notice',
      text: `You have missed ${streak} ${bill} payments in a row. If you miss one more, you will lose this home. `
        + 'You would still have your job, and you could pick a home that costs less.',
      tryNext };
  }
  return { level: 'first', title: `You missed a ${bill} payment`,
    text: `There wasn’t enough money for the ${bill} this month, so there was a late fee and your credit score dropped. `
      + 'One more missed payment brings a final notice.',
    tryNext };
}

/** True when the summary's warning repeats the housing notice (so it isn't shown twice). */
export function isHousingWarning(text) {
  return /^(Final notice|You missed a housing payment)/.test(text);
}

/**
 * Totals for the lived months with `fromMonth ≤ monthIndex ≤ toMonth` (the year in review and the year fast-forward's
 * recap, task 58): `{months, incomeCents, expenseCents, netCents, netWorthStartCents, netWorthEndCents, best {label,
 * netCents}, worst, trends {domain: number[]}}`. Trends start with the first month's "before" value, then each month's
 * "after" (13 points for 12 months).
 */
export function rangeReview(history, fromMonth, toMonth) {
  const months = (history ?? []).filter((m) => m.result && m.monthIndex >= fromMonth && m.monthIndex <= toMonth)
    .sort((a, b) => a.monthIndex - b.monthIndex);
  const res = months.map((m) => m.result);
  const sum = (k) => res.reduce((t, r) => t + (r[k] ?? 0), 0);
  const incomeCents = sum('incomeCents'), expenseCents = sum('expenseCents');
  const nets = months.map((m) => ({ monthIndex: m.monthIndex, label: monthName(m.monthIndex),
    netCents: m.result.incomeCents - m.result.expenseCents }));
  const best = nets.reduce((a, b) => (b.netCents > a.netCents ? b : a), nets[0] ?? null);
  const worst = nets.reduce((a, b) => (b.netCents < a.netCents ? b : a), nets[0] ?? null);
  const first = res[0], last = res.at(-1);
  const netWorthStartCents = first ? (first.netWorthBeforeCents
    ?? first.netWorthCents - (first.incomeCents - first.expenseCents)) : 0;
  const trends = Object.fromEntries(WELLBEING_DOMAINS.map(({ key }) => [key,
    res.length ? [first.wellbeingBefore?.[key] ?? 0, ...res.map((r) => r.wellbeingAfter?.[key] ?? 0)].map(Math.round) : []]));
  return { months: months.length, incomeCents, expenseCents, netCents: incomeCents - expenseCents,
    netWorthStartCents, netWorthEndCents: last?.netWorthCents ?? 0, best, worst, trends };
}

/**
 * The year in review (09 §11) for one calendar year: `rangeReview` over its January–December plus `year`.
 */
export function yearReview(history, year) {
  const from = (year - yearMonth(0).year) * 12;
  return { year, ...rangeReview(history, from, from + 11) };
}

/** SVG polyline points for a 0–100 series in a `w`×`h` box with `pad` px inside. */
export function sparkPoints(values, w, h, pad = 3) {
  if (!values.length) return '';
  const step = values.length > 1 ? (w - 2 * pad) / (values.length - 1) : 0;
  const y = (v) => pad + (h - 2 * pad) * (1 - Math.max(0, Math.min(100, v)) / 100);
  return values.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
}
