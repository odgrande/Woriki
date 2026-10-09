import { describe, it, expect } from 'vitest';
import { createTrack, createClockSync, interpDelay, lerpAngle } from './interp.js';

describe('lerpAngle', () => {
  it('takes the short way round', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 2);
    expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25);
  });
});

describe('track', () => {
  it('blends between the samples around the render time', () => {
    const t = createTrack();
    t.push(1000, 0, 0, 0, 0, 'walk');
    t.push(1100, 1, 0, 0, 0.2, 'walk');
    const p = t.sample(1050);
    expect(p.x).toBeCloseTo(0.5);
    expect(p.r).toBeCloseTo(0.1);
    expect(p.a).toBe('walk');
  });

  it('holds the first sample before it and ignores out-of-order samples', () => {
    const t = createTrack();
    t.push(1000, 2, 0, 3, 0, 'idle');
    t.push(900, 9, 9, 9, 0, 'run');
    expect(t.length).toBe(1);
    expect(t.sample(500)).toMatchObject({ x: 2, z: 3 });
  });

  it('extrapolates moving players a little, then holds', () => {
    const t = createTrack({ maxExtrapolate: 200 });
    t.push(1000, 0, 0, 0, 0, 'walk');
    t.push(1100, 0.16, 0, 0, 0, 'walk');
    expect(t.sample(1150).x).toBeCloseTo(0.24); // 50 ms ahead at 1.6 m/s
    expect(t.sample(5000).x).toBeCloseTo(0.48); // capped at 200 ms
  });

  it('never pushes a stopped player forward', () => {
    const t = createTrack();
    t.push(1000, 0, 0, 0, 0, 'walk');
    t.push(1100, 0.16, 0, 0, 0, 'idle');
    expect(t.sample(1300).x).toBeCloseTo(0.16);
  });

  it('cuts instead of sliding across a teleport', () => {
    const t = createTrack({ teleport: 6 });
    t.push(1000, 0, 0, 0, 0, 'idle');
    t.push(1100, 50, 0, 0, 0, 'idle');
    expect(t.sample(1050).x).toBe(0);
    expect(t.sample(1100).x).toBe(50);
  });

  it('adapts its delay to a slow sender', () => {
    const fast = createTrack();
    const slow = createTrack();
    for (let i = 0; i < 30; i++) { fast.push(i * 100, i, 0, 0, 0, 'walk'); slow.push(i * 300, i, 0, 0, 0, 'walk'); }
    expect(fast.delay(120)).toBe(120);
    expect(slow.interval).toBeGreaterThan(280);
    expect(slow.delay(120)).toBeGreaterThan(340);
    expect(slow.delay(120)).toBeLessThanOrEqual(600);
  });

  it('drops old samples as time moves on', () => {
    const t = createTrack();
    for (let i = 0; i < 10; i++) t.push(1000 + i * 100, i, 0, 0, 0, 'walk');
    t.sample(1750);
    expect(t.length).toBeLessThanOrEqual(3);
    expect(t.sample(1750).x).toBeCloseTo(7.5);
  });
});

describe('clock sync', () => {
  it('locks onto the fastest delivery and decays towards slower ones', () => {
    const c = createClockSync();
    c.sample(10_000, 500); // offset 9500 (with some latency inside)
    c.sample(10_100, 590); // faster delivery → offset 9510
    expect(c.offset).toBe(9510);
    for (let i = 0; i < 200; i++) c.sample(10_200 + i * 100, 700 + i * 100 + 40); // steady 30 ms slower
    expect(c.offset).toBeGreaterThan(9459);
    expect(c.offset).toBeLessThan(9475);
    expect(c.serverNow(1000)).toBeCloseTo(1000 + c.offset);
  });

  it('interp delay grows with jitter and stays within bounds', () => {
    expect(interpDelay(0)).toBe(120);
    expect(interpDelay(40)).toBe(180);
    expect(interpDelay(1000)).toBe(400);
  });
});
