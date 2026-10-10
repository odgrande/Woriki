// Live sequencer for the worship groove. Sampled instruments (baked per note) are played
// with AudioBufferSourceNodes; the organ pad (drawbar PeriodicWave + slow Leslie) and
// the choir "aah" (detuned saws through a shared formant filter bank) are synthesised
// live. Events are scheduled a short lookahead ahead of the audio clock.
import { barEvents, notesNeeded, stepTime, STEP_SECONDS, STEPS_PER_BAR } from './arrangement.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Mixer: level and pan per instrument. */
const MIX = {
  ep: { gain: 0.24, pan: 0 },
  organ: { gain: 0.07, pan: 0 },
  guitar: { gain: 0.42, pan: 0.38 },
  bass: { gain: 0.27, pan: 0 },
  kick: { gain: 0.3, pan: 0 },
  clap: { gain: 0.55, pan: 0 },
  shaker: { gain: 0.25, pan: -0.32 },
  conga: { gain: 0.38, pan: 0.25 },
  talking: { gain: 0.45, pan: -0.22 },
  choir: { gain: 0.3, pan: 0 },
};

/** Note release time-constants (s) for sampled instruments. */
const RELEASE = { ep: 0.07, bass: 0.05, guitar: 0.08 };

/** @param {ReturnType<import('./engine.js').createEngine>} engine */
export function createMusic(engine) {
  const { ac, baker } = engine;
  const low = engine.quality === 'low';

  const output = ac.createGain();
  output.gain.value = 0;
  output.connect(engine.buses.music);

  // ---- instrument channels ---------------------------------------------------
  const ch = {};
  for (const [name, m] of Object.entries(MIX)) {
    const g = ac.createGain();
    g.gain.value = m.gain;
    if (m.pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = m.pan;
      g.connect(p); p.connect(output);
    } else g.connect(output);
    ch[name] = g;
  }

  const lfoNodes = [];
  const lfo = (hz) => { const o = ac.createOscillator(); o.frequency.value = hz; lfoNodes.push(o); return o; };
  const high = engine.quality === 'high';

  // EP: gentle stereo autopan (suitcase tremolo) — per-sample panning, so high tier only
  if (high && ac.createStereoPanner) {
    const ap = ac.createStereoPanner();
    ch.ep.disconnect(); ch.ep.connect(ap); ap.connect(output);
    const d = ac.createGain(); d.gain.value = 0.22;
    lfo(4.2).connect(d); d.connect(ap.pan);
  }

  // Organ: drawbar registration (16' 8' 5⅓' 4' 2⅔' 2') with a slow Leslie as amplitude
  // tremolo on the whole bus (one modulated gain instead of per-note pitch modulation)
  const organWave = (() => {
    const imag = new Float32Array([0, 0.75, 1.0, 0.55, 0.42, 0, 0.18, 0, 0.14]);
    return ac.createPeriodicWave(new Float32Array(imag.length), imag, { disableNormalization: false });
  })();
  const organTrem = ac.createGain(); organTrem.gain.value = 0.9;
  ch.organ.disconnect(); ch.organ.connect(organTrem); organTrem.connect(output);
  const tremDepth = ac.createGain(); tremDepth.gain.value = 0.1;
  lfo(0.85).connect(tremDepth); tremDepth.connect(organTrem.gain);

  // Choir: formant bank ("aah"), then an ensemble: two slowly modulated delay lines give
  // every voice pitch vibrato and spread it left/right (one modulation for the whole choir)
  const choirIn = ac.createGain(); choirIn.gain.value = 1;
  const choirSum = ac.createGain(); choirSum.gain.value = 1;
  const formants = [[700, 7, 1.0], [1150, 10, 0.55], [2700, 16, 0.32]];
  for (const [f, q, g] of formants) {
    const bq = ac.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = f; bq.Q.value = q;
    const gg = ac.createGain(); gg.gain.value = g * 2.2;
    choirIn.connect(bq); bq.connect(gg); gg.connect(choirSum);
  }
  const body = ac.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 480; body.Q.value = 0.5;
  const bodyG = ac.createGain(); bodyG.gain.value = 0.22;
  choirIn.connect(body); body.connect(bodyG); bodyG.connect(choirSum);
  ch.choir.disconnect();
  choirSum.connect(ch.choir);
  if (ac.createChannelMerger) {
    const merger = ac.createChannelMerger(2);
    [[0.012, 5.1, 0], [0.019, 5.7, 1]].forEach(([base, hz, side]) => {
      const dl = ac.createDelay(0.05); dl.delayTime.value = base;
      const depth = ac.createGain(); depth.gain.value = 0.00022; // ±0.22 ms → about ±12 cents at 5 Hz
      lfo(hz).connect(depth); depth.connect(dl.delayTime);
      ch.choir.connect(dl); dl.connect(merger, 0, side);
    });
    merger.connect(output);
  } else ch.choir.connect(output);

  let lfosStarted = false;
  function startLfos() {
    if (lfosStarted) return;
    lfosStarted = true;
    for (const o of lfoNodes) o.start(ac.currentTime);
  }

  /** Per-note envelopes only need block-rate precision: much cheaper on phones. */
  const kRate = (param) => { try { param.automationRate = 'k-rate'; } catch { /* older engines */ } };

  // ---- samples ---------------------------------------------------------------
  const samples = { ep: new Map(), bass: new Map(), guitar: new Map(), kick: null, clap: null, shaker: null, conga: null, talking: null };
  let loading = null;
  let loaded = false;

  const need = notesNeeded();
  const drumRecipes = [['kick', 'kick'], ['clap', 'crowdClap'], ['shaker', 'shaker'], ['conga', 'conga'], ['talking', 'talkingDrum']];
  /** Bake every sample the groove needs (re-calling with a higher priority bumps queued jobs). */
  function load(priority = 1) {
    const jobs = [];
    for (const inst of ['ep', 'bass', 'guitar']) {
      for (const m of need[inst]) jobs.push(baker.load(inst, { midi: m }, priority).then((b) => samples[inst].set(m, b[0])));
    }
    for (const [slot, recipe] of drumRecipes) jobs.push(baker.load(recipe, undefined, priority).then((b) => { samples[slot] = b; }));
    if (!loading) loading = Promise.all(jobs).then(() => { loaded = true; });
    return loading;
  }

  // ---- voices ----------------------------------------------------------------
  const liveOsc = new Set();
  const velGain = (v) => Math.pow(v, 1.6);

  function sampled(inst, buf, when, vel, durSec, rate = 1) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = ac.createGain();
    kRate(g.gain);
    g.gain.value = velGain(vel);
    src.connect(g); g.connect(ch[inst]);
    const rel = RELEASE[inst];
    let stopAt = when + buf.duration / rate;
    if (rel && durSec < buf.duration) {
      g.gain.setValueAtTime(velGain(vel), when + durSec);
      g.gain.setTargetAtTime(0, when + durSec, rel);
      stopAt = Math.min(stopAt, when + durSec + rel * 7);
    }
    src.start(when);
    src.stop(stopAt);
    src.onended = () => { try { g.disconnect(); } catch { /* ignore */ } };
  }

  function organNote(midi, when, durSec, vel) {
    const o = ac.createOscillator();
    o.setPeriodicWave(organWave);
    o.frequency.value = mtof(midi) / 2;
    const g = ac.createGain();
    kRate(g.gain);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(velGain(vel), when + 0.012);
    g.gain.setValueAtTime(velGain(vel), when + durSec);
    g.gain.setTargetAtTime(0, when + durSec, 0.05);
    o.connect(g); g.connect(ch.organ);
    o.start(when); o.stop(when + durSec + 0.4);
    liveOsc.add(o);
    o.onended = () => { liveOsc.delete(o); try { g.disconnect(); } catch { /* ignore */ } };
  }

  function choirNote(midi, when, durSec, vel) {
    const g = ac.createGain();
    kRate(g.gain);
    const peak = velGain(vel) * 0.5;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.35);
    g.gain.setValueAtTime(peak, when + durSec);
    g.gain.setTargetAtTime(0, when + durSec, 0.18);
    g.connect(choirIn);
    const voices = low ? [0] : [-7, 7];
    voices.forEach((cents) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(midi);
      o.detune.value = cents;
      o.connect(g);
      o.start(when); o.stop(when + durSec + 1.3);
      liveOsc.add(o);
      o.onended = () => { liveOsc.delete(o); try { g.disconnect(); } catch { /* ignore */ } };
    });
  }

  function nearestSample(map, midi) {
    if (map.has(midi)) return [map.get(midi), 1];
    let best = null, bd = 99;
    for (const [m, b] of map) { const d = Math.abs(m - midi); if (d < bd) { bd = d; best = [b, Math.pow(2, (midi - m) / 12)]; } }
    return best;
  }

  const disabled = new Set();
  function schedule(e, when) {
    if (disabled.has(e.inst)) return;
    const durSec = e.dur * STEP_SECONDS;
    switch (e.inst) {
      case 'organ': organNote(e.midi, when, durSec, e.vel); break;
      case 'choir': choirNote(e.midi, when, durSec, e.vel); break;
      case 'ep': case 'bass': case 'guitar': {
        const s = nearestSample(samples[e.inst], e.midi);
        if (s) sampled(e.inst, s[0], when, e.vel, durSec, s[1]);
        break;
      }
      default: {
        const list = samples[e.inst];
        if (list) sampled(e.inst, list[(e.variant ?? 0) % list.length], when, e.vel, durSec);
      }
    }
  }

  // ---- transport -------------------------------------------------------------
  let want = false;
  let playing = false;
  let stopAt = Infinity;
  let start = 0;
  let bar = 0, step = 0;
  let barCache = { index: -1, events: [] };

  function begin() {
    const t = ac.currentTime;
    startLfos();
    start = t + 0.12;
    bar = 0; step = 0;
    playing = true;
    stopAt = Infinity;
    output.gain.cancelScheduledValues(t);
    output.gain.setValueAtTime(0, t);
    output.gain.linearRampToValueAtTime(1, t + 2.5);
  }

  function halt() {
    playing = false;
    for (const o of liveOsc) { try { o.stop(); } catch { /* ignore */ } }
    liveOsc.clear();
  }

  return {
    output,
    load,
    get track() { return want ? 'worship' : 'none'; },
    get playing() { return playing; },
    get ready() { return loaded; },
    /** Instrument names (mixer channels). */
    instruments: Object.keys(MIX),
    /** Mute/unmute one instrument (mixing and debugging). */
    setInstrumentMuted(name, m) {
      if (!ch[name]) return;
      engine.glide(ch[name].gain, m ? 0 : MIX[name].gain, 0.03);
    },
    /** Stop scheduling an instrument entirely (saves CPU; used by tests and for profiling). */
    setInstrumentEnabled(name, on) { if (on) disabled.delete(name); else disabled.add(name); },
    /** Position for debugging: {bar, step}. */
    get position() { return { bar, step }; },
    set(track) {
      const t = ac.currentTime;
      if (track === 'worship') {
        want = true;
        if (playing && stopAt !== Infinity) {
          // was fading out: come back up and keep the groove going
          stopAt = Infinity;
          output.gain.cancelScheduledValues(t);
          output.gain.setValueAtTime(output.gain.value, t);
          output.gain.linearRampToValueAtTime(1, t + 1.5);
        } else if (!playing) {
          load(2).then(() => { if (want && !playing) begin(); }).catch(() => {});
        }
      } else {
        want = false;
        if (playing && stopAt === Infinity) {
          output.gain.cancelScheduledValues(t);
          output.gain.setValueAtTime(output.gain.value, t);
          output.gain.linearRampToValueAtTime(0, t + 3);
          stopAt = t + 3.1;
        }
      }
    },
    pump(t, horizon) {
      if (!playing) return;
      if (t >= stopAt) { halt(); return; }
      const maxSteps = Math.ceil(horizon / STEP_SECONDS) + 2;
      for (let guard = 0; guard < maxSteps; guard++) {
        const stepStart = start + stepTime(bar, step);
        if (stepStart >= t + horizon || stepStart >= stopAt) break;
        if (barCache.index !== bar) barCache = { index: bar, events: barEvents(bar) };
        for (const e of barCache.events) {
          if (e.step !== step) continue;
          const when = start + stepTime(bar, e.step, e.nudge);
          if (when < t - 0.03) continue; // too late (main thread stalled): drop
          schedule(e, Math.max(when, t));
        }
        step++;
        if (step >= STEPS_PER_BAR) { step = 0; bar++; }
      }
    },
    dispose() {
      halt();
      for (const o of lfoNodes) { try { o.stop(); } catch { /* ignore */ } }
      try { output.disconnect(); } catch { /* ignore */ }
    },
  };
}
