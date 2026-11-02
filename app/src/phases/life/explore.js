// Explore mode (13 §8–§9, blocks task 16). Browser only. A full-screen first-person overlay over the app: the block
// world the life view already built (same renderer and meshes; the canvas moves into the overlay and back), the vendored
// engine's Player body and speeds with our collision (world/firstPerson.js), WASD/arrows + Space, mouse look with pointer
// lock or drag when pointer lock is unavailable, keyboard look Q/E R/F, a crosshair, a dismissable controls card and Done.
// Building (break/place, hotbar) is task 17. The frame loop runs only while open; close() removes every listener.
import * as THREE from 'three';
import { h } from '../../ui/dom.js';
import { EXPLORE } from '../../config.js';
import { createPlayer, poseOf, stepPlayer, turn } from '../../world/firstPerson.js';

const KEYS = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right',
  ArrowRight: 'right', Space: 'jump', KeyQ: 'turnLeft', KeyE: 'turnRight', KeyR: 'lookUp', KeyF: 'lookDown',
};
/** Test/eval key names → input flags ('w', 'ArrowUp', 'space', 'q' …). */
const NAMED = { w: 'forward', s: 'back', a: 'left', d: 'right', ' ': 'jump', space: 'jump', q: 'turnLeft', e: 'turnRight',
  r: 'lookUp', f: 'lookDown', arrowup: 'forward', arrowdown: 'back', arrowleft: 'left', arrowright: 'right' };
const CONTROLS = [
  ['Move', 'W A S D or the arrow keys'], ['Jump', 'Space'], ['Look', 'Move the mouse, or drag on the screen'],
  ['Look with keys', 'Q / E turn, R / F look up and down'], ['Leave', 'Esc or Done'],
];

/**
 * openExplore({view, contract, state, onClose(pose), onSettings?(patch), reduced?}) → {el, pose(), move(keys, ms), look(dx, dy),
 * close()} or null when the view has no block world. `view` is blockView's handle, `contract` its voxHome contract.
 */
