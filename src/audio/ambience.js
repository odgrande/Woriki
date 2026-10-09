// Ambience beds per zone. Each bed mixes continuous layers (looped shared noise through
// filters with slow LFO modulation, baked loops like crowd babble or a generator) with
// sparse random events (passing cars and okadas, horns, birds, creaks) scheduled ahead
// on the audio clock. Beds crossfade when the player changes zone.
import { createVoicePool } from './polyphony.js';

const lp = (f, q = 0.7) => ['lowpass', f, q];
const hp = (f, q = 0.7) => ['highpass', f, q];
const bp = (f, q = 1) => ['bandpass', f, q];

const BABBLE_A = { seed: 43 };
const BABBLE_B = { seed: 44 };

/**
 * Layer kinds:
 *  noise: shared noise loop ('pink'|'brown'|'white') → filters → gain (+LFOs) → pan
 *  loop:  baked loop recipe → filters → gain → pan
 *  osc:   steady oscillator (mains hum)
 *  event: random one-shots every [min,max] s; seq = short sequences (distant footsteps)
 * hq: skipped on the low quality tier.
 */
export const BEDS = {
  street: [
    { noise: 'brown', filters: [hp(55), lp(260)], gain: 0.2, lfo: [[0.045, 0.06], [0.13, 0.025]] }, // traffic rumble
    { noise: 'pink', filters: [bp(850, 0.55)], gain: 0.04, lfo: [[0.07, 0.016]] }, // tyres and engines
    { noise: 'pink', filters: [hp(2800)], gain: 0.01, hq: true }, // air and distant hiss
    { noise: 'pink', filters: [bp(1050, 1.6)], gain: 0.03, lfo: [[0.21, 0.014], [0.57, 0.008]], pan: -0.2 }, // crowd murmur
    { loop: 'babble', args: BABBLE_A, filters: [hp(250), lp(2600)], gain: 0.1, pan: 0.25 }, // hawkers and passers-by
    { loop: 'generator', args: {}, filters: [hp(80), lp(650)], gain: 0.035, pan: -0.6, rate: 0.96, hq: true }, // a generator somewhere
    { event: 'carPass', args: { kind: 'car' }, every: [2.5, 7], gain: [0.1, 0.25], rate: [0.92, 1.08], reverb: 0.05 },
    { event: 'carPass', args: { kind: 'danfo' }, every: [9, 20], gain: [0.1, 0.22], rate: [0.95, 1.05], reverb: 0.05 },
    { event: 'horn', every: [4, 12], gain: [0.05, 0.16], lowpass: [1600, 4200], reverb: 0.4, pan: [-0.9, 0.9], rate: [0.94, 1.06] },
    { event: 'okada', args: { mode: 'pass' }, every: [8, 20], gain: [0.1, 0.22], rate: [0.94, 1.06], reverb: 0.05 },
    { event: 'bulbul', every: [12, 30], gain: [0.04, 0.09], pan: [-0.9, 0.9], lowpass: [3500, 7000], reverb: 0.15 },
    { event: 'crow', every: [30, 80], gain: [0.03, 0.06], pan: [-0.9, 0.9], lowpass: [2200, 3500], reverb: 0.3, hq: true },
  ],
  church: [
    { noise: 'pink', filters: [hp(60), lp(320)], gain: 0.05 }, // room tone
    { noise: 'pink', filters: [bp(520, 0.8)], gain: 0.035, lfo: [[11.3, 0.014]], pan: -0.45 }, // ceiling fan whoosh
    { noise: 'pink', filters: [bp(400, 0.8)], gain: 0.032, lfo: [[9.6, 0.013]], pan: 0.45, hq: true }, // second fan
    { osc: 'sine', freq: 100, gain: 0.0025 }, // PA hum (50 Hz mains, 2nd harmonic)
    { osc: 'sine', freq: 150, gain: 0.0012, hq: true },
    { loop: 'babble', args: BABBLE_B, filters: [lp(1100)], gain: 0.07 }, // quiet chatter in the pews
    { noise: 'brown', filters: [hp(50), lp(160)], gain: 0.05 }, // street outside, through the walls
    { event: 'creak', every: [7, 18], gain: [0.08, 0.2], pan: [-0.8, 0.8], reverb: 0.6, rate: [0.9, 1.1] },
    { event: 'footsteps', args: { surface: 'tile', run: false }, every: [10, 26], gain: [0.05, 0.11], pan: [-0.8, 0.8], reverb: 0.8, seq: { count: [4, 8], gap: [0.52, 0.62] }, lowpass: [3000, 6000] },
    { event: 'horn', every: [20, 45], gain: [0.02, 0.05], lowpass: [700, 1100], reverb: 0.2, pan: [-0.9, 0.9] },
  ],
  market: [
    { loop: 'babble', args: BABBLE_A, filters: [hp(180), lp(3200)], gain: 0.18, pan: -0.35 },
    { loop: 'babble', args: BABBLE_B, filters: [hp(180), lp(2800)], gain: 0.16, pan: 0.35, rate: 1.03 },
    { noise: 'pink', filters: [bp(800, 1)], gain: 0.035, lfo: [[0.17, 0.014], [0.43, 0.008]] },
    { noise: 'brown', filters: [hp(55), lp(220)], gain: 0.12, lfo: [[0.05, 0.04]] },
    { loop: 'generator', args: {}, filters: [hp(80), lp(900)], gain: 0.05, pan: 0.7, rate: 1.04 },
    { event: 'hawker', every: [3.5, 9], gain: [0.07, 0.18], pan: [-0.85, 0.85], lowpass: [2500, 5000], reverb: 0.2, rate: [0.94, 1.06] },
    { event: 'coin', every: [6, 15], gain: [0.03, 0.07], pan: [-0.8, 0.8], rate: [0.5, 0.75], reverb: 0.15, lowpass: [3000, 6000] },
    { event: 'horn', every: [8, 22], gain: [0.03, 0.1], lowpass: [1400, 3000], reverb: 0.35, pan: [-0.9, 0.9] },
    { event: 'okada', args: { mode: 'pass' }, every: [12, 28], gain: [0.06, 0.14], reverb: 0.05 },
  ],
  prayer: [
    { noise: 'pink', filters: [hp(60), lp(240)], gain: 0.04 },
    { noise: 'pink', filters: [bp(430, 0.9)], gain: 0.02, lfo: [[8.7, 0.008]], pan: 0.3 },
    { loop: 'babble', args: BABBLE_B, filters: [lp(650)], gain: 0.05 }, // others praying quietly
    { event: 'bulbul', every: [9, 22], gain: [0.02, 0.05], pan: [-0.9, 0.9], lowpass: [2500, 4000] },
    { event: 'horn', every: [25, 55], gain: [0.012, 0.03], lowpass: [600, 900], pan: [-0.9, 0.9] },
  ],
  home: [
    { loop: 'generator', args: {}, filters: [hp(70), lp(1500)], gain: 0.09, pan: 0.55 }, // neighbour's generator
    { noise: 'pink', filters: [hp(80), lp(700)], gain: 0.015 },
    { noise: 'brown', filters: [hp(50), lp(180)], gain: 0.05, lfo: [[0.05, 0.02]] },
    { loop: 'babble', args: BABBLE_A, filters: [lp(1300)], gain: 0.035, pan: -0.5, hq: true }, // neighbours talking
    { event: 'bulbul', every: [3, 9], gain: [0.08, 0.2], pan: [-0.9, 0.9], reverb: 0.1 },
    { event: 'dove', every: [10, 24], gain: [0.08, 0.16], pan: [-0.9, 0.9], reverb: 0.1, lowpass: [1800, 2600] },
    { event: 'crow', every: [25, 60], gain: [0.03, 0.06], pan: [-0.9, 0.9], lowpass: [2000, 3000], reverb: 0.25 },
    { event: 'horn', every: [18, 40], gain: [0.02, 0.05], lowpass: [900, 1500], pan: [-0.9, 0.9], reverb: 0.3 },
  ],
};

