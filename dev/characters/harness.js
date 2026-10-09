// Characters dev harness: a lineup of dressed characters animating different states,
// orbit camera, detail toggle, crowd test and live stats (draw calls / triangles).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createContext } from '/src/engine/context.js';
import { loadCharacterKit, createCharacter, randomAppearance, ROLES } from '/src/characters/index.js';
import './harness.css';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('world');
const ctx = createContext(canvas, { quality: params.get('q') || undefined });
ctx.scene.background = new THREE.Color('#d9e8f2');

// --- simple courtyard: concrete tiles + a wooden pew for sitters -----------------
function tileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { const v = 150 + Math.random() * 60; g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.25)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(70,60,50,0.45)'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ctx.scene.add(ground);
const wood = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.6 });
function pew(x, z, w = 1.6) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.42), wood); seat.position.set(0, 0.44, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.05), wood); back.position.set(0, 0.72, -0.2);
  const legs = [];
  for (const lx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const lz of [-0.17, 0.17]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.05), wood); m.position.set(lx, 0.22, lz); legs.push(m); }
  g.add(seat, back, ...legs);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, 0, z);
  ctx.scene.add(g);
  return g;
}

// --- UI -----------------------------------------------------------------------------
const ui = document.getElementById('ui');
ui.innerHTML = `
  <div class="top">
    <div class="card legend"><h1 class="title">Amen City · Characters <span class="tag" id="tag">loading…</span></h1>
      <p>Drag to orbit, wheel / pinch to zoom. Lineup: every outfit and headwear, six skin tones.</p></div>
  </div>
  <div class="hud">
    <div class="card">
      <div class="row" role="toolbar" aria-label="Animation">
        <button class="chip" data-mode="lineup" aria-pressed="true">Lineup</button>
        <button class="chip" data-mode="idle">Idle</button>
        <button class="chip" data-mode="walk">Walk</button>
        <button class="chip" data-mode="jog">Jog</button>
        <button class="chip" data-mode="run">Run</button>
        <button class="chip" data-mode="sit">Sit</button>
        <button class="chip" data-mode="kneel">Kneel</button>
        <button class="chip" data-mode="dance">Dance</button>
        <button class="chip" data-mode="talk">Talk</button>
      </div>
      <div class="row" role="toolbar" aria-label="Actions">
        <button class="chip alt" data-act="wave">Wave</button>
        <button class="chip alt" data-act="clap">Clap</button>
        <button class="chip alt" data-act="raiseHands">Praise</button>
        <button class="chip warm" data-act="detail">Detail: high</button>
        <button class="chip warm" data-act="random">Random looks</button>
        <button class="chip warm" data-act="crowd">Crowd test</button>
      </div>
      <pre class="stats" id="stats">Loading characters…</pre>
    </div>
  </div>`;
const statsEl = document.getElementById('stats');

