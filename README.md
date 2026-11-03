# Home & Life Sim: Block Edition

*Plan it. Sign it. Build it. Live it.*

A browser game for the middle school Life Skills course in Pāhoa, Hawaiʻi Island (grades 7–8). Students enter the net
income and savings of their class job, pick a home from 20 real places × 5 home types, do the real paperwork (applications,
a lease or loan, insurance, letters scored by a small in-browser model, a credit card offer), design the home, then live
month by month from January 2033 while budgeting their time, money and wellbeing.

It's vanilla JavaScript modules with no build step. It runs completely in the browser (local mode) and can optionally be
put online with Firebase so students have accounts and the teacher has an admin console.

**Block Edition.** This folder is a fork of the classic game (`interfaces/home-sim`) whose Phase 4 is a block world of the
student's home (spec: [`docs/spec/13-blocks.md`](docs/spec/13-blocks.md)). It runs on port 1271 and saves under
`homeblocks:v1:`, so it never touches classic saves. Online, it needs its **own** Firebase project: its saves are a newer
format (schema v3), so never point it at the classic game's project.

## Status

Finished (November 2026). All four phases work for all five home types, and all 40 requirements from the teacher's
request are checked off in [`docs/spec/99-original-request.md`](docs/spec/99-original-request.md) §3. The Block Edition
(24 build tasks) is done too: every section of [`docs/spec/13-blocks.md`](docs/spec/13-blocks.md) has a "Verified" line
in `docs/PROGRESS.md`. It runs today in local mode. Putting it online for a class needs the teacher's one-time Firebase
setup (about 15 minutes, see [`docs/DEPLOY.md`](docs/DEPLOY.md)) in a **new** Firebase project.

## What's different from the classic game

Everything before Life (login, intake, the Plan table, paperwork, design) and every rule of the month is the same. What
changed is the Life phase:

- The home is drawn in **blocks** (1 block = 1 meter): the house, apartment, condo, shared house or student-built home,
  with furniture inside, the street and neighbors that fit the place (fields in the country, towers in a big city) and
  the place's landmark far off (Kīlauea's plume, the Manhattan skyline…).
- The month plays out the same way: the blocky character walks out each day, windows light up at night, plants wilt
  without care, animals hide when they're gone.
- A **My home** button opens three choices: **Explore & build** (walk around in first person and place or break blocks
  on your own property), **Upgrade this home** (pay only for what's new) and **Find a new place to live** (the classic move).
- Builds are saved with the game. They survive reloads, upgrades and cancelled moves. Moving to a new home starts a new
  world (the game says so before you confirm).
- Credits for the borrowed engine and textures are in **Portfolio → Settings → Credits**.

The old 3D view is still there for comparison: add `?view=classic` to the address (see `docs/OPEN_ITEMS.md`).
The full student handout (controls, building rules) is in [`docs/TEACHER_GUIDE.md`](docs/TEACHER_GUIDE.md), "The block world".

## Docs

| For | Read |
|---|---|
| Putting it online (Firebase, click by click) | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Running it with a class, the admin console, discussion prompts, changing rules | [`docs/TEACHER_GUIDE.md`](docs/TEACHER_GUIDE.md) |
| Working on the code (commands, modules, conventions, gotchas) | [`CLAUDE.md`](CLAUDE.md) |
| The full design spec | [`docs/spec/00-overview.md`](docs/spec/00-overview.md) (start here), then `docs/spec/` |
| Where the location figures come from | [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) |
| Known gaps and things waiting on the teacher | [`docs/OPEN_ITEMS.md`](docs/OPEN_ITEMS.md) |
| Build history | [`docs/PROGRESS.md`](docs/PROGRESS.md) |

## Running locally

Needs Python 3 (to serve the files) and, for tests, Node.js 20 or newer.

```
python3 tools/serve.py
```

Open http://127.0.0.1:1271. Use another port with `python3 tools/serve.py 8080`. Stop it with Ctrl+C.

In local mode everything is saved in that browser's storage. Register with any username and the class code `DEMO`.
The admin console is at http://127.0.0.1:1271/admin.html (click **Local admin (dev only)**); it sees the accounts in
that same browser.

Dev shortcuts (they work in local mode and on localhost only; the deployed site ignores them):
- `?seed=<name>` jumps to a fixture state (names in `app/src/dev/seeds.js`), e.g. `/index.html?seed=plan-comfortable`;
- `?dev=1` opens the dev panel; `?dev=<gallery>` opens a component gallery (`app/src/dev/galleries.js`);
- `?theme=light` or `?theme=dark` forces a theme.

## Tests

```
npm install            # once: Firebase SDK + CLI for the emulator tests (nothing global)
npm test               # unit tests (node --test)
bash tools/check.sh    # the full check: syntax, unit tests, data imports, smoke screenshots of every screen
npm run test:e2e       # eight full playthroughs: one per home type (each builds a block), moving, two upgrades (~4 min)
```

`tools/check.sh` must end with `check: OK` before every commit. The smoke step drives headless Chromium through
`tools/shoot.mjs`, so Chromium must be installed.

Firebase emulator tests (rules, accounts, saves, admin) need Java 21:

```
mise exec java@temurin-21 -- npm run test:firebase
```

## Project structure

```
app/                 the website (this folder is what Firebase Hosting publishes)
  index.html         the game · admin.html the teacher console
  styles/            CSS (tokens.css holds colors and sizes)
  src/config.js      every tunable rule and number
  src/firebase-config.js   written by tools/configure.mjs (placeholder = local mode)
  src/               accounts/ admin/ data/ finance/ forms/ letters/ life/ phases/ state/ three/ ui/ util/ dev/
  src/world/         the block world: block registry, generators, saves (pure, Node-testable)
  vendor/            pinned third-party libraries (three.js, nspell, dictionary, VADER, block engine, Kenney textures) with licenses
tests/unit/          Node unit tests · tests/e2e/ browser step scripts · tests/firebase/ emulator tests
tools/               serve.py · check.sh · shoot.mjs (headless screenshots) · configure.mjs (Firebase setup) · letter-model/
docs/                DEPLOY, TEACHER_GUIDE, spec/, PROGRESS, OPEN_ITEMS, DATA_SOURCES
firebase.json        hosting, cache headers, emulators · firestore.rules.template → firestore.rules
```

## Licenses and content

Third-party libraries are listed with versions and licenses in `app/vendor/VERSIONS.md`, and credited in the game
(Portfolio → Settings → Credits). The block engine is vyse12138's three.js block engine (MIT, pinned commit); the block
textures are Kenney's Voxel Pack (CC0). No textures, sounds or names from any commercial block game are used. Every person and business in
the game is fictional. Location prices are 2025–26 figures; sources are in `docs/DATA_SOURCES.md`.
