// Upgrading the home you already have (13 §7, §10, blocks task 20). Pure: mutates the store draft it is given and never
// touches the DOM. "Upgrade this home" keeps the student where they live: `state.upgrade` remembers the home and world
// as they were, the design screen shows the upgrade choices, and Commit charges only what is new (removing never
// refunds), updates `home` like the move-in functions do and rebases the block world onto the renovated base. Cancel
// puts everything back. Both return to Live at the same stage. Builds (blueprint homes) are task 21.
import { DESIGN, LEASE } from '../config.js';
import { charge, cash, addRecurring } from '../finance/ledger.js';
import { createRng, seedFor } from '../util/rng.js';
import { byId } from '../data/locations/index.js';
import { listings, normalizeCustom, paletteCount, houseLifestyle, PET_LABELS, PET_NAMES, HEN_NAMES } from '../phases/design/houseModel.js';
import { lifestyleFor } from '../phases/design/apartmentModel.js';
import { sharedLifestyle } from '../phases/design/sharedModel.js';
import { HOME_MENU_STAGES } from './homeMenu.js';
import { homeKeyFor } from '../world/homeKey.js';
import { rebase, countEdits } from '../world/edits.js';

const H = DESIGN.house;
/** Kinds this task upgrades (builds come in task 21). */
export const UPGRADE_NOW = Object.freeze(['house', 'apartment', 'condo', 'shared']);
const stageOf = (state) => state.life?.current?.stage ?? 'welcome';

/** True when "Upgrade this home" can start: in Live with a home, at welcome/plan/summary, not moving or upgrading. */
export function canUpgrade(state) {
  return state.phase === 'life' && !!state.home && UPGRADE_NOW.includes(state.home.kind) && !state.relocation
    && !state.upgrade && HOME_MENU_STAGES.includes(stageOf(state));
}

/** Start upgrading: remember the home and world as they are, then open Design in upgrade mode. Mutates a store draft. */
export function startUpgrade(s) {
  if (!canUpgrade(s)) throw new Error('startUpgrade: only from Live (welcome, plan or summary) with a home');
  s.upgrade = { startedMonth: s.life.monthIndex, stage: 'design', homeBefore: structuredClone(s.home),
    worldBefore: s.world ? structuredClone(s.world) : null };
  s.phase = 'design';
  return s.upgrade;
}

/** Whether a renter or condo owner may add a cat: condo owners yes; apartment leases with a pet fee; rooms only if the roommate agreement allows it. */
export function catAllowed(state) {
  const kind = state.home?.kind;
  if (kind === 'condo' || kind === 'apartment') return true;
  if (kind === 'shared') {
    const v = state.paperwork?.steps?.['roommate-agreement']?.values?.pets
      ?? state.finances?.agreements?.findLast?.((a) => a.type === 'roommate-agreement')?.docValues?.pets;
    return v === 'ask' || v === 'bring';
  }
  return false;
}

const hasCat = (home) => (home.animals ?? []).some((a) => a.kind === 'cat' && a.present !== false);
const potCount = (home) => (home.plants ?? []).filter((p) => p.kind === DESIGN.plantKind).length;

/** The current choices of a home, in the shape the upgrade screen edits. */
export function currentCustom(state) {
  const home = state.upgrade?.homeBefore ?? state.home;
  if (home.kind === 'house') {
    const x = home.house ?? {};
    return { palette: x.palette ?? null, gardenBeds: x.gardenBeds ?? 0, fruitTrees: x.fruitTrees ?? 0, coop: !!x.coop, pet: x.pet ?? 'none' };
  }
  return { plants: potCount(home), cat: hasCat(home) };
}

/** Clamp a choice so nothing goes below what the home already has (the screen only adds). */
export function upgradeCustom(state, custom = {}) {
  const was = currentCustom(state);
  if (state.home.kind === 'house') {
    const c = normalizeCustom({ ...was, ...custom }, paletteCount(byId[state.home.locationId]));
    return { ...c, gardenBeds: Math.max(c.gardenBeds, was.gardenBeds), fruitTrees: Math.max(c.fruitTrees, was.fruitTrees),
      coop: c.coop || was.coop, pet: was.pet !== 'none' ? was.pet : c.pet };
  }
  const plants = Math.max(was.plants, Math.min(DESIGN.maxPlants, Number(custom.plants ?? was.plants) | 0));
  return { plants, cat: was.cat || (!!custom.cat && catAllowed(state)) };
}

