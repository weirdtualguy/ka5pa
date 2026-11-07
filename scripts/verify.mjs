/* scripts/verify.mjs — headless checks, Node built-ins only. Finds a local
   Chromium (CHROME_PATH, PATH, ms-playwright cache), drives it over CDP with the
   built-in WebSocket + fetch, and reports console/page errors for the served page
   (online and API-blocked) and the built file:// page, plus 390px screenshots
   (sealed, roots, exploded, tx open, played cycle, logic panel, Bytes/DNA, dark)
   and a scripted pass over A's controls and the guided flow. No browser → note,
   exit 0. Usage: node scripts/verify.mjs [--port 4173] [--shots dir] */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '4173';
const shotsDir = args.includes('--shots') ? resolve(args[args.indexOf('--shots') + 1]) : join(ROOT, 'verify-shots');
const base = `http://localhost:${port}/`;
const built = 'file://' + join(ROOT, 'dist', 'kaspa-block.html');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------- find a browser ---------- */
function whichSync(bin) {
  for (const d of (process.env.PATH || '').split(':')) {
    const p = join(d, bin);
    if (existsSync(p)) return p;
  }
  return null;
}
function pickChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cacheDir = join(os.homedir(), '.cache', 'ms-playwright');
  if (existsSync(cacheDir)) {
    for (const d of readdirSync(cacheDir)) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell'])
        if (existsSync(join(cacheDir, d, sub))) return join(cacheDir, d, sub);
    }
  }
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome', 'chrome', 'google-chrome-stable']) {
    const p = whichSync(bin);
    if (p) return p;
  }
  return null;
}

async function launchBrowser() {
  const chrome = pickChrome();
  if (!chrome) throw new Error('NO_BROWSER');
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--user-data-dir=' + join(os.tmpdir(), 'kaspa-verify-' + Date.now()),
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  return await new Promise((res, rej) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        proc.stdout.off('data', onData); proc.stderr.off('data', onData);
        proc.__port = Number(m[1]);
        res(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    setTimeout(() => rej(new Error('chrome did not expose a debug socket')), 15000);
  });
}

