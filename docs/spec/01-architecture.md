# 01 — Architecture & conventions

## 1. Stack

- Plain HTML/CSS/JS. **Native ES modules, no bundler, no framework, no build step at runtime.**
  Two entry pages share one module tree: `app/index.html` (the game) and `app/admin.html`.
- An **import map** in both HTML files maps bare specifiers:
  - `three` → `./vendor/three/three.module.min.js`
  - `three/addons/` → `./vendor/three/addons/`
  - `firebase/app`, `firebase/auth`, `firebase/firestore` → pinned `https://www.gstatic.com/firebasejs/<ver>/…` URLs
- Vendored libraries live in `app/vendor/` with versions and licenses in `app/vendor/VERSIONS.md`.
  They're downloaded once by task 03 (a one-off `npx esbuild` bundle is fine for turning a
  CommonJS package into a single ESM file). The output is committed, and nothing is built at runtime.
- Fonts come from Google Fonts with system fallbacks, the same way `interfaces/bank/index.html` does it.
- Target browser: current Chrome/ChromeOS. Edge, Firefox and Safari are best effort. Main screen
  size is 1366×768 (Chromebook). It must also look right at 1920×1080 and stay usable down to 1024×640.
- ES modules need http(s). Use `python3 tools/serve.py` (port 1271) by hand; `tools/shoot.mjs`
  runs its own server.

## 2. Folder layout (target — tasks create these as they go)

```
home-sim/
  CLAUDE.md                 how to work in this repo (task 01; kept current by every task)
  README.md                 (task 53)
  package.json              {"type":"module","private":true} + scripts; Node sees app/src as ESM
  .gitignore                node_modules/, tools/shots/, .firebase/, *-debug.log, .DS_Store
  firebase.json  firestore.rules.template  firestore.rules  firestore.indexes.json  .firebaserc   (task 49)
  app/                      ← everything deployed (Firebase Hosting "public")
    index.html  admin.html
    styles/                 tokens.css base.css components.css + one file per phase/area
    vendor/                 three/ nspell/ dictionary-en/ vader/ VERSIONS.md
    src/
      main.js               game boot (see §5)
      config.js             every tunable constant (see §9)
      firebase-config.js    placeholder; tools/configure.mjs overwrites it
      types.js              JSDoc @typedefs shared across modules (no runtime code)
      util/                 rng.js hash.js format.js dates.js escape.js   (pure)
      ui/                   dom.js screens.js header.js toast.js modal.js drawer.js term.js
                            portfolio/ letterReport.js …
      state/                schema.js migrate.js summary.js (pure) · store.js persistence.js
      accounts/             provider.js local.js firebase.js · ui/login.js
      persistence/          local.js firestore.js
      dev/                  seeds.js devPanel.js galleries.js
      data/                 locations/{index,hawaii,cities,towns}.js validate.js homeTypes.js (pure)
      finance/              money.js loans.js costs.js affordability.js ledger.js creditScore.js
                            creditCard.js underwriting.js insurance.js (pure)
      forms/                engine.js fields.js validate.js
      letters/              types.js allowlist.js spell.js grammar.js sentiment.js features.js
                            score.js model.json (pure)
      life/                 timeBudget.js wellbeing.js events.js planMonth.js finalizeMonth.js
                            investments.js (pure)
      three/                scene.js sky.js terrain.js materials.js styles.js props.js character.js
                            buildingGen.js houseGen.js blueprintTo3d.js homeRender.js
      phases/
        intake/             intakeScreen.js
        plan/               planScreen.js table.js detail.js preview2d/{index,backgrounds,buildings,palette}.js
        paperwork/          paperworkScreen.js flow.js steps/*.js letterBox.js results.js
        design/             designScreen.js apartmentPicker.js housePicker.js sharedPicker.js
                            blueprint/{model,validate,cost,templates}.js (pure) · blueprint/{editor,tools,view3d}.js
        life/               lifeScreen.js questions.js timeBudgetView.js wellbeingCard.js moneyStrip.js
                            animation.js careButton.js summary.js yearReview.js investPanel.js
      admin/                adminMain.js classCodes.js studentTable.js studentDetail.js actions.js csv.js
      content/              glossary.js tips.js
  tests/
    unit/                   *.test.js   (node --test)
    firebase/               *.test.js   (rules + emulator tests, task 49+)
    e2e/                    *.json step scripts for tools/shoot.mjs
  tools/
    serve.py  shoot.mjs  check.sh  smoke.txt  configure.mjs (49)  letter-model/{corpus/,train.mjs} (27)
    shots/                  screenshots (gitignored)
  docs/
    TASK_PROTOCOL.md PROGRESS.md OPEN_ITEMS.md DATA_SOURCES.md DEPLOY.md TEACHER_GUIDE.md
    spec/                   this spec
```

