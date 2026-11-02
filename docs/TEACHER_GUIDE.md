# Teacher guide

How to run Home & Life Sim with a class: what each phase teaches, how a period can go, the admin console, discussion
prompts tied to the Life Skills syllabus, and how to change the game itself. To put the game online the first time,
see `DEPLOY.md`.

## The game in brief

Each student starts with the net monthly income of the job they were assigned in class, plus their savings. They pick
a home from 20 real places × 5 kinds of homes, do the real paperwork to get it, design it, then live in it one month at
a time starting January 2033. Every person and business in the game is made up. Prices are 2025–26 figures, so they
line up with the salary data used in class.

Students can't skip ahead, and they only go back in a few ways: a denied application returns them to the Plan table,
three missed housing payments in a row (eviction or foreclosure) does the same, and in Life they can choose
**Find a new place to live** (see "Moving and the year fast-forward" below). Their **portfolio**
(accounts, agreements, automatic expenses, letters, applications, credit score) is open from every phase after intake.

## What each phase teaches

| Phase | What students do | What it teaches |
|---|---|---|
| **Intake** | Type their job's net monthly income and their savings. | Net vs. gross pay; where the numbers come from (their class job). |
| **Plan** | Read a 20 × 5 table colored by what they can afford, open any cell for a picture, cost breakdown and lifestyle facts, and choose one. | Upfront vs. monthly costs; the ⅓-of-income rule of thumb; why the same home costs wildly different amounts in Pāhoa, Honolulu, Brooklyn or Yellow Pine; trade-offs like commute, jobs and hazards. |
| **Paperwork** | Fill in real-looking applications, sign a lease or pick a loan, shop for insurance, write letters, consider a credit card offer, then get results. | Reading a contract to find the trap; what lenders and landlords look for; insurance deductibles vs. premiums; credit scores and hard inquiries; writing to an adult for something you want. |
| **Design** | Renters pick a building, floor and unit; buyers furnish; builders draw a blueprint inside a budget. | Square footage and cost per square foot; budgets with a contingency; tying a plan to real limits. |
| **Life** | Each month: answer four questions (exercise, extra work, time with friends and family, a daily deep practice), check the time budget, watch the month play out in 3D, keep plants and animals alive, read the month summary. Investing unlocks once they have savings. They can also live a whole year at once on the same answers, or look for a new home. | Time as a budget; how choices move money and five areas of wellbeing (physical, purpose, financial, social, mental); surprise expenses and emergency funds; long-term investing with risk; saving up for a bigger goal and what moving really costs. |

**Letters.** Paperwork includes one to three short letters (to a property manager, roommates, a co-signer, or a loan
officer, depending on the home). A small model in the browser rates them on content, length, spelling, grammar and
tone. Ratings are shown with the results at the end of Paperwork, not while they type, and letters affect whether
they're approved. No AI service ever sees student writing.

## Running a class period

A pattern that works for a typical period:

1. **Warm-up (5 min).** One discussion prompt from the phase most of the class is in (below), or a quick look at a
   cell in the Plan table on the projector.
2. **Play (25–35 min).** Students log in and continue. The game saves on its own; the header shows **Saved ✓**.
   Circulate with the admin table open on your screen to see who's stuck.
3. **Debrief (5–10 min).** Two or three students share a decision and its result. Tie it back to the scope.

Practical notes:
- Students finish phases at different speeds. Plan, Paperwork and Design take one to three periods each; the Life phase
  runs as long as you like (about one game month per 5–10 minutes).
- Students who are denied go back to the Plan table with their credit and savings changed by what happened. That's a
  lesson, not a failure: ask them what they'd do differently.
- Logging out and back in on any Chromebook picks up exactly where they left off: the same paperwork step, the same
  building or listing in Design, the same stage of the month. The **Save** button in the header saves on the spot (the
  game also saves by itself), which is reassuring before a bell.
- Before students start, have them write their username and password somewhere you can see (a sealed index card works).
  It saves a transfer later.

## Moving and the year fast-forward

Two buttons in the Life phase let students play the long game:

- **Live like this for a year** (next to *Live this month*, once the four questions are answered) lives up to 12 months
  at once with the same answers, with no day-by-day animation. Plants and animals are fed every day. It **stops early
  after any month with a missed rent or mortgage payment**, so nobody gets evicted without a chance to react. A recap
  shows the money in and out, net worth before and after, and wellbeing trends, plus an optional reflection box (saved
  in the student's game like the year-in-review one). Every run also brings a surprise: a black stray cat moves in (it
  costs nothing).
