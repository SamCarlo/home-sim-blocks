# 00 — Overview

Home & Life Sim (working title; `GAME_TITLE` in `app/src/config.js`) is a browser game for
the Life Skills course (grades 7–8) at a public charter school in Pāhoa, Hawaiʻi Island.
Students are 12–14 years old and play on school Chromebooks (1366×768 is the common screen).
The course is grounded in Hawaiʻi (see
`middle school curriculum/health/life skills/life_skills_syllabus.md`): about one lesson in ten is
about local wages, local hazards and local values (kuleana, mālama, ʻohana).

The teacher's original request is in `99-original-request.md`. It is the final word on intent.
Where this spec adds detail, it adds it in the spirit of that request; where it had to decide
something, the decision is listed in §5.

## 1. The game in one paragraph

A student types in the net monthly income of the job they were assigned in class and their
savings. They see a spreadsheet of 20 real places × 5 kinds of homes, color-coded by what they can
afford, and open any cell to see a picture, a cost breakdown and lifestyle facts. They pick one and
do the real paperwork: applications, a lease or loan, an inspection, insurance, letters that a
small machine-learning model scores, and a credit card offer. If they're approved, they
design the home (a full blueprint editor if they build; a building/floor/unit if they rent an
apartment). Then they live one month at a time starting in January 2033. They budget their time
(exercise, extra work, friends and family, and a deep practice), watch their character live
the month in a rotatable 3D home, keep their plants and animals alive, and see their money
and five domains of wellbeing change. Once they have savings, they can invest.

## 2. Phases and flow

```
          ┌────────────── login / register (username + password + class code) ──────────────┐
          ▼                                                                                   │
  INTAKE ──► PLAN (Phase 1) ──► PAPERWORK (Phase 2) ──► DESIGN (Phase 3) ──► LIFE (Phase 4) ──┘
   income,    20×5 table,         forms, letters,          blueprint editor    month loop:
   savings    colors, detail      insurance, credit        or building/floor   questions → time
              panel, choose       card, results            /unit/room picker   budget → live the
                 ▲                      │                                        month → summary
                 └──── any required approval denied ─────┘                           │
                 ▲                                                                    │
                 └──────── 3 consecutive missed housing payments (eviction/foreclosure) ┘
```

