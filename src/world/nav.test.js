import { describe, it, expect } from 'vitest';
import { segmentHitsRect, clearLine, buildEdges, createNav } from './nav.js';

const node = (id, x, z, zone = 'a') => ({ id, position: { x, y: 0, z }, zone });

describe('segmentHitsRect', () => {
  const r = { x0: 0, z0: 0, x1: 1, z1: 1 };
  it('detects crossings and misses', () => {
    expect(segmentHitsRect(-1, 0.5, 2, 0.5, r)).toBe(true);
    expect(segmentHitsRect(-1, 2, 2, 2, r)).toBe(false);
    expect(segmentHitsRect(0.5, -1, 0.5, -0.1, r)).toBe(false);
    expect(segmentHitsRect(-1, -1, 2, 2, r)).toBe(true);
  });
  it('grows blockers by the radius', () => {
    expect(clearLine({ x: -1, z: 1.2 }, { x: 2, z: 1.2 }, [r], 0.1)).toBe(true);
    expect(clearLine({ x: -1, z: 1.2 }, { x: 2, z: 1.2 }, [r], 0.3)).toBe(false);
  });
});

describe('nav graph', () => {
  // a wall between x = 4..6 from z = -10..8; the gap is at z > 8
  const wall = { x0: 4.8, z0: -10, x1: 5.2, z1: 8 };
  const nodes = [node(0, 0, 0), node(1, 0, 6), node(2, 0, 10), node(3, 5, 10, 'b'), node(4, 10, 10, 'b'), node(5, 10, 6, 'b'), node(6, 10, 0, 'b')];
  const edges = buildEdges(nodes, [wall], 6.5, 0.3);
  const nav = createNav(nodes, edges, { blockers: [wall] });
  it('does not connect through walls', () => {
    expect(edges.some(([a, b]) => (a === 0 && b === 6) || (a === 6 && b === 0))).toBe(false);
  });
  it('finds a path around the wall and ends at the target', () => {
    const p = nav.path({ x: 0, z: 0 }, { x: 10, z: 0 });
    expect(p.length).toBeGreaterThan(3);
    expect(p[p.length - 1]).toMatchObject({ x: 10, z: 0 });
    expect(Math.max(...p.map((q) => q.z))).toBeGreaterThanOrEqual(10);
  });
  it('walks straight when nothing is in the way', () => {
    expect(nav.path({ x: 0, z: 0 }, { x: 0, z: 5 })).toHaveLength(1);
  });
  it('picks random nodes by zone', () => {
    for (let i = 0; i < 10; i++) expect(nav.randomNode('b').zone).toBe('b');
  });
});
