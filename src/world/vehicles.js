// Parked danfo / keke / okadas at the bus stop and light moving traffic on Herbert Macaulay Way.
import * as THREE from 'three';
import { mat } from './geo.js';
import { rng } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Lane centre: eastbound (+X) traffic keeps right (z > 0); swerve around the parked danfo. */
export function laneZ(x, dir) {
  if (dir > 0) {
    const near = Math.max(0, 1 - Math.abs(x + 54) / 9);
    return 2.0 - near * 1.6;
  }
  return -2.0;
}

export function buildVehicles(W) {
  // parked at the bus stop
  W.inst('danfo', mat(-54, 0, 2.35, 0));
  W.collide(-56.3, 0, 1.4, -51.7, 2.2, 3.3, 'vehicle');
  W.interact('danfo', V(-53.6, 0, 4.4), 2.4, 'Board the danfo (Oshodi / CMS)', 'board-danfo');
  W.inst('keke', mat(-47.4, 0, 2.7, 0.08));
  W.collide(-48.8, 0, 2.0, -46.0, 1.9, 3.4, 'vehicle');
  for (const [x, z, ry] of [[-45.2, 7.85, 0.3], [-44.1, 7.9, 0.35], [-43.0, 7.85, 0.25], [2.6, 7.8, -0.3]]) {
    W.inst('okada', mat(x, 0, z, ry));
    W.collide(x - 0.75, 0, z - 0.35, x + 0.75, 1.1, z + 0.35, 'vehicle');
  }
}

/**
 * Moving traffic: built after kits exist. Returns {update(dt), list}.
 * @param {*} W @param {Record<string, Map<string, THREE.BufferGeometry>>} kits @param {*} mats
 */
export function createTraffic(W, kits, mats, bus) {
  const r = rng(77);
  const list = [];
  const spec = [
    { kit: 'danfo', dir: -1, speed: 8.5, x: 30 },
    { kit: 'car', dir: 1, speed: 11, x: -80, color: '#6b1d24' },
    { kit: 'car', dir: -1, speed: 12, x: -20, color: '#c9ccd1' },
    { kit: 'danfo', dir: 1, speed: 9, x: 60 },
  ];
  for (const s of spec) {
    const g = new THREE.Group();
    for (const [key, geo] of kits[s.kit]) {
      const m = new THREE.Mesh(geo, mats[key]);
      m.castShadow = true; m.receiveShadow = true;
      if (s.color && key === 'paint') {
        const c = new THREE.Color(s.color);
        const geo2 = geo.clone();
        const a = geo2.attributes.color;
        for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b);
        m.geometry = geo2;
      }
      g.add(m);
    }
    g.rotation.y = s.dir > 0 ? 0 : Math.PI;
    W.root.add(g);
    list.push({ ...s, obj: g, pause: 0, horn: 8 + r() * 20, v: s.speed });
  }
  const tmp = V(0, 0, 0);
  return {
    list,
    update(dt) {
      for (const v of list) {
        // eastbound danfo stops briefly behind the bus stop to pick passengers
        let target = v.speed;
        if (v.kit === 'danfo' && v.dir > 0 && v.x > -72 && v.x < -64 && v.pause <= 0 && v.stopped !== true) target = 0;
        if (v.pause > 0) { v.pause -= dt; if (v.pause <= 0) v.stopped = true; }
        if (target === 0 && v.v < 0.2 && v.pause <= 0 && !v.stopped) v.pause = 4 + r() * 4;
        v.v += (target - v.v) * Math.min(1, dt * (target === 0 ? 1.8 : 0.8));
        v.x += v.dir * v.v * dt;
        if (v.x > 105) { v.x = -105; v.stopped = false; }
        if (v.x < -105) { v.x = 105; v.stopped = false; }
        const z = laneZ(v.x, v.dir);
        v.obj.position.set(v.x, 0, z);
        v.obj.rotation.y = (v.dir > 0 ? 0 : Math.PI) + (z - laneZ(v.x + v.dir * 2, v.dir)) * 0.12 * v.dir;
        v.horn -= dt;
        if (v.horn <= 0 && Math.abs(v.x) < 70) {
          v.horn = 12 + r() * 25;
          bus?.emit('audio:play', { name: 'horn', position: tmp.set(v.x, 1, z).clone() });
        }
      }
    },
  };
}
