// Finding a new place from Phase 4 (task 58). Pure: no DOM. The student keeps living in their home while they shop
// (`state.home` stays the old home through Plan and Paperwork); `state.relocation` marks the search. Cancel goes back to
// Live exactly where they were. When Results approve the new home, commitPaperwork calls moveOut first: renters get the
// deposit back and pay the lease-break fee inside their first lease term, owners sell (selling costs, the loan is paid
// off), the old bills and agreements end, and cats and dogs come along. Every move-in finishes with startLife, which
// keeps the calendar going (monthIndex, history and wellbeing are never reset).
import { LEASE, RELOCATION } from '../config.js';
import { PAPERWORK_MONTH, post, closeLoan, removeRecurring, setAgreementStatus } from '../finance/ledger.js';
import { mulRate, formatMoney } from '../finance/money.js';
import { withdraw } from '../phases/paperwork/flow.js';

const OWNER_KINDS = ['condo', 'house', 'build'];
const HOME_LOAN_KINDS = ['mortgage', 'construction-perm'];
const CARD_TYPES = ['card', 'credit-card'];
const stageOf = (state) => state.life?.current?.stage ?? 'welcome';

/** The open loans on the home (mortgage or construction-to-permanent) that a sale pays off. */
export function homeLoans(state) {
  return (state.finances?.loans ?? []).filter((l) => HOME_LOAN_KINDS.includes(l.kind) && !l.closedReason && l.balanceCents > 0);
}

/** The active lease agreement (apartment or room), or null. */
export function activeLease(state) {
  return (state.finances?.agreements ?? []).find((a) => a.status === 'active' && (a.docType ?? a.type) === 'lease') ?? null;
}

/**
 * What moving out of the current home is worth (task 58) → `{kind: 'sell'|'break-lease'|'end-lease'|'none', lines
 * [{key, label, cents}], netCents}`; + = money back, − = money owed. Owners sell at the purchase price, minus
 * `RELOCATION.sellingCostPct` and the loan payoff (it can be negative). Renters get the deposit back and owe
 * `LEASE.breakMonths` months' rent while still inside the lease term.
 */
export function moveOutQuote(state) {
  const home = state.home;
  if (!home) return { kind: 'none', lines: [], netCents: 0 };
  const lines = [];
  let kind;
  if (OWNER_KINDS.includes(home.kind)) {
    kind = 'sell';
    const price = home.purchasePriceCents ?? 0;
    lines.push({ key: 'sale', label: 'Sale price of your home', cents: price });
    lines.push({ key: 'selling-costs', label: `Selling costs (agent and closing, ${Math.round(RELOCATION.sellingCostPct * 100)}%)`,
      cents: -mulRate(price, RELOCATION.sellingCostPct) });
    for (const l of homeLoans(state)) {
      lines.push({ key: `payoff:${l.id}`, label: `Pay off the rest of your ${String(l.label).toLowerCase()}`, cents: -l.balanceCents, loanId: l.id });
    }
  } else {
    const lease = activeLease(state);
    const t = lease?.terms ?? {};
    if (t.depositCents > 0) lines.push({ key: 'deposit', label: 'Security deposit back', cents: t.depositCents });
    const lived = (state.life?.monthIndex ?? 0) - (t.startMonth ?? 0);
    const rent = (state.finances.recurring.find((r) => r.source === 'lease')?.amountCents) ?? t.rentCents ?? 0;
    if (lease && lived < (t.termMonths ?? LEASE.termMonths) && rent > 0) {
      kind = 'break-lease';
      lines.push({ key: 'break-fee', label: `Lease break fee (${LEASE.breakMonths} months’ rent)`, cents: -LEASE.breakMonths * rent });
    } else {
      kind = 'end-lease';
    }
  }
  return { kind, lines, netCents: lines.reduce((t, l) => t + l.cents, 0) };
}

/** One line for the quote's total: "+$1,800 back" / "$4,200 to pay" / "nothing". */
export function quoteText(netCents) {
  if (netCents > 0) return `+${formatMoney(netCents)} back`;
  if (netCents < 0) return `${formatMoney(-netCents)} to pay`;
  return 'nothing';
}

