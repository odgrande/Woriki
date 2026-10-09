// Game rules facade: createGame(ctx, opts) → game. Owns the state, runs the real-time
// clock, listens to the player on the bus (zones, sitting, kneeling, interactions) and
// emits game events on the bus (game:changed, game:toast, service:start/end, audio:*).
import { newState, migrate, readSave, writeSave, clearSave, saveSummary, SAVE_KEY } from './state.js';
import {
  makeEnv, tick as tickSystems, doAction, canDo, listActions, choose as chooseSys, answerQuiz,
  buyItem, buyFood, buyUpgrade, upgradeChoir, moveVenue, openBranch, postRequest, markAnswered,
  completeMilestone, milestone, progress, presence, title, mood, clock, postLabel, advance, PRAISE_SECONDS,
} from './systems.js';
import { gameMinutesPerSecond, sharedTime, START_T, DEFAULT_REAL_MINUTES_PER_DAY } from './clock.js';
import { STARTS, ROLES, CHURCH_TYPES, naira } from './content.js';
import { ACTION_BY_ID } from './actions.js';

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
      default: return null;
    }
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
      if (dtMin > 1440 * 2) { advance(s, dtMin - 1, e); dtMin = 1; } // long time away
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
  function begin(state, { fresh }) {
    s = state;
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
      const modal = {
        emoji: st.emoji, title: st.title, ok: 'Let\'s go',
        text: `${st.text}\n\nRole: ${r.emoji} ${r.name}\nChurch: ${s.church}, Yaba (${ct.name})\nHome: ${s.area}, Lagos · Job: ${s.job}\nSavings: ${naira(s.naira)}\n\n`
          + `It's ${c.weekdayName} morning, ${c.time}. ${c.next ? `${c.next.name} starts at ${c.next.when.split(' ')[1]}.` : ''} `
          + (post ? `Serve at ${post} during the service.` : 'Walk to the church hall and sit down (C) during the service.'),
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
    get paused() { return pauses.size > 0 || !!(s && (s.activeEvent || s.exam)); },
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
