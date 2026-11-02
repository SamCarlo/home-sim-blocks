// Shared-living picker (07 §1, §4, task 38): pick one of three shared houses, a room (same rent, different comfort
// and noise), meet the two roommates (their traits set the home's modifiers, softened by the roommate agreement),
// optionally buy potted plants, then Move in. Rules live in the pure sharedModel.js; 3D in houseView.js.
import { h } from '../../ui/dom.js';
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { cash } from '../../finance/ledger.js';
import { formatMoney } from '../../util/format.js';
import { plantsCost } from './apartmentModel.js';
import { sharedOptions, SHARED_BEDROOMS, roomNotes, roommateEffects, agreementRules, moveInShared } from './sharedModel.js';
import { section, chips, stepper, pickerShell, rerender, savedPick, rememberPick } from './pickerParts.js';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** Mount the shared-living picker; returns unmount. */
export async function mount(container, { store }) {
  const state = store.getState();
  const loc = byId[state.home.locationId];
  const options = sharedOptions(state);
  const rules = agreementRules(state);
  const sel = savedPick(state, { index: null, roomId: null, plants: 0 }, (d) => d.index === null
    || (Number.isInteger(d.index) && options[d.index] && (d.roomId === null || options[d.index].rooms.some((r) => r.id === d.roomId))));
  const sill = loc.region === 'hawaii' ? 'lānai' : 'windowsill';

  const step = (d) => choose(sel.index === null ? (d > 0 ? 0 : 2) : (sel.index + d + 3) % 3);
  const ui = pickerShell({
    eyebrow: `Phase 3 · ${loc.name}`, title: 'Choose your room', what: 'house',
    intro: `Your rent is settled at ${formatMoney(options[0].rentCents)} a month. The houses, rooms and roommates differ in comfort, noise and company.`,
    onPrev: () => step(-1), onNext: () => step(1), onMoveIn,
  });
  container.append(ui.root);

  let view = null;
  function choose(i) {
    if (i !== sel.index) Object.assign(sel, { index: i, roomId: null });
    update();
  }

  function update() {
    rememberPick(store, sel);
    const o = options[sel.index ?? 0];
    const room = o.rooms.find((r) => r.id === sel.roomId);
    view?.show({ seed: o.seed, bedrooms: SHARED_BEDROOMS, pin: room ? room.side : null });
    ui.hint.textContent = sel.index === null ? 'Pick a house from the cards, or use the arrows to look at each one.'
      : !room ? 'Pick a room. Drag to look around, scroll to zoom.' : 'The pin marks your room. Drag to look around.';
    rerender(ui.panel, fillPanel);
    ui.moveBtn.disabled = !room;
  }

  function fillPanel() {
    ui.panel.append(section('1. House', h('div', { class: 'dz-bcards' }, options.map(houseCard))));
    const o = options[sel.index];
    if (!o) return;
    ui.panel.append(
      section('2. Room', h('div', { class: 'dz-units' }, o.rooms.map((r) => roomCard(r)))),
      section('3. Your roommates', h('div', { class: 'dz-mates' }, o.roommates.map(mateCard)), effectsLine(o)));
    if (sel.roomId) ui.panel.append(section('Extras', plantsBlock()), summaryCard(o));
  }

  function houseCard(o) {
    const on = o.index === sel.index;
    return h('button', { class: `dz-bcard${on ? ' is-on' : ''}`, type: 'button', dataset: { index: o.index, focusKey: `b${o.index}` },
      'aria-pressed': String(on), onClick: () => choose(o.index) },
    h('strong', { class: 'dz-bname' }, o.address),
    h('span', { class: 'dz-bmeta' }, `${o.beds} bd · ${o.baths} ba · ${o.rooms.length} rooms open · roommates ${o.roommates.map((m) => m.name).join(' and ')}`));
  }

  function roomCard(r) {
    const on = r.id === sel.roomId;
    return h('button', { class: `dz-unit${on ? ' is-on' : ''}`, type: 'button', dataset: { room: r.id, focusKey: `r-${r.id}` },
      'aria-pressed': String(on), onClick: () => { sel.roomId = r.id; update(); } },
    h('strong', null, r.label),
    h('span', { class: 'dz-unit-notes' }, roomNotes(r).map((n) => h('span', null, n))));
  }

  function mateCard(m) {
    const bad = ['messy', 'night owl'];
    return h('div', { class: 'dz-mate' },
      h('span', { class: 'dz-mate-face', 'aria-hidden': 'true' }, m.name.replace(/^ʻ/, '').slice(0, 1)),
      h('span', { class: 'dz-mate-body' },
        h('strong', null, `${m.name}, ${m.age}`),
        chips(m.traits.map((t, i) => ({ text: i === 3 ? `Likes ${t}` : t, tone: bad.includes(t) ? 'warn' : i < 3 ? 'good' : undefined })))));
  }

  function effectsLine(o) {
    const e = roommateEffects(o.roommates, rules);
    const soft = e.softened.length ? ` Your agreement's ${e.softened.join(' and ')} soften${e.softened.length > 1 ? '' : 's'} the rough edges.` : '';
    return h('p', { class: 'dz-effects muted' },
      `With them: social ${signed(e.social)}, noise ${signed(e.noise)}, chores ${signed(e.choresHours)} h a week.${soft}`);
  }

  function plantsBlock() {
    const canAdd = plantsCost(sel.plants + 1) <= cash(store.getState());
    return stepper({ key: 'plant', label: `Potted plants for the ${sill}, ${formatMoney(DESIGN.plantCents)} each (up to ${DESIGN.maxPlants})`,
      value: sel.plants, max: DESIGN.maxPlants, canAdd, onSet: (n) => { sel.plants = n; update(); } });
  }

  function summaryCard(o) {
    const r = o.rooms.find((x) => x.id === sel.roomId);
    const cost = plantsCost(sel.plants);
    return h('div', { class: 'dz-summary' },
      h('p', { class: 'dz-summary-label' }, 'Your home'),
      h('p', { class: 'dz-address' }, `${r.label} · ${o.address} · ${loc.name}`),
      h('p', { class: 'dz-summary-notes muted' }, roomNotes(r).join(' · ')),
      h('p', { class: 'dz-summary-cost' }, cost ? `Plants: ${formatMoney(cost)}, paid from savings when you move in.` : 'Nothing extra to pay.'));
  }

  function onMoveIn() {
    ui.error.textContent = '';
    let result = null;
    store.update((s) => { result = moveInShared(s, { index: sel.index, roomId: sel.roomId, plants: sel.plants }); },
      { checkpoint: 'design-finalized' });
    if (result && !result.ok) ui.error.textContent = `You're ${formatMoney(result.shortfallCents)} short for the plants. Take one away and try again.`;
  }

  update();
  ui.stage.append(h('p', { class: 'dz-loading muted' }, 'Loading 3D…'));
  try {
    const { createHouseView } = await import('./houseView.js');
    view = await createHouseView(ui.stage, { location: loc, variant: 'shared' });
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
