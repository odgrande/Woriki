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
import { buildInterior, INTERIOR_OF } from './world/interiors.js';
import { ACTIVITIES, PLACE_BY_ID } from './game/life.js';
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
  const decor = createDecor(ctx, { physics, seats: world.seats, interactables: world.interactables });
  decor.set({}); // the sofa set, the old TV and the foam mattress you start with
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
  onEnterPlace: (placeId) => enterPlace(placeId),
  snapshot: () => snapshot(),
});
debug.app = ui; // full UI API for tests (window.__amen.ui is the UI module's small status object)
debug.mapDebug = lagosMap;
debug.journey = (go) => journey(go); // tests: play a trip on the road
debug.enterPlace = (id) => enterPlace(id); // tests: find yourself inside a place

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
  if (s.inside) for (const n of s.inside.people) n.char.update?.(dt);
  for (const m of s.inside?.markers || []) m.position.y = m.userData.y + Math.sin(t * 2.2 + m.userData.y) * 0.08;
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
    ? { text: 'Wait for the green light before you cross. 🚦', emoji: '✋', tone: 'warn' }
    : { text: 'You can\'t cross here. Use the pedestrian bridge by the market, or the zebra crossing at the church gate when the light turns green.', emoji: '🚧', tone: 'warn' });
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
ctx.bus.on('player:interact', (item) => {
  if (item?.action === 'footbridge') crossFootbridge(item.path);
  if (item?.action === 'furniture') ui.furniture(item.slot);
  if (item?.action === 'place-activity') ui.activity(item.activity);
  if (item?.action === 'leave-place') ui.showMap({ place: item.place });
});

/* ---------------------------------------------------------------- inside the places */
// After a trip you find yourself inside the place (src/world/interiors.js): its people, and a
// floating sign on each thing you can do there (walk up and press F, or tap the sign).
const interiors = new Map();
async function enterPlace(placeId) {
  const s = session;
  const place = PLACE_BY_ID[placeId];
  if (!s?.player || !place || !INTERIOR_OF[placeId]) return false;
  let inside = interiors.get(placeId);
  if (!inside) {
    let info = null;
    s.world.scenery((W) => {
      info = buildInterior(W, placeId, place);
      // what you can do here: a spot for each activity, and the way out
      ACTIVITIES.filter((a) => a.place === placeId).forEach((a, i) => {
        const st = info.stations[i % Math.max(1, info.stations.length)] || info.spawn;
        const at = st.clone();
        if (i >= info.stations.length) at.x += 1.3 * Math.floor(i / info.stations.length);
        W.interact(`act-${a.id}`, at, 1.4, a.name, 'place-activity', { activity: a.id, short: `${a.emoji} ${a.shady ? 'Hmm…' : 'Do'}` });
      });
      W.interact(`exit-${placeId}`, info.exit.clone(), 1.6, 'Go outside (the Lagos map)', 'leave-place', { place: placeId, short: '🚪 Exit' });
      return { zones: [info.zone] };
    }, `inside:${placeId}`);
    const kit = await kitPromise;
    const people = info.npcs.map((n, i) => {
      const char = createCharacter(kit, randomAppearance(Math.random, n.role === 'minister' ? 'minister' : n.role), { detail: 'low' });
      char.object.position.copy(n.pos);
      char.object.rotation.y = n.rotY;
      if (n.scale) char.object.scale.setScalar(n.scale);
      const act = char.play(n.pose === 'kneel' ? 'kneel' : n.pose === 'lie' ? 'lie' : n.pose, { fade: 0 });
      if (n.pose === 'kneel' && act) { act.time = 2.0; act.timeScale = 0; }
      s.world.root.add(char.object);
      return { id: 9000 + interiors.size * 20 + i, name: n.name || ['Bro. Tayo', 'Sis. Ngozi', 'Mr. Bello', 'Aunty Funmi', 'Chidi', 'Baba Sule'][i % 6], role: n.role, kind: n.scale ? 'kid' : 'inside', char, pos: char.object.position };
    });
    // floating signs over the things to do
    const markers = s.world.interactables.filter((it) => it.action === 'place-activity' && ACTIVITIES.find((a) => a.id === it.activity)?.place === placeId).map((it) => {
      const a = ACTIVITIES.find((x) => x.id === it.activity);
      const m = signSprite(a.emoji, a.shady);
      m.position.set(it.position.x, it.position.y + 2.3, it.position.z);
      m.userData = { y: it.position.y + 2.3, activity: a.id };
      s.world.root.add(m);
      return m;
    });
    const exitSign = signSprite('🚪', false);
    exitSign.position.set(info.exit.x, info.exit.y + 2.5, info.exit.z);
    exitSign.userData = { y: info.exit.y + 2.5, exit: placeId };
    s.world.root.add(exitSign);
    markers.push(exitSign);
    inside = { info, people, markers, placeId };
    interiors.set(placeId, inside);
  }
  s.inside = inside;
  s.player.teleport(inside.info.spawn, inside.info.spawnRot);
  s.camera.behind(inside.info.spawnRot);
  // a wide look at the room as you come in
  s.camera.pitch = 0.22;
  s.camera.distance = Math.min(s.camera.maxDistance, inside.info.outdoor ? 7 : 4.6);
  s.camera.snap?.();
  ctx.setShadowFocus(inside.info.spawn);
  ctx.bus.emit('player:zone', { zone: s.world.zoneAt?.(inside.info.spawn) });
  quiet(false);
  ui.toast?.(`📍 You are inside ${place.name}. Walk to a sign and press F (or tap it) to do something. The door takes you back to the map.`);
  return true;
}
/** A round sign with an emoji, floating over a thing to do. */
function signSprite(emoji, shady) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = shady ? '#fecaca' : '#fde047';
  g.strokeStyle = '#000'; g.lineWidth = 8;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill(); g.stroke();
  g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  sp.scale.set(0.6, 0.6, 0.6);
  sp.name = 'activity-sign';
  return sp;
}

