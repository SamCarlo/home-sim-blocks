// Move in for a built house (07 §1, §5; tasks 40–41, pure): validation, plants, hens, the optional pet, phase life.
import { DESIGN } from '../../../config.js';
import { byId } from '../../../data/locations/index.js';
import { createRng, seedFor } from '../../../util/rng.js';
import { fruitTreeKind } from '../housePlan.js';
import { charge, cash, PAPERWORK_MONTH } from '../../../finance/ledger.js';
import { HEN_NAMES, PET_NAMES, PET_LABELS } from '../houseModel.js';
import { footprintArea } from './model.js';
import { validateBlueprint } from './validate.js';
import { startLife } from '../../../life/relocation.js';

/** The validation options for the current state: `{location, budgetCents, included}` (site utilities already paid). */
export function buildContext(state) {
  const o = state.paperwork?.options ?? {};
  return { location: byId[state.home.locationId], budgetCents: o.designBudgetCents ?? null,
    included: { solarKw: o.siteUtilities?.solarKw ?? 0, catchmentGallons: o.siteUtilities?.catchmentGallons ?? 0 } };
}

/**
 * Move into the built house: refuses while validation has errors (→ `{ok: false, errors}`). Otherwise writes
 * `home.blueprint`, plants from garden beds and fruit trees, 3 hens per coop, the address and lifestyle, and starts life
 * (`startLife`: stage 'welcome', phase 'life'). `pet` ('none'|'cat'|'dog') is adopted from savings (DESIGN.house.petCents)
 * and refused with `{ok: false, shortfallCents}` when cash is short. Mutates a store draft. → `{ok, errors}`.
 */
export function moveInBuild(state, bp, { pet = 'none' } = {}) {
  const ctx = buildContext(state);
  const { errors } = validateBlueprint(bp, ctx);
  if (errors.length) return { ok: false, errors };
  const petCents = DESIGN.house.petCents[pet] ?? 0;
  if (petCents && cash(state) < petCents) return { ok: false, errors: [], shortfallCents: petCents - cash(state) };
  if (petCents) charge(state, 'savings', petCents, { month: PAPERWORK_MONTH, label: `${PET_LABELS[pet]} adoption`, category: 'lifestyle' });
  const loc = ctx.location;
  const seed = seedFor(state.meta.seed, 'build');
  const names = createRng(seedFor(seed, 'animal-names'));
  const beds = bp.yard.filter((it) => it.kind === 'garden-bed');
  const trees = bp.yard.filter((it) => it.kind === 'fruit-tree');
  const coops = bp.yard.filter((it) => it.kind === 'coop');
  const plants = [
    ...beds.map((it, i) => ({ id: `p${i + 1}`, kind: 'garden-bed', spot: it.id, alive: true, plantedMonth: 0 })),
    ...trees.map((it, i) => ({ id: `p${beds.length + i + 1}`, kind: fruitTreeKind(loc.biome, seedFor(seed, 'tree', i)), spot: it.id, alive: true, plantedMonth: 0 })),
  ];
  const hens = names.shuffle(HEN_NAMES);
  const animals = coops.flatMap((it, c) => Array.from({ length: DESIGN.house.hens }, (_, i) => ({
    id: `a${c * DESIGN.house.hens + i + 1}`, kind: 'chicken', name: hens[(c * DESIGN.house.hens + i) % hens.length], spot: it.id, present: true, adoptedMonth: 0 })));
  if (petCents) animals.push({ id: `a${animals.length + 1}`, kind: pet, name: names.pick(PET_NAMES), spot: 'yard', present: true, adoptedMonth: 0 });
  const rooms = (t) => bp.rooms.filter((r) => r.type === t).length;
  state.home = {
    ...state.home,
    styleFamily: loc.styleFamily,
    label: `Your new house, ${loc.name}`,
    address: `Your new house · ${loc.name}`,
    blueprint: bp,
    build: { sqft: footprintArea(bp), beds: rooms('bedroom'), baths: rooms('bathroom') },
    plants,
    animals,
    lifestyle: { noise: 0, view: 1, nature: 1, social: 0, garden: Math.min(2, Math.ceil((beds.length + trees.length) / 2)) },
  };
  startLife(state);
  return { ok: true, errors: [] };
}
