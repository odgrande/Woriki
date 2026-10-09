// Audio engine on any BaseAudioContext (live AudioContext or OfflineAudioContext for tests):
// mixer buses, room reverb, master limiter, voice limiting, spatial one-shots, footsteps,
// ambience beds and the worship music. No DOM, no timers required (pump() drives scheduling).
import { SOUNDS } from './catalog.js';
import { createVoicePool } from './polyphony.js';
import { reverbFor, footstepParams, musicMix, resolveZone } from './zones.js';
import { createAmbience } from './ambience.js';
import { createMusic } from './music.js';

const SURFACES = ['asphalt', 'concrete', 'tile', 'carpet', 'wood', 'dirt'];

/** Smoothly move an AudioParam (no zipper noise, no automation pile-up). */
export function glide(param, value, ac, tau = 0.05) {
  const now = ac.currentTime;
  try {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, tau);
  } catch { param.value = value; }
}

/** Generated stereo room impulse response (early reflections + frequency-dependent tail). */
function makeImpulse(ac, t60) {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * t60 * 1.05);
  const buf = ac.createBuffer(2, n, sr);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  const pre = Math.floor(0.012 * sr);
  const kD = -6.9 / (t60 * sr), kB = -6.9 / (t60 * 0.4 * sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0, lp2 = 0;
    for (let i = pre; i < n; i++) {
      const t = i - pre;
      const w = rnd();
      lp += 0.22 * (w - lp);
      lp2 += 0.08 * (lp - lp2);
      const att = Math.min(1, t / (0.006 * sr));
      d[i] = (w * Math.exp(t * kB) * 0.35 + lp * Math.exp(t * kD) * 1.3 + lp2 * Math.exp(t * kD * 0.8) * 1.2) * att;
    }
    // a few discrete early reflections (walls, floor), different per ear
    const taps = c ? [[0.009, 0.5], [0.019, -0.35], [0.031, 0.3], [0.047, -0.2]] : [[0.007, 0.55], [0.016, -0.4], [0.027, 0.3], [0.041, -0.22]];
    for (const [t, g] of taps) { const i = Math.floor(t * sr); if (i < n) d[i] += g; }
  }
  return buf;
}

/**
 * @param {BaseAudioContext} ac
 * @param {{quality?: 'low'|'medium'|'high', baker: ReturnType<import('./baker.js').createBaker>}} opts
 */
