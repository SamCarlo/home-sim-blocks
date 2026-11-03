// Admin console pure logic (11 §3, task 52): CSV escaping, table filter/sort, class-code checks, reset/transfer
// plans, and the local data source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../../app/src/admin/csv.js';
import { rowFor, filterRows, sortRows, checkNewCode, planReset, planTransfer, transferTargets, codeCounts, cellText } from '../../app/src/admin/adminModel.js';
import { createLocalSource, LOCAL_CODES_KEY } from '../../app/src/admin/dataSource.js';
import { createLocalProvider, ACCOUNTS_KEY } from '../../app/src/accounts/local.js';
import { createInitialState, validateState } from '../../app/src/state/schema.js';
import { saveKey, summaryKey } from '../../app/src/persistence/local.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const player = (uid, username, classCode, summary = {}, extra = {}) => ({ uid, username, classCode, updatedAt: 5, disabled: false, summary, ...extra });

test('csvCell quotes commas, quotes and newlines, and defuses formula starts', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(-12.5), '-12.5', 'numbers are not defused');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(0), '0');
});

test('toCsv: header, dollars, ISO time, status; CRLF', () => {
  const rows = [rowFor(player('u1', 'kai', 'IO-P3', { phase: 'life', monthIndex: 2, cashCents: -4550, netWorthCents: 123456, creditScore: 690,
    wellbeingAvg: 61, homeLabel: 'Hilo, House', updatedAt: Date.UTC(2026, 9, 1) }, { disabled: true }))];
  const csv = toCsv(rows);
  const [head, line] = csv.split('\r\n');
  assert.match(head, /^Username,Class,Phase,Game month,Cash \(\$\),Net worth \(\$\),Credit,Wellbeing,Home,Last active,Status$/);
  assert.equal(line, 'kai,IO-P3,life,2,-45.5,1234.56,690,61,"Hilo, House",2026-10-01T00:00:00.000Z,paused');
  assert.ok(csv.endsWith('\r\n'));
});

test('rowFor tolerates the register-time summary', () => {
  const r = rowFor(player('u2', 'lani', 'IO-P3', { phase: 'intake', monthIndex: 0 }));
  assert.equal(r.cashCents, null);
  assert.equal(r.lastActive, 5);
  assert.equal(cellText(r, 'cashCents'), '—');
  assert.equal(cellText(r, 'phase'), 'Intake');
  assert.equal(cellText({ ...r, phase: 'life', monthIndex: 0 }, 'monthIndex'), 'January 2033');
});

test('filterRows by class and search; sortRows by text and number with blanks last', () => {
  const rows = [
    rowFor(player('a', 'mele', 'IO-P3', { cashCents: 500 })),
    rowFor(player('b', 'Kai', 'IO-P3', { cashCents: 100 })),
    rowFor(player('c', 'keoni', 'IO-P5', {})),
    rowFor(player('d', 'ana', 'IO-P5', { cashCents: 900 })),
  ];
  assert.deepEqual(filterRows(rows, { classCode: 'IO-P5' }).map((r) => r.uid), ['c', 'd']);
  assert.deepEqual(filterRows(rows, { search: ' K ' }).map((r) => r.uid), ['b', 'c']);
  assert.deepEqual(filterRows(rows, { classCode: 'IO-P3', search: 'mel' }).map((r) => r.uid), ['a']);
  assert.deepEqual(sortRows(rows, 'username').map((r) => r.username), ['ana', 'Kai', 'keoni', 'mele']);
  assert.deepEqual(sortRows(rows, 'cashCents', 'asc').map((r) => r.uid), ['b', 'a', 'd', 'c']);
  assert.deepEqual(sortRows(rows, 'cashCents', 'desc').map((r) => r.uid), ['d', 'a', 'b', 'c'], 'blank stays last');
  assert.deepEqual(sortRows(rows, 'classCode', 'desc').map((r) => r.uid), ['d', 'c', 'b', 'a'], 'ties by username');
  assert.deepEqual(rows.map((r) => r.uid), ['a', 'b', 'c', 'd'], 'input not mutated');
});

test('checkNewCode and codeCounts', () => {
  assert.deepEqual(checkNewCode({ code: ' io-p3 ', label: '' }, []), { code: 'IO-P3', label: 'IO-P3' });
  assert.ok(checkNewCode({ code: 'IO-P3' }, [{ code: 'IO-P3' }]).error);
  assert.ok(checkNewCode({ code: 'x' }).error);
  assert.ok(checkNewCode({ code: 'P3' }).error, 'shorter than the student form accepts');
  assert.equal(checkNewCode({ code: 'p3-a' }).code, 'P3-A');
  assert.ok(checkNewCode({ code: 'IO P3' }).error);
  assert.deepEqual(codeCounts([player('a', 'a', 'X'), player('b', 'b', 'X'), player('c', 'c', 'Y')]), { X: 2, Y: 1 });
});

