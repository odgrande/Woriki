// Game rules: needs over time, actions, services and attendance, shifts, prayer by
// kneeling, events and temptations, the Bible quiz and exams, milestones and ranks,
// shop, prayer wall, end of day (streaks, grace, EFCC) and the pastor's own church.
//
// Every function here is pure logic over a plain state object. Side effects for the
// outside world (toasts, sounds, bus events) are pushed into `env.fx` as
// `{type, ...data}` records that src/game/index.js forwards.
import {
  ROLES, CHURCH_TYPES, STAGES, STAGE, TITLES, RANK_XP, VENUES, UPGRADES, BRANCHES, SHOP, FOOD, QUIZ,
  SAMPLE_REQUESTS, DEPARTMENTS, HALL_ZONES, CHURCH_ZONES, ZONE_LABELS, servicesFor, BIBLE_SCHOOL_FEE, WIN_MEMBERS, V, verseText, naira, num, examNeed,
} from './content.js';
import { ACTIONS, ACTION_BY_ID, SERVICE_DUTIES, SERVICE_CREDIT, isPastor, isMinister } from './actions.js';
import { EVENTS, EVENT_BY_ID } from './events.js';
import { newPastorChurch } from './state.js';
import { restBonus } from './life.js';
import { DAY, clockInfo, serviceAt, nextService, servicesBetween, countdown, minuteOfDay, weekdayOf, hhmm } from './clock.js';

export { isPastor, isMinister };

/** Minutes of kneeling that count as a prayer session. */
export const KNEEL_MINUTES = 15;
/** Seconds of dancing / clapping / waving that count as worship presence. */
export const PRAISE_SECONDS = 12;
/** Snapshot keys used to report what an action changed. */
const DELTA_KEYS = ['naira', 'points', 'energy', 'hunger', 'faith', 'character', 'word', 'fame'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * @typedef {object} Loc Where the player is and what they are doing.
 * @property {string|null} zone world zone id
 * @property {boolean} [seated]
 * @property {boolean} [kneeling]
 * @property {boolean} [praising] danced / clapped / waved in the last few seconds
 */

/**
 * @typedef {object} Env
 * @property {() => number} rng
 * @property {object[]} fx outbox of effects
 * @property {'local'|'shared'} [mode] local: the clock can skip (sleep, work); shared: it cannot
 * @property {Loc} [loc]
 * @property {boolean} [linked] a 3D player is sending location events
 */

/** A fresh env (handy in tests). */
export function makeEnv(o = {}) {
  return { rng: Math.random, fx: [], mode: 'local', loc: { zone: null }, linked: false, ...o };
}

/* ================================================================ derived values */

export function title(s) {
  if (!isMinister(s)) return ROLES[s.role].ranks[s.rank] || ROLES[s.role].ranks[0];
  if (!isPastor(s)) return STAGES[s.stage];
  let t = TITLES[0][1];
  for (const [min, name] of TITLES) if (s.pastor.members >= min) t = name;
  return t;
}

/** Mood, like Lagos Life: driven by faith, hunger, energy and a clear conscience. */
export function mood(s) {
  const score = s.faith * 0.5 + s.hunger * 0.4 - (s.convicted ? 25 : 0) + (s.character - 50) * 0.2 - (s.energy < 15 ? 10 : 0);
  if (score >= 60) return { id: 'joyful', emoji: '😊', label: 'Joyful' };
  if (score >= 42) return { id: 'peaceful', emoji: '🙂', label: 'Peaceful' };
  if (score >= 25) return { id: 'okay', emoji: '😐', label: 'Okay' };
  return { id: 'miserable', emoji: '😣', label: 'Miserable' };
}

/** Ideas for free time by weekday (Mon = 0): normal life, not only church. */
const FREE_TIME = [
  'Work day. Go to work, then Bible study is on Wednesday.',
  'Work day. Evening: visit the market or rest at home.',
  'Work day. Bible study tonight at 6pm.',
  'Work day. A quiet evening at home with your Bible.',
  'Work day. Tonight is the Friday vigil at 10pm.',
  'Saturday! Free time: Elegushi Beach, a film at the National Theatre, or Yaba market.',
  'Sunday: service at 9am, then rice at home and rest.',
];

/**
 * Today's plan for the home card and the Today tab: this role's meetings and services plus a
 * free-time idea, like a real Lagos weekend.
 */
export function dayPlan(s) {
  const c = clock(s);
  const dayStart = s.T - c.minute;
  const items = servicesBetween(dayStart, dayStart + DAY, schedule(s))
    .filter((x) => x.start >= dayStart)
    .map((x) => ({ kind: x.kind, emoji: x.def.emoji, name: x.name, time: hhmm(x.start), done: !!s.doneToday[x.kind], live: x.start <= s.T && s.T < x.end, past: x.end <= s.T }));
  return { weekday: c.weekdayName, items, idea: FREE_TIME[c.weekday] };
}

/** This player's weekly schedule (worship services plus their role's meetings). */
export const schedule = (s) => servicesFor(s.role);

export const clock = (s) => clockInfo(s.T, s.startT, schedule(s));

/** Zones where this player serves during services, or null for the congregation. */
export function postZones(s) {
  if (isPastor(s)) return ['altar'];
  if (isMinister(s) && s.stage >= STAGE.worker) {
    return { choir: ['choir'], ushers: ['church-hall', 'altar'], evang: ['gate', 'compound'], sunday: ['children'] }[s.dept] || null;
  }
  return ROLES[s.role].post;
}

export function postLabel(s) {
  if (isPastor(s)) return 'the altar';
  const z = postZones(s);
  if (!z) return null;
  if (isMinister(s)) return ZONE_LABELS[z[0]] || z[0];
  return ROLES[s.role].postLabel || ZONE_LABELS[z[0]] || z[0];
}

/** The service duty this player earns by staying at their post. */
export function serviceDuty(s) {
  if (isPastor(s)) {
    return { id: 'preach', emoji: '🎙️', name: 'Minister at Grace Assembly', energy: 30, kinds: ['sunday', 'study', 'vigil'],
      run(h) { h.grow('faith', 4); h.grow('fame', 2); h.addMembers(2); return 'The senior pastor asked you to lead prayers. Some visitors asked about your church.' + h.reward(0, 8); } };
  }
  if (isMinister(s) && s.stage >= STAGE.worker && s.dept) {
    if (s.dept === 'evang') return EVANG_DUTY;
    return SERVICE_DUTIES[{ choir: 'choir', ushers: 'usher', sunday: 'children' }[s.dept]] || null;
  }
  return SERVICE_DUTIES[s.role] || null;
}

const EVANG_DUTY = { id: 'greet', emoji: '📢', name: 'Welcome & Follow-up Desk', energy: 25, kinds: ['sunday', 'study', 'vigil'],
  run(h) { h.grow('character', 3); h.s.souls += h.chance(0.4) ? 1 : 0; return 'You welcomed newcomers at the gate and took their numbers for follow-up.' + h.reward(0, 6); } };

/**
 * Is the player taking part in a service right now?
 * @param {object} s
 * @param {Loc} loc
 */
export function presence(s, loc = { zone: null }) {
  const zone = loc.zone || null;
  const inHall = HALL_ZONES.includes(zone);
  const post = postZones(s);
  const atPost = !!(post && zone && post.includes(zone));
  const congregation = inHall && !!(loc.seated || loc.kneeling || loc.praising);
  // Cleaning and similar meetings count anywhere on the church premises.
  const anywhere = !!(s.attendance?.anywhere && CHURCH_ZONES.includes(zone));
  return { inHall, atPost, congregation, present: congregation || atPost || anywhere };
}

/* ================================================================ helpers for run() */

/** The helper object handed to action, event and service `run` functions. */
export function helpers(s, env) {
  const { rng } = env;
  const fx = env.fx;
  const P = () => s.pastor;
  const h = {
    s, env, rng,
    get c() { return clock(s); },
    chance: (p) => rng() < p,
    rand: (a, b) => a + rng() * (b - a),
    randInt: (a, b) => Math.floor(a + rng() * (b - a + 1)),
    pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))],
    bonus: (tag) => (CHURCH_TYPES[s.tradition] && CHURCH_TYPES[s.tradition].bonus[tag]) || 1,
    /** Faith grows at half speed while carrying unconfessed sin. */
    grow(key, delta) {
      if (delta > 0 && s.convicted && key === 'faith') delta /= 2;
      s[key] = clamp((s[key] || 0) + delta, 0, 100);
    },
    gain(key, delta) { s[key] = clamp((s[key] || 0) + delta, 0, 100); },
    eat(n) { s.hunger = clamp(s.hunger + n, 0, 100); },
    reward(xp, points) { s.xp += xp; s.points += points; return points ? ` +${points}⭐` : ''; },
    /** A fall can always be repented of, but its character cost stays. */
    fall(sin, characterCost = 8) {
      s.convicted = true;
      s.falls += 1;
      h.grow('character', -characterCost);
      h.grow('faith', -5);
      fx.push({ type: 'audio:play', name: 'fail' });
      return `You fell into ${sin}. You feel convicted. "Confess & Repent" is on your Today tab.`;
    },
    sound(name) { fx.push({ type: 'audio:play', name }); },
    log(text) { addLog(s, text); },
    quality() { let q = 1 + P().choir * 0.1; for (const u of UPGRADES) if (P().owned[u.id]) q += u.q; return q; },
    faithMult: () => 0.6 + s.faith / 125,
    charMult: () => 0.5 + s.character / 100,
    fameMult: () => 1 + s.fame / 100,
    rent: () => Math.round(VENUES[P().venue].rent * P().rentMult),
    addMembers(n) {
      if (!P()) return 0;
      const before = P().members;
      P().members = clamp(Math.round(P().members + n), 0, VENUES[P().venue].cap);
      return P().members - before;
    },
    startQuiz(kind, n) { startQuiz(s, kind, n, env); },
    prayForRequest() { openPrompt(s, 'request', { i: (s.prayed + s.day) % SAMPLE_REQUESTS.length }, env); },
    chooseRole() { openPrompt(s, 'role', {}, env); },
    sleep() { sleep(s, env); },
    skip(minutes, label) { skipTime(s, minutes, env, { label }); },
  };
  return h;
}

