import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPhysics, STEP_HEIGHT } from './physics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Walk a capsule with a constant velocity for `seconds` at a fixed dt. */
function walk(ph, start, vel, seconds, dt = 1 / 60, r = 0.3, h = 1.7) {
  let p = start.clone();
  const steps = Math.round(seconds / dt);
  const path = [];
  for (let i = 0; i < steps; i++) {
    p = ph.moveCapsule(p, vel.clone().multiplyScalar(dt), r, h);
    path.push(p.clone());
  }
  return { p, path };
}

/** Smallest distance from a capsule centre to the inside of a wall box (negative = penetrating). */
function clearance(p, min, max) {
  const qx = Math.max(min.x, Math.min(p.x, max.x));
  const qz = Math.max(min.z, Math.min(p.z, max.z));
  return Math.hypot(p.x - qx, p.z - qz);
}

describe('physics: ground', () => {
  it('stands on flat ground and follows a ramp', () => {
    const ph = createPhysics();
    ph.setGround((x) => (x > 2 && x < 6 ? (x - 2) * 0.25 : x >= 6 ? 1 : 0));
    const { p } = walk(ph, V(0, 0, 0), V(2, 0, 0), 4);
    expect(p.x).toBeCloseTo(8, 1);
    expect(p.y).toBeCloseTo(1, 3);
    expect(ph.last.grounded).toBe(true);
    // walk back down the ramp: stays glued to the ground (no floating, no falling state)
    const back = walk(ph, p, V(-2, 0, 0), 2.5);
    for (const q of back.path) expect(Math.abs(q.y - ph.groundHeight(q.x, q.z))).toBeLessThan(1e-6);
  });

  it('groundHeight without fromY is the ground function', () => {
    const ph = createPhysics();
    ph.setGround((x, z) => x + z);
    expect(ph.groundHeight(1, 2)).toBe(3);
    ph.addBox(V(-1, 0, -1), V(1, 0.3, 1));
    expect(ph.groundHeight(0, 0)).toBe(0);
    expect(ph.groundHeight(0, 0, 0)).toBeCloseTo(0.3);
  });

  it('falls with gravity and lands on the ground', () => {
    const ph = createPhysics();
    let p = V(0, 3, 0);
    let vy = 0;
    for (let i = 0; i < 120; i++) {
      vy -= 20 / 60;
      p = ph.moveCapsule(p, V(0, vy / 60, 0));
      if (ph.last.grounded) vy = 0;
    }
    expect(p.y).toBe(0);
    expect(ph.last.grounded).toBe(true);
  });
});

