// Road safety on Herbert Macaulay Way: a zebra crossing with traffic lights in front of the
// church and home gates, a pedestrian bridge by the market, and an invisible barrier along the
// kerbs so nobody walks into moving traffic. Cars stop at the stop line on red; people cross
// only when the green man shows, or over the bridge.
import * as THREE from 'three';
import { ROAD } from './layout.js';

/** The zebra crossing (x range) and where cars stop. */
export const ZEBRA = { x0: 12.2, x1: 14.6, stopEast: 10.9, stopWest: 15.9 };
/** The pedestrian bridge: deck across the road at x0..x1, stairs on both walkways. */
export const FOOTBRIDGE = { x0: -26.2, x1: -24.0, top: 5.6, stairX0: -31.6, zN: -7.7, zS: 7.7, stairW: 1.4 };

/** Light cycle (seconds): cars green → amber → all red → green man (walk) → flashing → all red. */
const CYCLE = [['go', 16], ['amber', 3], ['allred', 1.5], ['walk', 10], ['flash', 3], ['allred2', 1.5]];
const CYCLE_LEN = CYCLE.reduce((n, [, d]) => n + d, 0);

/** Phase of the lights at time t (seconds). Pure, for tests. */
export function lightPhase(t) {
  let x = ((t % CYCLE_LEN) + CYCLE_LEN) % CYCLE_LEN;
  for (const [p, d] of CYCLE) { if (x < d) return { phase: p, left: d - x }; x -= d; }
  return { phase: 'go', left: 0 };
}

/** Is (x, z) on the carriageway? */
export const onRoad = (x, z) => Math.abs(z) < ROAD.z1;
/** Is x on the zebra crossing? */
export const onZebra = (x) => x >= ZEBRA.x0 && x <= ZEBRA.x1;

/**
 * @param {object} ctx engine context
 * @param {{root: THREE.Object3D, physics?: {addBox: Function, remove: Function}, interactables?: object[]}} o
 */
