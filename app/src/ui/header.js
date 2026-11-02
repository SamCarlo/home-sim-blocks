// App header (04 §1): title, phase stepper, save indicator + Save button (task 58), Portfolio button, username + Log out.
// Responsive: at narrow widths the step labels and "Playing as" collapse (components.css).
import { h } from './dom.js';
import { GAME_TITLE } from '../config.js';
import { renderSaveStatus } from './saveStatus.js';

const STEPS = [
  { phase: 'plan', label: 'Plan' },
  { phase: 'paperwork', label: 'Paperwork' },
  { phase: 'design', label: 'Design' },
  { phase: 'life', label: 'Live' },
];

/**
 * Build the header for a phase. Finished phases are checked, the current one highlighted (none during intake).
 * opts: user {username}, onLogout () → void, persistence ({status} for the save indicator), onPortfolio (task 17;
 * the button stays disabled until it is given), onSave (task 58: () → Promise; saves right now, every phase).
 * Call el.destroy() before dropping the header.
 */
export function renderHeader(phase, { user = null, onLogout = null, persistence = null, onPortfolio = null, onSave = null } = {}) {
  const idx = STEPS.findIndex((s) => s.phase === phase);
  const save = persistence?.status ? renderSaveStatus(persistence.status) : null;
  let savedTimer = null;
  const saveBtn = onSave ? h('button', {
    class: 'btn btn-secondary header-save', type: 'button', title: 'Save your game now. It also saves by itself.',
    onClick: async () => {
      saveBtn.disabled = true;
      try { await onSave(); } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Saved';
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
      }
    },
  }, 'Save') : null;
  const el = h('header', { class: 'app-header' },
    h('p', { class: 'app-title' }, GAME_TITLE),
    h('ol', { class: 'stepper', 'aria-label': 'Game phases' },
      STEPS.map((s, i) => h('li', {
        class: i === idx ? 'is-current' : i < idx ? 'is-done' : '',
        'aria-current': i === idx ? 'step' : null,
        title: s.label,
      },
      h('span', { class: 'step-num', 'aria-hidden': 'true' }, i < idx ? '✓' : String(i + 1)),
      h('span', { class: 'step-label' }, s.label),
      i < idx ? h('span', { class: 'sr-only' }, ' (done)') : null))),
    h('div', { class: 'header-tools' },
      save,
      saveBtn,
      h('button', {
        class: 'btn btn-secondary header-portfolio', type: 'button', disabled: !onPortfolio,
        title: onPortfolio ? 'Your money, home and papers' : 'Your portfolio opens once you have a plan.',
        onClick: onPortfolio,
      }, h('span', { 'aria-hidden': 'true' }, '▤'), h('span', { class: 'header-btn-label' }, 'Portfolio')),
      user ? h('div', { class: 'header-user' },
        h('span', { class: 'header-name' }, h('span', { class: 'header-playing' }, 'Playing as '), h('strong', null, user.username)),
        onLogout ? h('button', { class: 'btn btn-ghost header-logout', type: 'button', onClick: onLogout }, 'Log out') : null,
      ) : null,
    ),
  );
  el.destroy = () => { save?.destroy?.(); clearTimeout(savedTimer); };
  return el;
}
