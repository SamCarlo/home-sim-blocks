// Production checks (task 53, 11 §8): dev flags off the dev hosts, no stray console.log, cache headers, and nothing
// dev-only or private inside the hosted folder (firebase.json serves app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devFlagsAllowed } from '../../app/src/dev/flags.js';
import { chooseMode } from '../../app/src/accounts/provider.js';

const HS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEV = ['localhost', '127.0.0.1'];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('devFlagsAllowed: local mode anywhere, Firebase mode only on dev hosts', () => {
  const ok = (enabled, hostname) => devFlagsAllowed({ enabled, hostname, devHosts: DEV });
  assert.equal(ok(false, 'homesim.web.app'), true);
  assert.equal(ok(false, 'localhost'), true);
  assert.equal(ok(true, 'localhost'), true);
  assert.equal(ok(true, '127.0.0.1'), true);
  assert.equal(ok(true, 'homesim.web.app'), false);
  assert.equal(ok(true, 'homesim.firebaseapp.com'), false);
  assert.equal(ok(true, ''), false);
});

test('chooseMode: on the deployed site ?seed= and ?adapter= cannot drop a student into local mode', () => {
  const mode = (q, hostname) => chooseMode({ enabled: true, params: new URLSearchParams(q), hostname, devHosts: DEV });
  for (const q of ['?seed=fresh', '?adapter=local', '?emulator=1&seed=x']) {
    assert.deepEqual(mode(q, 'homesim.web.app'), { firebaseMode: true, emulator: false }, q);
  }
  assert.deepEqual(mode('?adapter=local', 'localhost'), { firebaseMode: false, emulator: false });
});

test('no stray console.log in the shipped app', () => {
  const hits = walk(path.join(HS, 'app'))
    .filter((f) => /\.(js|html)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`))
    .filter((f) => /\bconsole\.log\(/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(HS, f));
  assert.deepEqual(hits, []);
});

test('firebase.json: hosts app/ with the 11 §8 cache headers', () => {
  const { hosting } = JSON.parse(fs.readFileSync(path.join(HS, 'firebase.json'), 'utf8'));
  assert.equal(hosting.public, 'app');
  assert.equal(hosting.cleanUrls, true);
  assert.ok(hosting.ignore.includes('**/.*'));
  const header = (src) => hosting.headers.find((x) => x.source === src)?.headers.find((x) => x.key === 'Cache-Control')?.value;
  assert.equal(header('/vendor/**'), 'public, max-age=31536000, immutable');
  assert.equal(header('**/*.@(js|css|json|svg|woff2)'), 'public, max-age=3600');
  assert.equal(header('**/*.html'), 'no-cache');
});

test('the hosted folder holds only app files (no logs, tests, secrets, source maps or tooling)', () => {
  const allowed = /\.(html|js|css|json|svg|aff|dic)$|\/(LICENSE|NOTICE|VERSIONS\.md)$|^app\/vendor\/[^/]+\/README\.md$/; // vendor READMEs: blocks task 02
  const bad = walk(path.join(HS, 'app')).map((f) => path.relative(HS, f).split(path.sep).join('/'))
    .filter((f) => !allowed.test(f) || /\.(test|spec)\.js$|\.map$|(^|\/)\.|node_modules|firebaserc|-debug\.log/.test(f));
  assert.deepEqual(bad, []);
});
