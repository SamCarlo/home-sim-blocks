// First-person walking over a block volume (13 §8–§9, blocks task 16). Pure: no DOM, no three.
// The body is the vendored engine's Player (0.5 wide, 1.8 tall) with its Control's walk speed, gravity and jump; the
// collision is ours (an axis-by-axis box sweep against solid cells), because the vendor Control raycasts its own
// InstancedMesh terrain, which this game never builds (DEVIATIONS). Positions are block space: feet at (x, y, z),
// cell (i, j, k) spans [i, i+1). yaw 0 looks toward −z (three.js camera), pitch > 0 looks up.
import { EXPLORE } from '../config.js';
import { isSolid } from './blocks.js';
import { get } from './volume.js';

const EPS = 1e-4;

/** Does a body with feet at (x, y, z) overlap a solid cell or leave the volume's sides/floor? */
export function collides(v, x, y, z, cfg = EXPLORE) {
  const r = cfg.bodyHalf, top = y + cfg.bodyHeight;
  const { x: X, y: Y, z: Z } = v.size;
  if (x - r < 0 || z - r < 0 || x + r > X || z + r > Z || y < 0) return true;
  for (let j = Math.floor(y); j <= Math.floor(top - EPS); j++) {
    if (j >= Y) break;
    for (let i = Math.floor(x - r); i <= Math.floor(x + r - EPS); i++) {
      for (let k = Math.floor(z - r); k <= Math.floor(z + r - EPS); k++) if (isSolid(get(v, i, j, k))) return true;
    }
  }
  return false;
}

/** A player pose at a spawn cell {x, y, z, yaw?} (or a saved pose {x, y, z, yaw, pitch}, used as is). */
export function createPlayer(at) {
  const saved = at.pitch !== undefined;
  return { x: saved ? at.x : at.x + 0.5, y: at.y, z: saved ? at.z : at.z + 0.5, yaw: at.yaw ?? 0, pitch: at.pitch ?? 0,
    vy: 0, onGround: false, walked: 0 };
}

/** The pose to save or report: position and view only. */
export function poseOf(p) {
  const r = (n) => Math.round(n * 1000) / 1000;
  return { x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(p.yaw), pitch: r(p.pitch) };
}

/** Turn by (dYaw, dPitch) radians, pitch clamped to ±cfg.pitchLimit. */
export function turn(p, dYaw, dPitch, cfg = EXPLORE) {
  p.yaw = (p.yaw + dYaw) % (Math.PI * 2);
  p.pitch = Math.max(-cfg.pitchLimit, Math.min(cfg.pitchLimit, p.pitch + dPitch));
  return p;
}

/** Move along one axis by d, stopping at the first solid cell; may step up one block. Returns the distance moved. */
function moveAxis(v, p, axis, d, cfg) {
  if (!d) return 0;
  const from = p[axis];
  p[axis] += d;
  if (!collides(v, p.x, p.y, p.z, cfg)) return d;
  if (cfg.autoStep && p.onGround && axis !== 'y') {
    const y0 = p.y;
    p.y = Math.floor(y0) + 1;
    if (!collides(v, p.x, p.y, p.z, cfg)) return d;
    p.y = y0;
  }
  let edge;
  if (axis === 'y') edge = d > 0 ? Math.floor(p.y + cfg.bodyHeight) - cfg.bodyHeight - EPS : Math.floor(p.y) + 1;
  else edge = d > 0 ? Math.floor(p[axis] + cfg.bodyHalf) - cfg.bodyHalf - EPS : Math.floor(p[axis] - cfg.bodyHalf) + 1 + cfg.bodyHalf + EPS;
  p[axis] = d > 0 ? Math.max(from, Math.min(p[axis], edge)) : Math.min(from, Math.max(p[axis], edge));
  if (collides(v, p.x, p.y, p.z, cfg)) p[axis] = from;
  return p[axis] - from;
}

/**
 * Advance p by dt seconds with held input {forward, back, left, right, jump, turnLeft, turnRight, lookUp, lookDown}
 * (booleans). Mutates and returns p; p.walked accumulates horizontal distance (head bob).
 */
export function stepPlayer(v, p, input, dt, cfg = EXPLORE) {
  dt = Math.min(dt, cfg.maxDt);
  const tYaw = ((input.turnLeft ? 1 : 0) - (input.turnRight ? 1 : 0)) * cfg.turnSpeed * dt;
  const tPitch = ((input.lookUp ? 1 : 0) - (input.lookDown ? 1 : 0)) * cfg.turnSpeed * dt;
  if (tYaw || tPitch) turn(p, tYaw, tPitch, cfg);
  let f = (input.forward ? 1 : 0) - (input.back ? 1 : 0), s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const len = Math.hypot(f, s) || 1;
  f /= len; s /= len;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let dx = (-sin * f + cos * s) * cfg.walkSpeed * dt, dz = (-cos * f - sin * s) * cfg.walkSpeed * dt;
  if (input.jump && p.onGround) { p.vy = cfg.jumpSpeed; p.onGround = false; }
  p.vy = Math.max(-cfg.maxFall, p.vy - cfg.gravity * dt);
  // Sub-steps of at most a quarter block so nothing tunnels through a one-block wall.
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(p.vy * dt)) / 0.25));
  let walked = 0;
  for (let i = 0; i < n; i++) {
    const mx = moveAxis(v, p, 'x', dx / n, cfg), mz = moveAxis(v, p, 'z', dz / n, cfg);
    walked += Math.hypot(mx, mz);
    const dy = (p.vy * dt) / n;
    const my = moveAxis(v, p, 'y', dy, cfg);
    if (my !== dy) {
      if (dy < 0) p.onGround = true;
      p.vy = 0;
    } else if (dy < 0) p.onGround = collides(v, p.x, p.y - 0.02, p.z, cfg);
  }
  p.walked += walked;
  return p;
}
