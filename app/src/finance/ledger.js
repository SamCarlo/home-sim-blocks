// The ledger (02 §2–§3, §6; 05 §2, §8; 09 §6): the only code that moves money in a save. Pure, integer cents.
// Convention: every function takes the state (a store draft, already a clone), mutates it in place and returns a result
// (the new record, or {ok, shortfallCents}). Use inside store.update((s) => { charge(s, …); }).
// Accounts: 'checking' | 'savings' | 'card'. A transaction's amountCents is + into the account, − out of it; on the card
// a − amount is a purchase (balance owed goes up) and a + amount is a payment. So for every account,
// accountValue − (sum of its transactions + compacted byAccount totals) never changes: see ledgerSums().
import { FINANCE } from '../config.js';
import { assertCents, mulRate } from './money.js';
import { pmt } from './loans.js';

/** Ledger accounts. */
export const ACCOUNTS = ['checking', 'savings', 'card'];
/** Category used by transfer(); transfers are neither income nor expense in monthTotals. */
export const TRANSFER = 'transfer';
/** Month index for paperwork money (05 §8: "transactions in month −1"). */
export const PAPERWORK_MONTH = -1;
/** The month a paperwork credit inquiry counts from: −1 for a first home, the last lived month after a move (task 58). */
export const inquiryMonth = (state) => Math.max(PAPERWORK_MONTH, (state.life?.monthIndex ?? 0) - 1);

const num = (v) => (Number.isFinite(v) ? v : 0);
const fin = (state) => state.finances;

function nextId(list, prefix) {
  let max = 0;
  for (const x of list) {
    const m = typeof x?.id === 'string' && x.id.startsWith(prefix) ? Number(x.id.slice(prefix.length)) : NaN;
    if (Number.isInteger(m) && m > max) max = m;
  }
  return `${prefix}${max + 1}`;
}

function checkAccount(account) {
  if (!ACCOUNTS.includes(account)) throw new RangeError(`unknown account "${account}"`);
}

/** Signed value of an account for the student: checking/savings balance, or −(card balance owed). */
export function accountValue(state, account) {
  checkAccount(account);
  const f = fin(state);
  if (account === 'card') return -num(f.creditCard?.balanceCents);
  return num(f[`${account}Cents`]);
}

function applyToAccount(f, account, amountCents) {
  if (account === 'card') {
    if (!f.creditCard) throw new Error('no credit card to post to');
    f.creditCard.balanceCents -= amountCents;
  } else {
    f[`${account}Cents`] += amountCents;
  }
}

/**
 * Record one transaction and move the account balance with it. Never refuses (balances may go negative):
 * spending goes through charge(), which checks funds. Returns the stored transaction (with its id).
 */
export function post(state, { month, day = 1, label, amountCents, account, category = 'other' }) {
  assertCents(amountCents, 'amountCents');
  checkAccount(account);
  if (!Number.isInteger(month)) throw new RangeError(`month must be an integer, got ${month}`);
  const f = fin(state);
  const txn = { id: nextId(f.transactions, 't'), month, day, label: String(label ?? ''), amountCents, account, category };
  applyToAccount(f, account, amountCents);
  f.transactions.push(txn);
  return txn;
}

/** Money the account can give right now: cash on hand, or room left on the card. */
export function available(state, account) {
  checkAccount(account);
  const f = fin(state);
  if (account === 'card') {
    const c = f.creditCard;
    return c ? Math.max(0, num(c.limitCents) - num(c.balanceCents)) : 0;
  }
  return Math.max(0, num(f[`${account}Cents`]));
}

/**
 * Move cents between two accounts (two 'transfer' transactions). A card as `to` is a card payment; a card as `from`
 * is not allowed. All or nothing: returns {ok: false, shortfallCents} and changes nothing when `from` is short.
 */
