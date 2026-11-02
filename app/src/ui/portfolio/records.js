// Portfolio tabs: Agreements, Letters, Applications (02 §2, 05 §9, task 17).
// nav = { openId, open(id), back() }: a list, or one item's read-only detail with a Back button.
import { h } from '../dom.js';
import { formatMoney } from '../../util/format.js';
import { byId } from '../../data/locations/index.js';
import { HOME_TYPES_BY_ID } from '../../data/homeTypes.js';
import { kv, empty, chip, rowButton, detail, humanKey } from './parts.js';
import { agreementSchema } from './agreementDoc.js';
import { renderForm } from '../../forms/engine.js';
import { AGREEMENT_STATUS, APPLICATION_STATUS, letterList, letterRevealed } from './portfolioModel.js';
import { renderLetterReport } from '../letterReport.js';
import { bandFor } from '../../letters/score.js';

const AG_CHIP = { pending: 'yellow', active: 'green', void: 'na', ended: 'na' };
const APP_CHIP = { pending: 'yellow', approved: 'green', denied: 'red' };
const dateText = (ms) => (ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
/** Agreements list; opening one shows the signed document read-only (forms/engine.js, task 18). */
export function renderAgreements(state, nav) {
  const list = state.finances.agreements;
  const open = list.find((a) => a.id === nav.openId);
  if (open) {
    const doc = h('div', { class: 'pf-doc' });
    // Signature dates follow the month the document was signed for (task 58), not today's game month.
    const signedState = { ...state, life: { ...state.life, monthIndex: open.signedMonth ?? 0 } };
    renderForm(doc, agreementSchema(open, state), { values: open.docValues || {}, state: signedState, readOnly: true });
    return detail({ title: open.title || humanKey(open.type), onBack: nav.back },
      h('p', null, chip(AG_CHIP[open.status] ?? 'na', AGREEMENT_STATUS[open.status] ?? open.status),
        open.counterparty ? ` with ${open.counterparty}` : null, open.signedAt ? ` · signed ${dateText(open.signedAt)}` : null),
      doc);
  }
  if (!list.length) return empty('No agreements yet. Leases, loans and policies you sign appear here.');
  return h('ul', { class: 'pf-list' }, list.map((a) => rowButton({
    title: a.title || humanKey(a.type), meta: [a.counterparty, dateText(a.signedAt)].filter(Boolean).join(' · '),
    badge: chip(AG_CHIP[a.status] ?? 'na', AGREEMENT_STATUS[a.status] ?? a.status), onClick: () => nav.open(a.id),
  })));
}

/** Letters list; opening one shows the score report (06 §5, task 28) and the letter text. */
export function renderLetters(state, nav) {
  const list = letterList(state);
  const open = list.find((l) => l.id === nav.openId);
  if (open) {
    return detail({ title: letterTitle(open), onBack: nav.back },
      kv([['To', open.to || '—'], ['Sent', dateText(open.sentAt) || '—']]),
      h('div', { class: 'pf-report' }, letterRevealed(state, open) ? renderLetterReport(open)
        : h('p', { class: 'muted' }, "You'll find out how this letter was received with your results at the end of this phase.")),
      h('h4', { class: 'pf-block-title' }, 'Your letter'),
      h('div', { class: 'pf-letter' }, String(open.text || '').split(/\n{2,}/).map((p) => h('p', null, p))));
  }
  if (!list.length) return empty('No letters yet. Letters you write during paperwork are kept here.');
  return h('ul', { class: 'pf-list' }, list.map((l) => rowButton({
    title: letterTitle(l), meta: [l.to, dateText(l.sentAt)].filter(Boolean).join(' · '),
    badge: scored(l.score) && letterRevealed(state, l) ? chip(bandFor(l.score.likelihood).status, `${bandFor(l.score.likelihood).label} · ${l.score.likelihood}`) : null,
    onClick: () => nav.open(l.id),
  })));
}

const scored = (score) => score && !score.pending && score.likelihood != null;

function letterTitle(l) {
  return `${humanKey(l.type || 'letter')} letter`;
}

/** Applications: kind, target, status, fee and reasons. */
export function renderApplications(state) {
  const list = [...state.finances.applications].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  if (!list.length) return empty('No applications yet.');
  return h('ul', { class: 'pf-list pf-apps' }, list.map((a) => h('li', { class: 'pf-app' },
    h('div', { class: 'pf-app-head' },
      h('strong', null, `${humanKey(a.kind)} application`),
      chip(APP_CHIP[a.status] ?? 'na', APPLICATION_STATUS[a.status] ?? a.status)),
    kv([['For', targetText(a.target)], ['Fee', formatMoney(a.feeCents || 0, { showCents: true })],
      a.at ? ['Submitted', dateText(a.at)] : null]),
    a.reasons?.length ? h('ul', { class: 'pf-reasons' }, a.reasons.map((r) => h('li', null, r))) : null)));
}

function targetText(t) {
  if (!t) return '—';
  const [loc, type] = String(t).split('|');
  const place = byId[loc]?.name ?? humanKey(loc);
  return type ? `${place}, ${(HOME_TYPES_BY_ID[type]?.label ?? type).toLowerCase()}` : place;
}
