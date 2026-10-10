// Game rules facade: createGame(ctx, opts) → game. Owns the state, runs the real-time
// clock, listens to the player on the bus (zones, sitting, kneeling, interactions) and
// emits game events on the bus (game:changed, game:toast, service:start/end, audio:*).
import { newState, migrate, readSave, writeSave, clearSave, saveSummary, SAVE_KEY } from './state.js';
import {
  makeEnv, tick as tickSystems, doAction, canDo, listActions, choose as chooseSys, answerQuiz,
  buyItem, buyFood, buyUpgrade, upgradeChoir, moveVenue, openBranch, postRequest, markAnswered,
  completeMilestone, milestone, progress, presence, title, mood, clock, postLabel, advance, dayPlan, endService, addLog, PRAISE_SECONDS,
} from './systems.js';
import { gameMinutesPerSecond, sharedTime, START_T, DEFAULT_REAL_MINUTES_PER_DAY } from './clock.js';
import { STARTS, ROLES, CHURCH_TYPES, naira } from './content.js';
import { ACTION_BY_ID } from './actions.js';
import { travel as travelSys, travelQuote, distanceKm, placeOfZone, activitiesAt, doActivity, buyFurniture as buyFurnitureSys, TRAVEL_MODES, PLACE_BY_ID, give as giveSys, doPhone, bookAd as bookAdSys, activeAds } from './life.js';
import { deltas as deltasOf } from './systems.js';

/**
 * @typedef {object} GameOptions
 * @property {object|boolean} [save] a saved state to resume now (object), or false to ignore storage
 * @property {Storage|null} [storage] defaults to localStorage
 * @property {number} [realMinutesPerDay] real minutes per in-game day (default 24)
 * @property {'local'|'shared'} [clock] local: per-player clock that can skip (sleep, work);
 *   shared: derived from the wall clock so every player shares the same services
 * @property {() => number} [rng]
 * @property {boolean} [autoTick] register tick() on ctx.onUpdate (default false; main calls tick)
 */

/**
 * @param {object} ctx engine context (uses ctx.bus and ctx.onUpdate when present)
 * @param {GameOptions} [opts]
 */
