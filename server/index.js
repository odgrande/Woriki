#!/usr/bin/env node
// Amen City multiplayer server: Node + ws.
//   node server/index.js            (PORT env, default 8787; WebSocket at /ws?room=yaba)
// Also serves GET /health ("ok"), GET /stats (online counts) and, when dist/ exists
// (after `npm run build`), the game itself — so one free web service hosts everything.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createHub, CLOSE } from './hub.js';
import { createFilter } from './filter.js';
import { createKeyedCounter } from './ratelimit.js';
import { createStatic } from './static.js';
import { LIMITS, PROTOCOL_VERSION } from './protocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const envNum = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Start the server. Resolves once it is listening.
 * @param {{
 *   port?: number, host?: string, trustProxy?: boolean, allowedOrigins?: string[], staticDir?: string|null,
 *   maxPerIp?: number, connectsPerMinute?: number, heartbeatMs?: number, log?: Pick<Console, 'info'|'warn'|'error'>,
 *   hub?: Partial<import('./hub.js').HUB_DEFAULTS>
 * }} [opts]
 */
export async function startServer(opts = {}) {
  const env = process.env;
  const log = opts.log || console;
  const cfg = {
    port: opts.port ?? envNum(env.PORT, 8787),
    host: opts.host ?? env.HOST ?? '0.0.0.0',
    trustProxy: opts.trustProxy ?? (env.TRUST_PROXY === '1' || !!env.RENDER || !!env.FLY_APP_NAME),
    allowedOrigins: opts.allowedOrigins ?? (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    staticDir: opts.staticDir !== undefined ? opts.staticDir : (env.STATIC_DIR || path.join(here, '..', 'dist')),
    maxPerIp: opts.maxPerIp ?? envNum(env.MAX_PER_IP, 24),
    connectsPerMinute: opts.connectsPerMinute ?? envNum(env.CONNECTS_PER_MINUTE, 40),
    heartbeatMs: opts.heartbeatMs ?? 20_000,
  };
  const hubOpts = {
    roomCap: envNum(env.ROOM_CAP, undefined),
    maxPlayers: envNum(env.MAX_PLAYERS, undefined),
    idleMs: envNum(env.IDLE_MS, undefined),
    ...opts.hub,
  };
  for (const k of Object.keys(hubOpts)) if (hubOpts[k] === undefined) delete hubOpts[k];

  const hub = createHub({ filter: createFilter(), log, ...hubOpts });
  const serveStatic = cfg.staticDir && fs.existsSync(path.join(cfg.staticDir, 'index.html')) ? createStatic(cfg.staticDir) : null;
  const perIp = new Map();
  const connects = createKeyedCounter({ limit: cfg.connectsPerMinute, windowMs: 60_000 });
  const startedAt = Date.now();

  const clientIp = (req) => {
    if (cfg.trustProxy) {
      const fwd = String(req.headers['fly-client-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd.slice(0, 64);
    }
    return req.socket.remoteAddress || '?';
  };

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : 'ok');
      return;
    }
    if (url === '/stats') {
      const s = hub.stats();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ online: s.total, rooms: s.rooms, uptime: Math.round((Date.now() - startedAt) / 1000), v: PROTOCOL_VERSION }));
      return;
    }
    if (serveStatic && serveStatic(req, res)) return;
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Amen City server is running. Connect a WebSocket to /ws?room=yaba\n');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: LIMITS.maxPayload,
    // Light compression: state frames are repetitive JSON, and data is expensive in Lagos.
    perMessageDeflate: { zlibDeflateOptions: { level: 3, memLevel: 4 }, serverMaxWindowBits: 10, threshold: 96, concurrencyLimit: 8 },
  });

  const reject = (socket, status, text) => {
    try { socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* ignore */ }
    socket.destroy();
  };

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') return reject(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (cfg.allowedOrigins.length && origin && !cfg.allowedOrigins.includes(origin)) return reject(socket, 403, 'Forbidden');
    const ip = clientIp(req);
    if (!connects.hit(ip)) return reject(socket, 429, 'Too Many Requests');
    if ((perIp.get(ip) || 0) >= cfg.maxPerIp) return reject(socket, 429, 'Too Many Requests');
    wss.handleUpgrade(req, socket, head, (ws) => {
      perIp.set(ip, (perIp.get(ip) || 0) + 1);
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      const handle = hub.connect({
        send: (s) => ws.send(s),
        close: (code, reason) => ws.close(code, reason),
        terminate: () => ws.terminate(),
        get bufferedAmount() { return ws.bufferedAmount; },
      }, { ip, room: url.searchParams.get('room') || undefined });
      ws.on('message', (data, isBinary) => handle.message(isBinary ? null : data.toString()));
      ws.on('error', () => { /* a close event follows */ });
      ws.on('close', (code) => {
        handle.close(code);
        const n = (perIp.get(ip) || 1) - 1;
        if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
      });
    });
  });

  const tick = setInterval(() => hub.tick(), 1000 / LIMITS.stateHz);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      // No pong since the last ping: the connection is dead (phone lost signal). Terminate → resumable ghost.
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
    connects.sweep();
  }, cfg.heartbeatMs);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, () => { server.off('error', reject); resolve(undefined); });
  });
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  log.info?.(`[amen] listening on :${port} (ws /ws, health /health${serveStatic ? `, static ${cfg.staticDir}` : ''})`);

  let closing = null;
  return {
    port,
    hub,
    server,
    wss,
    /** Graceful shutdown: notify clients (code 1012 → they reconnect), stop accepting, close. */
    close(timeoutMs = 3000) {
      if (closing) return closing;
      closing = new Promise((resolve) => {
        clearInterval(tick);
        clearInterval(heartbeat);
        hub.shutdown(CLOSE.RESTART, 'server restarting');
        server.close(() => resolve(undefined));
        server.closeIdleConnections?.();
        const force = setTimeout(() => {
          for (const ws of wss.clients) ws.terminate();
          server.closeAllConnections?.();
          resolve(undefined);
        }, timeoutMs);
        force.unref();
        wss.close();
        // Resolve early once every socket has finished its close handshake.
        const poll = setInterval(() => {
          if (wss.clients.size === 0) { clearInterval(poll); resolve(undefined); }
        }, 50);
        poll.unref();
      });
      return closing;
    },
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const app = await startServer();
  let stopping = false;
  const stop = async (sig) => {
    if (stopping) return;
    stopping = true;
    console.info(`[amen] ${sig}: shutting down…`);
    setTimeout(() => process.exit(0), 6000).unref();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
