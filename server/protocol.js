// Amen City wire protocol: constants and pure validation helpers.
// No Node or browser APIs here, so both the server and the client (local
// BroadcastChannel mode) import it. Everything that crosses the network is
// clamped through these functions before it is stored or forwarded.

export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  name: 20,
  chat: 200,
  history: 30,
  /** Broadcast rate for `states` and the max client send rate. */
  stateHz: 10,
  /** Chat token bucket: `chatBurst` lines, refilled over `chatWindowMs`. */
  chatBurst: 5,
  chatWindowMs: 10_000,
  /** Hard cap for one JSON message in bytes. */
  maxPayload: 4096,
  /** World bounds (metres). The Yaba map is ~300 m across; this leaves room. */
  worldHalf: 600,
  minY: -20,
  maxY: 80,
};

export const DEFAULT_ROOM = 'yaba';

export const ROLES = ['worshipper', 'prayer', 'security', 'usher', 'choir', 'media', 'hospitality', 'children', 'visitor', 'minister'];

/** Character states (see ARCHITECTURE.md → Characters) plus emote overlays. */
export const ANIM_STATES = [
  'idle', 'walk', 'walkFormal', 'jog', 'run', 'jumpStart', 'jumpLoop', 'jumpLand', 'sitDown', 'sit', 'standUp',
  'sitTalk', 'talk', 'dance', 'kneel', 'foldArms', 'phone', 'nod', 'shakeHead', 'carry', 'eat', 'drive', 'interact',
  'pickup', 'crouch', 'lie',
  // emote overlays: the remote keeps its locomotion and plays the overlay once
  'wave', 'clap', 'praise',
];
const ANIM_SET = new Set(ANIM_STATES);
export const EMOTES = new Set(['wave', 'clap', 'praise']);

const ROLE_SET = new Set(ROLES);
const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9-]{1,24}$/;
// Control chars, zero-width and bidi overrides (used for spoofing and invisible spam).
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF0-\uFFFF]/g;
// More than two stacked combining marks ("zalgo") are trimmed.
const ZALGO = /(\p{M}{2})\p{M}+/gu;

/** Round to `d` decimals (keeps JSON short). */
export const round = (v, d = 2) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Cut a string to at most `max` code points without splitting surrogate pairs. */
export function cutCodePoints(s, max) {
  if (s.length <= max) return s;
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/** Collapse whitespace, strip invisible characters and zalgo. */
function tidy(raw) {
  return String(raw).normalize('NFC').replace(INVISIBLE, '').replace(ZALGO, '$1').replace(/\s+/g, ' ').trim();
}

/**
 * Player display name: ≤ 20 chars, letters (any script), digits, spaces and . ' - _ &.
 * Returns '' when nothing usable is left (the caller picks a guest name).
 * @param {unknown} raw
 */
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  const s = tidy(raw.slice(0, 200)).replace(/[^\p{L}\p{N} .'\-_&]/gu, '').replace(/\s+/g, ' ').trim();
  return cutCodePoints(s, LIMITS.name).trim();
}

/** @param {unknown} raw */
export function sanitizeRole(raw) {
  return typeof raw === 'string' && ROLE_SET.has(raw) ? raw : 'visitor';
}

/** @param {unknown} raw */
export function sanitizeRoom(raw) {
  if (typeof raw !== 'string') return DEFAULT_ROOM;
  const s = raw.toLowerCase().trim();
  return /^[a-z0-9-]{1,24}$/.test(s) ? s : DEFAULT_ROOM;
}

/**
 * Structural clamp of an appearance object. Enum values are only checked for
 * shape (slug), so the characters module can add outfits without a server
 * change; `normalizeAppearance` on the client maps unknown values to defaults.
 * @param {unknown} raw
 */
export function sanitizeAppearance(raw) {
  /** @type {Record<string, any>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const a = /** @type {Record<string, any>} */ (raw);
  if (a.body === 'male' || a.body === 'female') out.body = a.body;
  if (finite(a.skin)) out.skin = clamp(Math.round(a.skin), 0, 5);
  for (const k of ['hair', 'outfit', 'headwear']) if (typeof a[k] === 'string' && SLUG.test(a[k])) out[k] = a[k];
  if (typeof a.beard === 'boolean') out.beard = a.beard;
  for (const k of ['hairColor', 'shoes']) if (typeof a[k] === 'string' && HEX.test(a[k])) out[k] = a[k].toLowerCase();
  if (a.colors && typeof a.colors === 'object' && !Array.isArray(a.colors)) {
    const c = {};
    if (typeof a.colors.primary === 'string' && HEX.test(a.colors.primary)) c.primary = a.colors.primary.toLowerCase();
    if (typeof a.colors.secondary === 'string' && HEX.test(a.colors.secondary)) c.secondary = a.colors.secondary.toLowerCase();
    if (typeof a.colors.pattern === 'string' && SLUG.test(a.colors.pattern)) c.pattern = a.colors.pattern;
    if (Object.keys(c).length) out.colors = c;
  }
  return out;
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(r) {
  const TAU = Math.PI * 2;
  let a = r % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** @param {unknown} a */
export function sanitizeAnim(a) {
  return typeof a === 'string' && ANIM_SET.has(a) ? a : 'idle';
}

/**
 * Player state `{p: [x, y, z], r: yaw, a: animState, s?: seat}`.
 * Positions are clamped to the world box and rounded to centimetres.
 * @param {unknown} raw
 * @returns {{p: [number, number, number], r: number, a: string, s: number|null} | null}
 */
export function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const m = /** @type {Record<string, any>} */ (raw);
  const p = m.p;
  if (!Array.isArray(p) || p.length !== 3 || !p.every(finite)) return null;
  const H = LIMITS.worldHalf;
  return {
    p: [round(clamp(p[0], -H, H)), round(clamp(p[1], LIMITS.minY, LIMITS.maxY)), round(clamp(p[2], -H, H))],
    r: finite(m.r) ? round(wrapAngle(m.r), 3) : 0,
    a: sanitizeAnim(m.a),
    s: Number.isInteger(m.s) && m.s >= 0 && m.s < 10_000 ? m.s : null,
  };
}

/**
 * Chat line: tidy, ≤ 200 code points. Returns '' when empty.
 * Profanity is masked separately (server/filter.js).
 * @param {unknown} raw
 */
export function sanitizeChatText(raw) {
  if (typeof raw !== 'string') return '';
  return cutCodePoints(tidy(raw.slice(0, 2000)), LIMITS.chat).trim();
}

/**
 * Parse a raw frame into a message object `{t, ...}` or null.
 * @param {string | ArrayBuffer | Uint8Array} data
 */
export function parseMessage(data) {
  let text = data;
  if (typeof text !== 'string') {
    try { text = new TextDecoder().decode(/** @type {any} */ (data)); } catch { return null; }
  }
  if (text.length > LIMITS.maxPayload) return null;
  let msg;
  try { msg = JSON.parse(text); } catch { return null; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string' || msg.t.length > 16) return null;
  return msg;
}

/** Random id-safe token (hex). Works in Node ≥ 19 and browsers. */
export function randomToken(bytes = 16) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
