// Design in upgrade mode (13 §10, blocks task 20): "Upgrade this home" from the My home menu. Houses get the house
// picker's customization panel locked to the listing they live in (color, garden beds, fruit trees, coop, a pet) with
// the 3D preview; apartments, condos and shared rooms get potted plants and, where the lease or house rules allow, a
// cat. Only what is new is charged (life/upgrade.js); Upgrade commits, the bar's Cancel (ui/upgradeBar.js) undoes.
import { h } from '../../ui/dom.js';
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { styleFamily } from '../../data/styleFamilies.js';
import { formatMoney } from '../../util/format.js';
import { listings, PET_LABELS } from './houseModel.js';
import { upgradeQuote, afterUpgrade, currentCustom, catAllowed, commitUpgrade } from '../../life/upgrade.js';
import { section, stepper, pickerShell, rerender } from './pickerParts.js';

const H = DESIGN.house;
const fruitLabel = (kind) => ({ mango: 'Mango', citrus: 'Citrus', fig: 'Fig', apple: 'Apple' }[kind] ?? 'Fruit');

/** Mount the upgrade screen; returns unmount. */
export async function mount(container, { store }) {
  const state = store.getState();
  const loc = byId[state.home.locationId];
  const house = state.home.kind === 'house';
  const was = currentCustom(state);
  const sel = { ...was };
  const ui = pickerShell({ eyebrow: `Upgrade · ${loc.name}`, title: 'Upgrade your home', what: 'view',
    intro: 'Add to the home you live in. You pay only for what is new, and your blocks stay where they are unless the new things need the space.',
    onPrev: () => {}, onNext: () => {}, onMoveIn: onUpgrade });
  ui.root.classList.add('dz-upgrade');
  ui.root.querySelectorAll('.dz-arrow').forEach((b) => b.remove());
  ui.moveBtn.textContent = 'Upgrade';
  ui.moveBtn.classList.add('dz-upgrade-go');
  container.append(ui.root);

  const listing = house ? listings(state)[state.home.house.listingIndex ?? 0] : null;
  const palettes = styleFamily(loc.styleFamily, loc.styleVariant).palettes;
  let view = null;

  function update() {
    const q = upgradeQuote(store.getState(), sel);
    if (view && listing) {
      view.show({ seed: listing.seed, palette: q.custom.palette ?? listing.palette, sqft: listing.sqftTarget, bedrooms: listing.bedrooms,
        extras: { gardenBeds: q.custom.gardenBeds, fruitTrees: q.custom.fruitTrees, coop: q.custom.coop } });
    }
    ui.hint.textContent = house ? 'Drag to look around (the yard is out back), scroll to zoom.' : '';
    rerender(ui.panel, fillPanel);
    ui.moveBtn.disabled = !q.lines.length && !(house && q.custom.palette !== was.palette) || !afterUpgrade(store.getState(), sel).ok;
  }

  function fits(patch) { return afterUpgrade(store.getState(), { ...sel, ...patch }).ok; }
  function set(patch) { Object.assign(sel, patch); update(); }

  function fillPanel() {
    ui.panel.append(h('p', { class: 'dz-address' }, state.home.label ?? ''));
    if (house) {
      ui.panel.append(
        section('Exterior color', h('div', { class: 'dz-swatches', role: 'group', 'aria-label': 'Exterior color' },
          palettes.map((p, i) => {
            const on = i === (sel.palette ?? listing.palette);
            return h('button', { class: `dz-swatch${on ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(on),
              'aria-label': `Color ${i + 1}`, dataset: { palette: i, focusKey: `c${i}` },
              style: `--sw-wall: ${p.wall}; --sw-roof: ${p.roof}; --sw-trim: ${p.trim}`,
              onClick: () => set({ palette: i }) }, h('span', { class: 'dz-swatch-roof' }), h('span', { class: 'dz-swatch-wall' }));
          }))),
        section('Yard', yardBlock()));
    } else ui.panel.append(section('Extras', rentBlock()));
    ui.panel.append(summaryCard());
  }

  function yardBlock() {
    return h('div', { class: 'dz-yard' },
      stepper({ key: 'beds', label: `Garden beds, ${formatMoney(H.bedCents)} each`, value: sel.gardenBeds, max: H.maxBeds,
        canAdd: fits({ gardenBeds: sel.gardenBeds + 1 }), onSet: (n) => set({ gardenBeds: Math.max(was.gardenBeds, n) }) }),
      stepper({ key: 'trees', label: `${fruitLabel(listing.fruitKind)} trees, ${formatMoney(H.treeCents)} each`, value: sel.fruitTrees,
        max: H.maxTrees, canAdd: fits({ fruitTrees: sel.fruitTrees + 1 }), onSet: (n) => set({ fruitTrees: Math.max(was.fruitTrees, n) }) }),
      h('label', { class: 'dz-check' },
        h('input', { type: 'checkbox', class: 'dz-coop', checked: sel.coop, disabled: was.coop || (!sel.coop && !fits({ coop: true })),
          dataset: { focusKey: 'coop' }, onChange: (e) => set({ coop: e.target.checked }) }),
        h('span', null, was.coop ? `Chicken coop and ${H.hens} hens (you have it)` : `Chicken coop and ${H.hens} hens, ${formatMoney(H.coopCents)}`)),
      was.pet !== 'none'
        ? h('p', { class: 'muted dz-pet-have' }, `Your ${PET_LABELS[was.pet].toLowerCase()} already lives here.`)
        : h('fieldset', { class: 'dz-pets' },
          h('legend', null, 'A pet (food and vet bills come later)'),
          ['none', 'cat', 'dog'].map((p) => h('label', { class: 'dz-radio' },
            h('input', { type: 'radio', name: 'dz-pet', value: p, checked: sel.pet === p, dataset: { focusKey: `pet-${p}` },
              disabled: p !== 'none' && p !== sel.pet && !fits({ pet: p }), onChange: () => set({ pet: p }) }),
            h('span', null, p === 'none' ? PET_LABELS.none : `${PET_LABELS[p]}, ${formatMoney(H.petCents[p])}`)))));
  }

  function rentBlock() {
    const s = store.getState();
    const allowed = catAllowed(s);
    const catNote = s.home.kind === 'apartment' ? 'the lease’s pet fee is added' : s.home.kind === 'shared' ? 'your housemates agreed to pets' : 'it’s your condo';
    return h('div', { class: 'dz-yard' },
      stepper({ key: 'plant', label: `Potted plants, ${formatMoney(DESIGN.plantCents)} each (up to ${DESIGN.maxPlants})`, value: sel.plants,
        max: DESIGN.maxPlants, canAdd: fits({ plants: sel.plants + 1 }), onSet: (n) => set({ plants: Math.max(was.plants, n) }) }),
      was.cat ? h('p', { class: 'muted dz-pet-have' }, 'Your cat already lives here.')
        : allowed ? h('label', { class: 'dz-check' },
          h('input', { type: 'checkbox', class: 'dz-cat', checked: sel.cat, disabled: !sel.cat && !fits({ cat: true }),
            dataset: { focusKey: 'cat' }, onChange: (e) => set({ cat: e.target.checked }) }),
          h('span', null, `Adopt a cat, ${formatMoney(H.petCents.cat)} (${catNote})`))
          : h('p', { class: 'muted dz-pet-rule' }, 'Your roommate agreement says no pets, so a cat isn’t an option here.'));
  }

  function summaryCard() {
    const q = upgradeQuote(store.getState(), sel);
    const left = afterUpgrade(store.getState(), sel);
    return h('div', { class: 'dz-summary dz-quote' },
      h('p', { class: 'dz-summary-label' }, 'Upgrade cost'),
      q.lines.length
        ? h('ul', { class: 'dz-lines' }, q.lines.map((x) => h('li', null, h('span', null, x.label), h('span', null, formatMoney(x.cents)))),
          h('li', { class: 'dz-total' }, h('span', null, 'Total from checking and savings'), h('span', null, formatMoney(q.deltaCents))))
        : h('p', { class: 'dz-summary-cost' }, house ? 'Nothing new yet. Paint is free.' : 'Nothing new yet.'),
      h('p', { class: `dz-summary-cost${left.low ? ' dz-warn' : ''}` }, left.ok
        ? `Cash after: ${formatMoney(left.leftCents)}${left.low ? '. That is under $1,000, a thin cushion for surprises.' : ''}`
        : `That is ${formatMoney(-left.leftCents)} more than you have.`));
  }

  async function onUpgrade() {
    ui.error.textContent = '';
    ui.moveBtn.disabled = true;
    const { voxHome } = await import('../../world/voxHome.js');
    let result = null;
    store.update((s) => { result = commitUpgrade(s, sel, { voxHomeFn: voxHome }); }, { checkpoint: 'upgrade-committed' });
    if (result && !result.ok) {
      ui.error.textContent = `You're ${formatMoney(result.shortfallCents)} short. Take something away and try again.`;
      ui.moveBtn.disabled = false;
    }
  }

  update();
  if (house) {
    ui.stage.append(h('p', { class: 'dz-loading muted' }, 'Loading 3D…'));
    try {
      const { createHouseView } = await import('./houseView.js');
      view = await createHouseView(ui.stage, { location: loc, variant: 'house' });
    } catch (err) {
      console.warn('3D house view failed', err);
    }
    ui.stage.querySelector('.dz-loading')?.remove();
    if (view) { update(); await view.firstFrame(); }
  } else {
    ui.stage.append(h('div', { class: 'dz-upgrade-card card' },
      h('p', { class: 'dz-eyebrow' }, 'You live here'),
      h('p', { class: 'dz-address' }, state.home.address ?? state.home.label ?? ''),
      h('p', { class: 'muted' }, 'Plants go on your balcony, lānai or windowsill. You can see them in your block world when you get back.')));
  }
  window.__design = { sel, quote: () => upgradeQuote(store.getState(), sel), info: () => view?.info };
  document.body.dataset.ready = '1';
  return () => {
    view?.dispose();
    delete window.__design;
    delete document.body.dataset.ready;
  };
}
