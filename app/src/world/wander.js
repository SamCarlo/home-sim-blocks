// Animal wandering inside a box of air cells (13 §8, blocks task 13). Pure and stateless: the position is a function of
// time, so animation.js can keep calling idle(t) with total seconds and two clients agree. Box is inclusive cells
// {x0, y0, z0, x1, y1, z1}; positions are cell-centre floats with feet on y0 (the floor under the box).
import { seedFor, createRng } from '../util/rng.js';
import { VOX_MOBS } from '../config.js';

/** Waypoint k for a box: a seeded cell centre inside it. */
export function wanderPoint(box, seed, k) {
  const rng = createRng(seedFor('wander', seed, k));
  return { x: rng.int(box.x0, box.x1) + 0.5, y: box.y0, z: rng.int(box.z0, box.z1) + 0.5 };
}

/**
 * Where a wandering animal is at time t (seconds): {x, y, z, yaw, walking}. Each leg of `leg` seconds walks from
 * waypoint k to k+1 for the first `walkShare` of it (eased), then pauses. yaw follows the three.js convention of the
 * models (0 = facing +z, atan2(dx, dz)).
 */
export function wanderAt(box, t, { seed = 0, leg = VOX_MOBS.wander.leg, walkShare = VOX_MOBS.wander.walkShare } = {}) {
  const k = Math.floor(Math.max(0, t) / leg);
  const a = wanderPoint(box, seed, k), b = wanderPoint(box, seed, k + 1);
  const p = (Math.max(0, t) - k * leg) / (leg * walkShare);
  const u = p >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * p);
  const dx = b.x - a.x, dz = b.z - a.z;
  // While paused, keep facing the way it came; on a zero-length leg face the previous leg's direction.
  let yaw = Math.atan2(dx, dz);
  if (!dx && !dz) {
    const prev = wanderPoint(box, seed, Math.max(0, k - 1));
    yaw = Math.atan2(a.x - prev.x, a.z - prev.z) || 0;
  }
  return { x: a.x + dx * u, y: box.y0, z: a.z + dz * u, yaw, walking: p < 1 && (dx !== 0 || dz !== 0) };
}
