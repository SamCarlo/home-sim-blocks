// Firebase account provider (11 §2): username + password on Firebase Auth through a synthetic email, same interface as
// local.js (01 §6). The SDK loads lazily through the import map (gstatic in the browser, node_modules in Node tests).
// Never calls an API that sends email (no password reset, verification or email links).
import { ACCOUNTS } from '../config.js';
import { AccountError, MESSAGES, assertRegistration, normalizeUsername } from './provider.js';

/** Emulator endpoints and the demo project (firebase.json, .firebaserc). A `demo-` project never touches the cloud. */
export const EMULATOR = {
  authUrl: 'http://127.0.0.1:9099',
  firestoreHost: '127.0.0.1',
  firestorePort: 8080,
  config: { apiKey: 'demo-key', authDomain: 'demo-home-blocks.firebaseapp.com', projectId: 'demo-home-blocks' },
};

export const FIREBASE_MESSAGES = {
  tooMany: 'Too many tries. Wait a minute, then try again.',
  network: "Can't reach the server. Check your internet.",
  paused: 'Your account is paused. Ask your teacher.',
  missing: "Your account isn't set up in the class list. Ask your teacher.",
  setup: "Your account couldn't be set up. Try again.",
};

/** The synthetic email for a username (11 §2). example.com is reserved, so no mail can ever be delivered. */
export const emailFor = (username) => `${normalizeUsername(username)}@${ACCOUNTS.syntheticEmailDomain}`;

/** Map a Firebase error (auth/* or Firestore code) to a friendly AccountError. Passes AccountErrors through. */
export function friendlyError(err) {
  if (err instanceof AccountError) return err;
  const code = String(err?.code || '');
  switch (code) {
    case 'auth/email-already-in-use': return new AccountError('username-taken', MESSAGES.usernameTaken, 'username');
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email': return new AccountError('invalid-credential', MESSAGES.badLogin);
    case 'auth/too-many-requests': return new AccountError('too-many-requests', FIREBASE_MESSAGES.tooMany);
    case 'auth/weak-password': return new AccountError('invalid-password', MESSAGES.passwordShort, 'password');
    case 'auth/user-disabled': return new AccountError('disabled', FIREBASE_MESSAGES.paused);
    case 'auth/network-request-failed':
    case 'unavailable':
    case 'deadline-exceeded': return new AccountError('network', FIREBASE_MESSAGES.network);
    default: return new AccountError(code || 'unknown', 'Something went wrong. Try again.');
  }
}

/** Load the three SDK modules (browser: import map → gstatic; Node: the npm `firebase` package). */
async function loadSdk() {
  const [app, auth, firestore] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  return { app, auth, firestore };
}

/**
 * Firestore with the persistent multi-tab cache in the browser (11 §6: offline writes queue and sync later); memory
 * cache in Node. Falls back to the existing instance when this app already initialized Firestore.
 */
