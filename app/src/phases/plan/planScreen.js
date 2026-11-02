// Phase 1: Plan (04 §5). "Your numbers" bar + legend + hide toggle, the affordability table, and the notes under it.
// The table DOM is built once; store changes only recolor it. Opening a cell sets plan.expanded; the detail panel
// (detail.js) shows inline below the row at ≥ 900 px and as a modal sheet below that.
import { h } from '../../ui/dom.js';
import { AFFORD } from '../../config.js';
import { formatMoney } from '../../finance/money.js';
import { STATUSES } from '../../finance/affordability.js';
import { term } from '../../ui/term.js';
import { buildGrid } from '../../finance/grid.js';
import { createTable } from './table.js';
import { cellKey, deniedKeys } from './tableModel.js';
import { renderDetail } from './detail.js';
import { applyChoice, confirmText, detailTitle } from './detailModel.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { canCancelRelocation } from '../../life/relocation.js';

const PRICE_NOTE = 'Prices are approximate 2025–26 figures for each place. Canada is converted to U.S. dollars.';
// 04 §6: inline panel at ≥ 900 px wide, modal sheet below. Also a sheet under 720 px tall, where the table frame is too
// short to show the inline panel (DEVIATIONS 2026-10-01).
const WIDE = '(min-width: 900px) and (min-height: 720px)';

