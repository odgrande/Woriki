import { describe, it, expect } from 'vitest';
import { newState } from './state.js';
import {
  makeEnv, canDo, doAction, tick, advance, passTime, choose, activateEvent, startQuiz, answerQuiz, milestone,
  completeMilestone, buyItem, buyFood, presence, progress, mood, title, endDay, checkCollapse, KNEEL_MINUTES, postRequest, markAnswered,
} from './systems.js';
import { createGame } from './index.js';
import { EVENT_BY_ID } from './events.js';
import { DAY, START_T, weekdayOf, hhmm } from './clock.js';
import { MISSIONS } from './content.js';

/** Deterministic rng returning values from a list (cycled). */
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const fresh = (profile = {}, rng = () => 0.99) => newState({ name: 'Tunde', role: 'worshipper', ...profile }, { rng: () => 0.1 });
const env = (o = {}) => makeEnv({ rng: () => 0.99, ...o });
const types = (e) => e.fx.map((x) => x.type);

/** Tick in 1-minute steps. */
function run(s, minutes, e) {
  for (let i = 0; i < minutes; i++) tick(s, 1, e);
}

describe('needs over time', () => {
  it('hunger, energy, faith and word drift during the day', () => {
    const s = fresh();
    const f0 = s.faith;
    passTime(s, 24 * 60);
    expect(s.hunger).toBeCloseTo(80 - 48, 5);
    expect(s.energy).toBeLessThan(100);
    expect(s.faith).toBeCloseTo(f0 - 1.5, 5);
  });

  it('mood follows faith, hunger and conscience', () => {
    const s = fresh();
    s.faith = 90; s.hunger = 90; s.character = 80;
    expect(mood(s).id).toBe('joyful');
    s.faith = 10; s.hunger = 5; s.convicted = true;
    expect(mood(s).id).toBe('miserable');
  });
});

describe('actions', () => {
  it('needs the right place, time, energy and money', () => {
    const s = fresh();
    s.T = START_T + 4 * DAY + 60; // Thursday 08:30
    const e = env({ loc: { zone: 'street' } });
    expect(canDo(s, 'buka', e)).toMatchObject({ ok: false, code: 'where' });
    e.loc.zone = 'market';
    expect(canDo(s, 'buka', e).ok).toBe(true);
    s.naira = 100;
    expect(canDo(s, 'buka', e)).toMatchObject({ ok: false, code: 'money' });
    s.naira = 5000; s.energy = 1;
    expect(canDo(s, 'buka', e)).toMatchObject({ ok: false, code: 'energy' });
    expect(canDo(s, 'mountain', env({ loc: { zone: 'busstop' } }))).toMatchObject({ ok: false, code: 'time' });
  });

  it('eating at the buka costs ₦800 and fills you up', () => {
    const s = fresh();
    s.T = START_T + DAY + 600;
    s.hunger = 30;
    const n = s.naira;
    const e = env({ loc: { zone: 'market' } });
    const r = doAction(s, 'buka', e);
    expect(r.ok).toBe(true);
    expect(s.naira).toBe(n - 800);
    expect(s.hunger).toBe(75);
    expect(r.deltas.find((d) => d.key === 'naira').delta).toBe(-800);
  });

  it('once-a-day actions cannot repeat until midnight', () => {
    const s = fresh();
    const e = env();
    expect(doAction(s, 'read', e).ok).toBe(true);
    expect(canDo(s, 'read', e)).toMatchObject({ ok: false, code: 'done' });
    advance(s, DAY, e);
    expect(canDo(s, 'read', e).ok).toBe(true);
  });

  it('going to work skips 8 hours in local mode but is blocked before a service', () => {
    const s = fresh();
    const e = env({ loc: { zone: 'busstop' } });
    s.T = START_T + DAY - 90; // Monday 06:00
    expect(weekdayOf(s.T)).toBe(0);
    const n = s.naira;
    expect(doAction(s, 'work', e).ok).toBe(true);
    expect(hhmm(s.T)).toBe('14:00');
    expect(s.naira).toBeGreaterThan(n);
    expect(types(e)).toContain('skip');
    const w = fresh();
    w.T = START_T + 3 * DAY - 90 + 5 * 60; // Wednesday 11:00, Bible study at 18:00
    expect(canDo(w, 'work', e)).toMatchObject({ ok: false, code: 'service' });
    expect(canDo(w, 'work', env({ loc: { zone: 'busstop' }, mode: 'shared' })).ok).toBe(true);
  });

  it('harder missions pay more', () => {
    const run1 = (m) => {
      const s = fresh();
      s.stage = 1; s.faith = 100; s.character = 100; s.naira = 100000;
      s.T = START_T + 6 * DAY - 90 + 60; // Saturday 07:00
      const n = s.naira;
      const r = doAction(s, m.id, env({ loc: { zone: 'busstop' } }));
      expect(r.ok).toBe(true);
      return s.naira - n + (m.cost || 0);
    };
    expect(run1(MISSIONS[4])).toBeGreaterThan(run1(MISSIONS[0]));
  });

  it('sleeping at home skips to 6am and restores energy', () => {
    const s = fresh();
    s.T = START_T + DAY + 14 * 60 + 30; // Monday 22:00
    s.energy = 20;
    const day = s.day;
    const e = env({ loc: { zone: 'home' } });
    expect(doAction(s, 'sleep', e).ok).toBe(true);
    expect(hhmm(s.T)).toBe('06:00');
    expect(weekdayOf(s.T)).toBe(1);
    expect(s.day).toBe(day + 1);
    expect(s.energy).toBe(100);
  });

  it('stay actions run as a shift while you remain at the place', () => {
    const s = fresh();
    s.T = START_T + DAY + 600;
    s.hunger = 40;
    const e = env({ loc: { zone: 'home' } });
    expect(doAction(s, 'cook', e).pending).toBe('shift');
    run(s, 10, e);
    e.loc.zone = 'street';
    run(s, 15, e);
    expect(s.shift.done).toBe(10);
    e.loc.zone = 'home';
    run(s, 11, e);
    expect(s.shift).toBeNull();
    expect(s.hunger).toBeGreaterThan(60);
  });
});

