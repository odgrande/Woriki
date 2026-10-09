// Sampled instruments for the gospel praise groove, baked per note:
// electric piano (two-operator FM with a tine), plucked bass and clean highlife guitar
// (extended Karplus–Strong), kick, shaker (bead grains), congas and the Yoruba talking drum
// (dùndún) with its squeezed pitch bends.
import { Biquad, OnePole, rng, rand, makeSound, normalize, fades, addModes, noiseBurst, softClip, mtof, trimTail, TAU } from './dsp.js';

/** Electric piano note (Rhodes-like FM: body 1:1 with decaying index + 14:1 tine). */
export function ep({ midi = 60, seconds = 1.3, seed = 61 } = {}) {
  const r = rng(seed + midi);
  const sr = 32000;
  const snd = makeSound(sr, seconds, 1);
  const b = snd.channels[0];
  const f = mtof(midi);
  const tau = 1.25 * Math.pow(2, -(midi - 60) / 24);
  const w = TAU * f / sr;
  const tineRatio = f * 14 < sr * 0.45 ? 14 : 7;
  const hp = new Biquad('highpass', 35, 0.7, sr);
  const ph0 = r() * 0.2;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    const I = 1.7 * Math.exp(-t / 0.22) + 0.32;
    const ph = w * i + ph0;
    const body = Math.sin(ph + I * Math.sin(ph));
    const tine = Math.sin(ph + 1.4 * Math.exp(-t / 0.035) * Math.sin(ph * tineRatio));
    const amp = (1 - Math.exp(-t / 0.0012)) * Math.exp(-t / tau);
    let y = (body + 0.28 * tine * Math.exp(-t / 0.12)) * amp;
    y = y + 0.18 * y * y; // pickup asymmetry → warm 2nd harmonic
    b[i] = hp.process(softClip(y * 1.2) * 0.8);
  }
  fades(snd, 0, 0.05);
  return [normalize(snd, 0.8)];
}

/** Extended Karplus–Strong plucked string with fractional-delay tuning. */
function pluck(b, sr, f, r, { t60 = 2.5, bright = 0.5, pickPos = 0.18 } = {}) {
  const total = sr / f;
  let D = Math.floor(total - 0.5), frac = total - 0.5 - D;
  if (frac < 0.15) { D -= 1; frac += 1; }
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(D);
  // excitation: noise shaped by pick brightness and pick position comb
  const lp = new OnePole(800 + bright * 7000, sr);
  for (let i = 0; i < D; i++) line[i] = lp.process(r() * 2 - 1);
  const pp = Math.max(1, Math.round(pickPos * D));
  const exc = line.slice();
  for (let i = 0; i < D; i++) line[i] = exc[i] - 0.9 * exc[(i - pp + D) % D];
  let mean = 0; for (let i = 0; i < D; i++) mean += line[i]; mean /= D;
  for (let i = 0; i < D; i++) line[i] -= mean;
  const rho = Math.pow(10, -3 / (t60 * f));
  let idx = 0, prev = 0, apx = 0, apy = 0;
  for (let i = 0; i < b.length; i++) {
    const out = line[idx];
    const filt = rho * (0.5 * out + 0.5 * prev);
    prev = out;
    const ap = c * filt + apx - c * apy;
    apx = filt; apy = ap;
    line[idx] = ap;
    idx++; if (idx >= D) idx = 0;
    b[i] += out;
  }
}

/** Finger-plucked electric bass note. */
export function bass({ midi = 43, seconds = 1.8, seed = 67 } = {}) {
  const r = rng(seed + midi);
  const sr = 22050;
  const snd = makeSound(sr, seconds, 1);
  const b = snd.channels[0];
  const f = mtof(midi);
  pluck(b, sr, f, r, { t60: 3.2, bright: 0.25, pickPos: 0.22 });
  // round fundamental from the pickup + finger thump
  const w = TAU * f / sr;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    b[i] = b[i] * 0.7 + Math.sin(w * i) * 0.55 * Math.exp(-t / 0.9) * (1 - Math.exp(-t / 0.003));
  }
  const lp = new Biquad('lowpass', 2200, 0.7, sr), pk = new Biquad('peaking', 700, 1, sr, 3);
  for (let i = 0; i < b.length; i++) b[i] = softClip(pk.process(lp.process(b[i])) * 1.3);
  fades(snd, 0, 0.05);
  return [normalize(snd, 0.85)];
}

/** Clean electric guitar note (highlife picking). */
export function guitar({ midi = 64, seconds = 1.1, seed = 71 } = {}) {
  const r = rng(seed + midi);
  const sr = 32000;
  const snd = makeSound(sr, seconds, 1);
  const b = snd.channels[0];
  pluck(b, sr, mtof(midi), r, { t60: 1.6, bright: 0.75, pickPos: 0.13 });
  const body = new Biquad('peaking', 2600, 1.2, sr, 4), lo = new Biquad('highpass', 90, 0.7, sr), hi = new Biquad('lowpass', 7000, 0.7, sr);
  for (let i = 0; i < b.length; i++) b[i] = hi.process(body.process(lo.process(b[i])));
  noiseBurst(b, 0, sr, r, { a: 0.0002, d: 0.002, lvl: 0.15, filters: [new Biquad('highpass', 2000, 0.7, sr)] });
  fades(snd, 0, 0.05);
  return [normalize(snd, 0.8)];
}

