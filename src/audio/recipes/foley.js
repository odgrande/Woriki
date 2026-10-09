// Foley: footsteps per surface, hand claps, door, wooden creaks.
import {
  Biquad, rng, rand, makeSound, addModes, noiseBurst, normalize, fades, mixInto, trimTail, TAU,
} from './dsp.js';

const SR = 32000;

/**
 * Surface models. Every step = heel strike + forefoot (toe) strike, each made of
 * a filtered noise transient, a low "thump" of the body/floor and surface-specific
 * texture (grit grains, modal clicks, hollow resonances, fabric rustle).
 */
export const SURFACES = {
  asphalt: {
    heel: { a: 0.0008, d: 0.014, hp: 160, bp: 1700, q: 0.7, lvl: 0.5 },
    thump: { f: 82, d: 0.03, lvl: 0.32 },
    grit: { n: 10, spread: 0.035, bp: 3800, q: 0.9, lvl: 0.55, len: 0.0011 },
    scuff: { bp: 2600, q: 0.8, lvl: 0.05 },
    gap: 0.085, toe: 0.55, out: 0.5,
  },
  concrete: {
    heel: { a: 0.0006, d: 0.011, hp: 220, bp: 2200, q: 0.8, lvl: 0.6 },
    thump: { f: 96, d: 0.026, lvl: 0.28 },
    grit: { n: 3, spread: 0.02, bp: 4300, q: 1.0, lvl: 0.25, len: 0.0009 },
    scuff: { bp: 3000, q: 0.8, lvl: 0.04 },
    gap: 0.08, toe: 0.55, out: 0.52,
  },
  tile: {
    heel: { a: 0.0002, d: 0.0045, hp: 1400, bp: 3400, q: 1.1, lvl: 0.7 },
    click: [[2500, 0.022], [4150, 0.016], [6050, 0.01], [7900, 0.007]],
    thump: { f: 118, d: 0.018, lvl: 0.16 },
    gap: 0.09, toe: 0.45, out: 0.55,
  },
  carpet: {
    heel: { a: 0.006, d: 0.035, lp: 620, lvl: 0.55 },
    thump: { f: 66, d: 0.05, lvl: 0.55 },
    rustle: { bp: 3200, q: 0.7, lvl: 0.035 },
    gap: 0.1, toe: 0.6, out: 0.3,
  },
  wood: {
    heel: { a: 0.0006, d: 0.007, hp: 400, bp: 1500, q: 1.4, lvl: 0.35 },
    modes: [[160, 0.11, 1], [285, 0.08, 0.7], [505, 0.05, 0.45], [960, 0.028, 0.3], [1850, 0.014, 0.18]],
    thump: { f: 102, d: 0.08, lvl: 0.45 },
    gap: 0.085, toe: 0.55, out: 0.55,
  },
  dirt: {
    heel: { a: 0.002, d: 0.045, lp: 1250, lvl: 0.35 },
    thump: { f: 74, d: 0.05, lvl: 0.38 },
    grit: { n: 26, spread: 0.11, bp: 2400, q: 0.7, lvl: 0.7, len: 0.0018 },
    gap: 0.09, toe: 0.6, out: 0.55,
  },
};

/** One foot impact (heel or toe) into buf. */
function impact(buf, t0, sr, r, s, A, run) {
  const i0 = Math.floor(t0 * sr);
  const j = () => rand(r, 0.88, 1.12);
  // filtered noise transient
  const h = s.heel;
  const filters = [];
  if (h.hp) filters.push(new Biquad('highpass', h.hp * j(), 0.7, sr));
  if (h.bp) filters.push(new Biquad('bandpass', h.bp * j(), h.q, sr));
  if (h.lp) filters.push(new Biquad('lowpass', h.lp * j(), 0.8, sr));
  const gainComp = h.bp ? 2.2 : 1; // bandpass loses level
  noiseBurst(buf, i0, sr, r, { a: h.a * j(), d: h.d * j() * (run ? 0.85 : 1), lvl: h.lvl * A * gainComp, filters });
  // low thump with a tiny downward pitch glide (floor + body)
  const th = s.thump;
  {
    const f0 = th.f * j();
    const n = Math.min(buf.length - i0, Math.ceil(th.d * 7 * sr));
    const k = Math.exp(-1 / (th.d * sr));
    let env = 1, ph = 0;
    const ia = Math.floor(0.0015 * sr);
    for (let i = 0; i < n; i++) {
      const f = f0 * (1 + 0.35 * Math.exp(-i / (0.008 * sr)));
      ph += TAU * f / sr;
      env *= k;
      const a = i < ia ? i / ia : 1;
      buf[i0 + i] += Math.sin(ph) * env * a * th.lvl * A * (run ? 1.3 : 1);
    }
  }
  // grit grains: tiny clicks scattered after the impact, filtered as one layer
  if (s.grit) {
    const g = s.grit;
    const spread = g.spread * (run ? 0.8 : 1);
    const n = Math.ceil((spread + 0.02) * sr);
    const tmp = new Float32Array(n);
    const count = Math.round(g.n * (run ? 1.4 : 1) * rand(r, 0.75, 1.25));
    for (let k = 0; k < count; k++) {
      const at = Math.floor(Math.pow(r(), 1.6) * spread * sr);
      const len = Math.max(3, Math.floor(g.len * rand(r, 0.5, 1.5) * sr));
      const amp = rand(r, 0.25, 1) * Math.exp(-at / (spread * sr) * 1.2);
      for (let i = 0; i < len && at + i < n; i++) tmp[at + i] += (r() * 2 - 1) * amp * (1 - i / len);
    }
    const bp = new Biquad('bandpass', g.bp * j(), g.q, sr);
    const hp = new Biquad('highpass', 700, 0.7, sr);
    for (let i = 0; i < n && i0 + i < buf.length; i++) buf[i0 + i] += hp.process(bp.process(tmp[i])) * g.lvl * A * 2;
  }
  // ceramic click: hard heel on tiles
  if (s.click) {
    addModes(buf, i0, sr, s.click.map(([f, t60], k) => ({ f: f * j(), a: (0.5 / (k + 1)) * rand(r, 0.6, 1.2), t60: t60 * j(), phase: r() * TAU })), A * 0.55);
  }
  // hollow wooden floor resonances
  if (s.modes) {
    addModes(buf, i0, sr, s.modes.map(([f, t60, a]) => ({ f: f * rand(r, 0.92, 1.08), a: a * rand(r, 0.7, 1.2), t60: t60 * j(), phase: r() * TAU })), A * 0.9);
  }
}

