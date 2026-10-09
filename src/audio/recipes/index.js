// Registry of bakeable sound recipes. Each recipe takes a plain-object of options and
// returns an array of variants: [{ sampleRate, channels: Float32Array[] }].
import { footsteps, clap, crowdClap, door, creak } from './foley.js';
import { click, chat, coin, success, fail } from './ui.js';
import { bell } from './bell.js';
import { horn, okada, carPass, generator } from './vehicles.js';
import { thunder, bulbul, dove, crow } from './nature.js';
import { babble, hawker, amen } from './voices.js';
import { ep, bass, guitar, kick, shaker, conga, talkingDrum } from './instruments.js';
import { rng, Pink, Brown, makeSound } from './dsp.js';

/** Plain noise beds shared by every ambience (looped with random offsets). */
function noise({ color = 'pink', seconds = 6, seed = 97 } = {}) {
  const r = rng(seed);
  const sr = color === 'brown' ? 11025 : color === 'pink' ? 22050 : 44100;
  const snd = makeSound(sr, seconds, 1);
  const b = snd.channels[0];
  const gen = color === 'pink' ? new Pink(r) : color === 'brown' ? new Brown(r) : { next: () => r() * 2 - 1 };
  for (let i = 0; i < b.length; i++) b[i] = gen.next();
  // remove DC and make the loop seamless with a short cross-fade
  let mean = 0; for (let i = 0; i < b.length; i++) mean += b[i]; mean /= b.length;
  let peak = 0; for (let i = 0; i < b.length; i++) { b[i] -= mean; peak = Math.max(peak, Math.abs(b[i])); }
  const x = Math.floor(0.05 * sr);
  for (let i = 0; i < x; i++) { const t = i / x; b[i] = b[i] * t + b[b.length - x + i] * (1 - t); }
  const k = 0.9 / peak;
  for (let i = 0; i < b.length; i++) b[i] *= k;
  return [{ sampleRate: sr, channels: [b.slice(0, b.length - x)] }];
}

export const RECIPES = {
  footsteps, clap, crowdClap, door, creak,
  click, chat, coin, success, fail,
  bell, horn, okada, carPass, generator,
  thunder, bulbul, dove, crow,
  babble, hawker, amen,
  ep, bass, guitar, kick, shaker, conga, talkingDrum,
  noise,
};

/**
 * Bake a recipe synchronously.
 * @param {string} name
 * @param {object} [args]
 * @returns {{sampleRate: number, channels: Float32Array[]}[]}
 */
export function bake(name, args = {}) {
  const fn = RECIPES[name];
  if (!fn) throw new Error(`Unknown sound recipe: ${name}`);
  return fn(args);
}
