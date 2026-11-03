# Open items

Anything a run couldn't finish, or anything that needs the teacher. Newest at the bottom. When an item is resolved,
mark it ✅ with the date and who resolved it.

## For the teacher
- [ ] **Firebase setup**: about 15 minutes on the free Spark plan, no credit card. It's only needed before students play
  online; the game is fully built and tested in local mode first.
  - **Follow `docs/DEPLOY.md`** (click by click, written for a first-time Firebase user; task 53). It covers creating the
    project, the configure command, `npx firebase-tools deploy --only hosting,firestore`, checking the deploy, and
    troubleshooting. Running the class afterward: `docs/TEACHER_GUIDE.md`.
  - In short: (1) create a Firebase project on the Spark plan; (2) add a Web app and copy its config; (3) turn on
    Authentication → Email/Password and Google; (4) create a Firestore database; (5) run
    `node tools/configure.mjs --config <pasted config file> --admin <your Google email>`; (6) run
    `npx firebase-tools login`, then `npx firebase-tools deploy --only hosting,firestore`; (7) open the site, sign in at
    `/admin` with Google and create a class code. DEPLOY.md has every click.
  - Until then the game works fully in **local mode** (`python3 tools/serve.py`, class code `DEMO`), saved in each
    browser only.
- [ ] *(Optional)* Rename the game with `GAME_TITLE` in `app/src/config.js`. The working title is "Home & Life Sim".

## For the build
- [x] ✅ 2026-10-03, task 55: `HS Okina` unicode-range faces in tokens.css (local Noto Sans/Serif etc. for U+02BB). **ʻokina spacing (task 20)**: in the UI sans font the ʻokina renders with visible space around it ("Hawai ʻ i",
  "ʻ Āina") in computed fields and intros (see tools/shots/t20/*). Likely a font fallback for U+02BB. Fix by loading a
  font subset that includes U+02BB or adding a fallback family with the glyph in `tokens.css`; check 12 §6.
- [x] ✅ 2026-10-03, task 57: the Fraunces latin-ext subset draws every kahakō vowel's macron over the next letter; tokens.css
  `HS Okina Serif` now also covers Āā Ēē Īī Ōō Ūū with a local serif. **Kahakō in the display font (task 21)**: the paperwork title "House in Pāhoa" (Fraunces, `.pw-title`) appears to
  render without the macron in tools/shots/t21/4-pahoa-loan-options.png although the string is "Pāhoa". Probably the same
  font-subset problem as the ʻokina item above; check the Fraunces subset includes U+0100–U+017F.
- [x] ✅ 2026-10-02, task 29: the floor now checks `options.pulledScore` (see DEVIATIONS). **Construction credit floor (task 23 → 29)**: 05 §7 hard-fails construction loans under 680, but `CREDIT.startingScore`
  is 680 and the construction loan application's hard inquiry drops it to 675, so every build would be denied. Fix in task
  29: check the score from before the inquiry, lower the floor to 660, or raise the starting score; record it in DEVIATIONS.

## Block Edition (blocks task 24 review, 2026-11-02)
- [ ] **Remove `?view=classic` when the teacher is happy with the block view** (13 §8 kept it "until task 24"; the teacher
  hasn't seen the block view in class yet, so it stays). To remove it: in `app/src/phases/life/lifeScreen.js` delete the
  two `getFlag('view') === 'classic'` checks (the `exploreCtx` line, ~215, and the `import('./lifeView.js')` branch, ~281),
  so the block view always mounts and Explore is always offered; then delete `phases/life/lifeView.js` (and
  `three/homeRender.js` only if `grep -rn "homeRender" app/src tests` finds nothing else); fix the comment in
  `life/homeMenu.js`; update README ("What's different"), TEACHER_GUIDE ("Chromebook tips") and CLAUDE.md; run `bash tools/check.sh` and
  `npm run test:e2e`.
- [ ] **Firebase for the Block Edition is a separate project** (13 §1). Same steps as the item above, but create a *new*
  Firebase project; never reuse the classic game's project (saves are schema v3).
- [ ] *(Optional, build)* The block perf/leak/a11y/reduced-motion scripts (`tests/e2e/blocks-{perf,leak,a11y,reduced-motion}.json`)
  and `blocks-credits.json` are not in `check.sh` or `npm run test:e2e`. Before a big change run each with
  `node tools/shoot.mjs --path "<path in the script's first line / CLAUDE.md>" --out /tmp/x.png --wait-ready --steps tests/e2e/<name>.json`.
- [ ] *(Optional, build)* House customization palettes other than palette 0 use the nearest-tint existing style blocks
  (blocks task 09, DEVIATIONS). If the teacher wants exact repaint colors, append per-palette block sets to
  `world/blocks.js` (append only) and map them in `voxHouse.js` `paletteBlocks`.