/** Soft church kick drum (with harmonics so it reads on phone speakers). */
export function kick({ seed = 73 } = {}) {
  const r = rng(seed);
  const sr = 32000;
  const snd = makeSound(sr, 0.5, 1);
  const b = snd.channels[0];
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    const f = 52 + 75 * Math.exp(-t / 0.028);
    ph += TAU * f / sr;
    b[i] = softClip(Math.sin(ph) * Math.exp(-t / 0.16) * 1.8) * 0.8;
  }
  noiseBurst(b, 0, sr, r, { a: 0.0002, d: 0.003, lvl: 0.25, filters: [new Biquad('bandpass', 2500, 0.8, sr)] });
  addModes(b, 0, sr, [{ f: 180, a: 0.15, t60: 0.12 }]);
  return [trimTail(normalize(snd, 0.85), 1e-4, 0.01)];
}

/** Shaker: bursts of bead micro-impacts. Variants alternate push/pull strokes. */
export function shaker({ count = 4, seed = 79 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed + v * 7);
    const sr = 32000;
    const snd = makeSound(sr, 0.16, 1);
    const b = snd.channels[0];
    const push = v % 2 === 0;
    const att = push ? 0.006 : 0.014, dec = push ? 0.03 : 0.045;
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      const env = t < att ? t / att : Math.exp(-(t - att) / dec);
      if (r() < env * 0.22) b[i] += (r() * 2 - 1) * rand(r, 0.3, 1);
    }
    const hp = new Biquad('highpass', 4200, 0.7, sr), bp = new Biquad('peaking', push ? 7600 : 6400, 1, sr, 5);
    hp.run(b); bp.run(b);
    out.push(trimTail(normalize(snd, 0.7), 1e-4, 0.005));
  }
  return out;
}

/** Conga hits: 'low' open, 'high' open, 'slap'. */
export function conga({ seed = 83 } = {}) {
  const sr = 32000;
  const kinds = [['low', 196], ['high', 262], ['slap', 262]];
  return kinds.map(([kind, f0], k) => {
    const r = rng(seed + k);
    const snd = makeSound(sr, 0.6, 1);
    const b = snd.channels[0];
    const slap = kind === 'slap';
    const ratios = [1, 1.47, 1.98, 2.44, 2.9], amps = [1, 0.6, 0.35, 0.2, 0.1], t60s = [0.42, 0.24, 0.16, 0.11, 0.08];
    // membrane pitch drops slightly after the strike
    const phs = ratios.map(() => r() * TAU);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      const bend = 1 + 0.045 * Math.exp(-t / 0.018);
      let y = 0;
      for (let m = 0; m < ratios.length; m++) {
        const tt = t60s[m] * (slap ? 0.45 : 1);
        y += Math.sin(phs[m] + TAU * f0 * ratios[m] * bend * t) * amps[m] * Math.exp(-t * 6.9 / tt);
      }
      b[i] = y * 0.4;
    }
    noiseBurst(b, 0, sr, r, { a: 0.0003, d: slap ? 0.012 : 0.004, lvl: slap ? 1.2 : 0.35, filters: [new Biquad('bandpass', slap ? 1900 : 1200, 0.8, sr)] });
    return trimTail(normalize(snd, 0.8), 1e-4, 0.01);
  });
}

/** Talking drum strokes with pitch glides: up, down, high, low, bend. */
export function talkingDrum({ seed = 89 } = {}) {
  const sr = 32000;
  const strokes = [
    { name: 'up', f: (t) => 148 + 92 * (1 - Math.exp(-t / 0.06)), t60: 0.6 },
    { name: 'down', f: (t) => 150 + 85 * Math.exp(-t / 0.08), t60: 0.55 },
    { name: 'high', f: (t) => 238 + 8 * Math.exp(-t / 0.02), t60: 0.3 },
    { name: 'low', f: (t) => 138 + 8 * Math.exp(-t / 0.02), t60: 0.55 },
    { name: 'bend', f: (t) => 165 + 62 * (1 - Math.exp(-t / 0.05)) - (t > 0.15 ? 45 * (1 - Math.exp(-(t - 0.15) / 0.08)) : 0), t60: 0.7 },
  ];
  return strokes.map((s, k) => {
    const r = rng(seed + k * 3);
    const snd = makeSound(sr, s.t60 * 1.2 + 0.05, 1);
    const b = snd.channels[0];
    const ratios = [1, 1.52, 2.03, 2.6], amps = [1, 0.45, 0.22, 0.1];
    const phs = ratios.map(() => 0);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      const f = s.f(t);
      let y = 0;
      for (let m = 0; m < ratios.length; m++) {
        phs[m] += TAU * f * ratios[m] / sr;
        y += Math.sin(phs[m]) * amps[m] * Math.exp(-t * 6.9 / (s.t60 / (1 + m * 0.6)));
      }
      b[i] = softClip(y * 0.9) * 0.6;
    }
    noiseBurst(b, 0, sr, r, { a: 0.0002, d: 0.003, lvl: 0.45, filters: [new Biquad('bandpass', 1400, 1, sr)] });
    return trimTail(normalize(snd, 0.8), 1e-4, 0.01);
  });
}