// --- lineup ---------------------------------------------------------------------------
/** @type {{spec: object, state: string, overlay?: string, sit?: boolean}[]} */
const LINEUP = [
  { spec: { body: 'male', skin: 4, outfit: 'agbada', headwear: 'fila', beard: true, colors: { primary: '#f3efe4', secondary: '#c9a227', pattern: 'plain' } }, state: 'idle', overlay: 'raiseHands' },
  { spec: { body: 'female', skin: 2, outfit: 'iro-buba', headwear: 'gele', colors: { primary: '#f8f4ec', secondary: '#8c1d3f', pattern: 'ankara-3' } }, state: 'idle', overlay: 'clap' },
  { spec: { body: 'female', skin: 5, outfit: 'choir-robe', hair: 'buns', colors: { primary: '#4c1d95', secondary: '#d4af37', pattern: 'plain' } }, state: 'talk' },
  { spec: { body: 'male', skin: 3, outfit: 'security', headwear: 'beret', colors: { primary: '#1f2937', secondary: '#111111', pattern: 'plain' } }, state: 'foldArms' },
  { spec: { body: 'female', skin: 1, outfit: 'usher', hair: 'simpleparted', colors: { primary: '#7f1d1d', secondary: '#1e293b', pattern: 'plain' } }, state: 'idle', overlay: 'wave' },
  { spec: { body: 'male', skin: 2, outfit: 'suit', hair: 'buzzed', colors: { primary: '#1f2937', secondary: '#f8fafc', pattern: 'plain' } }, state: 'walkFormal' },
  { spec: { body: 'female', skin: 3, outfit: 'ankara-gown', headwear: 'headscarf', colors: { primary: '#1d4ed8', secondary: '#facc15', pattern: 'ankara-1' } }, state: 'sit', sit: true },
  { spec: { body: 'male', skin: 5, outfit: 'senator', colors: { primary: '#14532d', secondary: '#d4af37', pattern: 'plain' } }, state: 'sitTalk', sit: true },
  { spec: { body: 'female', skin: 4, outfit: 'white-garment', headwear: 'headscarf' }, state: 'kneel' },
  { spec: { body: 'male', skin: 1, outfit: 'tshirt-jeans', headwear: 'cap', colors: { primary: '#111827', secondary: '#2c4a7a', pattern: 'plain' }, shoes: '#f5f5f4' }, state: 'phone' },
  { spec: { body: 'female', skin: 0, outfit: 'apron', headwear: 'headscarf', colors: { primary: '#b91c1c', secondary: '#f8fafc', pattern: 'plain' } }, state: 'carry' },
  { spec: { body: 'male', skin: 3, outfit: 'ankara-shirt', hair: 'simpleparted', colors: { primary: '#c2410c', secondary: '#facc15', pattern: 'ankara-2' } }, state: 'dance' },
  { spec: { body: 'female', skin: 2, outfit: 'skirt-blouse', headwear: 'gele', colors: { primary: '#b9a3e3', secondary: '#4c1d95', pattern: 'lace' } }, state: 'nod' },
  { spec: { body: 'male', skin: 4, outfit: 'shirt-trousers', hair: 'buzzed', colors: { primary: '#dbeafe', secondary: '#1f2937', pattern: 'stripes' } }, state: 'shakeHead' },
];

let kit = null;
let detail = 'high';
let mode = 'lineup';
/** @type {{c: any, slot: object, x: number, z: number}[]} */
let actors = [];
const pews = [];

const perRowFor = (n) => (innerWidth / innerHeight < 0.8 ? 4 : Math.ceil(n / 2));
function place(i, n) {
  const perRow = perRowFor(n);
  const rows = Math.ceil(n / perRow);
  const row = Math.floor(i / perRow), col = i % perRow;
  // rows staggered by half a slot so everyone is visible
  return { x: (col - (perRow - 1) / 2) * 1.15 + (row % 2 ? 0.575 : 0), z: ((rows - 1) / 2 - row) * 1.7 };
}

/** Frame the whole lineup in the current viewport. */
function frame(n) {
  const perRow = perRowFor(n);
  const rows = Math.ceil(n / perRow);
  const w = perRow * 1.15 + 0.8, d = rows * 1.7;
  const vfov = THREE.MathUtils.degToRad(ctx.camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * ctx.camera.aspect);
  const dist = Math.max((w / 2) / Math.tan(hfov / 2), 2.2 / Math.tan(vfov / 2)) + d / 2;
  ctx.camera.position.set(0, 1.2 + dist * (ctx.camera.aspect < 0.8 ? 0.4 : 0.18), dist);
  controls.target.set(0, 0.95, 0);
  controls.update();
}

function applyState(a) {
  const { c, slot } = a;
  const st = mode === 'lineup' ? slot.state : mode;
  const sitting = st === 'sit' || st === 'sitTalk';
  c.object.position.set(a.x, 0, a.z + (sitting ? 0.2 : 0));
  if (['walk', 'jog', 'run'].includes(st)) c.setLocomotion({ walk: 1.4, jog: 3.4, run: 5.2 }[st]);
  else c.play(st, { fade: 0.3 });
  if (mode === 'lineup' && slot.overlay) c[slot.overlay](1e6);
}

function build(list) {
  for (const a of actors) a.c.dispose();
  for (const p of pews) p.removeFromParent();
  pews.length = 0;
  actors = list.map((slot, i) => {
    const c = createCharacter(kit, slot.spec, { detail });
    const { x, z } = place(i, list.length);
    ctx.scene.add(c.object);
    return { c, slot, x, z };
  });
  // a pew under everyone who sits
  // the sit clips put the hips ~0.34 m behind the character origin (see character.sitOffset)
  for (const a of actors) if ((mode === 'lineup' && a.slot.sit) || mode === 'sit') pews.push(pew(a.x, a.z + 0.2 + a.c.sitOffset.z + 0.04, 0.95));
  for (const a of actors) applyState(a);
}

