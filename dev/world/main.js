// World harness: builds the map with a stub physics and offers a camera tour.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createContext } from '../../src/engine/context.js';
import { buildWorld } from '../../src/world/index.js';
import { createStubPhysics } from './stub-physics.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('world');
const ctx = createContext(canvas, { quality: params.get('q') || undefined });
const physics = createStubPhysics();
const world = await buildWorld(ctx, physics);
const controls = new OrbitControls(ctx.camera, canvas);
controls.enableDamping = true;

const views = {
  street: [[-6, 2.2, 7.5], [10, 3, -8]],
  market: [[-20, 2.0, 4.8], [-33, 1.2, 12]],
  busstop: [[-44, 2.4, -1.5], [-55, 1.5, 6]],
  church: [[24, 4.5, -1.5], [16, 4, -22]],
  gate: [[9, 1.8, -2.5], [13, 2.5, -14]],
  hall: [[19, 2.4, -22.2], [19, 2.2, -38]],
  altar: [[14, 2.2, -33], [22, 1.8, -40]],
  media: [[30.5, 2.0, -21.5], [19, 1.5, -34]],
  prayer: [[46.6, 1.9, -34.8], [41, 0.6, -40]],
  canteen: [[39, 2.2, -21.8], [46, 1.0, -28]],
  kids: [[36, 2.4, -9.8], [45, 0.6, -15]],
  home: [[13.8, 2.2, 9.4], [19, 2.2, 22]],
  homeInside: [[18.4, 2.0, 25.8], [12.4, 1.0, 20]],
  carpark: [[-2, 3.4, -9.5], [-14, 0.5, -22]],
  overview: [[-30, 45, 55], [5, 0, -10]],
};
const nav = document.getElementById('views');
function tour(name) {
  const v = views[name];
  if (!v) return;
  ctx.camera.position.set(...v[0]);
  controls.target.set(...v[1]);
  controls.update();
  ctx.setShadowFocus(new THREE.Vector3(...v[1]));
  for (const b of nav.children) b.setAttribute('aria-pressed', String(b.dataset.view === name));
}
for (const name of Object.keys(views)) {
  const b = document.createElement('button');
  b.textContent = name; b.dataset.view = name; b.type = 'button';
  b.onclick = () => tour(name);
  nav.appendChild(b);
}

// debug overlay: ?debug=1 draws colliders (red) and nav edges (cyan)
if (params.get('debug')) {
  const pts = [];
  for (const b of physics.boxes) {
    const { min: a, max: c } = b;
    const y = Math.min(c.y, 1.2);
    for (const [p, q] of [[[a.x, a.z], [c.x, a.z]], [[c.x, a.z], [c.x, c.z]], [[c.x, c.z], [a.x, c.z]], [[a.x, c.z], [a.x, a.z]]]) pts.push(new THREE.Vector3(p[0], y, p[1]), new THREE.Vector3(q[0], y, q[1]));
  }
  ctx.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ff2d2d', depthTest: false })));
  const np = [];
  for (const [i, j] of world.nav.edges) np.push(world.nav.nodes[i].position.clone().setY(0.3), world.nav.nodes[j].position.clone().setY(0.3));
  ctx.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(np), new THREE.LineBasicMaterial({ color: '#00e5ff', depthTest: false })));
}

if (params.get('service')) ctx.bus.emit('service:start', { kind: 'sunday' });
const statsEl = document.getElementById('stats');
let acc = 0;
ctx.onUpdate((dt, t) => {
  world.update(dt, t);
  controls.update();
  acc += dt;
  if (acc > 0.5) {
    acc = 0;
    const i = ctx.renderer.info;
    statsEl.textContent = `calls ${i.render.calls} · tris ${(i.render.triangles / 1000).toFixed(1)}k · ${ctx.quality} · build ${world.stats.buildMs} ms`;
  }
});
tour(params.get('view') || 'street');
ctx.start();
window.__world = world;
window.__ctx = ctx;
window.__physics = physics;
window.__tour = tour;
window.__views = Object.keys(views);
window.__ready = true;
