// Integration test: start the real server and talk to it with `ws` clients.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { startServer } from './index.js';

const quiet = { info() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A test client that records every message and can wait for specific ones. */
function client(port, { room = 'yaba', ip = '10.0.0.1' } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}`, { headers: { 'x-forwarded-for': ip } });
  const msgs = [];
  const waiters = [];
  let closeInfo = null;
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const closed = new Promise((res) => ws.on('close', (code) => { closeInfo = { code }; res(closeInfo); }));
  const c = {
    ws, msgs, closed,
    get closeInfo() { return closeInfo; },
    open: new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }),
    send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    /** Resolve with the first message (already received or future) matching type + predicate. */
    next(t, pred = () => true, ms = 8000) {
      const hit = msgs.find((m) => m.t === t && pred(m) && !m.__seen);
      if (hit) { hit.__seen = true; return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { pred: (m) => m.t === t && pred(m), resolve: (m) => { m.__seen = true; clearTimeout(timer); resolve(m); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timeout waiting for ${t}`)); }, ms);
        waiters.push(w);
      });
    },
    none: (t, pred = () => true) => !msgs.some((m) => m.t === t && pred(m)),
    async hello(name, extra = {}) {
      await c.open;
      c.send({ t: 'hello', name, role: 'worshipper', appearance: { body: 'female', skin: 3 }, ...extra });
      return c.next('welcome');
    },
  };
  return c;
}

