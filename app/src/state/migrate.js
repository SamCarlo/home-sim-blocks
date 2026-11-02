// Save migrations (02 §8): migrate() walks v1 → v2 → … and returns a current-version state. Pure module.
import { STATE_VERSION } from './schema.js';

/** Thrown when a save can't be migrated. `message` is safe to show a student. */
export class MigrationError extends Error {
  constructor(message, code) { super(message); this.name = 'MigrationError'; this.code = code; }
}

/**
 * Steps keyed by the version they upgrade FROM: STEPS[1] turns a v1 state into v2.
 * Add one per version bump, each with a unit test using a fixture of the old shape.
 */
export const STEPS = {
  // v2 (Phase 4 moves, 2026-10-03): the relocation slot (life/relocation.js); 'autopilot' joined LIFE_STAGES.
  1: (s) => { s.relocation = null; },
};

/** Bring any older save up to STATE_VERSION. Refuses future or unknown versions so nothing gets overwritten. */
export function migrate(state, steps = STEPS, target = STATE_VERSION) {
  if (!state || typeof state !== 'object') throw new MigrationError('This save file is empty or damaged.', 'invalid');
  let v = state.version;
  if (!Number.isInteger(v) || v < 1) throw new MigrationError('This save file is damaged (it has no version).', 'invalid');
  if (v > target) {
    throw new MigrationError('This save was made by a newer version of the game. Reload the page to get the latest version.', 'future');
  }
  let s = state;
  while (v < target) {
    const step = steps[v];
    if (!step) throw new MigrationError(`This save can't be upgraded (no step from version ${v}).`, 'missing-step');
    const draft = structuredClone(s);
    s = step(draft) ?? draft;
    s.version = ++v;
  }
  return s;
}
