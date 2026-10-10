import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFollowCamera } from './camera.js';
import { createPhysics } from './physics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function fakeInput() {
  const st = { dx: 0, dy: 0, zoom: 0 };
  return {
    st, touch: false, looking: false, lastLookAt: -1e9,
    lookDelta() { const o = { dx: st.dx, dy: st.dy }; st.dx = st.dy = 0; return o; },
    zoomDelta() { const z = st.zoom; st.zoom = 0; return z; },
  };
}
const ctxWith = (aspect = 1.6) => ({ camera: new THREE.PerspectiveCamera(55, aspect, 0.1, 400) });

describe('follow camera', () => {
  it('maps input to camera-relative directions', () => {
    const cam = createFollowCamera(ctxWith(), fakeInput());
    cam.yaw = 0;
    expect(cam.moveDir({ x: 0, y: 1 }).toArray().map((v) => +v.toFixed(6))).toEqual([0, 0, -1]);
    expect(cam.moveDir({ x: 1, y: 0 }).toArray().map((v) => +v.toFixed(6))).toEqual([1, 0, 0]);
    cam.yaw = Math.PI / 2; // camera on +X looking towards −X
    const f = cam.moveDir({ x: 0, y: 1 });
    expect(f.x).toBeCloseTo(-1); expect(f.z).toBeCloseTo(0);
    cam.behind(0); // character facing +Z → camera on −Z
    expect(cam.forward().z).toBeCloseTo(1);
  });

  it('orbits with drag, clamps pitch and zoom', () => {
    const input = fakeInput();
    const cam = createFollowCamera(ctxWith(), input);
    const y0 = cam.yaw;
    const settle = () => { for (let i = 0; i < 60; i++) cam.update(1 / 60, V(0, 0, 0)); };
    input.st.dx = 100;
    cam.update(1 / 60, V(0, 0, 0));
    const first = cam.yaw;
    expect(first).toBeLessThan(y0); // starts turning at once…
    expect(first).toBeGreaterThan(y0 - 100 * cam.sensitivity); // …and glides the rest
    settle();
    expect(cam.yaw).toBeCloseTo(y0 - 100 * cam.sensitivity);
    input.st.dy = 10000;
    settle();
    expect(cam.pitch).toBeCloseTo(cam.maxPitch, 4);
    input.st.dy = -40; // a small move back responds at once (nothing queued past the limit)
    settle();
    expect(cam.pitch).toBeCloseTo(cam.maxPitch - 40 * cam.sensitivity, 3);
    input.st.zoom = 50;
    settle();
    expect(cam.distance).toBeCloseTo(cam.maxDistance, 3);
    input.st.zoom = -50;
    settle();
    expect(cam.distance).toBeCloseTo(cam.minDistance, 3);
  });

  it('looks at the player from behind and follows smoothly', () => {
    const ctx = ctxWith();
    const cam = createFollowCamera(ctx, fakeInput());
    cam.yaw = 0; cam.pitch = 0.3; cam.distance = 5;
    cam.update(1 / 60, V(0, 0, 0));
    const p = ctx.camera.position;
    expect(p.z).toBeGreaterThan(4);
    expect(p.y).toBeGreaterThan(1.5);
    // a sudden 1 m move is followed over a few frames, not instantly
    cam.update(1 / 60, V(1, 0, 0));
    expect(cam.pivot.x).toBeGreaterThan(0.05);
    expect(cam.pivot.x).toBeLessThan(0.5);
    for (let i = 0; i < 120; i++) cam.update(1 / 60, V(1, 0, 0));
    expect(cam.pivot.x).toBeCloseTo(1, 3);
  });

  it('pulls in when a wall is behind the player and never ends up inside it', () => {
    const ctx = ctxWith();
    const ph = createPhysics();
    ph.addBox(V(-10, 0, 2), V(10, 4, 2.3), { kind: 'wall' });
    const cam = createFollowCamera(ctx, fakeInput());
    cam.yaw = 0; cam.pitch = 0.25; cam.distance = 6;
    for (let i = 0; i < 30; i++) cam.update(1 / 60, V(0, 0, 0), ph);
    // Either in front of the wall or risen above it (looking down) — never inside it.
    const c = ctx.camera.position;
    expect(c.z < 2 || c.y > 4.1).toBe(true);
    expect(c.z > 2 && c.z < 2.3 && c.y < 4.1).toBe(false);
    // wall removed → eases back out
    ph.clear();
    for (let i = 0; i < 240; i++) cam.update(1 / 60, V(0, 0, 0), ph);
    expect(cam.currentDistance).toBeCloseTo(6, 1);
  });

  it('pulls in close under a wall too tall to rise over', () => {
    const ctx = ctxWith();
    const ph = createPhysics();
    ph.addBox(V(-10, 0, 2), V(10, 40, 2.3), { kind: 'wall' });
    const cam = createFollowCamera(ctx, fakeInput());
    cam.yaw = 0; cam.pitch = 0.25; cam.distance = 6;
    for (let i = 0; i < 30; i++) cam.update(1 / 60, V(0, 0, 0), ph);
    expect(ctx.camera.position.z).toBeLessThan(2);
    expect(cam.currentDistance).toBeLessThan(3);
  });

  it('auto-follows a strafing player but not one running at the camera', () => {
    const cam = createFollowCamera(ctxWith(), fakeInput());
    cam.yaw = 0;
    const p = V(0, 0, 0);
    for (let i = 0; i < 90; i++) { p.x += 4.5 / 60; cam.update(1 / 60, p); }
    expect(cam.yaw).toBeLessThan(-0.3); // swung towards behind (−π/2)
    const cam2 = createFollowCamera(ctxWith(), fakeInput());
    cam2.yaw = 0;
    const q = V(0, 0, 0);
    for (let i = 0; i < 90; i++) { q.z += 4.5 / 60; cam2.update(1 / 60, q); }
    expect(Math.abs(cam2.yaw)).toBeLessThan(1e-9);
  });

  it('widens the field of view on portrait screens', () => {
    const ctx = ctxWith(0.46);
    const cam = createFollowCamera(ctx, fakeInput());
    for (let i = 0; i < 120; i++) cam.update(1 / 60, V(0, 0, 0));
    expect(ctx.camera.fov).toBeGreaterThan(60);
    expect(cam.distance).toBe(6);
  });
});

describe('camera views', () => {
  it('switches views and cycles through them', async () => {
    const THREE = await import('three');
    const { createFollowCamera, VIEW_ORDER } = await import('./camera.js');
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    const cam = createFollowCamera({ camera });
    expect(cam.setMode('top')).toBe('top');
    expect(cam.pitch).toBeGreaterThan(1);
    cam.setMode('first');
    cam.update(0.016, new THREE.Vector3(0, 0, 0));
    expect(camera.position.y).toBeCloseTo(1.62, 1);
    const seen = new Set();
    for (let i = 0; i < VIEW_ORDER.length; i++) seen.add(cam.cycleMode());
    expect(seen.size).toBe(VIEW_ORDER.length);
  });
});
