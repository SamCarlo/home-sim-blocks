// The save document (02 §2): createInitialState and validateState. Pure module.
import { hashString } from '../util/rng.js';
import { CREDIT, LIFE } from '../config.js';

/** Current save version. Any shape change bumps it and adds a step to migrate.js. */
export const STATE_VERSION = 2;

/** Valid values of state.phase. */
export const PHASES = ['intake', 'plan', 'paperwork', 'design', 'life'];
/** Valid values of state.life.current.stage (09 §2). */
export const LIFE_STAGES = ['welcome', 'plan', 'live', 'summary', 'review', 'autopilot'];
const WELLBEING_KEYS = ['physical', 'purpose', 'financial', 'social', 'mental'];

/** A fresh paperwork attempt (02 §2), used by a new save and by choosing a home (04 §6). */
export const freshPaperwork = () => ({ steps: {}, options: {}, letterIds: [], decisions: [], committed: false });

/** A brand-new save for an account (02 §2). meta.seed = hashString(uid), fixed forever. */
export function createInitialState({ uid, username = '', classCode = '', now = 0 } = {}) {
  const wb = LIFE.wellbeing.start;
  return {
    version: STATE_VERSION,
    meta: { createdAt: now, updatedAt: now, saveCount: 0, seed: hashString(uid ?? username) },
    account: { username, classCode },
    player: {
      characterName: username,
      jobTitle: '',
      netMonthlyIncomeCents: 0,
      weeklyJobHours: 40,
      startingSavingsCents: 0,
    },
    phase: 'intake',
    plan: { expanded: null, hideUnaffordable: false, attempts: [] },
    choice: null,
    paperwork: freshPaperwork(),
    letters: {},
    finances: {
      checkingCents: 0,
      savingsCents: 0,
      creditCard: null,
      loans: [],
      investments: {
        low: { valueCents: 0, basisCents: 0 },
        medium: { valueCents: 0, basisCents: 0 },
        high: { valueCents: 0, basisCents: 0 },
      },
      recurring: [],
      transactions: [],
      monthTotals: [],
      agreements: [],
      applications: [],
      credit: { score: CREDIT.startingScore, history: [], inquiries: [], onTimeStreak: 0, missedPayments: 0, lateHousingStreak: 0 },
    },
    home: null,
    // Looking for a new home from Phase 4 (life/relocation.js): {startedMonth, stage, from, movedOut?, pets?} or null.
    relocation: null,
    life: {
      monthIndex: 0,
      current: null,
      history: [],
      wellbeing: Object.fromEntries(WELLBEING_KEYS.map((k) => [k, wb])),
      investUnlocked: false,
      reflections: [],
    },
    settings: { theme: 'system', reducedMotion: false, longCareWindow: false, animationSpeed: 1 },
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** List the problems with a state (empty array = valid). Checks shape, enums and integer cents. */
export function validateState(state) {
  const errs = [];
  if (!isObj(state)) return ['state is not an object'];
  if (state.version !== STATE_VERSION) errs.push(`version must be ${STATE_VERSION} (got ${state.version})`);

  const { meta, account, player, plan, paperwork, finances, life, settings } = state;
  if (!isObj(meta)) errs.push('meta missing');
  else for (const k of ['createdAt', 'updatedAt', 'saveCount', 'seed']) if (!isNum(meta[k])) errs.push(`meta.${k} must be a number`);
  if (!isObj(account)) errs.push('account missing');
  if (!PHASES.includes(state.phase)) errs.push(`phase "${state.phase}" is not one of ${PHASES.join('|')}`);

  if (!isObj(player)) errs.push('player missing');
  else {
    for (const k of ['netMonthlyIncomeCents', 'startingSavingsCents']) if (!isInt(player[k])) errs.push(`player.${k} must be integer cents`);
    if (!isNum(player.weeklyJobHours)) errs.push('player.weeklyJobHours must be a number');
  }
  if (!isObj(plan) || !Array.isArray(plan.attempts)) errs.push('plan.attempts must be an array');
  if (state.choice !== null && !(isObj(state.choice) && state.choice.locationId && state.choice.homeTypeId)) {
    errs.push('choice must be null or { locationId, homeTypeId, … }');
  }
  if (!isObj(paperwork) || !isObj(paperwork.steps) || !Array.isArray(paperwork.decisions)) errs.push('paperwork malformed');
  if (!isObj(state.letters)) errs.push('letters must be an object');

  if (!isObj(finances)) errs.push('finances missing');
  else {
    for (const k of ['checkingCents', 'savingsCents']) if (!isInt(finances[k])) errs.push(`finances.${k} must be integer cents`);
    for (const k of ['loans', 'recurring', 'transactions', 'monthTotals', 'agreements', 'applications']) {
      if (!Array.isArray(finances[k])) errs.push(`finances.${k} must be an array`);
    }
    for (const k of ['low', 'medium', 'high']) {
      const inv = finances.investments?.[k];
      if (!isObj(inv) || !isInt(inv.valueCents) || !isInt(inv.basisCents)) errs.push(`finances.investments.${k} malformed`);
    }
    if (!isObj(finances.credit) || !isNum(finances.credit.score)) errs.push('finances.credit.score must be a number');
    if (finances.creditCard !== null && !(isObj(finances.creditCard) && isInt(finances.creditCard.balanceCents))) {
      errs.push('finances.creditCard must be null or have integer balanceCents');
    }
    (finances.transactions || []).forEach((t, i) => { if (!isInt(t?.amountCents)) errs.push(`finances.transactions[${i}].amountCents must be integer cents`); });
  }
  if (state.home !== null && !isObj(state.home)) errs.push('home must be null or an object');
  if (state.relocation !== null && !(isObj(state.relocation) && isInt(state.relocation.startedMonth))) {
    errs.push('relocation must be null or have an integer startedMonth');
  }

  if (!isObj(life)) errs.push('life missing');
  else {
    if (!isInt(life.monthIndex) || life.monthIndex < 0) errs.push('life.monthIndex must be an integer ≥ 0');
    if (life.current !== null && !(isObj(life.current) && LIFE_STAGES.includes(life.current.stage))) {
      errs.push(`life.current must be null or have stage ${LIFE_STAGES.join('|')}`);
    }
    if (!Array.isArray(life.history)) errs.push('life.history must be an array');
    if (life.reflections !== undefined && !Array.isArray(life.reflections)) errs.push('life.reflections must be an array');
    for (const k of WELLBEING_KEYS) if (!isNum(life.wellbeing?.[k])) errs.push(`life.wellbeing.${k} must be a number`);
  }
  if (!isObj(settings)) errs.push('settings missing');
  return errs;
}
