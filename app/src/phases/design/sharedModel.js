// Shared-living picker rules (07 §1, §4, 02 §2 `home.shared`, task 38). Pure: three seeded shared houses, each with
// 2–3 rooms (size, view, closet, bathroom; same rent, different comfort and noise) and two fictional roommates whose
// traits set the home's modifiers. The Phase 2 roommate agreement's quiet hours and chore system soften the bad ones.
import { DESIGN } from '../../config.js';
import { byId } from '../../data/locations/index.js';
import { charge, PAPERWORK_MONTH } from '../../finance/ledger.js';
import { createRng, seedFor } from '../../util/rng.js';
import { namesFor } from '../../content/names.js';
import { planHouse } from './housePlan.js';
import { STREETS } from './houseModel.js';
import { plantsCost } from './apartmentModel.js';
import { startLife } from '../../life/relocation.js';

const S = DESIGN.shared;
/** planHouse `bedrooms` for shared houses: the roommates' rooms plus up to 3 open ones (planHouse adds 1 for shared). */
export const SHARED_BEDROOMS = S.roommates + S.rooms[1] - 1;

/** Room templates; a house gets 2–3 of them. `side` is where the 3D pin goes (front/back, left/right, up). */
const ROOMS = [
  { id: 'front', label: 'Front bedroom', noise: 0, sqft: [120, 170], side: { x: -0.3, z: 1 } },
  { id: 'back', label: 'Back bedroom', noise: -1, sqft: [110, 150], side: { x: 0.3, z: -1 } },
  { id: 'corner', label: 'Corner room', noise: 0, sqft: [140, 190], side: { x: 1, z: 0.6 } },
  { id: 'upstairs', label: 'Upstairs room', noise: -1, sqft: [120, 160], side: { x: -0.2, z: 0.2, up: true }, needs: 'stories' },
  { id: 'den', label: 'Converted den', noise: 1, sqft: [90, 120], side: { x: -1, z: 0 } },
];
const CLOSETS = { 'walk-in': 'Walk-in closet', standard: 'Standard closet', small: 'Small closet' };
export const VIEW_LABELS = { ocean: 'Ocean view', mountain: 'Mountain view', garden: 'Garden view', street: 'Street view' };
export const NOISE_LABELS = { '-1': 'Quiet', 0: 'Average noise', 1: 'Noisy' };

/** Trait pairs (07 §4): each roommate gets one side of each pair plus a hobby. */
export const TRAIT_PAIRS = [['tidy', 'messy'], ['early bird', 'night owl'], ['social', 'quiet']];

/** The seed of shared house `index` (0–2) for this save. */
export function sharedSeed(state, index) {
  return seedFor(state.meta.seed, 'shared-house', index);
}

function roomsFor(plan, loc, seed) {
  const rng = createRng(seedFor(seed, 'rooms'));
  const pool = ROOMS.filter((r) => r.needs !== 'stories' || plan.main.stories > 1);
  const picked = rng.shuffle(pool).slice(0, rng.int(S.rooms[0], S.rooms[1]));
  const ocean = DESIGN.oceanViews.includes(loc.id), mountain = DESIGN.mountainViews.includes(loc.id);
  const privateAt = rng.chance(0.6) ? rng.int(0, picked.length - 1) : -1;
  return picked.map((t, i) => {
    let view = t.id === 'back' || t.id === 'den' ? 'garden' : 'street';
    if (t.id === 'upstairs' || t.id === 'corner') view = ocean && rng.chance(0.5) ? 'ocean' : mountain ? 'mountain' : 'garden';
    const closet = t.id === 'den' ? 'small' : rng.pick(Object.keys(CLOSETS));
    return { id: t.id, label: t.label, sqft: Math.round(rng.int(t.sqft[0], t.sqft[1]) / 5) * 5, view, closet,
      bath: i === privateAt ? 'private' : 'shared', noise: t.noise, side: t.side };
  });
}

function roommatesFor(firsts, seed) {
  const rng = createRng(seedFor(seed, 'roommates'));
  const hobbies = rng.shuffle(S.hobbies);
  return Array.from({ length: S.roommates }, (_, i) => ({
    name: firsts[i], age: rng.int(S.ages[0], S.ages[1]),
    traits: [...TRAIT_PAIRS.map((p) => rng.pick(p)), hobbies[i]],
  }));
}

/**
 * The three shared houses: `[{index, seed, plan, address, street, beds, baths, rooms[{id, label, sqft, view, closet,
 * bath, noise, side}], roommates[{name, age, traits[4]}], rentCents}]`.
 */
