// The "looking for a new place" bar (task 58): shown between the header and the screen in Plan and Paperwork while a
// Phase 4 student shops for a new home (life/relocation.js). It says where they still live and what moving out will
// bring or cost, and its Cancel button takes them back to Live exactly where they left off.
import { h } from './dom.js';
import { confirmDialog } from './modal.js';
import { formatMoney } from '../finance/money.js';
import { moveOutQuote, quoteText, canCancelRelocation, cancelRelocation } from '../life/relocation.js';

/** The bar for the current state, or null when the student isn't moving (or can no longer cancel). */
export function renderRelocationBar(store) {
  const state = store.getState();
  if (!canCancelRelocation(state)) return null;
  const q = moveOutQuote(state);
  const label = state.relocation.from?.label || 'your home';
  const what = q.kind === 'sell' ? 'Selling your home' : 'Moving out';
  async function cancel() {
    const s = store.getState();
    const paid = Object.values(s.paperwork?.paidUpfront ?? {}).reduce((t, c) => t + c, 0);
    const ok = await confirmDialog({
      title: 'Stop looking and stay home?',
      message: `You go back to ${label} and pick up where you left off. `
        + (s.choice ? `The paperwork you started stops here. ${paid > 0 ? `The ${formatMoney(paid)} in fees you paid is not refunded.` : 'Fees you paid are not refunded.'} ` : '')
        + 'Letters you wrote stay in your portfolio.',
      confirmLabel: 'Yes, stay home',
      cancelLabel: 'Keep looking',
    });
    if (ok) store.update((d) => cancelRelocation(d, Date.now()), { checkpoint: 'relocation-cancelled' });
  }
  return h('section', { class: 'reloc-bar', 'aria-label': 'Looking for a new place' },
    h('p', { class: 'reloc-text' },
      h('strong', null, 'Looking for a new place. '),
      `You still live at ${label}. ${what} when a new home says yes: `, h('strong', { class: 'reloc-net' }, quoteText(q.netCents)), '.'),
    h('button', { class: 'btn btn-secondary reloc-cancel', type: 'button', onClick: () => { cancel().catch(console.error); } },
      'Cancel and go home'));
}
