import { describe, it, expect } from 'vitest';
import { QUIZ, VERSES, ROLES, MISSIONS, SHOP, SERVICES, FOOD, naira, num, verseText } from './content.js';
import { ACTIONS, SERVICE_DUTIES } from './actions.js';
import { EVENTS } from './events.js';

describe('content integrity', () => {
  it('every quiz question has one right answer and three distinct wrong ones', () => {
    expect(QUIZ.length).toBeGreaterThanOrEqual(40);
    for (const q of QUIZ) {
      expect(q).toHaveLength(5);
      expect(new Set(q.slice(1)).size).toBe(4);
    }
  });

  it('verses are KJV references with text', () => {
    for (const [ref, text] of VERSES) {
      expect(ref).toMatch(/^[1-3]? ?[A-Z][a-z]+( [a-z]+)* \d+:\d+/);
      expect(text.length).toBeGreaterThan(10);
    }
    expect(verseText(VERSES[0])).toContain('(KJV)');
  });

  it('roles have three ranks (except the minister path)', () => {
    for (const [id, r] of Object.entries(ROLES)) {
      expect(r.ranks.length).toBe(id === 'minister' ? 0 : 3);
    }
  });

  it('harder missions need more and pay more', () => {
    for (let i = 1; i < MISSIONS.length; i++) {
      const a = MISSIONS[i - 1];
      const b = MISSIONS[i];
      expect(b.level).toBeGreaterThan(a.level);
      expect(b.pay).toBeGreaterThan(a.pay);
      expect(b.points).toBeGreaterThan(a.points);
      expect(b.energy).toBeGreaterThan(a.energy);
      expect(b.faith).toBeGreaterThanOrEqual(a.faith);
    }
  });

  it('action, event and shop ids are unique', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ev = EVENTS.map((e) => e.id);
    expect(new Set(ev).size).toBe(ev.length);
    expect(new Set(SHOP.map((x) => x.id)).size).toBe(SHOP.length);
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      expect(['random', 'night', 'service-start', 'service-end', 'sunday-morning', 'special']).toContain(e.trigger);
    }
  });

  it('schedules Sunday 9:00, Wednesday 18:00 and Friday 22:00', () => {
    const byKind = Object.fromEntries(SERVICES.map((s) => [s.kind, s]));
    expect(byKind.sunday).toMatchObject({ weekday: 6, start: 540 });
    expect(byKind.study).toMatchObject({ weekday: 2, start: 1080 });
    expect(byKind.vigil).toMatchObject({ weekday: 4, start: 1320 });
  });

  it('worker roles have a post and a service duty', () => {
    for (const id of ['security', 'usher', 'choir', 'media', 'hospitality', 'children', 'prayer']) {
      expect(ROLES[id].post?.length).toBeGreaterThan(0);
      expect(SERVICE_DUTIES[id]).toBeTruthy();
    }
    expect(FOOD.buka.naira).toBe(800);
  });

  it('formats naira and counts', () => {
    expect(naira(800)).toBe('₦800');
    expect(naira(12400)).toBe('₦12,400');
    expect(naira(450000)).toBe('₦450k');
    expect(naira(1_200_000)).toBe('₦1.2M');
    expect(naira(-500)).toBe('-₦500');
    expect(num(12345)).toBe('12.3k');
  });
});
