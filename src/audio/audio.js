// Public audio API for Amen City (see ARCHITECTURE.md → Audio).
// Owns the AudioContext lifecycle (unlock on first gesture, suspend when muted or hidden),
// persists mute/volumes, drives the lookahead scheduler and listens to game bus events.
import { createBaker } from './baker.js';
import { createEngine } from './engine.js';
import { SOUNDS, ESSENTIAL } from './catalog.js';
import { resolveZone } from './zones.js';

const MUTE_KEY = 'amen.muted';
const VOL_KEY = 'amen.audio.volumes';
const LOOKAHEAD = 0.3; // seconds scheduled ahead of the audio clock
const TICK_MS = 50;

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

/**
 * @param {{bus?: {on: Function, emit: Function}, quality?: 'low'|'medium'|'high', camera?: import('three').Camera}} ctx
 * @param {{autoUnlock?: boolean, worker?: boolean}} [opts]
 */
export function createAudio(ctx = {}, opts = {}) {
  const quality = ctx.quality || 'medium';
  const baker = createBaker({ worker: opts.worker !== false });
  /** @type {AudioContext|null} */
  let ac = null;
  /** @type {ReturnType<typeof createEngine>|null} */
  let engine = null;
  let muted = !!readJSON(MUTE_KEY, false);
  const volumes = { master: 1, music: 0.85, ambience: 0.85, sfx: 1, ...readJSON(VOL_KEY, {}) };
  let zoneArg = 'street';
  let musicTrack = 'none';
  let timer = null;
  let suspendTimer = null;
  const offs = [];
  const fwd = { x: 0, y: 0, z: -1 };
  let lastChatPing = 0;

  // Bake the small, early sounds right away (in the worker) so the first click and the
  // first footsteps are ready by the time the player has picked a role.
  for (const [r, a] of ESSENTIAL) baker.load(r, a, 1).catch(() => {});
  for (const s of ['asphalt', 'concrete', 'tile']) baker.load('footsteps', { surface: s, run: false }, 1).catch(() => {});

  function running() { return !!engine && ac.state === 'running'; }

  function tick() {
    if (running()) engine.pump(LOOKAHEAD);
  }

  function onVisibility() {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else if (!muted) ac.resume().catch(() => {});
  }

  function boot() {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try {
      ac = new AC({ latencyHint: quality === 'high' ? 'interactive' : 'balanced' });
    } catch {
      ac = new AC();
    }
    engine = createEngine(ac, { quality, baker });
    engine.master.gain.value = muted ? 0 : volumes.master;
    engine.setVolumes({ ...volumes, master: muted ? 0 : volumes.master });
    engine.setZone(zoneArg, 0.5);
    if (musicTrack !== 'none') engine.music.set(musicTrack);
    timer = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', onVisibility);
    // the rest in the background, most useful first: footsteps, sounds and the current bed,
    // then the service music, then the other beds
    engine.preload(['footsteps', 'sfx', engine.zone.ambience], 1).catch(() => {});
    engine.preload(['music'], 0).catch(() => {});
    engine.preload(['street', 'church', 'market', 'home', 'prayer'], 0).catch(() => {});
    return true;
  }

  /** Create/resume the AudioContext. Call from a user gesture (click/tap/key). */
  function unlock() {
    if (!ac && !boot()) return Promise.resolve(false);
    if (muted) return Promise.resolve(true);
    // iOS: start a silent buffer inside the gesture to fully unlock output
    try {
      const b = ac.createBuffer(1, 1, 22050);
      const s = ac.createBufferSource();
      s.buffer = b; s.connect(ac.destination); s.start(0);
    } catch { /* ignore */ }
    if (ac.state !== 'running') return ac.resume().then(() => true, () => false);
    return Promise.resolve(true);
  }

  // auto-unlock on the first gesture anywhere (harmless if the game also calls unlock())
  const gesture = () => { unlock(); };
  if (opts.autoUnlock !== false && typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, gesture, { capture: true, passive: true });
  }
  function removeGestureListeners() {
    if (typeof window === 'undefined') return;
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, gesture, { capture: true });
  }

  const audio = {
    unlock,
    get muted() { return muted; },
    get unlocked() { return running(); },
    get zone() { return engine?.zone.ambience ?? resolveZone(zoneArg).ambience; },
    get music() { return musicTrack; },
    get volumes() { return { ...volumes }; },

    /** Mute/unmute everything (persists). Muting also suspends the audio thread to save battery. */
    setMuted(m) {
      muted = !!m;
      writeJSON(MUTE_KEY, muted);
      if (!engine) return;
      clearTimeout(suspendTimer);
      const g = engine.master.gain;
      const t = ac.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      if (muted) {
        g.linearRampToValueAtTime(0, t + 0.08);
        suspendTimer = setTimeout(() => { if (muted) ac.suspend().catch(() => {}); }, 150);
      } else {
        ac.resume().catch(() => {});
        g.linearRampToValueAtTime(volumes.master, t + 0.15);
      }
    },

    /** Set bus volumes 0..1: {master, music, ambience, sfx} (persists). */
    setVolume(bus, value) {
      if (!(bus in volumes)) return;
      volumes[bus] = Math.max(0, Math.min(1, Number(value) || 0));
      writeJSON(VOL_KEY, volumes);
      if (engine) engine.setVolumes(bus === 'master' ? { master: muted ? 0 : volumes.master } : { [bus]: volumes[bus] });
    },

    /** Crossfade ambience: 'street'|'church'|'market'|'home'|'prayer'|'none', a zone id or a zone object. */
    setZone(zone) {
      zoneArg = zone;
      if (engine) engine.setZone(zone);
    },

    /** Player footstep (non-positional) or someone else's (with position). */
    footstep(surface, o = {}) {
      if (!running() || muted) return;
      engine.footstep(surface, o);
    },

    /** Play a named sound: bell, click, chat, coin, pray, clap, door, horn, okada, thunder, success, fail. */
    play(name, o = {}) {
      if (!running() || muted || !SOUNDS[name]) return;
      engine.play(name, o);
    },

    /** 'worship' fades the gospel groove in; 'none' fades it out. */
    setMusic(track) {
      musicTrack = track === 'worship' ? 'worship' : 'none';
      if (engine) engine.music.set(musicTrack);
    },

    /**
     * Move the listener. Orientation follows ctx.camera when there is one (so panning always
     * matches the screen); otherwise `listenerYaw` is used with forward = (sin yaw, 0, cos yaw).
     */
    update(listenerPosition, listenerYaw) {
      if (!engine || !listenerPosition) return;
      const e = ctx.camera?.matrixWorld?.elements;
      if (e) {
        // a camera looks down its local -Z axis
        const l = Math.hypot(e[8], e[10]);
        if (l > 1e-4) { fwd.x = -e[8] / l; fwd.y = 0; fwd.z = -e[10] / l; }
      } else if (typeof listenerYaw === 'number') {
        fwd.x = Math.sin(listenerYaw); fwd.y = 0; fwd.z = Math.cos(listenerYaw);
      }
      engine.setListener(listenerPosition, fwd);
    },

    /** Debug/test access to the engine (null until unlocked). */
    get engine() { return engine; },
    get context() { return ac; },

    dispose() {
      removeGestureListeners();
      for (const off of offs) off();
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      engine?.dispose();
      ac?.close().catch(() => {});
      baker.dispose();
      engine = null; ac = null;
    },
  };

  // ---- game bus -------------------------------------------------------------
  const bus = ctx.bus;
  if (bus) {
    offs.push(bus.on('player:step', (e) => audio.footstep(e?.surface, { run: !!e?.run })));
    offs.push(bus.on('player:zone', (e) => audio.setZone(e?.zone ?? null)));
    offs.push(bus.on('audio:play', (e) => e?.name && audio.play(e.name, { position: e.position, volume: e.volume })));
    offs.push(bus.on('audio:music', (e) => audio.setMusic(e?.track)));
    offs.push(bus.on('chat:message', (e) => {
      const t = performance.now();
      if (t - lastChatPing < 350) return; // a burst (e.g. chat history on join) pings once
      lastChatPing = t;
      if (e?.self) audio.play('click', { volume: 0.6 }); else audio.play('chat');
    }));
  }

  // read-only debug hook for tests
  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.audio = {
      get state() { return ac?.state ?? 'locked'; },
      get muted() { return muted; },
      get zone() { return audio.zone; },
      get music() { return musicTrack; },
      get musicPlaying() { return !!engine?.music.playing; },
      get voices() { return engine?.voices ?? 0; },
      get baked() { return baker.size; },
      get sampleRate() { return ac?.sampleRate ?? 0; },
    };
  }

  return audio;
}