describe('prayer by kneeling', () => {
  it('kneeling in a linked world asks the player to kneel, then counts after a while', () => {
    const s = fresh();
    s.T = START_T + DAY + 600;
    const e = env({ linked: true, loc: { zone: 'prayer-room', kneeling: false } });
    expect(doAction(s, 'prayroom', e)).toMatchObject({ ok: true, pending: 'kneel' });
    expect(e.fx.find((f) => f.type === 'request').action).toBe('kneel');
    const f0 = s.faith;
    e.loc.kneeling = true;
    run(s, KNEEL_MINUTES - 1, e);
    expect(progress(s, e.loc).kind).toBe('kneel');
    run(s, 2, e);
    expect(s.doneToday.prayroom).toBe(true);
    expect(s.faith).toBeGreaterThan(f0);
    run(s, KNEEL_MINUTES, e);
    expect(s.doneToday.pray).toBe(true); // quiet time counts next
  });
});

describe('services', () => {
  it('sitting in the hall through Sunday service gives credit and a streak at midnight', () => {
    const s = fresh();
    const e = env({ loc: { zone: 'church-hall', seated: true } });
    run(s, 89, e); // 07:30 → 08:59
    expect(s.attendance).toBeNull();
    run(s, 2, e);
    expect(s.attendance.kind).toBe('sunday');
    expect(types(e)).toEqual(expect.arrayContaining(['service:start', 'audio:music']));
    expect(e.fx.find((f) => f.type === 'audio:music').track).toBe('worship');
    expect(presence(s, e.loc).present).toBe(true);
    run(s, 150, e);
    expect(s.attendance).toBeNull();
    expect(s.doneToday.sunday).toBe(true);
    expect(s.services).toBe(1);
    expect(types(e)).toContain('service:end');
    const p = s.points;
    advance(s, DAY - (s.T % DAY), e);
    expect(s.streak).toBe(1);
    expect(s.points).toBe(p + 5);
  });

  it('missing Sunday breaks the streak and costs faith', () => {
    const s = fresh();
    s.streak = 3;
    const e = env({ loc: { zone: 'home' } });
    run(s, 300, e);
    expect(s.doneToday.sunday).toBeUndefined();
    const f = s.faith;
    advance(s, DAY - (s.T % DAY), e);
    expect(s.streak).toBe(0);
    expect(s.missedSundays).toBe(1);
    expect(s.faith).toBeLessThan(f - 5);
  });

  it('standing in the hall does not count, but a worker at their post does', () => {
    const stand = fresh();
    const e1 = env({ loc: { zone: 'church-hall', seated: false } });
    run(stand, 260, e1);
    expect(stand.doneToday.sunday).toBeUndefined();

    const guard = fresh({ role: 'security' });
    const e2 = env({ loc: { zone: 'gate' } });
    run(guard, 260, e2);
    expect(guard.doneToday.sunday).toBe(true);
    expect(guard.doneToday.gate).toBe(true);
    expect(guard.xp).toBeGreaterThan(0);
  });

  it('bells ring 15 minutes before', () => {
    const s = fresh();
    const e = env({ loc: { zone: 'home' } });
    run(s, 76, e);
    expect(e.fx.some((f) => f.type === 'audio:play' && f.name === 'bell')).toBe(true);
    expect(e.fx.some((f) => f.type === 'toast' && /starts in 15 minutes/.test(f.text))).toBe(true);
  });
});

