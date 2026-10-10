// Walkability with the real collision engine: an agent (capsule r = 0.3 m) follows world.nav paths
// from the home spawn to every role spawn and key interactable without getting stuck.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics } from '../engine/physics.js';
import { planWorld, navBlockersOf, makeSpawns, registerColliders } from './world.js';
import { navNodes, groundAt } from './layout.js';
import { buildEdges, createNav } from './nav.js';

const R = { u0: 0, v0: 0, u1: 1, v1: 1 };
const regions = new Proxy({}, { get: () => R });
const W = planWorld(regions, regions);
const physics = createPhysics();
registerColliders(physics, W.col);
physics.setGround(groundAt);
const blockers = navBlockersOf(W.col);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const nodes = navNodes().map(([x, z, zone], id) => ({ id, position: V(x, groundAt(x, z), z), zone }));
const nav = createNav(nodes, buildEdges(nodes, blockers, 7.5, 0.3), { blockers, vec: (x, y, z) => V(x, groundAt(x, z), z) });

/** Walk along the nav path at 1.6 m/s (60 fps). Returns the final position. */
function walk(from, to) {
  let p = from.clone();
  const path = nav.path(p, to);
  const delta = new THREE.Vector3();
  for (const wp of path) {
    for (let f = 0; f < 60 * 30; f++) {
      delta.set(wp.x - p.x, 0, wp.z - p.z);
      const d = delta.length();
      if (d < 0.12) break;
      delta.multiplyScalar(Math.min(d, 1.6 / 60) / d);
      delta.y = -0.2; // gravity keeps the capsule on the ground
      p = physics.moveCapsule(p, delta, 0.3, 1.7);
    }
  }
  return p;
}

describe('world walkability (real physics)', () => {
  const spawns = makeSpawns();
  const start = spawns.player.position;

  it('registers non-walkable colliders and camera blockers', () => {
    expect(physics.colliders.length).toBe(W.col.length);
    expect(physics.colliders.every((c) => !c.walk)).toBe(true);
    expect(physics.colliders.some((c) => c.kind === 'ceiling' && c.camera)).toBe(true);
    expect(physics.colliders.find((c) => c.kind === 'furniture').camera).toBe(false);
  });

  it('nothing blocks the capsule at the spawns', () => {
    for (const [role, sp] of Object.entries(spawns.byRole)) {
      const p = physics.moveCapsule(sp.position, V(0.05, -0.1, 0.05));
      expect(Math.hypot(p.x - sp.position.x - 0.05, p.z - sp.position.z - 0.05), role).toBeLessThan(0.02);
      expect(p.y, role).toBeCloseTo(groundAt(sp.position.x, sp.position.z), 2);
    }
  });

  for (const role of ['security', 'usher', 'choir', 'media', 'hospitality', 'children', 'prayer', 'minister', 'visitor']) {
    it(`walks from home to the ${role} post`, () => {
      const to = spawns.byRole[role].position;
      const p = walk(start, to);
      expect(Math.hypot(p.x - to.x, p.z - to.z), `${role} ended at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeLessThan(0.6);
      expect(p.y).toBeCloseTo(groundAt(to.x, to.z), 1);
    });
  }

  it('reaches every interactable', () => {
    const bad = [];
    for (const it of W.interactables) {
      const p = walk(start, it.position);
      const d = Math.hypot(p.x - it.position.x, p.z - it.position.z);
      if (d > it.radius) bad.push(`${it.id} (${d.toFixed(2)} m)`);
    }
    expect(bad).toEqual([]);
  });

  it('reaches a sample of seats (the player sits from up to 2 m away)', () => {
    const bad = [];
    const sample = W.seats.filter((_, i) => i % 9 === 0);
    for (const s of sample) {
      const p = walk(start, s.position);
      const d = Math.hypot(p.x - s.position.x, p.z - s.position.z);
      if (d > 1.4) bad.push(`${s.kind}@${s.zone} ${s.position.x.toFixed(1)},${s.position.z.toFixed(1)} (${d.toFixed(2)} m)`);
    }
    expect(bad).toEqual([]);
  });
});
