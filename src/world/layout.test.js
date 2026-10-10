import { AMBIENCES } from '../audio/zones.js';
import { describe, it, expect } from 'vitest';
import { groundAt, surfaceAt, pickZone, gutterRuns, ZONE_DEFS, CROSS_N, navNodes, HALL, ALTAR } from './layout.js';

const zones = ZONE_DEFS.map((z) => ({ ...z, box: { min: { x: z.min[0], y: z.min[1], z: z.min[2] }, max: { x: z.max[0], y: z.max[1], z: z.max[2] } } }));
const zoneId = (x, z, y = 0) => pickZone(zones, { x, y, z })?.id ?? null;

describe('groundAt', () => {
  it('is flat on the street and in the hall', () => {
    expect(groundAt(0, 0)).toBe(0);
    expect(groundAt(19, -28)).toBe(0);
  });
  it('raises the altar with two steps and the choir risers', () => {
    expect(groundAt(19, -38)).toBeCloseTo(ALTAR.h);
    expect(groundAt(19, ALTAR.z1 + 0.2)).toBeCloseTo(0.4);
    expect(groundAt(19, ALTAR.z1 + 0.6)).toBeCloseTo(0.2);
    expect(groundAt(27, -39.4)).toBeCloseTo(0.85);
    expect(groundAt(27, -41)).toBeCloseTo(1.1);
  });
  it('raises the home veranda and house slab', () => {
    expect(groundAt(14.6, 16.6)).toBeCloseTo(0.3);
    expect(groundAt(14.6, 15.2)).toBeCloseTo(0.15);
  });
});

describe('surfaceAt', () => {
  it('maps the main surfaces', () => {
    expect(surfaceAt(0, 0)).toBe('asphalt');
    expect(surfaceAt(10, -28)).toBe('tile');
    expect(surfaceAt(19, -28)).toBe('carpet');
    expect(surfaceAt(19, -38)).toBe('carpet');
    expect(surfaceAt(30, -22)).toBe('wood');
    expect(surfaceAt(43, -38)).toBe('carpet');
    expect(surfaceAt(-30, 14)).toBe('dirt');
    expect(surfaceAt(10, -15)).toBe('concrete');
  });
});

describe('zones', () => {
  it('has every contract zone id', () => {
    const ids = ZONE_DEFS.map((z) => z.id);
    for (const id of ['street', 'busstop', 'market', 'gate', 'carpark', 'church-hall', 'altar', 'choir', 'media', 'prayer-room', 'kitchen', 'home']) expect(ids).toContain(id);
  });
  it('picks the most specific zone', () => {
    expect(zoneId(0, 0)).toBe('street');
    expect(zoneId(-54, 6)).toBe('busstop');
    expect(zoneId(-30, 12)).toBe('market');
    expect(zoneId(10, -11)).toBe('gate');
    expect(zoneId(-10, -20)).toBe('carpark');
    expect(zoneId(19, -28)).toBe('church-hall');
    expect(zoneId(19, -38)).toBe('altar');
    expect(zoneId(27, -39)).toBe('choir');
    expect(zoneId(30, -22)).toBe('media');
    expect(zoneId(43, -38)).toBe('prayer-room');
    expect(zoneId(44, -25)).toBe('kitchen');
    expect(zoneId(15, 20)).toBe('home');
    expect(zoneId(200, 200)).toBe(null);
  });
  it('labels have an ambience the audio module knows', () => {
    for (const z of ZONE_DEFS) expect(AMBIENCES).toContain(z.ambience);
  });
});

describe('gutterRuns', () => {
  it('returns the complement of the crossings', () => {
    expect(gutterRuns([[0, 2], [5, 6]], -10, 10)).toEqual([[-10, 0], [2, 5], [6, 10]]);
    const runs = gutterRuns(CROSS_N);
    for (const [a, b] of runs) for (const [c, d] of CROSS_N) expect(b <= c || a >= d).toBe(true);
  });
});

describe('navNodes', () => {
  it('places nodes in every zone that NPCs use', () => {
    const zs = new Set(navNodes().map((n) => n[2]));
    for (const id of ['street', 'busstop', 'market', 'gate', 'carpark', 'church-hall', 'altar', 'choir', 'media', 'prayer-room', 'kitchen', 'home', 'children']) expect(zs.has(id)).toBe(true);
  });
  it('keeps hall nodes inside the hall', () => {
    for (const [x, z, zone] of navNodes()) if (zone === 'church-hall') { expect(x).toBeGreaterThan(HALL.x0); expect(x).toBeLessThan(HALL.x1); }
  });
});
