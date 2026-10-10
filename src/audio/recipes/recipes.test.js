// Objective checks of the baked sounds: levels (not silent, never clipping), shape and
// spectral sanity (bell partials, surface brightness, loop seams, Doppler model).
import { describe, it, expect } from 'vitest';
import { bake, RECIPES } from './index.js';
import { peakOf, rmsOf, Biquad, mtof } from './dsp.js';
import { BELL_PARTIALS } from './bell.js';
import { passMotion } from './vehicles.js';

/** Magnitude of one frequency (Hann-windowed Goertzel) over a window, normalised by length. */
function goertzel(x, sr, f, from = 0, to = x.length) {
  const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
  const n = to - from;
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const s = x[from + i] * hann + c * s1 - s2; s2 = s1; s1 = s;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / n;
}

/** Spectral centroid via a coarse filter bank (no FFT needed). */
function centroid(x, sr) {
  let num = 0, den = 0;
  for (let f = 100; f < Math.min(12000, sr / 2.2); f *= 1.12) {
    const e = goertzel(x, sr, f);
    num += e * f; den += e;
  }
  return num / den;
}

const mono = (s) => {
  if (s.channels.length === 1) return s.channels[0];
  const [L, R] = s.channels;
  return L.map((v, i) => (v + R[i]) / 2);
};

const CASES = [
  ['footsteps', { surface: 'asphalt' }], ['footsteps', { surface: 'tile', run: true }], ['clap', {}], ['crowdClap', {}],
  ['door', {}], ['creak', {}], ['click', {}], ['chat', {}], ['coin', {}], ['success', {}], ['fail', {}], ['bell', {}],
  ['horn', {}], ['okada', {}], ['okada', { mode: 'source' }], ['carPass', { kind: 'danfo' }], ['generator', {}],
  ['thunder', {}], ['bulbul', {}], ['dove', {}], ['crow', {}], ['babble', { seconds: 3, talkers: 3 }], ['hawker', {}], ['amen', {}],
  ['ep', { midi: 67 }], ['bass', { midi: 43 }], ['guitar', { midi: 71 }], ['kick', {}], ['shaker', {}], ['conga', {}], ['talkingDrum', {}],
  ['bed', { seconds: 3, layers: [{ noise: 'pink', filters: [['lowpass', 800, 0.7]], gain: 0.8, lfo: [[0.3, 0.2]] }, { babble: { talkers: 2 }, gain: 0.5, filters: [] }] }],
];

describe('every recipe', () => {
  it('is registered', () => {
    for (const [name] of CASES) expect(RECIPES[name]).toBeTypeOf('function');
  });

  for (const [name, args] of CASES) {
    it(`${name} ${JSON.stringify(args)} is audible, finite and never clips`, () => {
      const variants = bake(name, args);
      expect(variants.length).toBeGreaterThan(0);
      for (const s of variants) {
        expect(s.sampleRate).toBeGreaterThanOrEqual(11025);
        for (const ch of s.channels) {
          expect(ch.length).toBeGreaterThan(100);
          for (let i = 0; i < ch.length; i += 7) expect(Number.isFinite(ch[i])).toBe(true);
        }
        const pk = peakOf(s);
        expect(pk).toBeLessThanOrEqual(0.95);
        expect(pk).toBeGreaterThan(0.2);
        expect(rmsOf(s)).toBeGreaterThan(0.002);
      }
    });
  }
});

