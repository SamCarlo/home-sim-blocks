// Phase 4: Life (09 §1–§2, task 42). Money strip on top; the student's home in rotatable 3D on the left with the
// wellbeing card over it; the right panel runs the month state machine (life/monthFlow.js): welcome → plan → live →
// summary → next month. Each stage change saves a checkpoint. The plan stage holds the questions + time budget (task 43,
// questions.js + timeBudgetView.js); the live stage plays "Live this month" (task 45, animation.js) over the 3D view and
// runs finishLive when it ends, with the water-and-feed button's counts (careButton.js, task 46); the summary and, after
// each December, the year in review come from summary.js and yearReview.js (task 47). The investment block
// (investPanel.js, task 48) sits in the plan, live and summary panels once unlocked; while the month plays, the money
// strip's Investments and Net worth figures and the block's totals tick along the month's market path. Task 58 adds
// "Live like this for a year" (life/autopilot.js, recap in autopilotRecap.js) beside "Live this month", and "Find a new
// place to live" (life/relocation.js) on the welcome and plan stages.
import { h } from '../../ui/dom.js';
import { byId } from '../../data/locations/index.js';
import { monthLabel, monthName } from '../../util/dates.js';
import { describeHome } from '../../life/homeDescription.js';
import {
  currentStage, welcomeTitle, recap, canLive, startPlan, setChoice, startLive, finishLive, nextMonth, isYearEnd, finishReview,
} from '../../life/monthFlow.js';
import { renderWellbeingCard } from './wellbeingCard.js';
import { renderMoneyStrip } from './moneyStrip.js';
import { renderQuestions } from './questions.js';
import { renderTimeBudget } from './timeBudgetView.js';
import { timeBudget } from '../../life/timeBudget.js';
import { createAnimation } from './animation.js';
import { createCareGame } from './careButton.js';
import { renderSummary } from './summary.js';
import { renderYearReview } from './yearReview.js';
import { renderInvestPanel } from './investPanel.js';
import { buy, sell, valueAt, monthSeries, totalInvested } from '../../life/investments.js';
import { netWorth } from '../../finance/ledger.js';
import { getFlag } from '../../dev/flags.js';
import { confirmDialog } from '../../ui/modal.js';
import { formatMoney } from '../../finance/money.js';
import { liveYear, finishAutopilot } from '../../life/autopilot.js';
import { canRelocate, startRelocation, moveOutQuote, quoteText } from '../../life/relocation.js';
import { renderAutopilotRecap } from './autopilotRecap.js';

/**
 * The panel for each stage: `(ctx) → Node[]`. ctx = {state, go(fn, checkpoint), store, onUpdate(fn), onTick(fn)}. A panel
 * that registers `onUpdate(fn)` is built once per stage/month and gets `fn(state)` on every later store change;
 * `onTick(fn)` gets `fn(value, series)` on every animation frame of a month with investments (10 §5).
 */
/** The investment block for a stage (null while locked); buys and sells save an 'invest' checkpoint (10 §3). */
function investBlock(state, go, mode, day = 1) {
  return renderInvestPanel({ state, mode,
    onBuy: (key, cents) => go((s) => { buy(s, key, cents, { day }); }, 'invest'),
    onSell: (key, cents) => go((s) => { sell(s, key, cents, { day }); }, 'invest') });
}

/** "Find a new place to live" (task 58): confirms with what moving out costs, then opens Plan. null when not allowed. */
function moveButton(state, go) {
  if (!canRelocate(state)) return null;
  return h('button', { class: 'btn btn-ghost life-move', type: 'button', onClick: async () => {
    const q = moveOutQuote(state);
    const lines = q.lines.map((l) => `${l.label}: ${l.cents >= 0 ? '+' : '−'}${formatMoney(Math.abs(l.cents))}.`).join(' ');
    const ok = await confirmDialog({
      title: 'Find a new place to live?',
      message: 'You keep your job, your money, your credit and your wellbeing. You stay in your home while you look, and '
        + 'you can cancel until a new home says yes. '
        + (q.lines.length ? `When you move out of ${state.home.label}: ${lines} In all: ${quoteText(q.netCents)}.` : ''),
      confirmLabel: 'Start looking',
      cancelLabel: 'Stay here',
    });
    if (ok) go(startRelocation, 'relocation-started');
  } }, 'Find a new place to live');
}

/** "Live like this for a year" (task 58): confirms, then lives up to 12 months at once (life/autopilot.js). */
function yearButton(choices, go) {
  return h('button', { class: 'btn btn-secondary btn-lg life-year', type: 'button', disabled: !canLive(choices),
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'Live like this for a year?',
        message: 'You will live the next 12 months with these answers, all at once. There is no day-by-day view. Your '
          + 'plants and animals get fed every day. It stops early if you miss a rent or mortgage payment.',
        confirmLabel: 'Live the year',
        cancelLabel: 'Not yet',
      });
      if (ok) go((s) => { liveYear(s); }, 'life-autopilot');
    } }, 'Live like this for a year');
}

