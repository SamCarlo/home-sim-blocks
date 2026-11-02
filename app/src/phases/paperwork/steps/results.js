// Results (05 §8, task 31): the end of Phase 2. One card per decision (chance, factors, reasons, the letter report),
// then the money: what you receive, what you pay now, what you owe each month, the loan or lease, insurance, the card,
// and "If you don't pay…". The decisions are computed once (finance/underwriting.js decide) and stored in
// paperwork.decisions so a reload shows the same cards; Continue runs commitPaperwork. Numbers: ../resultsModel.js.
import { h, clear } from '../../../ui/dom.js';
import { renderLetterReport } from '../../../ui/letterReport.js';
import { formatMoney } from '../../../finance/money.js';
import { decide, letterFor } from '../../../finance/underwriting.js';
import { durationText } from '../../../finance/creditCard.js';
import { rescorePending } from '../../../letters/score.js';
import { loadSpeller } from '../../../letters/loadSpeller.js';
import { letterType } from '../../../letters/types.js';
import { monthLabel } from '../../../util/dates.js';
import { byId } from '../../../data/locations/index.js';
import { homeType } from '../../../data/homeTypes.js';
import { detailTitle } from '../../plan/detailModel.js';
import { commitPaperwork } from '../commit.js';
import { resultsSummary, letterStepsFor, factorLine } from '../resultsModel.js';
import { term } from '../../../ui/term.js';

const money = (c) => formatMoney(c);
const exact = (c) => formatMoney(c, { showCents: true });
const pct = (x) => `${Math.round(x * 100)}%`;
const lower = (s) => s[0].toLowerCase() + s.slice(1);

/** A titled block of the report. */
const block = (title, ...children) => h('section', { class: 'pw-res-block' }, h('h3', { class: 'pw-res-h' }, title), ...children);

/** An itemized money table: rows [{label, cents, note?}], optional total row. */
function table(rows, total = null, fmt = exact) {
  return h('table', { class: 'pw-res-table' },
    h('tbody', null, ...rows.map((r) => h('tr', null,
      h('th', { scope: 'row' }, r.label, r.note ? h('span', { class: 'pw-res-note' }, r.note) : null),
      h('td', null, fmt(r.cents))))),
    total ? h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, total.label), h('td', null, fmt(total.cents)))) : null);
}

/** A definition list of terms: [[label, value]]. */
const terms = (pairs) => h('dl', { class: 'pw-res-terms' }, ...pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));

/** One decision card (05 §8): verdict chip, chance and factors, reasons, and each letter's report. */
function decisionCard(state, d) {
  const isCard = d.kind === 'credit-card';
  const ok = d.approved;
  const chip = h('span', { class: `pw-res-chip status-${ok ? 'green' : 'red'}` },
    h('span', { 'aria-hidden': 'true' }, ok ? '✓ ' : '✕ '), isCard ? (ok ? 'Card opens' : 'Not opened') : ok ? 'Approved' : 'Denied');
  const chance = isCard ? null : h('p', { class: 'pw-res-chance' },
    h('strong', null, `Approval chance ${pct(d.probability)}`),
    d.hardFail ? ': a rule the lender can\'t bend wasn\'t met.' : ` (${factorLine(d)})`);
  const factors = isCard || d.hardFail ? null : h('ul', { class: 'pw-res-factors' },
    ...d.factors.map((f) => h('li', null, h('strong', null, `${f.label} ×${+f.value.toFixed(2)}`), f.note ? `: ${f.note}` : '')));
  const reasons = h('ul', { class: `pw-res-reasons${ok ? '' : ' is-denied'}` }, ...d.reasons.map((r) => h('li', null, r)));
  const letters = letterStepsFor(d.kind, state).map((stepId) => {
    const ref = letterFor(state, stepId);
    const letter = ref ? state.letters[ref.id] : null;
    if (!letter) return null;
    const lt = letterType(stepId);
    return h('details', { class: 'pw-res-letter' },
      h('summary', null, `Your ${lower(lt.label)}: ${ref.band ?? ''} (${Math.round(ref.likelihood)} / 100)`),
      renderLetterReport({ text: letter.text, score: letter.score }));
  });
  return h('article', { class: `pw-res-decision card${ok ? '' : ' is-denied'}`, dataset: { kind: d.kind, approved: String(ok) } },
    h('header', { class: 'pw-res-dhead' }, h('h3', null, d.label), chip), chance, factors, reasons, ...letters);
}

