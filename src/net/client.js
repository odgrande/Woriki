// Multiplayer client: WebSocket to server/index.js with automatic reconnect and
// session resume; falls back to a BroadcastChannel "local" mode when the server is
// unreachable so several tabs on one device still see each other.
//
// Events (net.on(type, fn) → off):
//   status  {mode, connected}                       mode: 'connecting' | 'ws' | 'local' | 'offline'
//   welcome {id, room, resumed, players, online, total, history, mode}
//   join    {id, name, role, appearance, p?, r?, a?, update}   (update: true when an existing player changed)
//   leave   {id}
//   states  {ts, list: [[id, x, y, z, yaw, anim, ageMs], ...]}  (own id included; ts = sender clock ms)
//   chat    {id, name, role, text, ts, self}
//   online  {count, total}
//   error   {code, message, wait?}
//   blocked {ids, names}
import {
  PROTOCOL_VERSION, LIMITS, DEFAULT_ROOM, parseMessage, sanitizeName, sanitizeRole, sanitizeRoom, sanitizeAppearance,
  sanitizeState, sanitizeChatText, wrapAngle, randomToken,
} from '../../server/protocol.js';
import { createChatLimiter } from '../../server/ratelimit.js';

const SEND_INTERVAL = 1000 / LIMITS.stateHz;
const KEEPALIVE_MS = 5000;
const HIDDEN_STOP_MS = 60_000; // stop keep-alives after a minute in the background → server drops us as idle
const GHOST_MS = 12_000; // keep remote players around this long while reconnecting
const LOCAL_PEER_TIMEOUT = 12_000;
const MSG = {
  slow: 'Slow down small — wait a few seconds before sending again.',
  offline: 'You are offline. Reconnecting…',
};

/**
 * Pick the server URL: `import.meta.env.VITE_SERVER_URL` if set, else same host on
 * :8787 in dev, else same origin `/ws` in production (server/index.js serves dist/).
 * @param {string} [room]
 * @param {string} [base] explicit URL (ws:, wss:, http:, https: or a path)
 */
export function serverUrl(room = DEFAULT_ROOM, base) {
  const env = /** @type {any} */ (import.meta).env || {};
  const loc = globalThis.location;
  let raw = base || env.VITE_SERVER_URL;
  if (!raw) {
    if (!loc || !/^https?:$/.test(loc.protocol)) raw = 'ws://localhost:8787/ws';
    else {
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      raw = env.DEV ? `${proto}//${loc.hostname}:8787/ws` : `${proto}//${loc.host}/ws`;
    }
  }
  const u = new URL(raw, loc && /^https?:$/.test(loc.protocol) ? loc.href : 'http://localhost/');
  if (u.protocol === 'http:') u.protocol = 'ws:';
  else if (u.protocol === 'https:') u.protocol = 'wss:';
  if (u.pathname === '/' || !u.pathname) u.pathname = '/ws';
  u.searchParams.set('room', sanitizeRoom(room));
  u.searchParams.set('v', String(PROTOCOL_VERSION));
  return u.toString();
}

const now = () => (globalThis.performance ? performance.now() : Date.now());
const storage = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch { /* blocked */ } },
};

/** Clean a player record coming from the network. */
function cleanPlayer(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id.length > 24) return null;
  const p = { id: raw.id, name: sanitizeName(raw.name) || 'Guest', role: sanitizeRole(raw.role), appearance: sanitizeAppearance(raw.appearance) };
  const s = Array.isArray(raw.p) ? sanitizeState({ p: raw.p, r: raw.r, a: raw.a }) : null;
  if (s) Object.assign(p, { p: s.p, r: s.r, a: s.a });
  return p;
}

/** Clean one `states` entry; returns null when malformed. */
function cleanEntry(e) {
  if (!Array.isArray(e) || e.length < 6 || typeof e[0] !== 'string') return null;
  const s = sanitizeState({ p: [e[1], e[2], e[3]], r: e[4], a: e[5] });
  if (!s) return null;
  const age = Number.isFinite(e[6]) ? Math.max(0, Math.min(5000, e[6])) : 0;
  return [e[0], s.p[0], s.p[1], s.p[2], s.r, s.a, age];
}

