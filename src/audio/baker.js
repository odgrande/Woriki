// Bake cache: turns recipe output into AudioBuffers, once. Heavy synthesis runs in Web
// Workers (one or two, by core count) so the render loop never hitches; otherwise jobs run
// on the main thread one at a time between frames. Jobs are prioritised: something the
// player needs now (a sound, the service music) jumps ahead of background preloading.
import { bake as bakeSync } from './recipes/index.js';

/** @typedef {{sampleRate: number, channels: Float32Array[]}} Sound */

/**
 * @param {{ worker?: boolean, workers?: number, makeBuffer?: (s: Sound) => AudioBuffer }} [opts]
 */
export function createBaker(opts = {}) {
  /** @type {Map<string, {promise: Promise<AudioBuffer[]>, buffers: AudioBuffer[]|null, job: any}>} */
  const cache = new Map();
  const queue = []; // waiting jobs
  const slots = []; // [{worker, busy}]
  let seq = 0;
  let useWorkers = opts.worker !== false && typeof Worker !== 'undefined';
  let mainBusy = false;
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  const maxWorkers = opts.workers ?? (cores >= 4 ? 2 : 1);

  const makeBuffer = opts.makeBuffer || ((s) => {
    const buf = new AudioBuffer({ length: s.channels[0].length, numberOfChannels: s.channels.length, sampleRate: s.sampleRate });
    s.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
    return buf;
  });

  function spawn() {
    try {
      const worker = new Worker(new URL('./bake.worker.js', import.meta.url), { type: 'module' });
      const slot = { worker, job: null };
      worker.onmessage = (e) => {
        const job = slot.job;
        slot.job = null;
        if (job && e.data.id === job.id) {
          if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(e.data.sounds);
        }
        next();
      };
      worker.onerror = (e) => {
        // module workers unsupported or crashed: fall back to main-thread baking
        e.preventDefault?.();
        useWorkers = false;
        for (const s of slots) { if (s.job) queue.push(s.job); try { s.worker.terminate(); } catch { /* ignore */ } }
        slots.length = 0;
        next();
      };
      slots.push(slot);
      return slot;
    } catch {
      useWorkers = false;
      return null;
    }
  }

  function takeJob() {
    if (!queue.length) return null;
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].priority > queue[bi].priority) bi = i;
    return queue.splice(bi, 1)[0];
  }

  function next() {
    if (!queue.length) return;
    if (useWorkers) {
      let slot = slots.find((s) => !s.job);
      if (!slot && slots.length < maxWorkers) slot = spawn();
      if (slot && useWorkers) {
        const job = takeJob();
        slot.job = job;
        slot.worker.postMessage({ id: job.id, recipe: job.recipe, args: job.args });
        if (queue.length) next();
        return;
      }
      if (useWorkers) return; // all workers busy; their completion calls next()
    }
    if (mainBusy) return;
    mainBusy = true;
    setTimeout(() => {
      const job = takeJob();
      if (job) { try { job.resolve(bakeSync(job.recipe, job.args)); } catch (err) { job.reject(err); } }
      mainBusy = false;
      next();
    }, 0);
  }

  const keyOf = (recipe, args) => recipe + (args ? JSON.stringify(args) : '');

  const baker = {
    /**
     * Request a recipe; resolves to its AudioBuffer variants (cached).
     * priority: 0 background preload, 1 normal, 2 needed right now.
     */
    load(recipe, args, priority = 1) {
      const key = keyOf(recipe, args);
      let entry = cache.get(key);
      if (!entry) {
        entry = { buffers: null, promise: null, job: null };
        entry.promise = new Promise((resolve, reject) => {
          entry.job = { id: ++seq, recipe, args: args || {}, priority, resolve, reject };
          queue.push(entry.job);
        }).then((sounds) => (entry.buffers = sounds.map(makeBuffer)));
        entry.promise.catch(() => cache.delete(key));
        cache.set(key, entry);
        next();
      } else if (entry.job && priority > entry.job.priority) {
        entry.job.priority = priority; // still queued: bump it
      }
      return entry.promise;
    },
    /** Already-baked variants or null (and starts baking with high priority). */
    get(recipe, args) {
      const key = keyOf(recipe, args);
      const entry = cache.get(key);
      if (entry?.buffers) return entry.buffers;
      baker.load(recipe, args, 2).catch(() => {});
      return null;
    },
    /** Bake right now on this thread (small sounds only). */
    now(recipe, args) {
      const key = keyOf(recipe, args);
      const entry = cache.get(key);
      if (entry?.buffers) return entry.buffers;
      const buffers = bakeSync(recipe, args || {}).map(makeBuffer);
      cache.set(key, { buffers, promise: Promise.resolve(buffers), job: null });
      return buffers;
    },
    /** Number of cached (or queued) recipes. */
    get size() { return cache.size; },
    /** Jobs still waiting. */
    get pending() { return queue.length + slots.filter((s) => s.job).length; },
    dispose() {
      for (const s of slots) s.worker.terminate();
      slots.length = 0;
      queue.length = 0;
      cache.clear();
    },
  };
  return baker;
}