- `state.phase` ∈ `intake | plan | paperwork | design | life`. The screen shown is derived from
  the phase (and that phase's sub-step). Students can't skip ahead or go back, except where the
  rules send them back.
- The portfolio (accounts, agreements, automatic expenses, letters, applications, credit score)
  is open from every phase after intake.

## 3. People and accounts

- **Students** register with a made-up username, a password and a class code the teacher gives
  them. The game stores no personal information.
- **The admin** (the teacher, one person) signs in with Google on `admin.html` to see progress,
  reset games, move a save to a new username (for a forgotten password), pause accounts, manage
  class codes and export a CSV.
- **Local mode**: when Firebase isn't configured, everything runs in the browser against
  localStorage. That's how the game is built and tested. Firebase mode is switched on by the
  teacher's one-time setup (see `11-accounts-firebase.md`).

## 4. Internal vocabulary

| Term | Meaning |
|---|---|
| location | One of the 20 places (`app/src/data/locations/`), id like `pahoa` |
| home type | `apartment`, `shared`, `condo`, `house`, `build` (column order in the table) |
| cell | a location × home type pair |
| upfront | cash needed before moving in (deposit, down payment, closing costs, fees…) |
| monthly | first-year monthly housing cost (see `04-phase1-plan.md` §3) |
| status | affordability color: `red`, `yellow`, `cyan`, `green`, `na` |
| checkpoint | a moment the game saves right away (see `02-state.md` §4) |
| seed | a number derived from the player + purpose; all randomness is seeded |
| home contract | the shape every 3D home generator returns (see `08-3d.md` §5) |
| step | one unit of Phase 2 paperwork (form, letter, choice, payment, offer, review) |
| decision | an approve/deny outcome (lease, mortgage, construction loan, co-signer, roommates, card) |
| month plan | `planMonth()` output: events, market path, care-button schedule, all precomputed |

## 5. Decisions already made (with reasons)

| # | Decision | Why |
|---|---|---|
| D1 | Lives in `teaching/interfaces/home-sim/`, its own local git repo; site in `app/` | Sits beside the Class Bank; git gives every task a rollback point |
| D2 | Vanilla ES modules + import map, no build step, no framework | Each cold run can read only the modules it needs; matches the teacher's other tools |
| D3 | three.js (vendored, pinned) for 3D; SVG for 2D previews | Robust, well-known, runs on Chromebooks |
| D4 | Students: username + password + class code (Firebase Auth email/password with a synthetic email). Admin: one Google account | Teacher's explicit choice; no student personal info |
| D5 | Forgotten student password → new username + admin "transfer save" | No server, so the project stays on the free plan |
| D6 | Money in integer cents; rates as decimals | No float drift in balances (same rule as the Class Bank) |
| D7 | All randomness seeded per player + purpose + attempt | Refreshing never re-rolls a result; tests are deterministic |
| D8 | Prices are 2025–26 figures, not inflated to 2033 | They line up with the salary data used in class |
| D9 | Halifax shown in USD, with the exchange rate stated | One currency in the table |
| D10 | Letter box turns browser spellcheck off (config flag) | The spelling part of the letter score means something |
| D11 | Letter ratings revealed with the results at the end of Phase 2; no instant resubmit | Teacher's wording: "Their rating is given to them at the end of this phase" |
| D12 | Red cells can't be chosen; every color also has an icon and a text label | Red means "can't afford"; don't rely on color alone |
| D13 | Neglected plants wilt; neglected animals "go to live with a neighbor" | Gentle for 12-year-olds; still a real consequence |
| D14 | Every business and person in the game is fictional | Nothing impersonates a real organization |
| D15 | Life phase starts January 2033 (`monthIndex` 0) | The request says "Welcome to (month), (2033)" |

## 6. Spec map

| File | Covers |
|---|---|
| `01-architecture.md` | folder layout, stack, module boundaries and contracts, conventions, dev flags, verification tools, performance |
| `02-state.md` | the save document, checkpoints, migrations, summary, size limits |
| `03-locations.md` | the 20 places, location record schema, sourcing rules, sanity ranges |
| `04-phase1-plan.md` | intake, cost formulas, affordability colors, table, detail panel, 2D previews |
| `05-phase2-paperwork.md` | step lists, documents, insurance, underwriting, credit card, results, failure path |
| `06-letters.md` | letter types, letter box, scoring pipeline, corpus, model, report |
| `07-phase3-design.md` | pickers, blueprint editor, budget, finalize |
| `08-3d.md` | scene, units, lighting, style families, home contract, props, character, performance |
| `09-phase4-life.md` | month loop, questions, time budget, wellbeing, finance sim, events, animation, care game, summary |
| `10-investments.md` | unlock, portfolios, simulation, invest/sell rules, display |
| `11-accounts-firebase.md` | local vs Firebase mode, accounts, admin console, Firestore model, rules, emulators, deploy |
| `12-ux-content.md` | visual direction, themes, accessibility, reading level, Hawaiian orthography, glossary |
| `13-blocks.md` | **Block Edition**: voxel Phase 4, borrowed engine and textures, world generators, saves, upgrades |
| `99-original-request.md` | the teacher's words, verbatim, plus the requirement → task checklist |
| `DEVIATIONS.md` | any place the build knowingly departs from this spec, and why |

## 7. Out of scope (for now)

- Pulling savings from the Class Bank (`interfaces/bank/`). The request says "user-entered amount,
  for now", so keep `startingSavingsCents` coming from intake. Intake is the only place that sets it,
  which is the seam for a later integration.
- Multiplayer, chat, leaderboards, sound, a teacher UI for editing location data, real payments,
  and any LLM calls. Letters are scored by a small local model, never by an LLM.