A task may add a file not listed here if it fits the same pattern. Record it in `CLAUDE.md`.

## 3. Module boundaries

**Pure modules.** These folders and files: `util/`, `data/`, `finance/`, `letters/`, `life/`,
`state/schema.js`, `state/migrate.js`, `state/summary.js`, `phases/plan/preview2d/`,
`phases/design/blueprint/{model,validate,cost,templates}.js`.
- No DOM, no `window`, no `localStorage`, no `three`, no network.
- Import other modules only by **relative path**. Vendored libraries are imported by relative path
  too, e.g. `../../vendor/nspell/nspell.js`.
- Everything here is importable from Node for `node --test`. Any data they need (like the spelling
  dictionary) is passed in, not fetched.

**Browser modules**: `ui/`, `phases/**` (except the pure files above), `accounts/`,
`persistence/`, `dev/`, `admin/`, `three/`.
- `three/` imports `three` by bare specifier through the import map.

Heavy modules load **lazily** with dynamic `import()`:
- three.js and `three/*`, only in Phase 3, Phase 4 and dev galleries;
- the spelling dictionary, only when a letter is scored;
- Firebase, only in Firebase mode.

Login, intake and the plan table must not pull in any of these.

## 4. Coding conventions

- **Money** is an integer number of cents (`12345` = $123.45). Helpers live in `finance/money.js`.
  Format only at the UI edge. Rates are decimals (`0.065`). Round half away from zero to whole
  cents with `Math.round` on positive magnitudes, and document it.
- **Randomness**: `util/rng.js` exports a seeded PRNG (mulberry32 or sfc32), `hashString()` (FNV-1a
  or cyrb53), `seedFor(...parts)` and helpers (`int`, `pick`, `chance`, `normal` via Box–Muller).
  Game logic never calls `Math.random()`. It's allowed only for purely cosmetic animation jitter.
  - Seeds come from `seedFor(state.meta.seed, purpose, index)`. `state.meta.seed` is set once when
    the save is created, from a hash of the account uid.
- **Game calendar**: `monthIndex` 0 = January 2033. `util/dates.js` has `monthLabel(i)`
  ("January 2033"), `daysInMonth(i)`, and `weekday(i, day)`, all from the real 2033–2040 calendar.
- **IDs**: kebab-case strings. Locations look like `pahoa` or `kailua-kona`. Home types are
  `apartment`, `shared`, `condo`, `house`, `build`.
- **Files** stay under ~400 lines. Split by responsibility before that. Every exported function
  gets a JSDoc line, and shared shapes are `@typedef`s in `types.js`.
- **State is immutable from the outside.** Change it only through `store.update(fn)` (§6). UI
  reads through `store.getState()` and `store.subscribe()`.
- **DOM**: build it with `h(tag, props, ...children)` from `ui/dom.js`. **Never put student-typed
  text (usernames, letters, form values) into `innerHTML`.** Use text nodes, or `escapeHtml()`
  from `util/escape.js` when building SVG or HTML strings.
- **CSS**: design tokens (colors, spacing, radii, fonts) live in `app/styles/tokens.css`, defined in
  bare `:root` first and then overridden for dark mode, following the Class Bank's pattern.
  - Component classes are prefixed per area (`plan-`, `pw-`, `life-`…). No CSS frameworks.
- **Copy**: short student-facing strings sit next to their component. Long or reused text
  (glossary, tips, explanations) goes in `app/src/content/`. Reading level is grades 6–7 (see `12-ux-content.md`).
- **Errors**: `main.js` installs one error boundary that shows "Something went wrong. Your progress
  is saved up to your last step." with a Reload button. Details only appear when dev flags are on.
- **Storage keys** for localStorage and sessionStorage start with `homeblocks:v1:`.

## 5. Boot sequence (`app/src/main.js`)

1. Read `config.js` and `firebase-config.js`. **Firebase mode** is on when
   `FIREBASE_ENABLED === true` and neither `?adapter=local` nor `?seed=` is present. Otherwise
   the game runs in **local mode**.
2. Pick the account provider (`accounts/provider.js`): Firebase or local. Both implement the same interface (§6).
3. If `?seed=` is present and dev flags are allowed (§7), sign in as the local `dev` user, load
   that fixture, and skip to step 6.
4. With no current user, mount the login/register screen. Continue once someone signs in.
5. Load the save through the persistence adapter. If there isn't one, create it with
   `createInitialState({uid, username, classCode})`. Then run it through `migrate()`.
