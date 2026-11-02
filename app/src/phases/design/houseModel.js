// House purchase picker rules (07 §1, §3, 02 §2 `home.house`, task 38). Pure: three seeded listings at the approved
// price (address, sq ft, beds/baths, lot, year built, one quirk), the light customization prices, the lifestyle
// modifiers and Move in. The picker (housePicker.js) and three/houseGen.js use the same planHouse numbers.
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { styleFamily } from '../../data/styleFamilies.js';
import { charge, cash, PAPERWORK_MONTH } from '../../finance/ledger.js';
import { createRng, seedFor } from '../../util/rng.js';
import { planHouse, fruitTreeKind } from './housePlan.js';
import { startLife } from '../../life/relocation.js';

const H = DESIGN.house;

/** Fictional street names per region for listing addresses. */
export const STREETS = {
  hawaii: ['Kalanikoa St', 'Puʻuhonu Pl', 'Waianuenue Ave', 'Ohai St', 'Kaʻiulani St', 'Lehua Ln', 'Hoʻolaulima Rd',
    'Mākaʻala St', 'Kūkuau St', 'Pohaku Dr'],
  cities: ['Cedar Bend Dr', 'Linden Ave', 'Harbor Ln', 'Quail Run Ct', 'Maple Hollow Dr', 'Juniper St', 'Sycamore Way',
    'Briar Glen Ct', 'Elm Park Rd', 'Westover Dr'],
  towns: ['Mill Creek Rd', 'Church St', 'Ridge Rd', 'Depot St', 'Old Orchard Ln', 'Spring Hollow Rd', 'Prairie Ave',
    'Pine Knot Ln', 'River St', 'Schoolhouse Rd'],
};

/** What each quirk means for a card, and its effect (07 §3). */
export const QUIRKS = {
  'old-roof': { label: 'Old roof', note: 'The roof is near the end of its life: leaks are 3× as likely.' },
  'big-yard': { label: 'Big yard', note: 'A bigger lot with room for gardens, trees and animals.' },
  solar: { label: 'Solar panels', note: 'Rooftop solar cuts your electricity bill in half.' },
  'fixer-kitchen': { label: 'Fixer-upper kitchen', note: 'Dated cabinets and old appliances that may need repairs.' },
  'mountain-view': { label: 'Mountain view', note: 'A view of the mountains from the front windows.' },
  'busy-street': { label: 'On a busy street', note: 'Traffic all day: noise +1.' },
};

export const PET_LABELS = { none: 'No pet', cat: 'Cat', dog: 'Dog' };
export const PET_NAMES = ['Mochi', 'Poki', 'Kona', 'Biscuit', 'Lilo', 'Scout', 'Pepper', 'Nala', 'Bear', 'Maple', 'Koa', 'Ziggy'];
export const HEN_NAMES = ['Henrietta', 'Nugget', 'Pua', 'Clover', 'Goldie', 'Penny', 'Lani', 'Dot'];

/** The seed of listing `index` (0–2) for this save. */
export function listingSeed(state, index) {
  return seedFor(state.meta.seed, 'house', index);
}

/** How many exterior palettes the place's style family has (3–4). */
export function paletteCount(loc) {
  return styleFamily(loc.styleFamily, loc.styleVariant).palettes.length;
}

/**
 * The three listings: `[{index, seed, plan, sqftTarget, bedrooms (planHouse inputs, also for houseGen), address, street, sqft, beds, baths, lotAcres, yearBuilt, quirk,
 * priceCents, palette (the listed color), fruitKind}]`. Quirks never repeat within the three.
 */
