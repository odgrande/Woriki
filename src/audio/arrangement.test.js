import { describe, it, expect } from 'vitest';
import {
  PROGRESSION, SLOTS, VOICINGS, KEY, BARS_PER_CYCLE, STEP_SECONDS, SWING,
  sectionOf, slotAt, voiceChord, barEvents, notesNeeded, stepTime, bassRoot, guitarTones,
} from './arrangement.js';

const pc = (m) => ((m % 12) + 12) % 12;

describe('progression and sections', () => {
  it('is an 8-bar I–vi–IV–V loop in G with a IV–V turnaround', () => {
    expect(PROGRESSION).toHaveLength(BARS_PER_CYCLE);
    expect(SLOTS.map((s) => s.root)).toEqual([0, 9, 5, 7, 0, 9, 5, 7, 0]);
    expect(SLOTS[6]).toMatchObject({ bar: 6, step: 0, root: 5 });
    expect(SLOTS[7]).toMatchObject({ bar: 6, step: 8, root: 7 });
    expect(KEY).toBe(7);
  });

  it('cycles intro → full → choir → breakdown → full …', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(sectionOf)).toEqual(['intro', 'full', 'choir', 'breakdown', 'full', 'choir', 'breakdown']);
  });

  it('finds the sounding chord slot', () => {
    expect(slotAt(0, 0)).toBe(0);
    expect(slotAt(6, 7)).toBe(6);
    expect(slotAt(6, 8)).toBe(7);
    expect(slotAt(7, 15)).toBe(8);
  });
});

describe('voicing', () => {
  it('keeps notes in range with the right pitch classes', () => {
    const v = voiceChord([7, 11, 2], null, 55, 72);
    expect(v.map(pc).sort()).toEqual([2, 7, 11].sort());
    for (const m of v) { expect(m).toBeGreaterThanOrEqual(55); expect(m).toBeLessThanOrEqual(72); }
  });

  it('moves voices smoothly between chords', () => {
    const g = voiceChord([7, 11, 2], null, 55, 72);
    const em = voiceChord([4, 7, 11], g, 55, 72);
    const moved = em.reduce((s, m, i) => s + Math.abs(m - g[i]), 0);
    expect(moved).toBeLessThanOrEqual(3); // G→Em shares two notes
  });

  it('precomputes voicings for every slot and instrument', () => {
    for (const [inst, list] of Object.entries(VOICINGS)) {
      expect(list).toHaveLength(SLOTS.length);
      list.forEach((v, i) => {
        const root = pc(KEY + SLOTS[i].root);
        expect(v.map(pc)).toContain(root);
        expect(v.length).toBe(inst === 'ep' ? 4 : 3);
      });
    }
  });

  it('places bass roots and guitar tones in playable ranges', () => {
    for (const s of SLOTS) {
      const r = bassRoot(s);
      expect(pc(r)).toBe(pc(KEY + s.root));
      expect(r).toBeGreaterThanOrEqual(40);
      expect(r).toBeLessThanOrEqual(51);
      const g = guitarTones(s);
      expect(g[3] - g[0]).toBe(12);
      expect(g[0]).toBeGreaterThanOrEqual(57);
      expect(g[3]).toBeLessThanOrEqual(81);
    }
  });
});

describe('bar events', () => {
  it('are deterministic and well-formed', () => {
    for (let b = 0; b < 40; b++) {
      const a = barEvents(b), c = barEvents(b);
      expect(a).toEqual(c);
      for (const e of a) {
        expect(e.step).toBeGreaterThanOrEqual(0);
        expect(e.step).toBeLessThan(16);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        expect(e.dur).toBeGreaterThan(0);
        expect(Math.abs(e.nudge)).toBeLessThan(0.1);
      }
    }
  });

  it('starts each full-band bar with the chord root in the bass', () => {
    for (let b = 8; b < 16; b++) {
      const first = barEvents(b).find((e) => e.inst === 'bass' && e.step === 0);
      expect(pc(first.midi)).toBe(pc(KEY + PROGRESSION[b % 8][0][1]));
    }
  });

  it('claps on 2 and 4, shaker on every 16th', () => {
    const ev = barEvents(9);
    expect(ev.filter((e) => e.inst === 'clap').map((e) => e.step)).toEqual(expect.arrayContaining([4, 12]));
    expect(ev.filter((e) => e.inst === 'shaker')).toHaveLength(16);
  });

  it('arranges sections: no choir before cycle 2, breakdown drops kick and bass', () => {
    const inst = (b) => new Set(barEvents(b).map((e) => e.inst));
    for (let b = 0; b < 16; b++) expect(inst(b).has('choir')).toBe(false);
    expect(inst(16).has('choir')).toBe(true);
    expect(inst(24).has('kick')).toBe(false); // breakdown, bars 1–4
    expect(inst(24).has('bass')).toBe(false);
    expect(inst(24).has('talking')).toBe(true);
    expect(inst(28).has('kick')).toBe(true); // breakdown, bars 5–8
    expect(inst(2).has('kick')).toBe(false); // intro, keys only
    expect(inst(4).has('kick')).toBe(true);
  });

  it('lists every sampled note needed, in range', () => {
    const n = notesNeeded();
    expect(n.ep.length).toBeGreaterThan(5);
    expect(Math.min(...n.ep)).toBeGreaterThanOrEqual(66);
    expect(Math.max(...n.ep)).toBeLessThanOrEqual(84);
    expect(Math.min(...n.bass)).toBeGreaterThanOrEqual(38);
    expect(Math.max(...n.bass)).toBeLessThanOrEqual(64);
    expect(Math.min(...n.guitar)).toBeGreaterThanOrEqual(57);
  });

  it('swings the off-beat sixteenths', () => {
    expect(stepTime(0, 1) - stepTime(0, 0)).toBeCloseTo(STEP_SECONDS * (1 + SWING), 6);
    expect(stepTime(0, 2) - stepTime(0, 0)).toBeCloseTo(STEP_SECONDS * 2, 6);
    expect(stepTime(1, 0)).toBeCloseTo(STEP_SECONDS * 16, 6);
  });
});
