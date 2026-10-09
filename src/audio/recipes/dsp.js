// Tiny sample-level DSP toolkit used to "bake" procedural sounds into PCM.
// Runs in a Web Worker (or on the main thread as a fallback) and in Node for tests,
// so it must not touch the DOM or Web Audio.

export const TAU = Math.PI * 2;
const LN1000 = 6.907755278982137; // ln(1000): T60 helper

/**
 * @typedef {{ sampleRate: number, channels: Float32Array[] }} Sound
 */

/** Deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [a, b). */
export const rand = (r, a, b) => a + (b - a) * r();
/** Random sign (+1/-1). */
export const sign = (r) => (r() < 0.5 ? -1 : 1);
/** Pick one item. */
export const pick = (r, list) => list[Math.floor(r() * list.length)];

/** Allocate a silent sound. */
export function makeSound(sampleRate, seconds, channels = 1) {
  const n = Math.max(1, Math.ceil(seconds * sampleRate));
  return { sampleRate, channels: Array.from({ length: channels }, () => new Float32Array(n)) };
}

/** Per-sample multiplier that decays by 60 dB in `t60` seconds. */
export const decayCoef = (t60, sr) => Math.exp(-LN1000 / (Math.max(1e-4, t60) * sr));

/** MIDI note number to Hz. */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * RBJ cookbook biquad, transposed direct form II.
 * Types: lowpass, highpass, bandpass (0 dB peak), peaking, lowshelf, highshelf, notch.
 */
export class Biquad {
  constructor(type = 'lowpass', freq = 1000, q = 0.707, sr = 44100, gainDb = 0) {
    this.z1 = 0; this.z2 = 0;
    this.set(type, freq, q, sr, gainDb);
  }

  set(type, freq, q, sr, gainDb = 0) {
    const f = Math.min(Math.max(freq, 10), sr * 0.49);
    const w = TAU * f / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Math.max(q, 1e-3));
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peaking':
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
        a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
        a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
      }
      default: // lowpass
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }

  process(x) {
    x += 1e-20; // keeps decaying states out of (slow) denormal range
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** Filter a whole array in place (or a [from, to) slice). */
  run(buf, from = 0, to = buf.length) {
    for (let i = from; i < to; i++) buf[i] = this.process(buf[i]);
    return buf;
  }

  reset() { this.z1 = 0; this.z2 = 0; return this; }
}

/** One-pole lowpass (6 dB/oct), cheap smoothing. */
export class OnePole {
  constructor(freq = 1000, sr = 44100) { this.y = 0; this.set(freq, sr); }
  set(freq, sr) { this.a = 1 - Math.exp(-TAU * Math.min(freq, sr * 0.49) / sr); return this; }
  process(x) { this.y += this.a * (x + 1e-20 - this.y); return this.y; }
}

/** Pink noise generator (Paul Kellet's refined method). */
export class Pink {
  constructor(r) { this.r = r; this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0; }
  next() {
    const w = this.r() * 2 - 1;
    this.b0 = 0.99886 * this.b0 + w * 0.0555179;
    this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.969 * this.b2 + w * 0.153852;
    this.b3 = 0.8665 * this.b3 + w * 0.3104856;
    this.b4 = 0.55 * this.b4 + w * 0.5329522;
    this.b5 = -0.7616 * this.b5 - w * 0.016898;
    const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362;
    this.b6 = w * 0.115926;
    return out * 0.11;
  }
}

/** Brown (red) noise: leaky integrated white noise. */
export class Brown {
  constructor(r) { this.r = r; this.y = 0; }
  next() { this.y = (this.y + 0.02 * (this.r() * 2 - 1)) / 1.02; return this.y * 3.5; }
}

/** PolyBLEP residual for band-limited saw/square. t = phase [0,1), dt = phase increment. */
export function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Band-limited sawtooth oscillator with per-sample frequency. */
export class Saw {
  constructor(phase = 0) { this.p = phase; }
  next(freq, sr) {
    const dt = freq / sr;
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return 2 * this.p - 1 - polyblep(this.p, dt);
  }
}

/** Soft clipper (tanh-like, cheap). */
export function softClip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

/**
 * Add exponentially-decaying sinusoids (modal synthesis) using a recursive oscillator.
 * modes: [{ f, a, t60, phase? }]
 */
