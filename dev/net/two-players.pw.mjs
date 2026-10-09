// End-to-end test: two browser pages in the net harness see each other move and chat.
//   node dev/net/two-players.pw.mjs
// Env: PLAYWRIGHT (path to the playwright package), BASE (harness origin, default http://localhost:5185),
//      WS_PORT (default 8790), OUT (screenshot dir, default dev/net/.shots). Starts the server and a
//      Vite dev server itself when they are not already running.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:5185';
const WS_PORT = Number(process.env.WS_PORT || 8790);
const OUT = process.env.OUT || path.join(here, '.shots');
fs.mkdirSync(OUT, { recursive: true });

const up = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };
const until = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures++; };

const cleanup = [];
if (!(await up(`http://localhost:${WS_PORT}/health`))) {
  const srv = spawn(process.execPath, [path.join(repo, 'server/index.js')], { env: { ...process.env, PORT: String(WS_PORT) }, stdio: 'ignore' });
  cleanup.push(() => srv.kill('SIGTERM'));
  await until(() => up(`http://localhost:${WS_PORT}/health`), 10_000, 'server');
}
if (!(await up(`${BASE}/dev/net/index.html`))) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: repo, server: { port: Number(new URL(BASE).port), strictPort: true, hmr: false }, logLevel: 'warn' });
  await vite.listen();
  cleanup.push(() => vite.close());
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(url, viewport, tag, context) {
  const ctx = context || await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000); // software GL on a busy CI box is very slow
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__amen?.harness?.ready, null, { timeout: 120_000 });
  return page;
}
const state = (page) => page.evaluate(() => ({ mode: __amen.net.mode, id: __amen.net.id, remotes: __amen.remotes.list() }));
const remote = async (page, name) => (await state(page)).remotes.find((r) => r.name === name);

