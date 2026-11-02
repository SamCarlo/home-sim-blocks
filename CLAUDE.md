# Home & Life Sim — working guide

A browser game for the Life Skills course (grades 7–8, Pāhoa, Hawaiʻi Island). Students enter their class job's net
income and savings, pick a home from 20 places × 5 home types, do the real paperwork, design the home, then live
month by month from January 2033. Vanilla ES modules with an import map, no build step. It runs fully in local mode
(localStorage); Firebase is optional and teacher-configured. The spec is in `docs/spec/` (start with `00-overview.md`).
**Every task run follows [`docs/TASK_PROTOCOL.md`](docs/TASK_PROTOCOL.md).**
Teacher-facing docs: `README.md`, `docs/DEPLOY.md` (Firebase setup), `docs/TEACHER_GUIDE.md` (running the class, admin,
changing rules, adding a location). Keep their commands, labels and paths true when you change the UI or tools.

## Commands
- Serve: `python3 tools/serve.py` → http://127.0.0.1:1270 (`python3 tools/serve.py 8080` for another port)
- Test: `npm test` (= `node --test "tests/unit/*.test.js"`; Node 25 rejects a bare directory, see DEVIATIONS)
- Train the letter model: `npm run train:letters` (corpus → `app/src/letters/model.json`; `--dry` reports only)
- Check: `npm run check` (= `bash tools/check.sh`): syntax → unit tests → data imports → contrast → copy audit → smoke → lazy-plan network assertion. Run it before every commit.
- Contrast: `node tools/contrast.mjs [--quiet]` checks every text/background token pair in tokens.css (+ life.css time-budget
  ink) in both themes against WCAG AA. Add a pair to its `PAIRS` when you add a text or surface token.
- Shoot: `node tools/shoot.mjs --path /index.html --out tools/shots/x.png --wait-ready` (see Verification below)
- Playthroughs: `npm run test:e2e` (~2 min) runs `tests/e2e/play-{apartment-hilo,shared-honolulu,condo-miami,house-katy,build-pahoa}.json`
  (register → intake → cell → every paperwork step → results → design → 3 months at `?speed=20&care=hit` → summary)
  plus `play-relocate-hilo.json` (task 58: apartment → 2 months → Save → *Find a new place* → reloads mid-search and
  mid-paperwork → shared room → March; `buildRelocate` in the generator), two
  browsers at a time; `--only <name>` runs one. The JSON is generated: edit `tools/e2e/genPlaythroughs.mjs` and rerun
  `node tools/e2e/genPlaythroughs.mjs`. Each play fixes `meta.seed` right after intake, so draws are stable; the apartment
  sends a weak cover letter first (seed 7 → denied), then retries with `SAMPLE_LETTERS`. Forms are filled by
  `window.__play.fill(prefs)` (playHelper.js, injected by the first eval; quiz questions are answered by trying choices).
  Emulator: `mise exec java@temurin-21 -- npm run test:e2e:emulator` runs the apartment path on `?emulator=1` (resets the
  emulators and seeds `classCodes/DEMO`). Not part of `check.sh` (too slow); run it before task 57-style reviews.
- Rules tests (Firestore emulator, needs Java): `mise exec java@temurin-21 -- npm run test:rules` (~30 s). Java is a
  user-level mise install (`mise install java@temurin-21`, no sudo); always run the emulators through `mise exec`.
  `HOMESIM_FIREBASE=1 bash tools/check.sh` adds them to the check; the default check stays fast. `npm run test:firebase`
  runs every `tests/firebase/*.test.js` (tasks 50–52 add theirs there).
- Configure Firebase: `node tools/configure.mjs --config <json | pasted snippet file | -> --admin <email> [--project <id>]`;
  `--placeholder` restores the committed defaults. Never deploy or sign in to Firebase from a task run.
- Stop the server with `pkill -f 'python3 tools/serve.py'` from a *separate* command (a pkill pattern that matches your
  own shell line kills the shell too).

## Key rules (01 §3–§4)
- **Pure modules** (`util/ data/ finance/ letters/ life/`, `state/{schema,migrate,summary}.js`, `phases/plan/preview2d/`,
  `phases/design/blueprint/{model,validate,cost,templates,yard,moveIn}.js`, `phases/design/{buildingPlan,apartmentModel,housePlan,houseModel,sharedModel}.js`): no DOM, `window`, `localStorage`, `three` or network;
  relative imports only; importable from Node tests.
- three.js, the spelling dictionary and Firebase load lazily with `import()`; login, intake and the plan table never pull them in.
- Money is integer cents (format only at the UI edge with `util/format.js`); rates are decimals.
- Randomness is always seeded (`util/rng.js`, `seedFor(state.meta.seed, purpose, index)`). No `Math.random()` in game logic.
- `monthIndex` 0 = January 2033. IDs are kebab-case.
- State changes only through `store.update(fn, {checkpoint?})`.
- Build DOM with `h()` from `ui/dom.js`. Never put student-typed text into `innerHTML`; use `escapeHtml()` for SVG/HTML strings.
- Tokens live in `app/styles/tokens.css`; component classes are prefixed per area (`plan-`, `pw-`, `life-`…).
- Every tunable number lives in `app/src/config.js`, commented with its spec section.
- Storage keys start with `homesim:v1:`. Files stay under ~400 lines; exported functions get a JSDoc line.
- Every screen sets `document.body.dataset.ready = "1"` when rendered and clears it on unmount.
- Every new screen gets a seed in `app/src/dev/seeds.js` and a line in `tools/smoke.txt` (from task 02/04 on).
- Hawaiian words use the ʻokina and kahakō. All businesses and people are fictional.

## Verification (01 §8)
- **`tools/shoot.mjs`** drives headless Chromium over CDP with zero npm deps (plumbing in `tools/lib/cdp.mjs`). It starts
  its own static server on a free port, so you don't need `serve.py` running. Exit 1 on any console error, uncaught
  exception, `Log` error, same-origin 4xx/5xx or failed request, failed assert, or timeout.
  - Flags: `--path <url path>`, `--out <png>`, `--size WxH` (1366x768), `--wait-ready`, `--timeout <ms>` (20000, per wait),
    `--steps <json>`, `--allow-errors`, `--base <url>` (use a running server), `--keep-open` (leave the browser up; Ctrl+C),
    `--smoke <file>`.
  - Steps (JSON array): `{"click":css}` (real mouse at the center; `el.click()` when covered/zero-size), `{"type":[css,text]}`,
    `{"press":"Enter"}`, `{"wait":ms}`, `{"waitFor":css}`, `{"waitReady":true}`, `{"eval":js}` (prints JSON),
    `{"assert":js}`, `{"shot":png}`, `{"goto":path}`, `{"offline":bool}` (CDP network emulation; cuts same-origin too), `{"noRequests":[regex…]}` (fails if any URL the tab has requested so far matches; task 54). `tests/e2e/example.json` uses every one.
  - Relative `--out`/`shot` paths resolve against the cwd; smoke shots always go to `HS/tools/shots/smoke-<name>.png`.
- **Readiness**: shoot waits for `body[data-ready="1"]` with `--wait-ready`, `waitReady` and in every smoke line. A screen
  that never sets it times out.
- **Smoke**: `node tools/shoot.mjs --smoke tools/smoke.txt` runs one browser, fresh tab + fresh browser context (empty
  storage) per `<name> <path>` line, and reports every failing line. Add a line for every new screen/seed.
- **Look at screenshots**: open the PNG with the Read tool and describe what you saw in PROGRESS.
- **WebGL**: the spec flags (`--use-angle=swiftshader --enable-unsafe-swiftshader`) give WebGL2 on SwiftShader
  (renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))"). No extra flags are needed.
- External requests (Google Fonts, gstatic) never fail a run; only same-origin failures count.

## Folder map
```
app/index.html admin.html      entry pages (import map: three → vendor/, firebase/* → gstatic 12.19.0)
app/styles/                    tokens.css base.css components.css (+ one file per area: login.css intake.css plan.css portfolio.css forms.css paperwork.css letters.css design.css life.css)
app/src/main.js                boot (01 §5); error boundary; ?theme=light|dark
app/src/config.js              all tunables · firebase-config.js placeholder · types.js typedefs
app/src/util/                  escape.js format.js rng.js dates.js (pure)
app/src/finance/               money.js loans.js costs.js affordability.js grid.js · ledger.js (+ ledgerRecords.js
                               ledgerTotals.js) creditScore.js loanOptions.js buying.js build.js insurance.js creditCard.js underwriting.js (pure; see Finance helpers, Plan numbers, Ledger)
app/src/state/                 schema.js migrate.js summary.js (pure) · store.js · persistence.js (save policy)
app/src/persistence/local.js   localStorage adapter (homesim:v1:save:<uid>, …summary:<uid>)
app/src/persistence/firestore.js  Firestore adapter (saves/{uid} + players/{uid}.summary, homesim:v1:cloudcopy:<uid>; task 51)
app/src/ui/                    dom.js (h, clear, qs) · screens.js (registerScreen, renderPhase) · header.js · saveStatus.js ·
                               letterReport.js (renderLetterReport) · modal.js (openModal, confirmDialog) · icons.js · drawer.js (openDrawer) ·
                               portfolio/ (index.js openPortfolio + tabs; portfolioModel.js pure; settings.js applySettings;
                               agreementDoc.js registerAgreementDoc/agreementSchema)
app/src/forms/                 engine.js (renderForm) · fields.js (field kinds) · validate.js (pure rules + helpers)
app/src/dev/                   flags.js (devAllowed, getFlag) · galleries.js (?dev=<name> registry) · vendorCheck.js
                               seeds.js (fixtures) · designSeeds.js (design-* seeds, addDesignSeeds) · sampleLetters.js · devPanel.js (?dev=1) · gallery2d.js (?dev=gallery2d) · formsGallery.js (?dev=forms) · lettersGallery.js (?dev=letters) · sceneGallery.js (?dev=scene) · propsGallery.js (?dev=props) · stylesGallery.js (?dev=styles) · buildingsGallery.js (?dev=buildings) · housesGallery.js (?dev=houses) · blueprint3dGallery.js (?dev=blueprint3d) · lifeSeeds.js (life-* seeds, addLifeSeeds)
app/src/three/                 scene.js sky.js terrain.js landmarks.js materials.js · props.js propKit.js animals.js yard.js
                               character.js · styles.js styleParts.js styleSwatch.js · buildingGen.js buildingParts.js · houseGen.js houseYard.js · blueprintTo3d.js · homeRender.js
                               (browser only, import() lazily; see 3D scene)
app/vendor/                    three/ (+addons/) nspell/ dictionary-en/ vader/ · VERSIONS.md (pinned, licensed)
app/src/phases/<phase>/        one screen per phase (placeholders until their tasks); design/blueprint/ = the build editor
                               paperwork/: paperworkScreen.js · flow.js (pure) · steps/ (index.js registry, one module per step)
app/src/accounts/              provider.js (AccountError, validation, chooseMode, selectProvider) · local.js (PBKDF2, homesim:v1:accounts/session)
                               · firebase.js (Firebase Auth, synthetic email, lazy SDK; task 50)
                               ui/login.js (welcome screen: Log in / Create account tabs)
app/src/content/names.js       fictional people/businesses per region (pure, seeded) · tips.js · glossary.js (task 55)
app/src/letters/               types.js send.js score.js text.js allowlist.js spell.js grammar.js sentiment.js features.js
                               (pure) · model.json (task 27) · loadSpeller.js (browser, lazy dictionary)
app/src/data/                  enums.js sanity.js (03 §5 bands) validate.js homeTypes.js metrics.js styleFamilies.js ·
                               locations/{hawaii,cities,towns,index}.js (pure)
app/src/life/                  monthFlow.js homeDescription.js timeBudget.js events.js wellbeing.js market.js planMonth.js
                               finalizeMonth.js autopilot.js relocation.js (pure; Phase 4 rules; task 58: year fast-forward, moving)
app/src/admin/                 adminMain.js (sign-in by mode, console) · adminModel.js (pure: COLUMNS, rowFor, filter/sort, planReset/planTransfer)
                               dataSource.js (Firestore + local sources) · actions.js · classCodes.js · studentTable.js · studentDetail.js · csv.js
tests/unit/                    node --test files importing ../../app/src/…
app/favicon.svg                tab icon (also keeps /favicon.ico 404s out of shoot reports)
tests/e2e/                     shoot.mjs step scripts (example, persist, register, intake, plan-keys, choose-home …) · play-*.json playthroughs (generated)
tools/e2e/                     genPlaythroughs.mjs (writes play-*.json) · playHelper.js (window.__play) · run.mjs (npm run test:e2e)
tools/serve.py                 static server, port 1270 · tools/shots/ (gitignored)
tools/shoot.mjs lib/cdp.mjs    headless harness · check.sh · smoke.txt
tools/sim-months.mjs           12-month simulation printout (task 44)
tools/configure.mjs            Firebase setup: firebase-config.js + firestore.rules + .firebaserc (task 49)
firebase.json .firebaserc      hosting (public app/), emulators auth 9099 / firestore 8080 / hosting 5000, rules + indexes
firestore.rules.template       the rules source (edit this) → firestore.rules (rendered, committed with admin@example.com)
firestore.indexes.json         no composite indexes; saves.stateJson exempt from indexing
tests/firebase/                emulator tests (rules.test.js, accounts.test.js); not part of npm test
tools/letter-model/            corpus/<type>.json · logreg.mjs (pure LR math) · train.mjs (npm run train:letters)
docs/                          TASK_PROTOCOL, PROGRESS, OPEN_ITEMS, spec/
```

