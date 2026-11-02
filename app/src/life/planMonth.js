// planMonth (09 §5, task 44). Pure and deterministic: fixes everything random about the month ahead of time (events,
// market paths, the care schedule) so the animation shows exactly what finalizeMonth charges. Also the month's bills
// (`monthBills`): recurring items in the 09 §6 payment-order groups, seasonal utilities and lifestyle costs.
import { LIFE } from '../config.js';
import { byId } from '../data/locations/index.js';
import { HOME_TYPES_BY_ID } from '../data/homeTypes.js';
import { createRng, seedFor } from '../util/rng.js';
import { daysInMonth } from '../util/dates.js';
import { recurringFor } from '../finance/ledger.js';
import { timeBudget, overtimePayCents, socialCostCents } from './timeBudget.js';
import { pickEvents } from './events.js';
import { marketPaths } from './market.js';

/** The month's seeded generator for one stream: seedFor(meta.seed, 'month', monthIndex, stream). */
export const monthRng = (state, monthIndex, stream) => createRng(seedFor(state.meta.seed, 'month', monthIndex, stream));

/** Living plants / present animals at home. */
export const livingPlants = (home) => (home?.plants ?? []).filter((p) => p.alive !== false);
export const presentAnimals = (home) => (home?.animals ?? []).filter((a) => a.present !== false);

/** Payment-order group of a recurring item (09 §6): 'housing' | 'utilities' | 'living'. */
export function billGroup(item) {
  if (LIFE.housingCategories.includes(item.category)) return 'housing';
  if (LIFE.utilityCategories.includes(item.category)) return 'utilities';
  return 'living';
}

/** Does the home have solar panels? (built homes with solarKw in the blueprint or site utilities) */
function hasSolar(state) {
  return (state.home?.blueprint?.solarKw ?? 0) > 0 || (state.paperwork?.options?.siteUtilities?.solarKw ?? 0) > 0;
}

/** Seasonal utilities extra for the month (09 §6): heat/cool extra × the home type's utility factor, solar trims it. */
export function seasonalUtilityCents(state, monthIndex, location = byId[state.home?.locationId]) {
  const s = location?.living?.utilitiesSeasonal;
  if (!s) return 0;
  const cal = monthIndex % 12;
  let extra = (s.heatMonths?.includes(cal) ? s.heatExtraCents : 0) + (s.coolMonths?.includes(cal) ? s.coolExtraCents : 0);
  const factor = HOME_TYPES_BY_ID[state.home?.kind]?.utilityFactor ?? 1;
  extra = Math.round(extra * factor);
  if (hasSolar(state)) extra = Math.round(extra * (1 - LIFE.solarSeasonalCut));
  return extra;
}

/**
 * The month's bills by payment-order group (09 §6) → `{housing [], utilities [], living [], lifestyle []}`, each
 * `{label, cents, category, source?}` (cents > 0 = to pay). Lifestyle comes from the answers: gym, social, deep
 * practice, pets and garden upkeep, and a one-time adoption from the home & garden answer.
 */
export function monthBills(state, choices, monthIndex = state.life.monthIndex) {
  const loc = byId[state.home?.locationId];
  const out = { housing: [], utilities: [], living: [], lifestyle: [] };
  for (const r of recurringFor(state, monthIndex)) {
    out[billGroup(r)].push({ label: r.label, cents: r.amountCents, category: r.category, source: r.source });
  }
  const seasonal = seasonalUtilityCents(state, monthIndex, loc);
  if (seasonal) out.utilities.push({ label: 'Seasonal heating/cooling', cents: seasonal, category: 'utilities' });
  const life = out.lifestyle;
  const push = (label, cents, category = 'lifestyle') => { if (cents > 0) life.push({ label, cents, category }); };
  if ((choices.exercise ?? 0) >= LIFE.gymMinExerciseHours) push('Gym membership', loc?.living?.gymMonthlyCents ?? 0);
  push('Going out with friends', socialCostCents(state, choices.social, loc));
  push('Books, supplies and classes', LIFE.deepPracticeCostCents[choices.deepPractice] ?? 0);
  // Strays (the year fast-forward's black cats, task 58) feed themselves: no food line.
  const kinds = new Set(presentAnimals(state.home).filter((a) => !a.stray).map((a) => a.kind));
  if (choices.homeGarden === 'cat') kinds.add('cat');
  if (choices.homeGarden === 'chickens') kinds.add('chicken');
  for (const k of kinds) push(`${k === 'chicken' ? 'Chicken' : k[0].toUpperCase() + k.slice(1)} food and care`,
    LIFE.petMonthlyCents[k === 'chicken' ? 'chickens' : k] ?? 0, 'pets');
  const garden = livingPlants(state.home).some((p) => p.kind === 'garden-bed') || choices.homeGarden === 'garden';
  if (garden) push('Garden supplies', LIFE.gardenMonthlyCents, 'garden');
  const adopt = LIFE.adoptCents[choices.homeGarden];
  if (adopt) push({ garden: 'New garden bed or pots', cat: 'Adopting a cat', chickens: 'Three chickens and feed' }[choices.homeGarden], adopt, 'pets');
  return out;
}

/** The care schedule (09 §10): `count` appearances, one per equal slice of the month, jittered and seeded. */
function careSchedule(rng, count, days) {
  return Array.from({ length: count }, (_, i) => {
    const fraction = (i + rng.float(0.15, 0.85)) / count;
    return { day: Math.min(days, Math.max(1, Math.ceil(fraction * days))), fraction };
  });
}

/**
 * Plan the month (09 §5) → `{monthIndex, days, hours, income {paycheckCents, overtimeCents}, events, market, care}`.
 * Deterministic for a state + choices.
 */
export function planMonth(state, choices) {
  const monthIndex = state.life.monthIndex;
  const days = daysInMonth(monthIndex);
  const home = state.home ?? {};
  const location = byId[home.locationId];
  const events = pickEvents({ state, location, home, monthIndex, choices }, monthRng(state, monthIndex, 'events'));
  const needed = livingPlants(home).length + presentAnimals(home).length > 0
    || (choices.homeGarden && choices.homeGarden !== 'none');
  const count = needed ? LIFE.careAppearances : 0;
  return {
    monthIndex, days,
    hours: timeBudget(state, choices),
    income: { paycheckCents: state.player?.netMonthlyIncomeCents ?? 0, overtimeCents: overtimePayCents(state, choices.extraWork) },
    events,
    market: marketPaths(state, monthIndex, days),
    care: { needed: !!needed, count, schedule: careSchedule(monthRng(state, monthIndex, 'care'), count, days) },
  };
}
