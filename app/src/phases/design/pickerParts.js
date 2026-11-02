// Small DOM pieces shared by the house and shared-living pickers (task 38): panel sections, a −/+ stepper, chips,
// and the stage shell with arrows, hint and the Move in button. Class names reuse design.css (`dz-`).
import { h } from '../../ui/dom.js';

/** A titled step in the side panel. */
export const section = (title, ...body) => h('div', { class: 'dz-step' }, h('h2', { class: 'dz-step-title' }, title), ...body);

/** Chips row; `tone` 'warn' | 'good' | undefined per chip ({text, tone} or a string). */
export function chips(list) {
  return h('span', { class: 'dz-chips' }, list.map((c) => {
    const { text, tone } = typeof c === 'string' ? { text: c } : c;
    return h('span', { class: `dz-chip${tone ? ` is-${tone}` : ''}` }, text);
  }));
}

/**
 * A labelled −/+ stepper row: `{key, label, value, max, canAdd, onSet}` → element. Buttons carry
 * `data-focus-key` `<key>-` / `<key>+` (so focus survives re-renders) and classes `dz-<key>-remove/-add`.
 */
export function stepper({ key, label, value, max, canAdd = true, onSet }) {
  return h('div', { class: 'dz-plants', dataset: { stepper: key } },
    h('span', null, label),
    h('span', { class: 'dz-stepper' },
      h('button', { class: `btn btn-secondary btn-small dz-${key}-remove`, type: 'button', 'aria-label': `One fewer: ${label}`,
        dataset: { focusKey: `${key}-` }, disabled: value <= 0, onClick: () => onSet(value - 1) }, '−'),
      h('output', { class: `dz-plant-count dz-${key}-count`, 'aria-live': 'polite' }, String(value)),
      h('button', { class: `btn btn-secondary btn-small dz-${key}-add`, type: 'button', 'aria-label': `One more: ${label}`,
        dataset: { focusKey: `${key}+` }, disabled: value >= max || !canAdd, onClick: () => onSet(value + 1) }, '+')));
}

/**
 * The picker shell: 3D stage (with ‹ › arrows and a hint) on the left, the side panel on the right.
 * → `{root, stage, hint, panel, error, moveBtn}`.
 */
export function pickerShell({ eyebrow, title, intro, onPrev, onNext, onMoveIn, what }) {
  const stage = h('div', { class: 'dz-stage' });
  const hint = h('p', { class: 'dz-hint' });
  const panel = h('div', { class: 'dz-panel-body' });
  const error = h('p', { class: 'dz-error', role: 'alert' });
  const moveBtn = h('button', { class: 'btn btn-primary dz-movein', type: 'button', onClick: onMoveIn }, 'Move in');
  const root = h('section', { class: 'dz' },
    h('div', { class: 'dz-stage-wrap' }, stage,
      h('button', { class: 'dz-arrow dz-prev', type: 'button', 'aria-label': `Previous ${what}`, onClick: onPrev }, '‹'),
      h('button', { class: 'dz-arrow dz-next', type: 'button', 'aria-label': `Next ${what}`, onClick: onNext }, '›'),
      hint),
    h('aside', { class: 'dz-panel', 'aria-label': 'Choose your home' },
      h('p', { class: 'dz-eyebrow' }, eyebrow),
      h('h1', { class: 'dz-title' }, title),
      h('p', { class: 'dz-intro muted' }, intro),
      panel, error, moveBtn));
  return { root, stage, hint, panel, error, moveBtn };
}

/** Re-render `panel` with `fill()`, keeping keyboard focus on the element with the same data-focus-key. */
export function rerender(panel, fill) {
  const active = document.activeElement?.dataset?.focusKey;
  panel.replaceChildren();
  fill();
  if (active) panel.querySelector(`[data-focus-key="${active}"]`)?.focus();
}

/**
 * The saved picker selection (`home.pickDraft`, task 58) over `defaults`, when `valid(draft)` says it still fits;
 * otherwise a copy of `defaults`. Lets a reload (or the Save button) reopen the picker where the student left it.
 */
export function savedPick(state, defaults, valid) {
  const d = state.home?.pickDraft;
  return d && typeof d === 'object' && valid(d) ? { ...defaults, ...d } : { ...defaults };
}

/** Store the selection as `home.pickDraft` when it changed (no checkpoint: drafts save on the draft timer). */
export function rememberPick(store, sel) {
  const next = { ...sel };
  if (JSON.stringify(store.getState().home?.pickDraft ?? null) === JSON.stringify(next)) return;
  store.update((s) => { if (s.home) s.home.pickDraft = next; });
}
