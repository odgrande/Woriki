import { describe, it, expect } from 'vitest';
import { createState } from './world.js';
import { buildInterior, INTERIOR_OF, interiorOrigin } from './interiors.js';
import { buildRoute, ROUTES } from './roads.js';
import { PLACES, ACTIVITIES } from '../game/life.js';

const R = { u0: 0, v0: 0, u1: 0.1, v1: 0.1 };
const regions = new Proxy({}, { get: () => R });

describe('inside the places', () => {
  it('every place you travel to (not walkable, not coming soon) has an inside', () => {
    for (const p of PLACES.filter((x) => !x.walk && !x.soon)) expect(INTERIOR_OF[p.id], p.id).toBeTruthy();
  });

  it('builds each inside with a way in, a way out, people, and a spot for each thing to do', () => {
    const origins = new Set();
    for (const id of Object.keys(INTERIOR_OF)) {
      const W = createState(regions, regions);
      const place = PLACES.find((p) => p.id === id);
      const info = buildInterior(W, id, place);
      origins.add(interiorOrigin(id).join(','));
      expect(info.spawn.distanceTo(info.exit), id).toBeGreaterThan(1.5);
      expect(info.npcs.length, id).toBeGreaterThan(0);
      const acts = ACTIVITIES.filter((a) => a.place === id);
      if (acts.length) expect(info.stations.length, id).toBeGreaterThan(0);
      expect(W.col.length, id).toBeGreaterThan(3);
      expect(W.b.tris, id).toBeGreaterThan(50);
    }
    expect(origins.size).toBe(Object.keys(INTERIOR_OF).length); // no two places in the same spot
  });

  it('builds the journey roads', () => {
    for (const id of Object.keys(ROUTES).filter((r) => r !== 'herbert')) {
      const W = createState(regions, regions);
      buildRoute(W, id);
      expect(W.b.tris, id).toBeGreaterThan(500);
    }
  });
});
