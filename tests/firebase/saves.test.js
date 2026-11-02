// Saving games to Firestore (11 §4, §6, task 51), against the Auth + Firestore emulators.
// Run: mise exec java@temurin-21 -- npm run test:firebase (emulators:exec starts both emulators).
// Part 1 drives persistence/firestore.js from Node with a real signed-in student; part 2 runs the shoot.mjs step files
// on ?emulator=1 (register → intake → reload; offline → play → online) and checks the server copy over REST.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fbApp from 'firebase/app';
import * as fbAuth from 'firebase/auth';
import * as fbStore from 'firebase/firestore';
import { createFirebaseProvider } from '../../app/src/accounts/firebase.js';
import { createFirestoreAdapter, copyKey } from '../../app/src/persistence/firestore.js';
import { createInitialState } from '../../app/src/state/schema.js';
import { summarize } from '../../app/src/state/summary.js';

const run = promisify(execFile);
const PROJECT = 'demo-home-blocks';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const sdk = { app: fbApp, auth: fbAuth, firestore: fbStore };
let appSeq = 0;

async function call(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${url}: ${res.status} ${await res.text()}`);
  return res;
}
const readDoc = async (path) => {
  const res = await fetch(`${FS}/${path}`, { headers: owner });
  return res.status === 404 ? null : (await res.json()).fields;
};
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

/** A registered student with an adapter on their provider's Firestore. */
async function student(username, storage = memStorage()) {
  const p = createFirebaseProvider({ emulator: true, appName: `t51-${++appSeq}`, sdk, browser: false });
  await p.init();
  const user = await p.register({ username, password: 'password123', classCode: 'IO-P3' });
  let t = 1000;
  const adapter = createFirestoreAdapter({ db: p.db, firestore: p.sdk.firestore, storage, now: () => (t += 1000) });
  return { p, user, adapter, storage };
}

after(async () => { await Promise.all(fbApp.getApps().map((a) => fbApp.deleteApp(a))); });

before(async () => {
  fbStore.setLogLevel('silent');
  await Promise.all([
    call(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' }),
    call(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }),
  ]);
  await call(`${FS}/classCodes/IO-P3`, {
    method: 'PATCH', headers: owner,
    body: JSON.stringify({ fields: { label: { stringValue: 'IO-P3' }, active: { booleanValue: true }, createdAt: { integerValue: '1' } } }),
  });
});

describe('persistence/firestore.js on the emulator', () => {
  test('save writes saves/{uid}; the summary goes to players/{uid} only when given', async () => {
    const { user, adapter } = await student('savekid1');
    const s = createInitialState({ ...user, now: 1 });
    s.meta.saveCount = 1;
    assert.deepEqual(await adapter.save(user.uid, s, summarize(s)), { ok: true });
    let save = await readDoc(`saves/${user.uid}`);
    assert.deepEqual(Object.keys(save).sort(), ['saveCount', 'stateJson', 'updatedAt', 'version']);
    assert.equal(save.saveCount.integerValue, '1');
    assert.equal(JSON.parse(save.stateJson.stringValue).account.username, 'savekid1');
    const player = await readDoc(`players/${user.uid}`);
    assert.equal(player.summary.mapValue.fields.username.stringValue, 'savekid1');
    const summaryAt = player.updatedAt.integerValue;

    s.meta.saveCount = 2;
    s.player.jobTitle = 'Baker';
    await adapter.save(user.uid, s, null);
    save = await readDoc(`saves/${user.uid}`);
    assert.equal(save.saveCount.integerValue, '2');
    assert.equal((await readDoc(`players/${user.uid}`)).updatedAt.integerValue, summaryAt, 'no summary write');
    assert.deepEqual(adapter.stats, { commits: 2, docWrites: 3 });
    assert.equal((await adapter.load(user.uid)).player.jobTitle, 'Baker');
    assert.equal(adapter.takePendingPush(), false);
  });

  test('a local copy newer than the server is loaded and flagged for a push; an older one is ignored', async () => {
    const { user, adapter, storage } = await student('savekid2');
    const s = createInitialState({ ...user, now: 1 });
    s.player.jobTitle = 'On the server';
    await adapter.save(user.uid, s, summarize(s));
    const serverAt = Number((await readDoc(`saves/${user.uid}`)).updatedAt.integerValue);
    storage.setItem(copyKey(user.uid), JSON.stringify({ updatedAt: serverAt + 5000, state: { ...s, player: { ...s.player, jobTitle: 'Never synced' } } }));
    assert.equal((await adapter.load(user.uid)).player.jobTitle, 'Never synced');
    assert.equal(adapter.takePendingPush(), true);
    assert.equal(adapter.takePendingPush(), false, 'only once');
    storage.setItem(copyKey(user.uid), JSON.stringify({ updatedAt: serverAt - 5000, state: { ...s, player: { ...s.player, jobTitle: 'Stale' } } }));
    assert.equal((await adapter.load(user.uid)).player.jobTitle, 'On the server');
    assert.equal(adapter.takePendingPush(), false);
    adapter.forget(user.uid);
    assert.equal(storage.getItem(copyKey(user.uid)), null);
  });

  test("another student's save is refused by the rules", async () => {
    const a = await student('savekid3');
    const b = await student('savekid4');
    const s = createInitialState({ ...b.user, now: 1 });
    await assert.rejects(a.adapter.save(b.user.uid, s, null), { code: 'permission-denied' });
  });
});

describe('game saves on ?emulator=1 (shoot.mjs)', () => {
  const shoot = (steps) => run('node', ['tools/shoot.mjs', '--path', '/index.html?emulator=1&theme=light', '--steps', steps], { timeout: 150000 })
    .catch((err) => { throw new Error(`${steps} failed:\n${err.stdout}\n${err.stderr}`); });

  test('register → intake → reload restores the state; writes for one intake-to-plan session', async () => {
    const { stdout } = await shoot('tests/e2e/firebase-saves.json');
    assert.match(stdout, /✓ OK/);
    const evals = stdout.split('\n').filter((l) => l.includes('[eval]') && l.includes('"adapter"'))
      .map((l) => JSON.parse(l.slice(l.lastIndexOf('→') + 1)));
    const [pre, post] = [evals.find((e) => e.before === 'reload'), evals.find((e) => e.uid)];
    const save = await readDoc(`saves/${post.uid}`);
    // The save policy counts on from the loaded saveCount, so the server's count = loaded + saves since the reload.
    assert.equal(Number(save.saveCount.integerValue), post.loadedSaveCount + post.policy.saves);
    assert.equal(JSON.parse(save.stateJson.stringValue).phase, 'paperwork');
    assert.equal(post.policy.summaries, 1, 'after the reload only the phase change writes a summary');
    const commits = pre.adapter.commits + post.adapter.commits;
    const docWrites = pre.adapter.docWrites + post.adapter.docWrites;
    // players/{uid} create (1) + every save commit (1 doc, or 2 with the summary).
    console.log(`writes for register → intake → reload → choose a home: ${1 + docWrites} ` +
      `(player doc 1, ${commits} save commits, ${docWrites - commits} with a summary)`);
  });

  test('offline → keep playing → online: the save syncs', async () => {
    const { stdout } = await shoot('tests/e2e/firebase-offline.json');
    assert.match(stdout, /✓ OK/);
    const line = stdout.split('\n').find((l) => l.includes('[eval]') && l.includes('removeItem'));
    const uid = JSON.parse(line.slice(line.indexOf('→') + 1));
    const save = await readDoc(`saves/${uid}`);
    assert.equal(JSON.parse(save.stateJson.stringValue).player.jobTitle, 'Head cook (offline edit)');
  });
});
