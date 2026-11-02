// Phase 2: Paperwork (05 §1). Checklist of this attempt's steps on the left (flow.js), the active step on the right,
// and "Choose a different home" under the checklist. Step modules come from steps/index.js; 'form' steps with a schema
// go through forms/engine.js, every other kind mounts its own UI. The header's Portfolio button stays available.
import { h, clear } from '../../ui/dom.js';
import { confirmDialog } from '../../ui/modal.js';
import { formatMoney } from '../../finance/money.js';
import { byId } from '../../data/locations/index.js';
import { homeType } from '../../data/homeTypes.js';
import { detailTitle } from '../plan/detailModel.js';
import { renderForm } from '../../forms/engine.js';
import { signDateLabel } from '../../forms/validate.js';
import { moveDates } from '../../util/dates.js';
import * as config from '../../config.js';
import { STATUS_INFO, checklist, nextStep, setStep, completeStep, withdraw } from './flow.js';
import { step as stepModule } from './steps/index.js';
import { stepWords } from './stepTerms.js';

const FINISHED = new Set(['done', 'skipped']);

/** Mount the paperwork screen; returns unmount. */
export function mount(container, ctx) {
  const { store } = ctx;
  const first = store.getState();
  const location = byId[first.choice.locationId];
  const type = homeType(first.choice.homeTypeId);

  // Reopen the step the student was on (paperwork.activeStep, task 58), unless it has since locked.
  const saved = first.paperwork.activeStep;
  let active = saved && checklist(first).some((x) => x.id === saved && x.status !== 'locked') ? saved : nextStep(first) ?? 'results';
  let mountedKey = null;
  let unmountStep = null;
  let form = null;

  const list = h('ol', { class: 'pw-list' });
  const count = h('p', { class: 'pw-count' });
  const main = h('section', { class: 'pw-main', 'aria-label': 'Current step' });
  const position = h('p', { class: 'pw-position' });
  const error = h('p', { class: 'pw-error', role: 'alert', hidden: true });
  const body = h('div', { class: 'pw-body' });
  main.append(position, error, body);

  const side = h('aside', { class: 'pw-side card', 'aria-label': 'Paperwork checklist' },
    h('p', { class: 'pw-eyebrow' }, 'Phase 2 · Paperwork'),
    h('h1', { class: 'pw-title' }, detailTitle(location, type)),
    h('p', { class: 'pw-sub' }, `Every document is dated ${signDateLabel(store.getState())}. You move in on `
      + `${moveDates(store.getState().life.monthIndex).moveInLabel}.`),
    count, list,
    h('button', { type: 'button', class: 'pw-withdraw', onClick: () => chooseDifferent() }, 'Choose a different home'));

  container.appendChild(h('div', { class: 'pw-screen' }, side, main));

  function select(id, focus = true) {
    active = id;
    if (store.getState().paperwork.activeStep !== id) store.update((s) => { s.paperwork.activeStep = id; });
    render(store.getState());
    if (focus) body.querySelector('.pw-step-title, .fm-title')?.focus();
  }

  function finish(id, values) {
    const mod = stepModule(id);
    let result = null;
    store.update((s) => {
      result = mod.complete ? (mod.complete(s, values, Date.now()) ?? { ok: true })
        : completeStep(s, id, { values, upfrontKey: mod.upfrontKey, now: Date.now() });
      if (mod.complete && result.ok !== false && s.paperwork.steps[id]?.status !== 'done') setStep(s, id, 'done', values, Date.now());
    }, { checkpoint: `paperwork-${id}` });
    if (result && result.ok === false) {
      error.hidden = false;
      error.textContent = `You need ${formatMoney(result.shortfallCents)} more in the bank to pay this fee.`;
      return;
    }
    error.hidden = true;
    if (mod.stayOnDone) { render(store.getState()); body.querySelector('.pw-step-title')?.focus(); return; }
    goNext();
  }

  function goNext() {
    select(nextStep(store.getState()) ?? 'results');
  }

  function saveDraft(id, values) {
    store.update((s) => {
      const cur = s.paperwork.steps[id]?.status;
      if (!FINISHED.has(cur)) setStep(s, id, 'draft', values, Date.now());
    });
  }

  async function chooseDifferent() {
    const paid = Object.values(store.getState().paperwork.paidUpfront ?? {}).reduce((t, c) => t + c, 0);
    const ok = await confirmDialog({
      title: 'Choose a different home?',
      message: `Your paperwork for this ${type.label.toLowerCase()} in ${location.name} stops here. `
        + (paid > 0 ? `The ${formatMoney(paid)} in fees you already paid is not refunded. ` : 'Fees you already paid are not refunded. ')
        + 'Letters you wrote stay in your portfolio.',
      confirmLabel: 'Yes, go back to planning',
      cancelLabel: 'Keep going',
    });
    if (!ok) return;
    store.update((s) => withdraw(s, Date.now()), { checkpoint: 'paperwork-withdrawn' });
  }

  function renderList(items) {
    const done = items.filter((x) => FINISHED.has(x.status)).length;
    count.textContent = `${done} of ${items.length} done`;
    clear(list);
    items.forEach(({ id, status }, i) => {
      const info = STATUS_INFO[status];
      list.append(h('li', null, h('button', {
        type: 'button', class: `pw-item is-${status}${id === active ? ' is-active' : ''}`,
        dataset: { step: id, status }, disabled: status === 'locked',
        'aria-current': id === active ? 'step' : null,
        onClick: () => select(id),
      },
      h('span', { class: 'pw-item-icon', 'aria-hidden': 'true' }, info.icon),
      h('span', { class: 'pw-item-num' }, `${i + 1}.`),
      h('span', { class: 'pw-item-title' }, stepModule(id).title),
      h('span', { class: 'pw-item-status' }, info.label))));
    });
  }

  function renderStep(state, items) {
    const entry = items.find((x) => x.id === active);
    const status = entry?.status ?? 'locked';
    const key = `${active}|${FINISHED.has(status) ? 'finished' : status === 'locked' ? 'locked' : 'open'}`;
    if (key === mountedKey) return;
    mountedKey = key;
    unmountStep?.(); unmountStep = null;
    form?.destroy(); form = null;
    clear(body);
    position.textContent = `Step ${items.findIndex((x) => x.id === active) + 1} of ${items.length}`;
    const mod = stepModule(active);
    const id = active;
    if (status === 'locked') {
      body.append(h('section', { class: 'pw-placeholder card' },
        h('h2', { class: 'pw-step-title', tabindex: '-1' }, mod.title),
        h('p', { class: 'muted' }, 'Finish the steps before this one first.')));
      return;
    }
    const stored = state.paperwork.steps[id];
    if (mod.kind === 'form' && mod.schema) {
      form = renderForm(body, mod.schema(state), {
        values: stored?.values ?? {}, state, readOnly: FINISHED.has(status),
        onChange: (values) => saveDraft(id, values),
        onSubmit: (values) => finish(id, values),
      });
    } else if (mod.mount) {
      const un = mod.mount(body, { store, config, state, status, values: stored?.values ?? {},
        onDone: (values = {}) => finish(id, values), onDraft: (values) => saveDraft(id, values), onNext: goNext });
      unmountStep = typeof un === 'function' ? un : null;
    }
    const words = stepWords(id);
    if (words) body.prepend(words);
  }

  function render(state) {
    if (state.phase !== 'paperwork' || !state.choice) return;
    const items = checklist(state);
    if (!items.some((x) => x.id === active)) active = nextStep(state) ?? 'results';
    renderList(items);
    renderStep(state, items);
  }

  render(first);
  const unsub = store.subscribe((s) => render(s));
  document.body.dataset.ready = '1';
  return () => {
    unsub();
    unmountStep?.();
    form?.destroy();
    delete document.body.dataset.ready;
  };
}
