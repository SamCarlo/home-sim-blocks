# 02 — State (the save document)

## 1. Principles

- One JSON-serializable document per student is the whole game. No functions, no `Date` objects,
  no `undefined`: timestamps are epoch milliseconds and calendar positions are `monthIndex`.
- Money fields end in `Cents` and hold integers.
- `version` starts at 1. Any shape change bumps the version and adds a step to
  `state/migrate.js`. `migrate()` must accept every older version.
- `state/schema.js` exports `createInitialState({uid, username, classCode, now})` and
  `validateState(state) → string[]` (a list of problems; empty means valid).
  Seeds and tests call `validateState`.
- Keep the document under ~300 KB (Firestore's hard limit is 1 MiB). Compaction rules are in §6.

## 2. Shape (version 1)

```js
{
  version: 1,
  meta: { createdAt, updatedAt, saveCount: 0, seed: 123456789 },   // seed = hashString(uid), fixed forever

  account: { username: 'kaimana77', classCode: 'IO-P3' },           // display copy; auth is elsewhere

  player: {
    characterName: 'Kai Mana',          // made-up name used on forms and signatures (default: username)
    jobTitle: 'Dental assistant',       // optional flavor
    netMonthlyIncomeCents: 320000,      // take-home pay per month (class-assigned job)
    weeklyJobHours: 40,                 // used by the time budget and overtime pay
    startingSavingsCents: 800000,       // the "bank" amount typed at intake (for now)
  },

  phase: 'intake',                      // intake | plan | paperwork | design | life

  plan: {
    expanded: null,                     // { locationId, homeTypeId } of the open detail panel
    hideUnaffordable: false,
    attempts: [                         // every trip through paperwork, newest last
      // { locationId, homeTypeId, outcome: 'denied'|'approved'|'evicted', reasons: ['…'], at }
    ],
  },

  choice: null,   // { locationId, homeTypeId, snapshot: { upfrontCents, monthlyCents, breakdown }, chosenAt }

  paperwork: {
    steps: {},                          // stepId → { status: 'locked'|'todo'|'draft'|'done'|'skipped', values: {…}, updatedAt }
    options: {},                        // decisions made inside steps, e.g. { downPaymentPct: 0.1, termYears: 30,
                                        //   buildTier: 'cozy', contractorId: 'b', inspectorId: 'a',
                                        //   insuranceQuoteId: 'standard', cardAccepted: true }
    letterIds: [],                      // letters written during this attempt
    decisions: [],                      // see 05 §7: { id, kind, approved, probability, draw, factors, reasons, terms }
    committed: false,                   // true after results are applied to finances
  },

  letters: {                            // every letter ever sent (kept across attempts)
    // 'L1': { id, type, to, text, sentAt, attempt: 0, score: { likelihood, band, … } }
  },

  finances: {
    checkingCents: 0,
    savingsCents: 800000,               // intake savings land here
    creditCard: null,                   // { limitCents, balanceCents, apr, minPaymentRule, lateFeeCents, graceDays,
                                        //   autopay: 'full'|'minimum', openedMonth, secured: false, depositCents: 0,
                                        //   carriedLastMonth: false }
    loans: [],                          // { id, kind: 'mortgage'|'construction-perm', label, lender, principalCents, rate,
                                        //   termMonths, paymentCents, balanceCents, startMonth, pmiCents, pmiUntilBalanceCents,
                                        //   escrow: { taxCents, insuranceCents } }
    investments: {                      // one holding per portfolio
      low: { valueCents: 0, basisCents: 0 }, medium: { valueCents: 0, basisCents: 0 }, high: { valueCents: 0, basisCents: 0 },
    },
    recurring: [],                      // { id, label, amountCents, category, source, startsMonth, endsMonth? }
    transactions: [],                   // { id, month, day, label, amountCents (+in / −out), account, category }
    monthTotals: [],                    // compacted history: { month, incomeCents, expenseCents, byCategory: {…} }
    agreements: [],                     // { id, type, title, status: 'pending'|'active'|'void', signedAt,
                                        //   counterparty, summary, terms: {…}, docValues: {…} }
    applications: [],                   // { id, kind, target, status: 'pending'|'approved'|'denied', feeCents, at, reasons }
    credit: { score: 680, history: [], inquiries: [], onTimeStreak: 0, missedPayments: 0, lateHousingStreak: 0 },
  },

  home: null,
  // { kind: 'apartment'|'condo'|'shared'|'house'|'build', locationId, styleFamily, label: 'Unit 4B, Kaiko Terrace',
  //   building: { seed, index, name, floor, unit, traits: { view, noise, sun, stairs } },       // apartment/condo
  //   house:    { seed, listingIndex, address, palette, extras: [] },                          // house purchase
  //   shared:   { seed, houseIndex, roomId, roommates: [{ name, traits: [] }] },                // shared
  //   blueprint: { … see 07 §5 … },                                                              // build
  //   plants:  [{ id, kind, spot, alive: true, plantedMonth }],
  //   animals: [{ id, kind, name, spot, present: true, adoptedMonth }],
  //   lifestyle: { noise, view, nature, social }                                                  // modifiers from design choices }

  life: {
    monthIndex: 0,                      // 0 = January 2033
    current: null,                      // { stage: 'welcome'|'plan'|'live'|'summary', choices: {…}, plan: {…}, care: { shown, hits }, result: {…} }
    history: [],                        // one entry per finished month (see 09 §9)
    wellbeing: { physical: 60, purpose: 60, financial: 60, social: 60, mental: 60 },
    investUnlocked: false,
    reflections: [],                    // optional year-in-review answers { monthIndex, text }
  },

  settings: { theme: 'system', reducedMotion: false, longCareWindow: false, animationSpeed: 1 },
}
```

Notes:
- **Cash** means `checkingCents + savingsCents`. **Net worth** means cash + investments + home
  equity (purchase price − loan balances, with no appreciation) − card balance.
- `recurring` is the "automatic expenses" list in the portfolio. `amountCents` is the
  typical monthly amount. Seasonal items like heating vary inside the month simulation.
- `transactions` gets entries from paperwork (month −1: fees, deposits, down payment) and from every lived month.
- `agreements` are created as `pending` during paperwork. Results change them to `active` or `void` (see `05` §8).

## 3. Who writes what

| Area | Written by |
|---|---|
| `player`, `phase: plan` | intake (task 11) |
| `plan.*`, `choice` | plan table and detail panel (12, 15), underwriting failure path (29) |
| `paperwork.*`, `letters` | paperwork flow, steps, letters, results (19–31) |
| `finances.*` | ledger functions only (`finance/ledger.js`), called by paperwork results and the month simulation |
| `home` | design pickers and blueprint (36–41); life updates plants and animals (46) |
| `life.*` | life phase (42–48) |
| `settings` | portfolio settings (17) |

Money only moves through `finance/ledger.js` (e.g. `post(state, txn)`, `transfer()`, `addRecurring()`,
`openLoan()`), so balances and transactions never drift apart.

## 4. Save policy (checkpoints and drafts)

Save right away (a **checkpoint**, via `store.update(fn, {checkpoint: '<reason>'})`) after:
- account creation;
- intake submit, choosing a home;
- each paperwork step completion, each letter sent, and the results commit;
- design finalize;
- each life stage change (welcome → plan → live → summary) and month end;
- investment buy/sell, settings changes, and admin reset or transfer (admin side).

Everything else is a **draft**: typing in a letter, filling a form, editing the blueprint.
Drafts are saved at most once every `SAVE.draftIntervalMs` (30 s), plus a flush when the tab is
hidden or closed. Checkpoints are at least `SAVE.checkpointMinGapMs` (5 s) apart, and a newer one
replaces a pending one. Per student per class period that's about 20–40 writes, which is well
inside Firestore's free 20,000 writes/day for a school.

The header shows the persistence status: "Saved ✓" / "Saving…" / "Offline — will sync" / "Couldn't save".

## 5. Summary (for the admin table)

`state/summary.js` → `summarize(state)`:
```js
{ username, classCode, phase, monthIndex, monthLabel, cashCents, netWorthCents, creditScore,
  wellbeingAvg, homeLabel, locationName, homeTypeId, updatedAt }
```
In Firebase mode it's written to `players/{uid}.summary`, but only at phase changes, month ends,
and admin actions. It is not written on every save.

## 6. Size control and compaction

- `finances.transactions` keeps the last 24 lived months plus month −1. When a month falls out of
  that window, it's folded into `monthTotals`.
- `life.history` entries keep totals and deltas, not raw events beyond a short list (≤ 12 events per month).
- `paperwork.steps[*].values` for attempts that were denied are dropped when a new attempt starts,
  but the attempt summary stays in `plan.attempts`.
- The blueprint can be at most 60 rooms, 200 openings and 80 yard items (enforced by the editor).

## 7. Local mode storage

- Saves are stored under `homeblocks:v1:save:<uid>`, and local accounts under `homeblocks:v1:accounts`.
  The local session goes in `sessionStorage` under `homeblocks:v1:session`, or in `localStorage` when "keep me logged in" is ticked.
- A local "uid" is `local-<hash(username)>`.

## 8. Migrations

`migrate(state)` applies steps `v1→v2→…` in order and returns a valid current-version state.
Unknown future versions are refused with a friendly error, so nothing gets overwritten.
Every migration step gets a unit test with a fixture of the old shape.
