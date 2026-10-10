// Ambience beds per zone. Each bed mixes continuous layers (looped shared noise through
// filters with slow LFO modulation, baked loops like crowd babble or a generator) with
// sparse random events (passing cars and okadas, horns, birds, creaks) scheduled ahead
// on the audio clock. Beds crossfade when the player changes zone.
import { createVoicePool } from './polyphony.js';

const lp = (f, q = 0.7) => ['lowpass', f, q];
const hp = (f, q = 0.7) => ['highpass', f, q];
const bp = (f, q = 1) => ['bandpass', f, q];

const BABBLE_A = { seed: 43 };
const BABBLE_B = { seed: 44, talkers: 5 };

/**
 * Layer kinds:
 *  noise:     'pink'|'brown'|'white' noise → filters → gain (+ slow LFOs) → pan
 *  osc:       steady sine (mains hum)
 *  babble:    formant-synthesised crowd chatter (args for the babble recipe)
 *  generator: petrol generator drone (args for the generator recipe)
 *  event:     random one-shots every [min,max] s; seq = short sequences (distant footsteps)
 * All non-event layers of a bed are baked together into one seamless stereo loop.
 * hq: skipped on the low quality tier.
 */
export const BEDS = {
  street: [
    { noise: 'brown', filters: [hp(70), lp(280)], gain: 0.2, lfo: [[0.045, 0.06], [0.13, 0.025]] }, // traffic rumble
    { noise: 'pink', filters: [bp(850, 0.55)], gain: 0.04, lfo: [[0.07, 0.016]] }, // tyres and engines
    { noise: 'pink', filters: [hp(2800)], gain: 0.01, hq: true }, // air and distant hiss
    { noise: 'pink', filters: [bp(1050, 1.6)], gain: 0.03, lfo: [[0.21, 0.014], [0.57, 0.008]], pan: -0.2 }, // crowd murmur
    { babble: BABBLE_A, filters: [hp(250), lp(2600)], gain: 0.1, pan: 0.25 }, // hawkers and passers-by
    { generator: { fire: 48 }, filters: [hp(80), lp(650)], gain: 0.035, pan: -0.6, hq: true }, // a generator somewhere
    { event: 'carPass', args: { kind: 'car' }, every: [2.5, 7], gain: [0.08, 0.2], rate: [0.92, 1.08], reverb: 0.05 },
    { event: 'carPass', args: { kind: 'danfo' }, every: [9, 20], gain: [0.08, 0.18], rate: [0.95, 1.05], reverb: 0.05 },
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
    { babble: BABBLE_B, filters: [lp(1100)], gain: 0.07 }, // quiet chatter in the pews
    { noise: 'brown', filters: [hp(50), lp(160)], gain: 0.05 }, // street outside, through the walls
    { event: 'creak', every: [7, 18], gain: [0.08, 0.2], pan: [-0.8, 0.8], reverb: 0.6, rate: [0.9, 1.1] },
    { event: 'footsteps', args: { surface: 'tile', run: false }, every: [10, 26], gain: [0.05, 0.11], pan: [-0.8, 0.8], reverb: 0.8, seq: { count: [4, 8], gap: [0.52, 0.62] }, lowpass: [3000, 6000] },
    { event: 'horn', every: [20, 45], gain: [0.02, 0.05], lowpass: [700, 1100], reverb: 0.2, pan: [-0.9, 0.9] },
  ],
  market: [
    { babble: BABBLE_A, filters: [hp(180), lp(3200)], gain: 0.18, pan: -0.35 },
    { babble: { seed: 45 }, filters: [hp(180), lp(2800)], gain: 0.16, pan: 0.35, hq: true },
    { noise: 'pink', filters: [bp(800, 1)], gain: 0.035, lfo: [[0.17, 0.014], [0.43, 0.008]] },
    { noise: 'brown', filters: [hp(55), lp(220)], gain: 0.12, lfo: [[0.05, 0.04]] },
    { generator: { fire: 52 }, filters: [hp(80), lp(900)], gain: 0.05, pan: 0.7 },
    { event: 'hawker', every: [3.5, 9], gain: [0.07, 0.18], pan: [-0.85, 0.85], lowpass: [2500, 5000], reverb: 0.2, rate: [0.94, 1.06] },
    { event: 'coin', every: [6, 15], gain: [0.03, 0.07], pan: [-0.8, 0.8], rate: [0.5, 0.75], reverb: 0.15, lowpass: [3000, 6000] },
    { event: 'horn', every: [8, 22], gain: [0.03, 0.1], lowpass: [1400, 3000], reverb: 0.35, pan: [-0.9, 0.9] },
    { event: 'okada', args: { mode: 'pass' }, every: [12, 28], gain: [0.06, 0.14], reverb: 0.05 },
  ],
  prayer: [
    { noise: 'pink', filters: [hp(60), lp(240)], gain: 0.04 },
    { noise: 'pink', filters: [bp(430, 0.9)], gain: 0.02, lfo: [[8.7, 0.008]], pan: 0.3 },
    { babble: { seed: 46, talkers: 4 }, filters: [lp(650)], gain: 0.05 }, // others praying quietly
    { event: 'bulbul', every: [9, 22], gain: [0.02, 0.05], pan: [-0.9, 0.9], lowpass: [2500, 4000] },
    { event: 'horn', every: [25, 55], gain: [0.012, 0.03], lowpass: [600, 900], pan: [-0.9, 0.9] },
  ],
  home: [
    { generator: { fire: 50 }, filters: [hp(70), lp(1500)], gain: 0.09, pan: 0.55 }, // neighbour's generator
    { noise: 'pink', filters: [hp(80), lp(700)], gain: 0.015 },
    { noise: 'brown', filters: [hp(50), lp(180)], gain: 0.05, lfo: [[0.05, 0.02]] },
    { babble: { seed: 47, talkers: 3 }, filters: [lp(1300)], gain: 0.035, pan: -0.5, hq: true }, // neighbours talking
    { event: 'bulbul', every: [3, 9], gain: [0.08, 0.2], pan: [-0.9, 0.9], reverb: 0.1 },
    { event: 'dove', every: [10, 24], gain: [0.08, 0.16], pan: [-0.9, 0.9], reverb: 0.1, lowpass: [1800, 2600] },
    { event: 'crow', every: [25, 60], gain: [0.03, 0.06], pan: [-0.9, 0.9], lowpass: [2000, 3000], reverb: 0.25 },
    { event: 'horn', every: [18, 40], gain: [0.02, 0.05], lowpass: [900, 1500], pan: [-0.9, 0.9], reverb: 0.3 },
  ],
  beach: [
    { noise: 'brown', filters: [hp(40), lp(420)], gain: 0.28, lfo: [[0.11, 0.2], [0.043, 0.07]] }, // surf swells
    { noise: 'pink', filters: [hp(900), lp(5200)], gain: 0.05, lfo: [[0.11, 0.045], [0.27, 0.012]], pan: 0.2 }, // waves washing up
    { noise: 'pink', filters: [hp(2400)], gain: 0.012, lfo: [[0.08, 0.008]] }, // sea breeze
    { babble: { seed: 48, talkers: 4 }, filters: [hp(220), lp(2000)], gain: 0.05, pan: -0.4, hq: true }, // people on the sand
    { event: 'hawker', every: [10, 24], gain: [0.03, 0.08], pan: [-0.9, 0.9], lowpass: [2000, 4000], reverb: 0.05 },
  ],
  cinema: [
    { noise: 'pink', filters: [hp(60), lp(300)], gain: 0.05 }, // air conditioning
    { babble: { seed: 49, talkers: 2 }, filters: [hp(150), lp(1800)], gain: 0.09 }, // the film's dialogue
    { noise: 'brown', filters: [hp(30), lp(120)], gain: 0.05, lfo: [[0.2, 0.03]] }, // film score rumble
    { event: 'creak', every: [10, 25], gain: [0.04, 0.1], pan: [-0.8, 0.8], reverb: 0.4, rate: [0.9, 1.1] },
  ],
};