/**
 * What the upgrade costs → `{lines [{key, label, cents}], deltaCents, custom}`: only what is new (2 beds → 3 charges one
 * bed); the exterior color is free, like at move-in.
 */
export function upgradeQuote(state, custom = {}) {
  const was = currentCustom(state);
  const c = upgradeCustom(state, custom);
  const lines = [];
  const add = (key, label, cents) => { if (cents > 0) lines.push({ key, label, cents }); };
  if (state.home.kind === 'house') {
    const beds = c.gardenBeds - was.gardenBeds, trees = c.fruitTrees - was.fruitTrees;
    add('beds', `New garden bed${beds > 1 ? 's' : ''} (${beds})`, beds * H.bedCents);
    add('trees', `New fruit tree${trees > 1 ? 's' : ''} (${trees})`, trees * H.treeCents);
    if (c.coop && !was.coop) add('coop', `Chicken coop and ${H.hens} hens`, H.coopCents);
    if (c.pet !== 'none' && was.pet === 'none') add('pet', `${PET_LABELS[c.pet]} adoption`, H.petCents[c.pet]);
  } else {
    const n = c.plants - was.plants;
    add('plants', `Potted plant${n > 1 ? 's' : ''} (${n})`, n * DESIGN.plantCents);
    if (c.cat && !was.cat) {
      add('pet', 'Cat adoption', H.petCents.cat);
      if (state.home.kind === 'apartment') add('pet-fee', 'Pet fee (lease)', LEASE.petFeeCents);
    }
  }
  return { lines, deltaCents: lines.reduce((t, l) => t + l.cents, 0), custom: c };
}

/** Cash left after the upgrade, and whether it fits. */
export function afterUpgrade(state, custom) {
  const left = cash(state) - upgradeQuote(state, custom).deltaCents;
  return { leftCents: left, ok: left >= 0, low: left >= 0 && left < H.lowCashCents };
}

function nextId(list) {
  return list.reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0) + 1;
}

/** Write the upgraded choices into `s.home` (plants, animals, lifestyle), like the move-in functions do. */
function applyToHome(s, c) {
  const home = s.home, mi = s.life.monthIndex;
  const plants = home.plants ?? (home.plants = []);
  const animals = home.animals ?? (home.animals = []);
  let p = nextId(plants), a = nextId(animals);
  const loc = byId[home.locationId];
  if (home.kind === 'house') {
    const x = home.house;
    const listing = listings(s)[x.listingIndex ?? 0];
    const names = createRng(seedFor(x.seed, 'upgrade-names', mi));
    for (let i = x.gardenBeds ?? 0; i < c.gardenBeds; i++) plants.push({ id: `p${p++}`, kind: 'garden-bed', spot: `bed-${i}`, alive: true, plantedMonth: mi });
    for (let i = x.fruitTrees ?? 0; i < c.fruitTrees; i++) plants.push({ id: `p${p++}`, kind: listing.fruitKind, spot: `tree-${i}`, alive: true, plantedMonth: mi });
    if (c.coop && !x.coop) {
      const hens = names.shuffle(HEN_NAMES);
      for (let i = 0; i < H.hens; i++) animals.push({ id: `a${a++}`, kind: 'chicken', name: hens[i], spot: 'coop', present: true, adoptedMonth: mi });
    }
    if (c.pet !== 'none' && (x.pet ?? 'none') === 'none') animals.push({ id: `a${a++}`, kind: c.pet, name: names.pick(PET_NAMES), spot: 'yard', present: true, adoptedMonth: mi });
    const palette = c.palette ?? x.palette;
    const extras = [...(c.gardenBeds ? [`garden-beds:${c.gardenBeds}`] : []), ...(c.fruitTrees ? [`fruit-trees:${c.fruitTrees}`] : []),
      ...(c.coop ? ['coop'] : []), ...(c.pet !== 'none' ? [`pet:${c.pet}`] : [])];
    home.house = { ...x, palette, extras, gardenBeds: c.gardenBeds, fruitTrees: c.fruitTrees, coop: c.coop, pet: c.pet };
    home.lifestyle = houseLifestyle(listing, c, loc);
    return;
  }
  for (let i = potCount(home); i < c.plants; i++) plants.push({ id: `p${p++}`, kind: DESIGN.plantKind, spot: i, alive: true, plantedMonth: mi });
  if (c.cat && !hasCat(home)) {
    const names = createRng(seedFor(s.meta.seed, 'upgrade-cat', mi));
    animals.push({ id: `a${a++}`, kind: 'cat', name: names.pick(PET_NAMES), spot: 'yard', present: true, adoptedMonth: mi });
  }
  if (home.kind === 'shared') home.lifestyle = sharedLifestyle(home.shared.room, home.shared.effects, c.plants);
  else home.lifestyle = lifestyleFor(home.building.traits, home.building.amenities, c.plants);
}