export function addLog(s, text) {
  s.log.unshift({ T: s.T, day: s.day, text });
  if (s.log.length > 80) s.log.length = 80;
}

const snapshot = (s) => Object.fromEntries(DELTA_KEYS.map((k) => [k, s[k]]));
/** What changed between two snapshots, rounded for display. */
export function deltas(before, s) {
  const out = [];
  for (const k of DELTA_KEYS) {
    const d = (s[k] || 0) - (before[k] || 0);
    const r = k === 'naira' ? Math.round(d) : Math.round(d);
    if (r !== 0) out.push({ key: k, delta: r });
  }
  return out;
}

/* ================================================================ actions */

const energyOf = (s, a) => (typeof a.energy === 'function' ? a.energy(s) : a.energy || 0);
const costOf = (s, a) => (a.cost ? a.cost(s) : 0);
const nameOf = (s, a) => (typeof a.name === 'function' ? a.name(s) : a.name);

/** Visible to this player at all? */
export function isVisible(s, a) {
  return !a.when || !!a.when(s);
}

/**
 * Can the action be done right now? Returns `{ok: true}` or `{ok: false, code, reason}`.
 * Codes: over, hidden, done, time, where, energy, money, service, busy.
 */
export function canDo(s, id, env = makeEnv()) {
  const a = typeof id === 'string' ? ACTION_BY_ID[id] : id;
  if (!a) return { ok: false, code: 'hidden', reason: 'Unknown action' };
  if (s.over) return { ok: false, code: 'over', reason: 'This story has ended' };
  if (!isVisible(s, a)) return { ok: false, code: 'hidden', reason: 'Not for you right now' };
  if (a.once && s.doneToday[a.id]) return { ok: false, code: 'done', reason: 'Done today' };
  if (a.limit && (s.doneToday[a.id] || 0) >= a.limit) return { ok: false, code: 'done', reason: 'Done for today' };
  const c = clock(s);
  if (a.avail) {
    const r = a.avail(s, c);
    if (r !== true) return { ok: false, code: 'time', reason: typeof r === 'string' ? r : 'Not available now' };
  }
  if (a.zone && !a.zone.includes(env.loc?.zone)) {
    return { ok: false, code: 'where', reason: `Go to ${a.where || ZONE_LABELS[a.zone[0]] || a.zone[0]}` };
  }
  const e = energyOf(s, a);
  if (s.energy < e) return { ok: false, code: 'energy', reason: `Too tired (needs ⚡${e})` };
  const cost = costOf(s, a);
  if (cost && s.naira < cost) return { ok: false, code: 'money', reason: `Needs ${naira(cost)}` };
  if (a.away && env.mode !== 'shared' && !a.skipsService) {
    const clash = servicesBetween(s.T, s.T + a.away, schedule(s)).find((x) => !s.doneToday[x.kind]);
    if (clash) return { ok: false, code: 'service', reason: clash.start <= s.T ? `${clash.name} is on now` : `${clash.name} starts in ${countdown(clash.start - s.T)}` };
  }
  if (s.shift && s.shift.id !== a.id) return { ok: false, code: 'busy', reason: 'Finish your current task first' };
  if (s.activeEvent || s.exam) return { ok: false, code: 'busy', reason: 'Answer the open question first' };
  return { ok: true };
}

/**
 * A render-ready view of an action for the panel.
 * @returns {{id, emoji, name, desc, energy, cost, group, shady, kneel, stay, away, where, ok, code, reason, done}}
 */
export function actionView(s, a, env = makeEnv()) {
  const c = clock(s);
  const st = canDo(s, a, env);
  return {
    id: a.id, emoji: a.emoji, name: nameOf(s, a), desc: a.desc(s, c), group: a.group,
    energy: energyOf(s, a), cost: costOf(s, a), shady: !!a.shady, kneel: !!a.kneel,
    stay: a.stay || 0, away: a.away || 0, where: a.zone ? (a.where || ZONE_LABELS[a.zone[0]]) : null,
    ok: st.ok, code: st.code || null, reason: st.reason || null,
    done: (a.once && !!s.doneToday[a.id]) || (a.limit && (s.doneToday[a.id] || 0) >= a.limit),
    active: s.shift?.id === a.id,
  };
}

