// Game boot (01 §5): account provider → login → save → store + persistence (local or Firestore) → phase screen.
import * as config from './config.js';
import { FIREBASE_ENABLED, firebaseConfig } from './firebase-config.js';
import { h, clear } from './ui/dom.js';
import { registerScreen, renderPhase, unmountCurrent } from './ui/screens.js';
import { renderHeader } from './ui/header.js';
import { devAllowed as isDevAllowed } from './dev/flags.js';
import { mountGallery } from './dev/galleries.js';
import { seeds, buildSeed, DEV_USER } from './dev/seeds.js';
import { createInitialState, STATE_VERSION } from './state/schema.js';
import { migrate } from './state/migrate.js';
import { createStore } from './state/store.js';
import { attach } from './state/persistence.js';
import { createLocalAdapter } from './persistence/local.js';
import { selectProvider, chooseMode } from './accounts/provider.js';
import { applySettings } from './ui/portfolio/settings.js';
import { renderRelocationBar } from './ui/relocationBar.js';

registerScreen('login', () => import('./accounts/ui/login.js'));
registerScreen('intake', () => import('./phases/intake/intakeScreen.js'));
registerScreen('plan', () => import('./phases/plan/planScreen.js'));
registerScreen('paperwork', () => import('./phases/paperwork/paperworkScreen.js'));
registerScreen('design', () => import('./phases/design/designScreen.js'));
registerScreen('life', () => import('./phases/life/lifeScreen.js'));

const params = new URLSearchParams(location.search);
const devAllowed = isDevAllowed();
const { firebaseMode, emulator } = chooseMode({ enabled: FIREBASE_ENABLED, params, hostname: location.hostname, devHosts: config.DEV_HOSTS });
const dev = { allowed: devAllowed, params, firebaseMode, emulator };

// ?theme=light|dark (dev) wins over settings.theme until the player picks a theme in Settings.
let themeOverride = devAllowed && ['light', 'dark'].includes(params.get('theme')) ? params.get('theme') : null;
applySettings(null, { themeOverride });
installErrorBoundary();
boot().catch(showError);