/**
 * Carry the student's builds onto the renovated home (13 §7): `voxHomeFn(state)` builds the base before and after;
 * edits on cells the renovation changed are dropped and counted in `world.cleared`. No world → nothing to do.
 */
export function rebaseWorld(s, before, voxHomeFn) {
  const w = s.world;
  if (!w || !voxHomeFn) return 0;
  const newKey = homeKeyFor(s);
  if (w.edits) {
    const oldBase = voxHomeFn({ ...s, home: before }).volume;
    const newBase = voxHomeFn(s).volume;
    let r;
    try { r = rebase(oldBase, newBase, w.edits); } catch { r = { edits: '', dropped: w.editCount ?? 0 }; }
    w.edits = r.edits;
    w.editCount = r.edits ? countEdits(r.edits) : 0;
    w.cleared = r.dropped;
  } else w.cleared = 0;
  w.homeKey = newKey;
  return w.cleared;
}

/**
 * Commit the upgrade: charge the new items (checking then savings, all or nothing, category 'home-upgrade'), update the
 * home, rebase the world, back to Live at the same stage. `voxHomeFn` = world/voxHome.js `voxHome` (passed in so this
 * module stays light). Mutates a store draft → `{ok, shortfallCents, cleared}`.
 */
export function commitUpgrade(s, custom, { voxHomeFn = null } = {}) {
  if (!s.upgrade) throw new Error('commitUpgrade: no upgrade in progress');
  const q = upgradeQuote(s, custom);
  if (q.deltaCents > cash(s)) return { ok: false, shortfallCents: q.deltaCents - cash(s), cleared: 0 };
  const month = s.life.monthIndex;
  for (const l of q.lines) {
    const paid = charge(s, ['checking', 'savings'], l.cents, { month, label: `Home upgrade: ${l.label}`, category: 'home-upgrade' });
    if (!paid.ok) throw new Error('commitUpgrade: charge failed after the cash check');
  }
  if (q.lines.some((l) => l.key === 'pet-fee')) {
    addRecurring(s, { label: 'Pet rent', amountCents: LEASE.petRentCents, category: 'housing', source: 'pet-rent', startsMonth: month + 1 });
  }
  const before = s.upgrade.homeBefore;
  applyToHome(s, q.custom);
  const cleared = rebaseWorld(s, before, voxHomeFn);
  if (s.home) delete s.home.pickDraft;
  s.upgrade = null;
  s.phase = 'life';
  return { ok: true, shortfallCents: 0, cleared, deltaCents: q.deltaCents };
}

/** Cancel: the home and the world come back exactly as they were, nothing is charged. Mutates a store draft. */
export function cancelUpgrade(s) {
  if (!s.upgrade) throw new Error('cancelUpgrade: no upgrade in progress');
  s.home = s.upgrade.homeBefore;
  s.world = s.upgrade.worldBefore;
  s.upgrade = null;
  s.phase = 'life';
  return s;
}

/** The welcome panel's one-time note about blocks the renovation replaced, or ''. */
export function clearedNote(world) {
  const n = world?.cleared ?? 0;
  return n > 0 ? `Your renovation cleared ${n} of your block${n === 1 ? '' : 's'}.` : '';
}