describe('bell', () => {
  const [s] = bake('bell', { prime: 294 });
  const x = mono(s);
  const sr = s.sampleRate;
  const from = Math.floor(0.3 * sr), to = Math.floor(2.3 * sr);

  it('rings at the tuned bell partials (hum, prime, minor-third tierce, quint, nominal)', () => {
    for (const [ratio] of BELL_PARTIALS.slice(0, 8)) {
      const f = 294 * ratio;
      const on = goertzel(x, sr, f, from, to);
      const off = goertzel(x, sr, f * 1.03, from, to); // half a semitone away
      expect(on).toBeGreaterThan(off * 4);
    }
  });

  it('has the minor third, not a major third, as tierce', () => {
    const minor = goertzel(x, sr, 294 * 1.19, from, to);
    const major = goertzel(x, sr, 294 * 1.26, from, to);
    expect(minor).toBeGreaterThan(major * 5);
  });

  it('decays slowly (long tail) with upper partials dying first', () => {
    const late = Math.floor(5 * sr);
    const humEarly = goertzel(x, sr, 147, from, to), humLate = goertzel(x, sr, 147, late, late + 2 * sr);
    const hiEarly = goertzel(x, sr, 294 * 4.07, from, to), hiLate = goertzel(x, sr, 294 * 4.07, late, late + 2 * sr);
    expect(humLate / humEarly).toBeGreaterThan(hiLate / hiEarly * 5);
    expect(humLate).toBeGreaterThan(humEarly * 0.01); // hum still ringing after 5 s
  });
});