const rnd = (range) => (Array.isArray(range) ? range[0] + Math.random() * (range[1] - range[0]) : range);

/** @param {ReturnType<import('./engine.js').createEngine>} engine */
export function createAmbience(engine) {
  const { ac, baker } = engine;
  const low = engine.quality === 'low';
  const pool = createVoicePool({ max: low ? 4 : 7 });
  /** @type {any} */
  let current = null;
  const retiring = new Set();

  /** Recipes each bed needs (for preloading). */
  const recipes = {};
  for (const [name, layers] of Object.entries(BEDS)) {
    const list = [];
    for (const l of layers) {
      if (l.noise) list.push(['noise', { color: l.noise }]);
      if (l.loop) list.push([l.loop, l.args]);
      if (l.event) list.push([l.event, l.args]);
    }
    recipes[name] = list;
  }

  function whenReady(bed, recipe, args, fn) {
    const ready = baker.get(recipe, args);
    if (ready) return fn(ready, false);
    baker.load(recipe, args).then((b) => { if (!bed.dead) fn(b, true); }).catch(() => {});
  }

  function chain(bed, src, layer, late) {
    let node = src;
    for (const [type, f, q] of layer.filters || []) {
      const bq = ac.createBiquadFilter();
      bq.type = type; bq.frequency.value = f; bq.Q.value = q;
      node.connect(bq); node = bq; bed.nodes.push(bq);
    }
    const g = ac.createGain();
    if (late) {
      g.gain.setValueAtTime(0, ac.currentTime);
      g.gain.linearRampToValueAtTime(layer.gain, ac.currentTime + 1.5);
    } else g.gain.value = layer.gain;
    node.connect(g); bed.nodes.push(g); node = g;
    for (const [idx, [hz, depth]] of (layer.lfo || []).entries()) {
      if (low && idx > 0) continue; // one LFO per layer on low-end phones
      const o = ac.createOscillator();
      o.frequency.value = hz * (0.9 + Math.random() * 0.2);
      const d = ac.createGain();
      d.gain.value = depth;
      o.connect(d); d.connect(g.gain);
      o.start(ac.currentTime + Math.random() * 0.1);
      bed.sources.push(o); bed.nodes.push(d);
    }
    if (layer.pan && ac.createStereoPanner) {
      const sp = ac.createStereoPanner();
      sp.pan.value = layer.pan;
      node.connect(sp); node = sp; bed.nodes.push(sp);
    }
    node.connect(bed.out);
  }

  function addBufferLayer(bed, layer, recipe, args) {
    whenReady(bed, recipe, args, (bufs, late) => {
      const buf = bufs[0];
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = layer.rate ?? (0.97 + Math.random() * 0.06);
      src.start(ac.currentTime, Math.random() * buf.duration);
      bed.sources.push(src);
      chain(bed, src, layer, late);
    });
  }

  function build(name) {
    const layers = BEDS[name];
    if (!layers) return null;
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(engine.buses.ambience);
    const bed = { name, out, nodes: [], sources: [], events: [], dead: false, killAt: Infinity };
    const t = ac.currentTime;
    for (const layer of layers) {
      if (layer.hq && low) continue;
      if (layer.noise) addBufferLayer(bed, layer, 'noise', { color: layer.noise });
      else if (layer.loop) addBufferLayer(bed, layer, layer.loop, layer.args);
      else if (layer.osc) {
        const o = ac.createOscillator();
        o.type = layer.osc; o.frequency.value = layer.freq;
        o.start(t);
        bed.sources.push(o);
        chain(bed, o, layer, false);
      } else if (layer.event) {
        baker.load(layer.event, layer.args).catch(() => {});
        bed.events.push({ ...layer, next: t + rnd(layer.every) * (0.15 + Math.random() * 0.6) });
      }
    }
    return bed;
  }

  function kill(bed) {
    bed.dead = true;
    for (const s of bed.sources) { try { s.stop(); } catch { /* not started */ } }
    for (const n of [...bed.sources, ...bed.nodes, bed.out]) { try { n.disconnect(); } catch { /* ignore */ } }
  }

  function fire(bed, ev, when) {
    const variants = baker.get(ev.event, ev.args);
    if (!variants) return;
    const count = ev.seq ? Math.round(rnd(ev.seq.count)) : 1;
    const pan = rnd(ev.pan ?? [-0.6, 0.6]);
    const drift = ev.seq ? (Math.random() - 0.5) * 0.3 : 0;
    let t = when;
    for (let k = 0; k < count; k++) {
      const buf = variants[Math.floor(Math.random() * variants.length)];
      const rate = ev.rate ? rnd(ev.rate) : 1;
      const { id } = pool.allocate(ev.event, 1, ac.currentTime, t + buf.duration / rate);
      if (id < 0) return;
      engine.playBuffer(buf, {
        when: t,
        gain: rnd(ev.gain) * (ev.seq ? 0.8 + Math.random() * 0.4 : 1),
        rate,
        pan: Math.max(-1, Math.min(1, pan + k * drift)),
        lowpass: ev.lowpass ? rnd(ev.lowpass) : 0,
        reverb: ev.reverb ?? 0.08,
        out: bed.out,
        onEnd: () => pool.release(id),
      });
      if (ev.seq) t += rnd(ev.seq.gap);
    }
  }

  return {
    recipes,
    get current() { return current?.name ?? 'none'; },
    /** Crossfade to a bed ('none' for silence). */
    set(name, fade = 2.5) {
      if ((current?.name ?? 'none') === name) return;
      const t = ac.currentTime;
      if (current) {
        const old = current;
        engine.glide(old.out.gain, 0, fade / 4);
        old.killAt = t + fade + 0.5;
        retiring.add(old);
      }
      current = name === 'none' ? null : build(name);
      if (current) {
        current.out.gain.setValueAtTime(0, t);
        current.out.gain.setTargetAtTime(1, t, fade / 4);
      }
    },
    /** Schedule events inside [t, t + horizon]; clean up faded beds. */
    pump(t, horizon) {
      for (const bed of retiring) if (t >= bed.killAt) { kill(bed); retiring.delete(bed); }
      if (!current) return;
      for (const ev of current.events) {
        while (ev.next < t + horizon) {
          const when = Math.max(ev.next, t);
          fire(current, ev, when);
          ev.next = when + rnd(ev.every);
        }
      }
    },
    dispose() {
      if (current) kill(current);
      for (const b of retiring) kill(b);
      retiring.clear();
      current = null;
    },
  };
}