export function listings(state) {
  const loc = byId[state.home.locationId];
  const med = loc.housing.house;
  const rng = createRng(seedFor(state.meta.seed, 'house-listings', loc.id));
  const quirks = rng.shuffle(H.quirks);
  const streets = rng.shuffle(STREETS[loc.region] ?? STREETS.cities);
  const priceCents = state.home.purchasePriceCents ?? state.choice?.snapshot?.priceCents ?? med.priceCents;
  return [0, 1, 2].map((index) => {
    const seed = listingSeed(state, index);
    const r = createRng(seedFor(seed, 'listing'));
    const quirk = quirks[index];
    const sqftTarget = Math.round(med.sqft * (1 + r.float(-H.sqftJitter, H.sqftJitter)) / 50) * 50;
    const bedrooms = Math.max(2, (med.bedrooms ?? 3) + r.int(-1, 1));
    const plan = planHouse({ style: loc.styleFamily, styleVariant: loc.styleVariant, seed, variant: 'house', sqft: sqftTarget, bedrooms });
    const lot = (med.lotAcres ?? 0.15) * r.float(0.85, 1.2) * (quirk === 'big-yard' ? H.bigYardLot : 1);
    const y0 = loc.settlement === 'suburb' ? H.suburbBuiltFrom : H.yearBuilt[0]; // suburbs are newer
    const year = quirk === 'old-roof' ? r.int(y0, y0 + 25) : r.int(y0, H.yearBuilt[1]);
    const street = streets[index];
    return { index, seed, plan, sqftTarget, bedrooms, street, address: `${r.int(12, 2980)} ${street}`, sqft: plan.sqft, beds: plan.beds,
      baths: plan.baths, lotAcres: Math.round(lot * 100) / 100, yearBuilt: year, quirk, priceCents, palette: plan.palette,
      fruitKind: fruitTreeKind(loc.biome, seed) };
  });
}

/** Clamp a customization to the allowed ranges: `{palette, gardenBeds, fruitTrees, coop, pet}`. */
export function normalizeCustom(c = {}, palettes = 4) {
  const n = (v, max) => Math.max(0, Math.min(max, Number(v) | 0));
  return {
    palette: c.palette == null ? null : ((Number(c.palette) % palettes) + palettes) % palettes,
    gardenBeds: n(c.gardenBeds, H.maxBeds), fruitTrees: n(c.fruitTrees, H.maxTrees), coop: !!c.coop,
    pet: c.pet === 'cat' || c.pet === 'dog' ? c.pet : 'none',
  };
}

/** Customization line items in cents: `[{key, label, cents}]` (the palette is free). */
export function customLines(c) {
  const out = [];
  if (c.gardenBeds) out.push({ key: 'beds', label: `Garden beds (${c.gardenBeds})`, cents: c.gardenBeds * H.bedCents });
  if (c.fruitTrees) out.push({ key: 'trees', label: `Fruit trees (${c.fruitTrees})`, cents: c.fruitTrees * H.treeCents });
  if (c.coop) out.push({ key: 'coop', label: `Chicken coop and ${H.hens} hens`, cents: H.coopCents });
  if (c.pet !== 'none') out.push({ key: 'pet', label: `${PET_LABELS[c.pet]} adoption`, cents: H.petCents[c.pet] });
  return out;
}

/** Total customization cost in cents. */
export function customCost(c) {
  return customLines(c).reduce((t, l) => t + l.cents, 0);
}

/** Money left after paying `c` (checking + savings), and whether it's under the $1,000 warning line. */
export function afterCustom(state, c) {
  const left = cash(state) - customCost(c);
  return { leftCents: left, ok: left >= 0, low: left >= 0 && left < H.lowCashCents };
}

/**
 * Lifestyle modifiers (07 §1, §3): `{noise −1…1, view 0–2, nature 0–2, social 0–1, garden 0–2}`. Towns are quiet,
 * a busy street adds 1; the mountain view is 2; gardens, fruit trees and a big yard add nature; a dog gets you out
 * meeting neighbours.
 */
