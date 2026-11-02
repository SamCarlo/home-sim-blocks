// Firestore security rules (11 §5), every case, against the emulator. Run: mise exec java@temurin-21 -- npm run test:rules
// (emulators:exec sets FIRESTORE_EMULATOR_HOST). Uses the committed firestore.rules and checks it matches the template.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/firestore';
import { renderRules } from '../../tools/configure.mjs';

const ADMIN = 'admin@example.com';
const rules = fs.readFileSync('firestore.rules', 'utf8');
const SAVE = { stateJson: '{"version":1}', version: 1, updatedAt: 1, saveCount: 1 };
const summary = { phase: 'intake', monthIndex: 0 };
const playerDoc = (username, classCode = 'IO-P3', extra = {}) =>
  ({ username, classCode, createdAt: 1, updatedAt: 1, disabled: false, summary, ...extra });

let env;
// Identities. Students sign in with email/password on the synthetic domain; the admin with Google.
const student = (uid, username) => env.authenticatedContext(uid, {
  email: `${username}@players.example.com`, email_verified: false, firebase: { sign_in_provider: 'password' },
}).firestore();
const google = (uid, email, verified = true) => env.authenticatedContext(uid, {
  email, email_verified: verified, firebase: { sign_in_provider: 'google.com' },
}).firestore();
const kai = () => student('kai-uid', 'kai_22');
const lani = () => student('lani-uid', 'lani-7');
const paused = () => student('paused-uid', 'paused1');
const admin = () => google('admin-1', ADMIN);
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  setLogLevel('silent'); // every assertFails would otherwise print a PERMISSION_DENIED stream warning
  env = await initializeTestEnvironment({ projectId: 'demo-home-blocks', firestore: { rules } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('classCodes/IO-P3').set({ label: 'Period 3 Life Skills', active: true, createdAt: 1 });
    await db.doc('classCodes/OLD-P1').set({ label: 'Last year', active: false, createdAt: 1 });
    await db.doc('players/lani-uid').set(playerDoc('lani-7'));
    await db.doc('players/paused-uid').set(playerDoc('paused1', 'IO-P3', { disabled: true }));
    await db.doc('saves/lani-uid').set(SAVE);
    await db.doc('saves/paused-uid').set(SAVE);
  });
});

test('committed firestore.rules is the template rendered with admin@example.com', () => {
  assert.equal(rules, renderRules(fs.readFileSync('firestore.rules.template', 'utf8'), ADMIN));
});

describe('classCodes', () => {
  test('anyone can get a code, signed in or not', async () => {
    await assertSucceeds(anon().doc('classCodes/IO-P3').get());
    await assertSucceeds(kai().doc('classCodes/IO-P3').get());
    await assertSucceeds(anon().doc('classCodes/NOPE').get());
  });
  test('only the admin can list codes', async () => {
    await assertFails(anon().collection('classCodes').get());
    await assertFails(lani().collection('classCodes').get());
    await assertSucceeds(admin().collection('classCodes').get());
  });
  test('only the admin can create, change or delete codes', async () => {
    await assertFails(lani().doc('classCodes/HACK').set({ label: 'x', active: true, createdAt: 1 }));
    await assertFails(lani().doc('classCodes/OLD-P1').update({ active: true }));
    await assertFails(lani().doc('classCodes/IO-P3').delete());
    await assertFails(anon().doc('classCodes/HACK').set({ label: 'x', active: true, createdAt: 1 }));
    await assertSucceeds(admin().doc('classCodes/IO-P4').set({ label: 'Period 4', active: true, createdAt: 2 }));
    await assertSucceeds(admin().doc('classCodes/OLD-P1').update({ active: true }));
    await assertSucceeds(admin().doc('classCodes/IO-P3').delete());
  });
});

describe('players: create', () => {
  test('a student can create their own player doc with an active code', async () => {
    await assertSucceeds(kai().doc('players/kai-uid').set(playerDoc('kai_22')));
  });
  test('not with a missing or inactive code', async () => {
    await assertFails(kai().doc('players/kai-uid').set(playerDoc('kai_22', 'NOPE')));
    await assertFails(kai().doc('players/kai-uid').set(playerDoc('kai_22', 'OLD-P1')));
  });
  test('not with a username that differs from their email', async () => {
    await assertFails(kai().doc('players/kai-uid').set(playerDoc('lani-7')));
  });
  test('not with disabled: true', async () => {
    await assertFails(kai().doc('players/kai-uid').set(playerDoc('kai_22', 'IO-P3', { disabled: true })));
  });
  test('not with extra fields, for another uid, or from a non-student account', async () => {
    await assertFails(kai().doc('players/kai-uid').set(playerDoc('kai_22', 'IO-P3', { transferredTo: 'x' })));
    await assertFails(kai().doc('players/someone-else').set(playerDoc('kai_22')));
    await assertFails(google('g-uid', 'kai_22@gmail.com').doc('players/g-uid').set(playerDoc('kai_22')));
    await assertFails(anon().doc('players/kai-uid').set(playerDoc('kai_22')));
  });
});

