// Writes tests/e2e/play-<type>-<place>.json (task 56): one full playthrough per home type, in local mode.
// register → intake → choose the cell → every paperwork step (letters typed for real) → results (retry with a stronger
// letter when the draw denies) → design → 3 months of life at ?speed=20&care=hit → summary.
// Task 58 adds play-relocate-hilo: a Hilo apartment, two months, "Find a new place to live" (with reloads in the middle),
// a shared room, and life carrying on in March.
// Blocks task 23: every play also opens Explore once, places a block, closes, reloads and checks the block is still
// there (exploreBuild); play-upgrade-katy upgrades the house after building and play-upgrade-pahoa-build renovates a room.
// Run: node tools/e2e/genPlaythroughs.mjs   (then npm run test:e2e). Edit this file, not the JSON it writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_LETTERS } from '../../app/src/dev/sampleLetters.js';

const HS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HELPER = fs.readFileSync(path.join(HS, 'tools/e2e/playHelper.js'), 'utf8');

const S = (expr) => `window.__homesim.getState()${expr}`;
const SUBMIT = '.fm-form button[type=submit]';
const WEAK = 'hi. i want this place. i can pay i think. thanks';

/** The five playthroughs. `seed` fixes every draw; `weakFirst` sends a weak letter on try 1 and expects a denial. */
export const PLAYS = [
  { file: 'play-apartment-hilo', user: 'playapt', loc: 'hilo', type: 'apartment', income: '4,200', savings: '12,000',
    seed: 7, weakFirst: true, shots: 'tools/shots/t56/apartment' },
  { file: 'play-shared-honolulu', user: 'playshared', loc: 'honolulu', type: 'shared', income: '3,800', savings: '9,000', seed: 5 },
  { file: 'play-condo-miami', user: 'playcondo', loc: 'miami', type: 'condo', income: '9,500', savings: '140,000', seed: 5 },
  { file: 'play-house-katy', user: 'playhouse', loc: 'katy', type: 'house', income: '8,500', savings: '110,000', seed: 5 },
  { file: 'play-build-pahoa', user: 'playbuild', loc: 'pahoa', type: 'build', income: '9,500', savings: '160,000', seed: 5 },
  // Blocks task 23: build in the block world, then upgrade (house) or renovate (build), then live to March.
  { file: 'play-upgrade-katy', user: 'playupkaty', loc: 'katy', type: 'house', income: '8,500', savings: '110,000', seed: 5,
    design: 'houseBasic', after: 'upgradeHouse' },
  { file: 'play-upgrade-pahoa-build', user: 'playreno', loc: 'pahoa', type: 'build', income: '9,500', savings: '210,000',
    seed: 5, after: 'renovate' },
];

const register = (user) => [
  { waitReady: true },
  { eval: HELPER },
  { click: '#tab-register' },
  { type: ['#panel-register input[name=username]', user] },
  { type: ['#panel-register input[name=classCode]', 'demo'] },
  { type: ['#panel-register input[name=password]', 'password123'] },
  { type: ['#panel-register input[name=confirm]', 'password123'] },
  { click: '#panel-register button[type=submit]' },
  { waitFor: '.intake-screen' },
  { waitReady: true },
  { assert: `${S('.phase')} === 'intake'` },
];

const intake = (p) => [
  { eval: `for (const n of ['characterName','jobTitle','income','hours','savings']) { const i = document.querySelector('input[name=' + n + ']'); i.value = ''; i.dispatchEvent(new Event('input')); } 'cleared'` },
  { type: ['input[name=characterName]', 'Kai Mana'] },
  { type: ['input[name=jobTitle]', 'Dental assistant'] },
  { type: ['input[name=income]', p.income] },
  { type: ['input[name=hours]', '40'] },
  { type: ['input[name=savings]', p.savings] },
  { click: '.intake-continue' },
  { waitFor: '.plan-cell' },
  { waitReady: true },
  { assert: `${S('.phase')} === 'plan'` },
  // Fix every seeded draw (decisions, design, life) so the run is the same every time.
  { eval: `window.__homesim.update((s) => { s.meta.seed = ${p.seed}; }) || ${S('.meta.seed')}` },
];

