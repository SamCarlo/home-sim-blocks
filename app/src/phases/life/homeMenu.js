// The "My home" button and menu (13 §10, blocks task 19): Explore & build, Upgrade this home, Find a new place to live,
// Back. The menu is a modal (ui/modal.js: focus trapped, Esc closes, opener refocused) holding a list of buttons.
import { h } from '../../ui/dom.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { formatMoney } from '../../finance/money.js';
import { startRelocation, moveOutQuote, quoteText } from '../../life/relocation.js';
import { homeMenuItems } from '../../life/homeMenu.js';
import { canUpgrade, startUpgrade } from '../../life/upgrade.js';

/** The move confirm's builds line (13 §7). */
export const BUILDS_STAY = 'Your builds stay with this home when you move.';

/** "Find a new place to live" (task 58): confirms with what moving out costs, then opens Plan. */
export async function confirmMove(state, go) {
  const q = moveOutQuote(state);
  const lines = q.lines.map((l) => `${l.label}: ${l.cents >= 0 ? '+' : '−'}${formatMoney(Math.abs(l.cents))}.`).join(' ');
  const ok = await confirmDialog({
    title: 'Find a new place to live?',
    message: 'You keep your job, your money, your credit and your wellbeing. You stay in your home while you look, and '
      + 'you can cancel until a new home says yes. '
      + (q.lines.length ? `When you move out of ${state.home.label}: ${lines} In all: ${quoteText(q.netCents)}. ` : '')
      + BUILDS_STAY,
    confirmLabel: 'Start looking',
    cancelLabel: 'Stay here',
  });
  if (ok) go(startRelocation, 'relocation-started');
}

const ITEM_CLASS = { explore: 'life-explore-open', upgrade: 'life-upgrade', move: 'life-move' };

/** Open the menu. ctx = {store, go, explore (lifeScreen's explore ctx or null)} → the modal handle. */
export function openHomeMenu({ store, go, explore }) {
  const state = store.getState();
  let modal = null;
  const act = { explore: () => explore?.open(), upgrade: () => go(startUpgrade, 'upgrade-started'), move: () => confirmMove(state, go) };
  const items = homeMenuItems(state, { explore: !!explore, exploreReady: !!explore?.ready(), upgradeReady: canUpgrade(state) });
  const list = h('ul', { class: 'life-home-list', role: 'list' }, ...items.map((it) => {
    const noteId = `life-home-note-${it.id}`;
    return h('li', null,
      h('button', { class: `btn btn-secondary life-home-item ${ITEM_CLASS[it.id]}`, type: 'button', disabled: it.disabled,
        dataset: { item: it.id }, 'aria-describedby': noteId,
        onClick: () => { modal.close(); act[it.id](); } }, it.label),
      h('p', { class: 'life-home-note muted', id: noteId }, it.note));
  }));
  const back = h('button', { class: 'btn btn-ghost life-home-back', type: 'button', onClick: () => modal.close() }, 'Back');
  const content = h('div', { class: 'life-home-body' },
    h('h2', { class: 'modal-title', id: 'life-home-title' }, 'My home'),
    h('p', { class: 'modal-message' }, `${state.home?.label ?? 'Your home'}. What would you like to do?`),
    list, h('div', { class: 'modal-actions' }, back));
  modal = openModal({ label: 'My home', content, className: 'life-home-menu',
    initialFocus: list.querySelector('button:not([disabled])') ?? back });
  modal.panel.removeAttribute('aria-label');
  modal.panel.setAttribute('aria-labelledby', 'life-home-title');
  return modal;
}

/** Make an open menu's Explore item usable once the world is ready (lifeScreen calls it after the first frame). */
export function refreshHomeMenu(ready) {
  document.querySelectorAll('.life-home-menu .life-explore-open').forEach((b) => {
    b.disabled = !ready;
    const note = document.getElementById('life-home-note-explore');
    if (note && ready) note.textContent = 'Walk around your place and build with blocks.';
  });
}

/** The "My home" button on the welcome, plan and summary panels. */
export function homeButton(ctx) {
  return h('button', { class: 'btn btn-secondary life-home', type: 'button', 'aria-haspopup': 'dialog',
    onClick: () => openHomeMenu(ctx) }, 'My home');
}
