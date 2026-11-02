// Local persistence adapter (01 §6, 02 §7): saves in localStorage under homeblocks:v1:save:<uid>.
// A quota error resolves { ok: false, code: 'quota' } so the policy shows "Couldn't save" instead of crashing.
import { STORAGE_PREFIX } from '../config.js';

/** localStorage key for a uid's save. */
export const saveKey = (uid) => `${STORAGE_PREFIX}save:${uid}`;
/** localStorage key for a uid's admin summary. */
export const summaryKey = (uid) => `${STORAGE_PREFIX}summary:${uid}`;

const isQuota = (err) => err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);

/** Create the adapter: { kind: 'local', load(uid), save(uid, state, summary), remove(uid) }. */
export function createLocalAdapter(storage = globalThis.localStorage) {
  return {
    kind: 'local',
    async load(uid) {
      const raw = storage.getItem(saveKey(uid));
      if (raw == null) return null;
      try { return JSON.parse(raw); } catch { throw new Error('This save file is damaged and could not be read.'); }
    },
    async save(uid, state, summary) {
      try {
        storage.setItem(saveKey(uid), JSON.stringify(state));
        if (summary) storage.setItem(summaryKey(uid), JSON.stringify(summary));
        return { ok: true };
      } catch (err) {
        if (isQuota(err)) return { ok: false, code: 'quota', message: 'Storage is full.' };
        throw err;
      }
    },
    async remove(uid) {
      storage.removeItem(saveKey(uid));
      storage.removeItem(summaryKey(uid));
    },
  };
}
