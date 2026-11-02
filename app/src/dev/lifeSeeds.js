// Phase 4 life seeds (09 §12, task 42+): a design seed run through its real Move in, so the state is exactly what the
// design phase leaves behind (home, plants, animals, lifestyle, life month 0 at 'welcome', phase 'life').
// seeds.js calls addLifeSeeds(seeds) after addDesignSeeds (a function, to avoid an import cycle).
import { buildingOptions, moveIn } from '../phases/design/apartmentModel.js';
import { moveInHouse } from '../phases/design/houseModel.js';
import { sharedOptions, moveInShared } from '../phases/design/sharedModel.js';
import { moveInBuild } from '../phases/design/blueprint/moveIn.js';
import { addYardItem } from '../phases/design/blueprint/yard.js';
import { startPlan, setChoice, startLive, finishLive, nextMonth } from '../life/monthFlow.js';
import { buy } from '../life/investments.js';
import { startRelocation } from '../life/relocation.js';
import { liveYear } from '../life/autopilot.js';

/** Fail loudly when a seed's Move in refuses (a seed that silently stays in design would hide bugs). */
function ok(result, name) {
  if (!result.ok) throw new Error(`${name}: move in refused ${JSON.stringify(result)}`);
}

/** Apartment/condo: first building, a middle floor, unit 0, `plants` pots. */
function unitMoveIn(seeds, from, name, plants) {
  return (now) => {
    const s = seeds[from].build(now);
    const o = buildingOptions(s)[0];
    const floor = o.floors[Math.floor(o.floors.length / 2)];
    ok(moveIn(s, { index: 0, floor, unit: 0, plants }), name);
    return s;
  };
}

/** Live `n` whole months with the default answers and `care` counts; stops in the last month's summary. */
function liveMonths(s, n, care = { shown: 4, hits: 4 }) {
  for (let i = 0; i < n; i++) {
    if (i) nextMonth(s);
    startPlan(s);
    startLive(s);
    s.life.current.care = { ...care };
    finishLive(s);
  }
  return s;
}

