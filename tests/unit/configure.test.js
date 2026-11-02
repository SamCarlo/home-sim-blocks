// tools/configure.mjs (11 §8): config parsing, rendering, and a real run in a temp copy of the files it touches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFirebaseConfig, checkEmail, checkProject, renderRules, renderConfigJs } from '../../tools/configure.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CFG = {
  apiKey: 'AIzaSyFAKE-key_123', authDomain: 'io-life-sim.firebaseapp.com', projectId: 'io-life-sim',
  storageBucket: 'io-life-sim.firebasestorage.app', messagingSenderId: '123456789', appId: '1:123456789:web:abc123',
};
// What the Firebase console shows under "Your apps", pasted as-is.
const PASTED = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyFAKE-key_123",
  authDomain: 'io-life-sim.firebaseapp.com',
  projectId: "io-life-sim",
  storageBucket: "io-life-sim.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123", // trailing comma
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);`;

test('parseFirebaseConfig reads JSON, a wrapped object, and the pasted console snippet', () => {
  assert.deepEqual(parseFirebaseConfig(JSON.stringify(CFG)), CFG);
  assert.deepEqual(parseFirebaseConfig(JSON.stringify({ firebaseConfig: CFG })), CFG);
  assert.deepEqual(parseFirebaseConfig(PASTED), CFG);
  assert.throws(() => parseFirebaseConfig('{ apiKey: "x" }'), /missing authDomain, projectId, appId/);
  assert.throws(() => parseFirebaseConfig('nothing here'), /no \{/);
});

test('the pasted snippet runs in an empty sandbox', () => {
  assert.throws(() => parseFirebaseConfig('const c = { apiKey: process.exit(3) };'), /process is not defined/);
});

test('email and project checks', () => {
  assert.equal(checkEmail('  Teacher.Name@Gmail.com '), 'teacher.name@gmail.com');
  assert.throws(() => checkEmail("x'@y.com"), /doesn't look like/);
  assert.throws(() => checkEmail('nobody'), /doesn't look like/);
  assert.equal(checkProject('io-life-sim'), 'io-life-sim');
  assert.throws(() => checkProject('Bad_Project'), /valid Firebase project ID/);
});

test('renderRules fills every marker; renderConfigJs turns Firebase on', () => {
  const out = renderRules("a '__ADMIN_EMAIL__' b '__ADMIN_EMAIL__'", 't@x.org');
  assert.equal(out, "a 't@x.org' b 't@x.org'");
  assert.throws(() => renderRules('no marker', 't@x.org'), /marker/);
  const js = renderConfigJs(CFG, 't@x.org');
  assert.match(js, /FIREBASE_ENABLED = true;/);
  assert.match(js, /ADMIN_EMAIL = "t@x.org";/);
});

test('a run in a temp copy writes all three files, is idempotent, and --placeholder undoes it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'homesim-configure-'));
  try {
    const files = ['tools/configure.mjs', 'firestore.rules.template', 'firestore.rules', '.firebaserc',
      'app/src/firebase-config.js'];
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    }
    const snippet = path.join(tmp, 'pasted.txt');
    fs.writeFileSync(snippet, PASTED);
    const run = (...args) => execFileSync('node', [path.join(tmp, 'tools/configure.mjs'), ...args], { encoding: 'utf8' });

    const first = run('--config', snippet, '--admin', 'Teacher@Gmail.com');
    assert.match(first, /updated {4}app\/src\/firebase-config\.js/);
    assert.match(first, /npx firebase-tools deploy --only hosting,firestore/);
    const mod = await import(`${path.join(tmp, 'app/src/firebase-config.js')}?t=1`);
    assert.equal(mod.FIREBASE_ENABLED, true);
    assert.equal(mod.ADMIN_EMAIL, 'teacher@gmail.com');
    assert.deepEqual(mod.firebaseConfig, CFG);
    const rules = fs.readFileSync(path.join(tmp, 'firestore.rules'), 'utf8');
    assert.match(rules, /request\.auth\.token\.email == 'teacher@gmail\.com'/);
    assert.doesNotMatch(rules, /__ADMIN_EMAIL__|admin@example\.com/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, '.firebaserc'), 'utf8')), { projects: { default: 'io-life-sim' } });

    fs.writeFileSync(path.join(tmp, 'cfg.json'), JSON.stringify(CFG));
    const again = run('--config', path.join(tmp, 'cfg.json'), '--admin', 'teacher@gmail.com');
    assert.equal(again.match(/unchanged/g).length, 3, again);

    run('--placeholder');
    for (const f of ['firestore.rules', '.firebaserc', 'app/src/firebase-config.js']) {
      assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), fs.readFileSync(path.join(ROOT, f), 'utf8'), f);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the committed files are the placeholder defaults', async () => {
  const mod = await import('../../app/src/firebase-config.js');
  assert.equal(mod.FIREBASE_ENABLED, false);
  assert.equal(mod.ADMIN_EMAIL, 'admin@example.com');
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  assert.equal(rules, renderRules(fs.readFileSync(path.join(ROOT, 'firestore.rules.template'), 'utf8'), 'admin@example.com'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8')), { projects: { default: 'demo-home-blocks' } });
});
