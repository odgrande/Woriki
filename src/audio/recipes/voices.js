// Human voices by formant synthesis: a crowd/hawker babble loop (talkers speaking a
// tonal, syllabic pseudo-language with phrase declination — reads as distant Yoruba/Pidgin
// chatter), market hawker calls, and a choir singing "A-men" (plagal cadence).
import { Biquad, OnePole, Saw, rng, rand, pick, makeSound, normalize, fades, loopify, panGains, trimTail, mtof, TAU } from './dsp.js';

/** Spoken vowel formants (male, Hz) — Peterson & Barney style averages. */
const SPOKEN = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [290, 2250, 2950], o: [570, 840, 2410], u: [320, 900, 2240], E: [500, 1500, 2500],
};
const BW = [80, 110, 160];
const VOWELS = ['a', 'a', 'e', 'e', 'i', 'o', 'o', 'u', 'E'];
const TONES = [1.17, 1.0, 1.0, 0.87]; // high / mid / low pitch levels of a tonal language

/**
 * Render one talker into a stereo sound.
 * script: optional fixed syllables [{v, d, p, c}] (vowel, duration, pitch ratio, consonant 'p'|'s'|'m'|'')
 */
function talker(out, r, { female = false, pan = 0, gain = 1, start = 0, end, shout = false, script = null, lp = 3500 }) {
  const sr = out.sampleRate;
  const L = out.channels[0], R = out.channels[1];
  const n = L.length;
  const f0Base = (female ? rand(r, 185, 240) : rand(r, 98, 135)) * (shout ? 1.65 : 1);
  const fScale = female ? [1.16, 1.2, 1.14] : [1, 1, 1];
  if (shout) fScale[0] *= 1.15;
  // build the syllable timeline
  const syl = [];
  let t = start + (script ? 0 : rand(r, 0, 0.6));
  const tEnd = end ?? n / sr;
  if (script) {
    for (const s of script) { syl.push({ t, d: s.d, v: s.v, p: s.p, c: s.c || '', a: s.a ?? 1, phrasePos: 0 }); t += s.d; }
  } else {
    while (t < tEnd) {
      const count = 3 + Math.floor(r() * 9);
      for (let k = 0; k < count && t < tEnd; k++) {
        const d = rand(r, 0.11, 0.26) * (k === count - 1 ? 1.5 : 1);
        syl.push({ t, d, v: pick(r, VOWELS), p: pick(r, TONES) * (1 + 0.04 * (r() * 2 - 1)), c: pick(r, ['', '', 'p', 's', 'm', 'p']), a: rand(r, 0.6, 1), phrasePos: k / count });
        t += d;
      }
      t += r() < 0.25 ? rand(r, 0.9, 2.2) : rand(r, 0.2, 0.7); // pauses (sometimes listening)
    }
  }
  const saw = new Saw(r());
  const tilt = new OnePole(900, sr);
  const bp = BW.map((bw, k) => new Biquad('bandpass', 1000, 5, sr));
  const fric = new Biquad('bandpass', Math.min(5200, sr * 0.4), 2, sr);
  const lpF = new Biquad('lowpass', Math.min(lp, sr * 0.45), 0.7, sr);
  const fCur = [500, 1500, 2500], fTgt = [500, 1500, 2500];
  let f0 = f0Base, f0Tgt = f0Base, env = 0, envTgt = 0, fricEnv = 0;
  const [gl, gr] = panGains(pan);
  let si = 0;
  const i0 = Math.max(0, Math.floor((syl[0]?.t ?? tEnd) * sr) - 64);
  const i1 = Math.min(n, Math.ceil(((syl.at(-1)?.t ?? 0) + (syl.at(-1)?.d ?? 0) + 0.15) * sr));
  const glide = 1 - Math.exp(-32 / (0.035 * sr)); // formant glide per 32-sample block
  const envUp = 1 - Math.exp(-1 / (0.018 * sr)), envDn = 1 - Math.exp(-1 / (0.03 * sr));
  for (let i = i0; i < i1; i++) {
    const ts = i / sr;
    if (i % 32 === 0) {
      while (si < syl.length - 1 && ts >= syl[si].t + syl[si].d) si++;
      const s = syl[si];
      const inSyl = ts >= s.t && ts < s.t + s.d;
      const u = inSyl ? (ts - s.t) / s.d : 1;
      const fm = SPOKEN[s.v];
      for (let k = 0; k < 3; k++) { fTgt[k] = fm[k] * fScale[k]; fCur[k] += (fTgt[k] - fCur[k]) * glide; }
      for (let k = 0; k < 3; k++) bp[k].set('bandpass', fCur[k], fCur[k] / BW[k], sr);
      const decl = script ? 1 : 1.1 - 0.22 * s.phrasePos;
      f0Tgt = f0Base * s.p * decl * (1 + 0.05 * Math.sin(Math.PI * u) * (script ? 0 : 1));
      // consonant shaping
      let a = inSyl ? s.a : 0;
      if (inSyl && s.c === 'p' && u < 0.12) a = 0; // plosive closure
      if (inSyl && s.c === 'm' && u < 0.15) a *= 0.3; // nasal murmur
      envTgt = a;
      fricEnv = inSyl && s.c === 's' && u < 0.22 ? 0.5 * s.a : (inSyl && s.c === 'p' && u >= 0.12 && u < 0.16 ? 0.8 * s.a : 0);
    }
    f0 += (f0Tgt - f0) * 0.004;
    env += (envTgt - env) * (envTgt > env ? envUp : envDn);
    const jitter = 1 + 0.012 * (r() * 2 - 1);
    const src = tilt.process(saw.next(f0 * jitter, sr)) * env;
    const asp = (r() * 2 - 1) * (env * 0.05 + fricEnv);
    const x = src + asp * 0.4;
    let y = bp[0].process(x) + bp[1].process(x) * 0.55 + bp[2].process(x) * 0.28;
    y += fric.process(r() * 2 - 1) * fricEnv * 0.5;
    y = lpF.process(y) * gain * 4;
    L[i] += y * gl; R[i] += y * gr;
  }
}

