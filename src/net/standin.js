// Stand-in character with the same interface as createCharacter (src/characters),
// used when the character kit is missing or fails to load, so remote players
// still appear. Simple shaded figure: no rig, a little bob while moving.
import * as THREE from 'three';

const SKIN = ['#b98563', '#9a6646', '#7e4f35', '#663d28', '#4f2e1f', '#3b2218'];
const geo = {};
const mats = new Map();
const mat = (hex) => {
  if (!mats.has(hex)) mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75 }));
  return mats.get(hex);
};

/** @param {any} appearance @returns {any} character-like object */
export function createStandIn(appearance = {}) {
  geo.body ||= new THREE.CapsuleGeometry(0.2, 0.75, 4, 10).translate(0, 0.98, 0);
  geo.legs ||= new THREE.CylinderGeometry(0.16, 0.12, 0.62, 10).translate(0, 0.31, 0);
  geo.head ||= new THREE.SphereGeometry(0.13, 16, 12).translate(0, 1.62, 0.01);
  const skin = SKIN[Math.max(0, Math.min(5, appearance.skin ?? 3))];
  const primary = appearance.colors?.primary || '#1d4ed8';
  const secondary = appearance.colors?.secondary || '#1f2937';
  const object = new THREE.Group();
  const inner = new THREE.Group();
  object.add(inner);
  for (const [g, m] of [[geo.body, primary], [geo.legs, secondary], [geo.head, skin]]) {
    const mesh = new THREE.Mesh(g, mat(m));
    mesh.castShadow = true;
    inner.add(mesh);
  }
  let state = 'idle';
  let speed = 0;
  let phase = 0;
  let overlay = 0;
  return {
    object,
    height: 1.75,
    appearance,
    detail: 'low',
    get state() { return state; },
    play(s) { state = s; return null; },
    setLocomotion(v) { speed = v; state = v < 0.15 ? 'idle' : v < 2.2 ? 'walk' : 'run'; },
    wave(sec = 2) { overlay = sec; },
    clap(sec = 3) { overlay = sec; },
    raiseHands(sec = 3) { overlay = sec; },
    update(dt) {
      phase += dt * (2 + speed * 3.2);
      const sit = state === 'sit' || state === 'sitTalk' || state === 'kneel';
      inner.position.y = sit ? -0.45 : speed > 0.15 ? Math.abs(Math.sin(phase)) * 0.04 : 0;
      inner.rotation.z = overlay > 0 ? Math.sin(phase * 3) * 0.06 : 0;
      overlay = Math.max(0, overlay - dt);
    },
    dispose() { object.removeFromParent(); },
  };
}