## Vendor (`app/vendor/`, see `VERSIONS.md`)
- Import `three` and `three/addons/…` by bare specifier (browser modules only). Pure modules import
  `../../vendor/nspell/nspell.js` and `../../vendor/vader/vader.js` by relative path; both also load in Node tests.
- nspell: `nspell(affText, dicText)`; the browser fetches `vendor/dictionary-en/index.{aff,dic}` (~550 KB), Node reads them with `fs`.
- VADER: `polarityScores(text) → {neg, neu, pos, compound}`.
- **Upgrading**: in a temp dir, `npm i three nspell dictionary-en vader-sentiment`, then
  - three: `npx -y esbuild node_modules/three/build/three.module.js --bundle --format=esm --minify --legal-comments=inline
    --outfile=app/vendor/three/three.module.min.js` (r186 has no prebuilt `.min.js`), and copy the two addons + LICENSE;
  - nspell / VADER: esbuild a one-line entry (`export { default } from 'nspell'`; VADER wraps
    `SentimentIntensityAnalyzer.polarity_scores` from `vader-sentiment/src/vaderSentiment.js`) with
    `--bundle --format=esm --platform=browser`; grep the output for `require(`/`node:` to be sure no Node built-ins remain;
  - Firebase: bump `<ver>` in the import maps of **both** `index.html` and `admin.html`.
  - Update `VERSIONS.md`, run `npm test` and the `?dev=vendor` shot.
- Dev galleries: add `name: () => import('./x.js')` to `dev/galleries.js`; the module exports `mount(root)` (sets ready,
  may return a cleanup) and gets a `tools/smoke.txt` line `<name> /index.html?dev=<name>`.

## Finance helpers (`app/src/finance/`, pure, integer cents, rates are annual decimals)
- `money.js`: `dollarsToCents(input)` (numbers, "3,200", "$3,200.50", "-$45"; null when unparseable) · `assertCents` ·
  `mulRate(cents, rate)` (the one rounding rule: half away from zero) · `sumCents(arr | ...n)` · `pctOf(part, whole)` →
  decimal ratio (0 if whole is 0) · `clampCents(c, min?, max?)` · `formatMoney(cents, {showCents})` (single source;
  `util/format.js` re-exports it; the old `{cents: true}` still works).
- `loans.js`: `pmt(p, rate, months)` (0% → ceil(p ÷ n)) · `amortizationSchedule` → `[{month, paymentCents, interestCents,
  principalCents, balanceCents}]` (last row absorbs rounding, ends at 0) · `totalInterest` · `pmiMonthly(loan, rate?)` ·
  `fhaLoan({priceCents, downPct?, annualRate?, months?})` (`config.FINANCE.fha`) · `constructionInterestReserve({loanCents,
  rate?, months, avgDrawnPct?})` · `cardPayoff({balanceCents, apr, minRule?})` → `{months, interestCents}`
  (`DEFAULT_MIN_RULE` = max($25, 1% + interest); Infinity if the minimum never covers interest).

## Ledger and credit (02 §2–§3, §6; 09 §6; `app/src/finance/`, pure)
**Money moves only through `finance/ledger.js`.** Every function mutates the state it's given (a `store.update` draft)
and returns a result, never a new state. Accounts `'checking' | 'savings' | 'card'`; a transaction's `amountCents` is +in /
−out, and on the card −amount = a purchase (balance owed up), +amount = a payment. Paperwork money uses month −1
(`PAPERWORK_MONTH`). Ids: transactions `t<n>`, recurring `r<n>`, loans `loan<n>`, agreements `ag<n>`, applications `app<n>`.
- Money: `post(s, {month, day?, label, amountCents, account, category})` → txn (never refuses; balances may go negative) ·
  `charge(s, account | [accounts], cents, {month, day?, label, category})` → `{ok, shortfallCents, txns}`; 'checking' draws
  checking → savings, 'savings' savings → checking, 'card' only the unused limit, or pass an order like
  `['checking', 'savings', 'card']`; **all or nothing** (short → nothing changes) · `transfer(s, from, to, cents, meta)` →
  `{ok, shortfallCents}` (category 'transfer'; to 'card' = card payment; from 'card' throws) · `available(s, account)` ·
  `accountValue(s, account)`.
- Recurring: `addRecurring(s, {label, amountCents, category, source, startsMonth, endsMonth?})` → item ·
  `updateRecurring(s, id, patch)` · `removeRecurring(s, id)` · `recurringFor(s, month)`.
- Loans: `openLoan(s, {kind, label, lender, principalCents, rate, termMonths, startMonth, priceCents, pmiCents?, escrow?})`
  (payment = `pmt`, `pmiUntilBalanceCents` = 78% of priceCents) · `payLoan(s, loanId, month)` → `{paymentCents,
  interestCents, principalCents, balanceCents, pmiDropped, paidOff}` or null; it only amortizes, **the cash is charged by
  the caller** (the housing recurring item). PMI drops at ≤ 78% and removes recurring items with `source: pmiSource(loanId)`
  (= `pmi:<loanId>`), so commit should tag the PMI line that way. The last scheduled payment clears rounding (matches
  `amortizationSchedule`). `closeLoan(s, id, month, reason)` (foreclosure).
- Records (`ledgerRecords.js`, re-exported): `addAgreement` (status 'pending') · `setAgreementStatus(s, id, status)` ·
  `addApplication(s, {kind, target, feeCents, at})` (pending; charge the fee separately) · `resolveApplication(s, id,
  {approved, reasons})` · `markUpfrontPaid(s, lineKey, cents)` (cellCost line keys: 'application', 'inspection',
  'appraisal', 'permit'…; stored in `paperwork.paidUpfront`) · `unpaidUpfront(s)` → snapshot upfront lines minus paid.