/** All actions visible to the player, as views. */
export function listActions(s, env = makeEnv(), group = null) {
  return ACTIONS.filter((a) => isVisible(s, a) && (!group || a.group === group)).map((a) => actionView(s, a, env));
}

/**
 * Do an action now. Kneel actions in a linked 3D world ask the player to kneel first
 * (`{pending: 'kneel'}`); stay actions start a shift (`{pending: 'shift'}`).
 * @returns {{ok: boolean, text?: string, reason?: string, code?: string, deltas?: object[], pending?: string}}
 */
export function doAction(s, id, env, { direct = false } = {}) {
  const a = ACTION_BY_ID[id];
  const st = canDo(s, a || id, env);
  if (!st.ok) return st;
  if (!direct && a.kneel && env.linked) {
    env.fx.push({ type: 'request', action: 'kneel' });
    return { ok: true, pending: 'kneel', text: 'Kneel and pray. Stay on your knees for a while.' };
  }
  if (!direct && a.stay) {
    s.shift = { id: a.id, need: a.stay, done: 0, zone: a.zone || null };
    env.fx.push({ type: 'toast', text: `${a.emoji} ${nameOf(s, a)} started. Stay at ${a.where || 'this place'}.` });
    return { ok: true, pending: 'shift' };
  }
  return runAction(s, a, env);
}

/** Apply an action's costs and effects (no checks). */
export function runAction(s, a, env) {
  const before = snapshot(s);
  s.energy = clamp(s.energy - energyOf(s, a), 0, 100);
  const cost = costOf(s, a);
  if (cost) s.naira -= cost;
  if (a.once) s.doneToday[a.id] = true;
  if (a.limit) s.doneToday[a.id] = (s.doneToday[a.id] || 0) + 1;
  const h = helpers(s, env);
  const out = a.run(h);
  const text = typeof out === 'string' ? out : out?.text || null;
  if (out && typeof out === 'object' && out.modal) env.fx.push({ type: 'modal', modal: out.modal });
  if (a.away && env.mode !== 'shared') {
    skipTime(s, a.away, env, { label: a.mission ? `${a.mission.place}, ${countdown(a.away)} later` : `${countdown(a.away)} later` });
  }
  const d = deltas(before, s);
  if (text) {
    addLog(s, text);
    env.fx.push({ type: 'toast', text, deltas: d, emoji: a.emoji });
  }
  s.naira = Math.round(s.naira);
  checkCollapse(s, env);
  return { ok: true, text, deltas: d };
}

/* ================================================================ time */

/** Needs and slow drifts for `minutes` of in-game time. */
export function passTime(s, minutes, { asleep = false } = {}) {
  if (minutes <= 0) return;
  const hrs = minutes / 60;
  s.hunger = clamp(s.hunger - (asleep ? 1 : 2) * hrs, 0, 100);
  if (!asleep) s.energy = clamp(s.energy - (1 + (s.hunger < 10 ? 2 : 0)) * hrs, 0, 100);
  s.faith = clamp(s.faith - (1.5 / 24) * hrs, 0, 100);
  s.word = clamp(s.word - (0.5 / 24) * hrs, 0, 100);
  if (s.convicted) s.character = clamp(s.character - (1 / 24) * hrs, 0, 100);
  if (isPastor(s)) s.fame = clamp(s.fame - (0.5 / 24) * hrs, 0, 100);
}

/** Move the clock forward, running the end of each day crossed. */
export function advance(s, minutes, env, { asleep = false } = {}) {
  let left = minutes;
  while (left > 1e-9 && !s.over) {
    const toMidnight = DAY - minuteOfDay(s.T);
    const step = Math.min(left, toMidnight);
    passTime(s, step, { asleep });
    s.T += step;
    left -= step;
    if (step === toMidnight) {
      s.T = Math.round(s.T); // land exactly on midnight
      endDay(s, env);
    }
  }
}

/**
 * Off the map for a while (work, missions, sleep). The clock jumps in local mode.
 * Services that start during the skip are missed (no credit).
 */
export function skipTime(s, minutes, env, { label = 'Later…', asleep = false, to = null } = {}) {
  if (env.mode === 'shared' || minutes <= 0) return;
  if (s.attendance) endService(s, env, { silent: true });
  s.shift = null;
  const missed = servicesBetween(s.T, s.T + minutes, schedule(s)).filter((x) => x.start >= s.T);
  advance(s, minutes, env, { asleep });
  for (const m of missed) addLog(s, `You missed the ${m.name}.`);
  env.fx.push({ type: 'skip', minutes, label, to });
}

/** Sleep at home until 6am (local mode) or rest (shared mode). */
export function sleep(s, env) {
  if (env.mode === 'shared') {
    if (s.doneToday.rest) { env.fx.push({ type: 'toast', text: 'You already rested today.' }); return; }
    s.doneToday.rest = true;
    const extra = restBonus(s);
    s.energy = clamp(s.energy + 50 + extra, 0, 100);
    env.fx.push({ type: 'toast', text: `You took a good rest. +${50 + extra} energy.${extra ? ' Your furniture helped.' : ''}`, emoji: '🛏️' });
    return;
  }
  const m = minuteOfDay(s.T);
  const minutes = m < 6 * 60 ? 6 * 60 - m : DAY - m + 6 * 60;
  skipTime(s, minutes, env, { label: 'Good morning!', asleep: true, to: 'home' });
  s.energy = s.hunger < 25 ? 70 + restBonus(s) : 100;
  if (s.items.bike) s.energy = clamp(s.energy + 10, 0, 100);
  const c = clock(s);
  env.fx.push({ type: 'toast', text: `Good morning! It's ${c.weekdayName}, ${c.time}.${s.hunger < 25 ? ' You went to bed hungry, so you have less energy. Eat something!' : ''}`, emoji: '🌅' });
}

/**
 * Real-time step.
 * @param {object} s
 * @param {number} dtMin in-game minutes
 * @param {Env} env
 */
