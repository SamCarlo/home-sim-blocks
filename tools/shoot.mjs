#!/usr/bin/env node
// Drive the app in headless Chromium: load a page, run scripted steps, catch errors, take screenshots (01 §8).
// Zero npm dependencies (Node ≥ 22 built-ins + global WebSocket). Plumbing lives in tools/lib/cdp.mjs.
//
//   node tools/shoot.mjs --path "/index.html?seed=plan-hilo-comfortable" --out tools/shots/plan.png --wait-ready
//   node tools/shoot.mjs --path /index.html --steps tests/e2e/example.json
//   node tools/shoot.mjs --smoke tools/smoke.txt
//
// Flags: --path <url path>  --out <png>  --size WxH (1366x768)  --wait-ready  --timeout <ms> (20000)
//        --steps <json>  --allow-errors  --base <url> (use a running server)  --keep-open  --smoke <file>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, launchChrome, CDP, openPage } from './lib/cdp.mjs';

const HS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// press: key → [keyCode, code, text]. Defined before the top-level await below so steps can use it.
const KEYS = {
  Enter: [13, 'Enter', '\r'], Tab: [9, 'Tab'], Escape: [27, 'Escape'], Backspace: [8, 'Backspace'],
  Delete: [46, 'Delete'], Space: [32, 'Space', ' '], ' ': [32, 'Space', ' '], Home: [36, 'Home'], End: [35, 'End'],
  PageUp: [33, 'PageUp'], PageDown: [34, 'PageDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'],
  ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'],
};

const opts = parseArgs(process.argv.slice(2));
const res = { server: null, chrome: null, cdp: null };
let exitCode = 0;
try {
  exitCode = await main();
} catch (err) {
  console.error(`✗ shoot: ${err.message}`);
  exitCode = 1;
} finally {
  if (!opts.keepOpen) await shutdown();
}
if (!opts.keepOpen) process.exit(exitCode);

async function main() {
  const [width, height] = opts.size.split('x').map(Number);
  if (!width || !height) throw new Error(`bad --size "${opts.size}" (use WxH, e.g. 1366x768)`);
  let base = opts.base?.replace(/\/$/, '');
  if (!base) { res.server = await startServer(path.join(HS, 'app')); base = res.server.url; }
  const origin = new URL(base).origin;
  res.chrome = await launchChrome({ width, height, timeout: opts.timeout });
  res.cdp = await CDP.connect(res.chrome.wsUrl);
  if (res.chrome.noSandbox) console.log('note: sandbox failed, running with --no-sandbox');
  const env = { base, origin, width, height };
  return opts.smoke ? runSmoke(env) : runSingle(env);
}

async function runSingle(env) {
  if (!opts.path && !opts.steps) throw new Error('need --path, --steps or --smoke (see the header of tools/shoot.mjs)');
  const log = [];
  const page = await openPage(res.cdp, { ...env, log });
  const steps = opts.steps ? JSON.parse(fs.readFileSync(opts.steps, 'utf8')) : [];
  if (!Array.isArray(steps)) throw new Error(`${opts.steps} must be a JSON array of steps`);
  console.log(`shoot ${opts.path ?? '(steps only)'} @ ${env.width}x${env.height}`);
  try {
    if (opts.path) await gotoPath(page, env, opts.path, opts.waitReady);
    for (const step of steps) await runStep(page, env, step, log);
    if (opts.out) await shot(page, opts.out, log);
  } catch (err) {
    log.push({ kind: 'fail', text: err.message, error: true });
  }
  if (opts.keepOpen) {
    printLog(log, '  ');
    console.log(`--keep-open: browser and server left running (${env.base}). Ctrl+C to stop.`);
    process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
    return 0;
  }
  await page.close();
  return report(log, '');
}

