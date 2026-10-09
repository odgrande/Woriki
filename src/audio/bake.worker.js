// Bakes procedural sounds off the main thread. Message in: {id, recipe, args}.
// Message out: {id, sounds: [{sampleRate, channels}]} with transferred buffers, or {id, error}.
import { bake } from './recipes/index.js';

self.onmessage = (e) => {
  const { id, recipe, args } = e.data || {};
  try {
    const sounds = bake(recipe, args);
    const transfer = [];
    for (const s of sounds) for (const ch of s.channels) transfer.push(ch.buffer);
    self.postMessage({ id, sounds }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