export function tick(s, dtMin, env) {
  if (s.over || dtMin <= 0) return;
  const prevT = s.T;
  advance(s, dtMin, env);
  if (s.over) return;
  const loc = env.loc || { zone: null };

  // Bells before services.
  const next = nextService(prevT, schedule(s));
  if (next) {
    const before = next.start - prevT;
    const after = next.start - s.T;
    if (before > 15 && after <= 15) {
      env.fx.push({ type: 'audio:play', name: 'bell' });
      env.fx.push({ type: 'toast', text: `${next.def.emoji} ${next.name} starts in 15 minutes.`, tone: 'info' });
    }
  }

  // Services: start, presence, end.
  const cur = serviceAt(s.T, schedule(s));
  if (s.attendance && (!cur || cur.start !== s.attendance.start)) endService(s, env);
  if (cur && !s.attendance) startService(s, cur, env);
  if (s.attendance) {
    const p = presence(s, loc);
    if (p.present) s.attendance.present += dtMin;
    if (p.atPost) s.attendance.post += dtMin;
    const a = s.attendance;
    if (!a.musicOff && Number.isFinite(a.music) && s.T - a.start >= a.music) {
      a.musicOff = true;
      env.fx.push({ type: 'audio:music', track: 'none' });
    }
  }

  // Shifts (stay at a place for a while).
  if (s.shift) {
    const a = ACTION_BY_ID[s.shift.id];
    if (!a) s.shift = null;
    else if (!s.shift.zone || s.shift.zone.includes(loc.zone)) {
      s.shift.done += dtMin;
      if (s.shift.done >= s.shift.need) {
        s.shift = null;
        if (s.energy < energyOf(s, a)) env.fx.push({ type: 'toast', text: 'You are too tired to finish. Rest first.' });
        else runAction(s, a, env);
      }
    }
  }

  // Prayer by kneeling.
  if (loc.kneeling) {
    s.kneel = (s.kneel || 0) + dtMin;
    if (s.kneel >= KNEEL_MINUTES) {
      s.kneel = 0;
      const id = kneelTarget(s, loc, env);
      if (id) runAction(s, ACTION_BY_ID[id], env);
      else {
        s.kneelDone = true;
        if (s.energy < 10) env.fx.push({ type: 'toast', text: 'You are too tired to pray long. Eat and rest first.', tone: 'warn' });
      }
    }
  } else {
    s.kneel = 0;
    s.kneelDone = false;
  }

  scheduleEvents(s, prevT, env);
  deliverEvents(s, env);
}

/** Which prayer a kneel session counts as, or null when all are done today. */
export function kneelTarget(s, loc, env) {
  const zone = loc.zone;
  const order = ['intercede', 'prayroom', 'pray'];
  for (const id of order) {
    const a = ACTION_BY_ID[id];
    if (canDo(s, a, { ...env, loc: { ...loc, zone } }).ok) return id;
  }
  return null;
}

/** Current progress to show in the HUD (kneeling > shift > service). */
export function progress(s, loc = { zone: null }) {
  if (loc.kneeling && s.kneel > 0 && !s.kneelDone) {
    return { kind: 'kneel', emoji: '🙏', label: 'Praying…', value: clamp(s.kneel / KNEEL_MINUTES, 0, 1) };
  }
  if (s.shift) {
    const a = ACTION_BY_ID[s.shift.id];
    const here = !s.shift.zone || s.shift.zone.includes(loc.zone);
    return { kind: 'shift', emoji: a.emoji, label: nameOf(s, a), value: clamp(s.shift.done / s.shift.need, 0, 1), hint: here ? null : `Go back to ${a.where}` };
  }
  if (s.attendance) {
    const a = s.attendance;
    const p = presence(s, loc);
    const dur = a.end - a.start;
    const value = clamp(a.present / dur, 0, 1);
    const post = postLabel(s);
    let hint = null;
    if (!p.present) hint = a.anywhere ? 'Go to the church compound' : post ? `Serve at ${post}, or sit in the hall` : (p.inHall ? 'Sit down (C) in a pew' : 'Go to the church hall and sit');
    return { kind: 'service', emoji: a.emoji, label: a.name, value, goal: a.credit, hint, present: p.present };
  }
  return null;
}

/* ================================================================ services */

export function startService(s, svc, env) {
  const music = svc.def.music > 0;
  s.attendance = { kind: svc.kind, name: svc.name, emoji: svc.def.emoji, start: svc.start, end: svc.end, present: 0, post: 0, credit: svc.def.credit, music: svc.def.music, musicOff: !music, anywhere: !!svc.def.anywhere };
  env.fx.push({ type: 'service:start', kind: svc.kind, name: svc.name });
  env.fx.push({ type: 'audio:play', name: 'bell' });
  if (music) env.fx.push({ type: 'audio:music', track: 'worship' });
  const where = svc.def.anywhere ? 'the church compound' : postLabel(s);
  env.fx.push({ type: 'toast', text: `${svc.def.emoji} ${svc.name} has started. ${where ? `Be at ${where}.` : 'Find a seat in the hall.'}`, tone: 'info' });
  // A role moment during the service (delivered later, only if you are there).
  if (!isPastor(s) || svc.kind === 'sunday') {
    const pool = eventPool(s, 'service-start');
    if (pool.length && env.rng() < 0.45) {
      const e = pool[Math.floor(env.rng() * pool.length)];
      s.pending.push({ id: e.id, dueT: svc.start + 15 + Math.floor(env.rng() * 30), needPresence: true });
    }
  }
}

/** Close the running service and give credit for attendance and duty. */
export function endService(s, env, { silent = false } = {}) {
  const a = s.attendance;
  if (!a) return;
  s.attendance = null;
  const dur = a.end - a.start;
  const ratio = dur > 0 ? a.present / dur : 0;
  const postRatio = dur > 0 ? a.post / dur : 0;
  env.fx.push({ type: 'service:end', kind: a.kind, name: a.name, ratio });
  if (!a.musicOff) env.fx.push({ type: 'audio:music', track: 'none' });
  if (silent) return;
  const h = helpers(s, env);
  const before = snapshot(s);
  const lines = [];
  let attended = false;
  if (ratio >= a.credit && !s.doneToday[a.kind]) {
    const cr = SERVICE_CREDIT[a.kind];
    s.energy = clamp(s.energy - cr.energy, 0, 100);
    s.doneToday[a.kind] = true;
    lines.push(cr.run(h));
    attended = true;
  }
  const duty = serviceDuty(s);
  if (duty && duty.kinds.includes(a.kind) && postRatio >= a.credit && !s.doneToday[duty.id]) {
    s.energy = clamp(s.energy - duty.energy, 0, 100);
    s.doneToday[duty.id] = true;
    lines.push(`${duty.emoji} ${duty.run(h)}`);
    attended = true;
  }
  if (attended) {
    const text = `${a.emoji} ${a.name} ended. ${lines.join(' ')}`;
    addLog(s, text);
    env.fx.push({ type: 'toast', text, deltas: deltas(before, s), tone: 'good' });
    env.fx.push({ type: 'audio:play', name: 'success' });
    const pool = eventPool(s, 'service-end');
    if (pool.length && env.rng() < 0.4) s.pending.push({ id: pool[Math.floor(env.rng() * pool.length)].id, dueT: s.T + 2 });
  } else if (!s.doneToday[a.kind]) {
    const pct = Math.round(ratio * 100);
    const text = pct > 0
      ? `${a.emoji} ${a.name} ended. You were only there for ${pct}% of it, so it doesn't count.`
      : `${a.emoji} ${a.name} ended without you.`;
    addLog(s, text);
    env.fx.push({ type: 'toast', text, tone: 'warn' });
  }
  checkCollapse(s, env);
}

/* ================================================================ events */

function eventPool(s, trigger) {
  const c = clock(s);
  return EVENTS.filter((e) => e.trigger === trigger && (!e.cond || e.cond(s, c)));
}