const PANELS = {
  welcome({ state, go }) {
    const mi = state.life.monthIndex;
    const { line, warnings } = recap(state);
    return [
      h('p', { class: 'life-eyebrow' }, monthLabel(mi)),
      h('h1', { class: 'life-title' }, welcomeTitle(mi)),
      h('p', { class: 'life-recap' }, line),
      warnings.length ? h('ul', { class: 'life-warnings', role: 'list' }, ...warnings.map((w) => h('li', null, w))) : null,
      h('p', { class: 'muted life-note' }, 'Each month you decide how to spend your time, then live it one day at a time. '
        + 'Your choices change your money and your wellbeing.'),
      h('div', { class: 'life-go-row' },
        h('button', { class: 'btn btn-primary btn-lg life-go', type: 'button', onClick: () => go(startPlan, 'life-plan') }, 'Plan my month'),
        moveButton(state, go)),
    ];
  },
  plan({ state, go, store, onUpdate }) {
    const mi = state.life.monthIndex;
    const choices = state.life.current?.choices ?? {};
    const questions = renderQuestions({ state, choices,
      onChoose: (key, value) => store.update((s) => { setChoice(s, key, value); }) });
    const budget = renderTimeBudget(timeBudget(state, choices));
    const live = h('button', { class: 'btn btn-primary btn-lg life-go', type: 'button', disabled: !canLive(choices),
      onClick: () => go(startLive, 'life-live') }, 'Live this month');
    const year = yearButton(choices, go);
    const invest = investBlock(state, go, 'plan');
    onUpdate((s) => {
      const c = s.life.current?.choices ?? {};
      questions.update(c);
      budget.update(timeBudget(s, c));
      live.disabled = !canLive(c);
      year.disabled = !canLive(c);
      invest?.update(s);
    });
    return [
      h('p', { class: 'life-eyebrow' }, `Plan · ${monthLabel(mi)}`),
      h('h1', { class: 'life-title' }, welcomeTitle(mi)),
      questions.el,
      invest?.el,
      moveButton(state, go),
      // The bar and the buttons stay pinned at the bottom of the panel so the bar is in view while answering.
      h('div', { class: 'life-plan-foot' }, budget.el, h('div', { class: 'life-go-row' }, live, year)),
    ];
  },
  live({ state, go, onTick }) {
    const invest = investBlock(state, go, 'live');
    if (invest) onTick(invest.tick);
    return [
      h('p', { class: 'life-eyebrow' }, `Living · ${monthLabel(state.life.monthIndex)}`),
      h('h1', { class: 'life-title' }, `Living ${monthName(state.life.monthIndex)}…`),
      h('p', { class: 'muted life-note' }, 'Watch your month play out day by day. Bills, paychecks and surprises land on '
        + 'their day; the summary comes at the end.'),
      // The animation's controls mount here once the 3D view is ready (startAnimation below).
      h('div', { class: 'life-slot', dataset: { slot: 'live' } }),
      invest?.el,
    ];
  },
  summary({ state, go, onUpdate }) {
    const mi = state.life.monthIndex;
    const invest = investBlock(state, go, 'summary', state.life.current?.plan?.days ?? 28);
    if (invest) onUpdate((s) => invest.update(s));
    return [
      h('p', { class: 'life-eyebrow' }, 'Month summary'),
      h('h1', { class: 'life-title' }, `${monthLabel(mi)} — how it went`),
      h('div', { class: 'life-summary', dataset: { slot: 'summary' } }, ...renderSummary(state)),
      invest?.el,
      h('div', { class: 'life-plan-foot' },
        h('button', { class: 'btn btn-primary btn-lg life-go', type: 'button', onClick: () => go(nextMonth, 'life-month') },
          isYearEnd(mi) ? 'See your year in review' : `Continue to ${monthName(mi + 1)}`)),
    ];
  },
  review({ state, go }) {
    return renderYearReview(state, { onContinue: (text) => go((s) => finishReview(s, text, Date.now()), 'life-month') });
  },
  autopilot({ state, go }) {
    return renderAutopilotRecap(state, { onContinue: (text) => go((s) => finishAutopilot(s, text, Date.now()), 'life-month') });
  },
};

