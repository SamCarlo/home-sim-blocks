// Apartment and condo picker rules (07 §1–§2, 02 §2 `home`, task 36). Pure: the three seeded buildings for a save
// (name, plan, amenities), each unit's traits, the lifestyle modifiers and Move in. The picker screen
// (apartmentPicker.js) and three/buildingGen.js use the same plan, so cards and the 3D model always agree.
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { charge, PAPERWORK_MONTH } from '../../finance/ledger.js';
import { createRng, seedFor } from '../../util/rng.js';
import { planBuilding, homeFloors, unitCell } from './buildingPlan.js';
import { startLife } from '../../life/relocation.js';

/** Fictional building names per region (07 §2 "Kaiko Terrace", "The Alder"). */
export const BUILDING_NAMES = {
  hawaii: ['Kaiko Terrace', 'Hale Moana', 'Lehua Court', 'Waiākea Gardens', 'Puʻu Lani Apartments', 'Kilohana Place',
    'Hale Kukui', 'Mālama Terrace', 'Niu Grove Residences'],
  cities: ['The Alder', 'Harbor View Flats', 'The Linden', 'Parkside Commons', 'Juniper House', 'The Meridian',
    'Cedar Row', 'Bayline Residences', 'The Wren'],
  towns: ['Maple Court', 'Ridgeview Apartments', 'The Granary Lofts', 'Pinecrest Place', 'Mill Street Flats',
    'Birch Hollow', 'Depot Square', 'Willow Bend', 'The Foundry'],
};

export const AMENITIES = ['laundry', 'parking', 'elevator', 'pool', 'gym', 'rooftop'];
export const AMENITY_LABELS = { laundry: 'Laundry', parking: 'Parking', elevator: 'Elevator', pool: 'Pool', gym: 'Gym',
  rooftop: 'Rooftop deck' };
export const VIEW_LABELS = { ocean: 'Ocean view', mountain: 'Mountain view', city: 'City view', courtyard: 'Courtyard view',
  street: 'Street view' };
export const NOISE_LABELS = { '-1': 'Quiet', 0: 'Average noise', 1: 'Noisy' };
export const SUN_LABELS = { morning: 'Morning sun', afternoon: 'Afternoon sun' };

const FORM_LABELS = { walkup: 'Walk-up', lowrise: 'Low-rise', tower: 'Tower', glass: 'Glass tower', townhomes: 'Townhomes' };

/** The seed of building `index` (0–2) for this save (07 §2). */
export function buildingSeed(state, index) {
  return seedFor(state.meta.seed, 'building', index);
}

/**
 * The three buildings for the chosen home: `[{index, seed, name, plan, form, formLabel, amenities[], floors[]}]`.
 * `floors` are the floors with homes (lowest first). Names don't repeat within the three.
 */
export function buildingOptions(state) {
  const home = state.home;
  const loc = byId[home.locationId];
  const kind = home.kind === 'condo' ? 'condo' : 'apartment';
  const names = createRng(seedFor(state.meta.seed, 'building-names', loc.id, kind))
    .shuffle(BUILDING_NAMES[loc.region] ?? BUILDING_NAMES.cities);
  return [0, 1, 2].map((index) => {
    const seed = buildingSeed(state, index);
    const plan = planBuilding({ style: loc.styleFamily, variant: loc.styleVariant, settlement: loc.settlement, kind, seed });
    return { index, seed, name: names[index], plan, form: plan.form, formLabel: FORM_LABELS[plan.form],
      amenities: amenitiesFor(plan, seed), floors: homeFloors(plan) };
  });
}

/** Seeded amenity tags for a plan (07 §2): towers always have an elevator, a resort low-rise always has a pool. */
export function amenitiesFor(plan, seed) {
  const odds = DESIGN.amenityOdds[plan.form] ?? DESIGN.amenityOdds.walkup;
  const rng = createRng(seedFor(seed, 'amenities'));
  return AMENITIES.filter((a) => {
    const roll = rng.next();
    if (a === 'pool' && plan.features.resort) return true;
    if (a === 'rooftop' && plan.features.deco) return true;
    return roll < odds[a];
  });
}

/** "4B" for floor 4, unit 1; townhomes are numbered "3" (whole homes). */
export function unitName(plan, floor, unit) {
  if (plan.form === 'townhomes') return String(unit + 1);
  return `${floor}${String.fromCharCode(65 + unit)}`;
}

/** "Unit 4B" or "Townhome 3". */
export function unitLabel(plan, floor, unit) {
  return `${plan.form === 'townhomes' ? 'Townhome' : 'Unit'} ${unitName(plan, floor, unit)}`;
}

/**
 * Seeded traits of one unit (07 §2): `{view, noise (−1 quiet … 1 noisy), sun, stairs (flights climbed, 0 with an
 * elevator), lotsOfStairs}`. Street-facing (row 0) and low floors are louder, high floors quieter; views depend on the
 * place, the side and the height.
 */