/** Soft sliding noise between heel and toe (shoe sole, fabric). */
function slide(buf, t0, dur, sr, r, bp, q, lvl) {
  const i0 = Math.floor(t0 * sr), n = Math.min(buf.length - i0, Math.floor(dur * sr));
  const f = new Biquad('bandpass', bp * rand(r, 0.85, 1.15), q, sr);
  for (let i = 0; i < n; i++) {
    const e = Math.sin(Math.PI * i / n);
    buf[i0 + i] += f.process(r() * 2 - 1) * e * e * lvl * 2.5;
  }
}

/**
 * A set of footstep variants for a surface.
 * @param {{surface?: string, run?: boolean, count?: number, seed?: number}} o
 */
export function footsteps({ surface = 'concrete', run = false, count = 4, seed = 1 } = {}) {
  const s = SURFACES[surface] || SURFACES.concrete;
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 977 + v * 131 + surface.length * 17 + (run ? 7 : 0));
    const gap = run ? rand(r, 0.022, 0.038) : s.gap * rand(r, 0.85, 1.15);
    const snd = makeSound(SR, gap + 0.3, 1);
    const buf = snd.channels[0];
    const t0 = 0.002;
    impact(buf, t0, SR, r, s, run ? 1 : rand(r, 0.85, 1), run);
    if (s.scuff) slide(buf, t0 + 0.006, gap, SR, r, s.scuff.bp, s.scuff.q, s.scuff.lvl * (run ? 1.6 : 1));
    if (s.rustle) slide(buf, t0, gap + 0.06, SR, r, s.rustle.bp, s.rustle.q, s.rustle.lvl);
    impact(buf, t0 + gap, SR, r, s, s.toe * (run ? 1.45 : 1) * rand(r, 0.8, 1.1), run);
    out.push(snd);
  }
  // normalise the whole set together so variants keep their relative loudness
  let p = 0;
  for (const snd of out) for (const x of snd.channels[0]) p = Math.max(p, Math.abs(x));
  const k = (s.out * (run ? 1.15 : 1)) / Math.max(p, 1e-6);
  for (const snd of out) { const b = snd.channels[0]; for (let i = 0; i < b.length; i++) b[i] *= k; fades(snd, 0, 0.03); }
  return out.map((snd) => trimTail(snd, 2e-4, 0.01));
}

/** A single hand clap (mono). */
export function clapSample(r, sr = SR) {
  const snd = makeSound(sr, 0.22, 1);
  const b = snd.channels[0];
  // the slap: very fast noise impulse, energy 1–3 kHz
  noiseBurst(b, 0, sr, r, {
    a: 0.0004, d: rand(r, 0.0055, 0.01), lvl: 2.4,
    filters: [new Biquad('highpass', 320, 0.7, sr), new Biquad('bandpass', rand(r, 1000, 1900), rand(r, 0.8, 1.3), sr)],
  });
  // air cavity between the palms rings briefly
  addModes(b, 0, sr, [{ f: rand(r, 520, 1150), a: 0.45, t60: rand(r, 0.018, 0.035), phase: 0 }]);
  // short body of air / skin
  noiseBurst(b, 0, sr, r, { a: 0.001, d: 0.03, lvl: 0.12, filters: [new Biquad('lowpass', 2600, 0.7, sr)] });
  return b;
}