export function createEngine(ac, { quality = 'medium', baker }) {
  const low = quality === 'low';
  const now = () => ac.currentTime;

  // ---- mixer ------------------------------------------------------------------
  const master = ac.createGain();
  master.gain.value = 1;
  const limiter = ac.createDynamicsCompressor();
  // safety limiter: transparent for normal levels (small automatic make-up gain, ~+2.7 dB)
  limiter.threshold.value = -5;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  // protect small speakers from sub-bass excursion and keep DC out
  const subCut = ac.createBiquadFilter();
  subCut.type = 'highpass';
  subCut.frequency.value = 32;
  subCut.Q.value = 0.7;
  master.connect(subCut);
  subCut.connect(limiter);
  limiter.connect(ac.destination);

  const mk = (g = 1, to = master) => { const n = ac.createGain(); n.gain.value = g; n.connect(to); return n; };
  const buses = { sfx: mk(1), foot: mk(1), ambience: mk(0.9) };
  // music: user volume → through-the-wall filter (lowpass) → level by where the listener is
  const musicLevel = mk(1);
  const musicFilter = ac.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 16000;
  musicFilter.Q.value = 0.5;
  musicFilter.connect(musicLevel);
  const musicVol = ac.createGain();
  musicVol.gain.value = 1;
  musicVol.connect(musicFilter);
  buses.music = musicVol;

  // reverb
  const reverbIn = ac.createGain();
  reverbIn.gain.value = 1;
  const convolver = ac.createConvolver();
  convolver.buffer = makeImpulse(ac, low ? 1.3 : quality === 'high' ? 2.3 : 1.9);
  const reverbOut = mk(0.9);
  reverbIn.connect(convolver);
  convolver.connect(reverbOut);
  const musicReverb = ac.createGain();
  musicReverb.gain.value = 0.25;
  musicFilter.connect(musicReverb);
  musicReverb.connect(reverbIn);

  // ---- state ------------------------------------------------------------------
  const pool = createVoicePool({
    max: low ? 10 : quality === 'high' ? 24 : 16,
    caps: Object.fromEntries(Object.entries(SOUNDS).map(([k, v]) => [k, v.cap || 4]).concat([['footstep', 3]])),
  });
  const live = new Map(); // voice id -> handle
  const lastPlayed = new Map(); // name -> time
  const lastVariant = new Map();
  const listener = { x: 0, y: 1.6, z: 0 };
  let zone = resolveZone('street');
  let roomWet = reverbFor(zone.ambience);

  // ---- low-level playback -----------------------------------------------------
  /**
   * Play an AudioBuffer once.
   * @param {AudioBuffer} buf
   * @param {{when?: number, gain?: number, rate?: number, pan?: number, lowpass?: number,
   *   position?: {x:number,y:number,z:number}|null, moveTo?: {x:number,y:number,z:number}|null,
   *   ref?: number, rolloff?: number, reverb?: number, out?: AudioNode, onEnd?: () => void}} o
   */
  function playBuffer(buf, o = {}) {
    const t = Math.max(now(), o.when ?? now());
    const src = ac.createBufferSource();
    src.buffer = buf;
    const rate = o.rate ?? 1;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g);
    const nodes = [src, g];
    let node = g;
    if (o.lowpass && o.lowpass < 15000) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lowpass; f.Q.value = 0.6;
      node.connect(f); node = f; nodes.push(f);
    }
    const dur = buf.duration / rate;
    if (o.position) {
      const p = ac.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = o.ref ?? 4;
      p.rolloffFactor = o.rolloff ?? 1;
      p.maxDistance = 10000;
      const { x, y, z } = o.position;
      if (p.positionX) {
        p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y ?? 1, t); p.positionZ.setValueAtTime(z, t);
        if (o.moveTo) {
          p.positionX.linearRampToValueAtTime(o.moveTo.x, t + dur);
          p.positionY.linearRampToValueAtTime(o.moveTo.y ?? 1, t + dur);
          p.positionZ.linearRampToValueAtTime(o.moveTo.z, t + dur);
        }
      } else p.setPosition(x, y ?? 1, z);
      node.connect(p); node = p; nodes.push(p);
    } else if (o.pan && ac.createStereoPanner) {
      const sp = ac.createStereoPanner();
      sp.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(sp); node = sp; nodes.push(sp);
    }
    node.connect(o.out || buses.sfx);
    if (o.reverb && o.reverb > 0.002) {
      const s = ac.createGain();
      s.gain.value = Math.min(1.5, o.reverb);
      node.connect(s); s.connect(reverbIn); nodes.push(s);
    }
    src.start(t);
    const handle = {
      end: t + dur,
      stop(at = now(), fade = 0.03) {
        try {
          g.gain.cancelScheduledValues(at);
          g.gain.setValueAtTime(g.gain.value, at);
          g.gain.linearRampToValueAtTime(0, at + fade);
          src.stop(at + fade + 0.01);
        } catch { /* already stopped */ }
      },
    };
    src.onended = () => {
      for (const n of nodes) { try { n.disconnect(); } catch { /* ignore */ } }
      o.onEnd?.();
    };
    return handle;
  }

  /** Reserve a voice in the pool (stealing others if needed) and play. */
  function voice(name, priority, buf, o) {
    const t = Math.max(now(), o.when ?? now());
    const { id, steal } = pool.allocate(name, priority, now(), t + buf.duration / (o.rate ?? 1));
    for (const sid of steal) { live.get(sid)?.stop(t); live.delete(sid); } // stolen voices end as the new one starts
    if (id < 0) return null;
    const h = playBuffer(buf, { ...o, onEnd: () => { live.delete(id); pool.release(id); } });
    live.set(id, h);
    return h;
  }

  function distanceTo(p) { return Math.hypot(p.x - listener.x, (p.y ?? 1) - listener.y, p.z - listener.z); }

  function pickVariant(key, list) {
    if (list.length === 1) return list[0];
    const last = lastVariant.get(key);
    let i = Math.floor(Math.random() * list.length);
    if (i === last) i = (i + 1) % list.length;
    lastVariant.set(key, i);
    return list[i];
  }

  // ---- named one-shots ----------------------------------------------------------
  /**
   * @param {string} name
   * @param {{position?: {x:number,y?:number,z:number}, volume?: number, when?: number, count?: number, interval?: number, pan?: number}} [opts]
   */
  function play(name, opts = {}) {
    const def = SOUNDS[name];
    if (!def) return null;
    const t = Math.max(now(), opts.when ?? now());
    const last = lastPlayed.get(name);
    if (def.minGap && last != null && t - last < def.minGap) return null;
    const pos = !def.ui && opts.position ? opts.position : null;
    const moving = pos && def.moving;
    const variants = moving ? baker.get(def.moving.recipe, def.moving.args) : baker.get(def.recipe, def.args);
    if (!variants) return null; // still baking: skip rather than stall
    lastPlayed.set(name, t);
    const d = pos ? distanceTo(pos) : 0;
    if (pos && d > (def.ref || 4) * 45) return null; // inaudible, save a voice
    const air = pos && d > 12 ? Math.max(1200, 22000 * Math.pow(12 / d, 1.1)) : 0;
    const reverb = (def.reverb ?? 0.12) * roomWet * 3 * (pos ? 1 + d / 25 : 1);
    const [count, interval] = opts.count != null ? [opts.count, opts.interval ?? def.repeat?.[1] ?? 0.5] : (def.repeat || [1, 0]);
    let first = null;
    for (let k = 0; k < count; k++) {
      const buf = pickVariant(name, variants);
      const jitter = k ? (Math.random() - 0.5) * 0.03 : 0;
      const o = {
        when: t + k * interval + jitter,
        gain: def.gain * (opts.volume ?? 1) * (k ? 0.85 + Math.random() * 0.2 : 1),
        rate: name === 'bell' ? 1 : 0.97 + Math.random() * 0.06,
        lowpass: air,
        reverb,
        pan: opts.pan,
        position: pos,
        ref: def.ref, rolloff: def.rolloff,
      };
      if (moving) {
        // travel along the road (x axis unless a direction is given) through the point
        const half = def.moving.travel / 2;
        const dir = opts.direction || { x: Math.random() < 0.5 ? 1 : -1, z: 0 };
        o.position = { x: pos.x - dir.x * half, y: pos.y ?? 1, z: pos.z - dir.z * half };
        o.moveTo = { x: pos.x + dir.x * half, y: pos.y ?? 1, z: pos.z + dir.z * half };
        o.rate = 1;
      }
      const h = voice(name, def.priority || 1, buf, o);
      first = first || h;
    }
    return first;
  }

  // ---- footsteps --------------------------------------------------------------
  let lastStep = -1;
  /**
   * @param {string} surface
   * @param {{run?: boolean, position?: {x:number,y?:number,z:number}, volume?: number, when?: number}} [opts]
   */
  function footstep(surface, opts = {}) {
    const s = SURFACES.includes(surface) ? surface : 'concrete';
    const run = !!opts.run;
    const variants = baker.get('footsteps', { surface: s, run });
    if (!variants) return null;
    const t = Math.max(now(), opts.when ?? now());
    if (!opts.position && Math.abs(t - lastStep) < 0.11) return null; // guard against double-fired steps
    if (!opts.position) lastStep = t;
    const p = footstepParams(s, run);
    const buf = pickVariant('fs:' + s + run, variants);
    const pos = opts.position || null;
    const d = pos ? distanceTo(pos) : 0;
    if (pos && d > 25) return null;
    return voice('footstep', 1, buf, {
      when: t,
      gain: p.gain * (opts.volume ?? 1) * (0.85 + Math.random() * 0.25),
      rate: p.rate * (0.95 + Math.random() * 0.1),
      pan: pos ? 0 : (Math.random() - 0.5) * 0.08,
      position: pos, ref: 2, rolloff: 1.2,
      reverb: roomWet * (s === 'tile' || s === 'wood' ? 1.4 : 0.9),
      out: buses.foot,
    });
  }

  // ---- listener -----------------------------------------------------------------
  /** @param {{x:number,y:number,z:number}} pos @param {{x:number,y:number,z:number}} fwd unit forward */
  function setListener(pos, fwd) {
    const L = ac.listener;
    listener.x = pos.x; listener.y = (pos.y ?? 0) + 1.6; listener.z = pos.z;
    if (L.positionX) {
      L.positionX.value = listener.x; L.positionY.value = listener.y; L.positionZ.value = listener.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(listener.x, listener.y, listener.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // ---- zones, music placement ------------------------------------------------
  const engine = {
    ac, baker, quality, buses, master, reverbIn, glide: (p, v, tau) => glide(p, v, ac, tau),
    playBuffer, voice, play, footstep, setListener,
    get listener() { return { ...listener }; },
    get zone() { return zone; },
    get voices() { return pool.active(now()); },
  };

  const ambience = createAmbience(engine);
  const music = createMusic(engine);
  engine.ambience = ambience;
  engine.music = music;

  /** Apply a zone: crossfade the ambience bed and re-place the music. */
  engine.setZone = (z, fade = 2.5) => {
    zone = resolveZone(z);
    roomWet = reverbFor(zone.ambience);
    ambience.set(zone.ambience, fade);
    const mm = musicMix(zone.placement);
    glide(musicLevel.gain, mm.gain, ac, fade / 4);
    glide(musicFilter.frequency, mm.lowpass, ac, fade / 4);
    glide(musicReverb.gain, mm.gain * mm.reverb * 0.25, ac, fade / 4);
    return zone;
  };

  /** Scheduling tick: call often (every ~50 ms) with a lookahead horizon in seconds. */
  engine.pump = (horizon = 0.3) => {
    const t = now();
    ambience.pump(t, horizon);
    music.pump(t, horizon);
  };

  /** Bake everything a set of features needs. */
  engine.preload = (what = ['footsteps', 'sfx']) => {
    const jobs = [];
    if (what.includes('footsteps')) for (const s of SURFACES) for (const run of [false, true]) jobs.push(baker.load('footsteps', { surface: s, run }));
    if (what.includes('sfx')) for (const def of Object.values(SOUNDS)) { jobs.push(baker.load(def.recipe, def.args)); if (def.moving) jobs.push(baker.load(def.moving.recipe, def.moving.args)); }
    for (const a of what) if (ambience.recipes[a]) for (const [r, args] of ambience.recipes[a]) jobs.push(baker.load(r, args));
    if (what.includes('music')) jobs.push(music.load());
    return Promise.all(jobs);
  };

  engine.setVolumes = (v) => {
    if (v.sfx != null) { glide(buses.sfx.gain, v.sfx, ac); glide(buses.foot.gain, v.sfx, ac); }
    if (v.ambience != null) glide(buses.ambience.gain, 0.9 * v.ambience, ac);
    if (v.music != null) glide(musicVol.gain, v.music, ac, 0.1);
    if (v.master != null) glide(master.gain, v.master, ac);
  };

  engine.dispose = () => {
    ambience.dispose();
    music.dispose();
    for (const h of live.values()) h.stop();
    try { limiter.disconnect(); } catch { /* ignore */ }
  };

  return engine;
}