/** Random daytime events, Sunday-morning temptations. Runs once per in-game hour. */
function scheduleEvents(s, prevT, env) {
  if (Math.floor(prevT / 60) === Math.floor(s.T / 60)) return;
  if (s.activeEvent || s.pending.length || s.attendance || s.exam) return;
  const c = clock(s);
  if (c.weekdayShort === 'Sun' && c.hour >= 7 && c.hour <= 8) {
    const pool = eventPool(s, 'sunday-morning');
    if (pool.length && env.rng() < 0.3) { queue(s, pool[0].id, s.T); return; }
  }
  if (c.hour < 7 || c.hour > 22) return;
  if (s.T - s.lastEventT < 300 || s.eventsToday >= 3) return;
  if (env.rng() >= 0.1) return;
  const tempts = eventPool(s, 'random').filter((e) => e.tempt);
  const life = eventPool(s, 'random').filter((e) => !e.tempt);
  const pool = env.rng() < 0.5 ? (tempts.length ? tempts : life) : (life.length ? life : tempts);
  if (pool.length) queue(s, pool[Math.floor(env.rng() * pool.length)].id, s.T);
}

function queue(s, id, dueT, extra = {}) {
  if (s.pending.some((p) => p.id === id)) return;
  s.pending.push({ id, dueT, ...extra });
}

/** Turn the next due event into the active dialog. */
function deliverEvents(s, env) {
  if (s.activeEvent || s.exam || s.over) return;
  const i = s.pending.findIndex((p) => p.dueT <= s.T);
  if (i < 0) return;
  const [p] = s.pending.splice(i, 1);
  const e = EVENT_BY_ID[p.id];
  if (!e) return;
  if (p.needPresence) {
    const pr = presence(s, env.loc || { zone: null });
    if (!pr.present && !pr.atPost) return; // you were not there, the moment passed
  }
  if (e.cond && !e.cond(s, clock(s))) return;
  activateEvent(s, e, env);
}

/** Show an event now (used by delivery and special triggers). */
export function activateEvent(s, e, env) {
  const h = helpers(s, env);
  s.activeEvent = { kind: 'event', id: e.id, emoji: e.emoji, title: e.title, text: e.text(h), tempt: !!e.tempt, choices: e.choices.map((c) => c.label) };
  s.lastEventT = s.T;
  s.eventsToday += 1;
  env.fx.push({ type: 'event', event: s.activeEvent });
  if (e.tempt) env.fx.push({ type: 'audio:play', name: 'thunder' });
}

/* ---------------------------------------------------------------- prompts (choices the player asked for) */

const PROMPTS = {
  role: {
    build(s) {
      const ids = Object.keys(ROLES).filter((id) => id !== s.role);
      return {
        emoji: '🔄', title: 'Where will you serve?', text: 'Your rank in the new role starts from the beginning.',
        choices: [...ids.map((id) => ({ label: `${ROLES[id].emoji} ${ROLES[id].name}`, value: id })), { label: 'Stay where I am', value: null }],
      };
    },
    run(s, value, h) {
      if (!value || !ROLES[value]) return null;
      s.role = value; s.rank = 0; s.xp = 0;
      h.env.fx.push({ type: 'role', role: value });
      return `You now serve as: ${ROLES[value].name}.`;
    },
  },
  dept: {
    build() {
      return { emoji: '🧤', title: 'Become a worker', text: 'Which department will you serve in?', choices: DEPARTMENTS.map((d) => ({ label: `${d.emoji} ${d.name}`, value: d.id })) };
    },
    run(s, value) {
      const d = DEPARTMENTS.find((x) => x.id === value);
      if (!d) return null;
      s.stage = STAGE.worker; s.dept = d.id;
      return `You joined the ${d.name} department. You are now a church worker!`;
    },
  },
  church: {
    build(s) {
      const names = [`${s.name}'s House Fellowship`, 'Ebenezer Chapel, Yaba', 'Light of Zion Assembly'];
      return { emoji: '🕊️', title: 'Name your church', text: 'The elders will lay hands on you. What will your new church be called?', choices: names.map((n) => ({ label: n, value: n })) };
    },
    run(s, value, h) {
      s.stage = STAGE.pastor;
      s.pastor = newPastorChurch(value);
      h.env.fx.push({ type: 'modal', modal: { emoji: '🕊️', title: 'Ordained!', text: `The elders laid hands on you and prayed. You are now Pastor ${s.name}!\n\nYou start ${s.pastor.church} in your living room with 7 people. Feed the flock, and watch out for the love of money.\n\n${verseText(V.growth)}`, ok: 'Here I am, Lord. Send me.' } });
      h.sound('success');
      return `You were ordained and planted ${s.pastor.church}!`;
    },
  },
  request: {
    build(s, data) {
      const [who, text] = SAMPLE_REQUESTS[data.i % SAMPLE_REQUESTS.length];
      return { emoji: '🤲', title: `${who}'s request`, text: `"${text}"\n\n${verseText(V.prayer)}`, choices: [{ label: 'Pray for them', value: who }, { label: 'Not now', value: null }] };
    },
    run(s, value, h) {
      if (!value) { s.doneToday.prayfor = Math.max(0, (s.doneToday.prayfor || 1) - 1); s.energy = clamp(s.energy + 8, 0, 100); return null; }
      s.prayed += 1;
      h.grow('faith', 2); h.grow('character', 1);
      h.sound('pray');
      return `You prayed for ${value}.` + h.reward(s.role === 'prayer' ? 3 : 1, 2);
    },
  },
};

export function openPrompt(s, kind, data, env) {
  const p = PROMPTS[kind];
  const b = p.build(s, data);
  s.activeEvent = { kind: 'prompt', id: kind, data, emoji: b.emoji, title: b.title, text: b.text, tempt: false, choices: b.choices.map((c) => c.label), values: b.choices.map((c) => c.value) };
  env.fx.push({ type: 'event', event: s.activeEvent });
}

/**
 * Answer the active event or prompt.
 * @returns {{ok: boolean, text?: string, deltas?: object[]}}
 */
export function choose(s, index, env) {
  const ev = s.activeEvent;
  if (!ev) return { ok: false, reason: 'Nothing to answer' };
  const i = Math.max(0, Math.min(ev.choices.length - 1, index | 0));
  s.activeEvent = null;
  const before = snapshot(s);
  const h = helpers(s, env);
  let text = null;
  if (ev.kind === 'prompt') {
    text = PROMPTS[ev.id].run(s, ev.values[i], h);
  } else {
    const e = EVENT_BY_ID[ev.id];
    const c = e?.choices[i];
    text = c?.run ? c.run(h) : null;
    if (text) text = `${ev.title}: ${text}`;
  }
  const d = deltas(before, s);
  if (text) {
    addLog(s, `${ev.emoji} ${text}`);
  }
  s.naira = Math.round(s.naira);
  checkCollapse(s, env);
  return { ok: true, text, deltas: d, title: ev.title, emoji: ev.emoji };
}

/* ================================================================ Bible quiz and exams */