/** Mount the life screen; returns unmount. */
export async function mount(container, { store }) {
  let state = store.getState();
  if (!state.home) {
    container.append(h('section', { class: 'placeholder card' }, h('h1', null, 'Phase 4: Live'), h('p', { class: 'muted' }, 'No home yet.')));
    document.body.dataset.ready = '1';
    return () => { delete document.body.dataset.ready; };
  }
  if (!state.life.current) store.update((s) => { s.life.current = { stage: 'welcome' }; });
  state = store.getState();
  const loc = byId[state.home.locationId];

  const money = renderMoneyStrip(state);
  const wb = renderWellbeingCard(state);
  const desc = h('p', { class: 'sr-only', id: 'life-3d-desc' }, describeHome(state));
  const stage = h('div', { class: 'life-stage', role: 'img', 'aria-describedby': 'life-3d-desc',
    'aria-label': `Your home in ${loc.name}. Drag to rotate, scroll to zoom.` });
  const dayLabel = h('div', { class: 'life-daybar', hidden: true, 'aria-hidden': 'true' }); // calendar strip + day (task 45)
  const panel = h('section', { class: 'life-panel', 'aria-live': 'polite', 'aria-label': 'This month' });
  const root = h('div', { class: 'life' },
    money.el,
    h('div', { class: 'life-main' },
      h('div', { class: 'life-stage-wrap' }, stage, desc, dayLabel, wb.el,
        h('p', { class: 'life-hint' }, 'Drag to look around, scroll to zoom.')),
      panel));
  container.append(root);

  let shownStage = null, shownMonth = null, panelUpdate = null, panelTick = null, anim = null, care = null, viewReady = false, view = null;
  /** Start the month's animation once the live panel and the 3D view (or its failure) are both ready. */
  function startAnimation(s) {
    if (anim || !viewReady || currentStage(s) !== 'live' || !s.life.current.plan) return;
    const slot = panel.querySelector('[data-slot=live]');
    if (!slot) return;
    const reduced = !!s.settings?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    anim = createAnimation({
      plan: s.life.current.plan, choices: s.life.current.choices, view, wrap: stage.parentElement, dayBar: dayLabel, reduced,
      speed: s.settings?.animationSpeed ?? 1, speedFlag: Number(getFlag('speed')) || 1,
      onSpeed: (sp) => store.update((d) => { d.settings.animationSpeed = sp; }),
      onEnd: () => go((d) => { d.life.current.care = care.result(); finishLive(d); }, 'life-summary'),
    });
    care = createCareGame({ plan: s.life.current.plan, anim, wrap: stage.parentElement, settings: s.settings,
      seed: s.meta.seed, flag: getFlag('care') });
    root.dataset.anim = reduced ? 'calendar' : '3d';
    startTicker(s, anim);
    slot.replaceChildren(...[anim.el, care.el].filter(Boolean));
  }
  /** 10 §5 / 09 §9: Investments, Net worth and the block's totals follow the market path, tweened between days. */
  function startTicker(s, a) {
    const { market, days } = s.life.current.plan;
    if (!market || totalInvested(s) <= 0) return;
    const series = monthSeries(s, market, days);
    const netBase = netWorth(s) - totalInvested(s);
    a.onTick(({ index, t, done }) => {
      const pos = done ? days : index + t;
      const v = valueAt(s, market, pos);
      money.tick({ investments: v.valueCents, net: netBase + v.valueCents });
      panelTick?.(v, [...series.slice(0, Math.floor(pos) + 1), v.valueCents]);
    });
  }
  function stopAnimation() {
    care?.dispose();
    care = null;
    anim?.dispose();
    anim = null;
    delete root.dataset.anim;
  }
  function go(fn, checkpoint) {
    store.update((s) => { fn(s); }, { checkpoint });
  }
  function render(s) {
    if (s.phase !== 'life' || !s.life.current) return;
    money.update(s);
    wb.update(s);
    const st = currentStage(s);
    root.dataset.stage = st;
    if (st === shownStage && s.life.monthIndex === shownMonth) {
      panelUpdate?.(s);
      return;
    }
    if (s.life.monthIndex !== shownMonth && shownMonth !== null) view?.scene.setSeason(s.life.monthIndex);
    shownStage = st; shownMonth = s.life.monthIndex; panelUpdate = null; panelTick = null;
    stopAnimation();
    if (st !== 'live') view?.syncHome(s); // wilted plants, departed or new animals (care game, home & garden answer)
    panel.replaceChildren(...PANELS[st]({ state: s, go, store, onUpdate: (fn) => { panelUpdate = fn; },
      onTick: (fn) => { panelTick = fn; } }).filter(Boolean));
    panel.scrollTop = 0;
    startAnimation(s);
  }
  render(state);
  const unsub = store.subscribe((s) => render(s));

  stage.append(h('p', { class: 'life-loading muted' }, 'Loading your home…'));
  try {
    const { createLifeView } = await import('./lifeView.js');
    view = await createLifeView(stage, { state });
  } catch (err) {
    console.warn('3D life view failed', err);
  }
  stage.querySelector('.life-loading')?.remove();
  if (view) await view.firstFrame();
  viewReady = true;
  window.__life = { view: () => view, info: () => view?.info, description: () => desc.textContent, animation: () => anim,
    care: () => care };
  if (view && currentStage(store.getState()) !== 'live') view.syncHome(store.getState());
  startAnimation(store.getState());
  document.body.dataset.ready = '1';
  return () => {
    unsub();
    stopAnimation();
    view?.dispose();
    delete window.__life;
    delete document.body.dataset.ready;
  };
}