const choose = (p) => {
  const cell = `.plan-cell[data-loc="${p.loc}"][data-type="${p.type}"]`;
  return [
    { assert: `!!document.querySelector('${cell}') && !document.querySelector('${cell}').classList.contains('st-gray')` },
    { eval: `document.querySelector('${cell}').click(); 'opened'` },
    { waitFor: '.plan-dt-choose' },
    { click: '.plan-dt-choose' },
    { waitFor: '.modal-confirm' },
    { click: '.modal-confirm' },
    { waitFor: '.pw-item.is-active' },
    { waitReady: true },
    { assert: `${S('.phase')} === 'paperwork' && ${S('.choice.homeTypeId')} === '${p.type}'` },
  ];
};

const form = (prefs = {}) => [
  { eval: `window.__play.fill(${JSON.stringify(prefs)})` },
  { eval: `window.__play.fill(${JSON.stringify(prefs)})` },
  { eval: `window.__play.errors()` },
  { click: SUBMIT },
];
const letter = (id, text) => [
  { waitFor: '.pw-letter-text' },
  { type: ['.pw-letter-text', text] },
  { click: '.pw-letter-send' },
  { waitFor: '.modal-confirm' },
  { click: '.modal-confirm' },
  { waitFor: '.pw-letter-next' },
  { assert: `${S(`.paperwork.steps['${id}'].status`)} === 'done'` },
  { click: '.pw-letter-next' },
];
const insurance = () => [{ waitFor: '.pw-ins' }, { wait: 300 }, { click: '[data-pick=basic]' }, { click: '.pw-buy' }];

/** Step id → the student's actions for it. `strong` = which letter to write this try. */
function recipe(id, strong) {
  switch (id) {
    case 'rental-cover': case 'roommate-intro': case 'loan-purpose': case 'construction-purpose':
    case 'cosigner-request': case 'credit-explanation':
      return letter(id, strong ? SAMPLE_LETTERS[id] : WEAK);
    case 'renters-insurance': case 'condo-insurance': case 'home-insurance': return insurance();
    case 'credit-card-offer': return form({ decision: 'accept' });
    case 'construction-loan-application': return form({ tier: 'cozy', employer: 'Puna Design Studio' });
    case 'loan-options': return [
      { waitFor: '.pw-lo-table' },
      { eval: `(r => { r.click(); return r.value; })(document.querySelector('.pw-lo-row:not(.is-disabled) input[type=radio]'))` },
      { click: '.pw-lo-choose' },
    ];
    case 'home-inspection': return [
      { waitFor: '[data-inspector=standard]' },
      { click: '[data-inspector=standard]' },
      { waitFor: '[data-act=accept]' },
      { click: '[data-act=accept]' },
    ];
    case 'appraisal': return [
      { waitFor: '[data-act=order]' },
      { click: '[data-act=order]' },
      { waitFor: '.pw-lo-facts' },
      { eval: `window.__play.tap('[data-act=pay-gap]')` },
      { waitFor: '[data-act=continue]' },
      { click: '[data-act=continue]' },
    ];
    case 'closing-disclosure': return [
      { waitFor: '.pw-cd-table' },
      { eval: `window.__play.tap('[data-flag=rate]')` },
      { type: ['#cd-signature', 'Kai Mana'] },
      { click: '[data-act=sign]' },
    ];
    case 'contractor-bids': return [{ waitFor: '[data-pick=b]' }, { click: '[data-pick=b]' }];
    default: return form();
  }
}

/** One paperwork step: wait until it's active, do it, check it's done. */
const doStep = (id, strong, shot = null) => [
  { assert: `window.__play.waitStep('${id}')` }, { wait: 150 },
  ...(shot ? [{ shot }] : []),
  ...recipe(id, strong),
  { wait: 250 }, { assert: `['done', 'skipped'].includes(${S(`.paperwork.steps['${id}']?.status`)})` },
];

/** Every step before Results, in checklist order; each waits until it's active and ends with it done. */
function paperwork(p, strong, shotDir) {
  return STEP_LIST[p.type].flatMap((id, i) => doStep(id, strong, shotDir && i === 0 ? `${shotDir}-3-paperwork.png` : null));
}

