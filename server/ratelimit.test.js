import { describe, it, expect } from 'vitest';
import { createBucket, createChatLimiter, createKeyedCounter } from './ratelimit.js';

const fakeClock = (t = 0) => { const c = () => c.t; c.t = t; return c; };

describe('token bucket', () => {
  it('allows a burst then refills over time', () => {
    const now = fakeClock();
    const b = createBucket({ capacity: 3, refillPerSec: 1, now });
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false]);
    expect(b.wait()).toBeCloseTo(1);
    now.t = 999;
    expect(b.take()).toBe(false);
    now.t = 1000;
    expect(b.take()).toBe(true);
    now.t = 60_000;
    expect(b.tokens).toBe(3); // never above capacity
  });
});

describe('chat limiter (5 messages / 10 s)', () => {
  it('blocks the 6th message and recovers after 2 s per line', () => {
    const now = fakeClock();
    const chat = createChatLimiter({ now });
    for (let i = 0; i < 5; i++) expect(chat.take()).toBe(true);
    expect(chat.take()).toBe(false);
    expect(chat.wait()).toBeCloseTo(2);
    now.t = 2000;
    expect(chat.take()).toBe(true);
    expect(chat.take()).toBe(false);
    now.t = 12_000;
    for (let i = 0; i < 5; i++) expect(chat.take()).toBe(true);
    expect(chat.take()).toBe(false);
  });
});

describe('keyed counter', () => {
  it('limits hits per key per window and sweeps old windows', () => {
    const now = fakeClock();
    const c = createKeyedCounter({ limit: 2, windowMs: 1000, now });
    expect([c.hit('a'), c.hit('a'), c.hit('a'), c.hit('b')]).toEqual([true, true, false, true]);
    now.t = 1000;
    expect(c.hit('a')).toBe(true);
    now.t = 5000;
    c.sweep();
    expect(c.size).toBe(0);
  });
});
