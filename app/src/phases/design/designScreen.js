// Phase 3: Design (07 §1). Routes by home type: apartments and condos use the building picker (task 36), houses the
// listing picker and shared rooms the room picker (task 38), builds the blueprint editor (task 39; 3D in task 41).
import { h } from '../../ui/dom.js';

const PICKERS = {
  apartment: () => import('./apartmentPicker.js'),
  condo: () => import('./apartmentPicker.js'),
  house: () => import('./housePicker.js'),
  shared: () => import('./sharedPicker.js'),
  build: () => import('./blueprint/editor.js'),
};
const LATER = {};

/** Mount the design screen for state.home.kind; returns unmount. */
export async function mount(container, ctx) {
  const kind = ctx.store.getState().home?.kind;
  // Upgrading the home you live in (blocks task 20; builds go to the blueprint editor in task 21).
  if (ctx.store.getState().upgrade && kind !== 'build') return (await import('./upgradePicker.js')).mount(container, ctx);
  if (PICKERS[kind]) return (await PICKERS[kind]()).mount(container, ctx);
  container.appendChild(
    h('section', { class: 'placeholder card' },
      h('span', { class: 'phase-tag' }, 'design'),
      h('h1', null, 'Phase 3: Design'),
      h('p', { class: 'muted' }, LATER[kind] ? `Designing this kind of home comes in task ${LATER[kind]}.` : 'No home to design yet.'),
    ),
  );
  document.body.dataset.ready = '1';
  return () => { delete document.body.dataset.ready; };
}
