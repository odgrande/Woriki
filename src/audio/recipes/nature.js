// Weather and birds: rolling thunder, garden bulbul song, laughing dove coos, pied crow caws.
import { Biquad, OnePole, Brown, rng, rand, makeSound, normalize, fades, trimTail, Saw, TAU } from './dsp.js';

/**
 * Thunder: an optional close "crack" (tearing broadband burst) followed by many overlapping
 * rolls of low-passed brown noise, each later/farther roll darker and quieter. Stereo.
 */
export function thunder({ count = 2, seed = 29 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 3 + v * 71);
    const sr = 22050, dur = 7.5;
    const snd = makeSound(sr, dur, 2);
    const close = v === 0;
    for (let c = 0; c < 2; c++) {
      const ch = snd.channels[c];
      if (close) {
        // the crack: several tearing sub-bursts in the first ~0.25 s
        const hp = new Biquad('highpass', 350, 0.7, sr), pk = new Biquad('peaking', 2500, 0.8, sr, 4);
        const n = Math.floor(0.45 * sr);
        let e = 0;
        for (let i = 0; i < n; i++) {
          if (r() < 0.0028 && i < 0.25 * sr) e = Math.max(e, rand(r, 0.5, 1));
          e *= 0.9993;
          ch[i] += pk.process(hp.process(r() * 2 - 1)) * e * 0.9;
        }
      }
      // rolls: overlapping bursts at random times, each later (farther) roll darker and
      // quieter. Rendered as a few shared noise bands driven by summed control-rate envelopes.
      const B = 64, nb = Math.ceil(ch.length / B) + 1;
      const env = [new Float32Array(nb), new Float32Array(nb), new Float32Array(nb)]; // near, mid, far bands
      const rolls = close ? 16 : 12;
      for (let k = 0; k < rolls; k++) {
        const t0 = (close ? 0.08 : 0.3) + Math.pow(r(), 1.5) * 3.6;
        const len = rand(r, 0.8, 3.0), att = rand(r, 0.04, 0.35);
        const far = Math.min(1, t0 / 4);
        const amp = rand(r, 0.4, 1) * (1 - far * 0.6) * (c === (k % 2) ? 1 : 0.75);
        const w = [(1 - far) ** 2, 2 * far * (1 - far), far * far]; // band weights by distance
        const b0 = Math.floor(t0 * sr / B), bl = Math.ceil((len + 2.5) * sr / B);
        for (let j = 0; j < bl && b0 + j < nb; j++) {
          const tt = j * B / sr;
          const e = (tt < att ? tt / att : Math.exp(-(tt - att) / (len * 0.45))) * amp * (0.65 + 0.35 * r());
          env[0][b0 + j] += e * w[0]; env[1][b0 + j] += e * w[1]; env[2][b0 + j] += e * w[2];
        }
      }
      const brown = new Brown(r);
      const lpN = new Biquad('lowpass', 900, 0.7, sr), lpM = new Biquad('lowpass', 420, 0.7, sr), lpF = new Biquad('lowpass', 200, 0.7, sr);
      // brown noise is mostly sub-bass: tilt up so the rumble reads on small speakers
      const tilt = new Biquad('highshelf', 180, 0.7, sr, 9), hpS = new Biquad('highpass', 35, 0.7, sr);
      const growl = new Biquad('bandpass', rand(r, 95, 140), 1.2, sr);
      const eN = new OnePole(40, sr), eM = new OnePole(40, sr), eF = new OnePole(40, sr);
      for (let i = 0; i < ch.length; i++) {
        const j = (i / B) | 0;
        const x = tilt.process(hpS.process(brown.next()));
        const gN = eN.process(env[0][j]), gM = eM.process(env[1][j]), gF = eF.process(env[2][j]);
        ch[i] += lpN.process(x) * gN + (lpM.process(x) + growl.process(x) * 0.6) * gM + lpF.process(x) * gF * 1.2;
      }
    }
    fades(snd, 0.001, 1.5);
    out.push(normalize(snd, 0.85));
  }
  return out;
}