/** Shuffle with the env rng (Fisher–Yates). */
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Make `n` questions with shuffled options. */
export function makeQuiz(n, rng) {
  return shuffle(QUIZ, rng).slice(0, n).map(([q, right, ...wrong]) => {
    const options = shuffle([right, ...wrong], rng);
    return { q, options, answer: options.indexOf(right) };
  });
}

export function startQuiz(s, kind, n, env) {
  s.exam = { kind, questions: makeQuiz(n, env.rng), i: 0, score: 0, answers: [], semester: s.semester };
  env.fx.push({ type: 'quiz', quiz: s.exam });
}

/**
 * Answer the current question. When the last one is answered the result is applied.
 * @returns {{ok, correct, right, done, result?}}
 */
export function answerQuiz(s, option, env) {
  const ex = s.exam;
  if (!ex) return { ok: false };
  const q = ex.questions[ex.i];
  const correct = option === q.answer;
  if (correct) ex.score += 1;
  ex.answers.push(option);
  ex.i += 1;
  const out = { ok: true, correct, right: q.options[q.answer], done: ex.i >= ex.questions.length };
  if (out.done) out.result = finishQuiz(s, env);
  return out;
}

function finishQuiz(s, env) {
  const ex = s.exam;
  s.exam = null;
  const n = ex.questions.length;
  const before = snapshot(s);
  const h = helpers(s, env);
  let title; let text; let emoji;
  if (ex.kind === 'quiz') {
    const pts = ex.score * 3;
    s.points += pts;
    h.grow('word', ex.score);
    emoji = ex.score === n ? '🏆' : ex.score ? '📖' : '🙈';
    title = ex.score === n ? 'Perfect score!' : `${ex.score} of ${n} right`;
    text = ex.score ? `Bible quiz: ${ex.score}/${n}. +${pts}⭐, +${ex.score} word.` : 'No correct answers today. Read your Bible and try again tomorrow.';
  } else if (ex.score >= 4) {
    if (s.semester >= 3) {
      s.stage = STAGE.graduate;
      emoji = '🎓'; title = 'Graduated!';
      text = `You scored ${ex.score}/${n} and completed Bible School!\n\nNext: grow in faith and character to be ordained.`;
    } else {
      s.semester += 1;
      emoji = '✅'; title = 'Passed!';
      text = `You scored ${ex.score}/${n}. On to Semester ${s.semester}.`;
    }
    h.sound('success');
  } else {
    h.grow('word', -5);
    emoji = '📖'; title = 'Not this time';
    text = `You scored ${ex.score}/${n}. You need 4 to pass.\nKeep studying and try again tomorrow.\n\n${verseText(V.study)}`;
  }
  addLog(s, ex.kind === 'quiz' ? text : `Semester ${ex.semester} exam: ${ex.score}/${n}. ${title}`);
  return { kind: ex.kind, score: ex.score, total: n, emoji, title, text, deltas: deltas(before, s) };
}

/* ================================================================ milestones */

/**
 * The next step on this player's journey.
 * @returns {null | {label, emoji, reqs: [string, boolean][], ready: boolean, can: boolean}}
 */
export function milestone(s) {
  const m = isMinister(s) ? ministerMilestone(s) : roleMilestone(s);
  if (!m) return null;
  m.ready = m.reqs.every((r) => r[1]);
  m.can = m.ready && !!m.go && !s.over;
  return m;
}

function baptismMilestone(s) {
  return {
    label: 'Get baptized', emoji: '💧',
    reqs: [[`Attend 2 services or vigils (${Math.min(s.services, 2)}/2)`, s.services >= 2], ['Faith 30+', s.faith >= 30]],
    go: (h) => {
      s.stage = 1;
      s.points += 20;
      h.sound('success');
      h.env.fx.push({ type: 'modal', modal: { emoji: '💧', title: 'Baptized!', text: `You went down into the water and came up a new creation. The whole church rejoiced! +20⭐\n\n${verseText(V.baptism)}`, ok: 'Halleluyah!' } });
      return 'You were baptized!';
    },
  };
}

function roleMilestone(s) {
  const r = ROLES[s.role];
  if (s.role !== 'visitor' && s.stage === 0) return baptismMilestone(s);
  if (s.rank >= 2) return null;
  const next = s.rank + 1;
  const need = RANK_XP[next];
  const reqs = [[`Experience ${Math.min(Math.round(s.xp), need)}/${need}`, s.xp >= need]];
  if (next === 1) reqs.push(['Faith 40+', s.faith >= 40], ['Character 50+', s.character >= 50]);
  else reqs.push(['Faith 60+', s.faith >= 60], ['Character 70+', s.character >= 70], ['No unconfessed sin', !s.convicted]);
  return {
    label: `Become ${r.ranks[next]}`, emoji: r.emoji, reqs,
    go: (h) => {
      s.rank = next;
      s.points += 25 * next;
      h.sound('success');
      if (s.role === 'visitor' && next === 2) {
        s.role = 'worshipper';
        s.rank = 1;
        h.env.fx.push({ type: 'role', role: 'worshipper' });
        h.env.fx.push({ type: 'modal', modal: { emoji: '🎉', title: 'Welcome to the family!', text: `You are now a member of ${s.church}. You can serve in any department with "Change Role".\n\n${verseText(V.glad)}`, ok: 'Halleluyah!' } });
      } else {
        h.env.fx.push({ type: 'modal', modal: { emoji: r.emoji, title: 'Promoted!', text: `You are now ${r.ranks[next]}. +${25 * next}⭐\n\n${verseText(r.verse || V.heartily)}`, ok: 'To God be the glory' } });
      }
      return `Promoted to ${title(s)}.`;
    },
  };
}

function ministerMilestone(s) {
  switch (s.stage) {
    case 0: return baptismMilestone(s);
    case 1: return {
      label: 'Join a department', emoji: '🧤',
      reqs: [[`Attend 6 services or vigils (${Math.min(s.services, 6)}/6)`, s.services >= 6], ['Faith 45+', s.faith >= 45], ['Character 50+', s.character >= 50]],
      go: (h) => { openPrompt(s, 'dept', {}, h.env); return null; },
    };
    case 2: return {
      label: 'Enroll in Bible School', emoji: '🎓',
      reqs: [['Faith 55+', s.faith >= 55], ['Word 30+', s.word >= 30], [`Save ${naira(BIBLE_SCHOOL_FEE)} for fees`, s.naira >= BIBLE_SCHOOL_FEE]],
      go: (h) => {
        s.naira -= BIBLE_SCHOOL_FEE;
        s.stage = STAGE.student;
        h.env.fx.push({ type: 'modal', modal: { emoji: '🎓', title: 'Welcome to Bible School!', text: `Three semesters stand between you and graduation. Attend lectures and pass your exams.\n\n${verseText(V.study)}`, ok: 'Let\'s study' } });
        return 'You enrolled in Bible School.';
      },
    };
    case 3: return {
      label: `Semester ${s.semester} of 3`, emoji: '📝',
      reqs: [[`Word ${examNeed(s.semester)}+ to write the exam`, s.word >= examNeed(s.semester)], ['Pass the exam (Bible school, below)', false]],
      go: null,
    };
    case 4: return {
      label: 'Be ordained', emoji: '🕊️',
      reqs: [['Faith 70+', s.faith >= 70], ['Character 70+', s.character >= 70], ['No unconfessed sin', !s.convicted]],
      go: (h) => { openPrompt(s, 'church', {}, h.env); return null; },
    };
    default: return null;
  }
}