/** The monthly obligations table, with when each bill starts (builds) and what is left of take-home pay. */
function monthlyBlock(m) {
  const rows = m.items.map((i) => ({ label: i.label, cents: i.cents,
    note: [i.startsMonth > (m.baseMonth ?? 0) ? `starts ${monthLabel(i.startsMonth)}` : '', i.endsMonth != null ? `until ${monthLabel(i.endsMonth)}` : '']
      .filter(Boolean).join(', ') || null }));
  return block('What you owe each month',
    table(rows, { label: 'Total each month', cents: m.totalCents }),
    m.laterStart ? h('p', { class: 'pw-res-small' }, `Until your house is finished you pay ${exact(m.firstCents)} a month; the housing bills start when you move in.`) : null,
    terms([['Your take-home pay', exact(m.incomeCents)], ['Left for everything else', exact(m.leftCents)]]),
    h('p', { class: 'pw-res-small' }, 'Your credit card bill is extra: whatever you charge, due each month.'));
}

/** The money half of the report for an approved home. */
function moneyBlocks(r) {
  const out = [];
  if (r.receive.length) out.push(block('Money you receive', table(r.receive, null, money)));
  if (r.moveOut?.lines.length) {
    out.push(block(r.moveOut.kind === 'sell' ? 'Selling your old home' : 'Moving out of your old home',
      table(r.moveOut.lines, { label: r.moveOut.netCents >= 0 ? 'Back to your savings' : 'From your savings', cents: r.moveOut.netCents })));
  }
  out.push(block('Cash you pay now', r.payNow.lines.length ? table(r.payNow.lines, { label: 'Total from your savings', cents: r.payNow.totalCents })
    : h('p', null, 'Nothing more today.'),
  terms([['Already paid during paperwork (fees, deposits)', exact(r.payNow.alreadyPaidCents)],
    [r.moveOut ? 'Cash in the bank after moving out' : 'Cash in the bank now', exact(r.payNow.cashBeforeCents)], ['Cash left after this', exact(r.payNow.cashAfterCents)]])));
  if (r.monthly) out.push(monthlyBlock(r.monthly));
  if (r.loan) {
    const l = r.loan;
    out.push(block('Your loan', terms([['Lender', l.lender], ['Borrowed', money(l.principalCents)], ['Interest rate', `${(l.rate * 100).toFixed(3)}% a year`],
      ['Term', durationText(l.termMonths)], ['Monthly payment (principal and interest)', exact(l.paymentCents)],
      l.buildMonths ? ['Payments start', `${monthLabel(l.buildMonths)}, when the house is finished`] : null,
      ['Total of all payments', money(l.totalPaidCents)], ['Total interest', money(l.totalInterestCents)]]),
    h('p', { class: 'pw-res-small' }, `Over ${durationText(l.termMonths)} you pay back ${money(l.totalPaidCents)} for ${money(l.principalCents)} borrowed. The extra ${money(l.totalInterestCents)} is interest.`)));
  }
  if (r.lease) {
    const l = r.lease;
    out.push(block('Your lease', terms([['Landlord', l.landlord], ['Rent', `${exact(l.rentCents)} a month`], ['Length', durationText(l.termMonths)],
      [term('security-deposit', 'Security deposit'), exact(l.depositCents)], l.cosigned ? [term('co-signer', 'Co-signer'), 'Yes, your co-signer signed with you'] : null])));
  }
  if (r.insurance) {
    const i = r.insurance;
    out.push(block('Your insurance', terms([['Policy', `${i.title}, ${i.quoteLabel}`], ['Insurer', i.insurer], ['Cost', `${exact(i.monthlyCents)} a month`],
      ['Deductible', `${money(i.deductibleCents)} (you pay this much of each claim first)`],
      i.addOns.length ? ['Add-ons', i.addOns.map((a) => a.label).join(', ')] : null])));
  }
  return out;
}

/** Credit card terms, shown whenever the card opens (even if the home was denied). */
function cardBlock(t) {
  return block('Your credit card', terms([['Limit', money(t.limitCents)], [term('apr'), `${(t.apr * 100).toFixed(2)}%`],
    ['Autopay', t.autopay === 'full' ? 'Pays the full statement each month' : t.autopay === 'minimum' ? 'Pays only the minimum' : 'Off'],
    ['Late fee', money(t.lateFeeCents)], ['Interest-free if paid in full within', `${t.graceDays} days`],
    t.secured ? ['Deposit', `${money(t.depositCents)} (comes back when you close the card)`] : null]));
}

