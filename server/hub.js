// Room hub: sessions, players, chat history and the 10 Hz state broadcast.
// Transport-agnostic: index.js feeds it sockets shaped like
// `{ send(str), close(code, reason), terminate?(), bufferedAmount }`.
import {
  PROTOCOL_VERSION, LIMITS, parseMessage, sanitizeName, sanitizeRole, sanitizeRoom, sanitizeAppearance,
  sanitizeState, sanitizeChatText, randomToken,
} from './protocol.js';
import { createBucket, createChatLimiter } from './ratelimit.js';

export const HUB_DEFAULTS = {
  roomCap: 60,
  maxPlayers: 600,
  maxRooms: 200,
  helloTimeoutMs: 10_000,
  /** No app message (state keep-alives included) for this long → dropped. */
  idleMs: 150_000,
  /** A socket that drops without a close frame keeps its player for this long so a reconnect can resume it. */
  resumeGraceMs: 20_000,
  /** Invalid / excess frames tolerated per connection before it is closed. */
  floodLimit: 80,
  reportThreshold: 3,
  reportWindowMs: 10 * 60_000,
  muteMs: 10 * 60_000,
  /** Skip state frames to sockets with this much unsent data; close above dropBytes. */
  backpressureBytes: 256 * 1024,
  dropBytes: 2 * 1024 * 1024,
  repeatWindowMs: 30_000,
};

/** Close codes (4xxx are app-specific). */
export const CLOSE = {
  HELLO_TIMEOUT: 4001, IDLE: 4002, ROOM_FULL: 4003, SERVER_FULL: 4004, REPLACED: 4005, BYE: 4006,
  POLICY: 1008, RESTART: 1012,
};

const MESSAGES = {
  slow: 'Slow down small — wait a few seconds before sending again.',
  repeat: 'You don talk that one already 🙂',
  muted: 'Other players reported your messages, so your chat is paused for a while.',
  roomFull: 'This area is full right now. Try again in a few minutes.',
  serverFull: 'The server is full right now. Try again in a few minutes.',
  restart: 'Server is restarting. Reconnecting…',
};

/**
 * @param {{ filter: {clean(t: string): string}, now?: () => number, log?: Pick<Console, 'info'|'warn'>, [k: string]: any }} o
 */
