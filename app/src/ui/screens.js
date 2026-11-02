// Phase → screen registry (01 §6). Screens load lazily and export mount(container, ctx) → unmount.
import { clear } from './dom.js';

const loaders = new Map();
let current = null; // { phase, unmount }
let renderToken = 0;

/** Register a lazy loader for a phase: registerScreen('plan', () => import('../phases/plan/planScreen.js')). */
export function registerScreen(phase, loader) {
  loaders.set(phase, loader);
}

/** Unmount the current screen (if any) and clear readiness. */
export function unmountCurrent(container) {
  if (current?.unmount) {
    try { current.unmount(); } catch (err) { console.warn('unmount failed', err); }
  }
  current = null;
  delete document.body.dataset.ready;
  if (container) clear(container);
}

/**
 * Mount the screen for ctx.store.getState().phase (or ctx.phase when given, e.g. 'login').
 * Screens set document.body.dataset.ready = "1" when rendered; this resets it on every switch.
 */
export async function renderPhase(container, ctx) {
  const phase = ctx.phase ?? ctx.store.getState().phase;
  const token = ++renderToken;
  // The old screen's ready flag must not outlive the switch: the next screen's module can take a moment to load, and a
  // test's waitReady would otherwise pass on the screen that is about to go (blocks task 19).
  if (current && current.phase !== phase) delete document.body.dataset.ready;
  const loader = loaders.get(phase);
  if (!loader) throw new Error(`No screen registered for phase "${phase}"`);
  const mod = await loader();
  if (token !== renderToken) return; // a newer render won
  unmountCurrent(container);
  const unmount = await mod.mount(container, ctx);
  current = { phase, unmount: typeof unmount === 'function' ? unmount : null };
  focusScreen(container);
}

/** The phase currently on screen, or null. */
export function currentPhase() {
  return current?.phase ?? null;
}

/**
 * After a screen change, move focus into the new screen (12 §4) unless the screen already focused something there
 * (intake's first field, a step title): its first heading, else the container. Keeps keyboard and screen-reader users
 * from being left on a removed element.
 */
function focusScreen(container) {
  if (!container || container.contains(document.activeElement)) return;
  if (document.querySelector('.modal-backdrop, [aria-modal="true"]')?.contains(document.activeElement)) return;
  const target = container.querySelector('h1, h2') ?? container;
  if (!target.hasAttribute('tabindex')) { target.setAttribute('tabindex', '-1'); target.classList.add('screen-focus'); }
  target.focus({ preventScroll: true });
}