describe('server (3 clients)', { timeout: 20_000 }, () => {
  let app;
  let port;
  const clients = [];
  const mk = (o) => { const c = client(port, o); clients.push(c); return c; };

  beforeAll(async () => {
    app = await startServer({
      port: 0, host: '127.0.0.1', log: quiet, staticDir: null, trustProxy: true, maxPerIp: 50, connectsPerMinute: 500,
      hub: { resumeGraceMs: 1500, reportThreshold: 2 },
    });
    port = app.port;
  });
  afterAll(async () => {
    for (const c of clients) c.ws.terminate();
    await app?.close(500);
  });

  it('answers /health and /stats', async () => {
    const h = await fetch(`http://127.0.0.1:${port}/health`);
    expect(h.status).toBe(200);
    expect(await h.text()).toBe('ok');
    const s = await (await fetch(`http://127.0.0.1:${port}/stats`)).json();
    expect(s).toMatchObject({ online: 0, rooms: {} });
  });

  let A, B, C, idA, idB;

  it('join: welcome with players, join broadcast, online counts', async () => {
    A = mk({ ip: '10.0.0.1' });
    const wa = await A.hello('Ada <b>Okafor</b> the Great Choir Leader');
    expect(wa).toMatchObject({ v: 1, room: 'yaba', players: [], online: 1, total: 1, history: [] });
    expect(wa.name).toBe('Ada bOkaforb the Gre'); // markup stripped, 20 chars
    expect(typeof wa.token).toBe('string');
    idA = wa.id;

    B = mk({ ip: '10.0.0.2' });
    const wb = await B.hello('Bayo', { role: 'usher', state: { p: [1, 0, 2], r: 0.5, a: 'idle' } });
    idB = wb.id;
    expect(wb.players.map((p) => p.id)).toEqual([idA]);
    expect(wb.online).toBe(2);
    const join = await A.next('join', (m) => m.id === idB);
    expect(join).toMatchObject({ name: 'Bayo', role: 'usher', appearance: { body: 'female', skin: 3 }, p: [1, 0, 2], a: 'idle' });
    const online = await A.next('online', (m) => m.count === 2);
    expect(online.total).toBe(2);
  });

  it('state: clamped, rounded and broadcast at 10 Hz with sender time', async () => {
    A.send({ t: 'state', p: [3.14159, 0, 1e9], r: 7, a: 'walk' });
    const st = await B.next('states', (m) => m.list.some((e) => e[0] === idA));
    const e = st.list.find((x) => x[0] === idA);
    expect(e.slice(0, 6)).toEqual([idA, 3.14, 0, 600, +(7 - 2 * Math.PI).toFixed(3), 'walk']);
    expect(e[6]).toBeGreaterThanOrEqual(0); // age in ms
    expect(e[6]).toBeLessThan(1000); // exact ages: hub.test.js
    expect(typeof st.ts).toBe('number');
    // Invalid states are ignored, unknown animation falls back to idle.
    A.send({ t: 'state', p: [NaN, 0, 0], r: 0, a: 'walk' });
    A.send({ t: 'state', p: [1, 0, 1], r: 0, a: 'teleport' });
    const st2 = await B.next('states', (m) => m.list.some((x) => x[0] === idA && x[1] === 1));
    expect(st2.list.find((x) => x[0] === idA)[5]).toBe('idle');
  });

  it('state flood: excess frames are dropped quietly, not fatal', async () => {
    for (let i = 0; i < 60; i++) A.send({ t: 'state', p: [i, 0, 0], r: 0, a: 'run' });
    await sleep(300);
    expect(A.closeInfo).toBe(null); // exact rates are covered in hub.test.js with a fake clock
    A.send({ t: 'ping', c: 1 });
    await A.next('pong');
  });

  it('chat: masked profanity reaches everyone including the sender', async () => {
    A.send({ t: 'chat', text: '  Good morning! You be werey, what the fuck  ' });
    const ca = await A.next('chat');
    const cb = await B.next('chat');
    expect(cb).toMatchObject({ id: idA, role: 'worshipper', text: 'Good morning! You be *****, what the ****' });
    expect(ca.text).toBe(cb.text);
    expect(typeof cb.ts).toBe('number');
  });

  it('chat: 200 char limit and empty lines', async () => {
    A.send({ t: 'chat', text: '   ' });
    A.send({ t: 'chat', text: 'x'.repeat(500) });
    const c = await B.next('chat', (m) => m.text.startsWith('xxx'));
    expect(c.text.length).toBe(200);
  });

  it('history: a new joiner gets the last lines', async () => {
    C = mk({ ip: '10.0.0.3' });
    const wc = await C.hello('Chidi');
    expect(wc.players.map((p) => p.id).sort()).toEqual([idA, idB].sort());
    expect(wc.history.map((h) => h.text)).toEqual(['Good morning! You be *****, what the ****', 'x'.repeat(200)]);
    const lastSeen = B.msgs.filter((m) => m.t === 'states').flatMap((m) => m.list).filter((e) => e[0] === idA).at(-1);
    expect(wc.players.find((p) => p.id === idA).p).toEqual(lastSeen.slice(1, 4)); // newcomers see where Ada stands now
  });

  it('history keeps only the last 30 lines', async () => {
    const D = mk({ ip: '10.0.0.4' });
    await D.hello('Dayo');
    // 5 per 10 s per player: use the hub directly to fill the room quickly is not possible from outside,
    // so several short-lived players post 5 lines each.
    for (let k = 0; k < 7; k++) {
      const P = mk({ ip: `10.1.0.${k}` });
      await P.hello(`Poster ${k}`);
      for (let i = 0; i < 5; i++) P.send({ t: 'chat', text: `line ${k}-${i}` });
      await P.next('chat', (m) => m.text === `line ${k}-4`);
      P.ws.close(1000);
    }
    const E = mk({ ip: '10.0.0.5' });
    const we = await E.hello('Emeka');
    expect(we.history.length).toBe(30);
    expect(we.history.at(-1).text).toBe('line 6-4');
    D.ws.close(1000);
    E.ws.close(1000);
  });

  it('rate limit: the 6th line in 10 s is refused with an error', async () => {
    for (let i = 0; i < 6; i++) B.send({ t: 'chat', text: `amen ${i}` });
    const err = await B.next('error', (m) => m.code === 'rate');
    expect(err.message).toMatch(/slow down/i);
    expect(err.wait).toBeGreaterThan(0);
    await sleep(100);
    expect(C.msgs.filter((m) => m.t === 'chat' && m.id === idB).length).toBe(5);
  });

  it('spam: the same line three times in 30 s is refused', async () => {
    for (let i = 0; i < 3; i++) C.send({ t: 'chat', text: 'Buy my product!!' });
    const err = await C.next('error', (m) => m.code === 'repeat');
    expect(err.message).toBeTruthy();
    await sleep(100);
    expect(A.msgs.filter((m) => m.t === 'chat' && m.text === 'Buy my product!!').length).toBe(2);
  });

  it('report: two people reporting the same player mutes them', async () => {
    A.send({ t: 'report', id: idB, reason: 'insults' });
    C.send({ t: 'report', id: idB, reason: 'insults' });
    const muted = await B.next('error', (m) => m.code === 'muted');
    expect(muted.message).toMatch(/paused/);
    B.send({ t: 'chat', text: 'can I talk?' });
    await B.next('error', (m) => m.code === 'muted');
  });

  it('garbage frames are ignored, not fatal', async () => {
    C.send('not json');
    C.send(JSON.stringify([1, 2, 3]));
    C.send({ t: 'unknown' });
    C.send({ t: 'chat', text: { evil: true } });
    C.ws.send(Buffer.from([1, 2, 3]), { binary: true });
    C.send({ t: 'ping', c: 42 });
    const pong = await C.next('pong');
    expect(pong.c).toBe(42);
  });

  it('resume: a dropped connection keeps the player for a grace period', async () => {
    const welcome = C.msgs.find((m) => m.t === 'welcome');
    C.ws.terminate(); // no close frame → server sees 1006
    await sleep(150);
    expect(A.none('leave', (m) => m.id === welcome.id)).toBe(true);
    const C2 = mk({ ip: '10.0.0.3' });
    const w2 = await C2.hello('Chidi', { resume: { id: welcome.id, token: welcome.token } });
    expect(w2.resumed).toBe(true);
    expect(w2.id).toBe(welcome.id);
    await sleep(100);
    expect(A.none('leave', (m) => m.id === welcome.id)).toBe(true);
    C = C2;
  });

  it('resume with a wrong token gets a new id; ghosts expire with a leave', async () => {
    const welcome = C.msgs.find((m) => m.t === 'welcome');
    C.ws.terminate();
    const C3 = mk({ ip: '10.0.0.3' });
    const w3 = await C3.hello('Chidi', { resume: { id: welcome.id, token: 'nope' } });
    expect(w3.resumed).toBe(false);
    expect(w3.id).not.toBe(welcome.id);
    const leave = await A.next('leave', (m) => m.id === welcome.id, 8000);
    expect(leave.id).toBe(welcome.id);
    C = C3;
  });

  it('leave: a clean close is announced at once', async () => {
    B.ws.close(1000);
    const leave = await A.next('leave', (m) => m.id === idB);
    expect(leave).toEqual({ t: 'leave', id: idB, __seen: true });
  });

  it('rooms are separate; totals count every room', async () => {
    const K = mk({ room: 'ikeja', ip: '10.0.0.9' });
    const wk = await K.hello('Kemi');
    expect(wk.room).toBe('ikeja');
    expect(wk.players).toEqual([]);
    expect(wk.online).toBe(1);
    expect(wk.total).toBe(3); // Ada + new Chidi in yaba, Kemi in ikeja
    const s = await (await fetch(`http://127.0.0.1:${port}/stats`)).json();
    expect(s.rooms).toEqual({ yaba: 2, ikeja: 1 });
    K.send({ t: 'chat', text: 'Hello Ikeja' });
    await K.next('chat');
    await sleep(100);
    expect(A.none('chat', (m) => m.text === 'Hello Ikeja')).toBe(true);
  });


  it('rejects other paths', async () => {
    const bad = new WebSocket(`ws://127.0.0.1:${port}/nope`);
    const err = await new Promise((res) => { bad.on('error', res); bad.on('unexpected-response', (req, r) => res(r.statusCode)); });
    expect(err).toBeTruthy();
  });

  it('graceful shutdown tells clients to reconnect (1012)', async () => {
    const closeP = A.closed;
    await app.close(1000);
    const err = A.msgs.find((m) => m.t === 'error' && m.code === 'restart');
    expect(err).toBeTruthy();
    expect((await closeP).code).toBe(1012);
    app = null;
  });
});

