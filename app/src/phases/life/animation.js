// "Live this month" (09 §9, task 45). Plays the month planned by planMonth day by day: per-day `setTimeOfDay`, the
// character leaving and coming home (weekday/weekend routine from life/timeline.js), a calendar strip + day label over
// the 3D view, event toasts on their day, 1×/2×/4× and Pause, and the reduced-motion calendar grid (no sun or camera
// motion; one day fills in every `LIFE.reducedMotionDayMs`). Hooks: `onDay(fn)`, `onTick(fn)` (care game, task 46;
// investment ticker, task 48), `onSeek(fn)` and `holdEnd(fn)` (the care game keeps the month open while a button is up). Calls `onEnd()` once after the last day; the screen then runs finishLive.
import { h } from '../../ui/dom.js';
import { LIFE, LIFE3D } from '../../config.js';
import { buildTimeline, momentAt, placeAt } from '../../life/timeline.js';

const GRID_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * createAnimation({plan, choices, view, wrap, dayBar, reduced, speed, speedFlag, onSpeed, onEnd}) → `{el, timeline,
 * setSpeed, pause, resume, paused, moment, onDay(fn), onTick(fn), dispose}`. `view` = createLifeView's handle or null
 * (no WebGL: the calendar and toasts still play). `wrap` = the stage wrapper the overlays go into; `dayBar` = the
 * `.life-daybar` slot. `speedFlag` (?speed=) multiplies every speed (tests).
 */