async function boot() {
  const root = document.getElementById('app');
  const main = h('main', { class: 'app-main', id: 'screen' });
  // ?dev=<gallery> renders a dev gallery instead of the game (01 §7). ?dev=1 is the dev panel (below).
  const gallery = devAllowed ? params.get('dev') : null;
  if (gallery && gallery !== '1') {
    clear(root).append(main);
    if (await mountGallery(gallery, main)) return;
  }

  const accounts = await selectProvider({ firebaseMode, emulator, config: firebaseConfig });
  await accounts.init();
  // Firebase mode saves to Firestore (11 §6, task 51); local mode and seeds use localStorage.
  // The Firestore adapter loads only in Firebase mode, so local play never requests it (01 §10).
  const remoteAdapter = accounts.kind === 'firebase'
    ? (await import('./persistence/firestore.js')).createFirestoreAdapter({ db: accounts.db, firestore: accounts.sdk.firestore })
    : null;
  const localAdapter = createLocalAdapter();
  let game = null; // { store, persistence, unsubscribe, devPanel, user }

  /** No one signed in: show the welcome screen; accounts.onChange picks up the sign-in. */
  const showLogin = async () => {
    clear(root).append(main);
    await renderPhase(main, { store: null, accounts, persistence: null, config, dev, phase: 'login' });
  };

  /** Flush the save, detach autosave, sign out, back to login (11 §2). */
  const logout = async () => {
    const g = game;
    game = null;
    if (g) {
      // Offline, a Firestore write waits for the network: don't hold the logout for it (the cache keeps it queued).
      await Promise.race([g.persistence.flush(), new Promise((r) => setTimeout(r, config.SAVE.logoutFlushMs))]);
      if (g.persistence.status.get() === 'saved') g.adapter.forget?.(g.user.uid);
      g.persistence.detach();
      g.unsubscribe();
      g.devPanel?.();
    }
    unmountCurrent(main);
    applySettings(null, { themeOverride });
    await accounts.logout();
    await showLogin();
  };

  /** Load or create the player's save, then render their phase. fixture = seed state (dev). */
  const startGame = async (user, fixture = null) => {
    const adapter = (!fixture && remoteAdapter) || localAdapter;
    const loaded = fixture ? null : await adapter.load(user.uid);
    const state = fixture ?? (loaded ? migrate(loaded) : createInitialState({ ...user, now: Date.now() }));
    const store = createStore(state);
    const pushCopy = adapter.takePendingPush?.() === true;
    // A save from the server already has its summary (02 §5); a pushed local copy may not.
    const persistence = attach(store, adapter, { uid: user.uid, summarized: !!loaded && adapter.remote === true && !pushCopy });
    if (!loaded) await persistence.saveNow(fixture ? `seed:${params.get('seed')}` : 'account-created');
    else if (pushCopy) persistence.saveNow('local-copy-newer').catch(showError);
    const ctx = { store, accounts, persistence, config, user, dev };
    let shownPhase = null;
    let header = null;
    let portfolio = null;
    /** Open the portfolio drawer (task 17); a second press while it's open does nothing. */
    const openPortfolioDrawer = async (tab) => {
      if (portfolio) return;
      const { openPortfolio } = await import('./ui/portfolio/index.js');
      portfolio = openPortfolio({ store, user, tab, onClose: () => { portfolio = null; } });
    };
    const render = async (force = false) => {
      if (game?.store !== store) return;
      const { phase } = store.getState();
      if (phase === shownPhase && !force) return;
      shownPhase = phase;
      header?.destroy();
      portfolio?.close();
      header = renderHeader(phase, { user, persistence, onLogout: () => logout().catch(showError),
        onPortfolio: phase === 'intake' ? null : () => openPortfolioDrawer().catch(showError),
        onSave: () => persistence.saveNow('manual-save') });
      clear(root);
      // Looking for a new place from Live (task 58): the bar with "Cancel and go home" sits above Plan and Paperwork.
      root.append(...[header, renderRelocationBar(store), main].filter(Boolean));
      await renderPhase(main, ctx);
    };
    applySettings(state.settings, { themeOverride });
    const unsub = store.subscribe((s, { prev }) => {
      if (s.settings?.theme !== prev?.settings?.theme) themeOverride = null;
      applySettings(s.settings, { themeOverride });
      render().catch(showError);
    });
    game = { store, persistence, user, adapter, unsubscribe: () => { unsub(); header?.destroy(); } };
    if (devAllowed) {
      window.__homesim = { store, getState: store.getState, update: store.update, seeds, version: STATE_VERSION, persistence, adapter, accounts, user };
    }
    await render();
    rescoreLetters(store).catch((err) => console.warn('Letters were not rescored.', err));
    // ?open=portfolio (dev, task 17) opens the drawer on load; &tab=<id> picks the tab.
    if (devAllowed && params.get('open') === 'portfolio' && store.getState().phase !== 'intake') {
      root.querySelector('.header-portfolio')?.focus(); // so closing returns focus there, as after a click
      await openPortfolioDrawer(params.get('tab') || undefined);
    }
    if (devAllowed && params.get('dev') === '1') {
      const { mountDevPanel } = await import('./dev/devPanel.js');
      game.devPanel = mountDevPanel({ store, persistence, user, rerender: () => render(true).catch(showError) });
    }
  };

  accounts.onChange((user) => { if (user && !game) startGame(user).catch(showError); });

  // Seed mode (01 §7): the local dev user with a fixture, no login.
  const seedName = devAllowed ? params.get('seed') : null;
  if (seedName) return startGame(DEV_USER, buildSeed(seedName, Date.now()));
  const user = accounts.current();
  if (user) return startGame(user);
  return showLogin();
}

function installErrorBoundary() {
  window.addEventListener('error', (e) => showError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => showError(e.reason));
}

/** One friendly screen for any uncaught error (01 §4). Details only with dev flags on. */
function showError(err) {
  console.error(err);
  const root = document.getElementById('app');
  if (!root) return;
  clear(root);
  root.append(h('section', { class: 'error-boundary card', role: 'alert' },
    h('h2', null, 'Something went wrong.'),
    h('p', null, 'Your progress is saved up to your last step.'),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => location.reload() }, 'Reload'),
    devAllowed && params.has('dev') ? h('pre', null, String(err?.stack || err)) : null,
  ));
  document.body.dataset.ready = '1';
}

/**
 * Letters saved before the real scorer (task 25 stubs) or before the dictionary loaded are scored once it's ready
 * (06 §3, task 28). Only loads the scorer and dictionary when such a letter exists.
 */
async function rescoreLetters(store) {
  const stale = (sc) => !sc || sc.pending === true || sc.likelihood == null || sc.spellChecked === false;
  if (!Object.values(store.getState().letters ?? {}).some((l) => stale(l.score))) return;
  const [{ rescorePending }, { loadSpeller }] = await Promise.all([import('./letters/score.js'), import('./letters/loadSpeller.js')]);
  const speller = await loadSpeller().catch((err) => { console.warn('Spelling dictionary not loaded.', err); return null; });
  store.update((s) => { rescorePending(s, { speller }); });
}
