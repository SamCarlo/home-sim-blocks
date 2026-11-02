// Ledger records that aren't balances (02 §2, 05 §2, §8–§9): agreements, applications and which upfront cost lines
// were already paid during paperwork. Same convention as ledger.js: mutate the state given, return the record. Pure.
import { assertCents } from './money.js';

/** Agreement statuses (02 §2). */
export const AGREEMENT_STATUSES = ['pending', 'active', 'void', 'ended'];
/** Application statuses (02 §2). */
export const APPLICATION_STATUSES = ['pending', 'approved', 'denied'];

function nextId(list, prefix) {
  const used = new Set(list.map((x) => x.id));
  let n = list.length + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Add an agreement {type, docType?, title, counterparty, summary, terms, docValues, signedAt}; status defaults to 'pending'. */
export function addAgreement(state, a) {
  const list = state.finances.agreements;
  const stored = { id: a.id ?? nextId(list, 'ag'), type: a.type, title: a.title ?? '', status: a.status ?? 'pending',
    signedAt: a.signedAt ?? null, counterparty: a.counterparty ?? '', summary: a.summary ?? '',
    terms: a.terms ?? {}, docValues: a.docValues ?? {}, ...(a.docType ? { docType: a.docType } : {}),
    // Signed for a home that starts mid-game (task 58): the documents are dated the month before (forms signDateLabel).
    ...(state.life?.monthIndex > 0 ? { signedMonth: state.life.monthIndex } : {}) };
  if (!AGREEMENT_STATUSES.includes(stored.status)) throw new RangeError(`bad agreement status "${stored.status}"`);
  list.push(stored);
  return stored;
}

/** Set an agreement's status ('pending' | 'active' | 'void' | 'ended' (moved out, task 58)); returns it, or null if the id is unknown. */
export function setAgreementStatus(state, id, status) {
  if (!AGREEMENT_STATUSES.includes(status)) throw new RangeError(`bad agreement status "${status}"`);
  const a = state.finances.agreements.find((x) => x.id === id);
  if (a) a.status = status;
  return a ?? null;
}

/** Record a submitted application {kind, target, feeCents, at} as 'pending' (05 §9). The fee is charged separately. */
export function addApplication(state, app) {
  const list = state.finances.applications;
  const stored = { id: app.id ?? nextId(list, 'app'), kind: app.kind, target: app.target ?? null, status: 'pending',
    feeCents: app.feeCents ?? 0, at: app.at ?? null, reasons: [] };
  assertCents(stored.feeCents, 'feeCents');
  list.push(stored);
  return stored;
}

/** Approve or deny an application, with reasons; returns it, or null if the id is unknown. */
export function resolveApplication(state, id, { approved, reasons = [] }) {
  const a = state.finances.applications.find((x) => x.id === id);
  if (!a) return null;
  a.status = approved ? 'approved' : 'denied';
  a.reasons = [...reasons];
  return a;
}

/**
 * Note that cents of the upfront cost line `key` (a cellCost line key: 'application', 'inspection', 'appraisal',
 * 'permit', …) were paid during paperwork. Stored in paperwork.paidUpfront {key: cents}; adds up if called twice.
 */
export function markUpfrontPaid(state, key, cents) {
  assertCents(cents, 'cents');
  const pw = state.paperwork;
  pw.paidUpfront ??= {};
  pw.paidUpfront[key] = (pw.paidUpfront[key] ?? 0) + cents;
  return pw.paidUpfront[key];
}

/**
 * Upfront lines from the chosen home's snapshot still to pay at commit: [{key, label, cents, note}] where cents is
 * what's left after paperwork payments (fully paid lines are left out).
 */
export function unpaidUpfront(state) {
  const lines = state.choice?.snapshot?.breakdown?.upfront ?? [];
  const paid = state.paperwork?.paidUpfront ?? {};
  return lines
    .map((l) => ({ ...l, cents: Math.max(0, l.cents - (paid[l.key] ?? 0)) }))
    .filter((l) => l.cents > 0);
}