export function transfer(state, from, to, cents, { month, day = 1, label } = {}) {
  assertCents(cents, 'cents');
  checkAccount(from); checkAccount(to);
  if (from === 'card' || from === to) throw new RangeError(`can't transfer ${from} → ${to}`);
  if (cents <= 0) return { ok: true, shortfallCents: 0 };
  const short = cents - available(state, from);
  if (short > 0) return { ok: false, shortfallCents: short };
  const text = label ?? (to === 'card' ? 'Credit card payment' : `Transfer to ${to}`);
  post(state, { month, day, label: text, amountCents: -cents, account: from, category: TRANSFER });
  post(state, { month, day, label: text, amountCents: cents, account: to, category: TRANSFER });
  return { ok: true, shortfallCents: 0 };
}

const DEFAULT_SOURCES = { checking: ['checking', 'savings'], savings: ['savings', 'checking'], card: ['card'] };

/**
 * Pay cents out (09 §6 payment order): 'checking' draws on checking then savings, 'savings' on savings then checking,
 * 'card' only on the card's unused limit. Pass an array (e.g. ['checking', 'savings', 'card']) for your own order.
 * All or nothing: when the sources together are short, nothing changes and you get {ok: false, shortfallCents}.
 * On success one transaction per source used; returns {ok: true, shortfallCents: 0, txns}.
 */
export function charge(state, account, cents, { month, day = 1, label, category = 'other' } = {}) {
  assertCents(cents, 'cents');
  const sources = Array.isArray(account) ? account : DEFAULT_SOURCES[account];
  if (!sources) throw new RangeError(`unknown account "${account}"`);
  if (cents <= 0) return { ok: true, shortfallCents: 0, txns: [] };
  const room = sources.reduce((s, a) => s + available(state, a), 0);
  if (room < cents) return { ok: false, shortfallCents: cents - room };
  const txns = [];
  let left = cents;
  for (const a of sources) {
    const take = Math.min(left, available(state, a));
    if (take > 0) txns.push(post(state, { month, day, label, amountCents: -take, account: a, category }));
    left -= take;
    if (!left) break;
  }
  return { ok: true, shortfallCents: 0, txns };
}

// ── Recurring expenses (the portfolio's "automatic expenses") ──────────────────────────────────────────────────

/** Add {label, amountCents, category, source, startsMonth, endsMonth?}; returns the stored item with its id. */
export function addRecurring(state, item) {
  assertCents(item.amountCents, 'amountCents');
  const f = fin(state);
  const stored = { id: item.id ?? nextId(f.recurring, 'r'), label: item.label, amountCents: item.amountCents,
    category: item.category ?? 'other', source: item.source ?? null, startsMonth: item.startsMonth ?? 0 };
  if (item.endsMonth != null) stored.endsMonth = item.endsMonth;
  if (f.recurring.some((r) => r.id === stored.id)) throw new Error(`recurring id "${stored.id}" already exists`);
  f.recurring.push(stored);
  return stored;
}

/** Remove a recurring item by id; returns the removed item or null. */
export function removeRecurring(state, id) {
  const f = fin(state);
  const i = f.recurring.findIndex((r) => r.id === id);
  return i < 0 ? null : f.recurring.splice(i, 1)[0];
}

/** Patch a recurring item (id can't change); returns the updated item or null. */
export function updateRecurring(state, id, patch) {
  const r = fin(state).recurring.find((x) => x.id === id);
  if (!r) return null;
  if (patch.amountCents !== undefined) assertCents(patch.amountCents, 'amountCents');
  Object.assign(r, patch, { id });
  return r;
}

/** Recurring items active in a month (startsMonth ≤ month ≤ endsMonth). */
export function recurringFor(state, month) {
  return fin(state).recurring.filter((r) => num(r.startsMonth) <= month && (r.endsMonth == null || month <= r.endsMonth));
}

// ── Loans (09 §6) ──────────────────────────────────────────────────────────────────────────────────────────────