export function addModes(buf, start, sr, modes, gain = 1, maxLen = Infinity) {
  const n = buf.length;
  for (const m of modes) {
    if (!(m.f > 0) || m.f >= sr * 0.48 || !m.a) continue;
    const w = TAU * m.f / sr;
    const r = decayCoef(m.t60, sr);
    const len = Math.min(n - start, Math.ceil(m.t60 * 1.15 * sr), maxLen);
    if (len <= 2) continue;
    const ph = m.phase || 0;
    const c = 2 * r * Math.cos(w), r2 = r * r;
    const a = m.a * gain;
    let y2 = a * Math.sin(ph - w) / r; // y[-1]
    let y1 = a * Math.sin(ph);          // y[0]
    const i0 = Math.max(0, start);
    buf[i0] += y1;
    for (let i = 1; i < len; i++) {
      const y = c * y1 - r2 * y2;
      y2 = y1; y1 = y;
      buf[i0 + i] += y;
    }
  }
  return buf;
}

/** Peak absolute value across channels. */
export function peakOf(sound) {
  let p = 0;
  for (const ch of sound.channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > p) p = v; }
  return p;
}

/** Root-mean-square across channels. */
export function rmsOf(sound) {
  let s = 0, n = 0;
  for (const ch of sound.channels) { for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i]; n += ch.length; }
  return Math.sqrt(s / Math.max(1, n));
}

/** Scale so the peak equals `target`. */
export function normalize(sound, target = 0.9) {
  const p = peakOf(sound);
  if (p > 1e-9) { const k = target / p; for (const ch of sound.channels) for (let i = 0; i < ch.length; i++) ch[i] *= k; }
  return sound;
}

/** Scale a sound by a constant. */
export function scale(sound, k) {
  for (const ch of sound.channels) for (let i = 0; i < ch.length; i++) ch[i] *= k;
  return sound;
}

/** Linear fade in / fade out (seconds). */
export function fades(sound, inSec = 0.002, outSec = 0.02) {
  const sr = sound.sampleRate;
  for (const ch of sound.channels) {
    const n = ch.length;
    const fi = Math.min(n, Math.floor(inSec * sr)), fo = Math.min(n, Math.floor(outSec * sr));
    for (let i = 0; i < fi; i++) ch[i] *= i / fi;
    for (let i = 0; i < fo; i++) ch[n - 1 - i] *= i / fo;
  }
  return sound;
}

/**
 * Make a seamless loop: the sound must have been rendered `xfade` seconds longer than the loop.
 * The tail is cross-faded (equal power) into the head and then cut off.
 */
export function loopify(sound, xfade) {
  const sr = sound.sampleRate;
  const x = Math.floor(xfade * sr);
  sound.channels = sound.channels.map((ch) => {
    const L = ch.length - x;
    const out = ch.slice(0, L);
    for (let i = 0; i < x; i++) {
      const t = i / x;
      out[i] = ch[i] * Math.sin(t * Math.PI / 2) + ch[L + i] * Math.cos(t * Math.PI / 2);
    }
    return out;
  });
  return sound;
}

/** Trim trailing near-silence (keeps a short tail). */
export function trimTail(sound, threshold = 1e-4, keep = 0.01) {
  const sr = sound.sampleRate;
  let last = 0;
  for (const ch of sound.channels) for (let i = ch.length - 1; i > last; i--) if (Math.abs(ch[i]) > threshold) { last = i; break; }
  const n = Math.min(sound.channels[0].length, last + Math.floor(keep * sr));
  sound.channels = sound.channels.map((ch) => ch.slice(0, n));
  return fades(sound, 0, Math.min(0.01, n / sr / 4));
}

/** Equal-power pan gains for p in [-1, 1]. */
export function panGains(p) {
  const a = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** Mix a mono array into a stereo sound at an offset with pan and gain. */
export function mixInto(dest, src, offset = 0, gain = 1, pan = 0) {
  const [gl, gr] = panGains(pan);
  const L = dest.channels[0], R = dest.channels[1] || dest.channels[0];
  const stereo = dest.channels.length > 1;
  const n = Math.min(src.length, L.length - offset);
  for (let i = Math.max(0, -offset); i < n; i++) {
    const v = src[i] * gain;
    if (stereo) { L[offset + i] += v * gl; R[offset + i] += v * gr; } else L[offset + i] += v;
  }
  return dest;
}

/**
 * Noise burst with attack/decay envelope added into buf at `start` (samples), through optional filters.
 * opts: { a: attack s, d: decay time-constant s, lvl, filters: Biquad[] , r }
 */
export function noiseBurst(buf, start, sr, r, { a = 0.001, d = 0.02, lvl = 1, filters = [], len } = {}) {
  const n = Math.min(buf.length - start, Math.ceil((len ?? a + d * 7) * sr));
  const ia = Math.max(1, Math.floor(a * sr));
  const k = Math.exp(-1 / (d * sr));
  let env = 1;
  for (let i = 0; i < n; i++) {
    let e;
    if (i < ia) e = i / ia; else { env *= k; e = env; }
    let x = (r() * 2 - 1) * e;
    for (let f = 0; f < filters.length; f++) x = filters[f].process(x);
    buf[start + i] += x * lvl;
  }
  return buf;
}