describe('server limits', { timeout: 20_000 }, () => {
  it('drops idle players and enforces room capacity', async () => {
    const app = await startServer({ port: 0, host: '127.0.0.1', log: quiet, staticDir: null, hub: { idleMs: 300, roomCap: 1 } });
    try {
      const a = client(app.port);
      await a.hello('First');
      const b = client(app.port);
      await b.open;
      b.send({ t: 'hello', name: 'Second' });
      const full = await b.next('error', (m) => m.code === 'full');
      expect(full.message).toMatch(/full/);
      expect((await b.closed).code).toBe(4003);
      expect((await a.closed).code).toBe(4002); // idle
    } finally {
      await app.close(300);
    }
  });

  it('closes a socket that never says hello', async () => {
    const app = await startServer({ port: 0, host: '127.0.0.1', log: quiet, staticDir: null, hub: { helloTimeoutMs: 300 } });
    try {
      const s = client(app.port);
      await s.open;
      expect((await s.closed).code).toBe(4001);
    } finally {
      await app.close(300);
    }
  });

  it('limits connections per IP', async () => {
    const app = await startServer({ port: 0, host: '127.0.0.1', log: quiet, staticDir: null, maxPerIp: 2 });
    try {
      const cs = [client(app.port), client(app.port)];
      await Promise.all(cs.map((c) => c.open));
      const third = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
      const status = await new Promise((res) => { third.on('unexpected-response', (req, r) => res(r.statusCode)); third.on('open', () => res('open')); });
      expect(status).toBe(429);
      cs.forEach((c) => c.ws.terminate());
    } finally {
      await app.close(300);
    }
  });
});

