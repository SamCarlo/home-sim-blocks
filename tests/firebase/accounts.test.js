// Student accounts on Firebase Auth (11 §2, task 50), against the Auth + Firestore emulators.
// Run: mise exec java@temurin-21 -- npm run test:firebase (emulators:exec starts both emulators).
// Part 1 drives accounts/firebase.js from Node (npm `firebase`); part 2 runs the shoot.mjs step files on ?emulator=1.
// Class codes and the paused flag are seeded straight into the emulator over REST ("Bearer owner" skips the rules).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fbApp from 'firebase/app';
import * as fbAuth from 'firebase/auth';
import * as fbStore from 'firebase/firestore';
import { createFirebaseProvider, emailFor } from '../../app/src/accounts/firebase.js';
import { MESSAGES } from '../../app/src/accounts/provider.js';

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
const resetEmulators = () => Promise.all([
  call(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' }),
  call(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }),
]);
const seedCode = (code, active) => call(`${FS}/classCodes/${code}`, {
  method: 'PATCH', headers: owner,
  body: JSON.stringify({ fields: { label: { stringValue: code }, active: { booleanValue: active }, createdAt: { integerValue: '1' } } }),
});
const pause = (uid) => call(`${FS}/players/${uid}?updateMask.fieldPaths=disabled`, {
  method: 'PATCH', headers: owner, body: JSON.stringify({ fields: { disabled: { booleanValue: true } } }),
});
const readPlayer = async (uid) => {
  const res = await fetch(`${FS}/players/${uid}`, { headers: owner });
  return res.status === 404 ? null : (await res.json()).fields;
};

/** A fresh provider on its own named app (Node keeps every app in one process). */
async function provider(overrides = {}) {
  const p = createFirebaseProvider({ emulator: true, appName: `t50-${++appSeq}`, sdk: { ...sdk, ...overrides }, browser: false });
  await p.init();
  return p;
}
const rejectsWith = (promise, message, field) => assert.rejects(promise, (err) => {
  assert.equal(err.name, 'AccountError');
  assert.equal(err.message, message);
  if (field !== undefined) assert.equal(err.field, field);
  return true;
});

// Firestore/Auth clients keep sockets open; delete every app so the test process can exit.
after(async () => { await Promise.all(fbApp.getApps().map((a) => fbApp.deleteApp(a))); });

before(async () => {
  fbStore.setLogLevel('silent');
  await resetEmulators();
  await seedCode('IO-P3', true);
  await seedCode('OLD-P1', false);
});

describe('accounts/firebase.js on the emulator', () => {
  test('register writes players/{uid}, then log out and log in again', async () => {
    const p = await provider();
    const seen = [];
    p.onChange((u) => seen.push(u?.username ?? null));
    const user = await p.register({ username: 'Lani_7', password: 'password123', classCode: 'io-p3' });
    assert.deepEqual({ username: user.username, classCode: user.classCode }, { username: 'lani_7', classCode: 'IO-P3' });
    assert.equal(p.auth.currentUser.email, 'lani_7@players.example.com');
    const doc = await readPlayer(user.uid);
    assert.equal(doc.username.stringValue, 'lani_7');
    assert.equal(doc.classCode.stringValue, 'IO-P3');
    assert.equal(doc.disabled.booleanValue, false);
    await p.logout();
    assert.equal(p.current(), null);
    const again = await p.login({ username: 'LANI_7', password: 'password123' });
    assert.equal(again.uid, user.uid);
    assert.deepEqual(seen, ['lani_7', null, 'lani_7']);
  });

  test('friendly errors: wrong password, unknown user, taken username, bad codes', async () => {
    const p = await provider();
    await p.register({ username: 'takenkid', password: 'password123', classCode: 'IO-P3' });
    await p.logout();
    await rejectsWith(p.login({ username: 'takenkid', password: 'nope-nope' }), MESSAGES.badLogin);
    await rejectsWith(p.login({ username: 'nobodyhere', password: 'password123' }), MESSAGES.badLogin);
    await rejectsWith(p.register({ username: 'takenkid', password: 'password123', classCode: 'IO-P3' }), MESSAGES.usernameTaken, 'username');
    await rejectsWith(p.register({ username: 'kid3', password: 'password123', classCode: 'OLD-P1' }), MESSAGES.classCodeUnknown, 'classCode');
    await rejectsWith(p.register({ username: 'kid3', password: 'password123', classCode: 'NOPE' }), MESSAGES.classCodeUnknown, 'classCode');
    await rejectsWith(p.register({ username: 'kid3', password: 'short', classCode: 'IO-P3' }), MESSAGES.passwordShort, 'password');
    assert.equal(p.current(), null);
  });

  test('a paused account is refused and signed out', async () => {
    const p = await provider();
    const u = await p.register({ username: 'pausedkid', password: 'password123', classCode: 'IO-P3' });
    await p.logout();
    await pause(u.uid);
    await rejectsWith(p.login({ username: 'pausedkid', password: 'password123' }), 'Your account is paused. Ask your teacher.');
    assert.equal(p.current(), null);
    assert.equal(p.auth.currentUser, null);
  });

  test('no orphan: when the players write fails the new Auth user is deleted', async () => {
    const failing = { ...fbStore, setDoc: async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); } };
    const p = await provider({ firestore: failing });
    await assert.rejects(p.register({ username: 'orphan1', password: 'password123', classCode: 'IO-P3' }), { name: 'AccountError' });
    assert.equal(p.current(), null);
    // The username is free again: a normal provider can register it.
    const q = await provider();
    const u = await q.register({ username: 'orphan1', password: 'password123', classCode: 'IO-P3' });
    assert.ok(u.uid);
    assert.equal(emailFor('Orphan1'), 'orphan1@players.example.com');
  });
});

describe('login screen on ?emulator=1 (shoot.mjs)', () => {
  const shoot = (steps) => run('node', ['tools/shoot.mjs', '--path', '/index.html?emulator=1&theme=light', '--steps', steps], { timeout: 120000 })
    .catch((err) => { throw new Error(`${steps} failed:\n${err.stdout}\n${err.stderr}`); });

  test('register → intake → log out → log in', async () => {
    const { stdout } = await shoot('tests/e2e/firebase-register.json');
    assert.match(stdout, /✓ OK/);
  });

  test('wrong password, taken username, inactive code, paused account', async () => {
    // takenkid and pausedkid exist from the Node tests above (pausedkid is paused).
    const { stdout } = await shoot('tests/e2e/firebase-errors.json');
    assert.match(stdout, /✓ OK/);
  });
});