try {
  const server = `ws://localhost:${WS_PORT}/ws`;
  const room = `pw-${Date.now().toString(36)}`;
  const h = `${BASE}/dev/net/index.html?quality=low&room=${room}&server=${encodeURIComponent(server)}`;

  // ---------------------------------------------------------------- server mode
  const a = await open(`${h}&name=Ada&role=choir&auto=circle&r=2.2&cz=4.5&cam=3.14&x=0&z=6`, { width: 1280, height: 800 }, 'A');
  const b = await open(`${h}&name=Bayo&role=usher&x=0.6&z=0&yaw=0&cam=0`, { width: 390, height: 844 }, 'B');
  await until(async () => (await state(a)).mode === 'ws' && (await state(b)).mode === 'ws', 60_000, 'both connected');
  check(true, 'both pages connected to the server');

  const ada = await until(async () => { const r = await remote(b, 'Ada'); return r?.built && r; }, 90_000, 'B sees Ada');
  const bayo = await until(async () => { const r = await remote(a, 'Bayo'); return r?.built && r; }, 90_000, 'A sees Bayo');
  check(!!ada && !!bayo, 'each page spawned a character for the other player');
  check(Math.hypot(bayo.x - 0.6, bayo.z) < 0.5, `A sees Bayo standing at his spot (${bayo.x}, ${bayo.z})`);

  const p1 = await remote(b, 'Ada');
  await b.waitForTimeout(2500);
  const p2 = await remote(b, 'Ada');
  const moved = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  const radius = Math.hypot(p2.x, p2.z - 4.5);
  check(moved > 0.4, `B sees Ada moving (${moved.toFixed(2)} m in 2.5 s)`);
  check(Math.abs(radius - 2.2) < 0.6, `Ada's remote stays on her circle (r = ${radius.toFixed(2)})`);
  check(['walk', 'jog'].includes(p2.state), `Ada's remote plays a walk cycle (${p2.state}, ${p2.speed} m/s)`);

  // Chat A → B with profanity masking (custom Pidgin word).
  await a.keyboard.press('Enter');
  await a.waitForSelector('.chat-panel:not([hidden])');
  await a.fill('.chat-input', 'Good morning Bayo! No be mumu talk o');
  await a.keyboard.press('Enter');
  await b.waitForFunction(() => [...document.querySelectorAll('.chat-log .msg-text')].some((e) => e.textContent.includes('Good morning Bayo')), null, { timeout: 30_000 });
  const got = await b.evaluate(() => [...document.querySelectorAll('.chat-log .msg-text')].map((e) => e.textContent).find((t) => t.includes('Good morning Bayo')));
  check(got === 'Good morning Bayo! No be **** talk o', `B received A's chat, masked: "${got}"`);
  const bubble = (await remote(b, 'Ada')).bubble;
  check(bubble === got, "B shows the line in a bubble over Ada's head");
  await b.screenshot({ path: path.join(OUT, 'b-phone-bubble.png') });

  // Chat B → A with a quick phrase from the phone panel.
  // In-page clicks: Playwright's post-click navigation wait times out on a starved software-GL renderer.
  const tapIn = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
  await tapIn(b, '.chat-toggle');
  await b.waitForSelector('.chat-panel:not([hidden])');
  await tapIn(b, '.chat-phrase:nth-child(2)'); // "Amen!"
  await a.waitForFunction(() => [...document.querySelectorAll('.chat-log .msg')].some((e) => e.textContent.includes('Bayo') && e.textContent.includes('Amen!')), null, { timeout: 30_000 });
  check(true, 'A received B\'s quick phrase "Amen!"');

  // Client-side rate limit (5 lines / 10 s): the next lines are refused with a notice.
  const sent = await b.evaluate(() => [1, 2, 3, 4, 5, 6].map((i) => __amen.net.sendChat(`line ${i}`)));
  check(sent.filter(Boolean).length <= 5 && sent[5] === false, `rate limit: at most 5 lines per 10 s (got ${JSON.stringify(sent)})`);
  await b.waitForSelector('.chat-notice:not([hidden])');
  const notice = await b.textContent('.chat-notice');
  check(/slow down/i.test(notice), `B shows the slow-down notice ("${notice}")`);

  await a.waitForTimeout(1200);
  await a.screenshot({ path: path.join(OUT, 'a-desktop-chat.png') });
  await b.screenshot({ path: path.join(OUT, 'b-phone-chat.png') });
  const perf = await b.evaluate(() => __amen.stats);
  console.log(`perf (B, 1 remote): ${perf.calls} draw calls, ${perf.triangles} triangles`);

  // Leaving: closing B removes Bayo on A.
  await b.context().close();
  await until(async () => !(await remote(a, 'Bayo')), 30_000, 'A drops Bayo');
  check(true, 'A removes Bayo after he leaves');
  await a.context().close();

  // ---------------------------------------------------------------- local fallback (no server)
  const dead = `${BASE}/dev/net/index.html?quality=low&standin=1&room=${room}&timeout=1500&server=${encodeURIComponent('ws://localhost:9/ws')}`;
  const shared = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const l1 = await open(`${dead}&name=Kemi&role=hospitality&x=0&z=3&auto=line&r=1.2&cz=3`, null, 'L1', shared);
  const l2 = await open(`${dead}&name=Tunde&role=security&x=0&z=0`, null, 'L2', shared);
  await until(async () => (await state(l1)).mode === 'local' && (await state(l2)).mode === 'local', 30_000, 'local mode');
  const kemi = await until(async () => { const r = await remote(l2, 'Kemi'); return r?.built && r; }, 30_000, 'local peers');
  check(!!kemi, 'without a server, two tabs on one device see each other (BroadcastChannel)');
  await l1.evaluate(() => __amen.net.sendChat('Wetin dey happen? stupid network'));
  await l2.waitForFunction(() => [...document.querySelectorAll('.chat-log .msg-text')].some((e) => e.textContent.startsWith('Wetin dey')), null, { timeout: 15_000 });
  const lt = await l2.evaluate(() => [...document.querySelectorAll('.chat-log .msg-text')].map((e) => e.textContent).find((t) => t.startsWith('Wetin dey')));
  check(lt === 'Wetin dey happen? ****** network', `local chat arrives, masked: "${lt}"`);
  await l2.waitForTimeout(600);
  await l2.screenshot({ path: path.join(OUT, 'local-mode-phone.png') });
  await shared.close();
} catch (err) {
  failures++;
  console.error('FAIL', err.message);
} finally {
  const real = errors.filter((e) => !/GPU stall|swiftshader|WebSocket connection to 'ws:\/\/localhost:9\//.test(e));
  check(real.length === 0, `no console errors${real.length ? `:\n  ${real.join('\n  ')}` : ''}`);
  await browser.close();
  for (const fn of cleanup) await fn();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
