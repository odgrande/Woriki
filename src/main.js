// Amen City entry point: wires every module together (see ARCHITECTURE.md).
//
// Logo preloader → the live Lagos map with Sign up / Log in (or, for a logged-in player, their
// 3D home with Continue / New life) → role + look → the day starts at home in Yaba → NPC
// community, sound, multiplayer, chat and the game rules run together. The Lagos map takes
// you anywhere (Home button: bike, taxi, danfo, free ride or trekking).
import * as THREE from 'three';
import { createContext } from './engine/context.js';
import { createInput } from './engine/input.js';
import { createFollowCamera } from './engine/camera.js';
import { createPhysics } from './engine/physics.js';
import { loadCharacterKit, createCharacter } from './characters/index.js';
import { buildWorld } from './world/index.js';
import { createPlayer } from './player/player.js';
import { createCommunity } from './npc/index.js';
import { createBubbles } from './ui/bubbles.js';
import { createAudio } from './audio/index.js';
import { createNet } from './net/client.js';
import { createRemotes } from './net/remotes.js';
import { createChatUI } from './ui/chat.js';
import { createGame } from './game/index.js';
import { REAL_TIME } from './game/clock.js';
import { createUI } from './ui/index.js';
import { finishBoot } from './ui/front.js';
import { createLagosMap } from './map/lagos.js';
import { createDecor } from './world/decor.js';
import { createJourney } from './world/journey.js';
import { randomAppearance } from './characters/index.js';
import './main.css';

const params = new URLSearchParams(location.search);
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world'));
const uiRoot = /** @type {HTMLElement} */ (document.getElementById('ui'));
const ctx = createContext(canvas, { quality: /** @type {any} */ (params.get('quality')) || undefined });
const debug = (window.__amen = { ctx });

// Start loading the heavy parts right away, while the player picks a role and a look.
const physics = createPhysics();
const kitPromise = loadCharacterKit(ctx);
const worldPromise = buildWorld(ctx, physics).then((w) => { if (!w.root.parent) ctx.scene.add(w.root); return w; });
kitPromise.catch((e) => console.error('[main] character kit failed', e));
worldPromise.catch((e) => console.error('[main] world failed', e));

const input = createInput(uiRoot);
input.enabled = false;
input.setVisible?.(false);
const audio = createAudio(ctx);
// Real Lagos time: one game day per real day, the same for every player (?clock=local for fast test days).
const game = createGame(ctx, params.get('clock') === 'local' ? { clock: 'local' } : { clock: 'shared', realMinutesPerDay: REAL_TIME });
const bubbles = createBubbles(ctx, { root: uiRoot });

// Sound can only start after a user gesture.
const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// The Lagos map: the landing page before you join, and the Map button in the game.
let ui = null;
const lagosMap = createLagosMap(ctx, { root: uiRoot, onPick: (p) => ui?.mapPick(p) });

// Furniture from the home catalog, rebuilt when you buy something.
const decorPromise = worldPromise.then((world) => {
  const decor = createDecor(ctx, { physics, seats: world.seats });
  world.root.add(decor.root);
  ctx.bus.on('home:changed', ({ home }) => decor.set(home));
  return decor;
});

ui = createUI(ctx, {
  root: uiRoot, game, kit: kitPromise, audio, input, map: lagosMap,
  onStart: (profile) => enter(profile),
  onArrive: (go) => arrive(go),
  onJourney: (go) => journey(go),
  onSkipJourney: () => session?.journey?.skip(),
  snapshot: () => snapshot(),
});
debug.app = ui; // full UI API for tests (window.__amen.ui is the UI module's small status object)