describe('physics: walls', () => {
  it('stops at a wall and slides along it', () => {
    const ph = createPhysics();
    const min = V(2, 0, -5), max = V(2.2, 3, 5);
    ph.addBox(min, max, { kind: 'wall' });
    // Diagonal into the wall: x is blocked, z keeps going.
    const { p, path } = walk(ph, V(0, 0, 0), V(2, 0, 1), 3);
    expect(p.x).toBeCloseTo(2 - 0.3, 3);
    expect(p.z).toBeCloseTo(3, 1);
    for (const q of path) expect(clearance(q, min, max)).toBeGreaterThanOrEqual(0.3 - 1e-6);
    expect(ph.last.hitWall).toBe(true);
    expect(ph.last.normal.x).toBeCloseTo(-1);
  });

  it('slides along a wall built from several boxes without snagging on the seams', () => {
    const ph = createPhysics();
    for (let i = 0; i < 6; i++) ph.addBox(V(i, 0, 1), V(i + 1, 3, 1.2), { kind: 'wall' });
    const { p } = walk(ph, V(0.5, 0, 0), V(1, 0, 0.6), 4);
    expect(p.z).toBeCloseTo(0.7, 3);
    expect(p.x).toBeCloseTo(4.5, 1);
  });

  it('resolves an inside corner without jitter or penetration', () => {
    const ph = createPhysics();
    const a = [V(-5, 0, 2), V(5, 3, 2.2)];
    const b = [V(2, 0, -5), V(2.2, 3, 2.2)];
    ph.addBox(...a); ph.addBox(...b);
    const { p, path } = walk(ph, V(0, 0, 0), V(1.5, 0, 1.5), 4);
    expect(p.x).toBeCloseTo(1.7, 3);
    expect(p.z).toBeCloseTo(1.7, 3);
    for (const q of path) {
      expect(clearance(q, ...a)).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(clearance(q, ...b)).toBeGreaterThanOrEqual(0.3 - 1e-6);
    }
    // stays put while still pushing into the corner
    const settled = walk(ph, p, V(1.5, 0, 1.5), 1);
    expect(settled.p.distanceTo(p)).toBeLessThan(1e-6);
  });

  it('rounds an outside corner smoothly', () => {
    const ph = createPhysics();
    ph.addBox(V(1, 0, 1), V(3, 3, 3));
    // grazes the corner at (1, 1): slides around it and carries on along the south face
    const { p, path } = walk(ph, V(0, 0, 0.85), V(1.5, 0, 0), 3);
    for (const q of path) expect(clearance(q, V(1, 0, 1), V(3, 3, 3))).toBeGreaterThanOrEqual(0.3 - 1e-6);
    expect(p.x).toBeGreaterThan(3); // got past the box
    expect(p.z).toBeCloseTo(0.7, 3);
    // speed is mostly kept while rounding the corner
    expect(p.x).toBeGreaterThan(4);
  });

  it('collides with cylinders', () => {
    const ph = createPhysics();
    ph.addCylinder(V(2, 0, 0), 0.25, 4);
    const { path } = walk(ph, V(0, 0, 0.05), V(1.5, 0, 0), 3);
    for (const q of path) expect(Math.hypot(q.x - 2, q.z)).toBeGreaterThanOrEqual(0.55 - 1e-6);
    expect(path.at(-1).x).toBeGreaterThan(3); // slid around it
  });

  it('respects rotated boxes', () => {
    const ph = createPhysics();
    // a 4 m wall through (0, 2) running diagonally (local +X → world (0.71, −0.71))
    ph.addBox(V(-2, 0, 1.9), V(2, 2, 2.1), { rotY: Math.PI / 4 });
    const { p, path } = walk(ph, V(0, 0, 0), V(0, 0, 2), 3);
    const c = Math.SQRT1_2;
    for (const q of path) {
      const lx = q.x * c - (q.z - 2) * c, lz = q.x * c + (q.z - 2) * c;
      if (Math.abs(lx) < 2) expect(Math.abs(lz)).toBeGreaterThanOrEqual(0.1 + 0.3 - 1e-6);
    }
    // it slid along the wall (towards −X) instead of passing through
    expect(p.x).toBeLessThan(-1);
  });

  it('does not tunnel through thin walls at 60 m/s frame spikes', () => {
    const ph = createPhysics();
    ph.addBox(V(5, 0, -10), V(5.05, 3, 10), { kind: 'wall' });
    for (const dt of [0.05, 0.1, 0.25, 1]) {
      const p = ph.moveCapsule(V(0, 0, 0), V(60 * dt, 0, 0));
      expect(p.x).toBeLessThanOrEqual(5 - 0.3 + 1e-6);
    }
    // and diagonally into a thin cylinder
    ph.addCylinder(V(-5, 0, -5), 0.1, 3);
    const q = ph.moveCapsule(V(0, 0, 0), V(-6, 0, -6));
    expect(Math.hypot(q.x + 5, q.z + 5)).toBeGreaterThanOrEqual(0.4 - 1e-6);
  });

  it('pushes a capsule that starts inside a box out through the nearest face', () => {
    const ph = createPhysics();
    ph.addBox(V(0, 0, 0), V(2, 2, 4));
    const p = ph.moveCapsule(V(0.2, 0, 2), V(0, 0, 0));
    expect(p.x).toBeCloseTo(-0.3, 5);
  });
});