export function completeMilestone(s, env) {
  const m = milestone(s);
  if (!m || !m.can || s.activeEvent || s.exam) return { ok: false, reason: 'Not ready yet' };
  const h = helpers(s, env);
  const text = m.go(h);
  if (text) { addLog(s, text); env.fx.push({ type: 'toast', text, tone: 'good' }); }
  checkCollapse(s, env);
  return { ok: true, text };
}

/* ================================================================ shop, food, prayer wall */

export function buyItem(s, id, env) {
  const it = SHOP.find((x) => x.id === id);
  if (!it || s.items[id] || s.over) return { ok: false, reason: 'Not available' };
  if (it.naira && s.naira < it.naira) return { ok: false, reason: `Needs ${naira(it.naira)}` };
  if (it.points && s.points < it.points) return { ok: false, reason: `Needs ${it.points}⭐` };
  if (it.naira) s.naira -= it.naira;
  if (it.points) s.points -= it.points;
  s.items[id] = true;
  addLog(s, `Bought ${it.name} ${it.emoji}`);
  env.fx.push({ type: 'audio:play', name: 'coin' });
  env.fx.push({ type: 'toast', text: `${it.emoji} ${it.name} is yours!`, tone: 'good' });
  return { ok: true };
}

/** Buy food from a vendor in the world (world interactable id, e.g. 'buka', 'canteen'). */
export function buyFood(s, vendor, env) {
  const f = FOOD[vendor] || FOOD.buka;
  if (s.over) return { ok: false, reason: 'This story has ended' };
  if (s.hunger >= 97 && vendor !== 'buy-water') return { ok: false, reason: 'You are full' };
  if (s.naira < f.naira) return { ok: false, reason: `Needs ${naira(f.naira)}` };
  const before = snapshot(s);
  s.naira -= f.naira;
  s.hunger = clamp(s.hunger + f.hunger, 0, 100);
  s.energy = clamp(s.energy + f.energy, 0, 100);
  const text = `${f.name} from ${f.where}. ${naira(f.naira)}.`;
  env.fx.push({ type: 'audio:play', name: 'coin' });
  env.fx.push({ type: 'toast', text, deltas: deltas(before, s), emoji: f.emoji });
  return { ok: true, text };
}

export function postRequest(s, text, env) {
  const t = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  if (!t) return { ok: false, reason: 'Write your request first' };
  s.requests.unshift({ id: `${Math.round(s.T)}-${s.requests.length}-${Math.floor(env.rng() * 1e6)}`, text: t, day: s.day, answered: false });
  if (s.requests.length > 20) s.requests.length = 20;
  addLog(s, 'You posted a prayer request.');
  env.fx.push({ type: 'toast', text: 'Request posted. Keep trusting God.', emoji: '🙏' });
  return { ok: true };
}

export function markAnswered(s, id, env) {
  const r = s.requests.find((x) => x.id === id);
  if (!r || r.answered) return { ok: false };
  r.answered = true;
  s.testimonies += 1;
  s.faith = clamp(s.faith + 6, 0, 100);
  s.points += 15;
  addLog(s, `Testimony! God answered: "${r.text}"`);
  env.fx.push({ type: 'audio:play', name: 'success' });
  env.fx.push({ type: 'modal', modal: { emoji: '🎉', title: 'Testimony!', text: `"${r.text}"\n\nGod answered your prayer. Share your testimony and encourage someone. +15⭐, +6 faith`, ok: 'Thank You, Jesus' } });
  return { ok: true };
}

/* ---------------------------------------------------------------- pastor's church */

export const choirCost = (s) => 20000 * (s.pastor.choir + 1) ** 2;

export function buyUpgrade(s, id, env) {
  const u = UPGRADES.find((x) => x.id === id);
  const P = s.pastor;
  if (!u || !P || s.over || P.owned[id] || s.naira < u.cost) return { ok: false };
  s.naira -= u.cost;
  P.owned[id] = true;
  if (u.fame) s.fame = clamp(s.fame + u.fame, 0, 100);
  if (u.character) s.character = clamp(s.character + u.character, 0, 100);
  addLog(s, `Bought: ${u.name} ${u.emoji}`);
  env.fx.push({ type: 'toast', text: u.vanity ? `${u.emoji} ${u.name}! The congregation is whispering...` : `${u.emoji} ${u.name} dedicated to God's work!` });
  checkCollapse(s, env);
  return { ok: true };
}

export function upgradeChoir(s, env) {
  const P = s.pastor;
  if (!P || s.over || P.choir >= 5 || s.naira < choirCost(s)) return { ok: false };
  s.naira -= choirCost(s);
  P.choir += 1;
  addLog(s, `Choir grew to level ${P.choir}`);
  env.fx.push({ type: 'toast', text: `🎶 Choir is now level ${P.choir}` });
  return { ok: true };
}

export function moveVenue(s, env) {
  const P = s.pastor;
  const next = P && VENUES[P.venue + 1];
  if (!next || s.over || s.naira < next.cost) return { ok: false };
  s.naira -= next.cost;
  P.venue += 1;
  P.rentMult = 1;
  P.missedRent = 0;
  s.fame = clamp(s.fame + 5, 0, 100);
  addLog(s, `Moved into a ${next.name} ${next.emoji}! Dedication service held.`);
  env.fx.push({ type: 'modal', modal: { emoji: next.emoji, title: 'New building!', text: `${P.church} has moved into a ${next.name}.\nCapacity: ${num(next.cap)} members.\nWeekly rent: ${naira(next.rent)}.`, ok: 'To God be the glory' } });
  return { ok: true };
}

export function openBranch(s, id, env) {
  const b = BRANCHES.find((x) => x.id === id);
  const P = s.pastor;
  if (!b || !P || s.over || P.branches[id] || P.venue < 4 || s.naira < b.cost) return { ok: false };
  s.naira -= b.cost;
  P.branches[id] = true;
  s.fame = clamp(s.fame + 6, 0, 100);
  addLog(s, `Opened a branch in ${b.name} ${b.flag}!`);
  env.fx.push({ type: 'modal', modal: { emoji: b.flag, title: `${P.church}, ${b.name}`, text: `A new branch has been planted in ${b.name}. A pastor you trained will lead it.\n\n${verseText(V.baptism)}`, ok: 'Glory to God' } });
  return { ok: true };
}

/* ================================================================ end of day, collapse */

/**
 * Character at zero or repeated fraud: EFCC for fraudsters and pastors, church
 * discipline for everyone else. Returns true when something happened.
 */
