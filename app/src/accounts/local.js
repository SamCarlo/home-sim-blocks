// Local account provider (11 §2): accounts in localStorage, passwords hashed with PBKDF2-SHA-256 via WebCrypto.
// For development and demos only; the login screen says so. Storage and crypto are injectable for Node tests.
import { ACCOUNTS, LOCAL_CLASS_CODES, STORAGE_PREFIX } from '../config.js';
import { AccountError, MESSAGES, assertRegistration, normalizeUsername } from './provider.js';

export const ACCOUNTS_KEY = `${STORAGE_PREFIX}accounts`;
export const SESSION_KEY = `${STORAGE_PREFIX}session`;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((b) => parseInt(b, 16)));

/**
 * Create the local provider. opts: local / session (Storage-like: getItem, setItem, removeItem),
 * crypto (WebCrypto with subtle + getRandomValues), classCodes, iterations.
 */
export function createLocalProvider(opts = {}) {
  const {
    local = globalThis.localStorage,
    session = globalThis.sessionStorage,
    crypto = globalThis.crypto,
    classCodes = null, // null = the admin console's local codes (homeblocks:v1:classCodes), else LOCAL_CLASS_CODES
    iterations = ACCOUNTS.pbkdf2Iterations,
  } = opts;
  const listeners = new Set();
  let user = null;

  const readAccounts = () => {
    try { return JSON.parse(local.getItem(ACCOUNTS_KEY) || '{}') || {}; } catch { return {}; }
  };
  const writeAccounts = (all) => local.setItem(ACCOUNTS_KEY, JSON.stringify(all));

  async function hashPassword(password, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return hex(bits);
  }

  /** Active class codes: the given list, or the ones the local admin console keeps (task 52). */
  function activeCodes() {
    if (classCodes) return classCodes.map((c) => c.toUpperCase());
    try {
      const saved = JSON.parse(local.getItem(`${STORAGE_PREFIX}classCodes`) || 'null');
      if (Array.isArray(saved)) return saved.filter((c) => c.active).map((c) => c.code);
    } catch { /* fall through */ }
    return LOCAL_CLASS_CODES.map((c) => c.toUpperCase());
  }

  async function uidFor(username) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`homesim:${username}`));
    return `local-${hex(digest).slice(0, 16)}`;
  }

  function setUser(next, remember) {
    user = next;
    session.removeItem(SESSION_KEY);
    local.removeItem(SESSION_KEY);
    if (next) (remember ? local : session).setItem(SESSION_KEY, JSON.stringify(next));
    for (const cb of [...listeners]) cb(user);
  }

  return {
    kind: 'local',

    /** Restore the session from sessionStorage (or localStorage when "keep me logged in" was ticked). */
    async init() {
      for (const store of [session, local]) {
        try {
          const saved = JSON.parse(store.getItem(SESSION_KEY) || 'null');
          const acct = readAccounts()[saved?.username];
          if (saved?.uid && acct?.uid === saved.uid && !acct.disabled) { user = saved; break; }
        } catch { /* ignore a corrupt session */ }
      }
      return user;
    },

    /** Create an account and sign in (session only). Throws AccountError. */
    async register(input) {
      const { username, password, classCode } = assertRegistration(input);
      if (!activeCodes().includes(classCode)) {
        throw new AccountError('class-code', MESSAGES.classCodeUnknown, 'classCode');
      }
      const all = readAccounts();
      if (all[username]) throw new AccountError('username-taken', MESSAGES.usernameTaken, 'username');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const uid = await uidFor(username);
      all[username] = { salt: hex(salt), hash: await hashPassword(password, salt), classCode, uid };
      try { writeAccounts(all); } catch {
        throw new AccountError('storage', "This browser can't save accounts right now. Ask your teacher.");
      }
      const next = { uid, username, classCode };
      setUser(next, false);
      return next;
    },

    /** Sign in. remember → localStorage session, otherwise sessionStorage. Throws AccountError. */
    async login({ username, password, remember = false } = {}) {
      const name = normalizeUsername(username);
      const acct = readAccounts()[name];
      if (!acct || !password || (await hashPassword(password, unhex(acct.salt))) !== acct.hash) {
        throw new AccountError('invalid-credential', MESSAGES.badLogin);
      }
      if (acct.disabled) throw new AccountError('disabled', 'Your account is paused. Ask your teacher.');
      const next = { uid: acct.uid, username: name, classCode: acct.classCode };
      setUser(next, remember);
      return next;
    },

    /** Sign out and forget the session in both storages. */
    async logout() {
      if (user || session.getItem(SESSION_KEY) || local.getItem(SESSION_KEY)) setUser(null);
    },

    /** The signed-in player, or null. */
    current: () => user,

    /** Listen for sign-in/sign-out; returns unsubscribe. */
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
}
