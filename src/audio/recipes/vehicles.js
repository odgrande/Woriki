// Lagos traffic: car horns, okada (motorbike) pass-bys, cars and danfo buses, and the
// neighbour's petrol generator. Engines are modelled as firing pulses (with cycle-to-cycle
// jitter) exciting exhaust/body resonances; moving sources get Doppler, distance gain,
// air absorption and stereo position along a straight road.
import {
  Biquad, OnePole, Pink, rng, rand, makeSound, normalize, fades, loopify, panGains, softClip, polyblep, TAU,
} from './dsp.js';

const C = 343; // speed of sound, m/s

/**
 * Generic engine renderer.
 * @param {object} o
 * @param {number} o.sr
 * @param {number} o.dur seconds
 * @param {(t:number)=>number} o.fire firing rate Hz at time t
 * @param {Array<[number, number, number]>} o.res resonances [Hz, Q, gain]
 * @param {number} [o.noise] noise per pulse (0..1)
 * @param {number} [o.ampJitter] cycle-to-cycle amplitude variation
 * @param {number} [o.timeJitter] fraction of a period
 * @param {number} [o.pulseDecay] fraction of a period
 * @param {(t:number)=>{k:number,g:number,pan:number,lp:number}} [o.motion]
 * @param {number} [o.tire] tyre/road noise amount
 * @param {number} [o.clatter] diesel clatter amount
 * @param {boolean} [o.stereo]
 */
function renderEngine(r, o) {
  const { sr, dur } = o;
  const stereo = !!o.stereo;
  const snd = makeSound(sr, dur, stereo ? 2 : 1);
  const L = snd.channels[0], R = snd.channels[1];
  const n = L.length;
  const res = o.res.map(([f, q]) => new Biquad('bandpass', f, q, sr));
  const resG = o.res.map(([, , g]) => g);
  const lp = new OnePole(12000, sr);
  const lp2 = new OnePole(12000, sr);
  const tireBp = new Biquad('bandpass', 900, 0.5, sr), tireLp = new Biquad('lowpass', 3000, 0.7, sr);
  const clat = new Biquad('bandpass', 3200, 1.2, sr);
  const pink = new Pink(r);
  const block = 64;
  // Pulse timing: an ideal phase accumulator plus a per-cycle offset (non-cumulative), so a
  // loop whose firing integral is an integer number of cycles repeats exactly when
  // `periodic` (cycles per loop) is given.
  const N = o.periodic || 0;
  const jit = N ? Array.from({ length: N }, () => rand(r, 0, o.timeJitter || 0)) : null;
  const amps = N ? Array.from({ length: N }, () => 1 + (o.ampJitter || 0) * (r() * 2 - 1)) : null;
  let ph = 0, cycle = 0, target = 1, env = 0, envK = 0.9, amp = 1, nz = 0;
  let m = { k: 1, g: 1, pan: 0, lp: 12000 };
  let gl = 1, gr = 1;
  for (let i = 0; i < n; i++) {
    if (i % block === 0) {
      const t = i / sr;
      if (o.motion) m = o.motion(t);
      const f = o.fire(t) * m.k;
      envK = Math.exp(-1 / Math.max(1, (o.pulseDecay ?? 0.3) * sr / f));
      if (i % (block * 4) === 0) for (let j = 0; j < res.length; j++) res[j].set('bandpass', o.res[j][0] * m.k, o.res[j][1], sr);
      lp.set(m.lp, sr); lp2.set(m.lp * 1.3, sr);
      [gl, gr] = stereo ? panGains(m.pan) : [1, 1];
      m.f = f;
    }
    ph += m.f / sr;
    if (ph >= target) {
      cycle++;
      amp = N ? amps[cycle % N] : 1 + (o.ampJitter || 0) * (r() * 2 - 1);
      target = cycle + 1 + (N ? jit[(cycle + 1) % N] : (o.timeJitter ? rand(r, 0, o.timeJitter) : 0));
      env = amp;
      nz = amp * (o.noise || 0);
    }
    env *= envK; nz *= envK;
    const e = env + nz * (r() * 2 - 1);
    let y = 0;
    for (let j = 0; j < res.length; j++) y += res[j].process(e) * resG[j];
    if (o.clatter) y += clat.process((r() * 2 - 1) * env * env) * o.clatter;
    if (o.tire) y += tireLp.process(tireBp.process(pink.next())) * o.tire;
    y = lp2.process(lp.process(softClip(y * 1.5)));
    y *= m.g;
    if (stereo) { L[i] += y * gl; R[i] += y * gr; } else L[i] += y;
  }
  return snd;
}