export function createHub({ filter, now = Date.now, log = console, ...opts }) {
  const cfg = { ...HUB_DEFAULTS, ...opts };
  /** @type {Map<string, {name: string, players: Map<string, any>, history: any[], emptySince: number}>} */
  const rooms = new Map();
  /** @type {Map<string, any>} id → player (joined, ghosts included) */
  const players = new Map();
  const sessions = new Set();
  let seq = 0;
  let onlineDirty = false;
  let lastOnlineAt = 0;

  const json = (msg) => JSON.stringify(msg);

  function sendRaw(session, str, droppable = false) {
    if (!session || session.closed) return;
    const sock = session.sock;
    const buffered = sock.bufferedAmount || 0;
    if (buffered > cfg.dropBytes) { kick(session, CLOSE.POLICY, 'too slow', true); return; }
    if (droppable && buffered > cfg.backpressureBytes) return;
    try { sock.send(str); } catch { /* socket already closing */ }
  }
  const send = (session, msg) => sendRaw(session, json(msg));

  function broadcast(room, msg, exceptId = null, droppable = false) {
    const str = typeof msg === 'string' ? msg : json(msg);
    for (const p of room.players.values()) if (p.session && p.id !== exceptId) sendRaw(p.session, str, droppable);
  }

  function getRoom(name, create) {
    let room = rooms.get(name);
    if (!room && create) {
      if (rooms.size >= cfg.maxRooms) {
        // Recycle the room that has been empty the longest.
        let oldest = null;
        for (const r of rooms.values()) if (!r.players.size && (!oldest || r.emptySince < oldest.emptySince)) oldest = r;
        if (!oldest) return null;
        rooms.delete(oldest.name);
      }
      room = { name, players: new Map(), history: [], emptySince: 0 };
      rooms.set(name, room);
    }
    return room;
  }

  const publicInfo = (p) => {
    const info = { id: p.id, name: p.name, role: p.role, appearance: p.appearance };
    if (p.hasState) Object.assign(info, { p: p.state.p, r: p.state.r, a: p.state.a });
    return info;
  };

  function kick(session, code, reason, terminate = false) {
    if (session.closed || session.kicked) return;
    session.kicked = true;
    session.kickCode = code;
    try {
      if (terminate && session.sock.terminate) session.sock.terminate();
      else session.sock.close(code, reason);
    } catch { /* ignore */ }
  }

  function removePlayer(p, reason = 'left') {
    const room = rooms.get(p.room);
    if (!room || room.players.get(p.id) !== p) return;
    room.players.delete(p.id);
    players.delete(p.id);
    if (!room.players.size) room.emptySince = now();
    broadcast(room, { t: 'leave', id: p.id });
    onlineDirty = true;
    log.info?.(`[leave] ${p.name} (${p.id}) ${room.name} ${reason} · ${players.size} online`);
  }

  function violation(session) {
    if (++session.violations > cfg.floodLimit) kick(session, CLOSE.POLICY, 'flood');
  }

  function welcome(session, p, resumed) {
    const room = rooms.get(p.room);
    const list = [];
    for (const o of room.players.values()) if (o !== p) list.push(publicInfo(o));
    send(session, {
      t: 'welcome', v: PROTOCOL_VERSION, id: p.id, token: p.token, room: room.name, resumed,
      name: p.name, players: list, online: room.players.size, total: players.size, history: room.history,
    });
  }

  function onHello(session, msg) {
    if (!session.helloBucket.take()) return violation(session);
    const t = now();
    const name = filter.clean(sanitizeName(msg.name)) || `Guest ${(100 + (seq % 900))}`;
    const role = sanitizeRole(msg.role);
    const appearance = sanitizeAppearance(msg.appearance);

    // Profile update from an already joined session.
    if (session.player) {
      const p = session.player;
      Object.assign(p, { name, role, appearance });
      broadcast(rooms.get(p.room), { t: 'join', ...publicInfo(p) }, p.id);
      send(session, { t: 'profile', id: p.id, name });
      return;
    }

    // Resume a player whose previous socket dropped.
    const r = msg.resume;
    if (r && typeof r === 'object' && typeof r.id === 'string' && typeof r.token === 'string') {
      const old = players.get(r.id);
      if (old && old.token === r.token && old.room === session.room) {
        if (old.session && old.session !== session) {
          const prev = old.session;
          prev.player = null;
          kick(prev, CLOSE.REPLACED, 'replaced');
        }
        old.session = session;
        old.ghostSince = 0;
        session.player = old;
        const changed = old.name !== name || old.role !== role || json(old.appearance) !== json(appearance);
        Object.assign(old, { name, role, appearance });
        welcome(session, old, true);
        if (changed) broadcast(rooms.get(old.room), { t: 'join', ...publicInfo(old) }, old.id);
        log.info?.(`[resume] ${old.name} (${old.id}) ${old.room}`);
        return;
      }
    }

    const room = getRoom(session.room, true);
    if (!room) {
      send(session, { t: 'error', code: 'full', message: MESSAGES.serverFull });
      return kick(session, CLOSE.SERVER_FULL, 'too many rooms');
    }
    if (room.players.size >= cfg.roomCap) {
      send(session, { t: 'error', code: 'full', message: MESSAGES.roomFull });
      return kick(session, CLOSE.ROOM_FULL, 'room full');
    }
    if (players.size >= cfg.maxPlayers) {
      send(session, { t: 'error', code: 'full', message: MESSAGES.serverFull });
      return kick(session, CLOSE.SERVER_FULL, 'server full');
    }
    const p = {
      id: (++seq).toString(36),
      token: randomToken(12),
      name, role, appearance,
      room: room.name,
      state: { p: [0, 0, 0], r: 0, a: 'idle', s: null },
      hasState: false, stateAt: t, dirty: false,
      session, ghostSince: 0,
      chat: createChatLimiter({ burst: LIMITS.chatBurst, windowMs: LIMITS.chatWindowMs, now }),
      recent: [], mutedUntil: 0, reports: new Map(),
    };
    // A hello may carry the first state so others never see the player at the origin.
    const s = msg.state ? sanitizeState(msg.state) : null;
    if (s) Object.assign(p, { state: s, hasState: true });
    session.player = p;
    room.players.set(p.id, p);
    players.set(p.id, p);
    welcome(session, p, false);
    broadcast(room, { t: 'join', ...publicInfo(p) }, p.id);
    onlineDirty = true;
    log.info?.(`[join] ${p.name} (${p.id}) ${p.role} → ${room.name} · ${players.size} online`);
  }

  function onState(session, msg) {
    const p = session.player;
    if (!p) return;
    if (!session.stateBucket.take()) return; // over 10/s: drop quietly
    const s = sanitizeState(msg);
    if (!s) return violation(session);
    p.state = s;
    p.hasState = true;
    p.stateAt = now();
    p.dirty = true;
  }

  function onChat(session, msg) {
    const p = session.player;
    if (!p) return;
    const t = now();
    if (p.mutedUntil > t) return send(session, { t: 'error', code: 'muted', message: MESSAGES.muted });
    const raw = sanitizeChatText(msg.text);
    if (!raw) return;
    if (!p.chat.take()) {
      session.violations++;
      return send(session, { t: 'error', code: 'rate', message: MESSAGES.slow, wait: Math.ceil(p.chat.wait()) });
    }
    const key = raw.toLowerCase();
    p.recent = p.recent.filter((e) => t - e.t < cfg.repeatWindowMs);
    if (p.recent.filter((e) => e.k === key).length >= 2) return send(session, { t: 'error', code: 'repeat', message: MESSAGES.repeat });
    p.recent.push({ k: key, t });
    if (p.recent.length > 6) p.recent.shift();
    const room = rooms.get(p.room);
    const line = { t: 'chat', id: p.id, name: p.name, role: p.role, text: filter.clean(raw), ts: t };
    room.history.push(line);
    if (room.history.length > LIMITS.history) room.history.splice(0, room.history.length - LIMITS.history);
    broadcast(room, line);
  }

  function onReport(session, msg) {
    const p = session.player;
    if (!p || !session.reportBucket.take()) return;
    const target = typeof msg.id === 'string' ? players.get(msg.id) : null;
    if (!target || target === p || target.room !== p.room) return;
    const t = now();
    for (const [k, at] of target.reports) if (t - at > cfg.reportWindowMs) target.reports.delete(k);
    target.reports.set(session.ip, t);
    const reason = sanitizeChatText(msg.reason).slice(0, 80);
    log.warn?.(`[report] ${p.name} (${p.id}) reported ${target.name} (${target.id}) in ${p.room}: ${reason || '-'} · ${target.reports.size} distinct`);
    if (target.reports.size >= cfg.reportThreshold && target.mutedUntil <= t) {
      target.mutedUntil = t + cfg.muteMs;
      target.reports.clear();
      if (target.session) send(target.session, { t: 'error', code: 'muted', message: MESSAGES.muted });
      log.warn?.(`[mute] ${target.name} (${target.id}) for ${Math.round(cfg.muteMs / 60000)} min`);
    }
  }

  function onMessage(session, data) {
    if (session.closed || session.kicked) return;
    if (!session.msgBucket.take()) return violation(session);
    const msg = data == null ? null : parseMessage(data);
    if (!msg) return violation(session);
    session.lastMsgAt = now();
    switch (msg.t) {
      case 'hello': return onHello(session, msg);
      case 'state': return onState(session, msg);
      case 'chat': return onChat(session, msg);
      case 'report': return onReport(session, msg);
      case 'ping': return send(session, { t: 'pong', c: Number.isFinite(msg.c) ? msg.c : 0, ts: now() });
      case 'bye': return kick(session, CLOSE.BYE, 'bye');
      default: return violation(session);
    }
  }

  function onClose(session, code) {
    if (session.closed) return;
    session.closed = true;
    sessions.delete(session);
    const p = session.player;
    session.player = null;
    if (!p || p.session !== session) return;
    p.session = null;
    // Clean closes (tab closed, server kick) leave at once; network drops get a grace period.
    const clean = code === 1000 || code === 1001 || session.kicked || cfg.resumeGraceMs <= 0;
    if (clean) removePlayer(p, session.kicked ? `kicked ${session.kickCode}` : 'closed');
    else p.ghostSince = now();
  }

  return {
    cfg,
    /**
     * Attach a new socket. Returns the handlers the transport must call.
     * @param {{send(s: string): void, close(code?: number, reason?: string): void, terminate?(): void, bufferedAmount?: number}} sock
     * @param {{ip?: string, room?: string}} [meta]
     */
    connect(sock, { ip = '?', room } = {}) {
      const t = now();
      const session = {
        sock, ip, room: sanitizeRoom(room), player: null, connectedAt: t, lastMsgAt: t,
        closed: false, kicked: false, kickCode: 0, violations: 0,
        msgBucket: createBucket({ capacity: 40, refillPerSec: 25, now }),
        stateBucket: createBucket({ capacity: 15, refillPerSec: LIMITS.stateHz + 2, now }),
        helloBucket: createBucket({ capacity: 3, refillPerSec: 0.2, now }),
        reportBucket: createBucket({ capacity: 3, refillPerSec: 1 / 60, now }),
      };
      sessions.add(session);
      return {
        message: (data) => onMessage(session, data),
        close: (code) => onClose(session, code),
        get player() { return session.player; },
      };
    },

    /** Run every 1/10 s: state broadcast, ghost expiry, timeouts and online counts. */
    tick() {
      const t = now();
      for (const room of rooms.values()) {
        const list = [];
        for (const p of room.players.values()) {
          if (p.ghostSince && t - p.ghostSince > cfg.resumeGraceMs) { removePlayer(p, 'timed out'); continue; }
          if (p.dirty) {
            p.dirty = false;
            const s = p.state;
            list.push([p.id, s.p[0], s.p[1], s.p[2], s.r, s.a, Math.max(0, t - p.stateAt)]);
          }
        }
        if (list.length) broadcast(room, { t: 'states', ts: t, list }, null, true);
      }
      for (const s of sessions) {
        if (s.kicked) continue;
        if (!s.player && t - s.connectedAt > cfg.helloTimeoutMs) kick(s, CLOSE.HELLO_TIMEOUT, 'hello timeout');
        else if (s.player && t - s.lastMsgAt > cfg.idleMs) kick(s, CLOSE.IDLE, 'idle');
      }
      if (onlineDirty && t - lastOnlineAt >= 1000) {
        onlineDirty = false;
        lastOnlineAt = t;
        for (const room of rooms.values()) if (room.players.size) broadcast(room, { t: 'online', count: room.players.size, total: players.size });
      }
    },

    /** Tell everyone the server is going away, then close their sockets. */
    shutdown(code = CLOSE.RESTART, reason = 'server restarting') {
      for (const s of sessions) {
        send(s, { t: 'error', code: 'restart', message: MESSAGES.restart });
        kick(s, code, reason);
      }
    },

    stats() {
      const byRoom = {};
      for (const r of rooms.values()) if (r.players.size) byRoom[r.name] = r.players.size;
      return { total: players.size, connections: sessions.size, rooms: byRoom };
    },
  };
}
