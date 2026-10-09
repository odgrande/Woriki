// Interface and feedback sounds: click, chat ping, coins, success, fail.
// Built from physical models (struck bars, glass, coins) so they sit naturally in the world.
import { Biquad, rng, rand, makeSound, addModes, noiseBurst, normalize, trimTail, mtof, TAU } from './dsp.js';

const SR = 44100;

/** Soft UI tick: tiny wooden/plastic tap. */
export function click({ seed = 1, count = 2 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 13 + v);
    const snd = makeSound(SR, 0.06, 1);
    const b = snd.channels[0];
    noiseBurst(b, 0, SR, r, { a: 0.0001, d: 0.0012, lvl: 0.7, filters: [new Biquad('highpass', 1800, 0.7, SR), new Biquad('peaking', 4200, 1.5, SR, 6)] });
    addModes(b, 0, SR, [
      { f: rand(r, 1750, 1950) * (v ? 1.12 : 1), a: 0.55, t60: 0.028 },
      { f: rand(r, 3900, 4300), a: 0.2, t60: 0.012 },
      { f: rand(r, 620, 700), a: 0.12, t60: 0.02 },
    ]);
    out.push(trimTail(normalize(snd, 0.7), 1e-4, 0.005));
  }
  return out;
}

/** Struck-glass "pling" note: fundamental plus inharmonic partials. */
function glass(b, start, f, amp, r) {
  addModes(b, start, SR, [
    { f, a: 1, t60: 0.75 },
    { f: f * 2.756, a: 0.28, t60: 0.22 },
    { f: f * 5.404, a: 0.08, t60: 0.08 },
    { f: f * 1.003, a: 0.35, t60: 0.6, phase: 1.3 }, // slight beating
  ], amp);
  noiseBurst(b, start, SR, r, { a: 0.0002, d: 0.0015, lvl: 0.08 * amp, filters: [new Biquad('highpass', 3000, 0.7, SR)] });
}

/** Incoming chat message: two quick glass notes (C6 → G6). */
export function chat({ seed = 2 } = {}) {
  const r = rng(seed);
  const snd = makeSound(SR, 0.9, 1);
  const b = snd.channels[0];
  glass(b, 0, mtof(84), 0.8, r);
  glass(b, Math.floor(0.085 * SR), mtof(91), 0.65, r);
  return [trimTail(normalize(snd, 0.75), 1e-4, 0.02)];
}

/** Small metal coin modal set (free disc), base ~2.3–3.4 kHz. */
function coinHit(b, start, r, amp, base) {
  const ratios = [1, 1.72, 2.31, 2.98, 3.71, 4.52];
  const modes = ratios.map((k, i) => ({ f: base * k * rand(r, 0.985, 1.015), a: (1 / (1 + i * 0.6)) * rand(r, 0.6, 1.1), t60: rand(r, 0.25, 0.55) / (1 + i * 0.45), phase: r() * TAU }));
  addModes(b, start, SR, modes, amp * 0.5);
  noiseBurst(b, start, SR, r, { a: 0.0001, d: 0.0011, lvl: amp * 0.5, filters: [new Biquad('highpass', 4000, 0.7, SR)] });
}

/** Coins clinking together (a few impacts and a little bounce). */
export function coin({ count = 3, seed = 7 } = {}) {
  const out = [];
  for (let v = 0; v < count; v++) {
    const r = rng(seed * 31 + v * 3);
    const snd = makeSound(SR, 0.9, 1);
    const b = snd.channels[0];
    const baseA = rand(r, 2250, 2700), baseB = rand(r, 2900, 3400);
    const hits = [[0, 1, baseA], [rand(r, 0.045, 0.07), 0.75, baseB], [rand(r, 0.11, 0.15), 0.45, baseA], [rand(r, 0.17, 0.22), 0.22, baseB]];
    for (const [t, a, f] of hits) coinHit(b, Math.floor(t * SR), r, a, f);
    out.push(trimTail(normalize(snd, 0.75), 1e-4, 0.02));
  }
  return out;
}

/** Marimba-like bar note (rosewood: partials ~1 : 3.9 : 9.2). */
function marimba(b, start, f, amp, r) {
  addModes(b, start, SR, [
    { f, a: 1, t60: 0.9 * Math.min(1.4, 600 / f) + 0.25 },
    { f: f * 3.93, a: 0.28, t60: 0.16 },
    { f: f * 9.2, a: 0.06, t60: 0.05 },
  ], amp);
  noiseBurst(b, start, SR, r, { a: 0.0003, d: 0.002, lvl: 0.12 * amp, filters: [new Biquad('bandpass', 2200, 0.8, SR)] });
}

/** Bright rising arpeggio (G5 B5 D6 G6) with a soft glass sparkle. */
export function success({ seed = 4 } = {}) {
  const r = rng(seed);
  const snd = makeSound(SR, 1.6, 1);
  const b = snd.channels[0];
  [79, 83, 86, 91].forEach((m, i) => marimba(b, Math.floor(i * 0.075 * SR), mtof(m), 0.9 - i * 0.05, r));
  glass(b, Math.floor(0.3 * SR), mtof(98), 0.18, r);
  return [trimTail(normalize(snd, 0.75), 1e-4, 0.03)];
}

/** Gentle "uh-oh": two low wooden notes falling, with a soft muted buzz. */
export function fail({ seed = 5 } = {}) {
  const r = rng(seed);
  const snd = makeSound(SR, 1.0, 1);
  const b = snd.channels[0];
  marimba(b, 0, mtof(57), 0.9, r);
  marimba(b, Math.floor(0.16 * SR), mtof(53), 1, r);
  // muted buzz under the second note
  const lp = new Biquad('lowpass', 420, 0.9, SR);
  const i0 = Math.floor(0.16 * SR), n = Math.floor(0.32 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += mtof(41) / SR; ph -= Math.floor(ph);
    const e = Math.min(1, i / (0.01 * SR)) * Math.exp(-i / (0.09 * SR));
    b[i0 + i] += lp.process((ph * 2 - 1)) * e * 0.18;
  }
  return [trimTail(normalize(snd, 0.7), 1e-4, 0.03)];
}