/** Recurring `source` tag for a loan's PMI line; payLoan removes that item when PMI drops off. */
export const pmiSource = (loanId) => `pmi:${loanId}`;

/**
 * Open a loan: {kind, label, lender, principalCents, rate, termMonths, startMonth, priceCents, pmiCents?, escrow?}.
 * paymentCents = pmt(); PMI stops once the balance is ≤ pmiDropLtv (78%) of priceCents. Returns the loan.
 */
export function openLoan(state, spec) {
  assertCents(spec.principalCents, 'principalCents');
  const f = fin(state);
  const pmiCents = num(spec.pmiCents);
  const loan = {
    id: spec.id ?? nextId(f.loans, 'loan'),
    kind: spec.kind ?? 'mortgage', label: spec.label ?? 'Mortgage', lender: spec.lender ?? '',
    principalCents: spec.principalCents, rate: spec.rate, termMonths: spec.termMonths,
    paymentCents: spec.paymentCents ?? pmt(spec.principalCents, spec.rate, spec.termMonths),
    balanceCents: spec.principalCents, startMonth: spec.startMonth ?? 0,
    priceCents: num(spec.priceCents),
    pmiCents, pmiUntilBalanceCents: pmiCents ? mulRate(num(spec.priceCents), FINANCE.pmiDropLtv) : 0,
    escrow: spec.escrow ?? { taxCents: 0, insuranceCents: 0 },
    paymentsMade: 0, interestPaidCents: 0, lastPaidMonth: null, paidOffMonth: null,
  };
  f.loans.push(loan);
  return loan;
}

/**
 * Apply one month's payment to a loan (the cash itself is charged by the caller, usually as the housing recurring
 * item). interest = balance × rate ÷ 12, principal = payment − interest, the last payment is just what's left.
 * Drops PMI (and its recurring item) once balance ≤ pmiUntilBalanceCents.
 * Returns {paymentCents, interestCents, principalCents, balanceCents, pmiDropped, paidOff}, or null if paid off/unknown.
 */
export function payLoan(state, loanId, month) {
  const loan = fin(state).loans.find((l) => l.id === loanId);
  if (!loan || loan.balanceCents <= 0) return null;
  const interestCents = mulRate(loan.balanceCents, loan.rate / 12);
  const last = loan.paymentsMade + 1 >= loan.termMonths;   // the last scheduled payment absorbs rounding
  const principalCents = last ? loan.balanceCents : Math.min(loan.balanceCents, Math.max(0, loan.paymentCents - interestCents));
  loan.balanceCents -= principalCents;
  loan.paymentsMade += 1;
  loan.interestPaidCents += interestCents;
  loan.lastPaidMonth = month;
  let pmiDropped = false;
  if (loan.pmiCents && loan.balanceCents <= loan.pmiUntilBalanceCents) {
    loan.pmiCents = 0;
    loan.pmiDroppedMonth = month;
    pmiDropped = true;
    for (const r of fin(state).recurring.filter((x) => x.source === pmiSource(loan.id))) removeRecurring(state, r.id);
  }
  const paidOff = loan.balanceCents === 0;
  if (paidOff) loan.paidOffMonth = month;
  return { paymentCents: interestCents + principalCents, interestCents, principalCents, balanceCents: loan.balanceCents,
    pmiDropped, paidOff };
}

/** Close a loan (paid off or foreclosed): balance 0, status 'closed'. Returns the loan or null. */
export function closeLoan(state, loanId, month, reason = 'closed') {
  const loan = fin(state).loans.find((l) => l.id === loanId);
  if (!loan) return null;
  Object.assign(loan, { balanceCents: 0, pmiCents: 0, closedMonth: month, closedReason: reason });
  return loan;
}

export {
  addAgreement, setAgreementStatus, addApplication, resolveApplication, markUpfrontPaid, unpaidUpfront,
} from './ledgerRecords.js';
export { cash, netWorth, ledgerSums, compactHistory, monthTotalsOf } from './ledgerTotals.js';
