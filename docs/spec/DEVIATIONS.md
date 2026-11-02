# Deviations from the spec

When a task knowingly departs from `docs/spec`, it records the change here: date, task number, what changed, why,
and where in the code. Keep entries short. The teacher's intent in `99-original-request.md` still wins.

*(none yet)*

- **2026-09-30, task 01**: `node --test tests/unit/` fails on Node 25 (`Cannot find module …/tests/unit`; a directory
  argument is no longer treated as a test root). Use the quoted glob `node --test "tests/unit/*.test.js"` instead, in
  `package.json` and in `tools/check.sh` (task 02). Where the spec or a task says `node --test tests/unit/`, read it as the glob.
- **2026-09-30, task 03**: three r186 no longer ships `build/three.module.min.js` (only `three.module.js`, which imports
  `three.core.js`). `app/vendor/three/three.module.min.js` is an esbuild `--bundle --minify` of `three.module.js`, so the
  import-map path in 01 §1 is unchanged. Also, `vader-sentiment` is Apache-2.0 (not MIT as the task said); bundled as is
  with its LICENSE and NOTICE. See `app/vendor/VERSIONS.md`.
- **2026-10-01, task 15**: 04 §6 says the detail panel is inline at ≥ 900 px and a modal sheet below. The inline panel
  also needs ≥ 720 px of window height (`WIDE` media query in `phases/plan/planScreen.js`). Under that, the table frame is
  only ~350 px tall and the inline panel is cramped, so shorter windows get the sheet. 1366×768 and 1024×768 stay inline;
  the task's 900×700 check shows the sheet.
- **2026-10-01, task 16**: small additions to the 02 §2 shape, no version bump (all optional, created lazily):
  `paperwork.paidUpfront {lineKey: cents}` (which upfront lines were paid during paperwork, for `unpaidUpfront`);
  `monthTotals[].byAccount` (so compacted months still reconcile with balances); loans also carry `priceCents`,
  `paymentsMade`, `interestPaidCents`, `lastPaidMonth`, `paidOffMonth`, `pmiDroppedMonth`, `closedMonth/closedReason`;
  credit `inquiries[]` are `{kind, month, recovered}`. Code: `finance/ledger.js`, `ledgerRecords.js`, `ledgerTotals.js`,
  `creditScore.js`.
- **2026-10-01, task 17**: the spec asks for a credit gauge "with a band label" but names no bands. Added
  `CREDIT.bands` in `config.js` (FICO-style: Poor < 580, Fair 580–669, Good 670–739, Very good 740–799, Excellent 800+)
  and `creditBand(score)` in `finance/creditScore.js`. Restart (Settings) keeps the player's settings as well as the
  account, so a dark-mode or reduced-motion choice survives. A dev `?theme=` override lasts until the player picks a
  theme in Settings. The drawer is built on `ui/modal.js` (shared stack) rather than separate drawer code.
