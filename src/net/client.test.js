// Client tests in Node (global WebSocket + BroadcastChannel) against the real server.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../../server/index.js';
import { createNet, serverUrl } from './client.js';

const quiet = { info() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (net, type, pred = () => true, ms = 10_000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { off(); reject(new Error(`timeout waiting for ${type}`)); }, ms);
  const off = net.on(type, (d) => { if (pred(d)) { clearTimeout(timer); off(); resolve(d); } });
});
const record = (net) => {
  const log = [];
  for (const t of ['status', 'welcome', 'join', 'leave', 'states', 'chat', 'online', 'error']) net.on(t, (d) => log.push([t, d]));
  return log;
};

describe('serverUrl', () => {
  it('normalises explicit URLs and adds room + protocol version', () => {
    expect(serverUrl('Yaba', 'https://amen.example.com')).toBe('wss://amen.example.com/ws?room=yaba&v=1');
    expect(serverUrl('ikeja', 'ws://localhost:8787/ws')).toBe('ws://localhost:8787/ws?room=ikeja&v=1');
  });
  it('defaults to localhost:8787 outside a browser', () => {
    expect(serverUrl()).toBe('ws://localhost:8787/ws?room=yaba&v=1');
  });
});

describe('net client ↔ server', { timeout: 20_000 }, () => {
  let app;
  let url;
  const nets = [];
  const mk = (o) => { const n = createNet({ url, room: 'client-test', ...o }); nets.push(n); return n; };

  beforeAll(async () => {
    app = await startServer({ port: 0, host: '127.0.0.1', log: quiet, staticDir: null, hub: { resumeGraceMs: 3000 } });
    url = `ws://127.0.0.1:${app.port}/ws`;
  });
  afterAll(async () => {
    nets.forEach((n) => n.close());
    await app.close(500);
  });

  let ada, bayo, adaLog, bayoLog;

  it('connects, welcomes and announces players to each other', async () => {
    ada = mk({ name: 'Ada', role: 'choir', appearance: { body: 'female', outfit: 'choir-robe' } });
    adaLog = record(ada);
    await once(ada, 'welcome');
    expect(ada.mode).toBe('ws');
    expect(ada.connected).toBe(true);
    expect(ada.id).toBeTruthy();

    const joined = once(ada, 'join', (p) => p.name === 'Bayo'); // listen before Bayo connects
    const twoOnline = once(ada, 'online', (o) => o.count === 2);
    bayo = mk({ name: 'Bayo', role: 'usher' });
    bayoLog = record(bayo);
    const w = await once(bayo, 'welcome');
    expect(w.players.map((p) => p.name)).toEqual(['Ada']);
    expect(bayo.players.get(ada.id)).toMatchObject({ name: 'Ada', role: 'choir', appearance: { body: 'female', outfit: 'choir-robe' } });
    const j = await joined;
    expect(j.update).toBe(false);
    await twoOnline;
    expect(ada.online).toBe(2);
  });

  it('throttles states to ~10/s and delivers them with timestamps', async () => {
    const t0 = Date.now();
    let x = 0;
    let sentCalls = 0;
    while (Date.now() - t0 < 600) {
      ada.sendState({ position: { x: (x += 0.05), y: 0, z: 1 }, rotY: 0.5, anim: 'walk' });
      sentCalls++;
      await sleep(5);
    }
    const elapsed = Date.now() - t0;
    await sleep(300);
    const entries = bayoLog.filter(([t]) => t === 'states').flatMap(([, d]) => d.list.filter((e) => e[0] === ada.id).map((e) => ({ e, ts: d.ts })));
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.length).toBeLessThanOrEqual(Math.ceil(elapsed / 100) + 2); // ≤ 10/s (+ trailing send)
    expect(sentCalls).toBeGreaterThan(entries.length * 3); // far more calls than frames on the wire
    expect(entries.at(-1).e[5]).toBe('walk');
    // The trailing send delivers the final position even though it came < 100 ms after the previous one.
    const t1 = Date.now();
    while (Math.abs(bayo.players.get(ada.id).p[0] - x) > 0.05 && Date.now() - t1 < 8000) await sleep(50);
    expect(bayo.players.get(ada.id).p[0]).toBeCloseTo(x, 1);
  });

  it('does not resend an unchanged state', async () => {
    await sleep(200);
    const n = bayoLog.length;
    for (let i = 0; i < 20; i++) { ada.sendState({ p: [9, 0, 9], r: 0, a: 'idle' }); await sleep(20); }
    await sleep(250);
    const sent = bayoLog.slice(n).filter(([t, d]) => t === 'states' && d.list.some((e) => e[0] === ada.id));
    expect(sent.length).toBe(1);
  });

  it('chat: echoes to the sender as self, masks profanity, applies the local rate limit', async () => {
    const mineP = once(ada, 'chat');
    const theirsP = once(bayo, 'chat');
    expect(ada.sendChat('Praise God, no be werey talk')).toBe(true);
    const mine = await mineP;
    expect(mine).toMatchObject({ self: true, name: 'Ada', text: 'Praise God, no be ***** talk' });
    const theirs = await theirsP;
    expect(theirs).toMatchObject({ self: false, id: ada.id, role: 'choir' });
    for (let i = 0; i < 4; i++) expect(ada.sendChat(`line ${i}`)).toBe(true);
    const err = once(ada, 'error');
    expect(ada.sendChat('one too many')).toBe(false);
    expect((await err).code).toBe('rate');
    expect(ada.sendChat('   ')).toBe(false);
  });

  it('blocking hides a player\'s chat on this device', async () => {
    bayo.block(ada.id);
    expect(bayo.isBlocked(ada.id)).toBe(true);
    const before = bayoLog.filter(([t]) => t === 'chat').length;
    await sleep(2100); // let Ada's bucket refill one token
    ada.sendChat('you cannot see me');
    await once(ada, 'chat', (m) => m.text === 'you cannot see me');
    await sleep(100);
    expect(bayoLog.filter(([t]) => t === 'chat').length).toBe(before);
    bayo.unblockAll();
    expect(bayo.isBlocked(ada.id)).toBe(false);
  });

  it('reconnects after a dropped connection and resumes the same id', async () => {
    const id = bayo.id;
    const leaves = adaLog.filter(([t]) => t === 'leave').length;
    const adaBack = once(ada, 'welcome', () => true, 6000);
    for (const ws of app.wss.clients) ws.terminate(); // both phones lose signal
    await once(bayo, 'status', (s) => s.mode === 'connecting');
    const w = await once(bayo, 'welcome', () => true, 6000);
    expect(w.resumed).toBe(true);
    expect(bayo.id).toBe(id);
    expect((await adaBack).resumed).toBe(true); // Ada reconnects too
    await sleep(200);
    expect(adaLog.filter(([t]) => t === 'leave').length).toBe(leaves); // nobody saw anyone leave
    expect(ada.players.has(bayo.id)).toBe(true);
  }, 10_000);

  it('a clean close removes the player for others', async () => {
    const id = bayo.id;
    bayo.close();
    expect(bayo.mode).toBe('offline');
    await once(ada, 'leave', (d) => d.id === id);
    expect(ada.players.has(id)).toBe(false);
  });
});