export function createRoadRules(ctx, { root, physics, interactables }) {
  const group = new THREE.Group();
  group.name = 'world:roadrules';
  root.add(group);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
  const box = (x, y, z, sx, sy, sz, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };

  /* ---------------------------------------------------------------- zebra crossing + stop lines */
  const paint = std('#f4f4f0', { roughness: 0.9 });
  for (let z = ROAD.z0 + 0.35; z < ROAD.z1 - 0.2; z += 0.9) box((ZEBRA.x0 + ZEBRA.x1) / 2, 0.012, z + 0.25, ZEBRA.x1 - ZEBRA.x0, 0.01, 0.5, paint);
  box(ZEBRA.stopEast, 0.012, ROAD.z1 / 2, 0.25, 0.01, ROAD.z1 - 0.3, paint);
  box(ZEBRA.stopWest, 0.012, ROAD.z0 / 2, 0.25, 0.01, -ROAD.z0 - 0.3, paint);

  /* ---------------------------------------------------------------- traffic lights */
  const lamp = (c) => new THREE.MeshBasicMaterial({ color: c });
  const OFF = '#2a2a2a';
  const heads = [];
  // car signals face oncoming traffic: eastbound cars (z > 0) see the light on the south kerb before the zebra
  for (const [x, z, ry] of [[ZEBRA.stopEast - 0.4, ROAD.z1 + 0.6, -Math.PI / 2], [ZEBRA.stopWest + 0.4, ROAD.z0 - 0.6, Math.PI / 2]]) {
    const pole = std('#2b2d31', { metalness: 0.4 });
    box(x, 1.7, z, 0.12, 3.4, 0.12, pole);
    const head = new THREE.Group();
    head.position.set(x, 3.0, z);
    head.rotation.y = ry;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.3), std('#141414'));
    head.add(housing);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), lamp(OFF)); red.position.set(0, 0.3, 0.16);
    const amber = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), lamp(OFF)); amber.position.set(0, 0, 0.16);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), lamp(OFF)); green.position.set(0, -0.3, 0.16);
    head.add(red, amber, green);
    group.add(head);
    heads.push({ red, amber, green });
  }
  // pedestrian signals at both ends of the zebra: red man / green man
  const peds = [];
  for (const [z, ry] of [[ROAD.z0 - 0.7, 0], [ROAD.z1 + 0.7, Math.PI]]) {
    const x = ZEBRA.x1 + 0.4;
    box(x, 1.2, z, 0.1, 2.4, 0.1, std('#2b2d31'));
    const head = new THREE.Group();
    head.position.set(x, 2.35, z);
    head.rotation.y = ry;
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.18), std('#141414')));
    const man = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: manTexture('stop') }));
    man.position.set(0, 0.12, 0.095);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: manTexture('walk') }));
    walk.position.set(0, -0.14, 0.095);
    head.add(man, walk);
    group.add(head);
    peds.push({ man, walk });
  }

  /* ---------------------------------------------------------------- pedestrian bridge */
  const F = FOOTBRIDGE;
  const steel = std('#5b6470', { metalness: 0.45, roughness: 0.5 });
  const deckMat = std('#9aa0a6', { roughness: 0.9 });
  const rail = std('#1e3a8a', { metalness: 0.3 });
  const span = F.zS - F.zN + F.stairW;
  box((F.x0 + F.x1) / 2, F.top, 0, F.x1 - F.x0, 0.25, span, deckMat);
  for (const sx of [F.x0, F.x1]) box(sx, F.top + 0.6, 0, 0.06, 1.0, span, rail);
  for (const z of [F.zN, F.zS]) for (const sx of [F.x0 + 0.15, F.x1 - 0.15]) box(sx, F.top / 2, z, 0.25, F.top, 0.25, steel);
  // stairs up from the walkways, rising towards the deck
  const stairLen = F.x0 - F.stairX0;
  const steps = 16;
  for (const z of [F.zN, F.zS]) {
    for (let i = 0; i < steps; i++) {
      const x = F.stairX0 + (i + 0.5) * (stairLen / steps);
      const y = ((i + 1) / steps) * F.top;
      box(x, y - 0.08, z, stairLen / steps + 0.02, 0.16, F.stairW, deckMat);
    }
    const slope = Math.atan2(F.top, stairLen);
    for (const side of [-1, 1]) {
      const r = box(F.stairX0 + stairLen / 2, F.top / 2 + 0.7, z + side * F.stairW / 2, Math.hypot(stairLen, F.top), 0.06, 0.06, rail);
      r.rotation.z = slope;
    }
    box(F.stairX0 + stairLen * 0.65, F.top * 0.32, z, 0.2, F.top * 0.64, 0.2, steel);
    // the stairs block the walkway beside them (walk around the narrow side)
    physics?.addBox(new THREE.Vector3(F.stairX0 + 1.2, 0, z - F.stairW / 2), new THREE.Vector3(F.x1, 2.2, z + F.stairW / 2), { kind: 'stairs', camera: false, walkable: false });
  }
  // sign on the deck
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#15803d'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#fff'; g.font = '800 34px "Space Grotesk", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PEDESTRIAN BRIDGE · USE IT!', 256, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.5, 0.6), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
      sign.position.set(side > 0 ? F.x1 + 0.04 : F.x0 - 0.04, F.top - 0.45, 0);
      sign.rotation.y = side * Math.PI / 2;
      group.add(sign);
    }
  }
  // the walk over: up the north stairs, across, down the south stairs (and the reverse)
  const pathNS = [
    new THREE.Vector3(F.stairX0 - 0.6, 0, F.zN), new THREE.Vector3(F.x0 + 0.1, F.top, F.zN), new THREE.Vector3((F.x0 + F.x1) / 2, F.top, F.zN),
    new THREE.Vector3((F.x0 + F.x1) / 2, F.top, F.zS), new THREE.Vector3(F.x0 + 0.1, F.top, F.zS), new THREE.Vector3(F.stairX0 - 0.6, 0, F.zS),
  ];
  const pathSN = [...pathNS].reverse();
  interactables?.push(
    { id: 'footbridge-n', position: new THREE.Vector3(F.stairX0 - 0.8, 0, F.zN), radius: 1.8, label: 'Cross by the pedestrian bridge', action: 'footbridge', path: pathNS },
    { id: 'footbridge-s', position: new THREE.Vector3(F.stairX0 - 0.8, 0, F.zS), radius: 1.8, label: 'Cross by the pedestrian bridge', action: 'footbridge', path: pathSN },
  );

  /* ---------------------------------------------------------------- invisible barrier along the kerbs */
  const add = (x0, x1, z) => physics?.addBox(new THREE.Vector3(x0, 0, z - 0.06), new THREE.Vector3(x1, 2.2, z + 0.06), { kind: 'roadgate', camera: false, walkable: false });
  for (const z of [ROAD.z0, ROAD.z1]) { add(-120, ZEBRA.x0, z); add(ZEBRA.x1, 120, z); }
  // the gate across the zebra: closed unless the green man shows
  let gates = [];
  const closeGates = () => { if (gates.length || !physics) return; gates = [ROAD.z0, ROAD.z1].map((z) => add(ZEBRA.x0, ZEBRA.x1, z)); };
  const openGates = () => { for (const g of gates) physics?.remove(g); gates = []; };
  closeGates();

  /* ---------------------------------------------------------------- state */
  let t = 0;
  let phase = 'go';
  function apply() {
    const carGreen = phase === 'go', carAmber = phase === 'amber', walk = phase === 'walk' || phase === 'flash';
    for (const h of heads) {
      h.red.material.color.set(!carGreen && !carAmber ? '#ff2a2a' : OFF);
      h.amber.material.color.set(carAmber ? '#ffb020' : OFF);
      h.green.material.color.set(carGreen ? '#22ff66' : OFF);
    }
    const blink = phase === 'flash' && Math.floor(t * 3) % 2 === 0;
    for (const p of peds) {
      p.man.material.color.set(walk ? '#333333' : '#ffffff');
      p.walk.material.color.set(walk && !blink ? '#ffffff' : '#333333');
    }
    if (phase === 'walk') openGates();
    else if (phase === 'go' || phase === 'amber') closeGates();
  }
  apply();

  return {
    group,
    update(dt) {
      t += dt;
      const p = lightPhase(t).phase;
      if (p !== phase) { phase = p; apply(); }
      else if (phase === 'flash') apply();
    },
    get phase() { return phase; },
    /** People may step onto the zebra (the green man shows). */
    get pedWalk() { return phase === 'walk'; },
    /** Cars may pass the stop line. */
    get carsGo() { return phase === 'go' || phase === 'amber'; },
    ZEBRA, FOOTBRIDGE,
  };
}

/** Red standing man / green walking man for the pedestrian signal. */
function manTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = kind === 'walk' ? '#22ff66' : '#ff2a2a';
  g.beginPath(); g.arc(32, 12, 6, 0, Math.PI * 2); g.fill();
  if (kind === 'walk') {
    g.fillRect(28, 20, 8, 20);
    g.save(); g.translate(32, 40); g.rotate(0.45); g.fillRect(-3, 0, 6, 20); g.restore();
    g.save(); g.translate(32, 40); g.rotate(-0.45); g.fillRect(-3, 0, 6, 20); g.restore();
  } else {
    g.fillRect(25, 20, 14, 22); g.fillRect(26, 42, 5, 18); g.fillRect(33, 42, 5, 18);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