describe('temptations, repentance and endings', () => {
  it('falling convicts you; repenting brings grace', () => {
    const s = fresh();
    const e = env();
    activateEvent(s, EVENT_BY_ID.wallet, e);
    expect(s.activeEvent.choices).toHaveLength(2);
    const c0 = s.character;
    const r = choose(s, 0, e);
    expect(r.ok).toBe(true);
    expect(s.convicted).toBe(true);
    expect(s.character).toBe(c0 - 8);
    expect(s.naira).toBeGreaterThan(50000);
    expect(doAction(s, 'repent', e).ok).toBe(true);
    expect(s.convicted).toBe(false);
    expect(e.fx.some((f) => f.type === 'modal' && f.modal.title === 'Forgiven')).toBe(true);
  });

  it('resisting builds character', () => {
    const s = fresh();
    const e = env();
    activateEvent(s, EVENT_BY_ID.offeringbag, e);
    const c0 = s.character;
    choose(s, 1, e);
    expect(s.character).toBe(c0 + 6);
    expect(s.convicted).toBe(false);
  });

  it('repeated fraud ends with EFCC', () => {
    const s = fresh();
    s.frauds = 3;
    const e = env({ rng: () => 0.1 });
    expect(checkCollapse(s, e)).toBe(true);
    expect(s.over).toBe(true);
    expect(s.ending.id).toBe('efcc');
    expect(types(e)).toContain('over');
    expect(canDo(s, 'read', e).code).toBe('over');
  });

  it('character at zero means church discipline, not game over (before ordination)', () => {
    const s = fresh();
    s.character = 0;
    const e = env();
    checkCollapse(s, e);
    expect(s.over).toBe(false);
    expect(s.character).toBe(15);
  });

  it('grace restores faith at zero', () => {
    const s = fresh();
    s.faith = 0;
    s.T = START_T + DAY - 1; // Sunday 23:59... next tick is midnight
    s.doneToday.sunday = true;
    const e = env();
    endDay(s, e);
    expect(s.faith).toBe(20);
  });
});

describe('quiz, exams and the minister path', () => {
  it('the daily Bible quiz pays ⭐ for right answers', () => {
    const s = fresh();
    const e = env({ rng: Math.random });
    expect(doAction(s, 'quiz', e).ok).toBe(true);
    const p = s.points;
    let last;
    while (s.exam) last = answerQuiz(s, s.exam.questions[s.exam.i].answer, e);
    expect(last.done).toBe(true);
    expect(last.result.score).toBe(3);
    expect(s.points).toBe(p + 9);
  });

  it('Bible school exams: pass 4/5 three times to graduate, then ordination plants a church', () => {
    const s = fresh({ role: 'minister' });
    s.stage = 3; s.word = 100; s.faith = 100; s.character = 100;
    const e = env({ rng: Math.random });
    for (const sem of [1, 2, 3]) {
      expect(s.semester).toBe(sem);
      startQuiz(s, 'exam', 5, e);
      while (s.exam) answerQuiz(s, s.exam.questions[s.exam.i].answer, e);
    }
    expect(s.stage).toBe(4);
    expect(title(s)).toBe('Bible School Graduate');
    expect(milestone(s).can).toBe(true);
    completeMilestone(s, e);
    expect(s.activeEvent.id).toBe('church');
    choose(s, 1, e);
    expect(s.stage).toBe(5);
    expect(s.pastor.members).toBe(7);
    expect(title(s)).toBe('Pastor');
  });

  it('failing an exam costs word', () => {
    const s = fresh({ role: 'minister' });
    s.stage = 3; s.word = 60;
    const e = env({ rng: Math.random });
    startQuiz(s, 'exam', 5, e);
    let r;
    while (s.exam) r = answerQuiz(s, (s.exam.questions[s.exam.i].answer + 1) % 4, e);
    expect(r.result.title).toBe('Not this time');
    expect(s.semester).toBe(1);
    expect(s.word).toBe(55);
  });

  it('baptism needs two services and faith 30, then promotions need experience', () => {
    const s = fresh({ role: 'usher' });
    s.faith = 35;
    expect(milestone(s).label).toBe('Get baptized');
    expect(milestone(s).can).toBe(false);
    s.services = 2;
    completeMilestone(s, env());
    expect(s.stage).toBe(1);
    expect(milestone(s).label).toBe('Become Senior Usher');
    s.xp = 130; s.faith = 45; s.character = 55;
    completeMilestone(s, env());
    expect(s.rank).toBe(1);
    expect(title(s)).toBe('Senior Usher');
  });
});