describe('players: read, update, delete', () => {
  test('a student reads only their own player doc', async () => {
    await assertSucceeds(lani().doc('players/lani-uid').get());
    await assertFails(kai().doc('players/lani-uid').get());
    await assertFails(anon().doc('players/lani-uid').get());
    await assertFails(lani().collection('players').get());
  });
  test('a student can update summary and updatedAt', async () => {
    await assertSucceeds(lani().doc('players/lani-uid').update({ summary: { phase: 'life', monthIndex: 3 }, updatedAt: 9 }));
  });
  test("a student can't change disabled, classCode or username", async () => {
    await assertFails(lani().doc('players/lani-uid').update({ disabled: true }));
    await assertFails(lani().doc('players/lani-uid').update({ classCode: 'OLD-P1' }));
    await assertFails(lani().doc('players/lani-uid').update({ username: 'someone' }));
    await assertFails(lani().doc('players/lani-uid').update({ summary, transferredTo: 'kai-uid' }));
  });
  test("a student can't update someone else's doc, and a paused student can't update their own", async () => {
    await assertFails(kai().doc('players/lani-uid').update({ updatedAt: 9 }));
    await assertFails(paused().doc('players/paused-uid').update({ summary, updatedAt: 9 }));
    await assertFails(paused().doc('players/paused-uid').update({ disabled: false }));
  });
  test("a student can't delete a player doc, even their own", async () => {
    await assertFails(lani().doc('players/lani-uid').delete());
  });
});

describe('saves', () => {
  test('a student can read and write their own save', async () => {
    await assertSucceeds(lani().doc('saves/lani-uid').get());
    await assertSucceeds(lani().doc('saves/lani-uid').set({ ...SAVE, saveCount: 2, updatedAt: 2 }));
    await assertSucceeds(lani().doc('saves/lani-uid').update({ stateJson: '{"version":1,"x":2}', saveCount: 3 }));
  });
  test('a new student can create their first save once their player doc exists', async () => {
    await assertFails(kai().doc('saves/kai-uid').set(SAVE));
    await assertSucceeds(kai().doc('players/kai-uid').set(playerDoc('kai_22')));
    await assertSucceeds(kai().doc('saves/kai-uid').set(SAVE));
  });
  test("a student can't read or write someone else's save", async () => {
    await assertFails(kai().doc('saves/lani-uid').get());
    await assertFails(kai().doc('saves/lani-uid').set(SAVE));
    await assertFails(anon().doc('saves/lani-uid').get());
    await assertFails(lani().collection('saves').get());
  });
  test("a disabled student can't read or write their save", async () => {
    await assertFails(paused().doc('saves/paused-uid').get());
    await assertFails(paused().doc('saves/paused-uid').set({ ...SAVE, saveCount: 2 }));
  });
  test('writes over the size cap are denied, just under it allowed', async () => {
    await assertSucceeds(lani().doc('saves/lani-uid').set({ ...SAVE, stateJson: 'x'.repeat(899_999) }));
    await assertFails(lani().doc('saves/lani-uid').set({ ...SAVE, stateJson: 'x'.repeat(900_000) }));
  });
  test('the save shape is enforced: string stateJson, no extra fields', async () => {
    await assertFails(lani().doc('saves/lani-uid').set({ ...SAVE, stateJson: { version: 1 } }));
    await assertFails(lani().doc('saves/lani-uid').set({ ...SAVE, cheat: true }));
  });
  test("a student can't delete their save", async () => {
    await assertFails(lani().doc('saves/lani-uid').delete());
  });
});

describe('admin', () => {
  test('the admin (right email, verified, Google) can do everything', async () => {
    const db = admin();
    await assertSucceeds(db.collection('players').get());
    await assertSucceeds(db.doc('players/lani-uid').get());
    await assertSucceeds(db.doc('players/lani-uid').update({ disabled: true, transferredTo: 'kai-uid' }));
    await assertSucceeds(db.doc('players/kai-uid').set(playerDoc('kai_22', 'OLD-P1', { disabled: true })));
    await assertSucceeds(db.doc('players/paused-uid').delete());
    await assertSucceeds(db.collection('saves').get());
    await assertSucceeds(db.doc('saves/paused-uid').get());
    await assertSucceeds(db.doc('saves/kai-uid').set({ ...SAVE, stateJson: 'copied' }));
    await assertSucceeds(db.doc('saves/lani-uid').update({ saveCount: 99 }));
    await assertSucceeds(db.doc('saves/paused-uid').delete());
  });
  test('the same email through a password provider is denied', async () => {
    const db = env.authenticatedContext('pw-uid', {
      email: ADMIN, email_verified: true, firebase: { sign_in_provider: 'password' },
    }).firestore();
    await assertFails(db.collection('classCodes').get());
    await assertFails(db.doc('classCodes/X-1').set({ label: 'x', active: true, createdAt: 1 }));
    await assertFails(db.doc('players/lani-uid').get());
    await assertFails(db.doc('saves/lani-uid').get());
    await assertFails(db.doc('players/lani-uid').update({ disabled: true }));
  });
  test('the right email through Google but unverified is denied', async () => {
    const db = google('g-unverified', ADMIN, false);
    await assertFails(db.collection('classCodes').get());
    await assertFails(db.doc('saves/lani-uid').get());
  });
  test('any other Google account is denied', async () => {
    const db = google('g-other', 'someone.else@gmail.com');
    await assertFails(db.collection('classCodes').get());
    await assertFails(db.doc('classCodes/X-1').set({ label: 'x', active: true, createdAt: 1 }));
    await assertFails(db.collection('players').get());
    await assertFails(db.doc('players/lani-uid').get());
    await assertFails(db.doc('saves/lani-uid').get());
    await assertFails(db.doc('saves/lani-uid').delete());
  });
});
