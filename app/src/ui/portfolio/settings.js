// Portfolio tab: Settings (02 §2 settings, 12 §3–§4, task 17). Changes save through store.update right away.
import { h } from '../dom.js';
import { LIFE } from '../../config.js';
import { confirmDialog } from '../modal.js';
import { createInitialState } from '../../state/schema.js';
import { block } from './parts.js';
import { openCredits } from './credits.js';

/** settings → <html> attributes: data-theme (absent = follow the OS) and data-reduced-motion. */
export function applySettings(settings, { themeOverride = null } = {}) {
  const root = document.documentElement;
  const theme = themeOverride || settings?.theme;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  if (settings?.reducedMotion) root.dataset.reducedMotion = '1';
  else delete root.dataset.reducedMotion;
}

/** The settings tab. ctx: {store, user, onRestarted}. */
export function renderSettings(state, { store, user, onRestarted }) {
  const s = state.settings;
  const set = (patch) => store.update((d) => { Object.assign(d.settings, patch); }, { checkpoint: 'settings' });
  const radio = (name, value, label, checked, onChange) => h('label', { class: 'pf-choice' },
    h('input', { type: 'radio', name, value, checked, onChange }), h('span', null, label));
  const toggle = (key, label, hint) => h('label', { class: 'pf-toggle' },
    h('input', { type: 'checkbox', name: `pf-${key}`, value: '1', checked: !!s[key], onChange: (e) => set({ [key]: e.target.checked }) }),
    h('span', null, h('span', { class: 'pf-toggle-label' }, label), h('span', { class: 'pf-toggle-hint muted' }, hint)));

  const restart = async () => {
    const first = await confirmDialog({ title: 'Restart the game?',
      message: 'This erases your plan, paperwork, home and every month you have lived. Your account stays.',
      confirmLabel: 'Yes, restart', cancelLabel: 'Keep playing' });
    if (!first) return;
    const second = await confirmDialog({ title: 'Are you sure?',
      message: 'This cannot be undone. You will start over at the first screen.',
      confirmLabel: 'Erase and restart', cancelLabel: 'Cancel' });
    if (!second) return;
    const fresh = createInitialState({ uid: user?.uid, username: user?.username ?? state.account.username,
      classCode: user?.classCode ?? state.account.classCode, now: Date.now() });
    fresh.settings = { ...state.settings };
    onRestarted?.();
    store.replace(fresh, { checkpoint: 'restart' });
  };

  return h('div', { class: 'pf-tab-settings' },
    block('Theme', h('fieldset', { class: 'pf-fieldset' },
      h('legend', { class: 'sr-only' }, 'Theme'),
      [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) =>
        radio('pf-theme', v, label, (s.theme || 'system') === v, () => set({ theme: v }))))),
    block('Motion and timing',
      toggle('reducedMotion', 'Reduce motion', 'Shows each month as a calendar instead of an animation.'),
      toggle('longCareWindow', 'Longer care window', 'Care buttons stay on screen twice as long.'),
      h('fieldset', { class: 'pf-fieldset' },
        h('legend', { class: 'pf-legend' }, 'Default animation speed'),
        LIFE.speeds.map((v) => radio('pf-speed', String(v), `${v}×`, (s.animationSpeed || 1) === v, () => set({ animationSpeed: v }))))),
    block('Start over',
      h('p', { class: 'muted pf-note' }, 'Restarting keeps your account and settings but erases your game.'),
      h('button', { type: 'button', class: 'btn btn-danger pf-restart', onClick: restart }, 'Restart game…')),
    block('About this game',
      h('p', { class: 'muted pf-note' }, 'See who made the free tools and art inside this game.'),
      h('button', { type: 'button', class: 'pf-credits-open', onClick: openCredits }, 'Credits')));
}