export function houseLifestyle(listing, c, loc) {
  const town = !['big-city', 'mid-city', 'small-city', 'suburb'].includes(loc.settlement);
  const noise = Math.max(-1, Math.min(1, (town ? -1 : 0) + (listing.quirk === 'busy-street' ? 1 : 0)));
  const big = listing.quirk === 'big-yard' ? 1 : 0;
  return {
    noise,
    view: listing.quirk === 'mountain-view' ? 2 : 1,
    nature: Math.min(2, (c.gardenBeds ? 1 : 0) + (c.fruitTrees ? 1 : 0) + big),
    social: c.pet === 'dog' ? 1 : 0,
    garden: Math.min(2, 1 + big),
  };
}

/** Quirk effects for later tasks: `{roofLeakMultiplier, electricFactor, kitchenRepairs}` (07 §3). */
export function quirkModifiers(quirk) {
  return {
    roofLeakMultiplier: quirk === 'old-roof' ? H.roofLeakMultiplier : 1,
    electricFactor: quirk === 'solar' ? H.solarElectricFactor : 1,
    kitchenRepairs: quirk === 'fixer-kitchen',
  };
}

/**
 * Move in (07 §1, §3): checks the customization fits in checking + savings (never below $0), charges each line from
 * savings at month −1, writes the full `home` (house, label, address, plants, animals, lifestyle, modifiers), starts
 * life (`startLife`) and sets phase 'life'. Mutates a store draft. → `{ok, shortfallCents}`.
 */
export function moveInHouse(state, { index, ...custom }) {
  const loc = byId[state.home.locationId];
  const listing = listings(state)[index];
  if (!listing) throw new Error(`No listing ${index}`);
  const c = normalizeCustom(custom, paletteCount(loc));
  const { leftCents } = afterCustom(state, c);
  if (leftCents < 0) return { ok: false, shortfallCents: -leftCents };
  for (const l of customLines(c)) {
    charge(state, 'savings', l.cents, { month: PAPERWORK_MONTH, label: l.label, category: 'lifestyle' });
  }
  const palette = c.palette ?? listing.palette;
  const extras = [...(c.gardenBeds ? [`garden-beds:${c.gardenBeds}`] : []), ...(c.fruitTrees ? [`fruit-trees:${c.fruitTrees}`] : []),
    ...(c.coop ? ['coop'] : []), ...(c.pet !== 'none' ? [`pet:${c.pet}`] : [])];
  const names = createRng(seedFor(listing.seed, 'animal-names'));
  const plants = [
    ...Array.from({ length: c.gardenBeds }, (_, i) => ({ id: `p${i + 1}`, kind: 'garden-bed', spot: `bed-${i}`, alive: true, plantedMonth: 0 })),
    ...Array.from({ length: c.fruitTrees }, (_, i) => ({ id: `p${c.gardenBeds + i + 1}`, kind: listing.fruitKind, spot: `tree-${i}`, alive: true, plantedMonth: 0 })),
  ];
  const hens = names.shuffle(HEN_NAMES);
  const animals = [
    ...(c.pet !== 'none' ? [{ id: 'a1', kind: c.pet, name: names.pick(PET_NAMES), spot: 'yard', present: true, adoptedMonth: 0 }] : []),
    ...(c.coop ? Array.from({ length: H.hens }, (_, i) => ({ id: `a${i + 2}`, kind: 'chicken', name: hens[i], spot: 'coop', present: true, adoptedMonth: 0 })) : []),
  ];
  state.home = {
    ...state.home,
    styleFamily: loc.styleFamily,
    label: `${listing.address}, ${loc.name}`,
    address: `${listing.address} · ${loc.name}`,
    house: { seed: listing.seed, listingIndex: index, address: listing.address, palette, extras, quirk: listing.quirk,
      sqft: listing.sqft, beds: listing.beds, baths: listing.baths, lotAcres: listing.lotAcres, yearBuilt: listing.yearBuilt,
      gardenBeds: c.gardenBeds, fruitTrees: c.fruitTrees, coop: c.coop, pet: c.pet },
    plants,
    animals,
    lifestyle: houseLifestyle(listing, c, loc),
    modifiers: quirkModifiers(listing.quirk),
  };
  startLife(state);
  return { ok: true, shortfallCents: 0 };
}