/** One sine chirp (with a little 2nd harmonic) following a frequency contour. */
function chirp(buf, start, sr, dur, f0, f1, shape, amp, r) {
  const n = Math.min(buf.length - start, Math.floor(dur * sr));
  let ph = r() * TAU;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    let k;
    if (shape === 'up') k = u * u;
    else if (shape === 'down') k = 1 - (1 - u) * (1 - u);
    else k = Math.sin(Math.PI * u); // arch
    const f = shape === 'arch' ? f0 + (f1 - f0) * k : f0 + (f1 - f0) * k;
    ph += TAU * f / sr;
    const e = Math.sin(Math.PI * u) ** 1.5;
    buf[start + i] += (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * e * amp;
  }
}

/** Garden bulbul style song phrases (chirpy, 3–7 notes). Mono. */
export function bulbul({ count = 4, seed = 31 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 5 + v * 19);
    const sr = 32000;
    const notes = 3 + Math.floor(r() * 5);
    const snd = makeSound(sr, notes * 0.2 + 0.3, 1);
    let t = 0.01;
    for (let k = 0; k < notes; k++) {
      const dur = rand(r, 0.05, 0.14);
      const f0 = rand(r, 1800, 3000), f1 = f0 * rand(r, 0.75, 1.45);
      chirp(snd.channels[0], Math.floor(t * sr), sr, dur, f0, f1, ['up', 'down', 'arch'][Math.floor(r() * 3)], rand(r, 0.5, 1), r);
      t += dur + rand(r, 0.025, 0.09);
    }
    out.push(trimTail(normalize(snd, 0.75), 1e-4, 0.01));
  }
  return out;
}

/** Laughing dove: soft bubbling coos (~500–650 Hz) with breath. Mono. */
export function dove({ count = 2, seed = 37 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed + v * 23);
    const sr = 22050;
    const coos = 4 + Math.floor(r() * 3);
    const snd = makeSound(sr, coos * 0.32 + 0.4, 1);
    const b = snd.channels[0];
    const lp = new Biquad('lowpass', 1400, 0.7, sr);
    let t = 0.02;
    for (let k = 0; k < coos; k++) {
      const accent = k === coos - 2;
      const dur = accent ? rand(r, 0.24, 0.3) : rand(r, 0.13, 0.2);
      const f = rand(r, 510, 560) * (accent ? 1.12 : 1);
      const n = Math.floor(dur * sr), i0 = Math.floor(t * sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const fi = f * (1 + 0.06 * Math.sin(Math.PI * u) - 0.04 * u);
        ph += TAU * fi / sr;
        const e = Math.sin(Math.PI * Math.min(1, u * 1.2)) ** 2;
        b[i0 + i] += (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.05 * (r() * 2 - 1)) * e * (accent ? 1 : 0.75);
      }
      t += dur + rand(r, 0.05, 0.1);
    }
    lp.run(b);
    out.push(trimTail(normalize(snd, 0.7), 1e-4, 0.02));
  }
  return out;
}

/** Pied crow: 2–3 hoarse "kraa" caws. Mono. */
export function crow({ seed = 41 } = {}) {
  const r = rng(seed);
  const sr = 22050;
  const caws = 2 + Math.floor(r() * 2);
  const snd = makeSound(sr, caws * 0.45 + 0.3, 1);
  const b = snd.channels[0];
  let t = 0.02;
  for (let k = 0; k < caws; k++) {
    const dur = rand(r, 0.22, 0.32), n = Math.floor(dur * sr), i0 = Math.floor(t * sr);
    const saw = new Saw(r());
    const f1 = new Biquad('bandpass', rand(r, 1150, 1350), 4, sr), f2 = new Biquad('bandpass', rand(r, 2300, 2600), 6, sr);
    const f0 = rand(r, 520, 600);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const rough = 1 + 0.35 * Math.sin(TAU * 70 * i / sr) * r(); // hoarse, irregular
      const x = saw.next(f0 * (1 + 0.08 * Math.sin(Math.PI * u)), sr) * rough + (r() * 2 - 1) * 0.3;
      const e = Math.min(1, u * 12) * Math.min(1, (1 - u) * 5);
      b[i0 + i] += (f1.process(x) + 0.6 * f2.process(x)) * e;
    }
    t += dur + rand(r, 0.12, 0.2);
  }
  return [trimTail(normalize(snd, 0.7), 1e-4, 0.02)];
}