let crowd = [];
function crowdTest() {
  for (const c of crowd) c.dispose();
  crowd = [];
  if (crowdOn) { crowdOn = false; return; }
  crowdOn = true;
  const rng = mulberry(7);
  for (let i = 0; i < 48; i++) {
    const role = ROLES[i % ROLES.length];
    const c = createCharacter(kit, randomAppearance(rng, role), { detail: 'low' });
    const a = (i / 48) * Math.PI * 2, r = 7 + (i % 3) * 2.5;
    c.object.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    c.object.rotation.y = -a - Math.PI / 2;
    c.setLocomotion(i % 4 === 0 ? 0 : 1.3);
    if (i % 4 === 0) c.play(['talk', 'idle', 'phone', 'foldArms'][i % 4 === 0 ? (i / 4) % 4 : 0]);
    ctx.scene.add(c.object);
    crowd.push(c);
  }
}
let crowdOn = false;

function mulberry(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

ui.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || !kit) return;
  if (btn.dataset.mode) {
    mode = btn.dataset.mode;
    ui.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    build(actors.map((a) => a.slot));
    return;
  }
  const act = btn.dataset.act;
  if (act === 'wave' || act === 'clap' || act === 'raiseHands') actors.forEach((a) => a.c[act](act === 'wave' ? 2.5 : 3.5));
  if (act === 'detail') { detail = detail === 'high' ? 'low' : 'high'; btn.textContent = `Detail: ${detail}`; build(actors.map((a) => a.slot)); }
  if (act === 'random') {
    const rng = mulberry(Math.floor(Math.random() * 1e9));
    build(actors.map((a, i) => ({ ...a.slot, spec: randomAppearance(rng, ROLES[i % ROLES.length]) })));
  }
  if (act === 'crowd') { crowdTest(); btn.setAttribute('aria-pressed', String(crowdOn)); }
});

// --- camera ---------------------------------------------------------------------------
const controls = new OrbitControls(ctx.camera, canvas);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 1.2; controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.49;
ctx.camera.position.set(0, 1.9, 8);
controls.update();

let fps = 0, frames = 0, last = performance.now();
ctx.onUpdate((dt) => {
  for (const a of actors) a.c.update(dt);
  for (const c of crowd) c.update(dt);
  controls.update();
  frames++;
  const now = performance.now();
  if (now - last > 500) {
    fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now;
    const info = ctx.renderer.info.render;
    const s = window.__amen?.characterStats || {};
    const hi = s.high, lo = s.low;
    statsEl.innerHTML = `<b>${fps} fps</b> · draw calls <b>${info.calls}</b> · triangles <b>${info.triangles.toLocaleString()}</b>\n`
      + `high: <b>${hi ? hi.trianglesAvg.toLocaleString() : '–'}</b> tris avg (max ${hi ? hi.trianglesMax.toLocaleString() : '–'}), ≤${hi ? hi.drawCallsMax : '–'} draws, build ${hi ? hi.buildMsAvg : '–'} ms\n`
      + `low: <b>${lo ? lo.trianglesAvg.toLocaleString() : '–'}</b> tris avg, ${lo ? lo.drawCallsMax : '–'} draw, build ${lo ? lo.buildMsAvg : '–'} ms · kit load ${s.loadMs ?? '–'} ms · ${actors.length + crowd.length} characters`;
  }
});
ctx.start();

kit = await loadCharacterKit(ctx);
build(LINEUP);
frame(LINEUP.length);
if (params.get('cam') === 'close') { ctx.camera.position.set(0.6, 1.5, 3.4); controls.target.set(0, 1.1, 0.6); controls.update(); }
if (params.get('crowd')) crowdTest();
if (params.get('mode')) document.querySelector(`[data-mode="${params.get('mode')}"]`)?.click();
document.getElementById('tag').textContent = `${actors.length} characters`;
window.__amen = window.__amen || {};
window.__amen.harness = { get actors() { return actors.map((a) => a.c); }, get crowd() { return crowd; }, kit };
setTimeout(() => { window.__ready = true; }, 300);