- Totals (`ledgerTotals.js`, re-exported; `state/summary.js` uses them): `cash(s)`, `netWorth(s)` (equity uses
  `home.purchasePriceCents`, else `choice.snapshot.priceCents`, else the open loans' `priceCents`) ·
  `ledgerSums(s)` (per-account sum of raw + compacted txns; `accountValue − ledgerSums` never changes) ·
  `compactHistory(s, {currentMonth?, keep = 24})` folds older lived months into `monthTotals` `{month, incomeCents,
  expenseCents, byCategory, byAccount}` (transfers excluded from income/expense); month −1 is always kept.
- `creditScore.js` (mutates `finances.credit`; each change logs `{month, delta, score, reasons}` in `history`, clamped
  300–850): `initialCredit()` · `recordInquiry(s, kind, month)` (−5; +5 back once it's > 12 months old) ·
  `monthlyUpdate(s, {allOnTime, missedCount, utilization, month, housingMissed?})` (+3 / +1 above 750, −10 / −25
  utilization, −60 per miss, streaks incl. `lateHousingStreak`) · `adjustScore(s, delta, reasons, month)` (e.g. foreclosure
  −150) · `utilization(s)`.

## Location data (03, `app/src/data/`, pure)
- `locations/index.js`: `LOCATIONS` (03 §1 order), `byId`, `REGION_LABELS`. Records follow 03 §2 exactly; money is cents
  (`usd(d)` helper inside each data file). All 20 records exist (`HAWAII`, `CITIES`, `TOWNS`). Unavailable cells: Pāhoa condo, Brooklyn build, Yellow Pine apartment +
  condo, and condo in Elkins, Clarksdale, Bisbee and Valentine. Montpelier's house price prints one cited sanity warning by design.
  Halifax money is stored in USD (CAD × `CAD_USD` 0.71, exported from `cities.js`); its `currency` is for display only.
  Don't write "U.S." in a blurb: the validator's sentence counter splits on ". ".
- `enums.js`: regions, settlements, biomes, `STYLE_FAMILIES` (16), `STYLE_VARIANTS`, `LANDMARKS` (20), `HAZARDS`,
  `COVERAGE_TYPES`, water/sewer/transport kinds, `HOME_TYPES`.
- `validate.js`: `validateLocation(loc)` / `validateLocations(list)` → `{errors, warnings}`; sanity-band misses
  (`sanity.js` `SANITY[id]`) are warnings. Every figure's source and verified/unverified status: `docs/DATA_SOURCES.md`.

## Plan numbers (04 §3–§6, pure)
- `data/homeTypes.js`: `HOME_TYPE_LIST` (column order: id, label, title, header, explainer, buying, utilityFactor, metrics
  adjustments, designMode), `HOME_TYPES_BY_ID`, `homeType(id)` (throws on unknown).
- `finance/costs.js`: `cellCost(location, typeId, config = FINANCE)` → `{available, naReason?, upfrontCents, monthlyCents,
  upfront: Line[], monthly: Line[], assumptions, project?}`; `Line = {key, label, cents, note}`; totals are the line sums.
  Pass `{...FINANCE, downPaymentPct: 0.2}` for other down payments. Also `buildProjectCost`, `requiredHazards`,
  `tableAssumptions()`, `pctText`. Required (`requiredForMortgage`) hazard premiums are a separate `hazard` line.
- `finance/affordability.js`: `classify(cost, {cashCents, incomeCents})` → `{status, icon, label, reasons}`; `STATUSES` = legend.
- `data/metrics.js`: `cellMetrics(location, typeId)` → 10 metrics `{key, label, icon, kind, value, max?, display, meaning}`.
- `finance/grid.js`: `buildGrid(state)` → `{incomeCents, cashCents, assumptions, groups[{region, label, rows[{location,
  cells[{locationId, homeTypeId, cost, status, metrics}]}]}]}`, memoized (same object) on income, cash, `DATA_VERSION`;
  `gridCells(grid)` flattens; `cashOf(state)` = checking + savings. Bump `DATA_VERSION` (locations/index.js) on data edits.

## State and seeds (02)
- New save: `createInitialState({uid, username, classCode, now})`; check with `validateState(s) → string[]`.
  A shape change bumps `STATE_VERSION` and adds `STEPS[oldVersion]` in `state/migrate.js` plus a test. Version 2
  (task 58) added `state.relocation` (null) and the `'autopilot'` life stage.
- Seeds: `dev/seeds.js` `seeds[name] = { phase, description, build(now) → state }` (or `addSeed`). Start from
  `baseState(now)`; `afterIntake(s, {netMonthlyIncomeCents, startingSavingsCents})` gives a plan-phase player.
  `tests/unit/state.test.js` validates every registered seed automatically. Current: `fresh`, `plan-comfortable`,
  `plan-tight`, `plan-rich`, `plan-after-denial` (denied Hilo apartment, $50 fee spent), `plan-detail-open` (same, Hilo
  apartment panel open), `portfolio-demo` (phase life, April 2033: Hilo house, mortgage with PMI, card, 11 bills,
  4 agreements, 2 scored letters, 3 applications, credit history), `paperwork-{apartment,shared,condo,house,build}-start`
  and `paperwork-apartment-cosigner` (built with `paperworkStart(now, {locationId, homeTypeId, income, savings})`),
  `paperwork-apartment-lease`, `paperwork-shared-agreement`, `paperwork-house-options`, `paperwork-pahoa-house-options`, the task 22 buyer seeds (earlier steps done via `finishSteps(s, ids, values)`;
  `SAMPLE_APPLICATION` = valid application answers for "Kai Mana").
- Calendar: `util/dates.js` `monthLabel/monthName/daysInMonth/weekday (0 = Sunday)/dayLabel`. Jan 1, 2033 is a Saturday.
- Save indicator: `renderSaveStatus(persistence.status)` from `ui/saveStatus.js`; the header shows it.
- Intake (04 §1): rules in `phases/intake/intakeModel.js` (pure, DOM-free; limits in `config.INTAKE`); `applyIntake(s, player)`
  writes player.*, savings (only while phase is 'intake') and phase 'plan'. e2e: `tests/e2e/intake.json` with `?seed=fresh`.
- Header: `renderHeader(phase, {user, onLogout, persistence, onPortfolio})`; main.js passes `onPortfolio` in every phase
  except intake. main.js calls `header.destroy()` before re-rendering it.
- Portfolio (task 17): `ui/portfolio/index.js` `openPortfolio({store, user, tab?, onClose?})` opens `ui/drawer.js`
  `openDrawer({label, title, content})` (left slide-over on the modal stack: focus trap, Esc, opener refocused).
  Tabs `accounts expenses agreements letters applications credit settings`; the open tab re-renders on every store
  change. Pure helpers in `portfolioModel.js` (`groupRecurring`, `loanProgress`, `letterList`, `creditGauge`,
  `creditHistory`, `whenLabel`); bands are `CREDIT.bands` / `creditBand(score)`. Settings write `state.settings` and
  `applySettings` mirrors them as `html[data-theme]` (absent = OS) and `html[data-reduced-motion]`; a dev `?theme=` wins
  until the player picks a theme. Restart = two `confirmDialog`s → `store.replace(createInitialState(user))` keeping settings.
  Dev: `?seed=portfolio-demo&open=portfolio&tab=<id>`; e2e `tests/e2e/portfolio.json`, `portfolio-restart.json`.

- Plan table (04 §5): `phases/plan/table.js` `createTable(grid, {onOpen, onClose})` → `{el, update(grid, {hideUnaffordable,
  denied, expanded, detail}), focusCell(key)}`; builds DOM once, recolors via `st-<status>` classes (plan.css sets
  `--st-accent/-bg/-line/-ink` per class; reuse them for status chips elsewhere). Pure rules in `tableModel.js`.
  e2e: `tests/e2e/plan-keys.json`, `tests/e2e/choose-home.json`. `lookup(key)` → the cell entry.
- Detail panel (04 §6): `phases/plan/detail.js` `renderDetail({cell, location, homeType, denied, mode, onClose, onChoose})`;
  pure rules + `applyChoice(s, cell, now)` (choice + snapshot, `freshPaperwork()`, phase 'paperwork') in `detailModel.js`.
  planScreen shows it inline when `(min-width: 900px) and (min-height: 720px)`, otherwise in a modal sheet. Seed `plan-detail-open`.
- Modals: `ui/modal.js` `openModal({label, content, className?, onClose?, initialFocus?})` → `{el, panel, close}` (focus
  trap, Esc/backdrop close, opener refocused, stacked so only the top modal handles keys); `confirmDialog({title, message,
  confirmLabel, cancelLabel})` → Promise<boolean>. Inline SVG icons: `ui/icons.js` `icon(key)`.
- 2D previews (04 §7, pure): `phases/plan/preview2d/index.js` `renderPreviewSVG({location, homeTypeId, seed?})` → SVG string
  (480×270, title/desc, caption chip, muted + "Not available here" for n/a cells). Layers: `backgrounds.js` `sky(biome, uid)`,
  `landmark(key)` (drawings in `landmarks.js`), `terrain/vegetation(biome, rng)`, props `mailbox fence car busStop
  catchmentTank people`; palettes in `palette.js`. The home: `buildings.js` `drawHome({location, homeTypeId, seed})`
  (apartment walk-up/mid-rise/tower, condo townhomes/low-rise/glass tower, shared = house + 3 figures, build lot), houses
  per family in `houses.js` `drawHouse(family, palette, opts)` → `{svg, porch}`, primitives + `GROUND` (238) in `shapes.js`.
  Gallery: `?dev=gallery2d&region=<r>&type=<id|all>` (default all 100); shoot at `--size 1600x1800` per region.
- Style families (08 §4, pure): `data/styleFamilies.js` `STYLE_FAMILY_DATA`/`STYLE_FAMILY_LIST`, `styleFamily(key, variant)`
  (merges `hillside`/`alaska`, incl. their `look`): palettes {wall, trim, roof, accent}, house traits, apartment + condo
  floorsBySettlement and traits, vegetation, props, `look` (3D, see Style families in 3D). Shared by 2D and 3D.

## Forms (05 §2/§4, task 18; `app/src/forms/`)
A paperwork document is a schema. `renderForm(container, schema, {values, state, onChange, onSubmit, readOnly})` →
`{el, values(), validate(), submit(), destroy()}`. `onChange(values)` fires on every edit (the caller throttles drafts);
`onSubmit(values)` only fires when `validateForm` is empty (otherwise errors show, a "N fields need fixing" line appears and
the first bad field gets focus). Errors show on blur and on submit, tied with `aria-describedby` + `aria-invalid`. The header
shows "3 of 8 required done". `readOnly` renders values as text (the portfolio's Agreements tab uses it).
```js
{ id: 'rental-application', title: 'Rental application', intro: '…', submitLabel: 'Sign and submit',
  sections: [{ id: 'you', title: 'About you', intro?, fields: [
    { id: 'employer', kind: 'text', label: 'Employer', required: true, width: 'half', maxLength: 40, hint: '…' },
    { id: 'move-in', kind: 'month', label: 'Move-in month', from: 0, to: 5, required: true },
    { id: 'rent', kind: 'computed', label: 'Rent', format: 'money', compute: (values, state) => cents },
    { id: 'landlord', kind: 'text', label: '…', required: true, when: (values, state) => values.history === 'rented' },
    { id: 'init', kind: 'initials', label: 'Initial each clause', required: true, clauses: [{ id: 'c1', text: '…' }] },
    { id: 'q1', kind: 'question', label: '…?', answer: 'c', choices: [{ value: 'a', label: '$75', why: 'shown when wrong' }, …],
      explanation: 'shown when right', required: true },
    { id: 'signature', kind: 'signature', label: 'Signature', required: true },
  ] }] }
```
- Value kinds: `text textarea number currency(cents) select radio checkbox month(monthIndex) phone signature initials question`.
  Display kinds: `computed` (`compute`, `format`: 'money' | 'money-cents' | 'percent' | 'month' | fn), `info` (`text` string or
  array, `tone` note/teach/warn), `clauses` (`items`), `table` (`columns [{key, label, align, format}]`, `rows` array or fn).
- Rules on any value field: `required`, `requiredMessage`, `pattern` + `patternMessage`, `minLength/maxLength`, `min/max`
  (cents for currency, monthIndex for month), `validate(value, values, state) → message|null`, `default` (value or fn(state)),
  `when(values, state)` (hidden fields skip validation). Values: question = `{choice, tries, correct, firstTry, wrong[]}`,
  initials = `{clauseId: 'KM'}`, unparseable number/currency input = the raw string (fails validation).
- Signatures check against `state.player.characterName`, forgiving ʻokina/apostrophes, kahakō, case and spacing (students
  can't always type an ʻokina); dated `FORMS.signDate` ("December 2032"). Initials = `deriveInitials(name)` (every word and
  hyphen part: "Keʻala Kahananui-Akana" → KKA). Phones must be fictional 555-01xx (`PHONE_RE`).
- Pure helpers in `validate.js`: `validateField/validateForm/requiredProgress`, `computeField`, `formatValue`, `displayValue`,
  `deriveInitials`, `initialsMatch`, `sameName`, `visibleFields`, `initialValues`.
- Agreements: `ui/portfolio/agreementDoc.js` `registerAgreementDoc(type, (agreement, state) → schema)`; the portfolio renders
  `agreement.docType ?? agreement.type`'s schema read-only with `agreement.docValues`, else a generic Terms / What you filled
  in document. Paperwork steps (19+) should store `docType: <step id>` and register their schema there (static import).
- Gallery `?dev=forms` (`&fill=1`, `&mode=readonly`); e2e `tests/e2e/forms.json`, `tests/e2e/portfolio-agreement.json`.

## Paperwork (05 §1–§3, task 19; `app/src/phases/paperwork/`)
- `flow.js` (pure): `STEP_ORDER[type]` (05 §3 table), `appliesTo(s, id)` (co-signer letter when income < 2.5 × rent,
  credit letter when score < 660; `UNDERWRITING` in config), `stepsFor(s)`, `stepStatus(s, id)` (stored done/skipped/draft,
  else locked/todo), `checklist(s)`, `nextStep(s)`, `allDone(s)`. Non-letter steps unlock in order; `LETTER_STEPS` only
  need their prerequisite; results needs everything. `completeStep(s, id, {values, upfrontKey})` pays the snapshot's
  upfront line (`payFee` → `charge('savings')` month −1 + `markUpfrontPaid`, all or nothing) then marks done.
  `withdraw(s, now)` = attempt `withdrawn`, pending records voided/denied, choice null, phase plan (fees stay spent).
- `steps/index.js` `STEPS`/`step(id)`; each `steps/<id>.js` default-exports `{id, title, kind, upfrontKey?, schema?, mount?,
  complete?}`. Placeholders come from `steps/placeholder.js` ("Mark done" only with `?dev=1`). The screen renders
  'form' + `schema` with `renderForm` (drafts on change, read-only when done), otherwise `mount(container, {store, config,
  state, status, values, onDone, onDraft})`. e2e: the `play-*.json` playthroughs (task 56).
- A step's `complete(s, values, now)` pays its own fees (`payFee`/`completeStep`), calls `setStep(s, id, 'done', …)` and
  returns `{ok, shortfallCents}`. Signed documents: store `docType: <step id>` + full `terms` on the agreement and register
  the schema builder in `phases/paperwork/docs.js` (the portfolio imports it), so the doc rebuilds from the agreement alone.
- Renter steps (task 20): `steps/renterTerms.js` `renterTerms(s)` (landlord, contact, phone, unit, rent, deposit, first month,
  fee, roommates; seeded) + `gameIdField` / `partiesFields`. `lease.js` `lateFee(day)` (config `LEASE`), `leaseClauses`
  (10 apartment / 8 room), `trapQuestions`, `trapScore` → `options.leaseTrapScore`. `roommate-agreement.js`
  `roommateComfort(values)` → `options.roommateComfort` (−1…1). `move-in-payment.js` → `options.moveIn` (no charge).
  Applications: kinds 'rental' / 'room'. e2e `tests/e2e/renter-apartment.json` (on paperwork-apartment-start),
  `renter-shared.json` (on paperwork-shared-agreement).
- Buyer steps (task 21): `mortgage-application.js` (`mortgageSchema`, `estimatedGross`; complete = `recordInquiry` −5 +
  pending application kind 'mortgage', no money). `finance/loanOptions.js` (pure) `loanOptions(state)` → `{priceCents, score,
  tier, cashCents, grossCents, lavaZone, strictLava, fixedLines, fixedCents, feesCents, options[8], cheapestMonthlyKey,
  leastInterestKey}`; each option has rate (credit tier applied), down/loan/upfront MIP, P&I, PMI/MIP, housing, total
  interest, closing, fees, reserves, cash to close, `disabledReason`. `findOption(r, paperwork.options)`, `optionKey`,
  `programBlock` (lava/FHA/credit rules). `loan-options.js` (kind 'choice', mount) stores `paperwork.options.{program,
  downPaymentPct, termYears}`. Seeds `paperwork-house-options` (Katy), `paperwork-pahoa-house-options` (Lava Zone 1);
  `SAMPLE_MORTGAGE_APPLICATION`. e2e `tests/e2e/mortgage-house.json` (on paperwork-house-start).
- Buyer documents (task 22): pure `finance/buying.js` (`config.BUYING`): `hoaReport`, `inspectionFindings`/`inspectionReport`
  (`inspectorFinds`: thorough finds all, standard misses termite/sewer specialty items, budget also misses `hidden` ones),
  `creditAsk`/`repairCreditDecision`, `appraisalResult`/`canPayGap`/`sellerLowersDecision`/`resolvePurchase`,
  `closingDisclosure`/`flagRow`/`closingOutcome`; all seeded by `buyingRng(state, purpose)` (save + place + attempt).
  Stored in `paperwork.options`: `hoa`, `specialAssessment` (+ a 'special-assessment' line pushed into the snapshot's
  monthly breakdown, so `loanOptions` counts it), `inspection {inspectorId, feeCents, company, found, decision, credit}`,
  `missedFindings [{month, label, cents}]` (task 44 surprise repairs), `repairCreditCents`, `appraisal`, `purchase
  {priceCents, appraisedCents, gapCents, resolution}` (`loanOptions` lends on min(price, value), adds the gap, subtracts the
  credit), `closing {agreedRate, finalRate, errorFlagged, wrongFlags, extraMonthlyCents}`. Walking away calls
  `withdraw(s, now, reason)`. Seeds `paperwork-condo-hoa` (Miami), `paperwork-house-{inspection,appraisal,appraisal-low,closing}`
  (Katy). e2e `tests/e2e/buyer-house.json` (on paperwork-house-inspection).
- Builder steps (task 23): pure `finance/build.js` (`config.BUILD`): `tierOf`, `designBudgetCents(loc, tier)` (sq ft × cost/sq ft
  × 1.10), `projectCost(loc, {tierId, bidId, extraMonths})` (= cellCost with the tier's sq ft and the bid's price/months),
  `tierTable`, `projectFor(state)`, `refreshBuildSnapshot(state)` (rewrites `choice.snapshot` for tier/bid/utilities),
  `lotListing`, `contractorBids`/`contractorRisk`/`bidMonths`, `permitChecklist`, `utilityOptions`/`siteUtilityPlan`/
  `defaultUtilities`. Stored in `paperwork.options`: `land` (listing, seller, earnestCents, contingency; earnest paid →
  `paidUpfront['down-payment']`), `buildTier`, `designBudgetCents` (minus utility upgrades) + `designBudgetBaseCents`,
  `project`, `contractorId`, `bid`, `contractorRisk` (Bid A only), `permit`, `siteUtilities`. Application kind 'construction'.
  Seeds `paperwork-build-{loan,bids,permit,utilities}` (Pāhoa, Cozy, Bid B), `SAMPLE_BUILD_VALUES`. e2e
  `tests/e2e/builder-pahoa.json` (on paperwork-build-start). Form display fields have no `data-field`: assert on `.fm-form` text.
- Insurance (task 24): pure `finance/insurance.js` (`config.INSURANCE`): `policyKind(type)` renters/condo/home,
  `insuredValueCents`, `basePremiumMonthlyCents`, `quotes` (Basic/Standard/Premium), `addOns` (required = locked for
  buyers/builders; renters/condo pay `addOnFactor` of the dwelling price; `provider` = HPIA in Lava Zones 1–2), `hurricaneDeductible`
  (FL), `insuranceOffer(state)`, `policyMonthlyCents`, `outOfPocket(loss, quote)`, `choosePolicy(state, {quoteId, addOns},
  {stepId, insurer})` → `options.insurance` (+ `recurring` draft) and `options.deductibleCents`, snapshot insurance/hazard
  lines rewritten, pending agreement type 'insurance'. UI: `phases/paperwork/insuranceShop.js` `insuranceStep({id, title})`
  (the three steps are one-liners), `policySchema` (registered in docs.js). Seeds `paperwork-{renters,condo,house,build}-insurance`
  (Hilo, Miami, Katy, Pāhoa build). e2e `tests/e2e/insurance-katy.json`.
- Letters (task 25, 06 §1–§2): pure `letters/types.js` `LETTER_TYPES[id]` / `letterType(id)` (ids = the six letter step ids:
  prompt, tips, greeting/closing examples, `groups[{id, label, keywords, patterns?}]`, `targetWords {min, max}`, recipientRole),
  `letters/send.js` (`wordCount`, `lengthStatus` empty/short/ok/long, `recipientFor(s, id)` → `{name, org, line}` seeded,
  `sendLetter(s, {type, text}, now, {speller})` → `letters['L<n>']` + `paperwork.letterIds`), `letters/score.js` `scoreLetter`
  (real since task 28, see Letter scores below). UI `phases/paperwork/letterBox.js` `letterStep(id)` (the six
  step files are one-liners; complete = send + `setStep` done with `{letterId}`). Steps with `stayOnDone: true` stay on
  their done view after `onDone`; mount ctx has `onNext()`. `finishSteps` sends `dev/sampleLetters.js` text for letter
  steps. Seed `paperwork-letter` (Hilo cover letter). e2e `tests/e2e/letter.json`.
- Letter checks (task 26, 06 §3 steps 1–5, all pure but loadSpeller): `letters/text.js` `normalizeText` (NFC, curly
  apostrophes, ‘ between letters → ʻokina; length-preserving, every index points into it), `foldKey` (lowercase, no
  ʻokina/apostrophes/kahakō), `tokenize`, `splitLines`, `splitParagraphs`, `splitSentences` (lines split at `.!?`, keeps
  Mr./Dr./a.m./initials). `allowlist.js` `isAllowed(word)`. `spell.js` `createSpeller({aff, dic, extraWords})` → `{correct,
  suggest, check(text) → {misspelled [{word, index, suggestions ≤3}], rate, words}}` (skips numbers, URLs, ≤4-letter
  acronyms, capitals mid-sentence and on short greeting/signature lines). `grammar.js` `GRAMMAR_RULES` (19, each `{id,
  message, suggestion, weight, test}`) + `checkGrammar(text, {type})`. `sentiment.js` `analyzeSentiment(text)` →
  `{compound, label, sentences, negSentenceRate}`. `features.js` `FEATURE_NAMES` (15) / `FEATURE_RANGES` /
  `extractFeatures(text, type, {speller})` → `{vector, named, issues, sentiment, wordCount, groupsHit}`. Browser:
  `loadSpeller()` (promise, fetches `vendor/dictionary-en` once) / `loadedSpeller()` (sync, null until loaded); the
  letter box preloads it on mount. Node: `createSpeller` with `fs` (see `tests/unit/letterChecks.test.js`). e2e
  `tests/e2e/letter-checks.json` (on paperwork-letter).
- Letter model (task 27, 06 §4): `tools/letter-model/corpus/<type>.json` (14 per type, `{id, type, label, note, text,
  split?}`, one object per line) → `train.mjs` (same `extractFeatures`, fs speller, z-scored, L2 batch GD, stratified
  5-fold CV) → `app/src/letters/model.json` `{version, trainedAt, features, mean, std, weights, bias, cv, test, corpus,
  hyper}`. Retraining is deterministic. `tests/unit/letterModel.test.js` retrains and fails if model.json is stale, so
  rerun `npm run train:letters` after changing features, grammar rules or the corpus. A wrong required sign or CV < 0.80
  writes nothing (exit 1); fix the corpus, not the math.
- Letter scores (task 28, 06 §3 steps 6–7, §5): `letters/score.js` `scoreLetter(text, type, {speller})` → `{likelihood
  0–100, band, bandLabel, sentiment, wordCount, issues, features, contributions[{feature, value, effect, message}],
  modelVersion, spellChecked}`; `predict(vector)`, `bandFor(likelihood)` (`LETTERS.bands`, each with an st-* `status`),
  `needsScore`/`rescorePending(s, {speller})` (main.js rescores stubs and speller-less scores on boot), `issueExcerpt`.
  Messages live in score.js `MESSAGES` (negSentenceRate and lexicalVariety never show). UI `ui/letterReport.js`
  `renderLetterReport({text, score})` (text nodes only). Portfolio Letters tab shows it, hidden by
  `portfolioModel.letterRevealed` for the paperwork attempt in progress until `paperwork.lettersRevealed` or Results done.
  Gallery `?dev=letters` (strong/middling/weak `REPORT_SAMPLES`).
- Underwriting (task 29, 05 §7, pure): `finance/underwriting.js` `decide(state, {speller})` → decision records `{id
  (<kind>-<attempt>), kind lease|cosigner|roommates|mortgage|construction|credit-card, label, required, approved, probability,
  draw, hardFail, factors[{label, value, note}], reasons, terms}`; `terms.upfront`/`upfrontCents` is exactly what commit
  charges. Draw = `drawFor(state, kind)` (seedFor(meta.seed, 'decision', kind, plan.attempts.length)). Mortgages reuse
  `loanOptions`/`findOption` + `options.closing.finalRate`; construction's 680 floor uses `options.pulledScore`. The card
  offer is read from `paperwork.options.card = {accepted, autopay, pulledScore}` (the tier uses pulledScore). `homeApproved(decisions)`, `letterFor(state, stepId)`.
- Commit (task 29, 05 §8, pure): `phases/paperwork/commit.js` `commitPaperwork(state, decisions, now)` → `{approved,
  chargedCents, loan, recurring, card}`; approved → upfront charged (month −1), loan opened, bills added (`recurringFor`,
  living costs with source 'living'), agreements active, applications approved, attempt 'approved', `home` set, phase
  'design'; denied → agreements void, applications denied, earnest refunded if `options.land.contingency`, attempt
  'denied', choice null, `freshPaperwork()` (letters and fee transactions stay), phase 'plan'. The card opens either way.
  Seeds `paperwork-ready-{apartment,shared,condo,house,build}` (Results next; apartment draws a denial, the rest approve).
- Results (task 31, 05 §8): `steps/results.js` (mount) decides once after `loadSpeller()` → `paperwork.decisions` +
  `lettersRevealed` (checkpoint 'paperwork-results'), shows decision cards (chance, factors, reasons, letter reports in
  `<details>`), then the money; Continue/Back to planning runs `commitPaperwork`. Pure numbers in `resultsModel.js`
  `resultsSummary(state, decisions, {letters})` → `{approved, receive, payNow, monthly, loan, lease, insurance, cardTerms,
  ifYouDontPay, nextSteps}` (reuses commit's `recurringFor`; `tests/unit/results.test.js` checks it against commit). Seeds
  `results-approved-house`, `results-denied-apartment` (decisions pre-stored). Design seeds: see Phase 3 below. e2e `tests/e2e/paperwork-apartment-full.json`
  (on paperwork-apartment-start; sets `meta.seed = 5` for an approving draw), `results-denied.json`.
- Credit card (task 30, 05 §6, 09 §6): pure `finance/creditCard.js` `offerFor(state, {score?})` (tiers in `CREDIT.card`; secured
  under 640 or 600), `minimumPayment(balance, interest)`, `cycle(card, {chargesCents, payFrom, autopay?})` → `{statementCents,
  interestCents, minimumCents, paidCents, carried, lateFeeCents, missed, balanceCents}` (interest only when
  `carriedLastMonth`; pure, the ledger moves are the caller's), `applyCycle`, `payoffExample(offer)`, `durationText`. Step
  `steps/credit-card-offer.js` (form; `cardSchema(terms)` also registered in docs.js): accept = inquiry −5 + pending
  'credit-card' application + pending agreement (docType 'credit-card-offer', `terms.attempt`) + `options.card = {accepted,
  autopay, pulledScore}`; decline = void agreement; one-time via `priorAnswer`. Seeds `paperwork-card-offer(-secured)`,
  `CARD_ACCEPT` values; e2e `tests/e2e/card-offer.json`.
- Names (05 §10): `content/names.js` (pure) `NAMES[region]` pools; `businessFor(s, kind)`, `peopleFor(s, purpose, n)`,
  `phoneFor(s, purpose)`, all seeded by save + place + attempt.

## 3D scene (08 §1–§3, task 32; `app/src/three/`, browser only)
- `scene.js` `createScene(container, {location?, biome?, landmark?, monthIndex, timeOfDay, interactive, seasons?, coastal?,
  homeTypeId?, seed?})` → `{scene, camera, renderer, controls, sky, terrain, info {calls, triangles}, nightFactor, season,
  setTimeOfDay(t), setSeason(mi), add, remove, frame(box3, {padding}), requestRender, start(fn(dt, s)), stop, dispose,
  firstFrame()}` or **null** when WebGL fails (the 2D preview + "3D isn't available" note is shown). Render on demand
  (controls, ResizeObserver, `requestRender`); the loop pauses when the tab is hidden. `frame` keeps the view direction, sets
  zoom limits (0.5–2.5×) and fits the sun's shadow camera. Pan is clamped to ±`SCENE3D.lotHalf`. Tunables: `config.SCENE3D`.
- `sky.js` `createSky({biome})`: gradient dome (ShaderMaterial), 700 stars, sun/moon discs, hemisphere + shadow-casting sun +
  moon light; `paletteAt(t, biome)` blends night/dawn/day (biome sky from preview2d `BIOME_PALETTE`)/dusk.
- `terrain.js` `createTerrain({biome, landmark, seasons, coastal, monthIndex, seed})` → `{group, setSeason, heightAt}`:
  per-biome `RECIPES` (ground, rolling, vegetation, extras urban/fence/lava/rocks/peaks), lot pad, water on the −X edge,
  landmark backdrop. Snow = white ground + hidden deciduous crowns; fall = recolored leaf materials.
- `landmarks.js` `addLandmark(batch, key, ctx)` for all 20 `LANDMARKS` (`LANDMARK_KEYS`).
- `materials.js`: `mat(color, opts)` (cached, flat-shaded), `ownMat` (uncached, for recoloring), `canvasTexture('siding'|'brick'|
  'shingle'|'metal'|'batten'|'log'|'stucco'|'ashlar'|'tile')`, `texturedMat`, `createBatch()` → `add(geo, material, {x,y,z,rx,ry,rz,s,sx,sy,sz})` / `build({castShadow,
  receiveShadow})` (one merged mesh per material), `disposeMaterials()` (called by `dispose`).
- Gallery `?dev=scene&biome=&t=&month=&landmark=&loc=` shows calls/triangles vs the budget; `window.__scene` is the handle.
  Current scenes: 9–18 draw calls, ≤ 13.5k triangles.
- Props (task 33, 08 §6): `props.js` is the one import: `createPlant(kind, {healthy})` / `setPlantHealth`, `createTree(kind,
  {season})` / `setTreeSeason` (`TREE_KINDS` 15; season = 'spring'|'summer'|'fall'|'winter' or `sc.season`; deciduous go
  bare in snow), `createAnimal(kind, {color})` (`ANIMAL_KINDS`; `userData.idle(seconds)`), yard items `createGardenBed
  createCoop createCatchmentTank(gal) createSolarArray(kw) createFence(points) createCar(color) createBusStop createMailbox
  createWoodpile createWindmill (idle) createStreetLamp (userData.setNight) createSlippers`, `triangleCount(obj)`,
  `instanceProp(proto, [{x,y,z,ry,s}])`. Base on y = 0, front +Z, feet. Build new props with `propKit.js` `merged((add) =>
  add(geoKey, material, {x,y,z,yaw,pitch,roll,s|sx,sy,sz}))` (keys ball0 ball1 dodec oct box (base at 0) cbox (centered)
  leaf prism cyl<n>[:top] cone<n>), `m(paletteKey | css)` and `pivot(name, [x,y,z], ...children)` for moving parts.
  Budgets in `config.PROPS3D` (tree 300, animal 400 triangles).
- Character (08 §7): `character.js` `createCharacter({shirt, pants, skin, hair})` → `{object, colors, walking, walkTo(points,
  ms?) → Promise<bool>, setVisible, update(dt)}`; 5.6 ft tall; `characterColors(seed)` for seeded defaults; speeds in
  `config.CHARACTER3D`. Gallery `?dev=props&focus=all|trees|yard|animals|plants|character&month=&walk=1&anim=1&decor=1`
  (`window.__props` = triangle counts).
- Style families in 3D (08 §4, task 34): each family in `data/styleFamilies.js` has a `look` (roof, pitch rise/run, eave,
  ridge 'x'|'z', wallTex/roofTex, window jalousie|sash|grid|storefront + windowExtra shutters|arched|tall, porch, base,
  rails, rooftop, trees (TREE_KINDS), extras). `styles.js` `styleKit(key, {variant, palette})` → `{look, palette, trees,
  m: {wall roof trim accent glow dark iron wood concrete glass metal stone brick lava sandstone}, setNight(f)}`; helpers write
  into a propKit `merged((add) => …)`: `addWalls`, `addRoof(add, kit, w, d, {y, shape, pitch, eave, ridge})` → ridge height
  (`makeRoof`), `addWindow`/`addWindowRow` (`makeWindowRow`), `addDoor`, `addGarageDoor`, `polyGeo`; `styleParts.js`
  (re-exported) `frame(add, {x,y,z,yaw})`, `texBox` (UVs in feet; use it for textured parts), `addBase` → floor height
  (`BASE_HEIGHT`), `addPorch`/`makePorch`, `addRail`, `addSteps`, `addFireEscape`, `addChimney`, `addRooftop('water-tank'|
  'ac'|'solar')`. `styleSwatch.js` `createSwatchHouse(key, {variant, palette, season})` (a template for task 37). Gallery
  `?dev=styles&family=&variant=&palette=&loc=&month=&t=` (`window.__styles` = triangles per swatch).
- Apartment/condo buildings (08 §5, 07 §2, task 35): pure `phases/design/buildingPlan.js` `planBuilding({style, variant,
  seed, kind, settlement})` → form (walkup | lowrise | tower | glass | townhomes), floors, floorH/groundH/podium, groundUse,
  firstFloor, cols × rows units (4–8/floor), unitW, width, depth, wallTex/wallColor, features; helpers `floorBase floorAt
  bodyHeight unitCell unitAt homeFloors`. `three/buildingGen.js` `generate({style, seed, kind, settlement, variant, unit,
  season})` → 08 §5 contract + `plan floorBands units setUnit(floor, unit)`; floors 1-based, units 0-based (row 0 = street).
  Form builders in `buildingParts.js`. Gallery `?dev=buildings&loc=&kind=apartment|condo&all=1&hl=<floor>[,<unit>]&seed=`
  (`window.__buildings` stats, `window.__pick(px, py)`); e2e `tests/e2e/buildings-pick.json`. Three buildings ≤ 135 calls.

## Phase 3: Design (07, `app/src/phases/design/`)
- `designScreen.js` routes by `home.kind`: apartment/condo → `apartmentPicker.js`, house → `housePicker.js`, shared →
  `sharedPicker.js`, build → `blueprint/editor.js` (task 39; 3D split view task 41).
- Apartment/condo picker (task 36, 07 §2): pure `apartmentModel.js` `buildingOptions(state)` → 3 × `{index, seed
  (seedFor(meta.seed, 'building', i)), name, plan, form, formLabel, amenities, floors}`; `unitTraits(locId, option, floor,
  unit)` → `{view, noise −1…1, sun, stairs (flights), lotsOfStairs}`; `lifestyleFor`, `traitNotes`, `unitLabel` ("Unit 4B" /
  "Townhome 3"), `addressLabel`, `plantsCost`; `moveIn(s, {index, floor, unit, plants})` charges plants (month −1, all or
  nothing) → writes `home` (building, label, address, plants, lifestyle), life month 0 stage 'welcome', phase 'life';
  the screen calls it with checkpoint 'design-finalized'. Tunables `config.DESIGN`. 3D in `pickerView.js`
  `createPickerView(stage, {location, kind, options, onPick})` → `{focus(index|null, floor?), highlight, pickAt, clickAt,
  screenOf, dispose}` (focusing slides the row; tall buildings zoom to the floor). `window.__design = {clickAt, screenOf,
  info(), sel}` for e2e. CSS `styles/design.css` (`dz-`). Seeds `design-apartment-hilo`, `design-condo-miami`; e2e
  `tests/e2e/design-apartment.json`.
- Houses (08 §5, 07 §3–§4, task 37): pure `phases/design/housePlan.js` `planHouse({style, styleVariant, seed, variant:
  'house'|'shared', palette?, sqft?, bedrooms?})` → `{main {w,d,stories,storyH,porchD,porchW,doorX}, houseZ, wings [{side
  left|right|back, x, z, w, d, stories}], footprint {minX,maxX,frontZ,backZ}, beds, baths, sqft, garage, driveX, fence,
  streetZ, row, hawaii, bikes, spots {beds[3], trees[2], coop, pet, porch}}`; `HOUSE_SHAPE` (main-block shapes, also the
  styles-gallery swatches), `FENCES`, `fruitTreeKind(biome, seed)`. `three/houseGen.js` `generate({style, seed, variant,
  palette, extras {gardenBeds, fruitTrees, coop}, styleVariant, biome, season, snow, sqft, bedrooms})` → 08 §5 contract +
  `plan kit info`; body = styleSwatch `addBody`/`addExtras` + wings + `houseYard.js` `addYard` (lawn, sidewalk, path,
  driveway, picket|iron|ranch|hedge|lava|block fence) in one merged mesh; repeated props are instanced. Gallery
  `?dev=houses&loc=&variant=house|shared&seed=&palette=&extras=0|1` (`window.__houses`). Single houses 79–108 calls.
- House picker (task 38, 07 §3): pure `houseModel.js` `listings(state)` → 3 × `{index, seed (seedFor(meta.seed,'house',i)),
  plan, sqftTarget, bedrooms, address, sqft, beds, baths, lotAcres, yearBuilt, quirk, priceCents, palette, fruitKind}`;
  `QUIRKS`, `normalizeCustom`, `customLines/customCost`, `afterCustom(state, c)` → `{leftCents, ok, low}`, `quirkModifiers`,
  `moveInHouse(s, {index, palette, gardenBeds, fruitTrees, coop, pet})` (charges each line from savings→checking at
  month −1, refuses if short) → `home.house`, plants, animals, `lifestyle`, `modifiers`. Tunables `DESIGN.house`.
- Shared picker (task 38, 07 §4): pure `sharedModel.js` `sharedOptions(state)` → 3 × `{seed, plan, address, rooms[2–3],
  roommates[2] {name, age, traits [3 pair picks + hobby]}, rentCents}`; `roommateEffects(mates, agreementRules(state))`;
  `moveInShared(s, {index, roomId, plants})`. Tunables `DESIGN.shared`. Both pickers use `houseView.js`
  `createHouseView(stage, {location, variant})` → `{show({seed, palette, extras, sqft, bedrooms, pin}), info, current,
  firstFrame, dispose}` and `pickerParts.js` (pickerShell, section, chips, stepper, rerender). Seeds `design-house-katy`,
  `design-shared-honolulu`; e2e `tests/e2e/design-house.json`, `design-shared.json`.
- Blueprint editor (task 39, 07 §5; `phases/design/blueprint/`): pure `model.js` (feet, origin front-left, y toward the
  back; every edit returns a NEW blueprint and prunes openings off their wall): `createBlueprint(lot, {solarKw,
  catchmentGallons})`, `lotOf(loc)`, `editWindow` (120 ft window), `buildArea(bp)` (setbacks ∩ window on the 2 ft grid),
  `addRoom/moveRoom/resizeRoom/removeRoom/setRoomType`, `wallsOf/sharedWalls/exteriorWalls/adjacency`,
  `toggleOpening(bp, {kind, x, y})`, `roomName` ("Bedroom 2"), `footprintArea`, `weightedArea` (Σ area × multiplier),
  `findFreeSpot`. `validate.js` `validateBlueprint(bp)` → `{errors, warnings}` `[{code, message, roomIds}]`. `templates.js`
  `TEMPLATES`, `applyTemplate(bp, id)`, `templateBlueprint(id, lot, opts)`. `tools.js` (pure drag/keys/history),
  `canvas.js` (SVG strings; street at the bottom, so SVG y = depth − y). `editor.js` mounts it; the draft is
  `state.home.blueprint`. Room types + limits in `config.BLUEPRINT`. Seeds `design-build-pahoa` (empty),
  `design-build-template` (Cozy); e2e `tests/e2e/design-build.json` (synthetic pointer drags via `window.__drag`).
- Blueprint features (task 40): Door/Window tools call `toggleOpening(bp, {kind, x, y, tol})`. `validateBlueprint(bp,
  {location, budgetCents, included})` (get the opts from `moveIn.js` `buildContext(state)`) adds reachability
  (`reachableRooms` BFS from outside doors), bedroom windows, catchment (`location.water === 'catchment'`), budget and
  yard-overlap errors plus one-exit / dark-living / bath-kitchen warnings, and returns `cost`. Pure `cost.js`
  `blueprintCost(bp, location, {included})` → `{lines [{id, group house|shell|openings|yard, label, detail, cents}],
  totalCents, byGroup}`; solar/catchment already chosen in site utilities (`included`) aren't charged again. Pure
  `yard.js`: `addYardItem` (closest free spot behind the house; driveway at the street), `moveYardItem`, `removeYardItem`,
  `setFence` (outline of the editing window). `panels.js`: `outsidePanel`, `yardPanel`, `budgetPanel`, `checksPanel`.
  `moveInBuild(state, bp)` refuses with errors, else writes home.blueprint/build/plants/animals and phase 'life'.
  Tunables `BLUEPRINT.yardKinds/cost/roofStyles/sidings/…Colors/maxSolarKw/catchmentSizes`. e2e
  `tests/e2e/design-build-features.json` (`window.__tap(lotPoint)`, `window.__pick(focusKey, value)`).
- Blueprint 3D (task 41, 08 §5): `three/blueprintTo3d.js` `build(bp, {style, styleVariant, palette, biome, season, snow,
  seed})` → 08 §5 contract + `{kit, info {rooms, walls, openings, yard}}`. The street (lot front, bp y = 0) is at
  z = `BLUEPRINT.view3d.streetZ` (46), x = bp.x − lot width / 2. One merged mesh per material: lawn (edit window),
  sidewalk, slabs (lānai = deck + posts, no outside walls), exterior wall segments + each shared wall once (texBox 0.5 ft,
  9 ft), doors/windows facing out (`addDoor`/`addWindow`), interior doors as panels, garage doors, a roof per room
  (`addRoof`, pitch from `view3d.pitch`), driveway/patio/rain garden; beds/plants/fruit trees instanced, coop, fence, car on the
  driveway, solar array behind, catchment tank beside. The kit = the family's look with the student's siding/roof
  textures and colors (storefront windows become grid). Builds take ~50–60 ms; templates are 65–91 calls, ≤ 14k tris.
  `blueprint/view3d.js` `createBlueprintView(container, {location, palette, seed})` → `{update(bp) (debounced
  view3d.debounceMs), rebuildNow, scene, pending, builds, info, current, firstFrame, dispose}`; frames on the first build
  and when the first room appears, otherwise keeps the camera. The editor calls `view3d.update(bp)` in `save()` (every
  commit/undo/redo); `window.__blueprint.view3d`. `moveInBuild(state, bp, {pet})` adopts a pet from savings. Gallery
  `?dev=blueprint3d&template=tiny|cozy|family&loc=&yard=0|1&roof=&siding=&t=&month=` (`window.__bp3d`); e2e
  `tests/e2e/design-build-3d.json` (template → rebuild → camera kept → Move in with a cat → phase life).
- `scene.setPanLimits({half, yMax})` widens the pan clamp (default ±`SCENE3D.lotHalf`, look-at y ≤ 40).

## Phase 4: Life (09, `app/src/phases/life/`, task 42+)
- `three/homeRender.js` `renderHome(state, {season, nightFactor})` → 08 §5 contract (bounds = the generator's framing box)
  + `{generator, plants [{id, object}], animals [{id, object}], character, setLiving(home), info}`: apartments/condos via
  buildingGen (setUnit + highlight the unit), houses via houseGen with the listing's sqftTarget/bedrooms (`listings(state)`),
  shared via houseGen `variant: 'shared'`, builds via blueprintTo3d (seed `seedFor(meta.seed, 'build')`). Pots at
  plantSpots, a vegetable plant per garden bed, chickens around the coop spot, pets in the yard; fruit trees are the
  generator's. Props don't cast shadows (draw-call budget). Tunables `config.LIFE3D`.
- `phases/life/lifeView.js` `createLifeView(container, {state})` → `{scene, home, info, refreshNight, setLiving, firstFrame,
  dispose}` (towers > 80 ft frame the student's floor). `window.__life = {view(), info(), description()}`.
- Pure `life/monthFlow.js`: `STAGES`, `CORE_CHOICES`, `WELLBEING_DOMAINS`, `currentStage`, `welcomeTitle(mi)` ("Welcome to
  January, 2033."), `recap(state)` → `{line, warnings}`, `defaultChoices` (last month's or `LIFE.defaults`), `canLive`,
  transitions `startPlan / setChoice / startLive / finishLive / nextMonth` (mutate a draft; nextMonth pushes `{monthIndex,
  choices, result}` to `life.history`), `wellbeingBars` (change = last result's wellbeingAfter − wellbeingBefore),
  `moneyStrip`. Pure `life/homeDescription.js` `describeHome(state)` (the sr-only 3D description), `livingThings(home)`.
- `lifeScreen.js`: money strip (`moneyStrip.js`) on top; 3D stage with the wellbeing card (`wellbeingCard.js`) over it; the
  right panel = `PANELS[stage]` with `[data-slot=questions|live|summary]` placeholders for tasks 43/45/47; each stage change
  is a checkpoint ('life-plan', 'life-live', 'life-summary', 'life-month'). CSS `styles/life.css` (`life-`; the money items
  use `m-<key>` because `.card` is a global class). Seeds `life-month1-{apartment,shared,condo,house,build}` in
  `dev/lifeSeeds.js` (design seeds run through their real Move in). e2e `tests/e2e/life-month1.json`, `life-flow.json`.
  A panel may call `onUpdate(fn)` to get later store changes in place instead of being rebuilt (plan does, so focus survives).
- Time budget (task 43, 09 §3–§4): pure `life/timeBudget.js` `timeBudget(state, choices)` → `{waking 112, segments [{key,
  label, hours, color 'tb-*'}], usedHours, freeHours, rating {key, label, color, mentalDelta, physicalDelta, note}, chores}`
  (missing answers = 0 h); `freeTimeRating(h)` (`LIFE.freeTime`), `commuteHours(loc, type)`, `choresHours(home, choices)`
  → `{hours, parts}`, `hoursText` ("25 h", "−3 h"), `hourlyNetCents`, `overtimePayCents(state, monthlyHours)`,
  `socialCostCents(state, weeklyHours)` (planMonth must charge these), `homeGardenOptions(home)` ([] = question hidden).
  `phases/life/questions.js` `renderQuestions({state, choices, onChoose})` → `{el, update(choices)}` (`QUESTIONS` = exact
  wording; `.lq[data-question=<key>] .lq-opt[data-value=<v>]` role=radio, arrows/Home/End answer); `timeBudgetView.js`
  `renderTimeBudget(budget)` → `{el, update(budget)}` (`.tb[data-rating][data-color]`, `.tb-over` overflow). Choice keys
  exercise / extraWork (h per month) / social / deepPractice / homeGarden ('garden'|'cat'|'chickens'|'none', reset monthly).
  Seed `life-plan-filled` (Hilo, plan stage answered); e2e `tests/e2e/life-plan.json`, `life-plan-overbooked.json`.

- Month simulation (task 44, 09 §5–§8, 10 §4): `startLive` runs `planMonth(state, choices)` → `current.plan` {monthIndex,
  days, hours, income, events [{day, id, label, message, category, amountCents, insured?, wellbeing?}], market, care
  {needed, count, schedule}}; `finishLive` runs `finalizeMonth(state, plan, choices, {careShown, careHits})` (mutates the
  draft) → `current.result`. Order: income → housing (never the card) → utilities & insurance → living/lifestyle/events
  (checking → savings → card, item by item; uncovered = `wentWithout`) → card cycle → late fees → `payLoan` → sweep above
  $1,000 → `monthlyUpdate` → care → investments × path end → wellbeing → eviction/foreclosure at `lateHousingStreak` 3
  (phase 'plan', attempt 'evicted', `plan.notice`, month pushed to history, no summary). `monthBills(state, choices)` →
  {housing, utilities, living, lifestyle}. Events: `EVENT_TABLE` (text, `when`) + config `EVENTS` (numbers), `pickEvents`,
  `lossCharge` (deductible or capped loss). Wellbeing: `wellbeingDeltas(ctx)` [{domain, delta, reason}] + `applyWellbeing`
  (config `WELLBEING`, pull `LIFE.wellbeing.pullPct`). Market: `gbmPath`, `marketPaths`. Randomness:
  `monthRng(state, mi, stream)` (streams events, care, care-loss, adopt). Check balance changes with
  `node tools/sim-months.mjs <life seed> 12 <meta.seed> [--income $] [--savings $] [--choices json]`.

- Live this month (task 45, 09 §9): pure `life/timeline.js` `buildTimeline(plan, choices)` → `{monthIndex, days [{day, label
  "Tue, January 14", weekday, weekend, out [t0,t1]|null, events [{…, toast "Car repair −$450"}], care [{index, day,
  fraction}]}]}`, `routineFor`, `momentAt(tl, ms, dayMs)` → `{index, day, t, done}`, `placeAt(day, t)` → inside|home|yard|out
  (tunables `LIFE.routine`, `LIFE.toastMs`, `LIFE3D.yardOffset`). `phases/life/animation.js` `createAnimation({plan, choices,
  view, wrap, dayBar, reduced, speed, speedFlag, onSpeed, onEnd})` → `{el (speed buttons + Pause + progress), timeline,
  setSpeed, pause, resume, seek(day, t), paused, moment, speed, onDay(fn), onTick(fn), dispose}`; lifeScreen starts it when
  the live panel and the 3D view are both ready and runs finishLive in onEnd. `window.__life.animation()` is the handle.
  `?speed=N` multiplies the speed; reduced motion (setting or OS) shows the `.life-calgrid` instead of moving the sun.
  Seed `life-live-house` (plays on load); e2e `tests/e2e/life-live.json` (`?seed=life-plan-filled&speed=20`),
  `life-live-reduced.json`. In e2e, skip a month with `{"eval": "window.__life.animation().seek(31, 0.98)"}`.

- Care minigame (task 46, 09 §10): pure `life/care.js` `CARE_TEXT`, `careWindows({items [{index, gameMs}], nowGameMs,
  monthGameMs, rate, windowMs, busyUntil})` → real-ms windows `[{index, start, end}]` from now (recomputed every frame =
  re-timing), `careWindowMs(settings)` (`longCareWindow`), `careAutoResult(flag, count)`, `careSpot(rng)`, `careNotes(home,
  result, needed)` → `[{kind rate|kept|wilted|neighbor|tip, text}]` (12 §7 wording, Auntie Noe). `phases/life/careButton.js`
  `createCareGame({plan, anim, wrap, settings, seed, flag})` → `{el (tally), result() → {shown, hits}, showNext(), dispose}`;
  buttons `.life-care-btn` in `.life-care-layer`, W key, sr-only status announcement, `.life-care-splash`. lifeScreen writes
  `result()` into `current.care` just before finishLive and shows careNotes in the summary slot; `view.syncHome(state)`
  (lifeView) applies alive/present and rebuilds the home when plants/animals were added. animation.js extras: `rate`,
  `dayMs`, `onSeek(fn)`, `holdEnd(fn)` (month waits while a button is up). `?care=hit|miss|half` skips the buttons.
  `window.__life.care()`. e2e `tests/e2e/life-care-{hit,miss}.json` (`?seed=life-live-house&theme=light&speed=20&care=…`),
  `life-care-play.json` (`?seed=life-live-house&theme=light`, real buttons at 4×).

- Summary & year in review (task 47, 09 §11): pure `life/monthReport.js` `moneyRows(result, plan)` → `{income, expenses,
  incomeCents, expenseCents, netCents}` (rows always sum to the result; `EXPENSE_GROUPS`), `wellbeingRows(result)` (before →
  after + reason chips), `housingNotice(result, lateHousingStreak, homeKind)` → `{level first|final, title, text, tryNext}`,
  `isHousingWarning`, `yearReview(history, year)` → totals, net worth start/end (`result.netWorthBeforeCents`), best/worst
  month, 13-point `trends`, `sparkPoints`. `content/tips.js` `TIPS` (24) + `tipFor(mi)`. `phases/life/summary.js`
  `renderSummary(state)` (sections `.life-sum-sec[data-sec=money|bills|events|wellbeing|care|invest]`, `.life-notice[data-level]`
  on top, `.life-tip`; careNotes kept); `yearReview.js` `renderYearReview(state, {onContinue(text)})` (`.life-yr-spark` ×5,
  counselor line, `.life-yr-text`). Stage 'review' follows every December's summary (`isYearEnd(mi)`), then
  `finishReview(s, text, now)` → `life.reflections`. The summary/review buttons live in `.life-plan-foot .life-go`.
  Seeds `life-summary` (Katy, January summary), `life-overdue` (Hilo, February summary, final notice), `life-year-review`
  (Hilo, 12 months lived, review stage). e2e `tests/e2e/life-two-months.json` (`?seed=life-plan-filled&theme=light&speed=20&care=hit`),
  `life-year-review.json`.

- Investments (task 48, 10): pure `life/investments.js` `checkUnlock(s)` (startPlan calls it; `INVEST.unlockCents`),
  `maxInvest` (cash − `INVEST.reserveCents`, ≥ 0), `validateBuy/validateSell(state, key, text)` → `{ok, cents, error}`,
  `buy(s, key, cents)` (savings → checking) / `sell(s, key, cents)` (→ savings, basis cut in proportion), both 'transfer'
  txns; `typicalYearRange(p)` (10th–90th pct), `valueAt(state, market, pos)` → `{startCents, valueCents, pct, byKey}`
  (pos = fractional days, tweened), `monthSeries`, `historySeries`, `lastMonthGrowth`, `sparkLine`. `phases/life/investPanel.js`
  `renderInvestPanel({state, mode plan|live|summary, onBuy, onSell})` → `{el, update, tick(v, series)}` (null while locked;
  forms disabled in live). lifeScreen's `investBlock` saves checkpoint 'invest'; panels get ctx `onTick(fn)`;
  `startTicker` moves `moneyStrip.tick({investments, net})` each frame. Seeds `life-invest` (intro), `life-invest-held`
  (February plan with holdings), `life-invest-live`; e2e `tests/e2e/life-invest.json`, `life-invest-live.json`.

## Firebase files and rules (11 §4–§5, §7–§8, task 49)
- `firestore.rules` is generated: edit `firestore.rules.template` (`__ADMIN_EMAIL__` marker), then
  `node tools/configure.mjs --placeholder` (or with the real config). `tests/unit/configure.test.js` and the rules test
  both fail if the committed rules drift from the template.
- `tools/configure.mjs` exports `parseFirebaseConfig` (JSON, `{firebaseConfig: …}`, or the console snippet; only the
  `firebaseConfig = {…}` literal runs, in an empty `vm` sandbox), `checkEmail` (lowercases), `checkProject`, `renderRules`,
  `renderConfigJs`, `renderFirebaserc`. Writes only changed files and prints created/updated/unchanged per file.
- `tests/firebase/rules.test.js`: `@firebase/rules-unit-testing` with the compat API (`ctx.firestore().doc(…).get()`).
  Identities: students = `authenticatedContext(uid, {email: '<username>@players.example.com', firebase:
  {sign_in_provider: 'password'}})`; admin = `admin@example.com`, `email_verified: true`, provider 'google.com'.
  `beforeEach` clears Firestore and seeds two codes (IO-P3 active, OLD-P1 inactive), players lani-uid and paused-uid
  (disabled) with saves. `setLogLevel('silent')` hides the SDK's PERMISSION_DENIED noise.
- Emulator ports: auth 9099, firestore 8080, hosting 5000; UI off; project `demo-home-sim` (a `demo-` project never
  touches the cloud). The firestore emulator jar downloads to `~/.cache/firebase/emulators` on first run.

## Firebase accounts (11 §1–§2, task 50)
- `accounts/provider.js` `chooseMode({enabled, params, hostname, devHosts})` → `{firebaseMode, emulator}`: Firebase when
  `FIREBASE_ENABLED`, **or** `?emulator=1` on localhost/127.0.0.1 (works with the placeholder config); `?seed=` /
  `?adapter=` always stay local. `selectProvider({firebaseMode, emulator, config})`.
- `accounts/firebase.js` `createFirebaseProvider({config, emulator, appName?, sdk?, browser?})`: lazy `import('firebase/…')`
  (import map in the browser, npm `firebase` in Node, so the same module runs in Node tests). `EMULATOR` (ports + demo
  config), `emailFor(username)`, `friendlyError(err)` → AccountError (11 §2 table, `FIREBASE_MESSAGES`). Register = code
  `getDoc` → createUser → `players/{uid}` (summary `{phase:'intake', monthIndex:0}`) → `deleteUser` on a failed write.
  Login/init read `players/{uid}`: disabled → "Your account is paused…", missing → refused; both sign out. Persistence:
  session, or local when "keep me logged in". The provider exposes `db`/`auth` getters for task 51's adapter.

## Firestore saves (11 §4, §6, task 51)
- main.js picks `createFirestoreAdapter({db: accounts.db, firestore: accounts.sdk.firestore})` when the provider is
  Firebase (seeds stay local). The provider opens Firestore with `persistentLocalCache` + multi-tab manager in the browser.
- `save(uid, state, summary)`: writes the localStorage copy, then one `writeBatch` (saves doc with exactly
  `stateJson/version/updatedAt/saveCount`; `players/{uid}` `{summary, updatedAt}` only when the policy passes a summary).
  `batch.commit()` resolves on server ack, so offline the one in-flight write waits and the policy `stash`es newer states.
  `stats = {commits, docWrites}`. Over 899,999 chars → `{ok:false, code:'too-big'}`.
- `load(uid)`: server (or cache) vs local copy via pure `pickNewer`; a newer copy sets `takePendingPush()` and main.js
  pushes it with `saveNow('local-copy-newer')`. `forget(uid)` on logout when saved.
- Policy with `adapter.remote`: status "offline" on the `offline` event and while a write waits offline; `online` →
  "saving"/flush/"saved". `attach(…, {summarized})` skips the first summary; `summaryKeyFor(state)` = `phase|monthIndex`.
- Tests: `tests/firebase/saves.test.js` (adapter on the emulator + `firebase-saves.json`, `firebase-offline.json`);
  `tests/unit/firestoreAdapter.test.js` (fake firestore module with a `gate` promise to simulate an offline commit).
- Emulator tests: `tests/firebase/accounts.test.js` (Node provider tests + shoot runs of `tests/e2e/firebase-register.json`
  and `firebase-errors.json` on `/index.html?emulator=1&theme=light`). Seed the emulator over REST with
  `Authorization: Bearer owner` (skips rules); reset with `DELETE …/emulator/v1/projects/demo-home-sim/accounts` and
  `…/databases/(default)/documents`. Node providers need a unique `appName` each and `deleteApp` in `after()`, or the
  test process never exits (emulators:exec then hangs).

## Admin console (11 §3, task 52; `app/admin.html`)
- Sign-in: Firebase mode → Google popup (redirect fallback); `?emulator=1&fakeAdmin=<email>` signs in with a fake Google
  credential (emulator only); local mode → "Local admin (dev only)" (`?localAdmin=1` skips the button). Its Firebase app is
  named 'admin'. Email ≠ `ADMIN_EMAIL` → "This account isn't the admin"; the rules are the real lock.
- `dataSource.js`: one interface (`listCodes createCode setCodeActive deleteCode listPlayers loadSave writeSave(uid, state,
  summary, extra?) updatePlayer deleteClass`). Local codes live in `homesim:v1:classCodes` and the local provider uses them.
- Every action confirms (`actions.js`); delete class data needs the typed code. Actions write the summary themselves.
- Tests: `tests/unit/admin.test.js`; emulator `tests/firebase/admin.test.js` (shoot `tests/e2e/admin-flow.json`,
  `admin-not-admin.json`). Dev: `window.__admin`, `body[data-detail-ready]`.

## Production checks (task 53)
- `dev/flags.js` `devFlagsAllowed({enabled, hostname, devHosts})` is the pure gating rule; `devAllowed()` wraps it, and
  `chooseMode` uses it so `?seed=`/`?adapter=` can't force local mode on the deployed site. Read every new URL flag
  through `getFlag()` or `devAllowed()`.
- `tests/unit/production.test.js` fails on any `console.log` under `app/` (use `console.warn`/`console.error`), on cache
  headers drifting from 11 §8, and on non-app files (logs, tests, maps, dotfiles) inside the hosted `app/` folder.
- Admin class codes use `ACCOUNTS.classCodePattern` (4–12 chars), the same check as the student form.

## Accessibility (12 §4, task 54)
- Phase changes: `ui/screens.js` focuses the new screen's first h1/h2 (tabindex -1, `.screen-focus`) unless the screen focused
  something itself. Titles you focus programmatically need `tabindex: '-1'` (`.pw-step-title`, `.fm-title`) or focus() silently fails.
- Reduced motion = OS setting or `html[data-reduced-motion]`; base.css zeroes transitions/animations for both. Check both in new CSS.
- Blueprint keyboard path: "Your rooms" buttons select a room and focus the SVG. e2e: `tests/e2e/a11y-focus.json` (focus shots),
  `tests/e2e/life-leak.json` (10× life mount/unmount, `sc.memory()` / `sc.leftover`), `tests/e2e/lazy-plan.json` (in check.sh).

## Copy and glossary (12 §1, §5–§6, task 55)
- `content/glossary.js` `GLOSSARY[id] = {word, def, example}` (all 40 of 12 §5 in `REQUIRED_TERMS`), `glossaryEntry(id)` throws
  on a typo. `ui/term.js` `term(id, text?)` → a `<button class="term">` (dotted underline) with one shared fixed
  `#term-tip` (role=tooltip, aria-describedby while open): hover, focus and tap open it; Esc, blur or a second tap close it.
  `wordsToKnow(ids, cls)` → a "Words to know: …" line. Never nest `term()` inside another button (portfolio cards, radio cards):
  use a `wordsToKnow` line beside it. Paperwork steps get theirs from `phases/paperwork/stepTerms.js` `STEP_TERMS[stepId]`.
- `node tools/copy-audit.mjs [--worst N]` (in check.sh): Hawaiian spelling in UI string literals (ids/CSS skipped) and the
  pooled Flesch–Kincaid grade of sentence-like strings (≤ 7; was 4.24 at task 55). dev/, admin/, three/ aren't scanned.
- tokens.css `HS Okina` / `HS Okina Serif` faces map only U+02BB–02BC to local Noto/Roboto/Arial: the web subsets of Plex and
  Fraunces lack the ʻokina and Chrome fell back to a CJK font with wide gaps. `HS Okina Serif` also takes the kahakō vowels
  (U+0100–0101, 0112–0113, 012A–012B, 014C–014D, 016A–016B): Fraunces' latin-ext subset puts their macron over the next
  letter (task 57). Check display-font Hawaiian at a large size (`tools/shots/t57/kahako-*.png` shows how).

## Gotchas
- `ui/screens.js` `renderPhase(container, ctx)` mounts `ctx.phase` if given (e.g. `'login'`), otherwise the store's phase.
- `main.js`: `?seed=` → `local-dev` user + fixture (saved at once, no login); otherwise `accounts.current()` or the login
  screen, and `accounts.onChange` starts the game on sign-in. Log out (header) flushes, detaches, signs out, shows login.
  `ctx` also carries `user`. `window.__homesim` = `{store, getState, update, seeds, version, persistence, accounts, user}`.
- A fresh profile lands on login: e2e scripts that need a player register through the UI first (see `tests/e2e/persist.json`).
- Accounts: `AccountError {code, message, field}`; friendly text lives in `accounts/provider.js` `MESSAGES`. The local
  provider takes `{local, session, crypto}` so Node tests use `globalThis.crypto` and a Map-backed storage shim.
- Checkpoints within 5 s of the last one are *queued*, not dropped; a reload in that window still saves through the
  `pagehide` flush. In unit tests pass `attach(store, adapter, {clock, events})` (see `tests/unit/persistence.test.js`'s fake clock).
- `store.replace(state)` swaps the whole state (seed load, reset) as a checkpoint. Listeners get `(state, {checkpoint, prev})`.
- `shoot.mjs` uses a top-level `await`: module-level `const`s it needs must be declared *above* that block (TDZ).
- three r186 has no `PCFSoftShadowMap` (warns and falls back); use `PCFShadowMap`.
- `Box3.setFromObject` before the first render: call `scene.updateMatrixWorld(true)` first, or the box is empty/at the origin.
- Draw calls ≈ 2 × visible meshes (the shadow pass draws casters again): instance repeated props (`instanceProp`) and
  merge static parts into the main build.
- The OS on this machine prefers dark, so plain headless shots come out dark; pass `?theme=light` for light.

## Moving and the year fast-forward (task 58, after the 57 build tasks)
- **Live a year**: pure `life/autopilot.js` `liveYear(s, {months?})` (plan stage + `canLive`, else null) runs
  `LIFE.autopilot.months` months through monthFlow (startPlan → choices copied, homeGarden 'none' after month 1 → startLive →
  care = count/count → finishLive → nextMonth; December's 'review' closed by `finishReview(s, '')`). Stops after a month
  with a missed housing payment (`stoppedReason 'missed-housing'`) or on eviction ('evicted', save already in Plan). Ends at
  stage `'autopilot'` with `life.current.autopilot = {fromMonth, toMonth, monthsLived, stoppedReason, cat}`;
  `finishAutopilot(s, text, now)` → welcome (+ `life.reflections` `{kind: 'autopilot', …}`). Every run calls `addBlackCat`
  (stray: `monthBills` skips strays' food; homeRender passes `a.color`). UI: `.life-year` in the plan foot's
  `.life-go-row`, recap `phases/life/autopilotRecap.js` (`rangeReview(history, from, to)` in monthReport.js; `yearReview`
  wraps it; `spark` exported from yearReview.js). Seed `life-autopilot-done`; e2e `tests/e2e/life-autopilot.json`
  (`?seed=life-plan-filled&theme=light`).
- **Moving**: pure `life/relocation.js`. `canRelocate` (Live, welcome/plan stage) → `startRelocation(s)` sets
  `state.relocation = {startedMonth, stage, from {kind, locationId, label}}` and phase 'plan'; **`state.home` stays the old
  home** until approval. `moveOutQuote(state)` → `{kind sell|break-lease|end-lease, lines, netCents}` (owners: price −
  `RELOCATION.sellingCostPct` − `homeLoans` payoff; renters: `activeLease` deposit back − `LEASE.breakMonths` × rent inside
  `terms.startMonth + termMonths`). `finance/grid.js` `cashOf` adds `pendingMoveOutCents` (so the plan table,
  loanOptions, underwriting and Results all see it); underwriting's other debts skip closed loans and, while moving, the
  home loan. `canCancelRelocation`/`cancelRelocation(s, now)` (plan/paperwork only; `withdraw`s any attempt, phase 'life',
  life.current untouched). `commitPaperwork` calls `moveOut(s)` before `chargeUpfront` on approval (posts the quote at
  month −1, `closeLoan(…, 'sold')`, removes all recurring, non-card agreements → `'ended'`, cats/dogs → `relocation.pets`,
  `movedOut: true`). New bills/loans start at `baseMonth(state)` = `life.monthIndex` (commit.js; resultsModel's
  `monthly.baseMonth`). Every move-in ends with `startLife(s)`: **keeps `life.monthIndex`** (also fixes re-homing after an
  eviction), welcome stage, carried pets re-id'd, `home.pickDraft` and `relocation` cleared.
- Dates: `util/dates.js` `moveDates(mi)` → `{signLabel, moveInLabel}`; `forms/validate.js` `signDateLabel(state)` (signature
  fields, closing disclosure, paperwork sub-title); `renterTerms` has `startMonth` + matching `startLabel`; `addAgreement`
  stamps `signedMonth` when monthIndex > 0 and the portfolio renders documents with that month. Credit inquiries use
  `ledger.inquiryMonth(state)`.
- UI: `ui/relocationBar.js` `renderRelocationBar(store)` (main.js puts it between header and screen in plan/paperwork;
  `.reloc-cancel` → confirm → `cancelRelocation`, checkpoint 'relocation-cancelled'); lifeScreen `.life-move` (welcome and
  plan panels, confirm lists the quote, checkpoint 'relocation-started'); planScreen labels cash "Cash after moving out".
  Results shows a "Moving out of / Selling your old home" table. Seeds `life-relocating` (Hilo, April), `life-relocating-house`
  (Katy sale). e2e `tests/e2e/life-relocate-cancel.json` (`?seed=life-plan-filled&theme=light`) and `play-relocate-hilo`.
- **Save and resume**: header `onSave` → `.header-save` (`persistence.saveNow('manual-save')`, shows "Saved" for 1.5 s).
  Paperwork remembers `paperwork.activeStep` (reopened unless locked); the apartment/house/shared pickers keep their
  selection in `home.pickDraft` via `pickerParts.js` `savedPick(state, defaults, valid)` / `rememberPick(store, sel)`.
- Older e2e scripts `design-{apartment,house,shared}.json` and `renter-apartment.json` already failed before task 58 (they
  wait for placeholders that later tasks replaced: `.placeholder .phase-tag`, `.pw-dev-done`).

## Current status
All 57 build tasks are done (2026-10-03), plus task 58 (moving and the year fast-forward, same day). Every requirement R1–R40 in `docs/spec/99-original-request.md` §3 is verified
there with its evidence. What's left is in `docs/OPEN_ITEMS.md` (only the teacher's Firebase setup and an optional
rename). History: `docs/PROGRESS.md`. Before shipping a change run `bash tools/check.sh` and `npm run test:e2e`.