/** Checklists with these intakes (income ≥ 2.5 × rent, score ≥ 660): no co-signer or credit letters. */
const STEP_LIST = {
  apartment: ['rental-application', 'rental-cover', 'renters-insurance', 'lease', 'move-in-payment', 'credit-card-offer'],
  shared: ['room-application', 'roommate-intro', 'renters-insurance', 'roommate-agreement', 'lease', 'move-in-payment',
    'credit-card-offer'],
  condo: ['mortgage-application', 'loan-options', 'loan-purpose', 'hoa-review', 'home-inspection', 'appraisal',
    'condo-insurance', 'closing-disclosure', 'credit-card-offer'],
  house: ['mortgage-application', 'loan-options', 'loan-purpose', 'home-inspection', 'appraisal', 'home-insurance',
    'closing-disclosure', 'credit-card-offer'],
  build: ['land-purchase', 'construction-loan-application', 'construction-purpose', 'contractor-bids', 'building-permit',
    'site-utilities', 'home-insurance', 'credit-card-offer'],
};

const results = (approved, shot) => [
  { assert: `window.__play.waitStep('results')` },
  { waitFor: '.pw-res-continue' },
  { wait: 300 },
  { assert: `${S('.paperwork.decisions.length')} > 0 && ${S('.paperwork.lettersRevealed')} === true` },
  { assert: `(d => d.filter(x => x.kind !== 'credit-card').every(x => x.approved) === ${approved})(${S('.paperwork.decisions')})` },
  ...(shot ? [{ shot }] : []),
  { click: '.pw-res-continue' },
  { waitReady: true },
  { assert: approved ? `${S('.phase')} === 'design' && !!${S('.home')}`
    : `${S('.phase')} === 'plan' && ${S('.plan.attempts.at(-1).outcome')} === 'denied'` },
];

const DESIGN = {
  apartment: [
    { waitFor: '.dz-bcard' }, { click: '.dz-bcard[data-index="1"]' }, { wait: 300 },
    { eval: `(d => { const p = d.screenOf(1, 2); return d.clickAt(p.x, p.y); })(window.__design)` }, { wait: 300 },
    { click: '.dz-unit[data-unit="1"]' }, { click: '.dz-plant-add' }, { click: '.dz-plant-add' },
  ],
  shared: [
    { waitFor: '.dz-bcard' }, { click: '.dz-bcard[data-index="1"]' }, { wait: 400 },
    { click: '.dz-unit[data-room]' }, { click: '.dz-plant-add' },
  ],
  condo: [
    { waitFor: '.dz-bcard' }, { click: '.dz-bcard[data-index="0"]' }, { wait: 300 },
    { eval: `(d => { const p = d.screenOf(0, 3); return d.clickAt(p.x, p.y); })(window.__design)` }, { wait: 300 },
    { click: '.dz-unit[data-unit="0"]' }, { click: '.dz-plant-add' },
  ],
  house: [
    { waitFor: '.dz-bcard' }, { click: '.dz-bcard[data-index="2"]' }, { wait: 400 },
    { click: '.dz-beds-add' }, { click: '.dz-trees-add' }, { click: '.dz-coop' },
  ],
  houseBasic: [{ waitFor: '.dz-bcard' }, { click: '.dz-bcard[data-index="2"]' }, { wait: 400 }],
  build: [
    { waitFor: '.bp-template-cozy' }, { click: '.bp-template-cozy' }, { wait: 300 }, { assert: `window.__blueprint.result().errors.length === 0` },
  ],
};

const design = (p, shot, monthIndex = 0) => [
  { waitReady: true },
  { assert: `${S('.phase')} === 'design'` },
  ...DESIGN[p.design ?? p.type],
  { wait: 400 },
  ...(shot ? [{ shot }] : []),
  { assert: `!document.querySelector('.dz-movein').disabled` },
  { click: '.dz-movein' },
  { waitFor: '[data-stage]' },
  { waitReady: true },
  { assert: `${S('.phase')} === 'life' && ${S('.life.monthIndex')} === ${monthIndex}` },
];

