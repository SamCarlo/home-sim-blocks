// Closing disclosure (05 §3–§4, task 22): review and sign. The numbers come from the chosen loan option, with one
// deliberate error: the rate is 0.25 points higher than agreed. Each row has a "Flag an error" button; flagging the rate
// fixes it. Signing without catching it keeps the higher rate (paperwork.options.closing, for the results screen).
import { h } from '../../../ui/dom.js';
import { formatMoney } from '../../../finance/money.js';
import { sameName, signDateLabel } from '../../../forms/validate.js';
import { loanOptions, findOption, optionLabel } from '../../../finance/loanOptions.js';
import { closingDisclosure, flagRow, closingOutcome } from '../../../finance/buying.js';
import { businessFor } from '../../../content/names.js';
import { setStep } from '../flow.js';

const money = (c) => formatMoney(c);
const pct = (rate) => `${+(rate * 100).toFixed(3)}%`;

/** The chosen option, its closing disclosure and the lender for this attempt. */
export function closingTerms(state, flagged = false) {
  const r = loanOptions(state);
  const option = findOption(r, state.paperwork.options);
  if (!option) throw new Error('Choose a loan option first');
  const escrowCents = r.fixedLines.filter((l) => ['property-tax', 'insurance', 'hazard'].includes(l.key))
    .reduce((t, l) => t + l.cents, 0);
  return { option, cd: closingDisclosure(option, { flagged, escrowCents }), lender: businessFor(state, 'lenders') };
}

function rows(cd) {
  return [
    ['loan', 'Loan amount', money(cd.loanCents)],
    ['rate', 'Interest rate (fixed)', pct(cd.rate)],
    ['pi', 'Monthly principal & interest', money(cd.piCents)],
    ['mi', 'Mortgage insurance (PMI/MIP) per month', cd.miCents ? money(cd.miCents) : '$0'],
    ['escrow', 'Escrow per month (property tax + insurance)', money(cd.escrowCents)],
    ['monthly', 'Estimated total monthly payment', money(cd.monthlyCents)],
    ['cash', 'Cash to close', money(cd.cashToCloseCents)],
    ['prepay', 'Prepayment penalty', 'No'],
    ['balloon', 'Balloon payment', 'No'],
  ];
}

export default {
  id: 'closing-disclosure',
  title: 'Closing disclosure',
  kind: 'review',
  mount(container, { store, status, values, onDone, onDraft }) {
    const readOnly = status === 'done' || status === 'skipped';
    const st = store.getState();
    const done = st.paperwork.options.closing;
    let flagged = readOnly ? !!done?.errorFlagged : !!values.flagged;
    let wrongFlags = readOnly ? done?.wrongFlags ?? 0 : values.wrongFlags ?? 0;
    let note = null;
    const root = h('section', { class: 'pw-cd card' });
    container.append(root);
    const sig = h('input', { type: 'text', id: 'cd-signature', class: 'input', autocomplete: 'off', value: values.signature ?? '' });
    const sigErr = h('p', { class: 'fm-error', id: 'cd-signature-error', hidden: true });

    function flag(row) {
      const res = flagRow(row);
      if (res.correct) flagged = true; else wrongFlags += 1;
      note = { row, ...res };
      onDraft?.({ flagged, wrongFlags, signature: sig.value });
      draw();
    }
    function sign() {
      const name = store.getState().player.characterName;
      if (!sameName(sig.value, name)) {
        sigErr.hidden = false;
        sigErr.textContent = `Type your character’s name, ${name}, to sign.`;
        sig.setAttribute('aria-invalid', 'true');
        sig.focus();
        return;
      }
      onDone({ flagged, wrongFlags, signature: sig.value });
    }

    function draw() {
      const s = store.getState();
      const { option, cd, lender } = closingTerms(s, flagged);
      const list = rows(cd).map(([key, label, value]) => h('tr', { class: `pw-cd-row${key === 'rate' && flagged ? ' is-fixed' : ''}`, dataset: { row: key } },
        h('th', { scope: 'row' }, label),
        h('td', { class: 'num' }, value),
        h('td', { class: 'pw-cd-flag' }, readOnly || (key === 'rate' && flagged) ? (key === 'rate' && flagged ? '✓ Fixed' : '')
          : h('button', { type: 'button', class: 'btn btn-secondary btn-small', dataset: { flag: key },
            'aria-label': `Flag an error: ${label}`, onClick: () => flag(key) }, 'Flag an error'))));
      const parts = [
        h('p', { class: 'pw-kind' }, 'Review and sign'),
        h('h2', { class: 'pw-step-title', tabindex: '-1' }, 'Closing disclosure'),
        h('p', { class: 'pw-lo-intro' }, `${lender} sent the final numbers for your loan. Lenders make mistakes, and once `
          + 'you sign, you are stuck with them. Compare every number with the loan you chose.'),
        h('div', { class: 'fm-info fm-info-teach pw-cd-agreed' }, h('h4', null, 'The loan you agreed to'),
          h('p', null, `${optionLabel(option)} at ${pct(cd.agreedRate)} fixed, on a ${money(option.loanCents)} loan.`)),
        h('table', { class: 'fm-table pw-cd-table' }, h('caption', null, `Closing Disclosure · ${lender} · ${signDateLabel(s)}`),
          h('tbody', null, ...list)),
        note ? h('p', { class: `pw-cd-note ${note.correct ? 'pw-good' : 'pw-bad'}`, role: 'status' }, note.message) : null,
      ];
      if (flagged) {
        parts.push(h('p', { class: 'pw-good' }, `The lender fixed the rate from ${pct(cd.shownRate)} to ${pct(cd.agreedRate)}. `
          + `That saves ${money(closingDisclosure(option, { flagged: false }).piCents - cd.piCents)} a month.`));
      }
      if (readOnly) {
        parts.push(h('p', { class: 'pw-lo-done' }, flagged ? 'You caught the error and signed at the rate you agreed to.'
          : `You signed without catching the error, so your rate is ${pct(done?.finalRate ?? cd.rate)}.`));
      } else {
        parts.push(h('div', { class: 'fm-field pw-cd-sign' },
          h('label', { class: 'fm-label', for: 'cd-signature' }, `Signature (dated ${signDateLabel(s)})`),
          sig, sigErr,
          h('button', { type: 'button', class: 'btn btn-primary', dataset: { act: 'sign' }, onClick: sign }, 'Sign closing disclosure')));
      }
      root.replaceChildren(...parts.filter(Boolean));
    }
    sig.setAttribute('aria-describedby', 'cd-signature-error');
    sig.addEventListener('input', () => { sigErr.hidden = true; sig.removeAttribute('aria-invalid'); });
    draw();
    return () => {};
  },
  /** Sign: record the rate you'll really pay (options.closing) and whether the error was caught. */
  complete(state, values, now = 0) {
    if (!sameName(values.signature ?? '', state.player.characterName)) throw new Error('Signature does not match');
    const { cd } = closingTerms(state, !!values.flagged);
    state.paperwork.options.closing = closingOutcome(cd, values.wrongFlags ?? 0);
    setStep(state, 'closing-disclosure', 'done', values, now);
    return { ok: true, shortfallCents: 0 };
  },
};