/** Register the life-phase seeds on the seeds registry. */
export function addLifeSeeds(seeds) {
  seeds['life-month1-apartment'] = { phase: 'life',
    description: 'Hilo apartment, January 2033 welcome: a middle-floor walk-up unit with two potted plants.',
    build: unitMoveIn(seeds, 'design-apartment-hilo', 'life-month1-apartment', 2) };
  seeds['life-month1-condo'] = { phase: 'life',
    description: 'Miami condo, January 2033 welcome: a middle floor of a glass tower, one potted plant.',
    build: unitMoveIn(seeds, 'design-condo-miami', 'life-month1-condo', 1) };
  seeds['life-month1-shared'] = { phase: 'life',
    description: 'Honolulu shared house, January 2033 welcome: the first room, two roommates, one potted plant.',
    build: (now) => {
      const s = seeds['design-shared-honolulu'].build(now);
      const o = sharedOptions(s)[0];
      ok(moveInShared(s, { index: 0, roomId: o.rooms[0].id, plants: 1 }), 'life-month1-shared');
      return s;
    } };
  seeds['life-month1-house'] = { phase: 'life',
    description: 'Katy house, January 2033 welcome: a garden bed, a coop with three hens and a cat.',
    build: (now) => {
      const s = seeds['design-house-katy'].build(now);
      ok(moveInHouse(s, { index: 0, gardenBeds: 1, fruitTrees: 0, coop: true, pet: 'cat' }), 'life-month1-house');
      return s;
    } };
  seeds['life-month1-build'] = { phase: 'life',
    description: 'Pāhoa blueprint home (Cozy template), January 2033 welcome: two garden beds and a coop.',
    build: (now) => {
      const s = seeds['design-build-template'].build(now);
      let bp = s.home.blueprint;
      for (const kind of ['garden-bed', 'garden-bed', 'coop']) bp = addYardItem(bp, kind);
      ok(moveInBuild(s, bp), 'life-month1-build');
      return s;
    } };
  seeds['life-plan-filled'] = { phase: 'life',
    description: 'Hilo apartment, January 2033 plan stage with every question answered (4 h exercise, a few shifts, '
      + 'some socializing, most days of deep practice).',
    build: (now) => {
      const s = seeds['life-month1-apartment'].build(now);
      startPlan(s);
      for (const [k, v] of Object.entries({ exercise: 4, extraWork: 8, social: 7, deepPractice: 4, homeGarden: 'none' })) setChoice(s, k, v);
      return s;
    } };
  seeds['life-live-house'] = { phase: 'life',
    description: 'The house seed in the live stage of January 2033 (plan answered, planMonth run): "Live this month" '
      + 'plays on load. Add ?speed=20 to run the month in about two seconds.',
    build: (now) => {
      const s = seeds['life-month1-house'].build(now);
      startPlan(s);
      for (const [k, v] of Object.entries({ exercise: 4, extraWork: 0, social: 7, deepPractice: 4, homeGarden: 'none' })) setChoice(s, k, v);
      startLive(s);
      return s;
    } };
  seeds['life-summary'] = { phase: 'life',
    description: 'Katy house, January 2033 summary: one month lived with the default answers and every care button hit.',
    build: (now) => liveMonths(seeds['life-month1-house'].build(now), 1) };
  seeds['life-overdue'] = { phase: 'life',
    description: 'Hilo apartment, February 2033 summary after two missed rent payments in a row (income cut to $500, no '
      + 'savings): the final notice.',
    build: (now) => {
      const s = seeds['life-month1-apartment'].build(now);
      s.player.netMonthlyIncomeCents = 50000;
      s.finances.checkingCents = 0;
      s.finances.savingsCents = 0;
      return liveMonths(s, 2);
    } };
  seeds['life-year-review'] = { phase: 'life',
    description: 'Hilo apartment, December 2033 just finished: twelve months lived, the year in review is up.',
    build: (now) => {
      const s = liveMonths(seeds['life-month1-apartment'].build(now), 12);
      nextMonth(s);
      return s;
    } };
  seeds['life-invest'] = { phase: 'life',
    description: 'Katy house, January 2033 plan stage with $29,480 saved: investing just unlocked, nothing invested yet (the intro card).',
    build: (now) => { const s = seeds['life-month1-house'].build(now); startPlan(s); return s; } };
  /** Katy house: $4,000 medium + $6,000 high bought in January, January lived; stops in February's plan. */
  const held = (now) => {
    const s = seeds['life-invest'].build(now);
    buy(s, 'medium', 400000);
    buy(s, 'high', 600000);
    startLive(s);
    s.life.current.care = { shown: 4, hits: 4 };
    finishLive(s);
    nextMonth(s);
    startPlan(s);
    return s;
  };
  seeds['life-invest-held'] = { phase: 'life',
    description: 'Katy house, February 2033 plan stage holding medium and high risk investments after one month of growth.',
    build: held };
  seeds['life-invest-live'] = { phase: 'life',
    description: 'Katy house, February 2033 live stage with investments: the money strip and the block tick along the market path.',
    build: (now) => { const s = held(now); startLive(s); return s; } };
  // Task 58: moving from Live, and the year on autopilot.
  seeds['life-relocating'] = { phase: 'plan',
    description: 'Hilo apartment after three months (April 2033): "Find a new place to live" pressed, so Plan shows the '
      + 'moving bar (lease break fee, deposit back) with Cancel and go home.',
    build: (now) => { const s = liveMonths(seeds['life-month1-apartment'].build(now), 3); nextMonth(s); startRelocation(s); return s; } };
  seeds['life-relocating-house'] = { phase: 'plan',
    description: 'Katy house after three months (April 2033), looking for a new place: the bar shows the sale (selling '
      + 'costs, mortgage payoff) and Plan counts it as cash.',
    build: (now) => { const s = liveMonths(seeds['life-month1-house'].build(now), 3); nextMonth(s); startRelocation(s); return s; } };
  seeds['life-autopilot-done'] = { phase: 'life',
    description: 'Hilo apartment after "Live like this for a year" from the January plan: the recap of 12 months and '
      + 'the free black cat.',
    build: (now) => { const s = seeds['life-plan-filled'].build(now); liveYear(s); return s; } };
}
