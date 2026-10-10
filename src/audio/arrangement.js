// The worship groove as data + pure functions (no Web Audio): a Nigerian gospel praise
// loop in G — I–vi–IV–V with a IV–V turnaround — for electric piano stabs, organ pad,
// highlife guitar, bass, kick, congregation claps, shaker, congas, talking drum and choir.

export const BPM = 116;
export const STEPS_PER_BAR = 16;
export const BARS_PER_CYCLE = 8;
/** Off-beat 16ths are delayed by this fraction of a step (light swing). */
export const SWING = 0.12;
/** Key: G (pitch class 7). */
export const KEY = 7;

export const STEP_SECONDS = 60 / BPM / 4;
export const BAR_SECONDS = STEP_SECONDS * STEPS_PER_BAR;

/** Per bar: list of [startStep, root (semitones above the key), quality]. */
export const PROGRESSION = [
  [[0, 0, 'maj']], // I   G
  [[0, 9, 'min']], // vi  Em
  [[0, 5, 'maj']], // IV  C
  [[0, 7, 'maj']], // V   D
  [[0, 0, 'maj']], // I   G
  [[0, 9, 'min']], // vi  Em
  [[0, 5, 'maj'], [8, 7, 'maj']], // IV V  C D
  [[0, 0, 'maj']], // I   G
];

const TRIAD = { maj: [0, 4, 7], min: [0, 3, 7] };
/** Four-note colours for the keys: add9 on major, minor 7th on minor. */
const COLOUR = { maj: [0, 4, 7, 14], min: [0, 3, 7, 10] };

/** Section played in a given 8-bar cycle. */
export function sectionOf(cycle) {
  if (cycle <= 0) return 'intro';
  return ['full', 'choir', 'breakdown'][(cycle - 1) % 3];
}

/** Flattened chord slots of one cycle: [{bar, step, root, quality}]. */
export const SLOTS = PROGRESSION.flatMap((bar, b) => bar.map(([step, root, quality]) => ({ bar: b, step, root, quality })));

/** Index into SLOTS of the chord sounding at (barInCycle, step). */
export function slotAt(bar, step) {
  let idx = 0;
  SLOTS.forEach((s, i) => { if (s.bar < bar || (s.bar === bar && s.step <= step)) idx = i; });
  return idx;
}

/**
 * Choose a voicing (sorted MIDI notes) of the pitch classes `pcs` inside [lo, hi] that
 * moves least from `prev` (smooth voice leading). Without `prev`, prefer the middle of the range.
 * @param {number[]} pcs pitch classes (0..11), may contain duplicates/extensions (>= 12 are folded)
 * @param {number[]|null} prev
 * @param {number} lo
 * @param {number} hi
 */
export function voiceChord(pcs, prev, lo, hi) {
  const pc = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))];
  const n = pc.length;
  let best = null, bestCost = Infinity;
  // every inversion in close position: pick the bottom pitch class, stack the others upward
  for (const bottom of pc) {
    const order = [bottom, ...pc.filter((p) => p !== bottom).sort((a, b) => ((a - bottom + 12) % 12) - ((b - bottom + 12) % 12))];
    for (let base = lo; base <= hi; base++) {
      if (((base % 12) + 12) % 12 !== bottom) continue;
      const v = order.map((p) => base + ((p - bottom + 12) % 12));
      if (v[n - 1] > hi) continue;
      let cost;
      if (prev && prev.length === n) cost = v.reduce((s, m, k) => s + Math.abs(m - prev[k]), 0);
      else cost = Math.abs((v[0] + v[n - 1]) / 2 - (lo + hi) / 2);
      if (cost < bestCost) { bestCost = cost; best = v; }
    }
  }
  return best || pc.map((p) => lo + p);
}

/** Pitch classes of a slot's chord. */
function chordPcs(slot, colour = false) {
  return (colour ? COLOUR : TRIAD)[slot.quality].map((x) => KEY + slot.root + x);
}

/** Voice-led voicings for every slot, made cyclic (computed twice around the loop). */
function voiceAll(lo, hi, colour) {
  let prev = null;
  let out = [];
  for (let pass = 0; pass < 2; pass++) {
    out = SLOTS.map((slot) => (prev = voiceChord(chordPcs(slot, colour), prev, lo, hi)));
  }
  return out;
}

export const VOICINGS = {
  ep: voiceAll(66, 84, true),
  organ: voiceAll(52, 67, false),
  choir: voiceAll(57, 74, false),
};

/** Bass root of a slot in the E2..D#3 octave (MIDI 40–51) — sits well on phone speakers. */
export function bassRoot(slot) {
  const pc = (KEY + slot.root) % 12;
  let m = 36 + pc;
  if (m < 40) m += 12;
  return m;
}

