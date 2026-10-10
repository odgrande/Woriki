import { describe, it, expect } from 'vitest';
import { distanceKm, travelQuote, travel, buyFurniture, activitiesAt, doActivity, placeOfZone, crossesLagoon } from './life.js';
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
    expect(s.home.bed).toBe(true);
    expect(s.naira).toBe(5000);
    expect(buyFurniture(s, 'bed').ok).toBe(false);
    expect(buyFurniture(s, 'tv').ok).toBe(false);
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