/* ---------------------------------------------------------------- life in your room */
// Do something with a piece of furniture (from its menu): sit, lie on the bed, kneel at the
// prayer corner, watch TV from the sofa, read, eat, play… then the game applies the effect.
ctx.bus.on('home:do', ({ slot, id, pose, toggle }) => {
  const s = session;
  if (!s?.player || !s.decor || s.travelling) return;
  const P = s.player;
  const sp = s.decor.spots(slot);
  if (!sp) return;
  const v = new THREE.Vector3();
  /** A floor point `d` metres from the item towards you, and the heading that faces the item. */
  const besideItem = (d = 0.95) => {
    const c = sp.center || P.position;
    v.copy(P.position).sub(c).setY(0);
    if (v.lengthSq() < 0.01) v.set(1, 0, 0);
    v.normalize();
    const at = c.clone().addScaledVector(v, d);
    at.y = physics.groundHeight(at.x, at.z, c.y + 0.5);
    return { at, rot: Math.atan2(c.x - at.x, c.z - at.z) };
  };
  const nearestSeat = (seats) => seats.filter((x) => !x.taken).sort((a, b) => a.position.distanceTo(P.position) - b.position.distanceTo(P.position))[0];
  const effect = () => game.homeAction?.(slot, id);
  if (toggle) {
    const b = besideItem(0.8);
    P.teleport(b.at, b.rot);
    P.act('interact', 1.2);
    const on = s.decor.toggle(slot);
    ui.toast?.(`${slot === 'fan' ? 'The fan' : 'The AC'} is ${on ? 'on' : 'off'}.${on ? ' Thank God for light! 💡' : ''}`);
    return;
  }
  if (pose === 'sit' || pose === 'tv') {
    const seats = pose === 'tv' ? (s.decor.spots('sofa')?.seats || []).filter((x) => Math.abs(x.rotY - Math.PI / 2) < 0.1) : sp.seats;
    const seat = pose === 'tv' ? seats[1] || seats[0] : nearestSeat(sp.seats);
    if (seat && !seat.taken) P.sitAt(seat);
    else if (seat) P.sitAt(nearestSeat(seats) || seat);
    effect();
  } else if (pose === 'lie' && sp.lie) {
    P.lieAt(sp.lie, besideItem(1.45).at);
    if (id === 'sleep') setTimeout(() => { if (P.state === 'lie') effect(); }, 1800);
    else effect();
  } else if (pose === 'kneel') {
    const b = besideItem(0.9);
    P.teleport(b.at, b.rot);
    P.kneel();
  } else if (pose === 'read' || pose === 'eat' || pose === 'interact') {
    const b = besideItem(0.85);
    P.teleport(b.at, b.rot);
    P.act({ read: 'phone', eat: 'eat', interact: 'interact' }[pose], pose === 'read' ? 4 : pose === 'eat' ? 3 : 2);
    effect();
  } else effect();
});