/** Variants of one clap, for repeated clapping. */
export function clap({ count = 6, seed = 3 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 41 + v * 7);
    const snd = { sampleRate: SR, channels: [clapSample(r)] };
    out.push(trimTail(normalize(snd, rand(r, 0.75, 0.9)), 2e-4, 0.01));
  }
  return out;
}

/** Many people clapping together (church congregation), stereo. */
export function crowdClap({ count = 3, people = 9, seed = 5, spread = 0.014 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 59 + v * 13);
    const snd = makeSound(SR, 0.3, 2);
    for (let p = 0; p < people; p++) {
      const c = clapSample(r);
      const off = Math.floor((0.02 + (r() + r() + r() - 1.5) * spread) * SR);
      mixInto(snd, c, Math.max(0, off), rand(r, 0.35, 1) / Math.sqrt(people) * 1.8, rand(r, -0.9, 0.9));
    }
    out.push(trimTail(normalize(snd, 0.85), 2e-4, 0.01));
  }
  return out;
}

/** Stick-slip creak: pulse train with wandering rate exciting wood/hinge resonances. */
function creakInto(buf, start, dur, sr, r, { rate = [70, 200, 130], res = [[900, 12], [1750, 10], [2900, 8], [230, 6]], lvl = 1 } = {}) {
  const n = Math.min(buf.length - start, Math.floor(dur * sr));
  const exc = new Float32Array(n);
  let next = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    // piecewise contour through the 3 rate points
    const f = u < 0.5 ? rate[0] + (rate[1] - rate[0]) * (u / 0.5) : rate[1] + (rate[2] - rate[1]) * ((u - 0.5) / 0.5);
    if (i >= next) {
      const env = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.7;
      exc[i] = env * rand(r, 0.5, 1.0);
      next = i + Math.max(2, Math.round((sr / f) * rand(r, 0.9, 1.1)));
    }
  }
  const banks = res.map(([f, q]) => new Biquad('bandpass', f * rand(r, 0.92, 1.08), q, sr));
  const gains = res.map((_, k) => 1 / (k + 1) ** 0.4);
  for (let i = 0; i < n; i++) {
    let y = 0;
    for (let k = 0; k < banks.length; k++) y += banks[k].process(exc[i]) * gains[k];
    buf[start + i] += y * lvl * 3;
  }
}

/** Door opening: handle + latch clicks, hinge creak, soft stop thud. */
export function door({ seed = 11 } = {}) {
  const r = rng(seed);
  const snd = makeSound(SR, 1.6, 1);
  const b = snd.channels[0];
  const metal = (t, a) => {
    const i = Math.floor(t * SR);
    noiseBurst(b, i, SR, r, { a: 0.0002, d: 0.002, lvl: a * 0.8, filters: [new Biquad('highpass', 2500, 0.7, SR)] });
    addModes(b, i, SR, [
      { f: rand(r, 2700, 3100), a: 0.5, t60: 0.05 }, { f: rand(r, 4400, 4900), a: 0.35, t60: 0.035 },
      { f: rand(r, 6600, 7200), a: 0.25, t60: 0.02 }, { f: rand(r, 1250, 1450), a: 0.3, t60: 0.06 },
    ], a);
  };
  metal(0.01, 0.6); // handle down
  metal(0.075, 0.9); // latch releases
  creakInto(b, Math.floor(0.16 * SR), 0.78, SR, r, { rate: [55, 190, 120], lvl: 1.6 });
  // door stops against the wall / stopper: soft wooden thump
  const t = Math.floor(1.02 * SR);
  noiseBurst(b, t, SR, r, { a: 0.002, d: 0.02, lvl: 0.45, filters: [new Biquad('lowpass', 1400, 0.7, SR)] });
  addModes(b, t, SR, [{ f: 105, a: 0.25, t60: 0.15 }, { f: 230, a: 0.3, t60: 0.12 }, { f: 480, a: 0.22, t60: 0.08 }, { f: 1100, a: 0.08, t60: 0.04 }]);
  return [trimTail(normalize(snd, 0.8), 2e-4, 0.02)];
}

/** Wooden pew / chair creaks (church ambience). */
export function creak({ count = 2, seed = 21 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed + v * 17);
    const dur = rand(r, 0.35, 0.7);
    const snd = makeSound(SR, dur + 0.2, 1);
    creakInto(snd.channels[0], 0, dur, SR, r, {
      rate: [rand(r, 25, 50), rand(r, 80, 140), rand(r, 40, 90)],
      res: [[rand(r, 380, 480), 9], [rand(r, 900, 1050), 10], [rand(r, 1800, 2100), 8], [170, 5]],
      lvl: 0.6,
    });
    out.push(trimTail(normalize(snd, 0.7), 2e-4, 0.02));
  }
  return out;
}