describe('static files (one service hosts the game too)', { timeout: 20_000 }, () => {
  it('serves dist/ safely with caching, gzip and SPA fallback', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amen-static-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Amen City</title>');
    fs.writeFileSync(path.join(dir, 'assets', 'index-AbCd1234.js'), `console.log(${JSON.stringify('x'.repeat(4000))});`);
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'top');
    const app = await startServer({ port: 0, host: '127.0.0.1', log: quiet, staticDir: path.join(dir) });
    const base = `http://127.0.0.1:${app.port}`;
    try {
      const home = await fetch(`${base}/`);
      expect(home.headers.get('content-type')).toMatch(/text\/html/);
      expect(home.headers.get('cache-control')).toBe('no-cache');
      expect(await home.text()).toContain('Amen City');

      const js = await fetch(`${base}/assets/index-AbCd1234.js`, { headers: { 'accept-encoding': 'gzip' } });
      expect(js.headers.get('content-encoding')).toBe('gzip');
      expect(js.headers.get('cache-control')).toMatch(/immutable/);
      expect((await js.text()).length).toBeGreaterThan(4000); // fetch inflates
      const again = await fetch(`${base}/assets/index-AbCd1234.js`, { headers: { 'if-none-match': js.headers.get('etag') } });
      expect(again.status).toBe(304);

      const spa = await fetch(`${base}/church/hall`);
      expect(await spa.text()).toContain('Amen City');
      expect((await fetch(`${base}/missing.png`)).status).toBe(404);
      expect(await (await fetch(`${base}/health`)).text()).toBe('ok');

      // Path traversal never leaves the directory.
      const http = await import('node:http');
      const raw = await new Promise((res) => {
        http.get({ host: '127.0.0.1', port: app.port, path: '/../../etc/passwd' }, (r) => {
          let body = '';
          r.on('data', (d) => { body += d; });
          r.on('end', () => res({ status: r.statusCode, body }));
        });
      });
      expect(raw.body).not.toContain('root:');
    } finally {
      await app.close(300);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