/**
 * Crowd / hawker chatter loop (stereo). Several talkers at different distances.
 * @param {{seconds?: number, talkers?: number, seed?: number}} o
 */
export function babble({ seconds = 8, talkers = 6, seed = 43, sr = 16000, loop = true } = {}) {
  const r = rng(seed);
  const xf = loop ? 0.5 : 0;
  const out = makeSound(sr, seconds + xf, 2);
  for (let k = 0; k < talkers; k++) {
    const dist = rand(r, 0.35, 1);
    talker(out, r, { female: r() < 0.5, pan: rand(r, -0.85, 0.85), gain: dist, lp: Math.min(sr * 0.45, 1800 + 2200 * dist) });
  }
  if (loop) loopify(out, xf);
  return [normalize(out, 0.8)];
}

/** Hawker calls (shouted, sung contour): "Pure wa-ter!", "Buy bread!", "A-ge-ge bread"… */
export function hawker({ seed = 47 } = {}) {
  const scripts = [
    [{ v: 'u', d: 0.2, p: 1.0, c: 'p' }, { v: 'e', d: 0.24, p: 1.0 }, { v: 'a', d: 0.2, p: 1.15, c: 'm' }, { v: 'a', d: 0.62, p: 0.84, c: 'p' }],
    [{ v: 'a', d: 0.22, p: 1.05, c: 'p' }, { v: 'i', d: 0.2, p: 1.05 }, { v: 'e', d: 0.7, p: 0.86, c: 'p' }],
    [{ v: 'a', d: 0.16, p: 1.0 }, { v: 'e', d: 0.18, p: 1.12, c: 'p' }, { v: 'e', d: 0.18, p: 1.12, c: 'p' }, { v: 'e', d: 0.55, p: 0.84, c: 'p' }],
    [{ v: 'a', d: 0.26, p: 1.18, c: 'p' }, { v: 'a', d: 0.6, p: 0.9, c: 'm' }],
  ];
  return scripts.map((script, k) => {
    const r = rng(seed + k * 13);
    const sr = 22050;
    const dur = script.reduce((s, x) => s + x.d, 0) + 0.3;
    const out = makeSound(sr, dur, 2);
    talker(out, r, { female: k % 2 === 0, script, shout: true, start: 0.03, lp: 4200 });
    // mono-ise: hawker calls are positioned by the engine
    const m = out.channels[0].map((v, i) => (v + out.channels[1][i]) * 0.7);
    return trimTail(normalize({ sampleRate: sr, channels: [m] }, 0.8), 1e-4, 0.03);
  });
}

/** Sung formants (Hz, dB, bandwidth Hz) for choir voice types and vowels. */
export const SUNG = {
  bass: {
    a: [[600, 1040, 2250, 2450, 2750], [0, -7, -9, -9, -20], [60, 70, 110, 120, 130]],
    e: [[400, 1620, 2400, 2800, 3100], [0, -12, -9, -12, -18], [40, 80, 100, 120, 120]],
  },
  tenor: {
    a: [[650, 1080, 2650, 2900, 3250], [0, -6, -7, -8, -22], [80, 90, 120, 130, 140]],
    e: [[400, 1700, 2600, 3200, 3580], [0, -14, -12, -14, -20], [70, 80, 100, 120, 120]],
  },
  alto: {
    a: [[800, 1150, 2800, 3500, 4950], [0, -4, -20, -36, -60], [80, 90, 120, 130, 140]],
    e: [[400, 1600, 2700, 3300, 4950], [0, -24, -30, -35, -60], [60, 80, 120, 150, 200]],
  },
  soprano: {
    a: [[800, 1150, 2900, 3900, 4950], [0, -6, -32, -20, -50], [80, 90, 120, 130, 140]],
    e: [[350, 2000, 2800, 3600, 4950], [0, -20, -15, -40, -56], [60, 100, 120, 150, 200]],
  },
};