/** Highlife guitar arpeggio voicing: root, third, fifth, octave from B3 upward. */
export function guitarTones(slot) {
  const [r, t, f] = TRIAD[slot.quality].map((x) => (KEY + slot.root + x) % 12);
  let root = 55 + ((r - 55 % 12 + 12) % 12);
  if (root < 57) root += 12;
  const up = (from, pc) => { let m = from + 1; while (m % 12 !== pc) m++; return m; };
  const third = up(root, t), fifth = up(third, f);
  return [root, third, fifth, root + 12];
}

/** Small deterministic PRNG for humanisation. */
function prng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @typedef {{step: number, nudge: number, inst: string, midi?: number, vel: number, dur: number, variant?: number}} NoteEvent
 * step: 0..15 within the bar; nudge: humanised offset in steps; dur: length in steps.
 */

/**
 * All note events of one bar (absolute bar index since the music started).
 * @param {number} barIndex
 * @returns {NoteEvent[]}
 */
export function barEvents(barIndex) {
  const cycle = Math.floor(barIndex / BARS_PER_CYCLE);
  const bar = barIndex % BARS_PER_CYCLE;
  const section = sectionOf(cycle);
  const r = prng(barIndex * 7919 + 13);
  const ev = [];
  const hum = (v) => Math.max(0.05, Math.min(1, v * (0.93 + r() * 0.14)));
  const nudge = (amt = 0.035) => (r() * 2 - 1) * amt;
  const add = (e) => ev.push({ nudge: 0, ...e });

  const intro = section === 'intro';
  const breakdownLow = section === 'breakdown' && bar < 4;
  const band = !(intro && bar < 4) && !breakdownLow; // bass, kick, guitar, congas playing
  const choir = section === 'choir' || section === 'breakdown';
  const fillBar = bar === 3 || bar === 7;

  // --- keys: organ pad + electric piano stabs
  const slotsHere = SLOTS.map((s, i) => [s, i]).filter(([s]) => s.bar === bar);
  for (let k = 0; k < slotsHere.length; k++) {
    const [slot, i] = slotsHere[k];
    const end = k + 1 < slotsHere.length ? slotsHere[k + 1][0].step : STEPS_PER_BAR;
    for (const m of VOICINGS.organ[i]) add({ step: slot.step, inst: 'organ', midi: m, vel: breakdownLow ? 0.7 : 0.55, dur: end - slot.step });
    if (choir) for (const m of VOICINGS.choir[i]) add({ step: slot.step, inst: 'choir', midi: m, vel: breakdownLow ? 0.8 : 0.65, dur: end - slot.step });
  }
  const stabSteps = [2, 6, 10, 14].concat(bar % 2 === 1 ? [9] : []);
  for (const s of stabSteps) {
    const i = slotAt(bar, s);
    const vel = s === 9 ? 0.55 : (s === 2 || s === 10 ? 0.82 : 0.72);
    for (const m of VOICINGS.ep[i]) add({ step: s, nudge: nudge(0.02), inst: 'ep', midi: m, vel: hum(vel * (breakdownLow ? 0.8 : 1)), dur: 1.5 });
  }
  if (bar === 3 || bar === 7) {
    // anticipate the next chord on the last 16th (gospel push)
    const nextSlot = (slotAt(bar, 15) + 1) % SLOTS.length;
    for (const m of VOICINGS.ep[nextSlot]) add({ step: 15, inst: 'ep', midi: m, vel: hum(0.7), dur: 2 });
  }

  // --- highlife guitar
  if (band) {
    const pattern = [[0, 0], [2, 2], [3, 3], [5, 2], [6, 1], [8, 0], [10, 2], [11, 3], [13, 1], [14, 2]];
    for (const [s, idx] of pattern) {
      const tones = guitarTones(SLOTS[slotAt(bar, s)]);
      add({ step: s, nudge: nudge(0.03), inst: 'guitar', midi: tones[idx], vel: hum(s % 2 === 0 ? 0.8 : 0.55), dur: 1.3 });
    }
  }

  // --- bass guitar
  if (band || (intro && bar === 3)) {
    if (intro && bar === 3) {
      // pickup into the band entry
      const nr = bassRoot(SLOTS[slotAt(4, 0)]);
      add({ step: 12, inst: 'bass', midi: nr - 5, vel: 0.7, dur: 2 });
      add({ step: 14, inst: 'bass', midi: nr - 1, vel: 0.75, dur: 2 });
    } else {
      for (let k = 0; k < slotsHere.length; k++) {
        const [slot, i] = slotsHere[k];
        const R = bassRoot(slot);
        const nextSlot = SLOTS[(i + 1) % SLOTS.length];
        const NR = bassRoot(nextSlot);
        const approach = NR - 1 >= R - 2 ? NR - 1 : NR + 2; // chromatic from below, else from above
        const sixth = slot.quality === 'maj' ? 9 : 10;
        const half = slotsHere.length > 1;
        const o = slot.step;
        if (half) {
          add({ step: o + 0, inst: 'bass', midi: R, vel: hum(0.95), dur: 3 });
          add({ step: o + 3, inst: 'bass', midi: R + 12, vel: hum(0.55), dur: 1 });
          add({ step: o + 4, inst: 'bass', midi: R + 7, vel: hum(0.8), dur: 2 });
          add({ step: o + 6, inst: 'bass', midi: approach, vel: hum(0.7), dur: 2 });
        } else {
          add({ step: 0, inst: 'bass', midi: R, vel: hum(1), dur: 3 });
          add({ step: 3, inst: 'bass', midi: R + 12, vel: hum(0.55), dur: 1 });
          add({ step: 4, inst: 'bass', midi: R + 7, vel: hum(0.8), dur: 2 });
          add({ step: 6, inst: 'bass', midi: R + 12, vel: hum(0.65), dur: 1 });
          add({ step: 8, inst: 'bass', midi: R, vel: hum(0.9), dur: 2 });
          add({ step: 10, inst: 'bass', midi: R + 7, vel: hum(0.6), dur: 1 });
          add({ step: 11, inst: 'bass', midi: R + sixth, vel: hum(0.6), dur: 1 });
          add({ step: 12, inst: 'bass', midi: R + 7, vel: hum(0.75), dur: 2 });
          add({ step: 14, inst: 'bass', midi: approach, vel: hum(0.7), dur: 2 });
        }
      }
    }
  }

  // --- drums and percussion
  if (band) {
    add({ step: 0, inst: 'kick', vel: 1, dur: 2 });
    add({ step: 8, inst: 'kick', vel: 0.88, dur: 2 });
    if (bar % 2 === 1) add({ step: 11, inst: 'kick', vel: 0.5, dur: 1 });
    if (bar === 7) add({ step: 14, inst: 'kick', vel: 0.5, dur: 1 });
    for (const [s, v, vel] of [[3, 1, 0.45], [6, 0, 0.7], [7, 0, 0.6], [14, 2, 0.7], [15, 1, 0.55]]) {
      add({ step: s, nudge: nudge(0.03), inst: 'conga', variant: v, vel: hum(vel), dur: 1 });
    }
  }
  for (const s of [4, 12]) add({ step: s, nudge: nudge(0.02), inst: 'clap', variant: (barIndex + s) % 3, vel: hum(0.9), dur: 1 });
  if (choir && bar % 2 === 1) add({ step: 14, nudge: nudge(0.02), inst: 'clap', variant: (barIndex + 1) % 3, vel: hum(0.5), dur: 1 });
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    const accent = s % 4 === 2;
    add({ step: s, nudge: nudge(0.025), inst: 'shaker', variant: (s % 2) + (accent ? 2 : 0), vel: hum(s % 2 ? 0.4 : (accent ? 0.85 : 0.65)), dur: 1 });
  }

  // --- talking drum (variants: 0 up, 1 down, 2 high, 3 low, 4 bend)
  if (fillBar && !(intro && bar === 3)) {
    for (const [s, v, vel] of [[8, 0, 0.8], [10, 2, 0.7], [11, 2, 0.6], [12, 1, 0.8], [14, 3, 0.75]]) add({ step: s, nudge: nudge(0.02), inst: 'talking', variant: v, vel: hum(vel), dur: 2 });
  } else if (breakdownLow) {
    for (const [s, v, vel] of [[0, 3, 0.7], [3, 0, 0.7], [6, 2, 0.6], [8, 4, 0.7], [12, 1, 0.6]]) add({ step: s, nudge: nudge(0.02), inst: 'talking', variant: v, vel: hum(vel), dur: 2 });
  } else if (band && bar % 2 === 0) {
    add({ step: 14, nudge: nudge(0.02), inst: 'talking', variant: 0, vel: hum(0.55), dur: 2 });
  }

  return ev.sort((a, b) => a.step - b.step);
}

/** Every MIDI note each pitched sampled instrument needs (to bake samples ahead). */
export function notesNeeded() {
  const need = { ep: new Set(), bass: new Set(), guitar: new Set() };
  // cycles 0..3 cover every section
  for (let b = 0; b < BARS_PER_CYCLE * 4; b++) {
    for (const e of barEvents(b)) if (need[e.inst] && e.midi != null) need[e.inst].add(e.midi);
  }
  return { ep: [...need.ep].sort((a, b) => a - b), bass: [...need.bass].sort((a, b) => a - b), guitar: [...need.guitar].sort((a, b) => a - b) };
}

/** Time (seconds from the music start) of a step, with swing on off-beat 16ths. */
export function stepTime(barIndex, step, nudge = 0) {
  const swing = step % 2 === 1 ? SWING : 0;
  return (barIndex * STEPS_PER_BAR + step + swing + nudge) * STEP_SECONDS;
}