/* ---------------------------------------------------------------- loading overlay */
function loadingOverlay() {
  const el = document.createElement('div');
  el.className = 'amen-loading';
  el.innerHTML = '<div class="amen-loading-card"><div class="amen-loading-logo">⛪</div><h2>Entering Yaba…</h2><p class="amen-loading-step">Loading people</p><div class="amen-loading-bar"><div></div></div></div>';
  document.body.appendChild(el);
  const step = el.querySelector('.amen-loading-step');
  const bar = /** @type {HTMLElement} */ (el.querySelector('.amen-loading-bar > div'));
  return {
    set(text, frac) { step.textContent = text; bar.style.width = `${Math.round(frac * 100)}%`; },
    done() { el.classList.add('is-done'); setTimeout(() => el.remove(), 400); },
  };
}

/* ---------------------------------------------------------------- entering the world */
let session = null;

async function enter(profile) {
  if (session) return; // already in the world (continuing after a modal, etc.)
  session = {};
  const loading = loadingOverlay();
  try {
    loading.set('Loading people', 0.2);
    const kit = await kitPromise;
    loading.set('Building Yaba', 0.5);
    const world = await worldPromise;
    loading.set('Getting dressed', 0.75);
    await nextFrame();

    homeScene.hide();
    const decor = await decorPromise;
    decor.set(game.state?.home || {});
    const role = profile.role || game.state?.role || 'worshipper';
    const appearance = profile.appearance || game.state?.appearance || {};
    const character = createCharacter(kit, appearance, { detail: 'high' });
    const camera = createFollowCamera(ctx, input);
    const player = createPlayer(ctx, { world, physics, input, camera, character });
    // Every day starts at home, like real life; the day's plan says where to go.
    const spawn = world.spawns.home || world.spawns.byRole[role] || world.spawns.player;
    player.teleport(spawn.position, spawn.rotY);
    // Start with a three-quarter view so doors and posts next to a duty spot don't hide you.
    camera.behind(spawn.rotY || 0);
    camera.yaw += 0.65;
    camera.snap?.();
    camera.setMode(ui.view);
    input.mouseLook = ui.mouseLook;

    loading.set('Meeting the community', 0.85);
    await nextFrame();
    const community = createCommunity(ctx, { world, physics, kit, bubbles, player, seed: 20261010 });

    loading.set('Connecting', 0.95);
    const net = createNet({ room: params.get('room') || 'yaba', name: profile.name || game.state?.name || 'Guest', role, appearance });
    const remotes = createRemotes(ctx, { net, kit, bubbles });
    const chat = createChatUI(ctx, { net, root: uiRoot, input, roomLabel: 'Yaba' });
    ui.phone?.setNet(net);
    const syncOnline = () => ui.setOnline?.(net.online || 1, net.mode);
    net.on('online', syncOnline);
    net.on('welcome', syncOnline);
    net.on('status', syncOnline);

    // Your own chat lines appear above your head too.
    ctx.bus.on('chat:message', (e) => { if (e?.self) bubbles.show(player.object, e.text, { kind: 'self' }); });

    Object.assign(session, { world, player, camera, community, net, remotes, chat, character, decor });
    Object.assign(debug, { game, ui, input, physics, world, player, camera, community, net, remotes, chat, audio, bubbles, kit, map: lagosMap, decor });

    input.enabled = true;
    input.setVisible?.(true);
    showAds();
    ctx.onUpdate((dt, t) => frame(dt, t));
    loading.done();
    ctx.bus.emit('game:toast', { text: `Welcome to ${world.zoneAt?.(player.position)?.label || 'Yaba'}! Press ? for controls.` });
  } catch (e) {
    console.error('[main] could not enter the world', e);
    loading.set('Something went wrong. Please reload the page.', 1);
    session = null;
  }
}

const yawVec = new THREE.Vector3();
function frame(dt, t) {
  const s = session;
  if (!s?.player) return;
  game.tick(dt);
  const c = game.clock;
  if (c) s.world.setTime?.(c.minute / 60);
  s.world.update?.(dt, t);
  if (!s.travelling) {
    s.player.update(dt, t);
    s.camera.update(dt, s.player.position, physics);
    s.character.object.visible = !s.camera.firstPerson;
    roadHint(s);
  }
  s.community.update(dt, t);
  s.decor.update(dt, t);
  bubbles.update();
  ctx.camera.getWorldDirection(yawVec);
  audio.update(ctx.camera.position, Math.atan2(yawVec.x, yawVec.z));
  s.net.sendState({ position: s.player.position, rotY: s.player.heading, anim: s.player.animState, seat: s.player.seat ? 1 : 0 });
}