/** Mount the plan screen; returns unmount. */
export function mount(container, ctx) {
  const { store } = ctx;
  let grid = buildGrid(store.getState());
  const pendingMove = canCancelRelocation(store.getState());

  const num = (label, value, extra = null) => h('div', { class: 'plan-num' },
    h('span', { class: 'plan-num-label' }, label), h('strong', { class: 'plan-num-value' }, value), extra);
  const nums = {
    income: h('span'), cash: h('span'), third: h('span'), fifth: h('span'),
  };
  const toggle = h('input', {
    type: 'checkbox', class: 'plan-hide-input', id: 'plan-hide',
    onChange: () => store.update((s) => { s.plan.hideUnaffordable = toggle.checked; }),
  });

  const bar = h('section', { class: 'plan-bar card', 'aria-label': 'Your numbers' },
    h('div', { class: 'plan-bar-nums' },
      h('h2', { class: 'plan-bar-title' }, 'Your numbers'),
      num(term('gross-net', 'Take-home pay'), nums.income),
      // While moving (task 58) the cash counts what moving out brings or costs (finance/grid.js cashOf).
      num(pendingMove ? 'Cash after moving out' : 'Cash in the bank', nums.cash),
      num('⅓ of your income', nums.third, h('span', { class: 'plan-num-note' }, 'stretch line')),
      num('⅕ of your income', nums.fifth, h('span', { class: 'plan-num-note' }, 'well-below line'))),
    h('div', { class: 'plan-bar-side' },
      h('ul', { class: 'plan-legend', 'aria-label': 'What the colors mean' },
        STATUSES.map((s) => h('li', { class: `plan-legend-item st-${s.status}` },
          h('span', { class: 'plan-legend-icon', 'aria-hidden': 'true' }, s.icon), s.label))),
      h('label', { class: 'plan-hide', for: 'plan-hide' }, toggle, "Hide homes I can't afford")),
  );

  const table = createTable(grid, {
    onOpen: (locationId, homeTypeId) => store.update((s) => {
      const e = s.plan.expanded;
      s.plan.expanded = e && e.locationId === locationId && e.homeTypeId === homeTypeId ? null : { locationId, homeTypeId };
    }),
    onClose: () => close(),
  });

  function close() {
    const e = store.getState().plan.expanded;
    if (!e) return;
    store.update((s) => { s.plan.expanded = null; });
    table.focusCell(cellKey(e.locationId, e.homeTypeId));
  }

  // Detail panel (04 §6). Inline: the table inserts detail(x) in a full-width row; the node is cached per open cell
  // so unrelated store updates don't rebuild it. Sheet: one modal at a time, kept in step with plan.expanded.
  const wide = window.matchMedia(WIDE);
  let cached = null; // { key, cell, denied, node }
  let sheet = null; // { key, modal }
  let lastKey = null;
  let denied = new Set();

  const detailNode = (x, mode) => {
    const key = cellKey(x.location.id, x.homeType.id);
    const isDenied = denied.has(key);
    if (cached && cached.key === key && cached.cell === x.cell && cached.denied === isDenied && cached.mode === mode) return cached.node;
    const node = renderDetail({ cell: x.cell, location: x.location, homeType: x.homeType, denied: isDenied, mode,
      onClose: close, onChoose: (cell) => choose(cell, x) });
    cached = { key, cell: x.cell, denied: isDenied, mode, node };
    return node;
  };
  const detail = (x) => detailNode(x, 'inline');

  async function choose(cell, x) {
    const ok = await confirmDialog({
      title: `Choose: ${detailTitle(x.location, x.homeType)}`,
      message: confirmText(x.location, x.homeType),
      confirmLabel: 'Yes, start the paperwork',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    if (sheet) { const old = sheet; sheet = null; old.modal.close(); }
    store.update((s) => applyChoice(s, cell, Date.now()), { checkpoint: 'home-chosen' });
  }

  function syncSheet(expanded) {
    const key = expanded && !wide.matches ? cellKey(expanded.locationId, expanded.homeTypeId) : null;
    if (sheet && sheet.key === key) return;
    if (sheet) { const old = sheet; sheet = null; old.modal.close(); }
    if (!key) return;
    const x = table.lookup(key);
    if (!x) return;
    const modal = openModal({ label: detailTitle(x.location, x.homeType), content: detailNode(x, 'sheet'),
      className: 'plan-sheet', initialFocus: '.plan-dt-title',
      onClose: () => { if (sheet?.modal === modal) { sheet = null; close(); } } });
    sheet = { key, modal };
  }

  const notes = h('footer', { class: 'plan-notes' }, h('p', null, grid.assumptions), h('p', null, PRICE_NOTE));
  const screen = h('div', { class: 'plan-screen' },
    h('h1', { class: 'sr-only' }, 'Phase 1: Plan. Pick a place and a home type.'),
    bar, table.el, notes);
  container.appendChild(screen);

  const render = (state) => {
    grid = buildGrid(state);
    nums.income.textContent = `${formatMoney(grid.incomeCents)}/mo`;
    nums.cash.textContent = formatMoney(grid.cashCents);
    nums.third.textContent = formatMoney(Math.round(grid.incomeCents / AFFORD.stretchDivisor));
    nums.fifth.textContent = formatMoney(Math.round(grid.incomeCents / AFFORD.wellBelowDivisor));
    toggle.checked = !!state.plan.hideUnaffordable;
    denied = deniedKeys(state.plan.attempts);
    const { expanded } = state.plan;
    table.update(grid, {
      hideUnaffordable: state.plan.hideUnaffordable,
      denied,
      expanded,
      detail: wide.matches ? detail : null,
    });
    syncSheet(expanded);
    // Focus moves into the inline panel when a cell opens (the sheet does this itself).
    const key = expanded ? cellKey(expanded.locationId, expanded.homeTypeId) : null;
    if (key && key !== lastKey && wide.matches) {
      const title = table.el.querySelector('.plan-detail-row .plan-dt-title');
      if (title) {
        title.focus({ preventScroll: true });
        // Scroll the frame so the clicked row sits just under the sticky header, with the panel below it.
        const row = title.closest('.plan-detail-row').previousElementSibling;
        table.el.scrollTop = row.offsetTop - table.el.querySelector('thead').offsetHeight;
      }
    }
    lastKey = key;
  };
  render(store.getState());
  const unsub = store.subscribe((state) => { if (state.phase === 'plan') render(state); });
  const onResize = () => { lastKey = null; render(store.getState()); };
  wide.addEventListener('change', onResize);

  document.body.dataset.ready = '1';
  return () => {
    unsub();
    wide.removeEventListener('change', onResize);
    if (sheet) { const old = sheet; sheet = null; old.modal.close(); }
    delete document.body.dataset.ready;
  };
}
