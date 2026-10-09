import { describe, it, expect } from 'vitest';
import { createVoicePool } from './polyphony.js';

describe('voice pool', () => {
  it('steals the oldest voice when full', () => {
    const p = createVoicePool({ max: 2 });
    const a = p.allocate('horn', 1, 0, 5);
    const b = p.allocate('horn', 1, 0.1, 5);
    const c = p.allocate('door', 1, 0.2, 5);
    expect(c.steal).toEqual([a.id]);
    expect(p.active(0.3)).toBe(2);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it('never steals a higher-priority voice for a lower-priority sound', () => {
    const p = createVoicePool({ max: 1 });
    p.allocate('bell', 3, 0, 8);
    const r = p.allocate('click', 1, 0.5, 0.6);
    expect(r.id).toBe(-1);
    expect(p.active(1)).toBe(1);
  });

  it('applies per-name caps', () => {
    const p = createVoicePool({ max: 10, caps: { footstep: 2 } });
    const s1 = p.allocate('footstep', 1, 0, 1);
    p.allocate('footstep', 1, 0.1, 1);
    const s3 = p.allocate('footstep', 1, 0.2, 1);
    expect(s3.steal).toEqual([s1.id]);
    expect(p.count('footstep', 0.3)).toBe(2);
  });

  it('frees voices that have ended', () => {
    const p = createVoicePool({ max: 2 });
    p.allocate('a', 1, 0, 0.5);
    p.allocate('b', 1, 0, 0.5);
    const c = p.allocate('c', 1, 1, 2);
    expect(c.steal).toEqual([]);
    expect(p.active(1)).toBe(1);
  });

  it('releases explicitly', () => {
    const p = createVoicePool({ max: 1 });
    const a = p.allocate('a', 1, 0, 10);
    p.release(a.id);
    expect(p.allocate('b', 1, 0, 10).steal).toEqual([]);
  });
});
