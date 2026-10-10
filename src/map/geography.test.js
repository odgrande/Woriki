import { describe, it, expect } from 'vitest';
import { landAt, housePlots, BRIDGES, BILLBOARDS, distToPolyline } from './geography.js';
import { PLACES } from '../game/life.js';

describe('Lagos map geography', () => {
  it('puts every place on land, except Makoko which stands on the lagoon', () => {
    for (const p of PLACES) {
      const land = landAt(p.at[0], p.at[1]);
      if (p.id === 'makoko') expect(land).toBeNull();
      else expect(land, p.id).not.toBeNull();
    }
  });

  it('has the lagoon between the mainland and the islands', () => {
    expect(landAt(10, -30)).toBeNull(); // Lagos Lagoon
    expect(landAt(40, 75)).toBeNull(); // Atlantic Ocean
    expect(landAt(-36, 0)?.id).toBe('mainland'); // Yaba
    expect(landAt(-2, 25)?.id).toBe('lagos-island');
    expect(landAt(30, 42)?.id).toBe('vi-lekki');
  });

  it('runs Third Mainland Bridge over water from the mainland to Lagos Island', () => {
    const b = BRIDGES.find((x) => x.id === 'third-mainland');
    const mid = b.pts.slice(1, -1);
    expect(mid.filter(([x, z]) => landAt(x, z)).length).toBe(0);
    expect(landAt(...b.pts[0])?.id).toBe('mainland');
    const [ex, ez] = b.pts[b.pts.length - 1];
    expect(landAt(ex, ez + 0.6)?.id).toBe('lagos-island');
  });

  it('scatters houses on land, off the roads, deterministically', () => {
    const a = housePlots(400, 3);
    const b = housePlots(400, 3);
    expect(a).toEqual(b);
    expect(a.length).toBe(400);
    for (const h of a) expect(landAt(h.x, h.z)).not.toBeNull();
    const tm = BRIDGES[0].pts;
    expect(a.every((h) => distToPolyline(tm, h.x, h.z) > 0.5)).toBe(true);
  });

  it('places billboards on land', () => {
    for (const bb of BILLBOARDS) expect(landAt(...bb.at), bb.title).not.toBeNull();
  });
});