describe('shop, food and the prayer wall', () => {
  it('buys each item once with naira or ⭐', () => {
    const s = fresh();
    s.naira = 5000; s.points = 100;
    const e = env();
    expect(buyItem(s, 'bible', e).ok).toBe(true);
    expect(s.naira).toBe(1000);
    expect(buyItem(s, 'bible', e).ok).toBe(false);
    expect(buyItem(s, 'mat', e).ok).toBe(true);
    expect(s.points).toBe(20);
    expect(buyItem(s, 'phone', e).ok).toBe(false);
  });

  it('buys food from world vendors', () => {
    const s = fresh();
    s.hunger = 20;
    const n = s.naira;
    expect(buyFood(s, 'canteen', env()).ok).toBe(true);
    expect(s.naira).toBe(n - 1000);
    expect(s.hunger).toBe(70);
  });

  it('posts requests and records testimonies', () => {
    const s = fresh();
    const e = env();
    expect(postRequest(s, '  JAMB result this week  ', e).ok).toBe(true);
    expect(s.requests[0].text).toBe('JAMB result this week');
    const p = s.points;
    markAnswered(s, s.requests[0].id, e);
    expect(s.testimonies).toBe(1);
    expect(s.points).toBe(p + 15);
  });
});

describe('createGame', () => {
  function fakeBus() {
    const m = new Map();
    const log = [];
    return {
      log,
      on(t, fn) { (m.get(t) || m.set(t, new Set()).get(t)).add(fn); return () => m.get(t).delete(fn); },
      emit(t, d) { log.push([t, d]); m.get(t)?.forEach((fn) => fn(d)); },
    };
  }

  it('runs the real-time clock and talks on the bus', () => {
    const bus = fakeBus();
    const game = createGame({ bus }, { save: false, rng: () => 0.99 });
    game.newGame({ name: 'Ngozi', role: 'choir', tradition: 'mission' });
    expect(game.state.name).toBe('Ngozi');
    expect(game.clock.time).toBe('07:30');
    bus.emit('player:zone', { zone: { id: 'choir' } });
    expect(game.loc.zone).toBe('choir');
    for (let i = 0; i < 95; i++) game.tick(1); // 95 real seconds = 95 game minutes
    expect(game.clock.current.kind).toBe('sunday');
    expect(bus.log.some(([t]) => t === 'service:start')).toBe(true);
    expect(bus.log.some(([t, d]) => t === 'audio:music' && d.track === 'worship')).toBe(true);
    expect(bus.log.some(([t]) => t === 'game:changed')).toBe(true);
    expect(game.progress.kind).toBe('service');
    expect(game.presence.atPost).toBe(true);
  });

  it('pauses the local clock while an event is open', () => {
    const game = createGame({}, { save: false });
    game.newGame({ name: 'A', role: 'worshipper' });
    const T = game.state.T;
    game.pause('modal');
    game.tick(10);
    expect(game.state.T).toBe(T);
    game.resume('modal');
    game.tick(10);
    expect(game.state.T).toBe(T + 10);
  });

  it('handles world interactions: food at the buka, kneel at the altar', () => {
    const bus = fakeBus();
    const game = createGame({ bus }, { save: false });
    game.newGame({ name: 'A', role: 'worshipper' });
    game.state.hunger = 30;
    bus.emit('player:interact', { id: 'buka', action: 'buy-food', label: 'Buy food' });
    expect(game.state.hunger).toBe(75);
    bus.emit('player:interact', { id: 'altar-pray', action: 'pray' });
    expect(bus.log.some(([t, d]) => t === 'game:request' && d.action === 'kneel')).toBe(true);
  });
});
