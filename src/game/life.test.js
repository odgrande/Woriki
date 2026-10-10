import { describe, it, expect } from 'vitest';
import { distanceKm, travelQuote, travel, buyFurniture, activitiesAt, doActivity, placeOfZone, crossesLagoon, familyAt, visitFamily, prayFamily } from './life.js';
import { newState } from './state.js';
import { createGame } from './index.js';

const life = (o = {}) => Object.assign(newState({ name: 'Ada', role: 'choir' }, { rng: () => 0.1 }), o);

describe('getting around Lagos', () => {
  it('measures trips in kilometres', () => {
    expect(distanceKm('home', 'grace')).toBeLessThan(1.5);
    expect(distanceKm('home', 'beach')).toBeGreaterThan(20);
    expect(crossesLagoon('home', 'beach')).toBe(true);
    expect(crossesLagoon('home', 'theatre')).toBe(false);
  });

  it('prices each way to travel', () => {
    const s = life({ naira: 50000, energy: 100 });
    const km = distanceKm('home', 'beach');
    expect(travelQuote(s, km, 'trek').ok).toBe(false); // too far to walk
    const taxi = travelQuote(s, km, 'taxi');
    const danfo = travelQuote(s, km, 'danfo');
    expect(taxi.naira).toBeGreaterThan(danfo.naira);
    expect(taxi.minutes).toBeLessThan(danfo.minutes);
    expect(travelQuote(s, 1, 'trek')).toMatchObject({ ok: true, naira: 0 });
    expect(travelQuote({ ...s, items: { bike: true } }, 5, 'bike').naira).toBe(0);
  });

  it('pays for the trip', () => {
    const s = life({ naira: 50000, energy: 100 });
    const r = travel(s, 'home', 'beach', 'taxi', () => 0.9);
    expect(r.ok).toBe(true);
    expect(s.naira).toBe(50000 - r.cost);
    expect(travel(life({ naira: 0 }), 'home', 'beach', 'taxi').ok).toBe(false);
  });

  it('maps world zones to places', () => {
    expect(placeOfZone('church-hall')).toBe('grace');
    expect(placeOfZone('home')).toBe('home');
    expect(placeOfZone('beach')).toBe('beach');
  });
});

describe('home catalog and things to do', () => {
  it('buys furniture once', () => {
    const s = life({ naira: 100000 });
    expect(buyFurniture(s, 'bed').ok).toBe(true);
    expect(s.home.bed).toBe('spring');
    expect(s.naira).toBe(5000);
    expect(buyFurniture(s, 'bed', 'spring').ok).toBe(false); // already yours
    expect(buyFurniture(s, 'tv').ok).toBe(false); // not enough money
  });

  it('replaces furniture with an upgrade and gives the old one away', async () => {
    const { variantOf } = await import('./life.js');
    const s = life({ naira: 1000000 });
    expect(variantOf(s, 'sofa').id).toBe('maroon');
    const c0 = s.character;
    const r = buyFurniture(s, 'sofa', 'leather');
    expect(r.ok).toBe(true);
    expect(variantOf(s, 'sofa').id).toBe('leather');
    expect(s.character).toBe(c0 + 1);
    expect(r.text).toMatch(/neighbour/);
  });

  it('opens activities by day and hour', () => {
    const s = life({ naira: 20000 });
    expect(activitiesAt(s, 'govhouse', 'Sat', 10)[0].ok).toBe(true);
    expect(activitiesAt(s, 'govhouse', 'Mon', 10)[0].ok).toBe(false);
    const party = activitiesAt(s, 'beach', 'Sat', 12).find((a) => a.id === 'beachparty');
    expect(party.ok).toBe(false);
    const r = doActivity(s, 'beachparty', 'Sat', 20);
    expect(r.ok).toBe(true);
    expect(s.convicted).toBe(true);
  });

  it('runs through the game facade', () => {
    const game = createGame({}, { save: false });
    game.newGame({ name: 'Tunde', role: 'worshipper' });
    game.state.naira = 100000;
    game.setLocation({ zone: 'home' });
    expect(game.here).toBe('home');
    const r = game.travel('balogun', 'taxi');
    expect(r.ok).toBe(true);
    expect(game.trip).toBe('balogun');
    expect(game.here).toBe('balogun');
    expect(game.activities().length).toBeGreaterThan(0);
    expect(game.buyFurniture('chairs').ok).toBe(true);
  });
});

describe('real Lagos time and old saves', () => {
  it('brings a life saved with 24-minute days back to real time', async () => {
    const { sharedTime, weekdayOf, REAL_TIME } = await import('./clock.js');
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const fast = createGame({}, { clock: 'shared', storage });
    fast.newGame({ name: 'Old', role: 'choir' });
    fast.state.T = sharedTime(Date.now(), 24); // far ahead of real time
    fast.save();
    const real = createGame({}, { clock: 'shared', realMinutesPerDay: REAL_TIME, storage });
    const st = real.continueGame();
    const now = sharedTime(Date.now(), REAL_TIME);
    expect(Math.abs(st.T - now)).toBeLessThan(2);
    expect(weekdayOf(st.T)).toBe(weekdayOf(now));
    real.tick(1);
    expect(real.state.T).toBeGreaterThanOrEqual(now - 1);
  });
});

