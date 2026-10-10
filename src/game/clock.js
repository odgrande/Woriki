// In-game time. Time is an absolute count of in-game minutes `T` since Monday 00:00 of
// week 0. One in-game day lasts `realMinutesPerDay` real minutes (24 by default, so one
// in-game minute = one real second). Pure functions only.
import { SERVICES, WEEKDAYS, WEEKDAY_NAMES } from './content.js';

export const DAY = 1440;
export const WEEK = DAY * 7;
export const DEFAULT_REAL_MINUTES_PER_DAY = 24;
/** New lives start on Sunday at 07:30, so the first service is close. */
export const START_T = 6 * DAY + 7 * 60 + 30;
/** Shared-clock epoch: Monday 2024-01-01 00:00 in Lagos (WAT, UTC+1) is in-game Monday 00:00. */
export const SHARED_EPOCH_MS = Date.UTC(2024, 0, 1) - 3600_000;
/** One in-game day per real day: the shared clock then shows the real time in Lagos. */
export const REAL_TIME = 1440;

/** In-game minutes that pass per real second. */
export const gameMinutesPerSecond = (realMinutesPerDay = DEFAULT_REAL_MINUTES_PER_DAY) => DAY / (realMinutesPerDay * 60);

/** In-game time derived from the wall clock, the same for every player (shared mode). */
export function sharedTime(nowMs, realMinutesPerDay = DEFAULT_REAL_MINUTES_PER_DAY) {
  return ((nowMs - SHARED_EPOCH_MS) / 1000) * gameMinutesPerSecond(realMinutesPerDay);
}

export const dayIndex = (T) => Math.floor(T / DAY);
export const weekdayOf = (T) => ((dayIndex(T) % 7) + 7) % 7;
export const minuteOfDay = (T) => ((T % DAY) + DAY) % DAY;
export const isSunday = (T) => weekdayOf(T) === 6;
export const hourOf = (T) => Math.floor(minuteOfDay(T) / 60);

/** "09:05" */
export function hhmm(minutes) {
  const m = Math.floor(((minutes % DAY) + DAY) % DAY);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "9am", "6pm", "10pm", "9:30am" for schedule copy. */
export function ampm(minutes) {
  const m = Math.floor(((minutes % DAY) + DAY) % DAY);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** Period of the day for greetings and lighting hints. */
export function partOfDay(T) {
  const h = hourOf(T);
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

/**
 * All concrete service occurrences overlapping [from, to).
 * @returns {{kind: string, name: string, start: number, end: number, def: object}[]}
 */
export function servicesBetween(from, to, services = SERVICES) {
  const out = [];
  const w0 = Math.floor(from / WEEK) - 1;
  const w1 = Math.floor(to / WEEK) + 1;
  for (let w = w0; w <= w1; w++) {
    for (const s of services) {
      const start = w * WEEK + s.weekday * DAY + s.start;
      const end = start + s.duration;
      if (end > from && start < to) out.push({ kind: s.kind, name: s.name, start, end, def: s });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The service running at T, or null. */
export function serviceAt(T, services = SERVICES) {
  return servicesBetween(T, T + 1e-6, services).find((s) => T >= s.start && T < s.end) || null;
}

/** The next service starting after T (strictly later). */
export function nextService(T, services = SERVICES) {
  return servicesBetween(T, T + WEEK + DAY, services).find((s) => s.start > T) || null;
}

/** Friendly countdown: "12 min", "1 h 05 min", "2 days". */
export function countdown(minutes) {
  const m = Math.max(0, Math.ceil(minutes));
  if (m < 60) return `${m} min`;
  if (m < DAY) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
  }
  const d = Math.round(m / DAY);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * Everything the HUD needs about the time at T.
 * @param {number} T absolute in-game minutes
 * @param {number} startT the minute this life began (day 1)
 * @param {object[]} [services] the schedule for this player (servicesFor(role))
 */
export function clockInfo(T, startT = START_T, services = SERVICES) {
  const wd = weekdayOf(T);
  const current = serviceAt(T, services);
  const next = nextService(T, services);
  return {
    T,
    day: dayIndex(T) - dayIndex(startT) + 1,
    /** Day of the month in a real-time world ("Sat 10"), from the shared epoch. */
    date: calendarDate(T),
    weekday: wd,
    weekdayShort: WEEKDAYS[wd],
    weekdayName: WEEKDAY_NAMES[wd],
    minute: minuteOfDay(T),
    hour: hourOf(T),
    time: hhmm(T),
    part: partOfDay(T),
    current: current ? { ...current, elapsed: T - current.start, left: current.end - T, progress: (T - current.start) / (current.end - current.start) } : null,
    next: next ? { ...next, inMinutes: next.start - T, label: `${next.name} in ${countdown(next.start - T)}`, when: `${WEEKDAY_NAMES[weekdayOf(next.start)]} ${ampm(next.start)}` } : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Calendar date of in-game minute T when the clock is real Lagos time: {day, month, monthName, year}. */
export function calendarDate(T) {
  const d = new Date(Date.UTC(2024, 0, 1) + dayIndex(T) * 86400_000);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), monthName: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() };
}