/** One month at ?speed=20&care=hit: welcome → plan → live (the care button hits itself) → summary. */
const month = (i, shotDir) => [
  { waitFor: '[data-stage=welcome]' },
  { click: '.life-go' },
  { waitFor: '[data-stage=plan]' },
  ...(shotDir && i === 0 ? [{ shot: `${shotDir}-5-life-plan.png` }] : []),
  { click: '.life-plan-foot .life-go' },
  { waitFor: '[data-stage=live]' },
  ...(shotDir && i === 0 ? [{ wait: 1500 }, { shot: `${shotDir}-6-life-live.png` }] : []),
  { waitFor: '[data-stage=summary]' },
  { assert: `(r => r && (r.careRate === null || r.careRate === 1))(${S('.life.current.result')})` },
  ...(i < 2 ? [{ click: '.life-plan-foot .life-go' }, { waitFor: '[data-stage=welcome]' },
    { assert: `${S('.life.monthIndex')} === ${i + 1} && ${S('.life.history.length')} === ${i + 1}` }] : []),
];

const summary = (shotDir) => [
  { assert: `document.querySelector('.life-title').textContent === 'March 2033 — how it went'` },
  { assert: `document.querySelectorAll('.life-sum-wb li').length === 5` },
  ...(shotDir ? [{ shot: `${shotDir}-7-summary.png` }] : []),
  { click: '.life-plan-foot .life-go' },
  { waitFor: '[data-stage=welcome]' },
  { assert: `${S('.life.monthIndex')} === 3 && ${S('.life.history.length')} === 3 && Number.isInteger(${S('.finances.checkingCents')})` },
  { eval: `(s => ({ home: s.home.label, cash: s.finances.checkingCents + s.finances.savingsCents, score: s.finances.credit.score, months: s.life.history.length }))(${S('')})` },
];

const RELOAD_LIVE = () => [{ reload: true }, { waitReady: true }, { eval: HELPER },
  { waitFor: 'body[data-ready="1"] [data-stage=welcome] .life-home' }, { waitFor: 'body[data-ready="1"] .life-stage canvas' },
  { assert: `(async () => { for (let i = 0; i < 100 && !window.__life?.view()?.scene?.world; i++) await new Promise((r) => setTimeout(r, 100)); return !!window.__life.view().scene.world; })()` }];
const BLOCK_THERE = `(b => b && b.id !== 0 && window.__life.view().scene.world.getBlock(b.x, b.y, b.z) === b.id)(JSON.parse(sessionStorage.getItem('play-block')))`;
const openExplore = [{ click: '.life-home' }, { waitFor: '.life-explore-open:not([disabled])' }, { click: '.life-explore-open' },
  { waitFor: '.life-explore .life-hotbar' }, { wait: 300 },
  { eval: `(b => { if (b) b.click(); return !!b; })(document.querySelector('.life-explore-gotit'))` }];
// From where Explore starts, try floor cells 2–4.5 blocks away on the player's property (farthest first: the ray clips
// near blocks) until one placement is allowed; remember the cell and block id for after the reload.
const PLACE = `(() => { const e = window.__explore, v = window.__life.view(), w = v.scene.world; const p0 = e.pose(); const boxes = v.contract.property;
  const inside = (x, z) => boxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1); const cands = [];
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) { const x = Math.floor(p0.x) + dx, z = Math.floor(p0.z) + dz, d = Math.hypot(dx, dz);
    if (d < 2 || d > 4.5 || !inside(x, z)) continue;
    for (let y = Math.floor(p0.y) + 1; y >= Math.floor(p0.y) - 1; y--) if (w.getBlock(x, y, z) === 0 && w.getBlock(x, y - 1, z) !== 0) { cands.push({ x, y, z, d }); break; } }
  cands.sort((a, b) => b.d - a.d);
  for (const k of cands) { e.aimAt(k.x + 0.5, k.y, k.z + 0.5); const r = e.placeBlock(); if (r.ok) { const b = { ...r.cell, id: w.getBlock(r.cell.x, r.cell.y, r.cell.z) };
    sessionStorage.setItem('play-block', JSON.stringify(b)); return { ...b, tried: cands.indexOf(k) + 1 }; } }
  return { failed: cands.length }; })()`.replace(/\n\s*/g, ' ');

/** Blocks task 23: open Explore once, place one block, close, reload, and the block is still there (13 §7). */
const exploreBuild = (shot) => [
  { waitFor: 'body[data-ready="1"] [data-stage=welcome] .life-home' },
  ...openExplore,
  { eval: PLACE },
  { assert: `!!sessionStorage.getItem('play-block') && window.__explore.edits().size === 1` },
  ...(shot ? [{ wait: 800 }, { shot }] : []),
  { press: 'Escape' },
  { waitFor: 'body:not([data-explore])' },
  { assert: `${S('.world?.editCount')} === 1 && !!${S('.world.pose')}` },
  ...RELOAD_LIVE(),
  { assert: BLOCK_THERE },
  { assert: `${S('.world.editCount')} === 1 && ${S('.phase')} === 'life'` },
];