/** One browser, fresh tab + fresh storage (browser context) per smoke line, shot to tools/shots/smoke-<name>.png. */
async function runSmoke(env) {
  const lines = fs.readFileSync(opts.smoke, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const failed = [];
  const t0 = Date.now();
  for (const line of lines) {
    const [name, urlPath] = line.split(/\s+/);
    if (!urlPath) { failed.push(name); console.log(`✗ ${name}: bad smoke line "${line}" (want "<name> <path>")`); continue; }
    const log = [];
    const page = await openPage(res.cdp, { ...env, log, freshContext: true });
    const out = path.join(HS, 'tools/shots', `smoke-${name}.png`);
    try {
      await gotoPath(page, env, urlPath, true);
      await shot(page, out, log);
    } catch (err) {
      log.push({ kind: 'fail', text: err.message, error: true });
    }
    await page.close();
    const errs = log.filter((e) => e.error);
    if (errs.length && !opts.allowErrors) {
      failed.push(name);
      console.log(`✗ ${name} ${urlPath}`);
      printLog(errs, '    ');
    } else {
      console.log(`✓ ${name} ${urlPath} → ${path.relative(process.cwd(), out)}${errs.length ? ` (${errs.length} errors allowed)` : ''}`);
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`smoke: ${lines.length - failed.length}/${lines.length} passed in ${secs}s${failed.length ? ` — failed: ${failed.join(', ')}` : ''}`);
  return failed.length ? 1 : 0;
}

async function gotoPath(page, env, urlPath, waitReady) {
  const url = /^https?:/.test(urlPath) ? urlPath : env.base + (urlPath.startsWith('/') ? '' : '/') + urlPath;
  const loaded = page.nextLoad(opts.timeout);
  const nav = await page.send('Page.navigate', { url });
  if (nav.errorText) { loaded.catch(() => {}); throw new Error(`navigate ${urlPath}: ${nav.errorText}`); }
  await loaded;
  if (waitReady) await waitReadyFlag(page);
}

async function waitReadyFlag(page) {
  await poll(page, 'document.body?.dataset.ready === "1"', 'body[data-ready="1"]');
}

/** Poll a JS expression until truthy or --timeout. */
async function poll(page, expr, what) {
  const deadline = Date.now() + opts.timeout;
  while (Date.now() < deadline) {
    if (await evaluate(page, expr).catch(() => false)) return;
    await sleep(50);
  }
  throw new Error(`timeout: ${what} not seen after ${opts.timeout} ms`);
}

async function evaluate(page, expression) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function shot(page, file, log) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(data, 'base64'));
  log.push({ kind: 'shot', text: path.relative(process.cwd(), abs) });
}

async function runStep(page, env, step, log) {
  const [kind] = Object.keys(step);
  const arg = step[kind];
  switch (kind) {
    case 'goto': return gotoPath(page, env, arg, opts.waitReady);
    case 'reload': { // {"reload": true} reloads the current URL, query included (e2e under ?emulator=1 keeps it)
      const loaded = page.nextLoad(opts.timeout);
      await page.send('Page.reload', {});
      await loaded;
      return opts.waitReady ? waitReadyFlag(page) : undefined;
    }
    case 'wait': return sleep(Number(arg));
    case 'waitFor': return poll(page, `!!document.querySelector(${JSON.stringify(arg)})`, arg);
    case 'waitReady': return waitReadyFlag(page);
    case 'eval': {
      const v = await evaluate(page, arg);
      log.push({ kind: 'eval', text: `${arg} → ${JSON.stringify(v)}` });
      return;
    }
    case 'assert': {
      const v = await evaluate(page, arg).catch((e) => { throw new Error(`assert threw: ${arg}: ${e.message}`); });
      if (!v) throw new Error(`assert failed: ${arg} → ${JSON.stringify(v)}`);
      log.push({ kind: 'assert', text: `ok ${arg}` });
      return;
    }
    case 'shot': return shot(page, arg, log);
    case 'click': return click(page, arg, log);
    case 'type': return type(page, arg[0], arg[1]);
    case 'press': return press(page, arg);
    case 'offline': return setOffline(page, !!arg, log);
    case 'reducedMotion': // {"reducedMotion": true} emulates prefers-reduced-motion: reduce (applies from the next goto)
      return page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: arg ? 'reduce' : 'no-preference' }] });
    case 'noRequests': return noRequests(page, arg, log);
    default: throw new Error(`unknown step ${JSON.stringify(step)}`);
  }
}

