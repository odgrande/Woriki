import { describe, it, expect } from 'vitest';
import { newStore, scheduled, replyTo, seed, threadDefs, preview } from './messages.js';
import { clockInfo, DAY } from '../../game/clock.js';
import { servicesFor } from '../../game/content.js';
import { newState } from '../../game/state.js';
import { dayPlan } from '../../game/systems.js';

const SAT = 5 * DAY; // Saturday 00:00 of week 0

function at(minutes, role = 'choir') {
  const s = newState({ name: 'Ada', role }, { rng: () => 0.2, T: SAT + minutes });
  return { s, c: clockInfo(s.T, s.startT, servicesFor(role)), plan: dayPlan(s) };
}

describe('phone messages', () => {
  it('has church groups first and a department group for the role', () => {
    const t = threadDefs('choir');
    expect(t[0].id).toBe('church');
    expect(t[1].name).toBe('Choir Department');
  });

  it('sends the morning devotion once a day and the choir practice reminder before 4pm', () => {
    const store = newStore();
    const { s, c, plan } = at(7 * 60);
    const first = scheduled(store, s, c, plan, () => 0.9);
    expect(first.some((m) => m.thread === 'church' && /Good morning family/.test(m.msg.text))).toBe(true);
    expect(scheduled(store, s, c, plan, () => 0.9).length).toBe(0);
    const later = at(14 * 60 + 30);
    const msgs = scheduled(store, later.s, later.c, later.plan, () => 0.9);
    expect(msgs.some((m) => m.thread === 'dept' && /Choir Practice/.test(m.msg.text))).toBe(true);
  });

  it('lets the pastor answer with scripture', () => {
    expect(replyTo('pastor', 'I am sick').text).toMatch(/Jeremiah 30:17/);
    expect(replyTo('pastor', 'I need money for rent').text).toMatch(/Philippians 4:19/);
    expect(replyTo('church', 'Good morning', 'Ada', () => 0).from).toBeTruthy();
  });

  it('welcomes a new member', () => {
    const store = newStore();
    seed(store, newState({ name: 'Ada', role: 'usher' }));
    expect(preview(store, 'pastor')).toMatch(/Welcome/);
    expect(store.unread.church).toBe(1);
  });
});