/** play-upgrade-katy: My home → Upgrade → +1 garden bed + coop → charged once, the block survives. */
const upgradeHouse = (shot) => [
  { eval: `window.__cash0 = ${S('.finances.checkingCents')} + ${S('.finances.savingsCents')}; window.__cash0` },
  { click: '.life-home' }, { waitFor: '.life-home-menu .life-upgrade:not([disabled])' }, { click: '.life-upgrade' },
  { waitFor: '.upgrade-bar' }, { waitReady: true },
  { assert: `${S('.phase')} === 'design' && !!${S('.upgrade')}` },
  { click: '.dz-beds-add' }, { click: '.dz-coop' }, { wait: 300 },
  { eval: `window.__q = window.__design.quote(); window.__q.deltaCents` },
  { assert: `window.__q.deltaCents > 0 && window.__q.lines.length === 2` },
  ...(shot ? [{ shot: `${shot}-1-upgrade.png` }] : []),
  { click: '.dz-upgrade-go' },
  { waitFor: 'body[data-ready="1"] [data-stage=welcome] .life-home' },
  { assert: `${S('.phase')} === 'life' && ${S('.upgrade')} === null && ${S('.home.house.coop')} === true` },
  { assert: `window.__cash0 - (${S('.finances.checkingCents')} + ${S('.finances.savingsCents')}) === window.__q.deltaCents` },
  { assert: `${S('.world.editCount')} === 1` },
  ...RELOAD_LIVE(),
  { assert: BLOCK_THERE },
];

/** play-upgrade-pahoa-build: My home → Upgrade → the blueprint editor → add a bedroom with a door and window → Renovate
 *  (same moves as tests/e2e/blocks-upgrade-build.json on the Cozy template). */
const renovate = (shot) => [
  { eval: `window.__cash0 = ${S('.finances.checkingCents')} + ${S('.finances.savingsCents')}; window.__beds0 = ${S('.home.build.beds')}; window.__rooms0 = ${S('.home.blueprint.rooms.length')}; ({cash: window.__cash0, beds: window.__beds0, rooms: window.__rooms0})` },
  { click: '.life-home' }, { waitFor: '.life-home-menu .life-upgrade:not([disabled])' }, { click: '.life-upgrade' },
  { waitFor: '.upgrade-bar' }, { waitReady: true }, { waitFor: '.bp-renovate' },
  { assert: `${S('.phase')} === 'design' && document.querySelector('.bp-renovate').disabled` },
  { eval: "window.__drag = (start, end, steps = 6) => { const at = (p) => window.__blueprint.toClient(p.x, p.y); const a = at(start); const b = at(end); const ev = (type, x, y) => new PointerEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true}); document.elementFromPoint(a.x, a.y).dispatchEvent(ev('pointerdown', a.x, a.y)); for (let i = 1; i <= steps; i++) window.dispatchEvent(ev('pointermove', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps)); window.dispatchEvent(ev('pointerup', b.x, b.y)); return true; }; window.__tap = (p) => { const a = window.__blueprint.toClient(p.x, p.y); const ev = (type) => new PointerEvent(type, {bubbles: true, cancelable: true, clientX: a.x, clientY: a.y, button: 0, pointerId: 1, isPrimary: true}); document.elementFromPoint(a.x, a.y).dispatchEvent(ev('pointerdown')); window.dispatchEvent(ev('pointerup')); return true; }; true" },
  { click: '.bp-add' },
  // The new room lands at the lot's corner, off screen at the editor's zoom: fit the lot so the drag can grab it.
  { click: '.bp-fit' }, { eval: 'window.scrollTo(0, 0); true' }, { wait: 300 },
  { eval: `window.__new = window.__blueprint.bp.rooms.at(-1).id; window.__drag({x: window.__blueprint.bp.rooms.at(-1).x + 5, y: window.__blueprint.bp.rooms.at(-1).y + 5}, {x: 57, y: 27})` },
  { assert: `(r => r.type === 'bedroom' && r.x === 52 && r.y === 22)(window.__blueprint.bp.rooms.find((x) => x.id === window.__new))` },
  { click: '.bp-tool-door' }, { eval: 'window.__tap({x: 62, y: 28})' },
  { click: '.bp-tool-window' }, { eval: 'window.__tap({x: 52, y: 27})' },
  { click: '.bp-tool-select' },
  { assert: `window.__blueprint.result().errors.length === 0 && !document.querySelector('.bp-renovate').disabled` },
  { eval: `window.__q = window.__blueprint.quote(); ({work: window.__q.workCents, permit: window.__q.permitCents, total: window.__q.deltaCents})` },
  ...(shot ? [{ eval: `document.querySelectorAll('.dz-panel, .dz-panel-body').forEach((el) => { el.scrollTop = 0; }); window.scrollTo(0, 0); true` },
    { wait: 1200 }, { shot: `${shot}-1-renovate.png` }] : []),
  { click: '.bp-renovate' },
  { waitFor: 'body[data-ready="1"] [data-stage=welcome] .life-home' },
  { assert: `${S('.phase')} === 'life' && ${S('.upgrade')} === null` },
  { assert: `window.__cash0 - (${S('.finances.checkingCents')} + ${S('.finances.savingsCents')}) === window.__q.deltaCents` },
  { assert: `${S('.home.build.beds')} === window.__beds0 + 1 && ${S('.home.blueprint.rooms.length')} === window.__rooms0 + 1` },
  // The renovation may clear the test block if the new room lands on it; then the welcome panel says so.
  { assert: `${S('.world.editCount')} === 1 || /cleared 1 of/.test(document.querySelector('.life-cleared')?.textContent ?? '')` },
  ...RELOAD_LIVE(),
  { assert: `${S('.world.editCount')} === 0 || ${BLOCK_THERE}` },
];
const AFTER = { upgradeHouse, renovate };