export function sharedOptions(state) {
  const loc = byId[state.home.locationId];
  const rng = createRng(seedFor(state.meta.seed, 'shared-listings', loc.id));
  const streets = rng.shuffle(STREETS[loc.region] ?? STREETS.cities);
  const rentCents = loc.housing.shared?.roomRentCents ?? 0;
  // One name pool for all three houses, so nobody appears twice (and never the player's own first name).
  const own = String(state.player?.characterName ?? '').split(/\s+/)[0];
  const firsts = rng.shuffle(namesFor(loc.region).first).filter((f) => f !== own);
  return [0, 1, 2].map((index) => {
    const seed = sharedSeed(state, index);
    const plan = planHouse({ style: loc.styleFamily, styleVariant: loc.styleVariant, seed, variant: 'shared', bedrooms: SHARED_BEDROOMS });
    const address = `${createRng(seedFor(seed, 'number')).int(12, 2980)} ${streets[index]}`;
    return { index, seed, plan, street: streets[index], address, beds: plan.beds, baths: plan.baths,
      rooms: roomsFor(plan, loc, seed), roommates: roommatesFor(firsts.slice(index * S.roommates), seed), rentCents };
  });
}

/** Short notes for a room card: ["150 sq ft", "Garden view", "Walk-in closet", "Private bathroom", "Quiet"]. */
export function roomNotes(room) {
  return [`${room.sqft} sq ft`, VIEW_LABELS[room.view], CLOSETS[room.closet],
    room.bath === 'private' ? 'Private bathroom' : 'Shared bathroom', NOISE_LABELS[room.noise]];
}

/** What the Phase 2 roommate agreement settled: `{quietHours, choreSystem}` (05 §3–§4). */
export function agreementRules(state) {
  const v = state.paperwork?.steps?.['roommate-agreement']?.values
    ?? state.finances.agreements.findLast?.((a) => a.type === 'roommate-agreement')?.docValues ?? {};
  return { quietHours: !!v.quiet && v.quiet !== 'none', choreSystem: v.chores === 'chart' || v.chores === 'own-mess' };
}

/**
 * Roommate modifiers (07 §4): `{social 0–2, noise 0–1, choresHours −1…+1 per week, softened: [..]}`. Social roommates
 * add social; a night owl adds noise (two of them, or a social night owl, make it 1); tidy roommates take chores off
 * your week, messy ones add them. Agreed quiet hours take `quietHoursSoften` off the noise; a chore system halves extra
 * chore hours.
 */
export function roommateEffects(roommates, rules = {}) {
  const has = (t) => roommates.filter((r) => r.traits.includes(t)).length;
  const social = Math.min(2, has('social'));
  const owls = roommates.filter((r) => r.traits.includes('night owl'));
  let noise = owls.length === 0 ? 0 : owls.length > 1 || owls.some((r) => r.traits.includes('social')) ? 1 : 0.5;
  let chores = 0.5 * has('messy') - 0.5 * has('tidy');
  const softened = [];
  if (noise > 0 && rules.quietHours) { noise = Math.max(0, noise - S.quietHoursSoften); softened.push('quiet hours'); }
  if (chores > 0 && rules.choreSystem) { chores *= S.choresSystemSoften; softened.push('chore system'); }
  return { social, noise, choresHours: Math.max(-1, Math.min(1, chores)), softened };
}

/** Lifestyle for `home.lifestyle`: `{noise, view 0–2, nature 0–2, social 0–2, choresHours}`. */
export function sharedLifestyle(room, effects, plants = 0) {
  const view = room.view === 'ocean' || room.view === 'mountain' ? 2 : room.view === 'garden' ? 1 : 0;
  return {
    noise: Math.max(-1, Math.min(2, room.noise + effects.noise)),
    view,
    nature: Math.min(2, (view >= 1 ? 1 : 0) + (plants > 0 ? 1 : 0)),
    social: effects.social,
    choresHours: effects.choresHours,
  };
}

/**
 * Move in (07 §1, §4): pays for potted plants (month −1, all or nothing), writes the full `home` (shared, label,
 * address, plants, lifestyle), starts life (`startLife`) and sets phase 'life'. Mutates a store draft. → `{ok, shortfallCents}`.
 */
export function moveInShared(state, { index, roomId, plants = 0 }) {
  const loc = byId[state.home.locationId];
  const option = sharedOptions(state)[index];
  if (!option) throw new Error(`No shared house ${index}`);
  const room = option.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error(`No room ${roomId}`);
  const n = Math.max(0, Math.min(DESIGN.maxPlants, plants | 0));
  if (n) {
    const paid = charge(state, 'savings', plantsCost(n), { month: PAPERWORK_MONTH, label: `Potted plants (${n})`, category: 'lifestyle' });
    if (!paid.ok) return { ok: false, shortfallCents: paid.shortfallCents };
  }
  const effects = roommateEffects(option.roommates, agreementRules(state));
  const { side, ...roomInfo } = room;
  state.home = {
    ...state.home,
    styleFamily: loc.styleFamily,
    label: `${room.label}, ${option.address}`,
    address: `${room.label} · ${option.address} · ${loc.name}`,
    shared: { seed: option.seed, houseIndex: index, roomId, address: option.address, room: roomInfo,
      roommates: option.roommates.map((r) => ({ name: r.name, age: r.age, traits: [...r.traits] })), effects },
    plants: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, kind: DESIGN.plantKind, spot: i, alive: true, plantedMonth: 0 })),
    animals: state.home.animals ?? [],
    lifestyle: sharedLifestyle(room, effects, n),
  };
  startLife(state);
  return { ok: true, shortfallCents: 0 };
}
