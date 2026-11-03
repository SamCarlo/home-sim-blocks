// Renovating a student-built home (13 §7, §10, blocks task 21). Pure: mutates the store draft it is given, never the DOM.
// The blueprint editor works on a copy (`state.upgrade.blueprint`) while `state.home.blueprint` stays the house the
// student lives in. The renovation costs blueprintCost(new) − blueprintCost(old) (never below zero: tearing a room out
// refunds nothing) plus one permit. Commit = the same validation as a new build minus the original design budget, cash
// checked first, every line charged 'home-upgrade', then the home updated and the block world rebased (life/upgrade.js).
import { RENOVATION, DESIGN } from '../config.js';
import { charge, cash } from '../finance/ledger.js';
import { createRng, seedFor } from '../util/rng.js';
import { blueprintCost } from '../phases/design/blueprint/cost.js';
import { validateBlueprint } from '../phases/design/blueprint/validate.js';
import { buildContext } from '../phases/design/blueprint/moveIn.js';
import { footprintArea } from '../phases/design/blueprint/model.js';
import { fruitTreeKind } from '../phases/design/housePlan.js';
import { HEN_NAMES } from '../phases/design/houseModel.js';
import { rebaseWorld } from './upgrade.js';

/** The blueprint the student lives in (before the renovation). */
export const blueprintBefore = (state) => (state.upgrade?.homeBefore ?? state.home).blueprint;

/** The renovation draft: `state.upgrade.blueprint` once edited, else the current blueprint. */
export const renovationDraft = (state) => state.upgrade?.blueprint ?? blueprintBefore(state);

/** Validation options for a renovation: a new build's minus the original budget (cash is checked at commit). */
export function renovationContext(state) {
  return { ...buildContext(state), budgetCents: null };
}

/**
 * Renovation cost of `bp` against the house before → `{lines [{key, label, detail, cents}], workCents, permitCents,
 * deltaCents, oldCents, newCents}`. Work = new − old, never negative; the permit is one line, always charged.
 */
export function renovationQuote(state, bp, cfg = RENOVATION) {
  const { location, included } = renovationContext(state);
  const oldCents = blueprintCost(blueprintBefore(state), location, { included }).totalCents;
  const newCents = blueprintCost(bp, location, { included }).totalCents;
  const workCents = Math.max(0, newCents - oldCents);
  const lines = [];
  if (workCents > 0) lines.push({ key: 'work', label: 'Renovation work', detail: 'New plan cost minus the house you have', cents: workCents });
  lines.push({ key: 'permit', label: 'Building permit', detail: 'County permit and plan review', cents: cfg.permitCents });
  return { lines, workCents, permitCents: cfg.permitCents, deltaCents: workCents + cfg.permitCents, oldCents, newCents };
}

/** True when the draft differs from the house the student lives in. */
export const hasChanges = (state, bp) => JSON.stringify(bp) !== JSON.stringify(blueprintBefore(state));

/** Cash left after the renovation, and whether it fits. */
export function afterRenovation(state, bp) {
  const left = cash(state) - renovationQuote(state, bp).deltaCents;
  return { leftCents: left, ok: left >= 0, low: left >= 0 && left < DESIGN.house.lowCashCents };
}

function nextNum(list) {
  return list.reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0) + 1;
}

/** Plants and hens follow the yard: new beds/trees/coops add them, removed ones take theirs away. */
function syncYardLife(s, bp) {
  const home = s.home, mi = s.life.monthIndex;
  const ids = new Set(bp.yard.map((y) => y.id));
  const isYardSpot = (spot) => typeof spot === 'string' && /^y\d+$/.test(spot);
  home.plants = (home.plants ?? []).filter((p) => !isYardSpot(p.spot) || ids.has(p.spot));
  home.animals = (home.animals ?? []).filter((a) => a.kind !== 'chicken' || !isYardSpot(a.spot) || ids.has(a.spot));
  const has = (list, spot) => list.some((x) => x.spot === spot);
  const loc = renovationContext(s).location;
  const seed = seedFor(s.meta.seed, 'build');
  const names = createRng(seedFor(seed, 'renovation-names', mi));
  let p = nextNum(home.plants), a = nextNum(home.animals);
  for (const it of bp.yard) {
    if (it.kind === 'garden-bed' && !has(home.plants, it.id)) home.plants.push({ id: `p${p++}`, kind: 'garden-bed', spot: it.id, alive: true, plantedMonth: mi });
    if (it.kind === 'fruit-tree' && !has(home.plants, it.id)) {
      home.plants.push({ id: `p${p++}`, kind: fruitTreeKind(loc.biome, seedFor(seed, 'tree', p)), spot: it.id, alive: true, plantedMonth: mi });
    }
    if (it.kind === 'coop' && !has(home.animals, it.id)) {
      const hens = names.shuffle(HEN_NAMES);
      for (let i = 0; i < DESIGN.house.hens; i++) home.animals.push({ id: `a${a++}`, kind: 'chicken', name: hens[i % hens.length], spot: it.id, present: true, adoptedMonth: mi });
    }
  }
  const beds = bp.yard.filter((y) => y.kind === 'garden-bed' || y.kind === 'fruit-tree').length;
  home.lifestyle = { ...(home.lifestyle ?? {}), garden: Math.min(2, Math.ceil(beds / 2)) };
}

/**
 * Commit the renovation: validation errors → `{ok: false, errors}`; short on cash → `{ok: false, shortfallCents}`. Else
 * charges every quote line (checking then savings, category 'home-upgrade') at `life.monthIndex`, writes the new
 * blueprint, rooms count and yard life into `home`, rebases the world, back to Live at the same stage. Mutates a draft.
 */
export function commitRenovation(s, bp, { voxHomeFn = null } = {}) {
  if (!s.upgrade) throw new Error('commitRenovation: no upgrade in progress');
  const { errors } = validateBlueprint(bp, renovationContext(s));
  if (errors.length) return { ok: false, errors, shortfallCents: 0, cleared: 0 };
  const q = renovationQuote(s, bp);
  if (q.deltaCents > cash(s)) return { ok: false, errors: [], shortfallCents: q.deltaCents - cash(s), cleared: 0 };
  const month = s.life.monthIndex;
  for (const l of q.lines) {
    const paid = charge(s, ['checking', 'savings'], l.cents, { month, label: `Home renovation: ${l.label}`, category: 'home-upgrade' });
    if (!paid.ok) throw new Error('commitRenovation: charge failed after the cash check');
  }
  const before = s.upgrade.homeBefore;
  const rooms = (t) => bp.rooms.filter((r) => r.type === t).length;
  s.home.blueprint = bp;
  s.home.build = { ...(s.home.build ?? {}), sqft: footprintArea(bp), beds: rooms('bedroom'), baths: rooms('bathroom') };
  syncYardLife(s, bp);
  const cleared = rebaseWorld(s, before, voxHomeFn);
  s.upgrade = null;
  s.phase = 'life';
  return { ok: true, errors: [], shortfallCents: 0, cleared, deltaCents: q.deltaCents };
}