function openFirestore(fs, app, browser) {
  if (!browser) return fs.getFirestore(app);
  try {
    return fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (err) {
    console.warn('firestore cache', err?.code || err);
    return fs.getFirestore(app);
  }
}

/**
 * Create the Firebase provider. opts: config (firebaseConfig), emulator (bool: connect to the local emulators with the
 * demo project), appName (Node tests run several providers side by side), sdk (injected modules), browser (use
 * session/local persistence; defaults to "window exists").
 */
export function createFirebaseProvider(opts = {}) {
  const { emulator = false, appName, sdk: injected, browser = typeof window !== 'undefined' } = opts;
  const config = emulator ? EMULATOR.config : opts.config;
  const listeners = new Set();
  let sdk = null;
  let auth = null;
  let db = null;
  let user = null;

  const emit = () => { for (const cb of [...listeners]) cb(user); };
  const setUser = (next) => { user = next; emit(); };

  /** Read players/{uid}; refuse (and sign out) a paused or missing player. Returns {uid, username, classCode}. */
  async function profileFor(fbUser) {
    const { doc, getDoc } = sdk.firestore;
    let snap;
    try { snap = await getDoc(doc(db, 'players', fbUser.uid)); } catch (err) {
      await sdk.auth.signOut(auth).catch(() => {});
      throw friendlyError(err);
    }
    const data = snap.exists() ? snap.data() : null;
    if (!data || data.disabled) {
      await sdk.auth.signOut(auth).catch(() => {});
      throw new AccountError(data ? 'disabled' : 'no-player', data ? FIREBASE_MESSAGES.paused : FIREBASE_MESSAGES.missing);
    }
    return { uid: fbUser.uid, username: data.username, classCode: data.classCode };
  }

  async function usePersistence(remember) {
    if (!browser) return; // Node: in-memory only
    const { setPersistence, browserLocalPersistence, browserSessionPersistence } = sdk.auth;
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  }

  return {
    kind: 'firebase',
    emulator,

    /** Load the SDK, connect (emulators when asked), and restore a signed-in player if the session is still valid. */
    async init() {
      sdk = injected ?? await loadSdk();
      const { initializeApp, getApps, getApp } = sdk.app;
      const name = appName ?? '[DEFAULT]';
      const app = getApps().some((a) => a.name === name) ? getApp(name) : initializeApp(config, name);
      auth = sdk.auth.getAuth(app);
      db = openFirestore(sdk.firestore, app, browser);
      if (emulator) {
        sdk.auth.connectAuthEmulator(auth, EMULATOR.authUrl, { disableWarnings: true });
        sdk.firestore.connectFirestoreEmulator(db, EMULATOR.firestoreHost, EMULATOR.firestorePort);
      }
      await auth.authStateReady();
      if (auth.currentUser) {
        try { user = await profileFor(auth.currentUser); } catch (err) {
          user = null;
          console.warn('account', err?.code || err);
        }
      }
      // Signed out elsewhere (token revoked, another tab): drop the player too.
      sdk.auth.onAuthStateChanged(auth, (fb) => { if (!fb && user) setUser(null); });
      return user;
    },

    /** Check the class code, create the Auth user, write players/{uid}; undo the Auth user if that write fails. */
    async register(input) {
      const { username, password, classCode } = assertRegistration(input);
      const { doc, getDoc, setDoc } = sdk.firestore;
      let code;
      try { code = await getDoc(doc(db, 'classCodes', classCode)); } catch (err) { throw friendlyError(err); }
      if (!code.exists() || code.data().active !== true) {
        throw new AccountError('class-code', MESSAGES.classCodeUnknown, 'classCode');
      }
      await usePersistence(false);
      let cred;
      try { cred = await sdk.auth.createUserWithEmailAndPassword(auth, emailFor(username), password); } catch (err) {
        throw friendlyError(err);
      }
      const now = Date.now();
      try {
        await setDoc(doc(db, 'players', cred.user.uid), {
          username, classCode, createdAt: now, updatedAt: now, disabled: false,
          summary: { phase: 'intake', monthIndex: 0 },
        });
      } catch (err) {
        console.warn('account', 'player doc write failed; removing the new Auth user', err?.code || err);
        await sdk.auth.deleteUser(cred.user).catch(() => sdk.auth.signOut(auth).catch(() => {}));
        throw err?.code === 'unavailable' ? friendlyError(err) : new AccountError('setup', FIREBASE_MESSAGES.setup);
      }
      const next = { uid: cred.user.uid, username, classCode };
      setUser(next);
      return next;
    },

    /** Sign in. remember → browserLocalPersistence, otherwise browserSessionPersistence (shared Chromebooks). */
    async login({ username, password, remember = false } = {}) {
      const name = normalizeUsername(username);
      if (!ACCOUNTS.usernamePattern.test(name) || !password) throw new AccountError('invalid-credential', MESSAGES.badLogin);
      await usePersistence(remember);
      let cred;
      try { cred = await sdk.auth.signInWithEmailAndPassword(auth, emailFor(name), password); } catch (err) {
        throw friendlyError(err);
      }
      const next = await profileFor(cred.user);
      setUser(next);
      return next;
    },

    /** Sign out of Firebase Auth. */
    async logout() {
      const had = !!user;
      user = null;
      await sdk.auth.signOut(auth);
      if (had) emit();
    },

    /** The signed-in player, or null. */
    current: () => user,

    /** Listen for sign-in/sign-out; returns unsubscribe. */
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    /** Firestore handle and the loaded SDK modules for the save adapter (task 51) and tests. */
    get db() { return db; },
    get sdk() { return sdk; },
    get auth() { return auth; },
  };
}