/**
 * Choir "A-men" on a plagal cadence (IV → I in G): soft, reverent, used when praying.
 * Four parts × three singers each (detuned, independent vibrato), formant-filtered,
 * vowel "ah" → nasal "m" → "eh" → closing "n".
 */
export function amen({ seed = 53 } = {}) {
  const r = rng(seed);
  const sr = 32000, dur = 3.8;
  const out = makeSound(sr, dur, 2);
  const parts = [
    { type: 'soprano', notes: [67, 67], pan: -0.35, g: 0.8 },
    { type: 'alto', notes: [64, 62], pan: 0.35, g: 0.85 },
    { type: 'tenor', notes: [60, 59], pan: -0.15, g: 0.9 },
    { type: 'bass', notes: [48, 43], pan: 0.15, g: 1.0 },
  ];
  const tChange = 1.1;
  for (const part of parts) {
    const singers = Array.from({ length: 3 }, () => ({
      saw: new Saw(r()), det: Math.pow(2, rand(r, -9, 9) / 1200), vr: rand(r, 4.8, 6.0), vp: r() * TAU, vd: rand(r, 0.006, 0.012), lag: rand(r, 0, 0.05), f: 0,
    }));
    const hz = part.notes.map(mtof);
    const tilt = new OnePole(part.type === 'bass' || part.type === 'tenor' ? 700 : 1100, sr);
    const bank = [0, 1, 2, 3, 4].map(() => new Biquad('bandpass', 1000, 5, sr));
    const nasal = new Biquad('lowpass', 320, 0.8, sr);
    const gains = new Float32Array(5);
    const [gl, gr] = panGains(part.pan);
    const A = SUNG[part.type].a, E = SUNG[part.type].e;
    const n = out.channels[0].length;
    let nasalAmt = 0, vowelMix = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (i % 32 === 0) {
        for (const s of singers) {
          const vib = 1 + s.vd * Math.sin(TAU * s.vr * t + s.vp) * Math.min(1, t / 0.6);
          s.f = (t < tChange + s.lag ? hz[0] : hz[1]) * s.det * vib;
        }
        // vowel position: 0 = "ah", 1 = "eh"
        vowelMix = t < tChange ? 0 : Math.min(1, (t - tChange) / 0.18);
        // nasal consonants: "m" at the chord change, "n" closing at the end
        const m = Math.max(0, 1 - Math.abs(t - (tChange + 0.02)) / 0.09);
        const nn = t > 2.85 ? Math.min(1, (t - 2.85) / 0.25) : 0;
        nasalAmt = Math.max(m, nn * 0.85);
        for (let k = 0; k < 5; k++) {
          const f = A[0][k] + (E[0][k] - A[0][k]) * vowelMix;
          const db = A[1][k] + (E[1][k] - A[1][k]) * vowelMix;
          const bw = A[2][k] + (E[2][k] - A[2][k]) * vowelMix;
          bank[k].set('bandpass', Math.min(f, sr * 0.45), f / bw, sr);
          gains[k] = Math.pow(10, db / 20) * (1 - nasalAmt * 0.85);
        }
      }
      // overall phrase envelope: swell in, dip on "m", crescendo on "men", release
      let env = t < 0.35 ? (t / 0.35) * Math.sqrt(t / 0.35) : 1;
      if (t > tChange) env *= 0.9 + 0.25 * Math.min(1, (t - tChange) / 0.9);
      if (t > 2.75) { const q = Math.max(0, 1 - (t - 2.75) / 0.85); env *= q * Math.sqrt(q); }
      const src0 = singers[0].saw.next(singers[0].f, sr) + singers[1].saw.next(singers[1].f, sr) + singers[2].saw.next(singers[2].f, sr);
      let src = src0;
      src = tilt.process(src) * env;
      let y = 0;
      for (let k = 0; k < 5; k++) y += bank[k].process(src) * gains[k];
      y += nasal.process(src) * (0.06 + nasalAmt * 0.16);
      y *= part.g;
      out.channels[0][i] += y * gl;
      out.channels[1][i] += y * gr;
    }
  }
  fades(out, 0.01, 0.2);
  return [normalize(out, 0.8)];
}
