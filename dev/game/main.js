// Game + UI harness: start screen → appearance editor → HUD with the sheet, over the real
// Yaba map (when src/world builds) with the player's character placed in the scene.
// A DEV panel simulates where the player is (zone, sitting, kneeling) and warps time.
// URL: ?fresh (clear save) &step=look &play=1 &tab=today|prayer|shop|diary &zone=church-hall
//      &sit=1 &kneel=1 &warp=MIN &event=ID &quiz=1 &clean=1 (no dev UI) &quality=low|medium|high &role=usher
import * as THREE from 'three';
import { createContext } from '/src/engine/context.js';
import { createGame } from '/src/game/index.js';
import { createUI } from '/src/ui/index.js';
import { EVENT_BY_ID } from '/src/game/events.js';
import { activateEvent, makeEnv } from '/src/game/systems.js';

const q = new URLSearchParams(location.search);
if (q.has('fresh')) { try { localStorage.removeItem('amen.save'); } catch { /* blocked */ } }

const ctx = createContext(document.getElementById('world'), { quality: q.get('quality') || undefined });
// Pause the world while the opaque start screen is up (as main.js should).
let running = false;
ctx.bus.on('ui:screen', ({ screen }) => {
  if (screen === 'start' && running) { ctx.stop(); running = false; }
  if (screen === 'game' && !running) { ctx.start(); running = true; }
});
const game = createGame(ctx, { realMinutesPerDay: q.has('day') ? +q.get('day') : undefined });
ctx.onUpdate((dt) => game.tick(dt));

/* ---------------------------------------------------------------- backdrop: the real map if it builds */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let world = null;
const stubPhysics = () => {
  let ground = () => 0;
  return { blockers: [], addBox() {}, addCylinder() {}, setGround(fn) { ground = fn; }, groundHeight: (x, z) => ground(x, z), moveCapsule: (p, d) => p.clone().add(d) };
};
async function buildBackdrop() {
  try {
    const { buildWorld } = await import('/src/world/index.js');
    world = await buildWorld(ctx, stubPhysics());
    ctx.scene.add(world.root);
    ctx.onUpdate((dt, t) => world.update?.(dt, t));
  } catch (e) {
    console.warn('[harness] world unavailable, using a simple backdrop', e);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    ctx.scene.add(g);
  }
  placeView(currentZone);
}
// The editor-only scenario skips the map so SwiftShader screenshots stay fast.
const worldReady = q.get('step') === 'look' ? Promise.resolve() : buildBackdrop();

/* ---------------------------------------------------------------- the player's character */
let char = null;
let charAppearance = null;
const SPOTS = {
  home: [14.6, 16.6, Math.PI],
  street: [6, 2.5, Math.PI * 0.75],
  busstop: [-53.2, 6.4, Math.PI],
  market: [-6, 7.6, 0],
  gate: [14.4, -11.4, 0],
  carpark: [-4, -14, Math.PI / 2],
  'church-hall': null, // a pew
  altar: [19, -38.6, 0],
  choir: [26.2, -38.9, 0],
  media: [30.6, -23.1, Math.PI],
  'prayer-room': [43, -36.6, Math.PI],
  kitchen: [44.6, -28.3, 0],
  children: [47.2, -15.4, -Math.PI / 2],
};
let currentZone = q.get('zone') || 'home';
let pose = 'idle';

function placeView(zone) {
  let pos;
  let rot;
  if (zone === 'church-hall' && world) {
    const seat = world.seats.find((s) => s.zone === 'church-hall' && s.kind === 'pew' && s.position.z > -31 && s.position.z < -27) || world.seats.find((s) => s.zone === 'church-hall');
    pos = seat.position.clone().setY(seat.position.y - 0.47);
    rot = seat.rotY;
  } else {
    const s = SPOTS[zone] || SPOTS.home;
    pos = V(s[0], world ? world.groundAt(s[0], s[1]) : 0, s[1]);
    rot = s[2];
  }
  if (char) { char.object.position.copy(pos); char.object.rotation.y = rot; }
  // Third-person camera behind the character.
  const fwd = V(Math.sin(rot), 0, Math.cos(rot));
  const back = zone === 'church-hall' ? 3.2 : 4.6;
  const up = zone === 'church-hall' ? 1.9 : 2.3;
  ctx.camera.position.copy(pos).addScaledVector(fwd, -back).add(V(0, up, 0));
  ctx.camera.lookAt(pos.clone().add(V(0, 1.25, 0)).addScaledVector(fwd, 2));
  ctx.setShadowFocus(pos);
}

async function spawnCharacter(appearance) {
  if (!appearance || appearance === charAppearance) return;
  charAppearance = appearance;
  try {
    const [{ createCharacter }, kit] = await Promise.all([import('/src/characters/index.js'), ui.kit]);
    await worldReady;
    char?.dispose();
    char = createCharacter(kit, appearance);
    ctx.scene.add(char.object);
    applyPose();
    placeView(currentZone);
  } catch (e) { console.warn('[harness] no character', e); }
}
ctx.onUpdate((dt) => char?.update(dt));

function applyPose() {
  if (!char) return;
  const l = game.loc;
  pose = l.kneeling ? 'kneel' : l.seated ? 'sit' : 'idle';
  char.play(pose, { fade: 0.2 });
}