export function unitTraits(locationId, option, floor, unit) {
  const { plan, amenities, floors } = option;
  const cell = unitCell(plan, unit) ?? { col: 0, row: 0 };
  const rng = createRng(seedFor(option.seed, 'unit', floor, unit));
  const whole = plan.form === 'townhomes';
  const rank = floors.length > 1 ? floors.indexOf(floor) / (floors.length - 1) : 0;
  const high = !whole && floors.length > 1 && rank >= DESIGN.highFloorShare && floor >= 3;
  const low = !whole && floor <= DESIGN.lowFloors;
  // Single-row buildings see out both sides; the seeded draw decides which side the living room faces.
  const front = plan.rows === 2 ? cell.row === 0 : rng.chance(0.6);
  const ocean = DESIGN.oceanViews.includes(locationId), mountain = DESIGN.mountainViews.includes(locationId);
  const urban = ['big-city', 'mid-city', 'small-city'].includes(plan.settlement);
  let view;
  if (front) view = high && ocean ? (urban && rng.chance(0.35) ? 'city' : 'ocean') : high && urban ? 'city' : 'street';
  else view = high && mountain ? 'mountain' : 'courtyard';
  const score = (front ? 1 : 0) + (low ? 1 : 0) - (high ? 1 : 0) + (plan.settlement === 'big-city' ? 1 : 0);
  const noise = score >= 2 ? 1 : score <= 0 ? -1 : 0;
  const sun = plan.rows === 2 ? (cell.row === 0 ? 'morning' : 'afternoon') : cell.col < plan.cols / 2 ? 'morning' : 'afternoon';
  const elevator = amenities.includes('elevator');
  const stairs = whole || elevator ? 0 : Math.max(0, floor - 1);
  return { view, noise, sun, stairs, lotsOfStairs: !elevator && floor > DESIGN.stairsFloor };
}

/**
 * Lifestyle modifiers for `home.lifestyle` (07 §1–§2): `{noise ±1, view 0–2 (ocean/mountain 2, courtyard 1), nature
 * (0–2: a nature view plus balcony plants), social (pool/rooftop/gym), stairs (0/1, + physical and chores), gym (0/1)}`.
 */
export function lifestyleFor(traits, amenities, plantCount = 0) {
  const view = traits.view === 'ocean' || traits.view === 'mountain' ? 2 : traits.view === 'courtyard' ? 1 : 0;
  return {
    noise: traits.noise,
    view,
    nature: Math.min(2, (view === 2 ? 1 : 0) + (plantCount > 0 ? 1 : 0)),
    social: ['pool', 'rooftop', 'gym'].filter((a) => amenities.includes(a)).length > 0 ? 1 : 0,
    stairs: traits.stairs > 0 ? 1 : 0,
    gym: amenities.includes('pool') || amenities.includes('gym') ? 1 : 0,
  };
}

/** Short notes for a unit card, e.g. ["Ocean view", "Quiet", "Morning sun", "3 flights of stairs"]. */
export function traitNotes(traits) {
  const out = [VIEW_LABELS[traits.view], NOISE_LABELS[traits.noise], SUN_LABELS[traits.sun]];
  if (traits.stairs) out.push(traits.lotsOfStairs ? `Lots of stairs (${traits.stairs} flights)` : `${traits.stairs} flight${traits.stairs > 1 ? 's' : ''} of stairs`);
  return out;
}

/** "Unit 4B · Kaiko Terrace · Hilo" (07 §1 summary card). */
export function addressLabel(option, floor, unit, location) {
  return `${unitLabel(option.plan, floor, unit)} · ${option.name} · ${location.name}`;
}

/** Cost of `n` potted plants in cents. */
export function plantsCost(n) {
  return Math.max(0, Math.min(DESIGN.maxPlants, n)) * DESIGN.plantCents;
}

/**
 * Move in (07 §1): pays for the plants (month −1, checking then savings; all or nothing), writes the full `home`
 * (building, label, plants, lifestyle), starts life (`startLife`: welcome stage, phase 'life', the calendar keeps going).
 * Mutates a store draft. → `{ok, shortfallCents}`.
 */
export function moveIn(state, { index, floor, unit, plants = 0 }) {
  const option = buildingOptions(state)[index];
  if (!option) throw new Error(`No building ${index}`);
  if (!option.floors.includes(floor) || !unitCell(option.plan, unit)) throw new Error(`No unit ${floor}/${unit}`);
  const n = Math.max(0, Math.min(DESIGN.maxPlants, plants | 0));
  if (n) {
    const paid = charge(state, 'checking', plantsCost(n), { month: PAPERWORK_MONTH, label: `Potted plants (${n})`,
      category: 'lifestyle' });
    if (!paid.ok) return { ok: false, shortfallCents: paid.shortfallCents };
  }
  const loc = byId[state.home.locationId];
  const traits = unitTraits(loc.id, option, floor, unit);
  state.home = {
    ...state.home,
    styleFamily: loc.styleFamily,
    label: `${unitLabel(option.plan, floor, unit)}, ${option.name}`,
    address: addressLabel(option, floor, unit, loc),
    building: { seed: option.seed, index, name: option.name, form: option.form, floor, unit,
      unitName: unitName(option.plan, floor, unit), amenities: option.amenities, traits },
    plants: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, kind: DESIGN.plantKind, spot: i, alive: true, plantedMonth: 0 })),
    animals: state.home.animals ?? [],
    lifestyle: lifestyleFor(traits, option.amenities, n),
  };
  startLife(state);
  return { ok: true, shortfallCents: 0 };
}
