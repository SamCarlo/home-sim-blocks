// Admin console on the emulators (11 §3, §7, task 52). Run: mise exec java@temurin-21 -- npm run test:firebase.
// The shoot run drives admin.html?fakeAdmin=: create a code → two students register with it → the admin sees them →
// transfers the first save to the second username (the first is paused). Then a non-admin Google account sees
// "This account isn't the admin" and the rules refuse it the data.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fbApp from 'firebase/app';
import * as fbAuth from 'firebase/auth';
import * as fbStore from 'firebase/firestore';
import { EMULATOR } from '../../app/src/accounts/firebase.js';

const run = promisify(execFile);
const PROJECT = 'demo-home-blocks';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner' };

async function call(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${url}: ${res.status} ${await res.text()}`);
  return res;
}
const readDoc = async (path) => {
  const res = await fetch(`${FS}/${path}`, { headers: owner });
  return res.status === 404 ? null : (await res.json()).fields;
};

/** Sign in to the emulator as a Google user (the fakeAdmin credential, 11 §7). */
async function googleUser(email, name) {
  const app = fbApp.initializeApp(EMULATOR.config, name);
  const auth = fbAuth.getAuth(app);
  fbAuth.connectAuthEmulator(auth, EMULATOR.authUrl, { disableWarnings: true });
  const db = fbStore.getFirestore(app);
  fbStore.connectFirestoreEmulator(db, EMULATOR.firestoreHost, EMULATOR.firestorePort);
  await fbAuth.signInWithCredential(auth, fbAuth.GoogleAuthProvider.credential(JSON.stringify({ sub: `g-${name}`, email, email_verified: true })));
  return db;
}

const shoot = (path, steps) => run('node', ['tools/shoot.mjs', '--path', path, '--steps', steps], { timeout: 240000 })
  .then((r) => r.stdout)
  .catch((err) => { throw new Error(`${steps} failed:\n${err.stdout}\n${err.stderr}`); });

before(async () => {
  fbStore.setLogLevel('silent');
  await Promise.all([
    call(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' }),
    call(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }),
  ]);
});
after(async () => { await Promise.all(fbApp.getApps().map((a) => fbApp.deleteApp(a))); });

describe('admin console (admin.html on ?emulator=1)', () => {
  test('create code → students register → admin sees them → transfer pauses the first', async () => {
    const out = await shoot('/admin.html?emulator=1&fakeAdmin=admin@example.com&theme=light', 'tests/e2e/admin-flow.json');
    assert.match(out, /✓ OK/);
    const uids = Object.assign({}, ...out.split('\n').filter((l) => l.includes('[eval]') && l.includes('"adkid'))
      .map((l) => JSON.parse(l.slice(l.lastIndexOf('→') + 1))));
    const code = await readDoc('classCodes/AD-P1');
    assert.equal(code.label.stringValue, 'Period 1 Life Skills');
    assert.equal(code.active.booleanValue, true);
    const from = await readDoc(`players/${uids.adkid1}`);
    assert.equal(from.disabled.booleanValue, true);
    assert.equal(from.transferredTo.stringValue, uids.adkid2);
    const to = await readDoc(`players/${uids.adkid2}`);
    assert.equal(to.summary.mapValue.fields.phase.stringValue, 'plan');
    assert.equal(to.summary.mapValue.fields.username.stringValue, 'adkid2');
    const save = JSON.parse((await readDoc(`saves/${uids.adkid2}`)).stateJson.stringValue);
    assert.equal(save.account.username, 'adkid2');
    assert.equal(save.player.jobTitle, 'Dental assistant');
  });

  test('a non-admin Google account sees "This account isn\'t the admin" and the rules deny it the data', async () => {
    const out = await shoot('/admin.html?emulator=1&fakeAdmin=kid@gmail.com&theme=light', 'tests/e2e/admin-not-admin.json');
    assert.match(out, /✓ OK/);
    const db = await googleUser('kid@gmail.com', 'not-admin');
    await assert.rejects(fbStore.getDocs(fbStore.collection(db, 'players')), { code: 'permission-denied' });
    await assert.rejects(fbStore.getDocs(fbStore.collection(db, 'classCodes')), { code: 'permission-denied' });
    const anyUid = (await (await fetch(`${FS}/players`, { headers: owner })).json()).documents[0].name.split('/').pop();
    await assert.rejects(fbStore.getDoc(fbStore.doc(db, 'saves', anyUid)), { code: 'permission-denied' });
    // The same credential path with the admin email is let through (sanity check of the fake sign-in).
    const adminDb = await googleUser('admin@example.com', 'admin-check');
    assert.ok((await fbStore.getDocs(fbStore.collection(adminDb, 'players'))).size >= 2);
  });
});