/** Fail if any request so far (the page's network log) matches one of the regex sources in `patterns`. */
function noRequests(page, patterns, log) {
  const list = [].concat(patterns);
  for (const src of list) {
    const hit = page.requests.find((u) => new RegExp(src).test(u));
    if (hit) throw new Error(`noRequests: /${src}/ matched ${hit}`);
  }
  log.push({ kind: 'assert', text: `ok none of ${page.requests.length} requests match ${list.map((x) => `/${x}/`).join(' ')}` });
}

/** Emulate losing or regaining the network (CDP Network.emulateNetworkConditions; fires offline/online events). */
async function setOffline(page, offline, log) {
  await page.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  log.push({ kind: 'net', text: offline ? 'offline' : 'online' });
}

/** Scroll into view, then a real mouse click at the center if the element is hit there; else el.click(). */
async function click(page, sel, log) {
  await poll(page, `!!document.querySelector(${JSON.stringify(sel)})`, sel);
  const box = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, ok: r.width > 0 && r.height > 0 && !!hit && (hit === el || el.contains(hit)) };
  })()`);
  if (!box.ok) {
    await evaluate(page, `document.querySelector(${JSON.stringify(sel)}).click()`);
    log.push({ kind: 'click', text: `${sel} (covered or zero-size: used el.click())` });
    return;
  }
  const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
}

async function type(page, sel, text) {
  await poll(page, `!!document.querySelector(${JSON.stringify(sel)})`, sel);
  await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    el.scrollIntoView({ block: 'center' }); el.focus();
    if (typeof el.select === 'function') el.select(); else document.execCommand('selectAll');
  })()`);
  await page.send('Input.insertText', { text: String(text) });
  await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

/** Key down + up with key, code and keyCode. Single characters type their text. */
async function press(page, key) {
  let [keyCode, code, text] = KEYS[key] || [];
  if (!code && key.length === 1) {
    const up = key.toUpperCase();
    code = /[A-Z]/.test(up) ? `Key${up}` : /\d/.test(key) ? `Digit${key}` : '';
    keyCode = up.charCodeAt(0);
    text = key;
  }
  if (!code && !keyCode) throw new Error(`press: unknown key "${key}"`);
  const k = { key: key === 'Space' ? ' ' : key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...k, ...(text ? { text, unmodifiedText: text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
}

function printLog(log, indent) {
  for (const e of log) console.log(`${indent}${e.error ? '✗' : '·'} [${e.kind}] ${e.text}`);
}

function report(log, indent) {
  printLog(log, indent + '  ');
  const errs = log.filter((e) => e.error).length;
  if (errs && !opts.allowErrors) { console.log(`${indent}✗ FAIL: ${errs} error${errs === 1 ? '' : 's'}`); return 1; }
  console.log(`${indent}✓ OK${errs ? ` (${errs} errors allowed)` : ''}`);
  return 0;
}

async function shutdown() {
  if (res.cdp) { await Promise.race([res.cdp.send('Browser.close').catch(() => {}), sleep(2000)]); res.cdp.close(); res.cdp = null; }
  if (res.chrome) { await res.chrome.close(); res.chrome = null; }
  if (res.server) { await res.server.close(); res.server = null; }
}

function parseArgs(argv) {
  const o = { size: '1366x768', timeout: 20000, waitReady: false, allowErrors: false, keepOpen: false };
  const val = (i) => { if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--path': o.path = val(i++); break;
      case '--out': o.out = val(i++); break;
      case '--size': o.size = val(i++); break;
      case '--timeout': o.timeout = Number(val(i++)); break;
      case '--steps': o.steps = val(i++); break;
      case '--base': o.base = val(i++); break;
      case '--smoke': o.smoke = val(i++); break;
      case '--wait-ready': o.waitReady = true; break;
      case '--allow-errors': o.allowErrors = true; break;
      case '--keep-open': o.keepOpen = true; break;
      default: console.error(`unknown flag ${a}`); process.exit(2);
    }
  }
  return o;
}