6. Create the store and hook up autosave (§6).
7. Render the screen for `state.phase` via `ui/screens.js`, and re-render when the phase changes.
8. `admin.html` boots `admin/adminMain.js` instead. It uses Google sign-in in Firebase mode and a
   dev-only stub in local mode.

## 6. Cross-module contracts (keep these stable; later tasks depend on them)

**Store** (`state/store.js`):
`createStore(initialState)` → `{ getState(), update(fn, {checkpoint?: string}), subscribe(listener) → unsubscribe }`.
- `update` hands `fn` a `structuredClone` of the state. `fn` mutates it (or returns a new one).
  The store then swaps it in, bumps `meta.updatedAt`, and notifies listeners.
- Passing `checkpoint: '<reason>'` asks persistence to save right away (subject to throttling). See `02-state.md` §4.

**Persistence adapter** (`persistence/local.js`, `persistence/firestore.js`):
`{ kind, load(uid) → Promise<state|null>, save(uid, state, summary) → Promise<void> }`.
- The policy lives in `state/persistence.js`:
  - `attach(store, adapter, {uid})` subscribes to the store;
  - it saves checkpoints right away (at least `SAVE.checkpointMinGapMs` apart);
  - it saves drafts at most once per `SAVE.draftIntervalMs`;
  - it flushes on `visibilitychange: hidden` and `pagehide`.
- It exposes `status` (`saved | saving | offline | error`) for the header's save indicator.

**Account provider** (`accounts/local.js`, `accounts/firebase.js`):
`{ kind, init(), register({username, password, classCode}), login({username, password, remember}), logout(), current() → {uid, username, classCode}|null, onChange(cb) → unsubscribe }`.
- Methods throw `AccountError {code, message}`, and `message` is already student-friendly.
- In local mode, class codes come from `config.LOCAL_CLASS_CODES` (default `['DEMO']`).

**Screen** (`ui/screens.js`): each screen module exports
`mount(container, ctx) → unmount`, where `ctx = { store, accounts, persistence, config, dev }`.

**Paperwork step**: see `05-phase2-paperwork.md` §2. **Letter scoring**: see `06-letters.md` §4.
**Home generators**: see `08-3d.md` §5. **Month simulation**: see `09-phase4-life.md` §5.

## 7. Dev flags, seeds and debug handle

Dev flags only work in local mode, or when `location.hostname` is `localhost` or `127.0.0.1`.
They're silently ignored in production Firebase mode on the real domain.

| Flag | Effect |
|---|---|
| `?seed=<name>` | sign in as local `dev`, replace state with fixture `<name>`, render its phase |
| `?dev=1` | show the dev panel (jump to phase, reset, dump/download state, month/time controls) |
| `?dev=<gallery>` | render a dev gallery instead of the game: `gallery2d`, `scene`, `props`, `buildings`, `houses`, `blueprint3d` (tasks add these) |
| `?adapter=local` | force local mode even when Firebase is configured |
| `?emulator=1` | connect the Firebase SDK to local emulators (auth :9099, firestore :8080) with project `demo-home-blocks` |
| `?speed=<n>` | animation speed multiplier for the life animation (tests use 20) |
| `?care=hit\|miss\|half` | auto-resolve the care-button minigame (tests) |
| `?theme=light\|dark` | force a theme |

- **Seeds** live in `app/src/dev/seeds.js`, a registry of named functions that each return a full,
  valid state. **Every screen a task adds gets at least one seed that jumps straight to it**, and a
  matching line in `tools/smoke.txt`.
  - Naming: `<phase>-<situation>`, e.g. `plan-hilo-comfortable`, `paperwork-apartment-start`,
    `design-build-cozy`, `life-month1-house`.
- **Debug handle**: when dev flags are allowed, `window.__homesim = { store, getState, update, seeds, version }`.
- **Readiness**: every screen and gallery sets `document.body.dataset.ready = "1"` once it has
  finished rendering, including the first 3D frame. It resets that on unmount. `shoot.mjs` waits for this.

## 8. Verification tools

**`tools/serve.py`** serves `app/` on http://localhost:1271 for manual use, with `Cache-Control: no-store` on HTML.

**`tools/shoot.mjs`** (zero npm dependencies; Node ≥ 22 built-ins only):
- It starts its own static HTTP server for `app/` on a free port. `--base <url>` uses an existing server instead.
- It launches `/usr/bin/chromium`. Override the path with `$CHROMIUM`.
  - Flags: `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader
    --window-size=W,H --hide-scrollbars --mute-audio --no-first-run --no-default-browser-check
    --remote-debugging-port=0 --user-data-dir=<temp dir>`.
  - If launch fails with a sandbox error, retry with `--no-sandbox`.