- **Find a new place to live** (on the month's welcome and plan screens) sends the student back to the Plan table while
  they keep their job, money, credit, wellbeing and month. A bar across the top says where they still live and what
  moving out will cost or bring:
  - Renters get their **deposit back** and pay the **lease-break fee** they signed (2 months' rent) if they leave in the
    first 12 months.
  - Owners **sell**: about 7% goes to agent and closing costs, the rest of the loan is paid off, and what's left goes to
    savings. With little equity this can come out negative.
  - The Plan table counts that amount as cash, so a student who saved up can now afford more.
  - **Cancel and go home** works until a new home is approved. It takes them back to Live exactly where they were;
    application fees already paid stay spent. Once Results say yes, the old home ends (signing is final), cats and dogs
    come along, and life continues in the same month.

Good prompt pairing: have students fast-forward a year, then ask whether what they saved changes which homes they can
afford.

## Class codes

Students can only register with an active class code. Make one per period so you can filter the admin table by class.

- **Create:** in the admin console's **Class codes** card, type a **New code** (4 to 12 letters, numbers or hyphens,
  like `IO-P3`) and a **Label** (like `Period 3 Life Skills`), then **Create code**.
- **Deactivate:** stops *new* registrations with that code. Students who already registered keep playing.
  **Reactivate** turns it back on.
- **Delete code:** removes the code itself (only do this once nobody else needs to register with it).
- Codes aren't secret passwords; they keep strangers from making accounts on your project. If one leaks, deactivate
  it and make a new one.

## The admin table

Open `https://<your project>.web.app/admin` and sign in with Google. The **Students** table shows one row per student:

| Column | Meaning |
|---|---|
| Username | What the student typed when they registered. |
| Class | Their class code. |
| Phase | Intake, Plan, Paperwork, Design or Life. |
| Game month | The month they're living (Life phase only), like "March 2033". |
| Cash | Checking + savings. |
| Net worth | Everything they own minus everything they owe. |
| Credit | Credit score (starts at 680). |
| Wellbeing | The average of the five wellbeing areas. |
| Home | The home they chose. |
| Last active | When the game last saved for them. |

Click a column header to sort (click again to reverse). Use the class menu to filter and **Search usernames** to find
one student. **Export CSV** downloads what's shown, for a gradebook or a spreadsheet.

Click a username to open that student's **details**: current home, their portfolio (read-only), every letter with its rating,
and a **Month history** table. This is the best place to have a conference with a student about their choices.
Nothing you view here changes their game.

## Forgotten passwords: transfer the save

There's no password reset (that would need a paid server). Instead:

1. The student makes a **new account** with a new username and the same class code.
2. In the admin console, open the student's **old** username and click **Transfer save**.
3. Choose the **New username** and click **Transfer save**.

Their whole game moves to the new username, and the old account is paused so it can't be used. The student logs in
with the new username and carries on.

## Resetting, pausing and deleting

Every one of these asks you to confirm first.

- **Reset game** (in a student's details): erases their whole game and starts them over at Intake. Their account and
  username stay. It can't be undone.
- **Pause** / **Unpause**: a paused student sees "Your account is paused" and can't log in until you unpause.
- **Delete class data** (in **Class codes**): deletes every saved game and class record for that code. You must type
  the code to confirm. Do this at the end of the year. The students' sign-in accounts remain in Firebase; to remove them
  too, go to the Firebase console, **Authentication → Users**, and delete them there (see `DEPLOY.md`, "Later").

## Discussion prompts by phase

Each prompt names the syllabus scope it serves (`teaching/middle school curriculum/health/life skills/life_skills_syllabus.md`).

**Intake**
- *Career & Finance:* Your job pays one amount but you typed a smaller one. Where did the difference go? Find each piece
  on a pay stub.
- *Personal Thriving:* Is your class job one you'd actually want? What would you trade for a higher paycheck?

**Plan**
- *Career & Finance:* Why does a one-bedroom cost so much more in Honolulu than in Pāhoa? Use shipping, land and jobs
  in your answer. (Connects to the Jones Act and cost-of-living lessons.)
- *Career & Finance:* The table turns yellow when housing takes more than a third of income. Is that a good rule?
  When would you break it?
- *Health & Safety:* Pick a place and name its biggest natural hazard (lava zone, hurricane, flood, wildfire, winter).
  How does that show up in the price?
- *Personal Thriving:* Name three things besides money that made you choose your place. What does that say about what
  you value?

**Paperwork**
- *Core Technical Skills:* Find one sentence in your lease or loan papers that could cost you money if you missed it.
  What does it actually say?
- *Core Technical Skills:* Your letter was rated on content, length, spelling, grammar and tone. Which one would a real
  landlord or loan officer care about most? Why?
- *Health & Safety:* Why does insurance exist? You picked a deductible. What would happen in a bad month with the
  other choice?
- *Career & Finance:* You were offered a credit card. What does the APR mean in dollars if you carry a $500 balance?
- *Personal Thriving:* If you were denied, what would you change before you try again? Who could you ask for help?

**Design**
- *Core Technical Skills:* What did a contingency budget protect you from? How much did you set aside?
- *Personal Thriving:* Which room did you make biggest, and why? What does your home say about how you want your week
  to look?
- *Core Technical Skills (place-based):* If you planted a garden, what would grow well where you live? How does an
  ahupuaʻa use land differently from a single lot?

**Life**
- *Personal Thriving:* Look at your time budget. What did you give up to work extra shifts? Was it worth it?
- *Health & Safety:* Your physical wellbeing changed with your exercise choice. What's a habit that would survive a bad
  week, in the game or in real life?
- *Career & Finance:* A surprise expense hit this month. Did your savings cover it? How big should an emergency fund be?
- *Career & Finance:* Your investments went down this month. Should you sell? What does "long-term" mean?
- *Personal Thriving:* What did you choose for the daily deep practice, and what does kuleana or mālama look like in
  your real week?
- *Health & Safety:* If real life ever feels like too much, who could you talk to? (The year-in-review says it too:
  a school counselor or someone you trust.)
- *Career & Finance:* You fast-forwarded a year. How much did you keep? What would you need to save before moving to a
  place you'd like more, and what would moving out cost you?

## Changing a rule

Every number the game uses lives in one file: `app/src/config.js`. Each one has a comment saying what it does and
which part of the spec it comes from. Money is written in **cents** (`320000` = $3,200.00); rates are decimals
(`0.065` = 6.5%).

A few you might want:

| To change… | Edit |
|---|---|
| The game's name | `GAME_TITLE` |
| The year Life starts | `START_YEAR` |
| When the table turns yellow / cyan | `AFFORD.stretchDivisor` (3 = a third of income), `AFFORD.wellBelowDivisor` |
| The starting credit score and card terms | `CREDIT` |
| How strict approvals are | `UNDERWRITING` |
| How often surprise events happen, and their costs | `EVENTS` |
| Investment unlock and cash reserve | `INVEST` |
| The class code accepted in local mode | `LOCAL_CLASS_CODES` |

Steps:
1. Open `app/src/config.js` in a text editor, change the number, and save.
2. In the terminal, in the `home-sim` folder, run `bash tools/check.sh`. It should end with `check: OK`. If it fails,
   it names the problem; undo your edit or ask Claude.
3. Try it locally (`python3 tools/serve.py`, then open http://127.0.0.1:1270).
4. Publish it: `npx firebase-tools deploy --only hosting`.

Changes affect new calculations from then on; students' past months don't change. Or simply ask Claude: "In home-sim,
make the table turn yellow at 30% of income instead of a third."

## Adding a location

The 20 places live in three files under `app/src/data/locations/`: `hawaii.js`, `cities.js` and `towns.js`. Each
place is one record with its rents and prices, utilities, taxes, insurance, hazards, commute and lifestyle facts. The
full list of fields is in `docs/spec/03-locations.md` §2.

Adding one is a careful data task, so the easiest route is to ask Claude: "In home-sim, add <town, state> as a
location in the <Hawaiʻi / cities / towns> group, following docs/spec/03-locations.md." If you do it by hand:

1. Copy a similar place's record in the right file and change every figure. Give it a new kebab-case `id`
   (like `port-townsend`), a `styleFamily` and `landmark` from the lists in `app/src/data/enums.js`.
2. Add a sanity band for it in `app/src/data/sanity.js` (rough low/high values the checker compares against).
3. Add a section to `docs/DATA_SOURCES.md` saying where each figure came from and its year.
4. Add the `id` to the order list at the top of `tests/unit/locations.test.js` (and update the "all 20 places" test's
   count if you're going past 20).
5. Bump `DATA_VERSION` in `app/src/data/locations/index.js` so cached tables recompute.
6. Run `bash tools/check.sh`. The location validator prints every missing or out-of-range field.
7. Deploy as above.

Students who already chose a home keep it. Removing a place someone has chosen would break their save, so don't
delete places mid-year; leave them in.