describe('local mode (BroadcastChannel) when the server is unreachable', { timeout: 20_000 }, () => {
  it('two clients on one device see each other, move and chat', async () => {
    const dead = 'ws://127.0.0.1:9/ws';
    const kemi = createNet({ url: dead, room: 'offline-test', name: 'Kemi', role: 'hospitality', connectTimeoutMs: 300 });
    const kemiLocal = once(kemi, 'status', (s) => s.mode === 'local');
    const metTunde = once(kemi, 'join', (p) => p.name === 'Tunde');
    const tunde = createNet({ url: dead, room: 'offline-test', name: 'Tunde', role: 'security', connectTimeoutMs: 300 });
    try {
      await Promise.all([kemiLocal, once(tunde, 'status', (s) => s.mode === 'local')]);
      expect(kemi.connected).toBe(false);
      expect(kemi.id.startsWith('L')).toBe(true);
      await metTunde;
      await sleep(50);
      expect(tunde.players.size).toBe(1);
      expect(kemi.online).toBe(2);

      const st = once(tunde, 'states', (d) => d.list[0][0] === kemi.id);
      kemi.sendState({ p: [2, 0, 3], r: 1, a: 'walk' });
      expect((await st).list[0].slice(1, 6)).toEqual([2, 0, 3, 1, 'walk']);

      await sleep(300); // lazy-loaded profanity filter
      const c = once(tunde, 'chat');
      expect(kemi.sendChat('Network don cast, idiot NEPA')).toBe(true);
      expect(await c).toMatchObject({ name: 'Kemi', text: 'Network don cast, ***** NEPA', self: false });

      const gone = once(tunde, 'leave', (d) => d.id === kemi.id);
      kemi.close();
      await gone;
      expect(tunde.players.size).toBe(0);
    } finally {
      kemi.close();
      tunde.close();
    }
  });
});