/** All steps of one playthrough. */
export function build(p) {
  const d = p.shots;
  const steps = [...register(p.user), ...(d ? [{ shot: `${d}-1-intake.png` }] : []), ...intake(p)];
  if (d) steps.push({ shot: `${d}-2-plan.png` });
  steps.push(...choose(p));
  if (p.weakFirst) {
    steps.push(...paperwork(p, false, null), ...results(false, d && `${d}-4a-results-denied.png`), ...choose(p));
  }
  steps.push(...paperwork(p, true, d), ...results(true, d && `${d}-4-results.png`));
  steps.push(...design(p, d && `${d}-4b-design.png`));
  steps.push(...exploreBuild(`tools/shots/b23/${p.file}-explore.png`));
  if (p.after) steps.push(...AFTER[p.after](`tools/shots/b23/${p.file}`));
  for (let i = 0; i < 3; i++) steps.push(...month(i, d));
  steps.push(...summary(d), { shot: `tools/shots/b23/${p.file}-final.png` });
  return steps;
}

/** Task 58: move house from Live. A Hilo apartment with a cat → two months → a shared room in Hilo → March. */
export const RELOCATE = { file: 'play-relocate-hilo', user: 'playmove', loc: 'hilo', type: 'apartment', income: '4,200',
  savings: '12,000', seed: 5, move: { loc: 'hilo', type: 'shared' }, shots: 'tools/shots/t58/move' };
const RELOAD = [{ goto: '/index.html?speed=20&care=hit' }, { waitReady: true }, { eval: HELPER }];

