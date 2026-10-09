// Bake cache: turns recipe output into AudioBuffers, once. Heavy synthesis runs in a
// Web Worker when available so the render loop never hitches; otherwise jobs run on the
// main thread one at a time between frames.
import { bake as bakeSync } from './recipes/index.js';

/** @typedef {{sampleRate: number, channels: Float32Array[]}} Sound */

/**
 * @param {{ worker?: boolean, makeBuffer?: (s: Sound) => AudioBuffer }} [opts]
 */
export function createBaker(opts = {}) {
  /** @type {Map<string, {promise: Promise<AudioBuffer[]>, buffers: AudioBuffer[]|null}>} */
  const cache = new Map();
  const pending = new Map();
  let seq = 0;
  let worker = null;
  let workerBroken = false;
  const queue = [];
  let pumping = false;

  const makeBuffer = opts.makeBuffer || ((s) => {
    const buf = new AudioBuffer({ length: s.channels[0].length, numberOfChannels: s.channels.length, sampleRate: s.sampleRate });
    s.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
    return buf;
  });

  function getWorker() {
    if (worker || workerBroken || opts.worker === false || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker(new URL('./bake.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const job = pending.get(e.data.id);
        if (!job) return;
        pending.delete(e.data.id);
        if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(e.data.sounds);
      };
      worker.onerror = (e) => {
        // module workers unsupported or crashed: fall back to main-thread baking
        e.preventDefault?.();
        workerBroken = true;
        worker = null;
        for (const [, job] of pending) queue.push(job);
        pending.clear();
        pump();
      };
    } catch {
      workerBroken = true;
      worker = null;
    }
    return worker;
  }

  function pump() {
    if (pumping) return;
    pumping = true;
    const step = () => {
      const job = queue.shift();
      if (!job) { pumping = false; return; }
      try { job.resolve(bakeSync(job.recipe, job.args)); } catch (err) { job.reject(err); }
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  function run(recipe, args) {
    return new Promise((resolve, reject) => {
      const job = { id: ++seq, recipe, args, resolve, reject };
      const w = getWorker();
      if (w) { pending.set(job.id, job); w.postMessage({ id: job.id, recipe, args }); } else { queue.push(job); pump(); }
    });
  }

  const keyOf = (recipe, args) => recipe + (args ? JSON.stringify(args) : '');

  return {
    /** Request a recipe; resolves to its AudioBuffer variants (cached). */
    load(recipe, args) {
      const key = keyOf(recipe, args);
      let entry = cache.get(key);
      if (!entry) {
        entry = { buffers: null, promise: null };
        entry.promise = run(recipe, args || {}).then((sounds) => (entry.buffers = sounds.map(makeBuffer)));
        entry.promise.catch(() => cache.delete(key));
        cache.set(key, entry);
      }
      return entry.promise;
    },
    /** Already-baked variants or null (and starts baking). */
    get(recipe, args) {
      const key = keyOf(recipe, args);
      const entry = cache.get(key);
      if (entry?.buffers) return entry.buffers;
      if (!entry) this.load(recipe, args).catch(() => {});
      return null;
    },
    /** Bake right now on this thread (small sounds only). */
    now(recipe, args) {
      const key = keyOf(recipe, args);
      const entry = cache.get(key);
      if (entry?.buffers) return entry.buffers;
      const buffers = bakeSync(recipe, args || {}).map(makeBuffer);
      cache.set(key, { buffers, promise: Promise.resolve(buffers) });
      return buffers;
    },
    /** Number of cached recipes (debug). */
    get size() { return cache.size; },
    dispose() { worker?.terminate(); worker = null; cache.clear(); },
  };
}
