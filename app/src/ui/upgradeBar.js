// The "Upgrading your home" bar (13 §10, blocks task 20): shown between the header and the Design screen while
// `state.upgrade` is set. Its Cancel puts the home and the block world back exactly and returns to Live (nothing charged).
import { h } from './dom.js';
import { confirmDialog } from './modal.js';
import { cancelUpgrade } from '../life/upgrade.js';

/** The bar for the current state, or null when no upgrade is in progress. */
export function renderUpgradeBar(store) {
  const state = store.getState();
  if (!state.upgrade || state.phase !== 'design') return null;
  const label = state.upgrade.homeBefore?.label || 'your home';
  async function cancel() {
    const ok = await confirmDialog({
      title: 'Stop upgrading?',
      message: `You go back to ${label} as it was. Nothing is charged and your blocks stay exactly where they are.`,
      confirmLabel: 'Yes, stop',
      cancelLabel: 'Keep upgrading',
    });
    if (ok) store.update((d) => { if (d.upgrade) cancelUpgrade(d); }, { checkpoint: 'upgrade-cancelled' });
  }
  return h('section', { class: 'reloc-bar upgrade-bar', 'aria-label': 'Upgrading your home' },
    h('p', { class: 'reloc-text' }, h('strong', null, 'Upgrading your home. '), `You still live at ${label}. You pay only for what is new.`),
    h('button', { class: 'btn btn-secondary reloc-cancel upgrade-cancel', type: 'button', onClick: () => { cancel().catch(console.error); } },
      'Cancel'));
}