- It connects over the Chrome DevTools Protocol (read `DevToolsActivePort` from the profile dir),
  using the global `WebSocket`.
- CLI:
  - `node tools/shoot.mjs --path "/index.html?seed=plan-hilo-comfortable" --out tools/shots/plan.png`
  - `[--size 1366x768] [--wait-ready] [--timeout 20000] [--steps tests/e2e/foo.json] [--allow-errors]`
- The steps file is a JSON array run in order. Supported steps:
  - `{"click": "<css>"}`
  - `{"type": ["<css>", "text"]}` (focus, clear, insert text, fire `input` and `change`)
  - `{"press": "Enter"}`
  - `{"wait": 500}`
  - `{"waitFor": "<css>"}`
  - `{"waitReady": true}`
  - `{"eval": "<js expression>"}` (the result is printed)
  - `{"assert": "<js expression that must be truthy>"}`
  - `{"shot": "tools/shots/name.png"}`
  - `{"goto": "/index.html?..."}`
- Output: console messages, uncaught exceptions, failed network requests (4xx/5xx on the same
  origin), eval results, and screenshot paths.
- Exit code 1 on any console error, uncaught exception, failed assert, or timeout, unless `--allow-errors` is passed.

**`tools/check.sh`** runs, in order, and stops at the first failure:
1. `node --check` on every `.js` file under `app/src` and `tools`;
2. `node --test tests/unit/` (when tests exist);
3. validate that `app/src/letters/model.json` and the data files import cleanly (once they exist);
4. `node tools/shoot.mjs --smoke tools/smoke.txt`, which opens **one browser session** and gives each line of
   `smoke.txt` (format `<name> <path>`) a fresh tab and a fresh storage context. It waits for readiness and saves
   `tools/shots/smoke-<name>.png`. Any console error fails that line, and the run reports every failing line.

It prints a one-line summary and must finish in under 3 minutes. A fresh browser per line would be too slow once
there are dozens of screens.

**Reading screenshots**: after taking a screenshot, open the PNG with the Read tool and look at
it. Say what you saw in the task's `PROGRESS.md` entry: layout, text, colors, anything broken.
A screenshot nobody looked at doesn't count as verification.

**Tests**: `node --test` files live in `tests/unit/*.test.js` and import from `../../app/src/...`.
Every pure module gets tests for its rules and edge cases, including the boundary values the spec calls out.

## 9. `app/src/config.js` (single source of tunables)

All numbers the spec calls "config" live here as named, commented exports grouped by area:
- `GAME_TITLE`, `START_YEAR`, `LOCAL_CLASS_CODES`
- `FINANCE`: down payment, mortgage rate, term, closing %, PMI, construction rate and down payment,
  contingency, fees, net→gross factor
- `AFFORD`: the ⅓ and ⅕ rules
- `CREDIT`: starting score and inquiry cost
- `LIFE`: hours, chores, day length, care-game settings, checking buffer
- `INVEST`: unlock threshold, reserve, portfolios
- `SAVE`: throttles
- `LETTERS`: browser spellcheck flag, bands
- `ACCOUNTS`: username and password rules, synthetic email domain
- `DEV_HOSTS`

A teacher should be able to change a rule by editing one number here.

## 10. Performance budget (Chromebook-class hardware)

- Initial load (login → plan) doesn't load three.js, the dictionary or Firebase.
  Aim for ≤ 600 KB of compressed JS+CSS for that path.
- 3D: pixel ratio ≤ 1.5, one shadow-casting light with a 1024² shadow map, ≤ 150 draw calls,
  ≤ 120k triangles, and static geometry merged per material.
  - Render on demand (controls change, resize, animation). Stop the loop when idle and when the tab is hidden.
  - Dispose geometries and materials on unmount.
- No layout thrash in the plan table. It's 100 cells: build it once and update classes.

## 11. Git

- `home-sim/` is its own repository (task 01 runs `git init`). Commit at the end of every task as
  `homesim NN: <title>`. Screenshots and `node_modules` are ignored.
- **Never add a remote, never push.** Don't rewrite history.

## 12. Privacy & safety

- No personal information: usernames are made-up game names, and letters remind students to use made-up names.
- The only network calls are to Google Fonts, gstatic (the Firebase SDK) and Firebase itself (in Firebase mode).
  No analytics and no third-party APIs. Letter scoring runs entirely in the browser.
- Businesses, landlords, lenders, inspectors, roommates and neighbors are all fictional. Don't use
  the names of real local businesses.
