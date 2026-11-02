// npm run test:e2e (task 56): every tests/e2e/play-*.json playthrough in local mode, two at a time, each in its own
// shoot.mjs browser. `--emulator` instead runs the apartment path on the Firebase emulators (?emulator=1); start it with
// `npm run test:e2e:emulator` (emulators:exec + mise Java). `--only <name>` runs one file. Exit 1 if any run fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const emulator = args.includes('--emulator');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const PROJECT = 'demo-home-blocks';

const files = fs.readdirSync(path.join(HS, 'tests/e2e')).filter((f) => /^play-.*\.json$/.test(f))
  .filter((f) => (emulator ? f === 'play-apartment-hilo.json' : true))
  .filter((f) => !only || f.includes(only)).sort();

function shoot(file) {
  const query = emulator ? '?emulator=1&speed=20&care=hit' : '?speed=20&care=hit';
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('node', ['tools/shoot.mjs', '--path', `/index.html${query}`, '--steps', `tests/e2e/${file}`,
      '--timeout', '30000'], { cwd: HS });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ file, code, out, secs: Math.round((Date.now() - t0) / 1000) }));
  });
}

/** Clear the emulators' accounts and documents so the usernames are free, then add the DEMO class code the play files
 *  register with (Bearer owner skips the rules). */
async function resetEmulator() {
  const opts = { method: 'DELETE', headers: { Authorization: 'Bearer owner' } };
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, opts);
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, opts);
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/classCodes?documentId=DEMO`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { active: { booleanValue: true }, label: { stringValue: 'Playthroughs' } } }) });
  if (!r.ok) throw new Error(`seeding classCodes/DEMO: ${r.status} ${await r.text()}`);
}

if (emulator) await resetEmulator();
const queue = [...files];
const results = [];
await Promise.all([0, 1].map(async () => {
  while (queue.length) {
    const r = await shoot(queue.shift());
    results.push(r);
    console.log(`${r.code === 0 ? '✓' : '✗'} ${r.file}${emulator ? ' (emulator)' : ''} ${r.secs}s`);
    if (r.code !== 0) console.log(r.out.split('\n').filter((l) => !/\[(assert\] ok|shot\]|eval\])/.test(l)).slice(-12).join('\n'));
  }
}));
const failed = results.filter((r) => r.code !== 0).length;
console.log(`e2e: ${results.length - failed}/${results.length} playthroughs passed`);
process.exit(failed || !results.length ? 1 : 0);
