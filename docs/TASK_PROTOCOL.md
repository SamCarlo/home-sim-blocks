# Task protocol: every `homeblocks_NN` task follows this

**Paths**
- `HS` = `/home/sam/Documents/work/teaching/interfaces/home-sim-blocks` (the Block Edition fork; never edit
  `interfaces/home-sim`, the classic game)
- `TASKS` = `/home/sam/Documents/work/teaching/tasks`
- Your task file: `TASKS/homeblocks_NN_<slug>_task.md`

You're a cold, headless run with no memory of earlier runs, a dollar budget cap, and a 30-minute wall clock (systemd
kills the run at 30 minutes). Aim to finish in about 20 minutes: read only what you need, build, verify, wrap up.
Work steadily and don't gold-plate. If you're cut off, the next run resumes from what you left (step 3), so leave
files in a sensible state as you go.

## 1. Start
- `cd` into `HS`. Task 01 creates everything except `docs/`, which already exists.
- Append to `docs/PROGRESS.md`: a heading `## Blocks NN: <title>` (skip it if the heading already exists), then a line
  `- attempt started <ISO time>`.

## 2. Read (in this order, and only what you need)
1. `HS/CLAUDE.md` (from task 01 on).
2. `docs/spec/13-blocks.md` (the Block Edition spec), then the other spec sections your task lists (`docs/spec/…`). For long files, read the named sections rather than the whole file.
3. The last ~80 lines of `docs/PROGRESS.md`, and all of `docs/OPEN_ITEMS.md` and `docs/spec/DEVIATIONS.md`.
4. The existing source files your task builds on (named in the task). Use grep/glob to find anything else instead of
   reading whole directories.

## 3. Resume, don't restart
- If `PROGRESS.md` shows an earlier attempt at this task, or files your task creates already exist, inspect them and
  continue where the last attempt stopped.
- Don't throw away working code from a previous attempt. Fix it and finish it.

## 4. Stall rule
- If this is the **3rd or later attempt** and the same blocker keeps stopping you:
  1. Do everything else the task asks.
  2. Write the blocker to `docs/OPEN_ITEMS.md`: what's missing, why, and exactly how to finish it.
  3. Complete the wrap-up so the queue moves on. Later tasks and task 57 will pick it up.

## 5. Scope rules
- Change files only under `HS`, plus renaming your own task file.
  - Tool caches outside `HS` are fine: the npm/npx cache, mise installs when the task says so, Firebase emulator downloads.
- **Never** deploy, create cloud projects or resources, sign in to anything, add a git remote, or push.
- Network use is limited to:
  - downloading libraries and tools (npm registry, jsDelivr, gstatic);
  - the Block Edition sources named in 13 §2: github.com / codeload.github.com / raw.githubusercontent.com for the
    pinned engine repo, and kenney.nl (or its opengameart.org mirror) for the CC0 Voxel Pack;
  - optional fact-checking web searches in the data tasks.
- Follow the spec. If you must depart from it, do the simplest thing that keeps the teacher's intent
  (`docs/spec/99-original-request.md`), and record it in `docs/spec/DEVIATIONS.md` (date, task, what, why, where).
- Keep earlier tasks working. If something an earlier task should have built is missing or broken, fix it first
  (minimally) and say so in your `PROGRESS.md` entry. If you change a shared contract (`01-architecture.md` §6),
  update every caller and its tests.

## 6. Conventions (full detail in `docs/spec/01-architecture.md` and `CLAUDE.md`)
- Money is integer cents.
- Randomness is always seeded (`util/rng.js`).
- Pure modules are DOM-free and imported by relative path.
- Student-typed text never goes into `innerHTML`.
- Every new screen gets a seed in `app/src/dev/seeds.js` and a line in `tools/smoke.txt`.
- Tunable numbers live in `app/src/config.js`.
- Files stay under ~400 lines.
- Hawaiian words use the ʻokina and kahakō (Hawaiʻi, Pāhoa, lānai).

## 7. Verify (a task isn't done until this passes)
- `bash tools/check.sh` passes. That's from task 02 on; task 01 runs the lighter checks it lists.
- Take every screenshot your task asks for with `tools/shoot.mjs`, then **open each PNG with the Read tool and actually
  look at it.**
  - Fix anything wrong (overlaps, clipped or unreadable text, broken colors, empty areas, console errors) and re-shoot.
- Any new pure logic has unit tests in `tests/unit/`, and they pass.

## 8. Wrap up
1. **Progress entry**: under your `PROGRESS.md` heading, append:
   - `- done <ISO time>`;
   - the files added or changed (a short list);
   - how you verified: the commands you ran, plus one line per screenshot describing what it showed;
   - any deviations;
   - notes for later tasks: gotchas, helpers worth reusing, loose ends.
2. **Docs**: update `HS/CLAUDE.md` if you added a module, command, convention, seed or gotcha.
3. **Commit**: `cd "$HS" && git add -A && git commit -m "homeblocks NN: <title>"`. This is a local repo only. Never push.
4. **Rename** your task file with **one `mv` command, exactly this form** (the dashboard links runs to tasks by it):
   `mv "/home/sam/Documents/work/teaching/tasks/homeblocks_NN_<slug>_task.md" "/home/sam/Documents/work/teaching/tasks/homeblocks_NN_<slug>_task.md.done"`
5. **Summary**: finish with a short summary of what you built, how you verified it, and anything left open.
