// House picker (07 §1, §3, task 38): pick one of three listings at the approved price, then customize lightly
// (exterior color, garden beds, fruit trees, a coop with hens, a pet), paid from savings and never below $0. The 3D
// view (houseView.js) shows the listing with the choices applied. Rules and Move in live in the pure houseModel.js.
import { h } from '../../ui/dom.js';
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { styleFamily } from '../../data/styleFamilies.js';
import { cash } from '../../finance/ledger.js';
import { formatMoney } from '../../util/format.js';
import {
  listings, QUIRKS, PET_LABELS, customLines, customCost, afterCustom, moveInHouse, normalizeCustom,
} from './houseModel.js';
import { section, chips, stepper, pickerShell, rerender, savedPick, rememberPick } from './pickerParts.js';

const H = DESIGN.house;

/** Mount the house picker; returns unmount. */
export async function mount(container, { store }) {
  const state = store.getState();
  const loc = byId[state.home.locationId];
  const list = listings(state);
  const palettes = styleFamily(loc.styleFamily, loc.styleVariant).palettes;
  const sel = savedPick(state, { index: null, palette: null, gardenBeds: 0, fruitTrees: 0, coop: false, pet: 'none' },
    (d) => d.index === null || (Number.isInteger(d.index) && d.index >= 0 && d.index < list.length));

  const step = (d) => choose(sel.index === null ? (d > 0 ? 0 : 2) : (sel.index + d + 3) % 3);
  const ui = pickerShell({
    eyebrow: `Phase 3 · ${loc.name}`, title: 'Choose your house', what: 'listing',
    intro: `Your loan is settled at ${formatMoney(list[0].priceCents)}. All three houses cost the same; each has its own quirk.`,
    onPrev: () => step(-1), onNext: () => step(1), onMoveIn,
  });
  container.append(ui.root);

  let view = null;
  function choose(i) {
    if (i !== sel.index) Object.assign(sel, { index: i, palette: null });
    update();
  }

  function custom() { return normalizeCustom(sel, palettes.length); }

  function update() {
    rememberPick(store, sel);
    const l = list[sel.index ?? 0];
    view?.show({ seed: l.seed, palette: sel.palette ?? l.palette, sqft: l.sqftTarget, bedrooms: l.bedrooms,
      extras: sel.index === null ? {} : { gardenBeds: sel.gardenBeds, fruitTrees: sel.fruitTrees, coop: sel.coop } });
    ui.hint.textContent = sel.index === null ? 'Pick a listing from the cards, or use the arrows to look at each house.'
      : 'Drag to look around (the yard is out back), scroll to zoom.';
    rerender(ui.panel, fillPanel);
    const left = afterCustom(store.getState(), custom());
    ui.moveBtn.disabled = sel.index === null || !left.ok;
  }

  function fillPanel() {
    ui.panel.append(section('1. Listing', h('div', { class: 'dz-bcards' }, list.map(listingCard))));
    if (sel.index === null) return;
    ui.panel.append(
      section('2. Exterior color', h('div', { class: 'dz-swatches', role: 'group', 'aria-label': 'Exterior color' },
        palettes.map((p, i) => {
          const on = i === (sel.palette ?? list[sel.index].palette);
          return h('button', { class: `dz-swatch${on ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(on),
            'aria-label': `Color ${i + 1}`, dataset: { palette: i, focusKey: `c${i}` },
            style: `--sw-wall: ${p.wall}; --sw-roof: ${p.roof}; --sw-trim: ${p.trim}`,
            onClick: () => { sel.palette = i; update(); } }, h('span', { class: 'dz-swatch-roof' }), h('span', { class: 'dz-swatch-wall' }));
        }))),
      section('3. Yard', yardBlock()),
      summaryCard());
  }

  function listingCard(l) {
    const on = l.index === sel.index;
    const q = QUIRKS[l.quirk];
    const good = ['big-yard', 'solar', 'mountain-view'].includes(l.quirk);
    return h('button', { class: `dz-bcard${on ? ' is-on' : ''}`, type: 'button', dataset: { index: l.index, focusKey: `b${l.index}` },
      'aria-pressed': String(on), onClick: () => choose(l.index) },
    h('strong', { class: 'dz-bname' }, l.address),
    h('span', { class: 'dz-bmeta' }, `${l.beds} bd · ${l.baths} ba · ${l.sqft.toLocaleString()} sq ft · ${l.lotAcres} acre lot · built ${l.yearBuilt}`),
    chips([{ text: q.label, tone: good ? 'good' : 'warn' }]),
    h('span', { class: 'dz-quirk-note' }, q.note));
  }

  function yardBlock() {
    const have = cash(store.getState());
    const fits = (patch) => customCost(normalizeCustom({ ...sel, ...patch }, palettes.length)) <= have;
    const set = (patch) => { Object.assign(sel, patch); update(); };
    return h('div', { class: 'dz-yard' },
      stepper({ key: 'beds', label: `Garden beds, ${formatMoney(H.bedCents)} each`, value: sel.gardenBeds, max: H.maxBeds,
        canAdd: fits({ gardenBeds: sel.gardenBeds + 1 }), onSet: (n) => set({ gardenBeds: n }) }),
      stepper({ key: 'trees', label: `${fruitLabel(list[sel.index].fruitKind)} trees, ${formatMoney(H.treeCents)} each`, value: sel.fruitTrees,
        max: H.maxTrees, canAdd: fits({ fruitTrees: sel.fruitTrees + 1 }), onSet: (n) => set({ fruitTrees: n }) }),
      h('label', { class: 'dz-check' },
        h('input', { type: 'checkbox', class: 'dz-coop', checked: sel.coop, disabled: !sel.coop && !fits({ coop: true }),
          dataset: { focusKey: 'coop' }, onChange: (e) => set({ coop: e.target.checked }) }),
        h('span', null, `Chicken coop and ${H.hens} hens, ${formatMoney(H.coopCents)}`)),
      h('fieldset', { class: 'dz-pets' },
        h('legend', null, 'A pet (food and vet bills come later)'),
        ['none', 'cat', 'dog'].map((p) => h('label', { class: 'dz-radio' },
          h('input', { type: 'radio', name: 'dz-pet', value: p, checked: sel.pet === p, dataset: { focusKey: `pet-${p}` },
            disabled: p !== 'none' && p !== sel.pet && !fits({ pet: p }), onChange: () => set({ pet: p }) }),
          h('span', null, p === 'none' ? PET_LABELS.none : `${PET_LABELS[p]}, ${formatMoney(H.petCents[p])}`)))));
  }

  function summaryCard() {
    const l = list[sel.index];
    const c = custom();
    const lines = customLines(c);
    const left = afterCustom(store.getState(), c);
    return h('div', { class: 'dz-summary' },
      h('p', { class: 'dz-summary-label' }, 'Your home'),
      h('p', { class: 'dz-address' }, `${l.address} · ${loc.name}`),
      h('p', { class: 'dz-summary-notes muted' }, `${l.beds} bd · ${l.baths} ba · ${QUIRKS[l.quirk].label}`),
      lines.length
        ? h('ul', { class: 'dz-lines' }, lines.map((x) => h('li', null, h('span', null, x.label), h('span', null, formatMoney(x.cents)))),
          h('li', { class: 'dz-total' }, h('span', null, 'Total from savings'), h('span', null, formatMoney(customCost(c)))))
        : h('p', { class: 'dz-summary-cost' }, 'Nothing extra to pay.'),
      h('p', { class: `dz-summary-cost${left.low ? ' dz-warn' : ''}` }, left.ok
        ? `Savings after: ${formatMoney(left.leftCents)}${left.low ? '. That is under $1,000, a thin cushion for surprises.' : ''}`
        : `That is ${formatMoney(-left.leftCents)} more than you have.`));
  }

  function onMoveIn() {
    ui.error.textContent = '';
    let result = null;
    store.update((s) => { result = moveInHouse(s, { index: sel.index, ...custom() }); }, { checkpoint: 'design-finalized' });
    if (result && !result.ok) ui.error.textContent = `You're ${formatMoney(result.shortfallCents)} short. Take something away and try again.`;
  }

  update();
  ui.stage.append(h('p', { class: 'dz-loading muted' }, 'Loading 3D…'));
  try {
    const { createHouseView } = await import('./houseView.js');
    view = await createHouseView(ui.stage, { location: loc, variant: 'house' });
  } catch (err) {
    console.warn('3D house view failed', err);
  }
  ui.stage.querySelector('.dz-loading')?.remove();
  if (view) { update(); await view.firstFrame(); }
  window.__design = { sel, info: () => view?.info, house: () => view?.current?.plan };
  document.body.dataset.ready = '1';
  return () => {
    view?.dispose();
    delete window.__design;
    delete document.body.dataset.ready;
  };
}

const fruitLabel = (kind) => ({ mango: 'Mango', citrus: 'Citrus', fig: 'Fig', apple: 'Apple' }[kind] ?? 'Fruit');