export function buildRelocate(p) {
  const d = p.shots;
  const steps = [...register(p.user), ...intake(p), ...choose(p), ...paperwork(p, true, null), ...results(true, null),
    ...design(p, null)];
  // January: adopt a cat from the plan's home & garden question, so there's a pet to move.
  steps.push({ waitFor: '[data-stage=welcome]' }, { click: '.life-go' }, { waitFor: '[data-stage=plan]' },
    { click: '.lq[data-question=homeGarden] .lq-opt[data-value=cat]' },
    { click: '.life-plan-foot .life-go' }, { waitFor: '[data-stage=summary]' },
    { click: '.life-plan-foot .life-go' }, { waitFor: '[data-stage=welcome]' },
    { assert: `${S('.home.animals')}.some((a) => a.kind === 'cat' && a.present !== false)` });
  steps.push(...month(1, null)); // February → March welcome
  // The Save button, then "Find a new place to live".
  steps.push({ click: '.header-save' }, { wait: 300 }, { waitFor: '.save-indicator[data-status=saved]' },
    // 13 §10 (blocks task 19): the move lives in the "My home" menu, and its confirm says the builds stay behind.
    { click: '.life-home' }, { waitFor: '.life-home-menu .life-move:not([disabled])' }, { click: '.life-move' },
    { waitFor: '.modal-confirm' },
    { assert: `/Your builds stay with this home when you move\\./.test(document.querySelector('.modal-message').textContent)` },
    { click: '.modal-confirm' },
    { waitFor: '.reloc-bar' }, { waitReady: true },
    { assert: `${S('.phase')} === 'plan' && ${S('.relocation.startedMonth')} === 2 && ${S('.home.kind')} === 'apartment'` },
    { assert: `/Cash after moving out/.test(document.querySelector('.plan-bar').textContent)` },
    ...(d ? [{ shot: `${d}-1-plan-bar.png` }] : []),
    // A reload keeps the search going.
    ...RELOAD, { waitFor: '.reloc-bar' }, { assert: `${S('.phase')} === 'plan'` });
  // A shared room: reload in the middle of the paperwork while looking back at a finished step.
  steps.push(...choose(p.move));
  const ids = STEP_LIST[p.move.type];
  ids.forEach((id, i) => {
    steps.push(...doStep(id, true));
    if (i !== 1) return;
    steps.push({ click: `.pw-item[data-step=${ids[0]}]` }, { wait: 300 },
      { assert: `${S('.paperwork.activeStep')} === '${ids[0]}'` },
      ...RELOAD, { waitFor: '.pw-item.is-active' },
      { assert: `document.querySelector('.pw-item.is-active').dataset.step === '${ids[0]}'` },
      { assert: `!!document.querySelector('.reloc-bar') && /Moving out/.test(document.querySelector('.reloc-bar').textContent)` },
      // Right after a reload the checklist can re-render under a single click (flaky under load): retry until active.
      { assert: `(async () => { for (let i = 0; i < 40; i++) { if (window.__play.active() === '${ids[2]}') return true; document.querySelector('.pw-item[data-step=${ids[2]}]')?.click(); await window.__play.sleep(250); } return false; })()` });
  });
  steps.push(...results(true, d && `${d}-2-results.png`));
  steps.push({ assert: `${S('.relocation.movedOut')} === true && !document.querySelector('.reloc-bar')` },
    ...design(p.move, null, 2),
    { assert: `${S('.life.history.length')} === 2 && ${S('.relocation')} === null && ${S('.home.kind')} === 'shared'` },
    { assert: `${S('.home.animals')}.some((a) => a.kind === 'cat')` },
    { assert: `${S('.finances.agreements')}.some((a) => a.status === 'ended' && a.docType === 'lease')` },
    { assert: `${S('.finances.recurring')}.every((r) => r.startsMonth === 2)` },
    ...(d ? [{ shot: `${d}-3-new-home.png` }] : []));
  // Life goes on in March.
  steps.push({ waitFor: '[data-stage=welcome]' },
    { assert: `document.querySelector('.life-title').textContent === 'Welcome to March, 2033.'` },
    { click: '.life-go' }, { waitFor: '[data-stage=plan]' }, { click: '.life-plan-foot .life-go' },
    { waitFor: '[data-stage=summary]' },
    { assert: `document.querySelector('.life-title').textContent === 'March 2033 — how it went'` },
    { click: '.life-plan-foot .life-go' }, { waitFor: '[data-stage=welcome]' },
    { assert: `${S('.life.monthIndex')} === 3 && ${S('.life.history.length')} === 3` },
    { eval: `(s => ({ home: s.home.label, cash: s.finances.checkingCents + s.finances.savingsCents, score: s.finances.credit.score, months: s.life.history.length }))(${S('')})` });
  return steps;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [p, steps] of [...PLAYS.map((x) => [x, build(x)]), [RELOCATE, buildRelocate(RELOCATE)]]) {
    const file = path.join(HS, 'tests/e2e', `${p.file}.json`);
    fs.writeFileSync(file, JSON.stringify(steps, null, 1) + '\n');
    console.log(`wrote ${path.relative(HS, file)} (${steps.length} steps)`);
  }
}