async function newPageSession(proc) {
  const list = await fetch(`http://127.0.0.1:${proc.__port}/json/list`).then(r => r.json());
  const target = list.find(t => t.type === 'page');
  if (!target) throw new Error('no page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { send, ws };
}

/* ---------- the run ---------- */
async function main() {
  let proc;
  try {
    proc = await launchBrowser();
  } catch (e) {
    if (e.message === 'NO_BROWSER') {
      console.log('no headless browser found — set CHROME_PATH or install Chromium to run the visual checks.');
      process.exit(0);
    }
    throw e;
  }
  mkdirSync(shotsDir, { recursive: true });
  const results = { checks: [], consoleErrors: [], shots: [] };

  const run = async (label, url, opts = {}) => {
    console.log(`\n== ${label}  ${url}`);
    const session = await newPageSession(proc);
    const evaljs = async (expression) => {
      const r = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) console.log('     eval threw:', JSON.stringify(r.result.exceptionDetails).slice(0, 220));
      return r.result && r.result.result && r.result.result.value;
    };
    const shot = async (name) => {
      const r = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
      const file = join(shotsDir, name + '.jpg');
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      results.shots.push(file);
      console.log('   shot:', file);
    };
    const check = async (name, expression) => {
      const v = await evaljs(expression);
      const ok = !!v;
      results.checks.push({ name: label + ': ' + name, ok, detail: String(v) });
      console.log((ok ? '   PASS ' : '   FAIL ') + name + (ok ? '' : ` — ${v}`));
    };
    const click = async (sel) => { await evaljs(`document.querySelector(${JSON.stringify(sel)})?.click()`); };

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    if (opts.offline) {
      await session.send('Network.enable');
      await session.send('Network.setBlockedURLs', { urls: ['*api.kaspa.org*'] });
    }
    await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await session.send('Page.navigate', { url });
    await sleep(3800);
    await evaljs(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));
      (function(){const ce=console.error;console.error=function(){window.__errs.push([].map.call(arguments,String).join(' '));ce.apply(console,arguments);};})();`);
    await sleep(700);

    await shot(label + '-1-sealed');
    await check('guided counts computed (27 states / 46 steps / 4 rules)',
      `document.getElementById('gf-caption').textContent.includes('27 states') && document.getElementById('gf-caption').textContent.includes('46 steps') && document.getElementById('gf-caption').textContent.includes('4 rules hold')`);
    await check('byte strip drawn to scale (323 B)',
      `document.querySelector('#byte-strip-svg') && document.querySelector('#byte-strip-svg').textContent.includes('323')`);
    await click('#gf-next');
    await check('peel guard message before grind', `document.getElementById('gf-caption').textContent.includes('Not yet: grind a nonce first')`);
    await click('#gf-pills button:nth-child(1)');
    await sleep(450);
    await check('pow chip under target', `document.getElementById('gf-pow').classList.contains('on')`);
    await click('#gf-next');
    await sleep(1300);
    await shot(label + '-2-roots');
    await check('roots exposed caption', `document.getElementById('gf-caption').textContent.includes('roots')`);

    await evaljs(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'e',bubbles:true}))`);
    await sleep(1200);
    await shot(label + '-3-exploded');
    await check('tray callouts present (pills on narrow screens)', `document.querySelectorAll('#layer-sketch .co-note').length >= 4 || document.querySelectorAll('#callout-row .callout-pill').length === 5`);
    await click('#gf-next'); await sleep(900);
    await click('#gf-next'); await sleep(1400);
    await shot(label + '-4-tx-open');
    await check('tx view open', `document.getElementById('iso-stage').classList.contains('txview')`);
    await click('#z-back');
    await sleep(400);

    await click('#gf-play');
    await sleep(10500);
    await shot(label + '-5-played');
    await check('cycle returned to sealed', `document.getElementById('gf-pow').classList.contains('on')`);

    await click('#gf-logic');
    await sleep(500);
    await shot(label + '-6-logic');
    await check('logic panel shows the four rules',
      `document.getElementById('lg') && !document.getElementById('lg').hidden && document.getElementById('lg-rules').textContent.includes('The body hangs from its roots') && document.getElementById('lg').textContent.includes('breaks in 4 steps')`);
    await click('#lg-x');

    await evaljs(`document.getElementById('dna-panel').scrollIntoView({block:'center'})`);
    await sleep(700);
    await shot(label + '-7-bytes-dna');
    await check('byte bar has 12 fields', `document.querySelectorAll('#byte-bar .byte-seg').length === 12`);
    await check('field offsets contiguous to 323', `(function(){const rows=[...document.querySelectorAll('.fl-row .fo')].map(e=>e.textContent);const last=rows[rows.length-1];return /@291\.\.323/.test(last);})()`);

    await click('[data-station="6"]');
    await sleep(700);
    await check('station 6 pill active', `document.querySelector('[data-station="6"]').classList.contains('active')`);
    await evaljs(`document.querySelector('#layer-neighbors [data-nb-hash]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
    await sleep(800);
    await check('DAG neighbour walk responded (pin/fetch/404 on sample hashes)',
      `(function(){const m=document.getElementById('blk-msg').textContent;return m.includes('Block ')||m.includes('Loading')||m.includes('Could not reach')||m.includes('No block');})()`);
    await click('[data-set-theme="dark"]');
    await sleep(500);
    await shot(label + '-8-dark');
    await click('[data-set-theme="sepia"]');
    await sleep(400);
    await evaljs(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'0',bubbles:true}))`);
    await check('zoom label resets to 1.0×', `document.getElementById('zoom-lbl').textContent.trim().startsWith('1.0')`);

    const errs = await evaljs(`window.__errs || []`);
    console.log('   console/page errors:', errs.length ? JSON.stringify(errs) : 'none');
    for (const e of errs) results.consoleErrors.push(label + ': ' + e);
    session.ws.close();
  };

  await run('served-online', base, {});
  await run('served-offline', base, { offline: true });
  if (existsSync(join(ROOT, 'dist', 'kaspa-block.html'))) await run('built-file', built, { offline: true });

  await sleep(300);
  proc.kill();
  const fails = results.checks.filter(c => !c.ok);
  const realErrs = results.consoleErrors.filter(e => !/favicon|net::ERR|Failed to load resource|api\.kaspa\.org/i.test(e));
  console.log('\n== summary');
  console.log('checks:', results.checks.length - fails.length, 'passed /', fails.length, 'failed');
  console.log('relevant console errors:', realErrs.length ? realErrs : 'none');
  console.log('shots:', shotsDir);
  writeFileSync(join(shotsDir, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(fails.length || realErrs.length ? 1 : 0);
}

main().catch(e => { console.error('verify failed:', e); process.exit(1); });