/* ---------------------------------------------------------------- UI */
const ui = createUI(ctx, {
  root: document.getElementById('ui'),
  game,
  onStart(profile) {
    console.info('[harness] onStart', profile);
    spawnCharacter(profile.appearance);
    setZone(currentZone);
  },
});

if (game.state && !running) { ctx.start(); running = true; }

/* ---------------------------------------------------------------- dev panel */
function setZone(zone) {
  currentZone = zone;
  game.setLocation({ zone, seated: zone === 'church-hall' || game.loc.seated, kneeling: zone === 'prayer-room' && game.loc.kneeling });
  placeView(zone);
  applyPose();
  drawPanel();
}

const ZONES = ['home', 'street', 'busstop', 'market', 'gate', 'carpark', 'church-hall', 'altar', 'choir', 'media', 'prayer-room', 'kitchen', 'children'];
let panel = null;
function drawPanel() {
  if (!panel || panel.hidden) return;
  const l = game.loc;
  const s = game.state;
  panel.innerHTML = '';
  const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; panel.append(...d.childNodes); };
  add('<h4>Where am I</h4>');
  const sel = document.createElement('select');
  for (const z of ZONES) sel.append(new Option(z, z, false, z === l.zone));
  sel.onchange = () => setZone(sel.value);
  panel.append(sel);
  add('<h4>Pose</h4>');
  const row = document.createElement('div'); row.className = 'row';
  const btn = (label, pressed, fn) => { const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', String(!!pressed)); b.onclick = () => { fn(); applyPose(); drawPanel(); }; row.append(b); };
  btn('Sit', l.seated, () => game.setLocation({ seated: !l.seated, kneeling: false }));
  btn('Kneel', l.kneeling, () => game.setLocation({ kneeling: !l.kneeling, seated: false }));
  btn('Praise', l.praising, () => { game.setLocation({ praising: true }); char?.raiseHands(3); });
  panel.append(row);
  add('<h4>Time</h4>');
  const row2 = document.createElement('div'); row2.className = 'row';
  for (const [label, m] of [['+15m', 15], ['+1h', 60], ['+3h', 180], ['+1 day', 1440]]) {
    const b = document.createElement('button'); b.textContent = label; b.onclick = () => { game.warp(m); drawPanel(); }; row2.append(b);
  }
  panel.append(row2);
  add('<h4>Try</h4>');
  const row3 = document.createElement('div'); row3.className = 'row';
  const tryBtn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; row3.append(b); };
  tryBtn('Temptation', () => fireEvent('wallet'));
  tryBtn('Role event', () => fireEvent({ usher: 'offeringbag', security: 'bribepark', choir: 'solo', media: 'nepa', hospitality: 'meat', children: 'naughty', prayer: 'cursereq' }[s?.role] || 'traffic'));
  tryBtn('Quiz', () => game.act('quiz'));
  tryBtn('Buka', () => game.interact({ id: 'buka', action: 'buy-food' }));
  tryBtn('Danfo', () => game.interact({ id: 'danfo', action: 'board-danfo' }));
  tryBtn('+₦50k', () => { s.naira += 50000; game.setLocation({}); });
  panel.append(row3);
  if (s) add(`<pre>${game.clock.weekdayShort} ${game.clock.time} · zone ${l.zone} · seated ${l.seated} · kneel ${l.kneeling}\nprogress ${JSON.stringify(game.progress)}</pre>`);
}

function fireEvent(id) {
  const s = game.state;
  if (!s || s.activeEvent) return;
  const e = makeEnv();
  activateEvent(s, EVENT_BY_ID[id], e);
  for (const f of e.fx) if (f.type === 'event') ui.dev.dialogs.event(f.event);
}

if (!q.has('clean')) {
  const toggle = document.createElement('button');
  toggle.className = 'dev-toggle';
  toggle.textContent = 'DEV';
  panel = document.createElement('div');
  panel.className = 'dev-panel';
  panel.hidden = true;
  toggle.onclick = () => { panel.hidden = !panel.hidden; drawPanel(); };
  document.body.append(toggle, panel);
  window.addEventListener('keydown', (e) => { if (e.key === '`') toggle.click(); });
  game.on('clock', () => { if (!panel.hidden && Math.floor(game.state.T) % 5 === 0) drawPanel(); });
}

/* ---------------------------------------------------------------- URL scenarios for screenshots */
(async () => {
  if (q.get('step') === 'look') ui.dev.start.toLook(q.get('name') || 'Chioma');
  if (q.has('play') && !game.state) {
    const lib = await import('/src/characters/index.js').catch(() => null);
    const role = q.get('role') || 'usher';
    const appearance = lib ? lib.randomAppearance(mulberry(+(q.get('seed') || 7)), role) : null;
    ui.begin({ name: q.get('name') || 'Chioma', role, tradition: 'pentecostal', appearance });
  }
  if (!game.state) return;
  if (q.has('skipintro')) ui.dev.dialogs.clear();
  if (q.has('warp')) game.warp(+q.get('warp'));
  setZone(currentZone);
  if (q.has('sit')) game.setLocation({ seated: true });
  if (q.has('kneel')) game.setLocation({ kneeling: true, seated: false });
  applyPose();
  if (q.has('tab')) ui.openSheet(q.get('tab'));
  if (q.has('event')) fireEvent(q.get('event'));
  if (q.has('quiz')) game.act('quiz');
  ui.dev.hud.update();
})();

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

window.__harness = { ctx, game, ui, get world() { return world; }, get char() { return char; }, setZone };