describe('church billboards and giving', () => {
  it('books a billboard for a week', async () => {
    const { bookAd, activeAds } = await import('./life.js');
    const s = life({ naira: 300000 });
    const r = bookAd(s, { spot: 'thirdmainland', title: 'Holy Ghost Night', sub: 'Friday 10pm' });
    expect(r.ok).toBe(true);
    expect(s.naira).toBe(50000);
    expect(activeAds(s)[0].title).toBe('HOLY GHOST NIGHT');
    expect(bookAd(s, { spot: 'thirdmainland', title: 'Again' }).ok).toBe(false);
    s.T += 8 * 1440;
    expect(activeAds(s)).toEqual([]);
  });

  it('takes the tithe once a week', async () => {
    const { give } = await import('./life.js');
    const s = life({ naira: 100000, salary: 5000 });
    expect(give(s, 'tithe', 0, 3).amount).toBe(3500);
    expect(give(s, 'tithe', 0, 3).ok).toBe(false);
    expect(give(s, 'tithe', 0, 4).ok).toBe(true);
    expect(give(s, 'offering', 1000, 4).ok).toBe(true);
  });
});

describe('daily assignments and the dice', () => {
  it('gives three assignments a day and rewards them once', async () => {
    const { checkAssignments, todaysAssignments } = await import('./assignments.js');
    const s = life({ naira: 50000 });
    expect(todaysAssignments(s)).toHaveLength(3);
    checkAssignments(s);
    const [first] = s.assign.ids;
    const p0 = s.points;
    // pretend the first one is done
    const { ASSIGNMENT_BY_ID } = await import('./assignments.js');
    const a = ASSIGNMENT_BY_ID[first];
    s.doneToday = new Proxy({}, { get: () => true });
    s.gifts = { tithe: Math.floor(s.T / (1440 * 7)) };
    const lines = checkAssignments(s);
    expect(lines.length).toBe(4); // three done + the bonus
    expect(s.points).toBeGreaterThan(p0 + a.points);
    expect(checkAssignments(s)).toEqual([]);
  });

  it('rolls a role, a tradition and a start story', async () => {
    const { rollDestiny } = await import('./destiny.js');
    const seen = new Set();
    let x = 0;
    for (let i = 0; i < 400; i++) seen.add(rollDestiny(() => ((x = (x * 9301 + 49297) % 233280) / 233280)).role);
    expect(seen.size).toBeGreaterThan(6);
    const s = (await import('./state.js')).newState({ name: 'A', role: 'usher', start: 'convert' });
    expect(s.start).toBe('convert');
  });
});

describe('families in the houses', () => {
  it('the same house always has the same family', () => {
    expect(familyAt('0:12', 'Yaba')).toEqual(familyAt('0:12', 'Yaba'));
    const names = new Set(Array.from({ length: 40 }, (_, i) => familyAt(`1:${i}`).name));
    expect(names.size).toBeGreaterThan(8);
  });

  it('visiting invites them to church, once a house and a few houses a day', () => {
    const s = newState({ name: 'A', role: 'usher' });
    const first = visitFamily(s, '0:1', 'Yaba', () => 0.5);
    expect(first.ok).toBe(true);
    expect(first.text).not.toMatch(/\bthe [a-z]+ family/); // surnames keep their capital
    expect(visitFamily(s, '0:1', 'Yaba').ok).toBe(false);
    for (let i = 2; i < 5; i++) visitFamily(s, `0:${i}`, 'Yaba', () => 0.5);
    expect(s.doneToday.visits).toBe(4);
    expect(visitFamily(s, '0:9', 'Yaba').ok).toBe(false);
  });

  it('praying for a family raises faith once a day', () => {
    const s = newState({ name: 'A', role: 'usher' });
    const f0 = s.faith;
    expect(prayFamily(s, '2:3', 'Ikeja').ok).toBe(true);
    expect(prayFamily(s, '2:3', 'Ikeja').ok).toBe(false);
    expect(s.faith).toBe(Math.min(100, f0 + 1));
  });
});

describe('journey roads', () => {
  it('crosses Third Mainland Bridge to the Island and takes the expressway to Lekki', async () => {
    const { routeFor } = await import('./life.js');
    expect(routeFor('home', 'beach', () => 0)).toEqual(['thirdmainland', 'lekki']);
    expect(routeFor('home', 'balogun', () => 0)).toEqual(['thirdmainland']);
    expect(routeFor('home', 'computer', () => 0)).toEqual(['ikorodu']);
    expect(routeFor('home', 'owambe', () => 0)).toEqual(['ojuelegba']);
    expect(routeFor('beach', 'home', () => 0)).toEqual(['lekki', 'thirdmainland', 'herbert']);
  });
  it('varies short trips around Yaba', async () => {
    const { routeFor } = await import('./life.js');
    const seen = new Set([0.1, 0.6, 0.9].map((x) => routeFor('home', 'police', () => x)[0]));
    expect(seen.size).toBe(3);
  });
});