export function createGame(ctx = {}, opts = {}) {
  const bus = ctx.bus || null;
  const storage = opts.storage !== undefined ? opts.storage : undefined;
  /** opts.save === false or storage === null: never touch storage (tests). */
  const persist = opts.save !== false && storage !== null;
  const mode = opts.clock === 'shared' ? 'shared' : 'local';
  const rng = opts.rng || Math.random;
  let realMinutesPerDay = opts.realMinutesPerDay || DEFAULT_REAL_MINUTES_PER_DAY;
  const listeners = new Map();
  const offs = [];
  const pauses = new Set();

  /** @type {object|null} */
  let s = null;
  if (opts.save && typeof opts.save === 'object') s = migrate(opts.save);

  // Where the player is, from bus events (or setLocation()).
  const loc = { zone: null, seated: false, kneeling: false, praising: false };
  let linked = false;
  let realTime = 0;
  let praiseUntil = -1;
  let dirty = false;
  let lastSave = 0;
  let lastChange = 0;
  /** A trip place you are visiting (no 3D scene). */
  let trip = null;

  /* ---------------------------------------------------------------- events */
  function on(type, fn) {
    (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn);
    return () => listeners.get(type)?.delete(fn);
  }
  function emit(type, data) {
    listeners.get(type)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(`[game] ${type} listener`, e); } });
  }

  const BUS_MAP = {
    toast: 'game:toast', 'service:start': 'service:start', 'service:end': 'service:end',
    'audio:play': 'audio:play', 'audio:music': 'audio:music', request: 'game:request', skip: 'game:skip',
    role: 'game:role', over: 'game:over', event: 'game:event', modal: 'game:modal',
  };

  function flush(fx) {
    for (const e of fx) {
      const { type, ...data } = e;
      emit(type, data);
      const b = BUS_MAP[type];
      if (b && bus) bus.emit(b, data);
    }
    fx.length = 0;
  }

  function changed(force = true) {
    dirty = true;
    const now = realTime;
    if (!force && now - lastChange < 0.25) return;
    lastChange = now;
    emit('change', s);
    bus?.emit('game:changed', { state: s });
  }

  function env() {
    loc.praising = realTime < praiseUntil;
    return makeEnv({ rng, mode, loc, linked });
  }

  /** Run a state mutation with an effects outbox, then publish. */
  function run(fn) {
    if (!s) return { ok: false, reason: 'No game in progress' };
    const e = env();
    const out = fn(e);
    flush(e.fx);
    changed(true);
    maybeSave(true);
    return out;
  }

  /* ---------------------------------------------------------------- persistence */
  function save() {
    if (!s || !persist) return false;
    dirty = false;
    lastSave = realTime;
    return storage === undefined ? writeSave(s) : writeSave(s, storage);
  }
  function maybeSave(force = false) {
    if (!s || !persist) return;
    if (force || (dirty && realTime - lastSave > 10)) save();
  }
  const readStored = () => (!persist ? null : storage === undefined ? readSave() : readSave(storage));

  /* ---------------------------------------------------------------- player on the bus */
  const zoneId = (z) => (typeof z === 'string' ? z : z?.id || null);
  if (bus) {
    offs.push(bus.on('player:zone', (d) => { linked = true; loc.zone = zoneId(d?.zone); }));
    offs.push(bus.on('player:action', (d) => {
      linked = true;
      const n = d?.name;
      if (n === 'sit') { loc.seated = true; loc.kneeling = false; }
      else if (n === 'kneel' || n === 'pray') { loc.kneeling = true; loc.seated = false; }
      else if (n === 'stand' || n === 'jump') { loc.seated = false; loc.kneeling = false; }
      else if (n === 'wave' || n === 'clap' || n === 'dance') praiseUntil = realTime + PRAISE_SECONDS;
    }));
    offs.push(bus.on('player:moved', (d) => {
      linked = true;
      if ((d?.speed ?? 1) > 0.3) { loc.seated = false; loc.kneeling = false; }
    }));
    offs.push(bus.on('player:interact', (item) => interact(item)));
  }

  /** React to a world interactable (see ARCHITECTURE.md → World → interactables). */
  function interact(item) {
    if (!s || !item) return null;
    switch (item.action) {
      case 'buy-food': return run((e) => buyFood(s, item.id, e));
      case 'pray':
        return run((e) => { e.fx.push({ type: 'request', action: 'kneel' }); e.fx.push({ type: 'toast', text: 'Kneel (P) and stay on your knees to pray.', emoji: '🙏' }); return { ok: true }; });
      case 'board-danfo':
        emit('travel', { actions: listActions(s, env()).filter((a) => ACTION_BY_ID[a.id].zone?.includes('busstop')) });
        return { ok: true };
      case 'ring-bell':
        return run((e) => {
          e.fx.push({ type: 'audio:play', name: 'bell' });
          const c = clock(s);
          const soon = c.next && c.next.inMinutes <= 30;
          if (soon && (s.role === 'security' || s.role === 'usher') && !s.doneToday.bell) {
            s.doneToday.bell = true;
            s.points += 2;
            e.fx.push({ type: 'toast', text: `You rang the first bell for ${c.next.name}. +2⭐`, emoji: '🔔' });
          }
          return { ok: true };
        });
      case 'play-keyboard':
        return run((e) => {
          const r = ACTION_BY_ID.rehearse;
          if (s.role === 'choir' && canDo(s, r, e).ok) return doAction(s, 'rehearse', e);
          e.fx.push({ type: 'toast', text: 'You played a few chords. Somebody at the back shouted "Halleluyah!"', emoji: '🎹' });
          return { ok: true };
        });
      case 'activity': {
        // Beach stalls, cinema tickets…: things to do at a place (src/game/life.js ACTIVITIES).
        const r = game.activity(item.activity);
        if (r && !r.ok && r.reason) emitToast(r.reason);
        return r;
      }
      default: return null;
    }
  }
  function emitToast(text) {
    emit('toast', { text, tone: 'warn' });
    bus?.emit('game:toast', { text, tone: 'warn' });
  }

  /* ---------------------------------------------------------------- clock */
  const minutesPerSecond = () => gameMinutesPerSecond(realMinutesPerDay);

  function tick(dt) {
    realTime += dt;
    if (!s || s.over) return;
    if (mode === 'local' && (pauses.size || s.activeEvent || s.exam)) return;
    step(dt);
  }

  function step(dt) {
    const e = env();
    let dtMin = dt * minutesPerSecond();
    if (mode === 'shared') {
      const T = sharedTime(Date.now(), realMinutesPerDay);
      dtMin = T - s.T;
      if (dtMin < -1) { resync(s); return; }
      if (dtMin > 30) {
        // Back after a while (the browser was closed): life went on gently. You slept and ate a bit.
        advance(s, dtMin - 1, e, { asleep: true });
        s.energy = Math.min(100, s.energy + ((dtMin - 1) / 60) * 8);
        dtMin = 1;
      }
      if (dtMin <= 0) return;
    }
    const prevMinute = Math.floor(s.T);
    tickSystems(s, dtMin, e);
    const hadFx = e.fx.length > 0;
    flush(e.fx);
    if (hadFx) changed(true);
    else if (Math.floor(s.T) !== prevMinute) changed(false);
    if (Math.floor(s.T) !== prevMinute) emit('clock', clock(s));
    maybeSave(false);
  }

  if (opts.autoTick && ctx.onUpdate) offs.push(ctx.onUpdate((dt) => tick(dt)));

  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
  }

  /* ---------------------------------------------------------------- lifecycle */
  /**
   * Shared clock: a life saved under another day length (e.g. the old 24-minute days) is ahead of
   * or far behind real Lagos time. Bring it to now, keeping how many days you have lived.
   */
  function resync(st) {
    if (mode !== 'shared' || !st) return;
    const T = sharedTime(Date.now(), realMinutesPerDay);
    if (st.T > T + 1 || st.realMinutesPerDay !== realMinutesPerDay) {
      const lived = Math.max(0, Math.floor(st.T / 1440) - Math.floor(st.startT / 1440));
      st.T = T;
      st.startT = T - lived * 1440;
      st.doneToday = {};
      st.pending = [];
      st.attendance = null;
      st.shift = null;
      st.realMinutesPerDay = realMinutesPerDay;
    }
  }

  function begin(state, { fresh }) {
    s = state;
    resync(s);
    lastSave = realTime;
    save();
    emit('start', s);
    changed(true);
    if (fresh) {
      const st = STARTS[s.start];
      const r = ROLES[s.role];
      const ct = CHURCH_TYPES[s.tradition];
      const c = clock(s);
      const post = postLabel(s);
      const plan = dayPlan(s);
      const modal = {
        emoji: st.emoji, title: st.title, ok: 'Let\'s go',
        text: `${st.text}\n\nRole: ${r.emoji} ${r.name}\nChurch: ${s.church}, Yaba (${ct.name})\nHome: No. 14, ${s.area}, Lagos · Job: ${s.job}\nSavings: ${naira(s.naira)}\n\n`
          + `It's ${c.weekdayName} ${c.part}, ${c.time} in Lagos. You are at home. ${plan.items.length ? `Today: ${plan.items.map((x) => `${x.name} at ${x.time}`).join(', ')}.` : plan.idea} `
          + (c.next ? `Next: ${c.next.name}, ${c.next.when}. ` : '')
          + (post ? `During services you serve at ${post}.` : 'During services, sit down (C) in the church hall.'),
      };
      emit('modal', { modal });
    }
    return s;
  }

  /* ---------------------------------------------------------------- API */
  const game = {
    get state() { return s; },
    get loc() { return { ...loc, praising: realTime < praiseUntil }; },
    get linked() { return linked; },
    get mode() { return mode; },
    get realMinutesPerDay() { return realMinutesPerDay; },
    set realMinutesPerDay(v) { if (v > 0) realMinutesPerDay = v; },
    get clock() { return s ? clock(s) : null; },
    get title() { return s ? title(s) : ''; },
    get mood() { return s ? mood(s) : null; },
    get progress() { return s ? progress(s, game.loc) : null; },
    get presence() { return s ? presence(s, game.loc) : null; },
    get milestone() { return s ? milestone(s) : null; },
    get postLabel() { return s ? postLabel(s) : null; },
    /** Today's meetings and a free-time idea. */
    get plan() { return s ? dayPlan(s) : null; },
    get paused() { return pauses.size > 0 || !!(s && (s.activeEvent || s.exam)); },
    /** The saved life as it stands now (naira, points, clock, today's plan) without starting it. */
    peek() {
      const st = readStored();
      if (!st) return null;
      const T = mode === 'shared' ? sharedTime(Date.now(), realMinutesPerDay) : st.T;
      const sameDay = Math.floor(T / 1440) === Math.floor(st.T / 1440) && st.realMinutesPerDay === realMinutesPerDay;
      const view = { ...st, T, doneToday: sameDay ? st.doneToday : {} };
      return { naira: st.naira, points: st.points, clock: clock(view), plan: dayPlan(view), appearance: st.appearance, role: st.role, name: st.name };
    },
    /** Summary of the saved life in storage (for "Continue"), or null. */
    get saved() { return saveSummary(readStored()); },

    on,

    /** Start a new life. @param {import('./state.js').Profile} profile */
    newGame(profile) {
      const T = mode === 'shared' ? sharedTime(Date.now(), realMinutesPerDay) : START_T;
      return begin(newState(profile, { rng, T }), { fresh: true });
    },
    /** Resume the saved life. Returns the state or null. */
    continueGame() {
      const st = readStored();
      if (!st || st.over) return null;
      return begin(st, { fresh: false });
    },
    /** Delete the saved life and drop the current one. */
    reset() {
      if (persist) { if (storage === undefined) clearSave(); else clearSave(storage); }
      s = null;
      emit('reset');
    },
    save,
    /** Update the stored appearance (e.g. after the editor). */
    setAppearance(appearance) { if (s) { s.appearance = appearance; changed(true); save(); } },

    /** Do an action by id (see src/game/actions.js). */
    act(id, o = {}) {
      if (id === 'sleep' || id === 'endday') id = 'sleep';
      return run((e) => doAction(s, id, e, o));
    },
    /** Can the action be done now? `{ok, code, reason}` */
    can(id) { return s ? canDo(s, id, env()) : { ok: false, reason: 'No game' }; },
    /** Render-ready list of visible actions, optionally one group. */
    actions(group = null) { return s ? listActions(s, env(), group) : []; },
    /** Answer the active event / prompt. */
    choose(i) { return run((e) => chooseSys(s, i, e)); },
    /** Answer the current quiz question. */
    answer(i) { return run((e) => answerQuiz(s, i, e)); },
    /** Take the next step on the journey (baptism, promotion, Bible school, ordination). */
    advanceJourney() { return run((e) => completeMilestone(s, e)); },
    buy(id) { return run((e) => buyItem(s, id, e)); },
    buyFood(vendor = 'buka') { return run((e) => buyFood(s, vendor, e)); },
    buyUpgrade(id) { return run((e) => buyUpgrade(s, id, e)); },
    upgradeChoir() { return run((e) => upgradeChoir(s, e)); },
    moveVenue() { return run((e) => moveVenue(s, e)); },
    openBranch(id) { return run((e) => openBranch(s, id, e)); },
    postRequest(text) { return run((e) => postRequest(s, text, e)); },
    markAnswered(id) { return run((e) => markAnswered(s, id, e)); },
    cancelShift() { return run(() => { if (s.shift) s.shift = null; return { ok: true }; }); },

    /* ------------------------------------------------ normal life: places, travel, home */
    /** Where you are: a trip place you went to, else the place of your world zone. */
    get here() { return trip || placeOfZone(loc.zone) || (s ? 'home' : null); },
    /** On a trip to a place without a walkable 3D scene (Balogun, Government House…). */
    get trip() { return trip; },
    /** Price, energy and time of going to `to` with every mode. */
    quotes(to) {
      if (!s) return [];
      const km = distanceKm(game.here, to);
      return TRAVEL_MODES.map((m) => ({ ...travelQuote(s, km, m.id), km }));
    },
    /**
     * Go somewhere. Emits 'travel:go' (and game:travel on the bus) with {to, place, walk, minutes, mode}
     * so the world can move the player; trips to non-walkable places set `trip`.
     */
    travel(to, mode) {
      if (!s) return { ok: false, reason: 'No game' };
      const from = game.here;
      if (from === to) return { ok: false, reason: 'You are already here' };
      const place = PLACE_BY_ID[to];
      if (!place) return { ok: false, reason: 'Unknown place' };
      if (place.soon) return { ok: false, reason: `${place.name} is coming soon.` };
      return run((e) => {
        if (s.attendance) endService(s, e, { silent: false });
        const before = { ...s };
        const r = travelSys(s, from, to, mode, rng);
        if (!r.ok) return r;
        trip = place.walk ? null : to;
        if (place.fee) { s.naira -= Math.min(s.naira, place.fee); }
        e.fx.push({ type: 'toast', text: r.text + (place.fee ? ` Gate fee ${naira(place.fee)}.` : ''), emoji: r.mode.emoji, deltas: deltasOf(before, s) });
        const go = { to, place, walk: place.walk || null, minutes: r.minutes, mode: r.mode.id };
        emit('travel:go', go);
        bus?.emit('game:travel', go);
        return { ...r, ...go };
      });
    },
    /** End a trip without the 3D world (e.g. map closed): you are back where you were. */
    endTrip() { trip = null; },
    /** Things to do where you are (or at `placeId`). */
    activities(placeId = game.here) {
      if (!s) return [];
      const c = clock(s);
      return activitiesAt(s, placeId, c.weekdayShort, c.hour);
    },
    activity(id) {
      return run((e) => {
        const c = clock(s);
        const before = { ...s };
        const r = doActivity(s, id, c.weekdayShort, c.hour, rng);
        if (!r.ok) return r;
        addLog(s, r.text);
        e.fx.push({ type: 'toast', text: r.text, emoji: r.emoji, deltas: deltasOf(before, s), tone: r.shady ? 'warn' : undefined });
        e.fx.push({ type: 'audio:play', name: r.shady ? 'fail' : 'success' });
        return r;
      });
    },
    /** Church adverts running on billboards. */
    get ads() { return s ? activeAds(s) : []; },
    /** Book a billboard for a church programme (see life.js AD_SPOTS). */
    bookAd(ad) {
      return run((e) => {
        const before = { ...s };
        const r = bookAdSys(s, ad);
        if (!r.ok) return r;
        addLog(s, r.text);
        e.fx.push({ type: 'toast', text: r.text, emoji: '🪧', deltas: deltasOf(before, s), tone: 'good' });
        bus?.emit('ads:changed', { ads: activeAds(s) });
        return r;
      });
    },
    /** Give to the church from the bank app (tithe, offering, thanksgiving…). */
    give(kind, amount) {
      return run((e) => {
        const before = { ...s };
        const r = giveSys(s, kind, amount, Math.floor(s.T / (1440 * 7)));
        if (!r.ok) return r;
        addLog(s, r.text);
        e.fx.push({ type: 'toast', text: r.text, emoji: '🙏', deltas: deltasOf(before, s), tone: 'good' });
        e.fx.push({ type: 'audio:play', name: 'success' });
        return r;
      });
    },
    /** Phone things: calls, sermons, food delivery ('order:amala'), blocking a scammer… */
    phone(id) {
      return run((e) => {
        const before = { ...s };
        const r = doPhone(s, id);
        if (!r.ok) return r;
        addLog(s, r.text);
        const bad = id === 'replyScam';
        e.fx.push({ type: 'toast', text: r.text, emoji: bad ? '💔' : '📱', deltas: deltasOf(before, s), tone: bad ? 'warn' : undefined });
        if (bad) e.fx.push({ type: 'audio:play', name: 'fail' });
        return r;
      });
    },
    /** Buy furniture from the home catalog (delivered to No. 14). */
    buyFurniture(id) {
      return run((e) => {
        const before = { ...s };
        const r = buyFurnitureSys(s, id);
        if (!r.ok) return r;
        addLog(s, r.text);
        e.fx.push({ type: 'toast', text: r.text, emoji: '📦', deltas: deltasOf(before, s), tone: 'good' });
        e.fx.push({ type: 'audio:play', name: 'success' });
        bus?.emit('home:changed', { home: { ...s.home } });
        return r;
      });
    },
    interact,

    /** Advance the real-time clock (real seconds). Call every frame. */
    tick,
    /** Manually set where the player is (harness / tests). */
    setLocation(partial) {
      linked = true;
      if ('zone' in partial) loc.zone = zoneId(partial.zone);
      if ('seated' in partial) loc.seated = !!partial.seated;
      if ('kneeling' in partial) loc.kneeling = !!partial.kneeling;
      if (partial.praising) praiseUntil = realTime + PRAISE_SECONDS;
      changed(true);
    },
    /** Pause the local clock while a UI overlay is open. */
    pause(reason = 'ui') { pauses.add(reason); },
    resume(reason = 'ui') { pauses.delete(reason); },

    /** Dev/test only: jump the clock forward by in-game minutes (runs services and days). */
    warp(minutes, stepMin = 1) {
      if (!s) return;
      const sec = stepMin / minutesPerSecond();
      for (let m = 0; m < minutes && !s.over && !s.activeEvent && !s.exam; m += stepMin) {
        realTime += sec;
        step(sec);
      }
    },

    destroy() {
      save();
      offs.forEach((f) => f());
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', save);
      }
      listeners.clear();
    },
    SAVE_KEY,
  };

  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.game = game;
  }
  return game;
}

export { STARTS, ROLES, CHURCH_TYPES } from './content.js';
export * as content from './content.js';