- **2026-10-01, task 18**: 05 §4 says a signature is "the character name typed exactly". The check forgives ʻokina/apostrophe
  variants, kahakō, case and extra spaces (students often can't type an ʻokina), but not spelling or missing words
  (`forms/validate.js` `sameName`). Agreements may carry an optional `docType` (the paperwork step id) so the portfolio can
  re-render the signed document with its real schema (`ui/portfolio/agreementDoc.js`); no state version bump.
- **2026-10-01, task 19**: `plan.attempts[].outcome` gains `'withdrawn'` ("Choose a different home", as the task asks;
  the plan table only flags `'denied'`). Withdrawing also voids pending agreements and resolves pending applications as
  denied ("You withdrew this application.") so nothing stays pending forever. The 05 §2 contract puts `appliesTo` and
  `requires` on each step module; they live in `phases/paperwork/flow.js` instead (`appliesTo`, `LETTER_STEPS`,
  `prerequisites`) so the flow stays pure and testable in one place. Non-letter steps unlock in order; letters need only
  their own prerequisite and never block form steps; Results needs everything.
- **2026-10-01, task 20**: renter paperwork. 05 §4 lists a "move-in month" on the application; the lease starts January 1,
  2033 for everyone, so it's shown read-only instead of a pick. Move-in payment only records the authorization
  (`paperwork.options.moveIn`); the deposit and first month are charged at commit as unpaid upfront lines ("charged only if
  approved"). The roommate agreement stores housemates' comfort as −1…1 (`paperwork.options.roommateComfort`); task 29
  scales it to the ± bonus. `addAgreement` now keeps an optional `docType`. Step `complete(state, values, now)` gets the
  time as a third argument from the paperwork screen. Signed documents register in `phases/paperwork/docs.js`, which the
  portfolio imports. Code: `phases/paperwork/steps/{rental-application,room-application,lease,roommate-agreement,move-in-payment,renterTerms}.js`.
- **2026-10-01, task 21**: loan options. The 05 §7 credit tiers' rate adjustments are applied to every option's rate on
  the comparison table (a fresh player's 680 drops to 675 after the hard inquiry, so 6.5% shows as 6.875%), so the numbers
  the student picks from match what underwriting will use. FHA uses the same base rates as conventional. Cash to close
  includes the 2 months' reserves, so an option whose total exceeds checking + savings is disabled ("You need $X more…").
  Monthly housing on the table = P&I + PMI/MIP + tax + insurance + required hazard + HOA (no utilities). The mortgage
  application adds a bankruptcy declaration that must be "No" (the character has none). Code: `finance/loanOptions.js`,
  `phases/paperwork/steps/{mortgage-application,loan-options}.js`.
- **2026-10-01, task 22**: buyer documents. The inspector's fee is what that inspector charges ($300/$500/$750), and
  hiring settles the snapshot's whole 'inspection' upfront line so commit doesn't charge it again. A repair-credit request
  asks for the moderate + major items (all items if only minor ones were found); the acceptance chance is set by the worst
  severity asked (`BUYING.inspection.creditChance`), one try. Lenders lend on the lower of price and appraised value, so a
  paid gap lowers the loan and adds the gap to cash to close; "ask the seller" is one seeded try. A pending HOA special
  assessment is pushed into the snapshot's monthly breakdown as a 'special-assessment' line (no state version bump). The
  closing disclosure's escrow row is property tax + insurance + required hazard (HOA dues aren't escrowed); each row has its
  own "Flag an error" button and wrong flags are counted (`options.closing.wrongFlags`). Code: `finance/buying.js`,
  `finance/loanOptions.js`, `phases/paperwork/steps/{hoa-review,home-inspection,appraisal,closing-disclosure}.js`.
- **2026-10-01, task 23**: builder paperwork. Earnest money ($1,000, `BUILD.earnestMoneyCents`) is charged when the land
  offer is signed and recorded as paid toward the 'down-payment' upfront line (commit charges only the rest); the
  contingency refund on denial is left to task 31. A contractor bid changes the price per sq ft (A −8%, C +10%) and the
  months to build (14/9/8 scaled by the location's monthsToBuild ÷ 12), so it changes project cost, loan and cash; the
  design budget stays tier sq ft × local cost per sq ft × 1.10 because the blueprint is priced at local cost. Bid A's seeded
  delay adds 1–4 months of temporary housing and construction interest. The loan application blocks a tier whose cash
  needed exceeds the player's cash. Site utilities offers only what the location supports; the base option is in site
  work, upgrades (well $25,000, 5 kW rooftop solar $15,000, off-grid $40,000) come out of `options.designBudgetCents`, and
  the monthly effect is folded into the snapshot's utilities line. Tier, bid and utilities rewrite `choice.snapshot`
  (`finance/build.js refreshBuildSnapshot`). Code: `finance/build.js`,
  `phases/paperwork/steps/{land-purchase,construction-loan-application,contractor-bids,building-permit,site-utilities}.js`.
- 2026-10-02, task 24, insurance add-ons on contents-only policies: 05 §5 prices hazard add-ons from
  `ownership.hazardCoverage`, which is a dwelling price. Renters pay `INSURANCE.addOnFactor.renters` (10%) and condo owners
  25% of it, since their policy covers belongings or the unit interior only; renters may pick any add-on and none are
  locked. Only house/build pay the full price. Where: `finance/insurance.js` `addOns`, `config.INSURANCE`.
- 2026-10-02, task 24, insurance scaling: house and build premiums scale by insured value ÷ the local median house
  price (clamped 0.5–1.5, the same rule `costs.js` uses for build), with the value = final purchase price for houses and
  `options.project.projectCents` for builds. Add-ons don't scale. The unused task-01 `INSURANCE` stub in config.js was replaced.
- 2026-10-02, task 24, Pāhoa home-insurance screenshot: taken on the Pāhoa **build** path (`paperwork-build-insurance`),
  which uses the same `home-insurance` step and HPIA rule as a Pāhoa house; reaching it on the house path takes
  inspection + appraisal seeds that don't exist for Pāhoa.
- 2026-10-02, task 25, letter box: after Send the step stays on a sent view ("Sent! …", the recipient and the letter
  text) with a **Next step** button, instead of jumping to the next step, so students see the confirmation 06 §2 asks for.
  Step modules opt in with `stayOnDone: true`; `paperworkScreen.js` passes `onNext` in the mount context. The confirm
  dialog also mentions the word count when it's outside the target. The spelling dictionary is not preloaded yet,
  since the score is a stub; task 26 adds the lazy load when the box mounts. Where: `phases/paperwork/letterBox.js`.
- 2026-10-02, task 26, letter text helpers: normalization and splitting live in a separate `letters/text.js` (06 §3 puts
  them in features.js) so spell.js and grammar.js can share them without importing features.js. Sentences split on
  `.!?` and also at line breaks, since a textarea newline is deliberate (greeting, closing and signature lines). Short
  lines (≤ 4 words) with no end punctuation are treated as greeting/closing/signature lines: capitalized words there are
  names (not spell-checked) and the missing-end-punctuation rule ignores them. The `paragraphs` feature counts lines of
  8+ words, so students who separate paragraphs with a single Enter still get credit. `extractFeatures` returns
  `issues`, `sentiment`, `wordCount` and `groupsHit` alongside `{vector, named}` for task 28. Where: `app/src/letters/`.
- 2026-10-02, task 27, letter corpus size: 14 letters per type (4 strong, 4 middling, 6 weak; 84 total), not ~13. The
  extra weak letter in each type has grammar mistakes all through but complete content. Without it, grammar errors only
  appeared alongside spelling and text-speak, and the grammar weight came out with the wrong sign. Where: `tools/letter-model/corpus/`.
- 2026-10-02, task 27, model training details: cross-validation is **stratified** (positives and negatives dealt
  round-robin into 5 seeded folds), and each fold standardizes on its own training part. The final model trains on the
  non-test letters only, so the held-out accuracy is honest. `model.json` adds `cv.k`, `test.logloss`, `test.n`, `corpus`
  and `hyper` (λ 0.05, rate 0.3, 3000 iterations, seed 27) to the 06 §4 fields. `version` is `letters-lr-<hash>` of the
  feature names, corpus and hyperparameters, so it changes exactly when the model can. Where: `tools/letter-model/`.
- 2026-10-02, task 28, score contract extras: `scoreLetter` also returns `bandLabel` and `spellChecked`. Without a speller
  (the dictionary not loaded yet) it still scores, with `spellChecked: false`, and `rescorePending` upgrades it once the
  dictionary loads (main.js `rescoreLetters` on boot). Old `{likelihood: null, pending: true}` stubs are scored the same
  way. Bands carry a `status` (st-* color) in config. The report merges grammar issues at the same spot and shows a
  part-word suggestion as the whole word ("Try: Hi"), and adds one encouraging line for Fair/Weak/Needs work.
  Where: `app/src/letters/score.js`, `app/src/ui/letterReport.js`, `app/src/main.js`.
- 2026-10-02, task 29, construction credit floor: the 680 floor (05 §7) is checked against the score the lender pulled,
  stored as `paperwork.options.pulledScore` by the construction loan application just before its own hard inquiry (the
  application already says "Yours is N before this check"). Otherwise every fresh 680 player would be denied at 675.
  The credit *factor* and rate use the current score through the mortgage credit tiers, as for mortgages. Resolves the
  OPEN_ITEMS entry. Where: `finance/underwriting.js` `constructionDecision`, `steps/construction-loan-application.js`.
- 2026-10-02, task 29, cash hard fails for every home: 05 §7 lists "cash < cash to close" only for mortgages. Leases,
  rooms and builds also hard-fail when cash can't cover what commit charges (move-in costs, or the build's down payment,
  closing, temporary housing and interest reserve), so commit never runs short. Mortgage "cash needed to close" is the
  down payment + closing + unpaid fees + appraisal gap − repair credit (the reserves are checked by the reserves factor,
  not charged). Where: `finance/underwriting.js`.
- 2026-10-02, task 29, buyer upfront at commit: condo/house commit charges the chosen loan option's down payment and
  closing (not the snapshot's 10% lines), plus unpaid inspection/appraisal, the appraisal gap and minus a repair credit.
  Renters and builders are charged `unpaidUpfront(state)`. Where: `terms.upfront` on each decision; `commit.js`.
- 2026-10-02, task 29, recurring categories: 05 §8 says the location's living costs use category `living`; the portfolio's
  categories (task 17) are food/transportation/utilities, so groceries → food, transport → transportation, phone and
  internet → utilities, all with `source: 'living'` (as in the portfolio-demo seed). Gym and social costs are left to the
  life phase. Where: `phases/paperwork/commit.js` `recurringFor`.
- 2026-10-02, task 29, build timing: the construction-to-permanent loan opens with `startMonth` = the build months, and its
  housing bills (P&I, tax, insurance, utilities) start then; the upfront interest reserve and temporary housing cover the
  months before. Living costs start at month 0. Where: `commit.js`.
- 2026-10-02, task 29, roommate bonus: `UNDERWRITING.roommates.agreementBonus` is 0.05 (05 §4's ±5%), not the earlier 0.1.
  Factor = 1 + comfort (−1…1) × 0.05. A co-signer decision is still drawn for a shared room when the co-signer letter
  applied, but only the lease uses it (05 §7's roommates formula has no co-signer term).
- 2026-10-02, task 30, card tier from the pulled score: accepting the offer records the card's hard inquiry (−5), so a
  700 student would be offered $1,500 but decided at 695 ($1,000). The step stores `paperwork.options.card.pulledScore`
  (the score before its own inquiry) and `cardDecision` uses it, so the card that opens matches the offer. Where:
  `finance/underwriting.js`, `steps/credit-card-offer.js`.
- 2026-10-02, task 30, decline noted as a void agreement: 05 §6 says a decline is "noted in the portfolio". Agreements only
  have pending/active/void, so a decline is a void 'credit-card' agreement (summary "You declined this offer.", the offer
  document read-only). No inquiry, no application. The offer is one-time: later attempts show "Already answered" when a card
  is open or an earlier attempt answered. Where: `steps/credit-card-offer.js` `priorAnswer`.
- 2026-10-02, task 30, worked example wording: 05 §6 says "$1,000 paid at the $25 minimum". The real minimum on $1,000 is
  $31.66 at 25.99% (1% + interest), so the example pays the card's actual minimum ("starts at $31.66 and never drops under
  $25") with `cardPayoff`, and adds a $100/month contrast and "pay in full = $0". Where: `finance/creditCard.js` `payoffExample`.
- 2026-10-02, task 32, shadow filter: three r186 removed `PCFSoftShadowMap` (it logs a warning and falls back), so the
  renderer uses `PCFShadowMap` (08 §2 asks for soft). Where: `three/scene.js`.
- 2026-10-02, task 32, createScene options: besides 08 §2's `{biome, landmark, monthIndex, timeOfDay, interactive}` it takes
  `location` (supplies biome, landmark, seasons, coastal and the fallback preview), `seasons`, `coastal`, `homeTypeId` and
  `seed`, because snow/fall months and the water plane come from the location record. When WebGL fails it shows the
  fallback and returns null instead of a handle. Where: `three/scene.js`.
- 2026-10-02, task 32, terrain size: decorations fill the 400 × 400 ft area of 08 §3, but the plain ground plane is
  1,800 ft so the horizon never shows an edge; landmarks are merged backdrops scaled by `SCENE3D.backdrop` and turned to
  sit behind the lot in the default view. Landmark builders live in their own `three/landmarks.js`. Where: `three/terrain.js`.
- 2026-10-02, task 33, character height: 08 §7 says "~1.7 units = 5.6 ft", but 08 §1 sets 1 unit = 1 ft, so the
  figure is 5.6 units tall (1.7 is the height in metres). Where: `three/character.js`.
- 2026-10-02, task 33, props gallery draw calls: `?dev=props` shows ~40 props at once (one mesh per material each), so the
  gallery scene runs ~200–290 draw calls, over the 150 whole-scene budget. Each prop is 1–6 calls; a home scene uses a few
  props and should instance repeats with `instanceProp`. The gallery hides the terrain's own trees (`&decor=1` keeps them).
  Where: `dev/propsGallery.js`.
- 2026-10-02, task 33, prop extras: besides 08 §6, `createAnimal(kind, {color})` takes a coat color, `setTreeSeason(tree,
  season)` recolors/bares a tree after creation, and the windmill (`idle`) and street lamp (`setNight`) have hooks.
  Where: `three/animals.js`, `three/props.js`, `three/yard.js`.
- 2026-10-02, task 34, 3D style parameters: 08 §4 gives the family table but no 3D fields, so `data/styleFamilies.js`
  adds a `look` record per family (roof shape incl. `aframe`/`saltbox`/`barrel`, pitch as rise/run, eave, ridge axis, wall and
  roof texture, window kind + extra, porch, base incl. `raised` for the brownstone stoop, rails, rooftop, tree kinds,
  extras). Variants (`hillside`, `alaska`) carry their own `look` overrides. Where: `data/styleFamilies.js`, `three/styles.js`.
- 2026-10-02, task 34, styles gallery draw calls: `?dev=styles` shows all 16 swatch houses at once (~480 draw calls, ~65k
  triangles), over the 150-call whole-scene budget; one house (`&family=`) is 29–49 calls including terrain. Where:
  `dev/stylesGallery.js`.
- 2026-10-02, task 35, buildingGen extras: besides 08 §5's contract, `generate()` takes `unit` ({floor, unit}, default the
  lowest home floor's unit 0) and `season`, and returns `plan` (phases/design/buildingPlan.js), `floorBands`, `units`
  and `setUnit(floor, unit)` (moves plantSpots/animalSpots to that unit's balcony). Floors are 1-based, units 0-based
  (row 0 = street side). Townhome condos count as one floor with whole-townhome units. Where: `three/buildingGen.js`.
- 2026-10-02, task 35, buildings gallery: `?dev=buildings&all=1` shows 20 buildings at once (~510 draw calls, ~270k
  triangles), over the whole-scene budget; the three-building view per location stays within it (≤ 135 calls, ≤ 82k
  triangles). The gallery also takes `kind=apartment|condo`, `hl=<floor>[,<unit>]` and `seed=`. Where: `dev/buildingsGallery.js`.
- 2026-10-02, task 36, extra home fields: besides 02 §2's `building {seed, index, name, floor, unit, traits}`, Move in stores
  `building.form/unitName/amenities`, `traits.lotsOfStairs` and `home.address` ("Unit 4B · Kaiko Terrace · Hilo", the 07 §1
  summary label). `home.lifestyle` has `stairs` and `gym` (07 §2 "stairs" and "+1 gym access") besides noise/view/nature/
  social. Potted plants are charged at month −1 (`PAPERWORK_MONTH`, checking then savings, category 'lifestyle') because
  life hasn't started. Where: `phases/design/apartmentModel.js` `moveIn`.
- 2026-10-02, task 36, picker camera: the scene clamps pan to ±60 ft and the look-at height to 40 ft, but three buildings
  span ~600 ft and towers reach 300 ft. The picker slides the building row so the chosen one sits at the lot center, and
  `three/scene.js` gained `setPanLimits({half, yMax})` (defaults unchanged) so it can look up at a tall tower's chosen floor.
  On buildings over 80 ft, choosing a floor frames that floor and a few around it. Where: `phases/design/pickerView.js`.
- 2026-10-02, task 37, houseGen options: besides 08 §5's `{style, seed, variant, palette, extras}`, `generate()` takes
  `styleVariant` (hillside/alaska; buildingGen calls this `variant`, but here `variant` is 'house'|'shared' per the spec),
  `biome` (lawn color, fruit tree kind), `season`, `snow`, and `sqft`/`bedrooms` (a listing's target size), and returns
  `plan`, `kit` and `info`. The seeded numbers live in pure `phases/design/housePlan.js` so pickers get beds/baths/sq ft
  without three. Where: `three/houseGen.js`, `phases/design/housePlan.js`.
- 2026-10-02, task 37, house yards: Kona's lava-rock wall and the desert block wall act as the yard fence (with gaps for
  the path and driveway) instead of the swatch's short front wall; Hawaiʻi plantation and Miami use flowering hedges;
  Texas has an open lawn. Brownstones get the two neighbours in the row (other palettes) and no fire escape. Where:
  `three/houseYard.js`, `three/houseGen.js`.
- 2026-10-02, task 38, extra house fields: besides 02 §2's `house {seed, listingIndex, address, palette, extras}`, Move in
  stores `house.quirk/sqft/beds/baths/lotAcres/yearBuilt/gardenBeds/fruitTrees/coop/pet`, `home.address`, and
  `home.modifiers {roofLeakMultiplier, electricFactor, kitchenRepairs}` (the quirk effects for the life tasks).
  `extras` holds strings like `garden-beds:2`, `coop`, `pet:dog`. `lifestyle` adds `garden`. Customization is charged
  line by line from savings then checking (month −1, category 'lifestyle'); Move in refuses if the total exceeds cash.
  Where: `phases/design/houseModel.js`.
- 2026-10-02, task 38, shared living: 07 §4 allows houseGen or buildingGen "depending on the style"; the picker always
  uses houseGen (`variant: 'shared'`), so Honolulu's highrise family still gets a house. `home.shared` adds `address`,
  `room {id, label, sqft, view, closet, bath, noise}`, `effects {social, noise, choresHours, softened}` and roommate
  `age`; `lifestyle` adds `choresHours`. Roommate noise is 0, 0.5 or 1 before softening. Where: `phases/design/sharedModel.js`.
- 2026-10-02, task 39, template sizes: 07 §5 says Tiny ~500, Cozy ~950 and Family ~1,450 sq ft, but at those sizes
  the kitchen (×1.6) and bath (×1.8) multipliers plus roof, walls, doors, windows and the Hawaiʻi solar water heater and
  catchment push the cost past the tier budget (tier sq ft × 1.10) in some places. The templates are 440 / 812 / 1,248 sq ft
  (1 / 2 / 3 bedrooms; Cozy and Family add a front lānai) and keep Σ area × multiplier ≤ 85% of the tier's budget sq ft,
  which a unit test checks. All are ≤ 36 ft wide so they fit the 50 ft lots. Where: `phases/design/blueprint/templates.js`.
- 2026-10-02, task 39, build window and grid: the 120 × 120 ft window of a big lot is centered across the width and starts
  at the street; rooms are kept inside the setbacks ∩ window, shrunk onto the 2 ft grid (the 15 ft front setback means
  rooms start at y = 16). Validation still checks the real setbacks. The plan draws the street at the bottom. Where:
  `phases/design/blueprint/model.js` `editWindow`/`buildArea`.
- 2026-10-02, task 39, editor extras: besides 07 §5's tools, the editor has an "Add room" button (a 10 × 10 ft room at the
  first free spot, so keyboard-only students can add rooms), drag on empty lot = pan (as well as Space+drag), +/−/0 keys
  for zoom, and Esc to deselect. `designScreen` routes builds to the editor now (task 41 adds the 3D split view).
- 2026-10-02, task 40, site utilities in the blueprint cost: 05 §4 takes site-utilities upgrades out of the design budget
  (and a lot's native catchment is in the site work), and 07 §5 also prices solar and catchment in the blueprint. To avoid
  charging twice, `blueprintCost` only charges solar kW and catchment gallons above what `options.siteUtilities` chose
  (`included`); the yard panel says how much is already paid. Where: `phases/design/blueprint/cost.js`, `moveIn.js` `buildContext`.
- 2026-10-02, task 40, perimeter fence: the fence toggle fences the editing window (the whole lot on lots ≤ 120 ft, a
  120 × 120 ft yard on big lots) at $25/ft, so a 290 ft-deep Pāhoa lot isn't $22,000 of fence. Where: `blueprint/yard.js` `setFence`.
- 2026-10-02, task 40, Move in for builds: the task's acceptance needs a valid plan to move in, so task 40 adds a basic
  `moveInBuild` (home.blueprint, home.build, plants from beds/trees, 3 hens per coop, lifestyle, phase life); task 41 adds
  the 3D split view and the optional pet. Yard items may sit in the setbacks (only rooms must stay out), and a room on a
  yard item is an error. Where: `phases/design/blueprint/moveIn.js`, `validate.js`.
- 2026-10-02, task 41, blueprint 3D origin: 08 §5 puts a home's origin at the lot center, but lots run up to 150 × 290 ft
  while the decorated lot pad is ±60 ft. `blueprintTo3d.build` puts the lot's front edge (the street) at
  z = `BLUEPRINT.view3d.streetZ` (46, the same as `HOUSE.streetZ`) and centers the lot across x, so a blueprint sits on
  the pad and frames like a generated house. Lānai have a deck, corner posts and a roof but no outside walls; solar is a
  ground array behind the house and the catchment tank stands beside it (07 §5 calls them yard items). Where:
  `three/blueprintTo3d.js`.
- 2026-10-02, task 41, split view and pet: 07 §5's split (editor ~55%, 3D ~45%) is a three-column grid: plan | 3D |
  the 340 px panel (plan and 3D stack beside the panel from 900–1199 px, all stack under 900 px). The optional pet is a
  select above Move in; it's adopted from savings at the house picker's prices (`DESIGN.house.petCents`) and Move in
  refuses with the shortfall if cash is short. Where: `phases/design/blueprint/editor.js`, `view3d.js`, `moveIn.js`.
- 2026-10-02, task 42, life props and shadows: a Katy house with a coop, three hens, a cat, a garden plant and the
  character reached 157 draw calls (08 §5 budget 150) because every prop mesh is drawn again in the shadow pass. Plant and
  animal props in the Phase 4 view don't cast shadows (the character still does); the house is 130 calls. Where:
  `three/homeRender.js`.
- 2026-10-02, task 43, personal care hours: 09 §4's worked example (112 − 40 job − 5 commute − 14 care − 10 chores = 43)
  can't make "the maximum of everything overbooks" true: the maximum answers add 7 + 32 ÷ 4.33 + 20 + 7 = 41.4 h, which
  leaves 1.6 h (Burnout risk). The spec says to keep the defaults tuned so the three outcomes hold, so
  `LIFE.personalCareHours` (marked "config") is 16: the example now has 41 discretionary hours, the default answers
  leave 23 (Balanced), no answers leave 41 (Adrift) and the maximum leaves −0.4 (Overbooked). Where: `config.js`, tested in
  `tests/unit/time-budget.test.js`.
- 2026-10-02, task 43, time budget details: each free-time rating has a short `note` for the bracket label
  ("Balanced: good for your mental health", "Overbooked — something has to give: cutting into sleep", …). Missing answers
  count as 0 h. The home & garden question shows when the home has no plants, no animals, or a dead plant / departed
  animal; a cat or hens already at home aren't offered again; chickens only for houses and builds; the answer resets to
  "Not now" every month (it's a purchase). A pending cat/chickens/garden bed counts toward this month's chores (pots in an
  apartment don't). The budget and Live button are pinned to the bottom of the right panel so the bar stays in view while
  the questions scroll. Where: `life/timeBudget.js`, `phases/life/questions.js`, `lifeScreen.js`.
- 2026-10-02, task 44, wellbeing pull: 09 §8 pulls 5% toward 50 each month, but then the steady state is 50 + delta ÷ 0.05,
  so the default answers (+5 physical, +5 purpose) pinned three domains at 100 within a year. `LIFE.wellbeing.pullPct` is
  0.15 (steady state 50 + delta ÷ 0.15: +5 → ~83, −4 → ~23), so good habits stay high and neglect stays low without
  maxing out. Where: config.js LIFE.wellbeing.
- 2026-10-02, task 44, what counts as a missed payment: 09 §6 says anything unpaid is a missed payment (−60 each). That
  let unpaid groceries and gym fees drop credit to 300 in three months. Only creditor bills count as missed (housing;
  utilities & insurance; the card minimum), with the 09 §6 late fees. Living, lifestyle and event costs that cash and
  the card can't cover are paid item by item and the rest is `result.wentWithout` (warning + financial −3). Where:
  life/finalizeMonth.js, config WELLBEING.wentWithout.
- 2026-10-02, task 44, card timing and bill groups: living/lifestyle/event overflow can land on the card, so the card
  cycle (statement = carried balance + this month's charges, autopay from checking, savings topping it up) runs after
  them rather than between utilities and living costs. Each 09 §6 group is one bill: housing (all-or-nothing, never the
  card), utilities & insurance (incl. phone/internet, never the card). Late fees go to cash, then the card, else are noted
  unpaid. Where: life/finalizeMonth.js.
- 2026-10-02, task 44, utilities: the recurring Utilities line already holds the base bill (and a build's solar/catchment
  effect from site utilities), so planMonth only adds the seasonal heat/cool extra × the home type's `utilityFactor`;
  solar trims that extra by 40%. Where: life/planMonth.js seasonalUtilityCents.
- 2026-10-02, task 44, care with nothing shown: until tasks 45/46 drive the care game, finalizeMonth gets
  `careShown = 0`; careRate is then null and no plant or animal is lost. Where: life/finalizeMonth.js settleCare.
- 2026-10-02, task 44, event details: "car-dependent" = transport mode car, "car" = car or mixed, "transit places" =
  transit or mixed; hurricane events need the hurricane hazard, state HI/FL/TX and a hurricane month; floods need the
  flood add-on to be insured and so do Hawaiʻi hurricanes (where hurricane coverage is a separate add-on); December's
  sure holiday event fills a cap slot first. Numbers live in config EVENTS. Where: life/events.js.
- 2026-10-02, task 46, care windows at high speed: 09 §10 wants each button up for 2.5 s (5 s long) of real time at
  any speed, but a reduced-motion month at 4× lasts 2.3 s and a `?speed=` flag shortens any month further. `careWindows`
  fits every window inside the month whenever the month has room for one (always true at 1×/2×/4× in the 3D view) and
  avoids overlap when they all fit; otherwise buttons may overlap, and the animation holds on its last day
  (`anim.holdEnd`) until open buttons close, so a window is never cut short. Pausing freezes an open button's timer.
  A `seek()` (tests/screenshots only) skips the appearances it jumps over instead of counting them as missed.
  Where: life/care.js, phases/life/careButton.js, phases/life/animation.js.
- 2026-10-02, task 47, year-in-review stage: 09 §2's stage list has no slot for the review, so `LIFE_STAGES` gains
  'review'. After a December, `nextMonth` pushes the month to history, advances `monthIndex` and sets stage 'review';
  `finishReview(s, text, now)` saves a non-blank reflection `{year, monthIndex, text, savedAt}` (trimmed, at most
  `LIFE.reflectionMax` chars) to `life.reflections` and moves on to the welcome. December's summary button reads
  "See your year in review". Where: state/schema.js, life/monthFlow.js, phases/life/yearReview.js.
- 2026-10-02, task 47, summary expense rows: 09 §11 lists housing, utilities, food, transportation, lifestyle, events,
  debt payments. Mortgage payments are already in housing and card payments are transfers (not spending), so "debt
  payments" is shown as "Interest & late fees"; insurance sits with utilities (its 09 §6 bill group); pets and garden
  sit with lifestyle; paid event costs are pulled out of their ledger category into "Surprises & events"; anything
  left lands in "Other", so the rows always add up to `result.expenseCents`. A missed housing payment shows as a notice
  box at the top of the summary (first miss or final notice, with "Here's what you can try next") rather than in the
  bills list. `result.netWorthBeforeCents` was added to finalizeMonth so the year review's starting net worth is exact.
  Where: life/monthReport.js, life/finalizeMonth.js, phases/life/summary.js.
- 2026-10-02, task 48, investment details: buys and sells post 'transfer' transactions (`Invested in …` / `Sold …`) so
  they are never income or spending in month totals. Sells accept whole dollars or "Sell all" (the exact value, which
  can have cents). Outside the animation the plan stage labels the figure "Average growth rate last month" (the latest
  month-end change); the live and summary stages say "this month". The intro card shows until the first buy (no extra
  state field). A buy in the summary stage is dated the month's last day. Where: life/investments.js,
  phases/life/investPanel.js, phases/life/lifeScreen.js.
- 2026-10-02, task 49, rules and Firebase files: (1) the 11 §5 draft let only a student create `players/{uid}`, so the
  admin couldn't do "everything" (11 §5 tests); `allow create` on players now starts with `isAdmin() ||` (useful when the
  admin restores or moves a player). (2) `test:rules` runs `node --test 'tests/firebase/rules.test.js'` (a glob/file, not
  the `tests/firebase/` directory in 11 §7, which Node 25 rejects; see task 01) with `--test-concurrency=1`, and
  `test:firebase` runs `tests/firebase/*.test.js` the same way for tasks 50–52. (3) `firebase.json` also sets
  `emulators.singleProjectMode` and a hosting `ignore` list. (4) `tools/configure.mjs` has a `--placeholder` mode that
  writes the committed defaults (that's how `firestore.rules` is rendered with admin@example.com), lowercases the admin
  email, and defaults `--project` to the config's projectId. (5) `firestore.indexes.json` exempts `stateJson` with a
  `fieldOverrides` entry on collection group `saves`. Where: firestore.rules.template, package.json, firebase.json,
  tools/configure.mjs, firestore.indexes.json.
- 2026-10-03, task 50, Firebase accounts: (1) `?emulator=1` on localhost turns Firebase mode on even while
  `FIREBASE_ENABLED` is false (the placeholder), so the emulator e2e runs without configuring a project; it connects with
  the demo config, never the cloud. (2) In Firebase mode saves still use the local adapter until task 51 adds
  `persistence/firestore.js`; 11 §2 step 5 (initial save) is main.js's existing `saveNow('account-created')`. (3) The new
  player doc carries `summary: {phase: 'intake', monthIndex: 0}` so the admin table has a row before the first summary
  write. (4) A signed-in user with no `players/{uid}` doc is signed out with "Your account isn't set up in the class list.
  Ask your teacher." (an admin "Delete class data" leaves Auth users behind). (5) The login badge reads "Online (local test
  emulator)" in emulator mode. (6) No separate `test:e2e:emulator` script: `npm run test:firebase` runs the shoot step
  files from `tests/firebase/accounts.test.js` (shoot's own server; the page talks to the emulators on 9099/8080).
  Where: app/src/accounts/{firebase,provider}.js, app/src/accounts/ui/login.js, app/src/main.js, tests/firebase/accounts.test.js.
- 2026-10-03, task 51, Firestore saves: (1) the conflict-check copy lives in localStorage under
  `homesim:v1:cloudcopy:<uid>` as `{updatedAt, state}`, written on every save and, while a write is still in flight,
  by the policy's `adapter.stash` (so a reload or failed flush keeps the newest state); logout drops it when the status is
  "Saved" so shared Chromebooks keep nothing. (2) The summary goes in the same `writeBatch` as `saves/{uid}` (one commit
  in flight, 2 document writes) with `summary.updatedAt` = the save time; after a save loads from the server the first
  save skips the summary (`attach(…, {summarized: true})`) because nothing changed since it was written; a pushed newer
  local copy re-sends it. (3) In Firebase mode the header shows "Offline — will sync" whenever the browser is offline,
  not only with unsaved changes. (4) Logout waits at most `SAVE.logoutFlushMs` (3 s) for the flush (offline, the write
  stays queued in the persistent cache). (5) Still no `test:e2e:emulator` script: `npm run test:firebase` runs
  `tests/firebase/saves.test.js`, which drives `firebase-saves.json`/`firebase-offline.json`; `tools/shoot.mjs` gains an
  `{"offline": bool}` step (CDP `Network.emulateNetworkConditions`). (6) `flush()` now resolves after the follow-up save
  a pending change triggers, not just the write already in flight.
  Where: app/src/persistence/firestore.js, app/src/state/persistence.js, app/src/main.js, tools/shoot.mjs.

## 2026-10-03, task 52: Admin console
- **Local-mode class codes** live in `homesim:v1:classCodes` (admin/dataSource.js `LOCAL_CODES_KEY`); the local provider
  accepts the active ones (default `LOCAL_CLASS_CODES` = DEMO until the local console saves a list). The local provider now
  refuses paused (`disabled`) accounts, and local "Delete class data" also removes the local accounts (they are the local
  sign-ins). Why: 11 §3 asks for a local console that works without Firebase; without these, its actions did nothing.
- **Transfer rewrites `state.account`** (username, classCode) to the receiving account and keeps `meta.seed`, so the
  header and summary show the new username and the game stays the same game. Where: `adminModel.planTransfer`.
- **Admin sees letter reports** even before the student's own reveal (the console is for the teacher). The detail is a wide
  modal, not a page. Where: `admin/studentDetail.js`.
- **Popup → redirect fallback** on `auth/popup-blocked`, `auth/operation-not-supported-in-this-environment` and
  `auth/cancelled-popup-request`. `?localAdmin=1` (dev) opens the local console without the button press (smoke line).
- **CSV**: money columns in dollars (numbers), last active as ISO time, plus a Status column (active/paused/transferred);
  text cells starting with = + - @ get a leading apostrophe so spreadsheets don't run them. Where: `admin/csv.js`.
- **Admin e2e** runs from `tests/firebase/admin.test.js` under `npm run test:firebase` (still no separate `test:e2e:emulator`).

## 2026-10-03, task 58: Moving and the year fast-forward (teacher request after the build)
- **New in Phase 4** (not in 09): "Live like this for a year" lives up to 12 months at once on the plan's answers with
  care at 100%, stops after any month with a missed housing payment, skips the December year-in-review (its recap
  replaces it) and adds a free black stray cat each run (no adoption fee, no food line). "Find a new place to live"
  returns to Plan without resetting life; Cancel works until approval; on approval the old home ends (renters: deposit
  back, 2 months' rent inside the first lease term; owners: sold at the purchase price, 7% selling costs, loan paid off).
  Teacher's choices, asked 2026-10-03. Where: app/src/life/{autopilot,relocation}.js, phases/life/{lifeScreen,autopilotRecap}.js,
  ui/relocationBar.js, phases/paperwork/commit.js, finance/grid.js.
- **Move-ins keep the calendar.** 07 §1 said Move in starts life at January 2033; every move-in now calls `startLife`, which
  keeps `life.monthIndex` (0 for a first home). This also fixes re-homing after an eviction, which used to restart the
  calendar at January 2033 with the old history still attached.
- **Paperwork for a later home is dated by the game month**: signatures are dated the month before the new home starts and
  leases start on the 1st of that month (`moveDates`); a first home still reads December 2032 / January 1, 2033. Moving
  money (sale, fees, deposit) is posted in the paperwork month (−1) like other paperwork money, so the portfolio lists it
  under "Paperwork" rather than a calendar month.
- **Home value doesn't change**: a sale uses `home.purchasePriceCents` (no appreciation model). Underwriting's other debts
  now skip closed loans (a foreclosed or sold loan used to count).
- **Save state**: STATE_VERSION 2 (`relocation`, stage 'autopilot'); `paperwork.activeStep` and `home.pickDraft` are
  optional fields so a reload reopens the same paperwork step and design selection; the header has a Save button.
