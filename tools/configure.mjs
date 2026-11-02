#!/usr/bin/env node
// Point the game at the teacher's Firebase project (11 §8). Idempotent: re-running with the same input changes nothing.
//   node tools/configure.mjs --config <firebaseConfig.json | file with the pasted JS snippet | - for stdin> --admin <email> [--project <id>]
//   node tools/configure.mjs --placeholder      restore the committed defaults (local mode, admin@example.com, demo-home-blocks)
// Writes app/src/firebase-config.js, firestore.rules (from firestore.rules.template) and .firebaserc.
// It never talks to the network or to Firebase; deploying is a separate, deliberate step.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = {
  admin: 'admin@example.com',
  project: 'demo-home-blocks',
  // Byte-for-byte the committed app/src/firebase-config.js, so --placeholder is a clean undo.
  configJs: "// Placeholder. tools/configure.mjs (task 49) overwrites this file with the teacher's project.\n"
    + "export const FIREBASE_ENABLED = false; export const ADMIN_EMAIL = 'admin@example.com'; export const firebaseConfig = { apiKey: 'demo', authDomain: 'demo-home-blocks.firebaseapp.com', projectId: 'demo-home-blocks' };\n",
};
const CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

function usage(msg) {
  if (msg) console.error(`configure: ${msg}\n`);
  console.error('Usage: node tools/configure.mjs --config <file or -> --admin <email> [--project <id>]\n'
    + '       node tools/configure.mjs --placeholder');
  process.exit(msg ? 1 : 0);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    else if (a === '--placeholder') out.placeholder = true;
    else if (['--config', '--admin', '--project'].includes(a)) {
      if (i + 1 >= argv.length) usage(`${a} needs a value`);
      out[a.slice(2)] = argv[++i];
    } else usage(`unknown argument ${a}`);
  }
  return out;
}

// Accepts plain JSON, or the snippet Firebase shows: `const firebaseConfig = { apiKey: "...", ... };` (comments,
// unquoted keys, single quotes and trailing commas all fine). Only the `firebaseConfig = {...}` object literal (else the
// first {...}) is evaluated, in an empty sandbox, so nothing else in the paste can run.
export function parseFirebaseConfig(text) {
  try { return pickKeys(JSON.parse(text)); } catch { /* not JSON, try the JS snippet */ }
  const named = /firebaseConfig\s*[=:]\s*\{/.exec(text); // skip `import { initializeApp }` above the object
  const start = named ? named.index + named[0].length - 1 : text.indexOf('{');
  if (start < 0) throw new Error('no { … } object found in the config');
  let depth = 0, end = -1, quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error('the config object has no closing }');
  const obj = vm.runInNewContext(`(${text.slice(start, end + 1)})`, Object.create(null), { timeout: 200 });
  return pickKeys(obj);
}

function pickKeys(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('the config is not an object');
  const src = obj.firebaseConfig && typeof obj.firebaseConfig === 'object' ? obj.firebaseConfig : obj;
  const out = {};
  for (const k of CONFIG_KEYS) if (src[k] != null) out[k] = String(src[k]);
  const missing = REQUIRED_KEYS.filter((k) => !out[k]);
  if (missing.length) throw new Error(`the config is missing ${missing.join(', ')}`);
  return out;
}

export function checkEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) throw new Error(`"${email}" doesn't look like an email address`);
  return e;
}

export function checkProject(id) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id)) throw new Error(`"${id}" isn't a valid Firebase project ID`);
  return id;
}

export function renderRules(template, admin) {
  if (!template.includes('__ADMIN_EMAIL__')) throw new Error('firestore.rules.template has no __ADMIN_EMAIL__ marker');
  return template.replaceAll('__ADMIN_EMAIL__', admin);
}

export function renderConfigJs(config, admin) {
  const lines = Object.entries(config).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`);
  return '// Written by tools/configure.mjs. Re-run it to change projects; `--placeholder` restores local mode.\n'
    + `export const FIREBASE_ENABLED = true;\nexport const ADMIN_EMAIL = ${JSON.stringify(admin)};\n`
    + `export const firebaseConfig = {\n${lines.join('\n')}\n};\n`;
}

export function renderFirebaserc(project) {
  return `${JSON.stringify({ projects: { default: project } }, null, 2)}\n`;
}

function writeIfChanged(rel, text) {
  const file = path.join(ROOT, rel);
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (old === text) return `  unchanged  ${rel}`;
  fs.writeFileSync(file, text);
  return `  ${old == null ? 'created  ' : 'updated  '}  ${rel}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let admin, project, configJs;
  if (args.placeholder) {
    if (args.config || args.admin || args.project) usage('--placeholder takes no other arguments');
    ({ admin, project, configJs } = PLACEHOLDER);
  } else {
    if (!args.config || !args.admin) usage('--config and --admin are both required');
    const text = args.config === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(args.config), 'utf8');
    const config = parseFirebaseConfig(text);
    admin = checkEmail(args.admin);
    project = checkProject(args.project || config.projectId);
    if (project !== config.projectId) {
      console.warn(`configure: warning: --project ${project} differs from the config's projectId ${config.projectId}`);
    }
    configJs = renderConfigJs(config, admin);
  }
  const template = fs.readFileSync(path.join(ROOT, 'firestore.rules.template'), 'utf8');
  const report = [
    writeIfChanged('app/src/firebase-config.js', configJs),
    writeIfChanged('firestore.rules', renderRules(template, admin)),
    writeIfChanged('.firebaserc', renderFirebaserc(project)),
  ];
  console.log(`configure: project ${project}, admin ${admin}\n${report.join('\n')}`);
  if (args.placeholder) {
    console.log('\nBack to local mode. Saves stay in the browser until configure runs with a real project.');
    return;
  }
  console.log(`
Next steps (docs/DEPLOY.md has the click-by-click version):
  1. In the Firebase console, check that Authentication has Email/Password and Google turned on,
     and that Firestore was created in production mode.
  2. Sign in to the Firebase CLI once (a browser opens):  npx firebase-tools login
  3. Deploy from this folder:  npx firebase-tools deploy --only hosting,firestore
  4. Open https://${project}.web.app/admin, sign in as ${admin}, and create a class code for each period.
  5. Give students https://${project}.web.app and their period's code.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`configure: ${e.message}`); process.exit(1); }
}
