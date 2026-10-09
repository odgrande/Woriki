// Church bell: modal synthesis with the inharmonic partial series of a tuned bronze bell
// (hum, prime, minor-third tierce, quint, nominal, upper partials). Each partial is a
// slightly split doublet, which gives the slow "wah-wah" beating of a real bell.
import { Biquad, rng, rand, makeSound, addModes, noiseBurst, normalize, fades, TAU } from './dsp.js';

const SR = 32000;

/** Partials relative to the prime: [ratio, amplitude, T60 seconds, doublet split Hz]. */
export const BELL_PARTIALS = [
  [0.5, 0.42, 9.0, 0.55], // hum
  [1.0, 0.4, 6.5, 1.1], // prime (fundamental)
  [1.19, 0.5, 5.0, 0.8], // tierce (a slightly flat minor third — the bell's sad colour)
  [1.5, 0.22, 3.6, 1.7], // quint
  [2.0, 0.75, 4.6, 2.2], // nominal (strike note)
  [2.51, 0.3, 2.6, 3.1], // deciem
  [2.66, 0.22, 2.2, 2.6], // undeciem
  [3.01, 0.28, 2.0, 3.6], // duodeciem
  [4.07, 0.17, 1.4, 4.4], // double octave
  [5.34, 0.11, 1.0, 5.0],
  [6.79, 0.08, 0.7, 6.0],
  [8.27, 0.05, 0.5, 7.0],
];

/** @param {{prime?: number, seconds?: number, seed?: number}} o */
export function bell({ prime = 294, seconds = 8, seed = 9 } = {}) {
  const r = rng(seed);
  const snd = makeSound(SR, seconds, 2);
  snd.channels.forEach((ch, c) => {
    const modes = [];
    for (const [k, a, t60, split] of BELL_PARTIALS) {
      const f = prime * k;
      const ph = r() * TAU;
      modes.push({ f, a, t60, phase: ph });
      // the doublet partner: slightly detuned, a bit weaker, different phase per ear
      modes.push({ f: f + split * (c ? 1.07 : 1), a: a * 0.55, t60: t60 * 0.92, phase: ph + c * 1.7 + 0.6 });
    }
    addModes(ch, 0, SR, modes, 0.5);
    // the clapper strike: short metallic clank + noise
    noiseBurst(ch, 0, SR, r, { a: 0.0003, d: 0.004, lvl: 0.35, filters: [new Biquad('bandpass', 2600, 0.9, SR)] });
    addModes(ch, 0, SR, [
      { f: prime * 10.9 * rand(r, 0.98, 1.02), a: 0.12, t60: 0.08 },
      { f: prime * 13.6 * rand(r, 0.98, 1.02), a: 0.08, t60: 0.05 },
    ]);
  });
  fades(snd, 0.0005, 0.8);
  return [normalize(snd, 0.85)];
}