/** Overall level of each bed (quiet rooms are quiet, but not silent). */
export const BED_LEVEL = { street: 1, church: 1.45, market: 1, prayer: 1.25, home: 1.4, beach: 1.2, cinema: 1.3 };

const rnd = (range) => (Array.isArray(range) ? range[0] + Math.random() * (range[1] - range[0]) : range);

/** @param {ReturnType<import('./engine.js').createEngine>} engine */
export function createAmbience(engine) {
  const { ac, baker } = engine;
  const low = engine.quality === 'low';
  const pool = createVoicePool({ max: low ? 4 : 7 });
  /** @type {any} */
  let current = null;
  const retiring = new Set();

  /** Arguments of the baked loop for a bed (identical for preload and play, so the cache hits). */
  const bedArgs = {};
  /** Recipes each bed needs (for preloading). */
  const recipes = {};
  for (const [name, layers] of Object.entries(BEDS)) {
    const continuous = layers.filter((l) => !l.event && !(low && l.hq)).map(({ hq, ...l }) => l);
    bedArgs[name] = { layers: continuous, seconds: 16, sr: 12000, seed: name.length * 7919 + name.charCodeAt(0) };
    recipes[name] = [['bed', bedArgs[name]], ...layers.filter((l) => l.event && !(low && l.hq)).map((l) => [l.event, l.args])];
  }

  function build(name) {
    const layers = BEDS[name];
    if (!layers) return null;
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(engine.buses.ambience);
    const bed = { name, out, nodes: [], sources: [], events: [], dead: false, killAt: Infinity };
    const t = ac.currentTime;
    // the continuous part: one baked stereo loop
    const ready = (bufs, late) => {
      const src = ac.createBufferSource();
      src.buffer = bufs[0];
      src.loop = true;
      const g = ac.createGain();
      if (late) {
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
      }
      src.connect(g); g.connect(out);
      src.start(ac.currentTime, Math.random() * bufs[0].duration);
      bed.sources.push(src); bed.nodes.push(g);
    };
    const baked = baker.get('bed', bedArgs[name]);
    if (baked) ready(baked, false);
    else baker.load('bed', bedArgs[name], 2).then((b) => { if (!bed.dead) ready(b, true); }).catch(() => {});
    for (const layer of layers) {
      if (!layer.event || (layer.hq && low)) continue;
      baker.load(layer.event, layer.args).catch(() => {});
      bed.events.push({ ...layer, next: t + rnd(layer.every) * (0.15 + Math.random() * 0.6) });
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
        current.out.gain.setTargetAtTime(BED_LEVEL[name] ?? 1, t, fade / 4);
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
