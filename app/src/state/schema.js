// The save document (02 §2): createInitialState and validateState. Pure module.
import { hashString } from '../util/rng.js';
import { CREDIT, LIFE } from '../config.js';

/** Current save version. Any shape change bumps it and adds a step to migrate.js. */
export const STATE_VERSION = 3;

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
    // The student's block world (13 §7, blocks task 18; world/worldState.js): {homeKey, edits, editCount, pose, hotbar, cleared} or null.
    world: null,
    // An upgrade in progress (13 §7, blocks tasks 20–21): {startedMonth, stage, homeBefore, worldBefore} or null.
    upgrade: null,
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

  errs.push(...worldErrors(state.world), ...upgradeErrors(state.upgrade));

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

/** Problems with `state.world` (13 §7): null, or {homeKey, edits (packed string), editCount, pose, hotbar, cleared}. */
export function worldErrors(w) {
  if (w === null) return [];
  if (!isObj(w)) return ['world must be null or an object'];
  const errs = [];
  if (typeof w.homeKey !== 'string' || !w.homeKey) errs.push('world.homeKey must be a non-empty string');
  if (typeof w.edits !== 'string') errs.push('world.edits must be a packed string');
  if (!isInt(w.editCount) || w.editCount < 0) errs.push('world.editCount must be an integer ≥ 0');
  if (w.pose !== null && !(isObj(w.pose) && ['x', 'y', 'z', 'yaw', 'pitch'].every((k) => isNum(w.pose[k])))) {
    errs.push('world.pose must be null or {x, y, z, yaw, pitch}');
  }
  if (!Array.isArray(w.hotbar) || !w.hotbar.every(isInt)) errs.push('world.hotbar must be an array of block ids');
  if (!isInt(w.cleared) || w.cleared < 0) errs.push('world.cleared must be an integer ≥ 0');
  return errs;
}

/** Problems with `state.upgrade` (13 §7): null, or {startedMonth, stage, homeBefore, worldBefore, blueprint? (task 21 draft)}. */
export function upgradeErrors(u) {
  if (u === null) return [];
  if (!isObj(u)) return ['upgrade must be null or an object'];
  const errs = [];
  if (!isInt(u.startedMonth)) errs.push('upgrade.startedMonth must be an integer');
  if (typeof u.stage !== 'string') errs.push('upgrade.stage must be a string');
  if (u.homeBefore !== undefined && u.homeBefore !== null && !isObj(u.homeBefore)) errs.push('upgrade.homeBefore must be an object');
  if (u.worldBefore !== undefined && u.worldBefore !== null && !isObj(u.worldBefore)) errs.push('upgrade.worldBefore must be null or an object');
  if (u.blueprint !== undefined && u.blueprint !== null && !isObj(u.blueprint)) errs.push('upgrade.blueprint must be null or an object');
  return errs;
}