/* ---------------------------------------------------------------- click on furniture to use it */
{
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    const s = session;
    if (!down || !s?.decor || !ctx.viewingWorld || s.travelling || document.pointerLockElement) { down = null; return; }
    const quick = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 400;
    down = null;
    if (!quick) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    ray.far = 40;
    const hit = ray.intersectObject(s.decor.root, true)[0];
    const slot = hit && s.decor.slotOf(hit.object);
    if (slot) { ui.furniture(slot); return; }
    // the floating signs over things to do inside a place
    const sign = s.inside?.markers.length ? ray.intersectObjects(s.inside.markers, false)[0] : null;
    if (sign) { if (sign.object.userData.exit) ui.showMap({ place: sign.object.userData.exit }); else ui.activity(sign.object.userData.activity); return; }
    // people: the nearest one on screen under the pointer (cheaper than raycasting skinned meshes)
    let best = null, bd = 46;
    const v = new THREE.Vector3();
    for (const n of [...s.community.npcs, ...(s.inside?.people || [])]) {
      if (!n.char.object.visible) continue;
      v.copy(n.pos); v.y += 1.2;
      if (v.distanceTo(ctx.camera.position) > 30) continue;
      v.project(ctx.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(((v.x + 1) / 2) * r.width + r.left - e.clientX, ((1 - v.y) / 2) * r.height + r.top - e.clientY);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) {
      ui.person(best, {
        greet: () => {
          best.faceUntil = ctx.time + 3;
          best.char.wave?.(1.8);
          s.character.wave?.(1.6);
          bubbles.show(best.char.object, ['God bless you!', 'Good afternoon o!', 'How body?', 'Praise the Lord!', 'Amen! Welcome.'][best.id % 5], { kind: 'npc', name: best.name });
        },
      });
      return;
    }
    // the big church billboards over the street
    const board = ray.intersectObject(s.world.root.getObjectByName('world:billboards') || s.world.root, true)[0];
    const poster = board && s.world.posterAt?.(board.object);
    if (poster) ui.poster(poster);
  });
}

/* ---------------------------------------------------------------- travelling */
/** The trip on the road (walking, okada, danfo, taxi or car); trips that are not walkable come back. */
async function journey(go) {
  const s = session;
  if (!s?.player) return;
  s.journey ||= createJourney(ctx, { world: s.world, kit: await kitPromise, createCharacter, randomAppearance });
  const back = s.player.position.clone();
  const heading = s.player.heading;
  s.travelling = true;
  quiet(false);
  audio.setZone('street'); // on the road: traffic, horns, okadas
  try {
    await s.journey.play({ mode: go.mode, ownBike: go.mode === 'bike' && !!game.state?.items?.bike, route: go.route }, s.character);
  } finally {
    s.travelling = false;
    if (!go.walk) { s.player.teleport(back, heading); s.camera.behind(heading); s.camera.snap?.(); }
    audio.setZone(s.world.zoneAt?.(s.player.position) ?? null);
  }
}

/** After a trip to a walkable place: put the player there, facing the way in. */
async function arrive(go) {
  const s = session;
  if (!s?.player) return;
  const sp = s.world.spawns.places?.[go.walk] || s.world.spawns.home;
  s.inside = null;
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
  if (screen !== 'game') quiet(true);
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
    quiet(false);
    finishBoot(0);
  } else {
    homeScene.hide();
    ctx.stop();
    finishBoot(600);
  }
}
/** The world's sounds and speech bubbles only while you are in it (not on the map or the front door). */
function quiet(on) {
  document.documentElement.classList.toggle('amen-quiet', on);
  const s = session;
  audio.setZone(on || !s?.player ? 'none' : s.world.zoneAt?.(s.player.position) ?? null);
}
ctx.bus.on('ui:map', ({ open }) => quiet(open));
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