describe('physics: steps and ledges', () => {
  it('steps up boxes up to STEP_HEIGHT and is blocked by taller ones', () => {
    const ph = createPhysics();
    ph.addBox(V(2, 0, -1), V(4, 0.3, 1), { kind: 'step' });
    ph.addBox(V(2, 0, 3), V(4, 0.5, 5), { kind: 'wall' });
    const low = walk(ph, V(0, 0, 0), V(1.5, 0, 0), 2).p;
    expect(low.x).toBeGreaterThan(2.5);
    expect(low.y).toBeCloseTo(0.3);
    const high = walk(ph, V(0, 0, 4), V(1.5, 0, 0), 2).p;
    expect(high.x).toBeCloseTo(2 - 0.3, 3);
    expect(high.y).toBe(0);
    expect(STEP_HEIGHT).toBeCloseTo(0.35);
  });

  it('climbs a staircase and walks back down without falling', () => {
    const ph = createPhysics();
    for (let i = 0; i < 5; i++) ph.addBox(V(2 + i * 0.3, 0, -1), V(10, 0.18 * (i + 1), 1), { kind: 'stairs' });
    const up = walk(ph, V(0, 0, 0), V(1.6, 0, 0), 3);
    expect(up.p.y).toBeCloseTo(0.9);
    const down = walk(ph, up.p, V(-1.6, 0, 0), 3);
    expect(down.p.y).toBe(0);
    for (const q of down.path) expect(ph.last.grounded || q.y >= 0).toBe(true);
  });

  it('steps up ground-function ledges and is blocked by ground cliffs', () => {
    const ph = createPhysics();
    // a 0.3 m raised floor at x > 2 and a 1 m platform at z > 3
    ph.setGround((x, z) => (z > 3 ? 1 : x > 2 ? 0.3 : 0));
    const a = walk(ph, V(0, 0, 0), V(1.5, 0, 0), 2).p;
    expect(a.y).toBeCloseTo(0.3);
    const b = walk(ph, V(0, 0, 2), V(0, 0, 1.5), 2).p;
    expect(b.z).toBeLessThanOrEqual(3 + 1e-6);
    expect(b.y).toBe(0);
  });

  it('walks off a high ledge and starts falling instead of snapping down', () => {
    const ph = createPhysics();
    ph.addBox(V(-5, 0, -5), V(2, 1.2, 5), { kind: 'platform' });
    const p = ph.moveCapsule(V(1.9, 1.2, 0), V(0.5, 0, 0));
    expect(p.y).toBeCloseTo(1.2);
    expect(ph.last.grounded).toBe(false);
  });

  it('lands on a platform while falling fast', () => {
    const ph = createPhysics();
    ph.addBox(V(-1, 0, -1), V(1, 0.5, 1));
    const p = ph.moveCapsule(V(0, 3, 0), V(0, -10, 0));
    expect(p.y).toBeCloseTo(0.5);
    expect(ph.last.grounded).toBe(true);
  });

  it('jumps onto a low wall but never stands on furniture', () => {
    const ph = createPhysics();
    ph.addBox(V(1, 0, -1), V(2, 0.6, 1), { kind: 'wall' });
    ph.addBox(V(1, 0, 3), V(2, 0.6, 5), { kind: 'furniture' });
    // airborne at 0.5 m moving over each
    const wall = ph.moveCapsule(V(0.5, 0.5, 0), V(1, -0.05, 0));
    expect(wall.y).toBeCloseTo(0.6);
    const furn = ph.moveCapsule(V(0.5, 0.5, 4), V(1, -0.05, 0));
    expect(furn.x).toBeCloseTo(0.7, 3);
  });

  it('hits its head on a ceiling', () => {
    const ph = createPhysics();
    ph.addBox(V(-2, 2.2, -2), V(2, 2.4, 2));
    const p = ph.moveCapsule(V(0, 0, 0), V(0, 1, 0));
    expect(p.y).toBeCloseTo(0.5);
    expect(ph.last.ceiling).toBe(true);
    // walking under a lintel never pushes sideways
    const q = ph.moveCapsule(V(0, 0.4, 0), V(0.1, 0.05, 0));
    expect(q.x).toBeCloseTo(0.1);
  });
});

describe('physics: queries', () => {
  it('raycasts boxes, cylinders and the ground', () => {
    const ph = createPhysics();
    ph.addBox(V(4, 0, -1), V(5, 3, 1));
    ph.addCylinder(V(0, 0, 4), 0.5, 3, { camera: true });
    const o = V(0, 1, 0);
    expect(ph.raycast(o, V(1, 0, 0), 10)).toBeCloseTo(4);
    expect(ph.raycast(o, V(0, 0, 1), 10)).toBeCloseTo(3.5);
    expect(ph.raycast(o, V(-1, 0, 0), 10)).toBe(Infinity);
    const down = V(0, -1, -1).normalize();
    expect(ph.raycast(o, down, 10)).toBeCloseTo(Math.SQRT2, 2);
    // thin posts do not block the camera by default
    ph.addCylinder(V(-3, 0, 0), 0.1, 3);
    expect(ph.raycast(o, V(-1, 0, 0), 10, { camera: true, ground: false })).toBe(Infinity);
  });

  it('removes colliders and reports overlaps', () => {
    const ph = createPhysics();
    const box = ph.addBox(V(-1, 0, -1), V(1, 2, 1));
    expect(ph.overlaps(V(0, 0, 0))).toBe(true);
    expect(ph.remove(box)).toBe(true);
    expect(ph.overlaps(V(0, 0, 0))).toBe(false);
    expect(ph.colliders.length).toBe(0);
  });

  it('handles many colliders quickly', () => {
    const ph = createPhysics();
    for (let i = 0; i < 2000; i++) {
      const x = (i % 50) * 3, z = Math.floor(i / 50) * 3;
      ph.addBox(V(x, 0, z), V(x + 1, 2, z + 1));
    }
    const t0 = performance.now();
    let p = V(1.5, 0, 1.5);
    for (let i = 0; i < 6000; i++) p = ph.moveCapsule(p, V(Math.cos(i * 0.01) * 0.05, 0, Math.sin(i * 0.013) * 0.05));
    expect(performance.now() - t0).toBeLessThan(500);
    expect(Number.isFinite(p.x)).toBe(true);
  });
});