export function createAnimation({ plan, choices = {}, view = null, wrap, dayBar, reduced = false, speed = 1, speedFlag = 1,
  onSpeed, onEnd }) {
  const tl = buildTimeline(plan, choices);
  const n = tl.days.length;
  const dayMs = reduced ? LIFE.reducedMotionDayMs : LIFE.dayMs;
  const flag = speedFlag > 0 ? speedFlag : 1;
  let mult = LIFE.speeds.includes(speed) ? speed : 1;
  let paused = false, ms = 0, last = 0, raf = 0, shown = -1, ended = false, disposed = false, realS = 0;
  let moment = momentAt(tl, 0, dayMs);
  const dayHooks = new Set(), tickHooks = new Set(), seekHooks = new Set(), holds = new Set();

  // ── Overlays: day label + calendar strip, toasts, reduced-motion grid ──
  const label = h('span', { class: 'life-daylabel' });
  const strip = h('ol', { class: 'life-strip', 'aria-hidden': 'true' }, ...tl.days.map((d) => h('li', {
    class: `life-strip-day${d.weekend ? ' weekend' : ''}${d.events.length ? ' has-event' : ''}`, dataset: { day: d.day } })));
  dayBar.replaceChildren(...(reduced ? [label] : [label, strip]));
  dayBar.hidden = false;
  const toasts = h('div', { class: 'life-toasts', role: 'status', 'aria-live': 'polite' });
  wrap.append(toasts);
  let grid = null;
  if (reduced) {
    const lead = tl.days[0].weekday;
    grid = h('div', { class: 'life-calgrid', role: 'grid', 'aria-label': 'This month, one day at a time' },
      ...GRID_DAYS.map((d) => h('div', { class: 'life-calgrid-head', role: 'columnheader' }, d)),
      ...Array.from({ length: lead }, () => h('div', { class: 'life-calgrid-pad' })),
      ...tl.days.map((d) => h('div', { class: `life-calgrid-day${d.weekend ? ' weekend' : ''}`, role: 'gridcell',
        dataset: { day: d.day } }, h('span', { class: 'life-calgrid-num' }, String(d.day)))));
    wrap.append(grid);
  }

  // ── Controls (mounted by the screen into the live panel) ──
  const speedBtns = LIFE.speeds.map((s) => h('button', { class: 'btn btn-small life-speed', type: 'button', dataset: { speed: s },
    'aria-pressed': String(s === mult), onClick: () => api.setSpeed(s) }, `${s}×`));
  const pauseBtn = h('button', { class: 'btn btn-small life-pause', type: 'button', onClick: () => (paused ? api.resume() : api.pause()) }, 'Pause');
  const progressText = h('span', { class: 'life-anim-day' });
  const bar = h('span', { class: 'life-anim-fill' });
  const el = h('div', { class: 'life-anim', dataset: { mode: reduced ? 'calendar' : '3d' } },
    h('div', { class: 'life-anim-row' },
      h('div', { class: 'life-anim-speeds', role: 'group', 'aria-label': 'Animation speed' }, ...speedBtns), pauseBtn),
    h('div', { class: 'life-anim-progress', 'aria-hidden': 'true' }, bar),
    progressText);

  function toast(ev) {
    const t = h('div', { class: `life-toast${ev.amountCents < 0 ? ' cost' : ev.amountCents > 0 ? ' gain' : ''}` }, ev.toast);
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    setTimeout(() => t.remove(), LIFE.toastMs);
  }

  /** A new day starts: label, strip, grid cell, toasts, day hooks. */
  function enterDay(i) {
    const d = tl.days[i];
    label.textContent = d.label;
    progressText.textContent = `Day ${d.day} of ${n}`;
    strip.children[i]?.classList.add('today');
    strip.children[i - 1]?.classList.replace('today', 'past');
    if (grid) {
      const cell = grid.querySelector(`[data-day="${d.day}"]`);
      grid.querySelector('.today')?.classList.remove('today');
      cell.classList.add('filled', 'today');
      for (const ev of d.events) cell.append(h('span', { class: `life-calgrid-ev${ev.amountCents < 0 ? ' cost' : ''}` }, ev.toast));
    }
    for (const ev of d.events) toast(ev);
    for (const fn of dayHooks) fn(d, i);
  }

  // ── 3D: sun, window glow, character routine, plants and animals ──
  const sc = view?.scene, home = view?.home, ch = home?.character;
  const homePos = ch?.object.position.clone();
  const out = home ? (home.path.length > 1 ? home.path.slice(1) : [home.exit]) : [];
  const back = home ? [...home.path.slice(0, -1).reverse(), homePos] : [];
  // Weekend time at home happens on the front lawn/porch, in view (plant spots often sit behind the house or up on a balcony).
  // The block view gives its own `yard` point (a walkable path cell); classic offsets from the door in feet.
  const yard = home ? (home.yard?.clone() ?? homePos.clone().add(new homePos.constructor(...LIFE3D.yardOffset))) : null;
  let place = 'inside', walkId = 0;
  if (ch && !reduced) ch.setVisible(false);

  function walk(points, then) {
    const id = ++walkId;
    ch.walkTo(points, LIFE.routine.walkDay * dayMs).then((ok) => { if (ok && id === walkId) then?.(); });
  }
  function moveTo(next) {
    const prev = place;
    place = next;
    if (next === 'out') {
      if (prev === 'inside') { ch.object.position.copy(homePos); ch.setVisible(true); }
      walk(out, () => ch.setVisible(false));
      return;
    }
    if (next === 'inside') {
      if (!ch.object.visible) { ch.object.position.copy(homePos); return; }
      walk([homePos], () => ch.setVisible(false));
      return;
    }
    if (prev === 'inside') { ch.object.position.copy(homePos); ch.setVisible(true); }
    if (prev === 'out') { ch.object.position.copy(home.exit); ch.setVisible(true); }
    const route = prev === 'out' ? back.slice() : [];
    if (next === 'yard' && yard) route.push(yard);
    if (route.length) walk(route);
  }
  function drive3d(m, gameS) {
    sc.setTimeOfDay(m.t);
    view.refreshNight();
    const want = placeAt(tl.days[m.index], m.t);
    if (want !== place) moveTo(want);
    ch.update(gameS);
    home.plants.forEach((p, i) => { p.object.rotation.z = Math.sin(realS * 1.6 + i) * 0.04; });
    for (const a of home.animals) a.object.userData.idle?.(realS);
  }
  function restore3d() {
    if (!view) return;
    walkId++;
    ch.setVisible(true);
    ch.object.position.copy(homePos);
    sc.setTimeOfDay(LIFE3D.idleTimeOfDay);
    view.refreshNight();
  }

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const realDt = last ? Math.min(100, now - last) : 0;
    last = now;
    realS += realDt / 1000;
    const gameDt = paused ? 0 : realDt * mult * flag;
    ms += gameDt;
    moment = momentAt(tl, ms, dayMs);
    while (shown < moment.index) enterDay(++shown); // never skip a day's events at high speed
    bar.style.width = `${Math.min(100, (ms / (dayMs * n)) * 100)}%`;
    if (view && !reduced) drive3d(moment, gameDt / 1000);
    for (const fn of tickHooks) fn({ ...moment, ms, paused, plan });
    if (moment.done && !ended && ![...holds].some((f) => f())) {
      ended = true;
      cancelAnimationFrame(raf);
      restore3d();
      onEnd?.();
    }
  }

  const api = {
    el,
    timeline: tl,
    get paused() { return paused; },
    get moment() { return moment; },
    get speed() { return mult; },
    /** Game ms per real ms (speed × ?speed flag); 0 while paused. */
    get rate() { return paused ? 0 : mult * flag; },
    dayMs,
    /** 1 | 2 | 4 (LIFE.speeds). */
    setSpeed(s) {
      if (!LIFE.speeds.includes(s)) return;
      mult = s;
      for (const b of speedBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s));
      onSpeed?.(s);
    },
    /** Jump forward to `t` (0..1) of `day` (tests and screenshots; earlier days' events still fire on the way). */
    seek(day, t = 0) {
      ms = Math.max(ms, ((day - 1) + t) * dayMs);
      for (const fn of seekHooks) fn(ms);
    },
    pause() { paused = true; pauseBtn.textContent = 'Play'; el.dataset.paused = '1'; },
    resume() { paused = false; pauseBtn.textContent = 'Pause'; delete el.dataset.paused; },
    /** fn(dayEntry, index) at the start of each day. Returns unsubscribe. */
    onDay(fn) { dayHooks.add(fn); return () => dayHooks.delete(fn); },
    /** fn({index, day, t, done, ms, paused, plan}) every frame (investment ticker). Returns unsubscribe. */
    onTick(fn) { tickHooks.add(fn); return () => tickHooks.delete(fn); },
    /** fn(ms) after a seek (the care game skips what was jumped over). Returns unsubscribe. */
    onSeek(fn) { seekHooks.add(fn); return () => seekHooks.delete(fn); },
    /** While any `fn()` returns true the month doesn't end (a care button still up). Returns unsubscribe. */
    holdEnd(fn) { holds.add(fn); return () => holds.delete(fn); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      if (!ended) restore3d();
      toasts.remove();
      grid?.remove();
      dayBar.replaceChildren();
      dayBar.hidden = true;
      dayHooks.clear(); tickHooks.clear(); seekHooks.clear(); holds.clear();
    },
  };
  raf = requestAnimationFrame(frame);
  return api;
}