test('planReset gives a valid fresh save and a summary', () => {
  const plan = planReset(player('u1', 'kai', 'IO-P3'), 1000);
  assert.deepEqual(validateState(plan.state), []);
  assert.equal(plan.state.phase, 'intake');
  assert.equal(plan.summary.phase, 'intake');
  assert.equal(plan.summary.updatedAt, 1000);
});

test('planTransfer copies the game to the new account and pauses the old one', () => {
  const from = player('old', 'kai', 'IO-P3');
  const to = player('new', 'kai2', 'IO-P3');
  const fromState = createInitialState({ uid: 'old', username: 'kai', classCode: 'IO-P3', now: 1 });
  fromState.phase = 'plan';
  fromState.player.jobTitle = 'Baker';
  const plan = planTransfer({ from, to, fromState, now: 9000 });
  assert.equal(plan.ok, true);
  assert.equal(plan.toUid, 'new');
  assert.deepEqual(plan.state.account, { username: 'kai2', classCode: 'IO-P3' });
  assert.equal(plan.state.player.jobTitle, 'Baker');
  assert.equal(plan.state.meta.seed, fromState.meta.seed, 'same game, same seed');
  assert.equal(plan.summary.username, 'kai2');
  assert.equal(plan.summary.phase, 'plan');
  assert.deepEqual(plan.fromPatch, { disabled: true, transferredTo: 'new', updatedAt: 9000 });
  assert.equal(fromState.account.username, 'kai', 'source state untouched');
  assert.deepEqual(validateState(plan.state), []);

  assert.equal(planTransfer({ from, to: from, fromState, now: 1 }).ok, false);
  assert.match(planTransfer({ from, to: { ...to, disabled: true }, fromState, now: 1 }).error, /paused/);
  assert.match(planTransfer({ from, to, fromState: null, now: 1 }).error, /no saved game/);
  const targets = transferTargets([from, player('z', 'zed', 'IO-P5'), to, player('p', 'paused', 'IO-P3', {}, { disabled: true })], from);
  assert.deepEqual(targets.map((p) => p.uid), ['new', 'z'], 'same class first, paused and self excluded');
});

test('local source: codes, players, transfer and delete class over localStorage; local provider honors them', async () => {
  const storage = mem();
  const session = mem();
  const provider = createLocalProvider({ local: storage, session, crypto: globalThis.crypto, iterations: 1000 });
  const src = createLocalSource(storage);
  assert.deepEqual((await src.listCodes()).map((c) => c.code), ['DEMO']);
  await src.createCode({ code: 'IO-P3', label: 'Period 3' });
  await src.setCodeActive('DEMO', false);
  await assert.rejects(provider.register({ username: 'kai', password: 'password123', classCode: 'DEMO' }), { code: 'class-code' });
  const kai = await provider.register({ username: 'kai', password: 'password123', classCode: 'io-p3' });
  const kai2 = await provider.register({ username: 'kai2', password: 'password123', classCode: 'IO-P3' });
  storage.setItem(saveKey(kai.uid), JSON.stringify({ ...createInitialState({ ...kai, now: 1 }), phase: 'plan' }));
  const players = await src.listPlayers();
  assert.deepEqual(players.map((p) => p.username).sort(), ['kai', 'kai2']);
  assert.equal(players.find((p) => p.uid === kai.uid).summary.phase, 'plan');

  const [from, to] = [players.find((p) => p.uid === kai.uid), players.find((p) => p.uid === kai2.uid)];
  const plan = planTransfer({ from, to, fromState: await src.loadSave(kai.uid), now: 50 });
  await src.writeSave(plan.toUid, plan.state, plan.summary, { uid: from.uid, patch: plan.fromPatch });
  assert.equal((await src.loadSave(kai2.uid)).phase, 'plan');
  assert.equal(JSON.parse(storage.getItem(summaryKey(kai2.uid))).username, 'kai2');
  assert.equal(JSON.parse(storage.getItem(ACCOUNTS_KEY)).kai.transferredTo, kai2.uid);
  await assert.rejects(provider.login({ username: 'kai', password: 'password123' }), { code: 'disabled' });
  await provider.login({ username: 'kai2', password: 'password123' });

  assert.equal(await src.deleteClass('IO-P3'), 2);
  assert.deepEqual(await src.listPlayers(), []);
  assert.equal(storage.getItem(saveKey(kai2.uid)), null);
  assert.equal(JSON.parse(storage.getItem(LOCAL_CODES_KEY)).length, 2, 'codes stay');
});

test('planReset also clears the block world and any upgrade (blocks task 24)', () => {
  const plan = planReset(player('u1', 'kai', 'IO-P3'), 1000);
  assert.equal(plan.state.world, null);
  assert.equal(plan.state.upgrade, null);
});