describe('footsteps', () => {
  const cen = (surface) => {
    const v = bake('footsteps', { surface, count: 3 });
    return v.reduce((s, x) => s + centroid(x.channels[0], x.sampleRate), 0) / v.length;
  };

  it('tile is clicky-bright, carpet soft-dark', () => {
    const tile = cen('tile'), concrete = cen('concrete'), carpet = cen('carpet');
    expect(tile).toBeGreaterThan(concrete);
    expect(concrete).toBeGreaterThan(carpet);
    expect(carpet).toBeLessThan(1500);
  });

  it('wood has a hollow low resonance', () => {
    const [w] = bake('footsteps', { surface: 'wood', count: 1 });
    const [c] = bake('footsteps', { surface: 'concrete', count: 1 });
    const res = (s) => goertzel(s.channels[0], s.sampleRate, 160) / rmsOf(s);
    expect(res(w)).toBeGreaterThan(res(c));
  });

  it('variants differ (no machine-gun repetition)', () => {
    const [a, b] = bake('footsteps', { surface: 'dirt', count: 2 });
    let diff = 0;
    const n = Math.min(a.channels[0].length, b.channels[0].length);
    for (let i = 0; i < n; i++) diff += Math.abs(a.channels[0][i] - b.channels[0][i]);
    expect(diff / n).toBeGreaterThan(0.002);
  });

  it('heel and toe are two separate impacts', () => {
    const [s] = bake('footsteps', { surface: 'tile', count: 1 });
    const x = s.channels[0], sr = s.sampleRate;
    const env = [];
    for (let i = 0; i < x.length; i += Math.floor(sr * 0.005)) {
      let m = 0;
      for (let j = i; j < Math.min(x.length, i + sr * 0.005); j++) m = Math.max(m, Math.abs(x[j]));
      env.push(m);
    }
    const peaks = env.filter((v, i) => v > (env[i - 1] ?? 0) && v >= (env[i + 1] ?? 0) && v > 0.25 * Math.max(...env));
    expect(peaks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('loops are seamless', () => {
  const seam = (x) => {
    let d = 0;
    for (let i = 1; i < x.length; i++) d += Math.abs(x[i] - x[i - 1]);
    return Math.abs(x[0] - x[x.length - 1]) / (d / (x.length - 1));
  };
  it('generator', () => { const [g] = bake('generator', {}); expect(seam(g.channels[0])).toBeLessThan(8); });
  it('babble', () => { const [b] = bake('babble', { seconds: 2, talkers: 3 }); expect(seam(b.channels[0])).toBeLessThan(8); });
  it('ambience beds', () => {
    const [b] = bake('bed', { seconds: 3, layers: [{ noise: 'brown', filters: [['lowpass', 300, 0.7]], gain: 1 }, { generator: { fire: 50 }, gain: 0.3, filters: [] }] });
    expect(seam(b.channels[0])).toBeLessThan(8);
    expect(seam(b.channels[1])).toBeLessThan(8);
  });
});

describe('vehicles', () => {
  it('Doppler: pitch up while approaching, down after passing; loudest at the closest point', () => {
    const m = passMotion({ v: 12, d: 5, tc: 2.5, dur: 5 });
    const before = m(1.5), at = m(2.5), after = m(3.5);
    expect(before.k).toBeGreaterThan(1.02);
    expect(after.k).toBeLessThan(0.98);
    expect(at.g).toBeGreaterThan(before.g);
    expect(at.g).toBeGreaterThan(after.g * 0.8);
    expect(Math.sign(before.pan)).toBe(-Math.sign(after.pan));
    expect(at.lp).toBeGreaterThan(before.lp);
  });

  it('horn is two-tone and bright (horn resonance band)', () => {
    const [h] = bake('horn', {});
    const x = h.channels[0], sr = h.sampleRate;
    expect(goertzel(x, sr, 415)).toBeGreaterThan(goertzel(x, sr, 360) * 3);
    expect(goertzel(x, sr, 495)).toBeGreaterThan(goertzel(x, sr, 455) * 3);
  });

  it('okada buzz fires at a small-engine rate (35–50 Hz pulses)', () => {
    const [s] = bake('okada', { mode: 'source', count: 1 });
    const x = s.channels[0], sr = s.sampleRate;
    const from = Math.floor(0.6 * sr), to = Math.floor(2.2 * sr);
    let best = 0, bestF = 0;
    for (let f = 25; f < 70; f += 0.5) {
      // pulse rate shows up as strong harmonics at k·f: sum the first few
      let e = 0;
      for (let k = 2; k <= 8; k++) e += goertzel(x, sr, f * k, from, to);
      if (e > best) { best = e; bestF = f; }
    }
    expect(bestF).toBeGreaterThan(34);
    expect(bestF).toBeLessThan(52);
  });
});

describe('voices and instruments', () => {
  it('amen choir energy sits in the vocal range', () => {
    const [s] = bake('amen', {});
    const x = mono(s);
    expect(centroid(x, s.sampleRate)).toBeGreaterThan(250);
    expect(centroid(x, s.sampleRate)).toBeLessThan(1600);
  });

  it('pitched instruments are in tune', () => {
    for (const [inst, midi] of [['ep', 67], ['bass', 43], ['guitar', 71]]) {
      const [s] = bake(inst, { midi });
      const x = s.channels[0], sr = s.sampleRate;
      const f = mtof(midi);
      const from = Math.floor(0.05 * sr), to = Math.floor(0.6 * sr);
      const on = goertzel(x, sr, f, from, to);
      expect(on).toBeGreaterThan(goertzel(x, sr, f * Math.pow(2, 0.5 / 12), from, to) * 2);
      expect(on).toBeGreaterThan(goertzel(x, sr, f * Math.pow(2, -0.5 / 12), from, to) * 2);
    }
  });

  it('talking drum glides up on the "up" stroke', () => {
    const [up] = bake('talkingDrum', {});
    const x = up.channels[0], sr = up.sampleRate;
    const early = goertzel(x, sr, 152, 0, Math.floor(0.03 * sr)) / goertzel(x, sr, 235, 0, Math.floor(0.03 * sr));
    const late = goertzel(x, sr, 152, Math.floor(0.25 * sr), Math.floor(0.45 * sr)) / goertzel(x, sr, 235, Math.floor(0.25 * sr), Math.floor(0.45 * sr));
    expect(early).toBeGreaterThan(late * 2);
  });

  it('thunder is low-heavy with an early crack on the close strike', () => {
    const [close] = bake('thunder', {});
    const x = mono(close), sr = close.sampleRate;
    const hp = new Biquad('highpass', 2000, 0.7, sr);
    const hi = x.map((v) => hp.process(v));
    const crack = rmsOf({ channels: [hi.slice(0, Math.floor(0.3 * sr))] });
    const tail = rmsOf({ channels: [hi.slice(Math.floor(2 * sr), Math.floor(4 * sr))] });
    expect(crack).toBeGreaterThan(tail * 4);
    expect(centroid(x, sr)).toBeLessThan(900);
  });
});