/** Normalise what the game passes to sendState. Accepts the wire shape or friendlier names. */
function outState(st) {
  if (!st) return null;
  const pos = st.p || st.position;
  const p = Array.isArray(pos) ? pos : pos && [pos.x, pos.y, pos.z];
  const s = sanitizeState({ p, r: st.r ?? st.rotY ?? st.yaw ?? 0, a: st.a ?? st.anim ?? 'idle', s: st.s ?? st.seat ?? null });
  return s;
}
const sameState = (a, b) => !!a && !!b && a.a === b.a && a.s === b.s &&
  Math.abs(a.p[0] - b.p[0]) < 0.015 && Math.abs(a.p[1] - b.p[1]) < 0.015 && Math.abs(a.p[2] - b.p[2]) < 0.015 &&
  Math.abs(wrapAngle(a.r - b.r)) < 0.01;

/**
 * @param {{
 *   url?: string, room?: string, name?: string, role?: string, appearance?: object,
 *   fallback?: boolean, localOnly?: boolean, connectTimeoutMs?: number, WebSocket?: typeof WebSocket
 * }} [opts]
 */
export function createNet(opts = {}) {
  const room = sanitizeRoom(opts.room);
  const url = serverUrl(room, opts.url);
  const WS = opts.WebSocket || globalThis.WebSocket;
  const hasBC = typeof globalThis.BroadcastChannel === 'function';
  const fallback = opts.fallback !== false && hasBC;
  const connectTimeoutMs = opts.connectTimeoutMs ?? 4000;
  const profile = {
    name: sanitizeName(opts.name) || 'Guest',
    role: sanitizeRole(opts.role),
    appearance: sanitizeAppearance(opts.appearance),
  };

  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** @type {Map<string, any>} */
  const players = new Map();
  let history = [];
  const chatLimiter = createChatLimiter({ burst: LIMITS.chatBurst, windowMs: LIMITS.chatWindowMs });

  let mode = 'connecting';
  let connected = false;
  let closed = false;
  let id = null;
  let token = null;
  let online = 0;
  let total = 0;
  let ws = null;
  let attempt = 0;
  let everConnected = false;
  let pausedIdle = false;
  let retryTimer = null;
  let ghostTimer = null;
  let lastState = null;
  let lastSent = null;
  let lastSentAt = -Infinity;
  let trailing = null;
  let hiddenSince = 0;
  let rtt = 0;

  // local (BroadcastChannel) mode
  let channel = null;
  let localId = null;
  const peerSeen = new Map();
  let localFilter = null;

  const blockedIds = new Set();
  const blockedNames = new Set();
  try { for (const n of JSON.parse(storage.get('amen.blocked') || '[]')) if (typeof n === 'string') blockedNames.add(n); } catch { /* ignore */ }

  function emit(type, data) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (err) { console.error(`[net] ${type} listener failed`, err); }
    }
  }
  function setMode(m) {
    if (m === mode && connected === (m === 'ws')) return;
    mode = m;
    connected = m === 'ws';
    emit('status', { mode, connected });
  }
  const isBlocked = (pid) => blockedIds.has(pid) || (players.has(pid) && blockedNames.has(players.get(pid).name.toLowerCase()));

  // ---------------------------------------------------------------- players
  function upsert(p) {
    const known = players.get(p.id);
    players.set(p.id, { ...known, ...p });
    emit('join', { ...players.get(p.id), update: !!known });
  }
  function remove(pid) {
    if (!players.delete(pid)) return;
    emit('leave', { id: pid });
  }
  function clearPlayers(filter = () => true) {
    for (const pid of [...players.keys()]) if (filter(pid)) remove(pid);
  }
  function pushHistory(line) {
    history.push(line);
    if (history.length > LIMITS.history) history.splice(0, history.length - LIMITS.history);
  }
  function handleChat(raw) {
    const text = sanitizeChatText(raw.text);
    if (!text || typeof raw.id !== 'string') return;
    const p = players.get(raw.id);
    const line = {
      id: raw.id,
      name: sanitizeName(raw.name) || p?.name || 'Guest',
      role: sanitizeRole(raw.role ?? p?.role),
      text,
      ts: Number.isFinite(raw.ts) ? raw.ts : Date.now(),
      self: raw.id === id,
    };
    pushHistory(line);
    if (!line.self && isBlocked(line.id)) return;
    emit('chat', line);
  }

  // ---------------------------------------------------------------- WebSocket
  function scheduleRetry(delay) {
    clearTimeout(retryTimer);
    if (closed || pausedIdle) return;
    const d = delay ?? Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) * (0.75 + Math.random() * 0.5);
    attempt++;
    retryTimer = setTimeout(connectWs, d);
  }

  function connectWs() {
    clearTimeout(retryTimer);
    if (closed || ws || opts.localOnly || !WS) {
      if (!WS && fallback) startLocal();
      return;
    }
    let sock;
    try { sock = new WS(url); } catch { onWsClosed(null, 1006); return; }
    ws = sock;
    if (mode !== 'local') setMode('connecting');
    // Soft timeout: offer local mode but keep the attempt alive — on a busy phone the
    // handshake may have succeeded while the main thread was still compiling shaders.
    const soft = setTimeout(() => { if (ws === sock && !connected && fallback && !everConnected) startLocal(); }, connectTimeoutMs);
    // Hard timeout: a black-holed connection is abandoned and retried.
    const hard = setTimeout(() => {
      if (ws !== sock || sock.readyState === 1) return;
      try { sock.close(); } catch { /* ignore */ }
      onWsClosed(sock, 1006);
    }, Math.max(connectTimeoutMs, 20_000));
    const timeout = { clear() { clearTimeout(soft); clearTimeout(hard); } };
    sock.onopen = () => {
      timeout.clear();
      const hello = { t: 'hello', v: PROTOCOL_VERSION, ...profile };
      if (lastState) hello.state = lastState;
      if (id && token && !id.startsWith('L')) hello.resume = { id, token };
      sock.send(JSON.stringify(hello));
    };
    sock.onmessage = (ev) => { if (ws === sock) onServer(ev.data); };
    sock.onerror = () => { /* close follows */ };
    sock.onclose = (ev) => { timeout.clear(); onWsClosed(sock, ev.code); };
  }

  function onWsClosed(sock, code) {
    if (sock && ws !== sock) return;
    ws = null;
    const wasConnected = connected;
    if (closed) return;
    if (wasConnected) {
      setMode('connecting');
      // Keep remote players for a while: most drops on mobile data are short.
      clearTimeout(ghostTimer);
      ghostTimer = setTimeout(() => {
        if (connected) return;
        clearPlayers((pid) => !pid.startsWith('L'));
        if (fallback) startLocal();
      }, GHOST_MS);
    } else if (fallback && !channel) {
      startLocal();
    } else if (!fallback && mode !== 'offline' && mode !== 'connecting') setMode('connecting');

    if (code === 4002) { // idle: wait for activity before reconnecting
      pausedIdle = true;
      clearTimeout(ghostTimer);
      clearPlayers((pid) => !pid.startsWith('L'));
      if (!channel) setMode('offline');
      return;
    }
    if (code === 4003 || code === 4004) return scheduleRetry(30_000 + Math.random() * 15_000);
    if (code === 4006) return; // our own goodbye
    scheduleRetry(wasConnected ? 300 + Math.random() * 700 : undefined);
  }

  function wsSend(msg) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  function onServer(data) {
    const m = parseMessage(typeof data === 'string' ? data : String(data));
    if (!m) return;
    switch (m.t) {
      case 'welcome': return onWelcome(m);
      case 'join': { const p = cleanPlayer(m); if (p && p.id !== id) upsert(p); return; }
      case 'leave': if (typeof m.id === 'string') remove(m.id); return;
      case 'states': {
        if (!Array.isArray(m.list)) return;
        const list = [];
        for (const e of m.list) {
          const c = cleanEntry(e);
          if (!c) continue;
          list.push(c);
          const p = players.get(c[0]);
          if (p) { p.p = [c[1], c[2], c[3]]; p.r = c[4]; p.a = c[5]; }
        }
        if (list.length) emit('states', { ts: Number.isFinite(m.ts) ? m.ts : Date.now(), list });
        return;
      }
      case 'chat': return handleChat(m);
      case 'online':
        if (Number.isFinite(m.count)) online = m.count;
        if (Number.isFinite(m.total)) total = m.total;
        emit('online', { count: online, total });
        return;
      case 'error':
        emit('error', { code: String(m.code || 'error').slice(0, 16), message: sanitizeChatText(m.message) || 'Something went wrong.', wait: m.wait });
        return;
      case 'pong': if (Number.isFinite(m.c)) rtt = now() - m.c; return;
      case 'profile': if (typeof m.name === 'string') profile.name = sanitizeName(m.name) || profile.name; return;
      default:
    }
  }

  function onWelcome(m) {
    if (typeof m.id !== 'string') return;
    clearTimeout(ghostTimer);
    stopLocal();
    id = m.id;
    token = typeof m.token === 'string' ? m.token : null;
    attempt = 0;
    everConnected = true;
    if (typeof m.name === 'string') profile.name = sanitizeName(m.name) || profile.name;
    online = Number.isFinite(m.online) ? m.online : 1;
    total = Number.isFinite(m.total) ? m.total : online;
    const incoming = new Map();
    for (const raw of Array.isArray(m.players) ? m.players : []) {
      const p = cleanPlayer(raw);
      if (p && p.id !== id) incoming.set(p.id, p);
    }
    // Reconcile: players that left while we were away go, new ones join.
    clearPlayers((pid) => !incoming.has(pid));
    if (Array.isArray(m.history)) {
      history = [];
      for (const l of m.history.slice(-LIMITS.history)) {
        const text = sanitizeChatText(l?.text);
        if (text && typeof l.id === 'string') pushHistory({ id: l.id, name: sanitizeName(l.name) || 'Guest', role: sanitizeRole(l.role), text, ts: Number.isFinite(l.ts) ? l.ts : 0, self: l.id === id });
      }
    }
    setMode('ws');
    for (const p of incoming.values()) upsert(p);
    emit('welcome', { id, room, resumed: !!m.resumed, players: [...players.values()], online, total, history: history.slice(), mode });
    emit('online', { count: online, total });
    lastSent = null; // resend our state right away
    if (lastState) flushState(true);
  }

  // ---------------------------------------------------------------- local (BroadcastChannel) mode
  function startLocal() {
    if (channel || closed || !hasBC || (!fallback && !opts.localOnly)) return;
    localId = 'L' + randomToken(4);
    id = localId;
    channel = new BroadcastChannel(`amen-city:${room}`);
    channel.onmessage = (ev) => onLocal(ev.data);
    online = 1;
    total = 1;
    setMode('local');
    post({ t: 'hello', ...profile, state: lastState });
    emit('welcome', { id, room, resumed: false, players: [], online, total, history: history.slice(), mode });
    emit('online', { count: online, total });
    if (!localFilter) {
      // Same profanity masking as the server, loaded only when needed.
      import('../../server/filter.js').then((mod) => { localFilter = mod.createFilter(); }).catch(() => { /* unfiltered */ });
    }
  }
  function stopLocal() {
    if (!channel) return;
    post({ t: 'bye' });
    channel.close();
    channel = null;
    peerSeen.clear();
    clearPlayers((pid) => pid.startsWith('L'));
  }
  function post(msg) {
    if (!channel) return;
    try { channel.postMessage({ ...msg, id: localId, ts: Date.now() }); } catch { /* closed */ }
  }
  function localCount() {
    online = 1 + [...players.keys()].filter((k) => k.startsWith('L')).length;
    total = online;
    emit('online', { count: online, total });
  }
  function onLocal(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id.startsWith('L') || m.id === localId || m.id.length > 24) return;
    peerSeen.set(m.id, now());
    const known = players.has(m.id);
    switch (m.t) {
      case 'hello':
      case 'here': {
        const p = cleanPlayer({ ...m, p: m.state?.p, r: m.state?.r, a: m.state?.a });
        if (!p) return;
        upsert(p);
        if (m.t === 'hello') post({ t: 'here', ...profile, state: lastState });
        if (p.p) emit('states', { ts: Number.isFinite(m.ts) ? m.ts : Date.now(), list: [[p.id, ...p.p, p.r, p.a, 0]] });
        if (!known) localCount();
        return;
      }
      case 'state': {
        if (!known) { post({ t: 'hello', ...profile, state: lastState }); return; }
        const s = sanitizeState(m);
        if (!s) return;
        const p = players.get(m.id);
        p.p = s.p; p.r = s.r; p.a = s.a;
        emit('states', { ts: Number.isFinite(m.ts) ? m.ts : Date.now(), list: [[m.id, ...s.p, s.r, s.a, 0]] });
        return;
      }
      case 'chat': if (known) handleChat({ id: m.id, text: m.text, ts: m.ts }); return;
      case 'bye': remove(m.id); peerSeen.delete(m.id); localCount(); return;
      default:
    }
  }

  // ---------------------------------------------------------------- sending
  function flushState(force = false) {
    clearTimeout(trailing);
    trailing = null;
    if (!lastState) return;
    const t = now();
    if (!force && sameState(lastState, lastSent) && t - lastSentAt < KEEPALIVE_MS) return;
    if (!force && t - lastSentAt < SEND_INTERVAL) {
      trailing = setTimeout(() => flushState(), SEND_INTERVAL - (t - lastSentAt) + 1);
      return;
    }
    const msg = { t: 'state', p: lastState.p, r: lastState.r, a: lastState.a };
    if (lastState.s !== null) msg.s = lastState.s;
    let ok = false;
    if (mode === 'ws') ok = wsSend(msg);
    else if (mode === 'local' && channel) { post(msg); ok = true; }
    if (ok) { lastSent = lastState; lastSentAt = t; }
  }

  function wake() {
    if (!pausedIdle || closed) return;
    pausedIdle = false;
    attempt = 0;
    connectWs();
  }

  const keepalive = setInterval(() => {
    if (closed) return;
    const hidden = globalThis.document?.hidden;
    if (hidden) { if (!hiddenSince) hiddenSince = now(); } else hiddenSince = 0;
    if (hiddenSince && now() - hiddenSince > HIDDEN_STOP_MS) return;
    if (now() - lastSentAt >= KEEPALIVE_MS) {
      if (lastState) flushState(true);
      else if (mode === 'ws' && wsSend({ t: 'ping', c: now() })) lastSentAt = now(); // not spawned yet: still alive
    }
    if (channel) {
      const t = now();
      for (const [pid, seen] of peerSeen) if (t - seen > LOCAL_PEER_TIMEOUT) { peerSeen.delete(pid); remove(pid); localCount(); }
    }
  }, 1000);
  /** @type {any} */ (keepalive).unref?.();

  // Reconnect promptly when the network or the tab comes back.
  const onOnline = () => { if (!connected && !closed) { attempt = 0; pausedIdle = false; if (!ws) connectWs(); } };
  const onVisible = () => { if (globalThis.document && !document.hidden) { hiddenSince = 0; onOnline(); } };
  const onPageHide = () => { if (channel) post({ t: 'bye' }); };
  globalThis.addEventListener?.('online', onOnline);
  globalThis.addEventListener?.('pagehide', onPageHide);
  globalThis.document?.addEventListener?.('visibilitychange', onVisible);

  const net = {
    room,
    url,
    players,
    get history() { return history.slice(); },
    get mode() { return mode; },
    get connected() { return connected; },
    get id() { return id; },
    get online() { return online; },
    get total() { return total; },
    get name() { return profile.name; },
    get rtt() { return rtt; },
    get blocked() { return { ids: [...blockedIds], names: [...blockedNames] }; },

    /** Subscribe to an event; returns an unsubscribe function. */
    on(type, fn) {
      (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },

    /**
     * Send the local player's state. Call it every frame: it is throttled to 10/s,
     * skips unchanged states and sends a keep-alive every 5 s.
     * @param {{p?: number[], position?: {x: number, y: number, z: number}, r?: number, rotY?: number, a?: string, anim?: string, s?: number|null, seat?: number|null}} state
     */
    sendState(state) {
      const s = outState(state);
      if (!s) return;
      const moved = !sameState(s, lastState);
      lastState = s;
      if (pausedIdle && moved) wake();
      flushState();
    },

    /** Send a chat line. Returns false (and emits `error`) when it cannot be sent. */
    sendChat(text) {
      const t = sanitizeChatText(text);
      if (!t) return false;
      wake();
      if (mode !== 'ws' && mode !== 'local') { emit('error', { code: 'offline', message: MSG.offline }); return false; }
      if (!chatLimiter.take()) { emit('error', { code: 'rate', message: MSG.slow, wait: Math.ceil(chatLimiter.wait()) }); return false; }
      if (mode === 'ws') return wsSend({ t: 'chat', text: t }) || (emit('error', { code: 'offline', message: MSG.offline }), false);
      const masked = localFilter ? localFilter.clean(t) : t;
      post({ t: 'chat', text: masked });
      handleChat({ id: localId, name: profile.name, role: profile.role, text: masked, ts: Date.now() });
      return true;
    },

    /** Change name / role / appearance after joining. */
    setProfile(p = {}) {
      if (p.name !== undefined) profile.name = sanitizeName(p.name) || profile.name;
      if (p.role !== undefined) profile.role = sanitizeRole(p.role);
      if (p.appearance !== undefined) profile.appearance = sanitizeAppearance(p.appearance);
      if (mode === 'ws') wsSend({ t: 'hello', ...profile });
      else if (channel) post({ t: 'here', ...profile, state: lastState });
    },

    /** Report a player to the server (moderation) and block them locally. */
    report(pid, reason = '') {
      if (mode === 'ws') wsSend({ t: 'report', id: pid, reason: String(reason).slice(0, 80) });
      net.block(pid);
    },
    /** Hide a player's chat on this device (remembered by name). */
    block(pid) {
      blockedIds.add(pid);
      const n = players.get(pid)?.name;
      if (n) blockedNames.add(n.toLowerCase());
      storage.set('amen.blocked', JSON.stringify([...blockedNames].slice(-100)));
      emit('blocked', net.blocked);
    },
    unblockAll() {
      blockedIds.clear();
      blockedNames.clear();
      storage.set('amen.blocked', '[]');
      emit('blocked', net.blocked);
    },
    isBlocked,

    /** Measure round-trip time (result in net.rtt after the pong). */
    ping() { wsSend({ t: 'ping', c: now() }); },

    /** Leave for good (no reconnect). */
    close() {
      if (closed) return;
      wsSend({ t: 'bye' });
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(ghostTimer);
      clearTimeout(trailing);
      clearInterval(keepalive);
      try { ws?.close(1000); } catch { /* ignore */ }
      ws = null;
      stopLocal();
      globalThis.removeEventListener?.('online', onOnline);
      globalThis.removeEventListener?.('pagehide', onPageHide);
      globalThis.document?.removeEventListener?.('visibilitychange', onVisible);
      setMode('offline');
    },
  };

  if (opts.localOnly) startLocal();
  else if (!WS) startLocal();
  else connectWs();
  return net;
}

