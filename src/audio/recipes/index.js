// Registry of bakeable sound recipes. Each recipe takes a plain-object of options and
// returns an array of variants: [{ sampleRate, channels: Float32Array[] }].
import { footsteps, clap, crowdClap, door, creak } from './foley.js';
import { click, chat, coin, success, fail } from './ui.js';
import { bell } from './bell.js';
import { horn, okada, carPass, generator } from './vehicles.js';
import { thunder, bulbul, dove, crow } from './nature.js';
import { babble, hawker, amen } from './voices.js';
import { ep, bass, guitar, kick, shaker, conga, talkingDrum } from './instruments.js';
import { bed } from './beds.js';

export const RECIPES = {
  footsteps, clap, crowdClap, door, creak,
  click, chat, coin, success, fail,
  bell, horn, okada, carPass, generator,
  thunder, bulbul, dove, crow,
  babble, hawker, amen,
  ep, bass, guitar, kick, shaker, conga, talkingDrum,
  bed,
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