/** "If you don't pay…" with the student's own numbers. */
const dontPayBlock = (list) => block('If you don\'t pay…', ...list.map((c) => h('div', { class: 'pw-res-dontpay', dataset: { key: c.key } },
  h('h4', null, c.title), h('ul', null, ...c.items.map((x) => h('li', null, x))))));

/** Mount the Results step: decide once (after the speller loads), then draw the report. */
function mount(container, { store }) {
  const root = h('section', { class: 'pw-res' });
  container.append(root);
  let alive = true;
  let busy = false;

  const head = (state) => {
    const title = detailTitle(byId[state.choice.locationId], homeType(state.choice.homeTypeId));
    return [h('p', { class: 'pw-kind' }, 'Review'), h('h2', { class: 'pw-step-title', tabindex: '-1' }, 'Results'), title];
  };

  function draw() {
    const state = store.getState();
    if (!alive || state.phase !== 'paperwork' || !state.choice) return;
    const [kind, h2, title] = head(state);
    const decisions = state.paperwork.decisions;
    const letters = decisions.flatMap((d) => letterStepsFor(d.kind, state).map((id) => letterFor(state, id)).filter(Boolean));
    const r = resultsSummary(state, decisions, { letters });
    const verdict = h('div', { class: `pw-res-verdict status-${r.approved ? 'green' : 'red'}`, role: 'status' },
      h('p', { class: 'pw-res-big' }, h('span', { 'aria-hidden': 'true' }, r.approved ? '✓ ' : '✕ '),
        r.approved ? `Approved! The ${lower(title)} is yours.` : 'Not approved this time.'),
      h('p', null, r.approved ? 'Here is everything you agreed to: the money, the monthly bills, and what happens if you miss a payment.'
        : `The ${lower(r.home.label)} for the ${lower(title)} was turned down. Here's what happened and what you can try next.`));
    const land = state.paperwork.options.land;
    const after = r.approved ? moneyBlocks(r) : [
      block('What you can try next', h('ul', { class: 'pw-res-next' }, ...r.nextSteps.map((x) => h('li', null, x)))),
      block('Your money', terms([['Spent on fees for this home', exact(r.payNow.alreadyPaidCents)],
        land?.contingency && land.earnestCents ? ['Earnest money', `${money(land.earnestCents)} comes back (you kept the financing contingency)`] : null,
        ['Charged today', r.payNow.totalCents ? `${exact(r.payNow.totalCents)} (card deposit)` : 'Nothing']]))];
    const button = h('button', { type: 'button', class: 'btn btn-primary pw-res-continue', onClick: () => go(r.approved, button) },
      r.approved ? 'Continue to design your home' : 'Back to planning');
    clear(root);
    root.append(kind, h2, verdict,
      h('div', { class: 'pw-res-decisions' }, ...decisions.map((d) => decisionCard(state, d))),
      ...after,
      r.cardTerms ? cardBlock(r.cardTerms) : null,
      r.ifYouDontPay.length ? dontPayBlock(r.ifYouDontPay) : null,
      h('div', { class: 'pw-res-actions' }, button));
  }

  function go(approved, button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    store.update((s) => { commitPaperwork(s, s.paperwork.decisions, Date.now()); },
      { checkpoint: approved ? 'paperwork-committed' : 'paperwork-denied' });
  }

  if (store.getState().paperwork.decisions?.length) {
    draw();
  } else {
    root.append(...head(store.getState()).slice(0, 2),
      h('p', { class: 'pw-res-loading muted', role: 'status' }, 'The landlord or lender is reading your paperwork…'));
    loadSpeller().catch(() => null).then((speller) => {
      if (!alive || store.getState().phase !== 'paperwork') return;
      store.update((s) => {
        if (speller) rescorePending(s, { speller });
        s.paperwork.decisions = decide(s, { speller });
        s.paperwork.lettersRevealed = true;
      }, { checkpoint: 'paperwork-results' });
      draw();
    });
  }
  return () => { alive = false; };
}

export default { id: 'results', title: 'Results', kind: 'review', mount };
