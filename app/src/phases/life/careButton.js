// The water-and-feed button (09 §10, task 46). During "Live this month" the button pops up `plan.care.count` times at
// seeded spots over the 3D view. Each stays up for a fixed stretch of real time (2.5 s, or 5 s with the longer-window
// setting) whatever the speed; the schedule is re-timed every frame from life/care.js careWindows, so a speed change
// or a seek moves the rest. Click or press W to count it; a hit splashes and is announced. While a button is up the
// animation holds its last day so the window can close. `?care=hit|miss|half` resolves it with no buttons (tests).
import { h } from '../../ui/dom.js';
import { createRng, seedFor } from '../../util/rng.js';
import { CARE_TEXT, careWindows, careWindowMs, careAutoResult, careSpot } from '../../life/care.js';

const SPLASH_MS = 700;
// The free part of the stage: clear of the day bar (top left), the wellbeing card (right), toasts and hint (bottom).
const SAFE = { left: 16, top: 72, right: 292, bottom: 130 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * createCareGame({plan, anim, wrap, view, settings, seed, flag}) → `{el, result() → {shown, hits}, dispose}`. `anim` =
 * createAnimation's handle, `wrap` = the stage wrapper the button goes over, `seed` = state.meta.seed, `flag` = ?care=. `view` (optional) = the block view; its `careAnchor(fx)` places
 * each button beside a plant or animal.
 * `el` (the tally) goes in the live panel; null when the home has nothing to care for.
 */
export function createCareGame({ plan, anim, wrap, view = null, settings = {}, seed = 'care', flag = null }) {
  const count = plan.care?.needed ? plan.care.count : 0;
  if (!count) return { el: null, result: () => ({ shown: 0, hits: 0 }), dispose() {} };
  const auto = careAutoResult(flag, count);
  const tallyNum = h('strong', { class: 'life-care-num' });
  const el = h('div', { class: 'life-care', dataset: auto ? { auto: flag } : null },
    h('span', { class: 'life-care-icon', 'aria-hidden': 'true' }, '💧'),
    h('span', null, 'Plants & animals cared for: ', tallyNum),
    h('span', { class: 'muted life-care-key' }, 'Press W or click the button when it pops up.'));
  if (auto) {
    tallyNum.textContent = `${auto.hits} of ${auto.shown}`;
    return { el, result: () => ({ ...auto }), dispose() {} };
  }

  const windowMs = careWindowMs(settings);
  const monthGameMs = anim.timeline.days.length * anim.dayMs;
  const apps = (plan.care.schedule ?? []).slice(0, count).map((c, index) => ({
    index, gameMs: c.fraction * monthGameMs, status: 'pending', btn: null, closesAt: 0,
    spot: careSpot(createRng(seedFor(seed, 'care-spot', plan.monthIndex, index))),
  }));
  const layer = h('div', { class: 'life-care-layer' });
  const say = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  wrap.append(layer, say);
  let lastReal = performance.now(), gameMs = 0;

  const shown = () => apps.filter((a) => a.status === 'open' || a.status === 'hit' || a.status === 'missed').length;
  const hits = () => apps.filter((a) => a.status === 'hit').length;
  function tally() { tallyNum.textContent = `${hits()} of ${shown()}`; }
  tally();

  function open(a, now) {
    a.status = 'open';
    a.closesAt = now + windowMs;
    const { width, height } = wrap.getBoundingClientRect();
    const w = Math.min(300, Math.max(160, width - SAFE.left - SAFE.right));
    let x = SAFE.left + a.spot.fx * Math.max(0, width - SAFE.left - SAFE.right - w);
    let y = SAFE.top + a.spot.fy * Math.max(0, height - SAFE.top - SAFE.bottom - 72);
    // Block view: pop up next to the plant or animal the spot picks (projected), kept inside the free area.
    const at = view?.careAnchor?.(a.spot.fx);
    if (at) {
      const r = wrap.getBoundingClientRect();
      x = clamp(at.x - r.left - w / 2, SAFE.left, Math.max(SAFE.left, width - SAFE.right - w));
      y = clamp(at.y - r.top - 72, SAFE.top, Math.max(SAFE.top, height - SAFE.bottom - 72));
      a.anchored = true;
      // Two buttons up at once can pick the same spot: step this one clear of the others.
      const taken = apps.filter((o) => o !== a && o.btn).map((o) => parseFloat(o.btn.style.top));
      const lo = SAFE.top, hi = Math.max(SAFE.top, height - SAFE.bottom - 72);
      const free = [0, 84, -84, 168, -168, 252, -252].map((d) => y + d).find((c) => c >= lo && c <= hi && !taken.some((t) => Math.abs(t - c) < 80));
      if (free != null) y = free;
    }
    a.btn = h('button', { class: 'life-care-btn', type: 'button', dataset: a.anchored ? { index: a.index, anchored: '1' } : { index: a.index },
      style: `left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.round(w)}px`,
      onClick: () => hit(a) }, CARE_TEXT);
    layer.append(a.btn);
    say.textContent = `${CARE_TEXT} Press W.`;
    tally();
  }
  function close(a) {
    a.status = 'missed';
    a.btn?.remove();
    a.btn = null;
    tally();
  }
  function hit(a) {
    if (a.status !== 'open') return;
    a.status = 'hit';
    const { left, top } = a.btn.style;
    a.btn.remove();
    a.btn = null;
    const splash = h('div', { class: 'life-care-splash', style: `left:${left};top:${top}`, 'aria-hidden': 'true' },
      ...Array.from({ length: 6 }, (_, i) => h('span', { class: 'life-care-drop', style: `--i:${i}` })),
      h('span', { class: 'life-care-done' }, 'Watered and fed!'));
    layer.append(splash);
    setTimeout(() => splash.remove(), SPLASH_MS);
    say.textContent = 'Watered and fed!';
    tally();
  }
  function onKey(e) {
    if (e.key !== 'w' && e.key !== 'W') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const first = apps.filter((a) => a.status === 'open').sort((a, b) => a.closesAt - b.closesAt)[0];
    if (first) { e.preventDefault(); hit(first); }
  }
  document.addEventListener('keydown', onKey);

  const offTick = anim.onTick(({ ms, paused }) => {
    const now = performance.now();
    const dt = now - lastReal;
    lastReal = now;
    gameMs = ms;
    const live = apps.filter((a) => a.status === 'open');
    for (const a of live) {
      if (paused) a.closesAt += dt; // paused: the window waits too
      else if (now >= a.closesAt) close(a);
    }
    const busyUntil = Math.max(0, ...apps.filter((a) => a.status === 'open').map((a) => a.closesAt - now));
    const pending = apps.filter((a) => a.status === 'pending');
    const wins = careWindows({ items: pending, nowGameMs: ms, monthGameMs, rate: paused ? 0 : anim.rate, windowMs, busyUntil });
    for (const w of wins) if (w.start <= 0) open(apps[w.index], now);
  });
  // A seek (tests, screenshots) jumps over appearances: those are skipped, not missed.
  const offSeek = anim.onSeek((ms) => {
    for (const a of apps) if (a.status === 'pending' && a.gameMs < ms) a.status = 'skipped';
    gameMs = ms;
  });
  const offHold = anim.holdEnd(() => apps.some((a) => a.status === 'open'));

  return {
    el,
    /** {shown, hits} so far (buttons still up count as shown). */
    result: () => ({ shown: shown(), hits: hits() }),
    /** Dev/screenshot helper: show the next pending button now. */
    showNext() { const a = apps.find((x) => x.status === 'pending'); if (a) open(a, performance.now()); return !!a; },
    get gameMs() { return gameMs; },
    dispose() {
      offTick(); offSeek(); offHold();
      document.removeEventListener('keydown', onKey);
      layer.remove(); say.remove();
    },
  };
}
