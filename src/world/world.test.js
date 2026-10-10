// Headless build of the whole layout (no textures): checks the nav graph is connected, spawns,
// seats and interactables are reachable and nothing spawns inside a collider.
import { describe, it, expect } from 'vitest';
import { planWorld, navBlockersOf, makeSpawns } from './world.js';
import { navNodes, groundAt, ZONE_DEFS, pickZone } from './layout.js';
import { buildEdges, createNav, clearLine } from './nav.js';

const R = { u0: 0, v0: 0, u1: 1, v1: 1 };
const regions = new Proxy({}, { get: () => R });
const W = planWorld(regions, regions);
const blockers = navBlockersOf(W.col);
const nodes = navNodes().map(([x, z, zone], id) => ({ id, position: { x, y: groundAt(x, z), z }, zone }));
const edges = buildEdges(nodes, blockers, 7.5, 0.3);
const nav = createNav(nodes, edges, { blockers });
const zones = ZONE_DEFS.map((z) => ({ ...z, box: { min: { x: z.min[0], y: z.min[1], z: z.min[2] }, max: { x: z.max[0], y: z.max[1], z: z.max[2] } } }));

const inside = (p, r = 0.25) => W.col.filter((c) => c.y0 < 1.2 && c.y1 > 0.2 && p.x > c.x0 - r && p.x < c.x1 + r && p.z > c.z0 - r && p.z < c.z1 + r && (!c.cyl || Math.hypot(p.x - c.x, p.z - c.z) < c.r + r));

describe('world layout (headless)', () => {
  it('builds geometry, colliders, seats and interactables', () => {
    expect(W.col.length).toBeGreaterThan(200);
    expect(W.seats.length).toBeGreaterThan(200);
    const actions = new Set(W.interactables.map((i) => i.action));
    for (const a of ['pray', 'buy-food', 'board-danfo', 'ring-bell', 'play-keyboard']) expect(actions.has(a)).toBe(true);
    expect(W.b.tris).toBeLessThan(250000);
  });

  it('nav nodes are not inside colliders', () => {
    const bad = nodes.filter((n) => inside(n.position, 0.2).length);
    expect(bad.map((n) => [n.position.x, n.position.z, inside(n.position, 0.2)[0].kind])).toEqual([]);
  });

  it('every nav node is reachable from the home spawn', () => {
    const adj = nodes.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    const start = nav.nearest({ x: 14.6, z: 16.6 });
    const seen = new Set([start]); const q = [start];
    while (q.length) { const i = q.pop(); for (const j of adj[i]) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    const lost = nodes.filter((n) => !seen.has(n.id)).map((n) => [n.position.x, n.position.z, n.zone]);
    expect(lost).toEqual([]);
  });

  it('spawns are free and inside their zones', () => {
    const s = makeSpawns();
    const expectZone = { security: 'gate', usher: 'church-hall', choir: 'choir', media: 'media', hospitality: 'kitchen', children: 'children', prayer: 'prayer-room', minister: 'altar', visitor: 'busstop', worshipper: 'home' };
    for (const [role, sp] of Object.entries(s.byRole)) {
      expect(inside(sp.position, 0.3).map((c) => c.kind), role).toEqual([]);
      expect(pickZone(zones, sp.position)?.id, role).toBe(expectZone[role]);
    }
    expect(inside(s.player.position, 0.3)).toEqual([]);
  });

  it('a path exists from home to the altar, the prayer room, the buka and the bus stop', () => {
    for (const to of [{ x: 19, z: -36.9 }, { x: 43, z: -38 }, { x: -6, z: 12.6 }, { x: -54, z: 6.6 }]) {
      const p = nav.path({ x: 14.6, z: 16.6 }, to);
      expect(p.length).toBeGreaterThan(2);
      for (let i = 1; i < p.length - 1; i++) expect(clearLine(p[i - 1], p[i], blockers, 0.25)).toBe(true);
    }
  });

  it('every interactable has a nav node nearby with line of sight', () => {
    for (const it of W.interactables.filter((i) => Math.abs(i.position.x) < 200 && Math.abs(i.position.z) < 200)) {
      const n = nav.nearest(it.position);
      const d = Math.hypot(nodes[n].position.x - it.position.x, nodes[n].position.z - it.position.z);
      expect(d, it.id).toBeLessThan(9);
    }
  });
});
