// Apartment and condo picker (07 §1–§2, task 36): pick a building → floor → unit, optionally buy potted plants, then
// Move in. The 3D view (pickerView.js) and the side panel share one selection; clicking a floor band in 3D selects it,
// clicking again inside the selected floor picks the unit. Rules and Move in live in the pure apartmentModel.js.
import { h, clear } from '../../ui/dom.js';
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { cash } from '../../finance/ledger.js';
import { formatMoney } from '../../util/format.js';
import {
  buildingOptions, unitTraits, traitNotes, unitLabel, addressLabel, plantsCost, moveIn, AMENITY_LABELS,
} from './apartmentModel.js';
import { unitCell } from './buildingPlan.js';
import { savedPick, rememberPick } from './pickerParts.js';

/** Mount the picker; returns unmount. */
export async function mount(container, { store }) {
  const state = store.getState();
  const loc = byId[state.home.locationId];
  const kind = state.home.kind === 'condo' ? 'condo' : 'apartment';
  const options = buildingOptions(state);
  const narrow = window.matchMedia('(max-width: 899px)').matches;
  // A saved selection (home.pickDraft, task 58) reopens where the student left off.
  const sel = savedPick(state, { index: narrow ? 0 : null, floor: null, unit: null, plants: 0 }, (d) => {
    const o = Number.isInteger(d.index) ? options[d.index] : null;
    if (d.index === null) return d.floor === null && d.unit === null;
    if (!o) return false;
    if (d.floor === null) return d.unit === null;
    return o.floors.includes(d.floor) && (d.unit === null || !!unitCell(o.plan, d.unit));
  });
  const balcony = loc.region === 'hawaii' ? 'lānai' : 'balcony';

  const stage = h('div', { class: 'dz-stage' });
  const hint = h('p', { class: 'dz-hint' });
  const prev = h('button', { class: 'dz-arrow dz-prev', type: 'button', 'aria-label': 'Previous building', onClick: () => step(-1) }, '‹');
  const next = h('button', { class: 'dz-arrow dz-next', type: 'button', 'aria-label': 'Next building', onClick: () => step(1) }, '›');
  const panel = h('div', { class: 'dz-panel-body' });
  const error = h('p', { class: 'dz-error', role: 'alert' });
  const moveBtn = h('button', { class: 'btn btn-primary dz-movein', type: 'button', onClick: onMoveIn }, 'Move in');
  container.append(h('section', { class: 'dz' },
    h('div', { class: 'dz-stage-wrap' }, stage, prev, next, hint),
    h('aside', { class: 'dz-panel', 'aria-label': 'Choose your home' },
      h('p', { class: 'dz-eyebrow' }, `Phase 3 · ${loc.name}`),
      h('h1', { class: 'dz-title' }, kind === 'condo' ? 'Choose your condo' : 'Choose your apartment'),
      h('p', { class: 'dz-intro muted' }, 'Your rent or price is already settled. Where you live in the building changes the view, '
        + 'the noise and how many stairs you climb.'),
      panel, error, moveBtn)));

  let view = null;
  const pick = (hit) => {
    if (hit.index !== sel.index) Object.assign(sel, { index: hit.index, floor: hit.floor, unit: null });
    else if (hit.floor !== sel.floor) Object.assign(sel, { floor: hit.floor, unit: null });
    else sel.unit = hit.unit;
    update();
  };

  function step(d) {
    const i = sel.index === null ? (d > 0 ? 0 : options.length - 1) : (sel.index + d + options.length) % options.length;
    Object.assign(sel, { index: i, floor: null, unit: null });
    update();
  }

  let depth = 0;
  function update() {
    rememberPick(store, sel);
    if (view) {
      view.focus(sel.index, sel.floor); // no-op unless the framing changes
      view.highlight(sel.index, sel.floor, sel.unit);
    }
    hint.textContent = sel.index === null ? 'Pick a building: click it here or choose a card.'
      : sel.floor === null ? 'Click a floor on the building, or choose one from the list.'
        : sel.unit === null ? 'Pick a unit from the cards. Drag to look around, scroll to zoom.'
          : 'Your unit glows. Drag to look around, scroll to zoom.';
    renderPanel();
    // A new step appeared below the fold: bring it (and finally Move in) into view.
    const d = sel.index === null ? 0 : sel.floor === null ? 1 : sel.unit === null ? 2 : 3;
    if (d > depth) (d === 3 ? moveBtn : panel.lastElementChild)?.scrollIntoView?.({ block: 'nearest' });
    depth = d;
  }

  function renderPanel() {
    const active = document.activeElement?.dataset?.focusKey;
    clear(panel);
    panel.append(section('1. Building', h('div', { class: 'dz-bcards' }, options.map(buildingCard))));
    const o = options[sel.index];
    if (o) {
      panel.append(section('2. Floor', h('div', { class: 'dz-floors', role: 'group', 'aria-label': 'Floors' },
        o.floors.map((f) => h('button', { class: `dz-floor${f === sel.floor ? ' is-on' : ''}`, type: 'button', dataset: { floor: f, focusKey: `f${f}` },
          'aria-pressed': String(f === sel.floor), onClick: () => { Object.assign(sel, { floor: f, unit: null }); update(); } },
        o.plan.form === 'townhomes' ? 'Row' : String(f))))));
    }
    if (o && sel.floor !== null) {
      const units = Array.from({ length: o.plan.unitsPerFloor }, (_, u) => u);
      panel.append(section('3. Unit', h('div', { class: 'dz-units' }, units.map((u) => unitCard(o, u)))));
    }
    if (o && sel.unit !== null) panel.append(plantsBlock(), summaryCard(o));
    moveBtn.disabled = !(o && sel.unit !== null);
    if (active) panel.querySelector(`[data-focus-key="${active}"]`)?.focus();
  }

  const section = (title, body) => h('div', { class: 'dz-step' }, h('h2', { class: 'dz-step-title' }, title), body);

  function buildingCard(o) {
    const on = o.index === sel.index;
    const homes = o.floors.length * o.plan.unitsPerFloor;
    return h('button', { class: `dz-bcard${on ? ' is-on' : ''}`, type: 'button', dataset: { index: o.index, focusKey: `b${o.index}` },
      'aria-pressed': String(on), onClick: () => { Object.assign(sel, { index: o.index, floor: null, unit: null }); update(); } },
    h('strong', { class: 'dz-bname' }, o.name),
    h('span', { class: 'dz-bmeta' }, `${o.formLabel} · ${o.plan.floors} floor${o.plan.floors > 1 ? 's' : ''} · ${homes} homes`),
    h('span', { class: 'dz-chips' }, o.amenities.length
      ? o.amenities.map((a) => h('span', { class: 'dz-chip' }, AMENITY_LABELS[a]))
      : h('span', { class: 'dz-chip is-none' }, 'No extras')));
  }

  function unitCard(o, u) {
    const t = unitTraits(loc.id, o, sel.floor, u);
    const on = u === sel.unit;
    return h('button', { class: `dz-unit${on ? ' is-on' : ''}`, type: 'button', dataset: { unit: u, focusKey: `u${u}` },
      'aria-pressed': String(on), onClick: () => { sel.unit = u; update(); } },
    h('strong', null, unitLabel(o.plan, sel.floor, u)),
    h('span', { class: 'dz-unit-notes' }, traitNotes(t).map((n) => h('span', null, n))));
  }

  function plantsBlock() {
    const have = cash(store.getState());
    const canAdd = sel.plants < DESIGN.maxPlants && plantsCost(sel.plants + 1) <= have;
    const set = (n) => { sel.plants = n; rememberPick(store, sel); renderPanel(); };
    return section('Extras', h('div', { class: 'dz-plants' },
      h('span', null, `Potted plants for your ${balcony}, ${formatMoney(DESIGN.plantCents)} each (up to ${DESIGN.maxPlants})`),
      h('span', { class: 'dz-stepper' },
        h('button', { class: 'btn btn-secondary btn-small dz-plant-remove', type: 'button', 'aria-label': 'One fewer plant',
          dataset: { focusKey: 'p-' }, disabled: sel.plants === 0, onClick: () => set(sel.plants - 1) }, '−'),
        h('output', { class: 'dz-plant-count', 'aria-live': 'polite' }, String(sel.plants)),
        h('button', { class: 'btn btn-secondary btn-small dz-plant-add', type: 'button', 'aria-label': 'One more plant',
          dataset: { focusKey: 'p+' }, disabled: !canAdd, onClick: () => set(sel.plants + 1) }, '+'))));
  }

  function summaryCard(o) {
    const t = unitTraits(loc.id, o, sel.floor, sel.unit);
    const cost = plantsCost(sel.plants);
    return h('div', { class: 'dz-summary' },
      h('p', { class: 'dz-summary-label' }, 'Your home'),
      h('p', { class: 'dz-address' }, addressLabel(o, sel.floor, sel.unit, loc)),
      h('p', { class: 'dz-summary-notes muted' }, traitNotes(t).join(' · ')),
      h('p', { class: 'dz-summary-cost' }, cost ? `Plants: ${formatMoney(cost)}, paid from your bank account when you move in.`
        : 'Nothing extra to pay.'));
  }

  function onMoveIn() {
    error.textContent = '';
    let result = null;
    store.update((s) => { result = moveIn(s, { index: sel.index, floor: sel.floor, unit: sel.unit, plants: sel.plants }); },
      { checkpoint: 'design-finalized' });
    if (result && !result.ok) error.textContent = `You're ${formatMoney(result.shortfallCents)} short for the plants. Take one away and try again.`;
  }

  update();
  stage.append(h('p', { class: 'dz-loading muted' }, 'Loading 3D…'));
  try {
    view = await createView();
  } catch (err) {
    console.warn('3D picker failed', err);
  }
  stage.querySelector('.dz-loading')?.remove();
  if (view) { update(); await view.firstFrame(); }
  window.__design = view ? { clickAt: view.clickAt, screenOf: view.screenOf, info: () => view.info, sel } : { sel };
  document.body.dataset.ready = '1';
  return () => {
    view?.dispose();
    delete window.__design;
    delete document.body.dataset.ready;
  };

  async function createView() {
    const { createPickerView } = await import('./pickerView.js');
    return createPickerView(stage, { location: loc, kind, options, onPick: pick });
  }
}
