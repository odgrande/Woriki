// Game state: creation, versioned save format, migration from the legacy prototype,
// and localStorage persistence (every access wrapped in try/catch).
import { STARTS, LAGOS_AREAS, ROLES, CHURCH_TYPES, CHURCH_NAME } from './content.js';
import { START_T, DAY } from './clock.js';

export const SAVE_KEY = 'amen.save';
export const LEGACY_SAVE_KEY = 'amencity.v1';
export const SAVE_VERSION = 2;

/**
 * @typedef {object} Profile
 * @property {string} name
 * @property {string} [tradition] key of CHURCH_TYPES
 * @property {string} role key of ROLES
 * @property {object} [appearance] see src/characters appearance contract
 */

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Tunde';

/**
 * A fresh life.
 * @param {Profile} profile
 * @param {{rng?: () => number, T?: number}} [o]
 */
export function newState(profile = {}, { rng = Math.random, T = START_T } = {}) {
  const startId = rng() < 0.5 ? 'home' : 'convert';
  const st = STARTS[startId];
  const role = ROLES[profile.role] ? profile.role : 'worshipper';
  return {
    v: SAVE_VERSION,
    name: cleanName(profile.name),
    church: CHURCH_NAME,
    tradition: CHURCH_TYPES[profile.tradition] ? profile.tradition : 'pentecostal',
    role,
    appearance: profile.appearance || null,
    start: startId,
    // Where you grew up (backstory); you now live at No. 14 in Yaba, near the church.
    from: LAGOS_AREAS[Math.floor(rng() * LAGOS_AREAS.length)],
    area: 'Yaba',
    job: st.job,
    salary: st.salary,
    // time
    T,
    startT: T,
    day: 1,
    // needs (0..100)
    energy: 100,
    hunger: 80,
    faith: st.faith,
    word: st.word,
    character: st.character,
    fame: 0,
    // wallet
    naira: st.naira,
    points: 10,
    // role progress
    rank: 0,
    xp: 0,
    stage: 0,
    dept: null,
    semester: 1,
    // story counters
    streak: 0,
    bestStreak: 0,
    missedSundays: 0,
    services: 0,
    prayed: 0,
    souls: 0,
    testimonies: 0,
    frauds: 0,
    falls: 0,
    repentances: 0,
    convicted: false,
    items: {},
    /** Furniture at No. 14 (see life.js CATALOG). */
    home: {},
    requests: [],
    pastor: null,
    // daily
    doneToday: {},
    skippedSunday: false,
    // real-time systems
    attendance: null,
    shift: null,
    pending: [],
    activeEvent: null,
    lastEventT: -1e9,
    eventsToday: 0,
    // endings
    won: false,
    over: false,
    ending: null,
    log: [{ T, text: `Your journey began: ${st.title}. ${st.text}` }],
  };
}

/** Pastor's own church, created at ordination. */
export function newPastorChurch(name) {
  return { church: String(name || 'Ebenezer Chapel').slice(0, 36), members: 7, venue: 0, choir: 0, owned: {}, branches: {}, rentMult: 1, missedRent: 0 };
}

/**
 * Bring any saved shape up to the current version. Returns null when unusable.
 * Accepts the wrapped save `{v, state}`, a bare v2 state, or the legacy prototype's v1 state.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw.state && typeof raw.state === 'object' ? raw.state : raw;
  if (!s.v) s = fromLegacy(s);
  if (!s || typeof s !== 'object') return null;
  if (s.v > SAVE_VERSION) return null;
  // Fill any field added since the save was written.
  const base = newState({ name: s.name, role: s.role, tradition: s.tradition }, { rng: () => 0, T: s.T ?? START_T });
  const out = { ...base, ...s, v: SAVE_VERSION };
  for (const k of ['items', 'doneToday', 'home']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  for (const k of ['requests', 'pending', 'log']) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['energy', 'hunger', 'faith', 'word', 'character', 'fame']) out[k] = clampNum(out[k], 0, 100, base[k]);
  for (const k of ['naira', 'points', 'xp', 'T', 'startT']) out[k] = Number.isFinite(out[k]) ? out[k] : base[k];
  if (!ROLES[out.role]) out.role = 'worshipper';
  return out;
}

const clampNum = (v, a, b, d) => (Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);

/** Map the legacy prototype's state (amencity.v1) onto v2. */
function fromLegacy(o) {
  if (typeof o.name !== 'string' || !('funds' in o)) return null;
  const T = START_T + Math.max(0, (o.day || 1) - 1) * DAY;
  const s = newState({ name: o.name, role: o.role, tradition: o.ctype }, { rng: () => 0, T });
  Object.assign(s, {
    start: o.start || s.start, area: o.area || s.area, job: o.job || s.job, salary: o.salary || s.salary,
    hunger: o.hunger ?? s.hunger, energy: o.energy ?? 100, faith: o.faith ?? s.faith, word: o.word ?? s.word,
    character: o.character ?? s.character, fame: o.fame || 0, naira: Math.round(o.funds || 0), points: o.points || 0,
    rank: o.rank || 0, xp: o.xp || 0, stage: o.stage || 0, dept: o.dept || null, semester: o.semester || 1,
    streak: o.streak || 0, missedSundays: o.missedSundays || 0, services: o.services || 0, prayed: o.prayed || 0,
    souls: o.souls || 0, testimonies: o.testimonies || 0, frauds: o.frauds || 0, falls: o.falls || 0,
    repentances: o.repentances || 0, convicted: !!o.convicted, items: o.items || {}, requests: Array.isArray(o.requests) ? o.requests : [],
    won: !!o.won, over: !!o.over, day: o.day || 1,
    log: [{ T, text: 'Your story continues from the old Amen City.' }],
  });
  s.startT = START_T;
  if (o.stage >= 5) {
    s.pastor = { church: o.church || 'Ebenezer Chapel', members: o.members || 7, venue: o.venue || 0, choir: o.choir || 0, owned: o.owned || {}, branches: o.branches || {}, rentMult: o.rentMult || 1, missedRent: o.missedRent || 0 };
  }
  return s;
}

/* ---------------------------------------------------------------- storage */

const defaultStorage = () => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Serialise the state (drops transient fields). */
export function serialize(s) {
  const { exam, kneel, kneelDone, ...rest } = s;
  return JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), state: rest });
}

/** @returns {boolean} true when written */
export function writeSave(s, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch { return false; }
}

/** Load and migrate the saved life (falls back to the legacy prototype's save). */
export function readSave(storage = defaultStorage()) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(SAVE_KEY) || storage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch { return null; }
}

export function clearSave(storage = defaultStorage()) {
  try {
    storage?.removeItem(SAVE_KEY);
    storage?.removeItem(LEGACY_SAVE_KEY);
  } catch { /* storage blocked */ }
}

/** Short summary of a saved life for the start screen. */
export function saveSummary(s) {
  if (!s) return null;
  const r = ROLES[s.role] || ROLES.worshipper;
  return { name: s.name, role: s.role, roleName: r.name, emoji: r.emoji, day: s.day, over: !!s.over, appearance: s.appearance };
}