/** The move-out money that counts as cash while shopping (cashOf adds it): the quote's net until moveOut runs. */
export function pendingMoveOutCents(state) {
  return state.relocation && !state.relocation.movedOut && state.home ? moveOutQuote(state).netCents : 0;
}

/** True when "Find a new place to live" is allowed: in Live, with a home, at the welcome or plan stage. */
export function canRelocate(state) {
  return state.phase === 'life' && !!state.home && !state.relocation && ['welcome', 'plan'].includes(stageOf(state));
}

/** Start looking for a new place: remembers where they came from, then opens Plan. Mutates a store draft. */
export function startRelocation(s) {
  if (!canRelocate(s)) throw new Error('startRelocation: only from Live (welcome or plan stage) with a home');
  s.relocation = { startedMonth: s.life.monthIndex, stage: stageOf(s),
    from: { kind: s.home.kind, locationId: s.home.locationId, label: s.home.label ?? '' } };
  s.plan.expanded = null;
  s.choice = null;
  s.phase = 'plan';
  return s.relocation;
}

/** True while Cancel can still take the student home (before the new home is approved). */
export function canCancelRelocation(state) {
  return !!state.relocation && !state.relocation.movedOut && ['plan', 'paperwork'].includes(state.phase);
}

/**
 * Cancel the search (task 58): any paperwork in progress is withdrawn like "Choose a different home" (fees stay spent,
 * letters are kept), then back to Live with life.current untouched. Mutates a store draft.
 */
export function cancelRelocation(s, now = 0) {
  if (!canCancelRelocation(s)) throw new Error('cancelRelocation: nothing to cancel');
  if (s.choice) withdraw(s, now, 'You decided to stay in your home.');
  s.relocation = null;
  s.plan.expanded = null;
  s.phase = 'life';
  return s;
}

/**
 * Leave the old home (called by commitPaperwork on approval, before the new upfront costs). Posts the quote to savings
 * (paperwork month), closes the home loan as 'sold', removes every recurring bill (the new home adds its own), ends the
 * old agreements (not the card), and packs the cats and dogs into `relocation.pets`. Mutates a store draft → the quote.
 */
export function moveOut(s) {
  const quote = moveOutQuote(s);
  for (const l of quote.lines) {
    if (l.loanId) closeLoan(s, l.loanId, s.life.monthIndex, 'sold');
    if (l.cents) post(s, { month: PAPERWORK_MONTH, label: `Moving out: ${l.label}`, amountCents: l.cents, account: 'savings', category: 'housing' });
  }
  for (const r of [...s.finances.recurring]) removeRecurring(s, r.id);
  for (const a of s.finances.agreements) {
    if (a.status === 'active' && !CARD_TYPES.includes(a.type) && !String(a.docType ?? '').includes('credit-card')) setAgreementStatus(s, a.id, 'ended');
  }
  const pets = (s.home?.animals ?? []).filter((a) => a.present !== false && RELOCATION.carriedPets.includes(a.kind));
  Object.assign(s.relocation, { movedOut: true, pets: structuredClone(pets), quote });
  return quote;
}

/**
 * Finish any move-in (07 §1; all four design pickers call it last): keep the calendar where it is (0 for a first home,
 * the next unlived month after a move or an eviction), welcome stage, phase 'life'. Pets carried from the old home join
 * the new one with fresh ids. Mutates a store draft.
 */
export function startLife(s) {
  const pets = s.relocation?.pets ?? [];
  if (pets.length && s.home) {
    const animals = s.home.animals ?? (s.home.animals = []);
    let n = animals.reduce((m, a) => Math.max(m, Number(String(a.id).slice(1)) || 0), 0);
    for (const p of pets) animals.push({ ...p, id: `a${++n}`, spot: 'yard' });
  }
  if (s.home) delete s.home.pickDraft; // the design picker's saved selection is done with
  s.relocation = null;
  s.life.current = { stage: 'welcome' };
  s.phase = 'life';
  return s;
}