function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }

/** A small photo of the 3D view for the phone's camera (a JPEG data URL). */
function snapshot() {
  try {
    ctx.renderer.render(ctx.scene, ctx.camera);
    const src = ctx.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 480; c.height = Math.round((480 * src.height) / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) { console.warn('[main] snapshot', e); return null; }
}

/* ---------------------------------------------------------------- road safety */
let lastRoadHint = -1e9;
/** Near the kerb where crossing is not allowed: say where to cross. */
function roadHint(s) {
  const rules = s.world.roadRules;
  if (!rules) return;
  const p = s.player.position;
  const az = Math.abs(p.z);
  if (az < 3.85 || az > 4.75) return;
  const now = performance.now();
  if (now - lastRoadHint < 6000) return;
  const atZebra = p.x >= rules.ZEBRA.x0 - 0.4 && p.x <= rules.ZEBRA.x1 + 0.4;
  if (atZebra && rules.pedWalk) return;
  lastRoadHint = now;
  ctx.bus.emit('game:toast', atZebra
    ? { text: 'Wait for the green man before you cross. 🚦', emoji: '✋', tone: 'warn' }
    : { text: 'You can\'t cross here. Use the pedestrian bridge by the market, or the zebra crossing at the church gate when the green man shows.', emoji: '🚧', tone: 'warn' });
}

/** Walk up the stairs, across the pedestrian bridge and down the other side. */
async function crossFootbridge(path) {
  const s = session;
  if (!s?.player || s.travelling) return;
  s.travelling = true;
  const obj = s.player.object;
  const speed = 2.3;
  const pos = new THREE.Vector3().copy(path[0]);
  let last = performance.now();
  const target = new THREE.Vector3();
  try {
    for (let i = 1; i < path.length; i++) {
      await new Promise((resolve) => {
        const off = ctx.onUpdate(() => {
          const now = performance.now();
          const dt = Math.min(0.1, (now - last) / 1000); // wall clock: slow phones don't walk slower
          last = now;
          target.copy(path[i]);
          const d = pos.distanceTo(target);
          const step = Math.min(d, speed * dt);
          if (d > 1e-3) {
            const dir = target.clone().sub(pos).normalize();
            pos.addScaledVector(dir, step);
            if (Math.abs(dir.x) + Math.abs(dir.z) > 0.05) obj.rotation.y = Math.atan2(dir.x, dir.z);
          }
          obj.position.copy(pos);
          s.character.setLocomotion?.(speed);
          s.character.update?.(dt);
          s.camera.update(dt, pos, physics);
          if (d - step < 0.02) { off(); resolve(); }
        });
      });
    }
  } finally {
    s.travelling = false;
    s.player.teleport(path[path.length - 1], obj.rotation.y);
    ctx.bus.emit('game:toast', { text: 'You crossed safely by the pedestrian bridge. Wise! 👍', emoji: '🌉' });
  }
}
ctx.bus.on('player:interact', (item) => { if (item?.action === 'footbridge') crossFootbridge(item.path); });

/* ---------------------------------------------------------------- travelling */
/** The trip on the road (walking, okada, danfo, taxi or car); trips that are not walkable come back. */
async function journey(go) {
  const s = session;
  if (!s?.player) return;
  s.journey ||= createJourney(ctx, { world: s.world, kit: await kitPromise, createCharacter, randomAppearance });
  const back = s.player.position.clone();
  const heading = s.player.heading;
  s.travelling = true;
  try {
    await s.journey.play({ mode: go.mode, ownBike: go.mode === 'bike' && !!game.state?.items?.bike }, s.character);
  } finally {
    s.travelling = false;
    if (!go.walk) { s.player.teleport(back, heading); s.camera.behind(heading); s.camera.snap?.(); }
  }
}

/** After a trip to a walkable place: put the player there, facing the way in. */
async function arrive(go) {
  const s = session;
  if (!s?.player) return;
  const sp = s.world.spawns.places?.[go.walk] || s.world.spawns.home;
  s.player.teleport(sp.position, sp.rotY);
  s.camera.behind(sp.rotY || 0);
  s.camera.snap?.();
  ctx.setShadowFocus(sp.position);
  const zone = s.world.zoneAt?.(sp.position);
  ctx.bus.emit('player:zone', { zone });
}

/* ---------------------------------------------------------------- returning player's home */
/** Your character standing in the living room of No. 14 behind the "welcome back" card. */
const homeScene = (() => {
  let char = null, off = null, token = 0;
  return {
    async show(saved) {
      const my = ++token;
      const [kit, world, decor] = await Promise.all([kitPromise, worldPromise, decorPromise]);
      if (my !== token) return;
      decor.set(saved?.home || {});
      if (saved?.clock) world.setTime?.(saved.clock.minute / 60);
      char?.dispose?.();
      char = createCharacter(kit, saved?.appearance || {}, { detail: 'high' });
      const at = new THREE.Vector3(15.9, world.groundAt(15.9, 20.6), 20.6);
      char.object.position.copy(at);
      char.object.rotation.y = 0.5;
      ctx.scene.add(char.object);
      char.play?.('idle');
      // Look down a little so you stand in the top half of the screen, above the card.
      ctx.camera.position.set(18.3, at.y + 2.0, 25.6);
      ctx.camera.lookAt(15.5, at.y + 0.35, 20.6);
      ctx.setShadowFocus(at);
      let wave = 1.2;
      off?.();
      off = ctx.onUpdate((dt, t) => {
        char.update?.(dt);
        world.update?.(dt, t);
        decor.update(dt, t);
        wave -= dt;
        if (wave < 0) { char.wave?.(); wave = 9; }
      });
    },
    hide() {
      token++;
      off?.(); off = null;
      if (char) { ctx.scene.remove(char.object); char.dispose?.(); char = null; }
    },
  };
})();

/* ---------------------------------------------------------------- screens */
// Render while on the landing map, the home card or playing; the sign-up screens have their own
// small preview renderer.
async function onScreen({ screen, saved }) {
  if (screen === 'landing') {
    homeScene.hide();
    ctx.start();
    finishBoot(1500);
    fetchOnline();
  } else if (screen === 'home') {
    ctx.start();
    try { await homeScene.show({ ...saved, home: readHome() }); } catch (e) { console.error('[main] home scene', e); }
    finishBoot(800);
  } else if (screen === 'game') {
    ctx.start();
    finishBoot(0);
  } else {
    homeScene.hide();
    ctx.stop();
    finishBoot(600);
  }
}
ctx.bus.on('ui:screen', onScreen);
ctx.bus.on('ui:view', ({ mode }) => session?.camera?.setMode(mode));
// Players' church adverts on the billboards (map and street).
const showAds = () => { const ads = game.ads || []; lagosMap.setAds(ads); session?.world?.setAds?.(ads); };
ctx.bus.on('ads:changed', showAds);
ctx.bus.on('ui:mouselook', ({ on }) => { input.mouseLook = on; });
// createUI already showed its first screen before this listener existed.
onScreen({ screen: game.state ? 'game' : document.querySelector('.fr-home:not([hidden])') ? 'home' : document.querySelector('.fr-landing:not([hidden])') ? 'landing' : 'start', saved: game.peek?.() });

function readHome() {
  try { return JSON.parse(localStorage.getItem(game.SAVE_KEY) || '{}').state?.home || {}; } catch { return {}; }
}

/** Players online for the landing page (the server's /stats; nothing when offline). */
function fetchOnline() {
  fetch(`${import.meta.env.BASE_URL}stats`).then((r) => (r.ok ? r.json() : null)).then((st) => { if (st && st.total > 0) ui.setLandingOnline(st.total); }).catch(() => {});
}
