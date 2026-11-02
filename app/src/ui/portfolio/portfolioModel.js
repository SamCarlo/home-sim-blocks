// Portfolio view model (02 §2, 05 §9, task 17): plain data for the drawer tabs. Pure and DOM-free so Node tests
// can import it; the tab renderers in this folder turn it into DOM.
import { CREDIT } from '../../config.js';
import { creditBand } from '../../finance/creditScore.js';
import { monthLabel } from '../../util/dates.js';
import { PAPERWORK_MONTH } from '../../finance/ledger.js';

/** Category order and labels for automatic expenses (09 §11 summary order). Unknown categories sort last. */
export const CATEGORY_LABELS = {
  housing: 'Housing', utilities: 'Utilities', food: 'Food', transportation: 'Transportation', insurance: 'Insurance',
  debt: 'Debt payments', lifestyle: 'Lifestyle', savings: 'Savings', other: 'Other',
};

export const AGREEMENT_STATUS = { pending: 'Pending approval', active: 'Active', void: 'Void', ended: 'Ended (moved out)' };
export const APPLICATION_STATUS = { pending: 'Pending', approved: 'Approved', denied: 'Denied' };

/** "Paperwork" for month −1, otherwise "March 2033". */
export function whenLabel(month) {
  if (month == null) return '';
  return month === PAPERWORK_MONTH ? 'Paperwork' : monthLabel(month);
}

/**
 * Recurring items active in `month` (all of them when month is null), grouped by category in CATEGORY_LABELS order.
 * → { groups: [{category, label, items, totalCents}], totalCents }
 */
export function groupRecurring(recurring, month = null) {
  const active = recurring.filter((r) => month == null
    || ((r.startsMonth ?? 0) <= month && (r.endsMonth == null || r.endsMonth >= month)));
  const order = Object.keys(CATEGORY_LABELS);
  const byCat = new Map();
  for (const r of active) {
    const cat = r.category || 'other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(r);
  }
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  const groups = [...byCat.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, items]) => ({
      category, label: CATEGORY_LABELS[category] ?? category, items,
      totalCents: items.reduce((t, r) => t + r.amountCents, 0),
    }));
  return { groups, totalCents: groups.reduce((t, g) => t + g.totalCents, 0) };
}

/** How far a loan is paid down: {paidCents, paidPct (0–1), monthsLeft}. */
export function loanProgress(loan) {
  const principal = loan.principalCents || 0;
  const paidCents = Math.max(0, principal - (loan.balanceCents || 0));
  return {
    paidCents,
    paidPct: principal > 0 ? Math.min(1, paidCents / principal) : 0,
    monthsLeft: Math.max(0, (loan.termMonths || 0) - (loan.paymentsMade || 0)),
  };
}

/**
 * May the player see this letter's score yet? Not while it belongs to the paperwork attempt in progress (D11, 06 §2):
 * it's revealed once Results is done or `paperwork.lettersRevealed` is set (task 31 sets it when Results opens).
 */
export function letterRevealed(state, letter) {
  const pw = state.paperwork ?? {};
  if (state.phase !== 'paperwork' || !(pw.letterIds ?? []).includes(letter.id)) return true;
  return Boolean(pw.lettersRevealed) || pw.steps?.results?.status === 'done';
}

/** Letters newest first: [{id, type, to, text, sentAt, attempt, score}]. */
export function letterList(state) {
  return Object.values(state.letters || {}).sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
}

/**
 * The credit gauge: score, band, and the needle angle in degrees (−90 = 300 at the left, +90 = 850 at the right).
 * segments are the band arcs [{key, label, status, fromDeg, toDeg}] for drawing.
 */
export function creditGauge(score, config = CREDIT) {
  const span = config.maxScore - config.minScore;
  const deg = (s) => -90 + (180 * (Math.min(config.maxScore, Math.max(config.minScore, s)) - config.minScore)) / span;
  const segments = config.bands.map((b, i) => {
    const hi = i === 0 ? config.maxScore : config.bands[i - 1].minScore;
    return { key: b.key, label: b.label, status: b.status, fromDeg: deg(Math.max(b.minScore, config.minScore)), toDeg: deg(hi) };
  }).reverse();
  return { score, band: creditBand(score, config), angle: deg(score), segments };
}

/** Credit history newest first. */
export function creditHistory(state) {
  return [...(state.finances.credit?.history || [])].reverse();
}