export function checkCollapse(s, env) {
  if (s.over) return false;
  if (s.frauds >= 3 && env.rng() < 0.5) {
    gameOver(s, env, { id: 'efcc', emoji: '🚓', title: 'EFCC dey come!', text: `EFCC traced the "client" money to ${s.name}'s account. Arrested on day ${s.day}.\n\n${verseText(V.reap)}` });
    return true;
  }
  if (s.character > 0) return false;
  if (isPastor(s)) {
    gameOver(s, env, { id: 'efcc', emoji: '🚓', title: 'EFCC dey come!', text: `After ${s.day} days, EFCC invited Pastor ${s.name} "for questioning" over the oil, the seeds and the money. ${s.pastor.church} is in the newspapers for the wrong reasons.\n\n${verseText(V.reap)}` });
    return true;
  }
  s.character = 15;
  s.energy = 0;
  addLog(s, 'The elders placed you under church discipline.');
  env.fx.push({ type: 'modal', modal: { emoji: '🧑🏾‍⚖️', title: 'Church discipline', text: `The elders called you in. Your conduct has become a stumbling block. You are suspended from your duties for a while.\n\nIt is not the end. Repent, rebuild, and keep walking.\n\n${verseText(V.confess)}`, ok: 'I accept correction' } });
  return true;
}

function gameOver(s, env, ending) {
  s.over = true;
  s.ending = ending;
  s.activeEvent = null;
  s.pending = [];
  s.shift = null;
  addLog(s, `${ending.emoji} ${ending.title}`);
  env.fx.push({ type: 'audio:play', name: 'fail' });
  env.fx.push({ type: 'over', ending });
}

/** Midnight: streaks, the pastor's books, grace, and the night's temptation. */
export function endDay(s, env) {
  if (s.over) return;
  const wasSunday = weekdayOf(s.T - 1) === 6;
  const report = [];
  const h = helpers(s, env);

  if (isPastor(s)) {
    const P = s.pastor;
    const rent = h.rent();
    if (wasSunday && rent > 0) {
      if (s.naira >= rent) { s.naira -= rent; P.missedRent = 0; report.push(`Paid weekly rent: ${naira(rent)}.`); }
      else {
        P.missedRent += 1;
        report.push(`Couldn't pay rent (${naira(rent)}). Landlord warning ${P.missedRent}/3.`);
        if (P.missedRent >= 3) {
          P.venue = Math.max(0, P.venue - 1); P.missedRent = 0; P.rentMult = 1;
          h.addMembers(0);
          report.push(`You had to move back to a ${VENUES[P.venue].name}. God is still faithful.`);
        }
      }
    }
    if (P.owned.generator) { const fuel = 1500 * (1 + P.venue); s.naira -= fuel; report.push(`Generator fuel: ${naira(fuel)}.`); }
    if (P.owned.livestream) { const g = P.members * 50; s.naira += g; s.fame = clamp(s.fame + 1, 0, 100); report.push(`Online offerings: ${naira(g)}.`); }
    const branchIncome = BRANCHES.filter((b) => P.branches[b.id]).reduce((t, b) => t + b.daily, 0);
    if (branchIncome) { s.naira += branchIncome; report.push(`Support from branches: ${naira(branchIncome)}.`); }
    const wom = P.members * 0.015 * h.quality() * h.charMult() * h.faithMult() * (0.7 + s.fame / 100) + (P.owned.bus ? 5 : 0);
    const grew = h.addMembers(wom);
    if (grew > 0) report.push(`Members invited friends: +${grew}.`);
    if (s.faith < 25 || s.character < 30) {
      const lost = -h.addMembers(-P.members * 0.02);
      if (lost > 0) report.push(`${lost} members drifted away. The flock needs a shepherd who is close to God.`);
    }
  }

  // Free will: skipping church has consequences, showing up builds a streak.
  if (wasSunday && !isPastor(s)) {
    if (s.doneToday.sunday && !s.skippedSunday) {
      s.streak += 1;
      s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
      const b = Math.min(5 * s.streak, 30);
      s.points += b;
      report.push(`Sunday streak: ${s.streak} week${s.streak === 1 ? '' : 's'}! +${b}⭐`);
    } else {
      s.streak = 0;
      s.missedSundays += 1;
      h.grow('faith', -6);
      if (!['visitor', 'worshipper', 'minister'].includes(s.role)) s.xp = Math.max(0, s.xp - 5);
      report.push(s.role === 'visitor' ? 'You did not go to church today.' : `You missed Sunday service. Your ${isMinister(s) || s.role === 'worshipper' ? 'cell leader' : 'Head of Department'} called to ask if you are okay. -6 faith.`);
    }
  }

  s.skippedSunday = false;
  s.doneToday = {};
  s.eventsToday = 0;
  if (s.shift) { s.shift = null; report.push('Your unfinished task was left for another day.'); }
  s.day += 1;
  s.naira = Math.round(s.naira);
  if (report.length) {
    addLog(s, report.join(' '));
    env.fx.push({ type: 'toast', text: report.join(' '), emoji: '🌙' });
  }
  if (checkCollapse(s, env)) return;

  // Grace instead of game over.
  if (s.faith <= 0) {
    s.faith = 20;
    addLog(s, 'A brother visited and prayed with you. Your faith was restored.');
    env.fx.push({ type: 'modal', modal: { emoji: '🫂', title: 'You\'ve drifted away...', text: `Days went by without prayer or fellowship. Then Brother Emeka knocked on your door. "We missed you," he said, and prayed with you.\n\nGod never stopped loving you.\n\n${verseText(V.refuge)}`, ok: 'I\'m coming back home' } });
    return;
  }

  if (isPastor(s) && !s.won && s.pastor.members >= WIN_MEMBERS) {
    s.won = true;
    env.fx.push({ type: 'modal', modal: { emoji: '👑', title: 'General Overseer!', text: `${s.pastor.church} has grown to ${num(s.pastor.members)} members in ${s.day} days. Well done, good and faithful servant!`, ok: 'Keep shepherding' } });
    return;
  }
  if (isPastor(s) && s.character < 30 && s.fame > 25 && env.rng() < 0.15) { queue(s, 'expose', s.T); return; }
  if (isPastor(s) && s.day % 30 === 0) { queue(s, 'harvest', s.T); return; }

  // The devil is busy: a temptation most nights, otherwise a life event.
  const pool = (e) => !e.special && (e.trigger === 'night' || e.trigger === 'random') && (!e.cond || e.cond(s, clock(s)));
  const tempts = EVENTS.filter((e) => e.tempt && pool(e));
  const life = EVENTS.filter((e) => !e.tempt && pool(e));
  const r = env.rng();
  if (tempts.length && r < 0.45) queue(s, tempts[Math.floor(env.rng() * tempts.length)].id, s.T);
  else if (life.length && r < 0.9) queue(s, life[Math.floor(env.rng() * life.length)].id, s.T);
}

/* ================================================================ diary helpers */

/** Short time label for log entries: "Day 3 · Tue 18:40". */
export function logStamp(entry, startT) {
  const c = clockInfo(entry.T ?? 0, startT);
  return `Day ${entry.day ?? c.day} · ${c.weekdayShort} ${hhmm(entry.T ?? 0)}`;
}