/** Motion along a straight road passing the listener at `d` metres, closest at time tc. */
export function passMotion({ v, d, tc, dir = 1, lpNear = 14000, fadeIn = 0.6, dur }) {
  return (t) => {
    const x = dir * v * (t - tc);
    const rr = Math.hypot(x, d);
    const vr = v * (x * dir) / rr; // radial velocity (+ = receding)
    const k = C / (C + vr);
    let g = d / rr;
    g *= 1 + 0.25 * Math.max(-1, Math.min(1, (x * dir) / rr)); // exhaust faces backwards: louder when going away
    const edge = Math.min(1, t / fadeIn, (dur - t) / fadeIn);
    return { k, g: g * Math.max(0, edge), pan: Math.max(-0.95, Math.min(0.95, (x / rr) * 0.95)), lp: Math.max(900, lpNear * Math.pow(d / rr, 0.8)) };
  };
}

/**
 * Okada (small 4-stroke motorbike) pass-by.
 * mode 'pass' = stereo, full pass-by for ambience and non-positional play;
 * mode 'source' = mono engine with Doppler only (the engine moves a PannerNode for 3D).
 */
export function okada({ mode = 'pass', count = 2, seed = 13 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 7 + v * 101);
    const sr = 32000, dur = 5.5;
    const base = rand(r, 38, 46); // firing Hz (~4600–5500 rpm)
    const speed = rand(r, 10, 14), d = rand(r, 4, 7), tc = 2.6;
    const dir = v % 2 ? -1 : 1;
    const blip = rand(r, 0.5, 1.6); // rider rolls the throttle after passing
    const motion = mode === 'pass'
      ? passMotion({ v: speed, d, tc, dir, dur, lpNear: 13000 })
      : (t) => {
        const x = speed * (t - tc), rr = Math.hypot(x, d), vr = speed * x / rr;
        const edge = Math.min(1, t / 0.4, (dur - t) / 0.6);
        return { k: C / (C + vr), g: Math.max(0, edge) * (1 + 0.2 * x / rr), pan: 0, lp: 12000 };
      };
    const snd = renderEngine(r, {
      sr, dur, stereo: mode === 'pass',
      fire: (t) => base * (1 + 0.1 / (1 + Math.exp(-(t - tc - blip) * 4)) + 0.015 * Math.sin(t * 7.3)),
      res: [[115, 2.2, 0.55], [330, 3, 0.8], [880, 2.5, 0.62], [2300, 2, 0.36], [4200, 1.5, 0.12]],
      noise: 0.55, ampJitter: 0.28, timeJitter: 0.035, pulseDecay: 0.28, tire: 0.04,
      motion,
    });
    fades(snd, 0.02, 0.3);
    out.push(normalize(snd, 0.8));
  }
  return out;
}

/** Car or danfo bus passing by on the street (stereo). */
export function carPass({ kind = 'car', count = 2, seed = 17 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 11 + v * 53 + (kind === 'danfo' ? 999 : 0));
    const sr = 22050, dur = 7;
    const danfo = kind === 'danfo';
    const base = danfo ? rand(r, 46, 54) : rand(r, 58, 72);
    const snd = renderEngine(r, {
      sr, dur, stereo: true,
      fire: (t) => base * (1 + 0.03 * Math.sin(t * 0.9 + v)),
      res: danfo
        ? [[85, 1.8, 1], [240, 2.5, 0.7], [700, 2, 0.35], [1600, 2, 0.15]]
        : [[72, 1.6, 0.8], [215, 2.2, 0.5], [620, 1.8, 0.2]],
      noise: danfo ? 0.6 : 0.25, ampJitter: danfo ? 0.3 : 0.1, timeJitter: danfo ? 0.03 : 0.01,
      pulseDecay: danfo ? 0.3 : 0.55, tire: danfo ? 0.35 : 0.5, clatter: danfo ? 0.5 : 0,
      motion: passMotion({ v: rand(r, 7, 11), d: rand(r, 6, 11), tc: dur / 2, dir: v % 2 ? -1 : 1, dur, lpNear: 9000, fadeIn: 1.2 }),
    });
    fades(snd, 0.05, 0.4);
    out.push(normalize(snd, 0.8));
  }
  return out;
}

