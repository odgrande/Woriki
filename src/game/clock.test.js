import { describe, it, expect } from 'vitest';
import {
  DAY, WEEK, START_T, weekdayOf, minuteOfDay, hhmm, ampm, serviceAt, nextService, servicesBetween,
  countdown, clockInfo, gameMinutesPerSecond, sharedTime, SHARED_EPOCH_MS,
} from './clock.js';

const at = (weekday, h, m = 0, week = 0) => week * WEEK + weekday * DAY + h * 60 + m;

describe('clock basics', () => {
  it('starts a new life on Sunday at 07:30', () => {
    expect(weekdayOf(START_T)).toBe(6);
    expect(hhmm(START_T)).toBe('07:30');
  });

  it('runs 24 real minutes per in-game day by default (1 game minute per second)', () => {
    expect(gameMinutesPerSecond()).toBe(1);
    expect(gameMinutesPerSecond(12)).toBe(2);
  });

  it('formats times', () => {
    expect(hhmm(at(0, 9, 5))).toBe('09:05');
    expect(hhmm(-1)).toBe('23:59');
    expect(ampm(9 * 60)).toBe('9am');
    expect(ampm(18 * 60)).toBe('6pm');
    expect(ampm(22 * 60 + 30)).toBe('10:30pm');
    expect(ampm(0)).toBe('12am');
    expect(minuteOfDay(at(3, 13, 7, 2))).toBe(13 * 60 + 7);
  });

  it('formats countdowns', () => {
    expect(countdown(12)).toBe('12 min');
    expect(countdown(0.2)).toBe('1 min');
    expect(countdown(65)).toBe('1 h 05 min');
    expect(countdown(120)).toBe('2 h');
    expect(countdown(DAY * 2 + 10)).toBe('2 days');
  });

  it('derives the shared clock from the wall clock', () => {
    expect(sharedTime(SHARED_EPOCH_MS)).toBe(0);
    expect(sharedTime(SHARED_EPOCH_MS + 60_000)).toBe(60); // one real minute = one game hour
  });
});

describe('service schedule', () => {
  it('Sunday service runs 9:00–11:30', () => {
    expect(serviceAt(at(6, 8, 59))).toBeNull();
    expect(serviceAt(at(6, 9, 0)).kind).toBe('sunday');
    expect(serviceAt(at(6, 11, 29)).kind).toBe('sunday');
    expect(serviceAt(at(6, 11, 30))).toBeNull();
  });

  it('Wednesday Bible study at 18:00 and Friday vigil at 22:00 crossing midnight', () => {
    expect(serviceAt(at(2, 18, 30)).kind).toBe('study');
    expect(serviceAt(at(4, 23, 0)).kind).toBe('vigil');
    expect(serviceAt(at(5, 1, 30)).kind).toBe('vigil');
    expect(serviceAt(at(5, 2, 0))).toBeNull();
    expect(serviceAt(at(1, 18, 30))).toBeNull();
  });

  it('finds the next service and the countdown to it', () => {
    const n = nextService(START_T);
    expect(n.kind).toBe('sunday');
    expect(n.start - START_T).toBe(90);
    const after = nextService(at(6, 12, 0));
    expect(after.kind).toBe('study');
    expect(weekdayOf(after.start)).toBe(2);
    const fri = nextService(at(3, 20, 0, 5));
    expect(fri.kind).toBe('vigil');
  });

  it('lists services overlapping a range', () => {
    const list = servicesBetween(at(0, 0), at(0, 0, 0, 1));
    expect(list.map((x) => x.kind)).toEqual(['study', 'vigil', 'sunday']);
  });

  it('clockInfo shows day number, weekday and a "starts in" label', () => {
    const c = clockInfo(START_T + 78, START_T);
    expect(c.day).toBe(1);
    expect(c.weekdayShort).toBe('Sun');
    expect(c.time).toBe('08:48');
    expect(c.next.label).toBe('Sunday Service in 12 min');
    expect(c.current).toBeNull();
    const c2 = clockInfo(START_T + 120, START_T);
    expect(c2.current.kind).toBe('sunday');
    expect(c2.current.progress).toBeCloseTo(30 / 150);
    expect(clockInfo(START_T + DAY, START_T).day).toBe(2);
  });
});
