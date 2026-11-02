// The student's block world in the save (13 §7, blocks task 18). Pure: mutates the state draft it is given
// (call inside store.update) and never touches the DOM. `state.world` = {homeKey, edits (packed, world/edits.js),
// editCount, pose, hotbar, cleared}; the generated world is never saved, only the diff against it.
import { WORLD } from '../config.js';
import { pack, unpack } from './edits.js';

/** A fresh world record for a home. */
export function newWorld(homeKey, hotbar = []) {
  return { homeKey, edits: '', editCount: 0, pose: null, hotbar: [...hotbar], cleared: 0 };
}

/**
 * Make sure `s.world` belongs to the home `homeKey` and return it. Missing → created. A different homeKey with no upgrade
 * in progress means the home changed (a move): the old builds stay with the old home, so the world resets. During an
 * upgrade (`s.upgrade`) the old world is kept for the rebase (task 21).
 */
export function ensureWorld(s, homeKey, { hotbar } = {}) {
  if (!s.world || (s.world.homeKey !== homeKey && !s.upgrade)) s.world = newWorld(homeKey, hotbar);
  if (hotbar && !s.world.hotbar?.length) s.world.hotbar = [...hotbar];
  return s.world;
}

/** How full a world with `count` edits is: {almostFull (≥ WORLD.almostFullPct of the cap), full (at the cap)}. */
export function fullness(count) {
  return { almostFull: count >= Math.ceil(WORLD.maxEdits * WORLD.almostFullPct), full: count >= WORLD.maxEdits };
}

/**
 * Store the edit set (Map volume index → id, every cell that differs from the generated world) in `s.world`.
 * Over `WORLD.maxEdits` nothing is written. → {ok, almostFull, full, count}.
 */
export function recordEdits(s, editsMap, { homeKey, hotbar } = {}) {
  const count = editsMap.size;
  if (count > WORLD.maxEdits) return { ok: false, ...fullness(count), full: true, count };
  const w = homeKey ? ensureWorld(s, homeKey) : s.world;
  if (!w) return { ok: false, almostFull: false, full: false, count };
  w.edits = count ? pack(editsMap) : '';
  w.editCount = count;
  if (hotbar) w.hotbar = [...hotbar];
  return { ok: true, ...fullness(count), count };
}

/** The saved edits as a Map (empty when there is no world). */
export function editsOf(world) {
  return world?.edits ? unpack(world.edits) : new Map();
}

/**
 * Write a saved world's edits into the contract's generated volume (in place) and return the volume. Edits only apply
 * when `world.homeKey` matches the contract's. `base` (optional Map) receives each edited cell's generated id, so the
 * builder can tell an undone edit from a new one.
 */
export function restoreEdits(contract, world, base = null) {
  const v = contract.volume;
  if (!world || world.homeKey !== contract.homeKey || !world.edits) return v;
  for (const [i, id] of unpack(world.edits)) {
    if (i < 0 || i >= v.data.length) continue;
    if (base && !base.has(i)) base.set(i, v.data[i]);
    v.data[i] = id;
  }
  return v;
}

/** Remember the last Explore position {x, y, z, yaw, pitch} (rounded to 1/1000 block / radian). */
export function savePose(s, pose) {
  if (!s.world || !pose) return null;
  const r = (n) => Math.round(n * 1000) / 1000;
  s.world.pose = { x: r(pose.x), y: r(pose.y), z: r(pose.z), yaw: r(pose.yaw), pitch: r(pose.pitch) };
  return s.world.pose;
}