/** One horn tone (vibrating diaphragm + flared trumpet resonance). */
function hornTone(buf, start, len, sr, f, lvl, r) {
  const res = new Biquad('peaking', 2400, 1.4, sr, 9);
  const res2 = new Biquad('peaking', 1100, 1.2, sr, 5);
  const lp = new Biquad('lowpass', 5200, 0.7, sr);
  const hp = new Biquad('highpass', 250, 0.7, sr);
  let p = r();
  const n = Math.min(buf.length - start, Math.floor(len * sr));
  const ia = Math.floor(0.008 * sr), ir = Math.floor(0.03 * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fi = f * (1 - 0.035 * Math.exp(-t / 0.012));
    const dt = fi / sr;
    p += dt; if (p >= 1) p -= 1;
    // asymmetric pulse (duty 0.32) – the diaphragm slaps the pole piece
    let sq = (p < 0.32 ? 1 : -0.6) ;
    sq += polyblep(p, dt) * 0.8;
    let q = p - 0.32; if (q < 0) q += 1; sq -= polyblep(q, dt) * 0.8;
    const env = Math.min(1, i / ia) * (i > n - ir ? (n - i) / ir : 1);
    const y = lp.process(res2.process(res.process(hp.process(softClip(sq * 1.6)))));
    buf[start + i] += y * env * lvl;
  }
}

/** Car horn variants: "pim pim", long press, triple tap, danfo low horn. Mono. */
export function horn({ seed = 19 } = {}) {
  const sr = 32000;
  const r = rng(seed);
  const patterns = [
    { f: [415, 495], taps: [[0, 0.13], [0.22, 0.14]] },
    { f: [400, 480], taps: [[0, 0.62]] },
    { f: [430, 515], taps: [[0, 0.09], [0.16, 0.09], [0.32, 0.12]] },
    { f: [330, 392], taps: [[0, 0.45]] },
  ];
  return patterns.map((pat) => {
    const end = pat.taps[pat.taps.length - 1];
    const snd = makeSound(sr, end[0] + end[1] + 0.1, 1);
    for (const [t, len] of pat.taps) for (const f of pat.f) hornTone(snd.channels[0], Math.floor(t * sr), len, sr, f * rand(r, 0.99, 1.01), 0.5, r);
    return normalize(fades(snd, 0, 0.02), 0.8);
  });
}

/**
 * The neighbour's small 2-stroke petrol generator ("I better pass my neighbour"),
 * a seamless loop with governor hunting and cycle-to-cycle variation.
 */
export function generator({ seconds = 4, seed = 23 } = {}) {
  const r = rng(seed);
  const sr = 16000, xf = 0.3;
  const snd = renderEngine(r, {
    sr, dur: seconds + xf,
    fire: (t) => 50 * (1 + 0.015 * Math.sin(TAU * 0.5 * t)),
    res: [[160, 3, 1], [480, 4, 0.6], [1300, 3, 0.35], [3000, 2, 0.18]],
    noise: 0.45, ampJitter: 0.25, timeJitter: 0.04, pulseDecay: 0.22, periodic: Math.round(50 * seconds),
  });
  // alternator whine and casing hum
  const ch = snd.channels[0];
  for (let i = 0; i < ch.length; i++) {
    const t = i / sr;
    ch[i] += 0.03 * Math.sin(TAU * 100 * t) + 0.012 * Math.sin(TAU * 300 * t + 1);
  }
  loopify(snd, xf);
  return [normalize(snd, 0.8)];
}