export function openExplore({ view, contract, state, onClose, onSettings = null, reduced = false }) {
  const world = view?.scene?.world;
  if (!world || !contract) return null;
  const volume = world.volume;
  const camera = new THREE.PerspectiveCamera(EXPLORE.fov, 1, 0.05, 2000);
  camera.rotation.order = 'YXZ';
  const player = createPlayer(state.world?.pose ?? contract.spawn);
  const input = {};
  const opener = document.activeElement;

  // ── DOM ──
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const done = h('button', { class: 'btn btn-primary life-explore-done', type: 'button', onClick: () => close() }, 'Done');
  const help = h('button', { class: 'btn btn-ghost life-explore-help', type: 'button', 'aria-expanded': 'false',
    onClick: () => showCard(card.hidden) }, 'Controls');
  const gotIt = h('button', { class: 'btn btn-secondary life-explore-gotit', type: 'button', onClick: () => {
    showCard(false);
    onSettings?.({ exploreCardDismissed: true });
    stage.focus();
  } }, 'Got it');
  const card = h('section', { class: 'life-explore-card', 'aria-label': 'Explore controls', id: 'life-explore-card' },
    h('h2', null, 'Explore your home'),
    h('dl', null, ...CONTROLS.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    gotIt);
  help.setAttribute('aria-controls', 'life-explore-card');
  const stage = h('div', { class: 'life-explore-stage', tabindex: 0, role: 'application',
    'aria-label': 'First-person view of your home. W A S D to move, Q and E to turn, R and F to look up and down, Space to jump, Esc to leave.' },
    h('div', { class: 'life-explore-crosshair', 'aria-hidden': 'true' }));
  const el = h('div', { class: 'life-explore', role: 'application', 'aria-labelledby': 'life-explore-title' },
    stage,
    h('div', { class: 'life-explore-bar' }, h('h1', { class: 'life-explore-title', id: 'life-explore-title' }, 'Explore your home'), help, done),
    card, status);
  function showCard(on) {
    card.hidden = !on;
    help.setAttribute('aria-expanded', String(on));
  }
  showCard(!state.settings?.exploreCardDismissed);

  // The rest of the app is inert while Explore is open (focus stays in the overlay, screen readers see only it).
  const inerted = [...document.body.children].filter((c) => !c.inert && c.tagName !== 'SCRIPT');
  inerted.forEach((c) => { c.inert = true; });
  document.body.append(el);
  document.body.classList.add('has-explore');
  const charObj = view.home?.character?.object;
  const charWasVisible = charObj?.visible;
  if (charObj) charObj.visible = false; // you are the character now
  world.attach(stage);
  world.useCamera(camera);
  const canvas = world.renderer.domElement;

  // ── Look: pointer lock when it works, drag otherwise ──
  let lockFailed = !canvas.requestPointerLock, dragging = false;
  const locked = () => document.pointerLockElement === canvas;
  const onPointerDown = (e) => {
    stage.focus({ preventScroll: true });
    if (!locked() && !lockFailed) {
      try {
        const r = canvas.requestPointerLock();
        r?.catch?.(() => { lockFailed = true; });
      } catch { lockFailed = true; }
    }
    dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = () => { dragging = false; };
  const onPointerMove = (e) => {
    if (!locked() && !dragging) return;
    turn(player, -e.movementX * EXPLORE.mouseSens, -e.movementY * EXPLORE.mouseSens);
  };
  const onLockChange = () => {
    status.textContent = locked() ? 'Mouse captured. Press Esc to free it.' : '';
  };
  const onLockError = () => { lockFailed = true; };
  const onKey = (e) => {
    if (e.key === 'Escape' && e.type === 'keydown') {
      e.preventDefault(); e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') { if (e.type === 'keydown') trapTab(e); return; }
    const k = KEYS[e.code];
    if (!k || (e.target !== stage && e.target !== canvas && e.target !== document.body)) return;
    e.preventDefault();
    input[k] = e.type === 'keydown';
  };
  const onBlur = () => { for (const k of Object.keys(input)) input[k] = false; };
  function trapTab(e) {
    const list = [stage, ...el.querySelectorAll('button')].filter((b) => b.offsetParent !== null || b === stage);
    const i = list.indexOf(document.activeElement);
    e.preventDefault();
    list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', onBlur);

  // ── Frame loop (only while open) ──
  let raf = 0, last = performance.now(), closed = false;
  function place() {
    const bob = reduced || !player.onGround ? 0 : Math.sin(player.walked * EXPLORE.bob.perBlock) * EXPLORE.bob.amp;
    camera.position.set(player.x, player.y + EXPLORE.eyeHeight + bob, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    stepPlayer(volume, player, input, (now - last) / 1000);
    last = now;
    place();
    world.renderNow();
  }
  place();
  raf = requestAnimationFrame(frame);
  stage.focus({ preventScroll: true });
  document.body.dataset.explore = '1';

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', onBlur);
    if (locked()) document.exitPointerLock?.();
    world.useCamera(null);
    world.attach(null);
    if (charObj) charObj.visible = charWasVisible;
    world.requestRender();
    inerted.forEach((c) => { c.inert = false; });
    el.remove();
    document.body.classList.remove('has-explore');
    delete document.body.dataset.explore;
    if (window.__explore === api) delete window.__explore;
    if (opener?.isConnected) opener.focus();
    onClose?.(poseOf(player));
  }

  const api = {
    el,
    /** Position and view: {x, y, z, yaw, pitch} (block space, feet). */
    pose: () => poseOf(player),
    /** Hold `keys` (['w'], ['w', 'space'] …) for `ms` of game time in 1/60 s steps, then render. Returns the pose. */
    move(keys, ms) {
      const held = Object.fromEntries([keys].flat().map((k) => [NAMED[String(k).toLowerCase()] ?? KEYS[k], true]));
      for (let t = 0; t < ms; t += 1000 / 60) stepPlayer(volume, player, held, 1 / 60);
      place();
      world.renderNow();
      return poseOf(player);
    },
    /** Look by (dx, dy) pixels, as a mouse move. */
    look(dx, dy) {
      turn(player, -dx * EXPLORE.mouseSens, -dy * EXPLORE.mouseSens);
      place();
      world.renderNow();
      return poseOf(player);
    },
    close,
  };
  window.__explore = api;
  return api;
}
