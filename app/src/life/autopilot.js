// "Live like this for a year" (task 58). Pure: no DOM. From the plan stage, lives up to `LIFE.autopilot.months` months
// with the student's answers and no animation, through the same transitions as a played month (monthFlow.js:
// startLive → finishLive → nextMonth). Every plant and animal is cared for (care rate 1). It stops early after a month
// with a missed housing payment, so the student can change course before an eviction (an eviction ends it too: finalizeMonth
// already sent the save back to Plan). Year-in-review stages it passes are closed without a reflection; the recap
// (stage 'autopilot') replaces them. The Easter egg: every run adopts a free black stray cat.
import { LIFE } from '../config.js';
import { createRng, seedFor } from '../util/rng.js';
import { currentStage, canLive, startPlan, startLive, finishLive, nextMonth, finishReview } from './monthFlow.js';

/** Why a run stopped before its last month: 'missed-housing' | 'evicted' | null (lived every month). */
export const STOP_REASONS = ['missed-housing', 'evicted'];

/**
 * Adopt a free black cat (stray: no adoption fee, no food line in monthBills). Names are seeded and unused ones come
 * first. Mutates a store draft → the animal.
 */
export function addBlackCat(s) {
  const animals = s.home.animals ?? (s.home.animals = []);
  const used = new Set(animals.map((a) => a.name));
  const rng = createRng(seedFor(s.meta.seed, 'black-cat', s.life.monthIndex, animals.length));
  const names = rng.shuffle(LIFE.autopilot.blackCatNames);
  const name = names.find((n) => !used.has(n)) ?? names[0];
  const n = animals.reduce((m, a) => Math.max(m, Number(String(a.id).slice(1)) || 0), 0);
  const cat = { id: `a${n + 1}`, kind: 'cat', name, color: LIFE.autopilot.blackCatColor, spot: 'yard', present: true,
    stray: true, adoptedMonth: s.life.monthIndex };
  animals.push(cat);
  return cat;
}

/**
 * Live the year (task 58). Needs the plan stage with every core question answered (else null and nothing changes).
 * Mutates a store draft → `{fromMonth, toMonth, monthsLived, stoppedReason, cat {id, name}}`, also stored on
 * `life.current.autopilot` (stage 'autopilot') unless an eviction already moved the save to Plan.
 */
export function liveYear(s, { months = LIFE.autopilot.months } = {}) {
  if (s.phase !== 'life' || currentStage(s) !== 'plan' || !canLive(s.life.current.choices)) return null;
  const choices = { ...s.life.current.choices };
  const fromMonth = s.life.monthIndex;
  const cat = addBlackCat(s);
  let monthsLived = 0;
  let stoppedReason = null;
  for (let i = 0; i < months; i++) {
    if (i > 0) {
      startPlan(s);
      s.life.current.choices = { ...choices, homeGarden: 'none' }; // the home & garden answer is a one-time purchase
    }
    startLive(s);
    const count = s.life.current.plan.care.count;
    s.life.current.care = { shown: count, hits: count };
    const result = finishLive(s);
    monthsLived += 1;
    if (result.evicted) { stoppedReason = 'evicted'; break; }
    nextMonth(s);
    if (currentStage(s) === 'review') finishReview(s, '');
    if (result.missed.some((m) => m.kind === 'housing')) { stoppedReason = 'missed-housing'; break; }
  }
  const run = { fromMonth, toMonth: fromMonth + monthsLived - 1, monthsLived, stoppedReason, cat: { id: cat.id, name: cat.name } };
  if (s.phase === 'life') s.life.current = { stage: 'autopilot', autopilot: run };
  return run;
}

/** autopilot → welcome: saves the optional reflection like the year in review does. Mutates a store draft. */
export function finishAutopilot(s, text = '', now = 0) {
  if (currentStage(s) !== 'autopilot') throw new Error('finishAutopilot outside the autopilot stage');
  const clean = String(text ?? '').trim().slice(0, LIFE.reflectionMax);
  const run = s.life.current.autopilot ?? {};
  if (clean) {
    s.life.reflections ??= [];
    s.life.reflections.push({ kind: 'autopilot', fromMonth: run.fromMonth, monthIndex: run.toMonth, text: clean, savedAt: now });
  }
  s.life.current = { stage: 'welcome' };
}
