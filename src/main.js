// Amen City entry point: wires every module together (see ARCHITECTURE.md).
//
// Start screen (role + look) → load the character kit and the Yaba map → spawn the player at
// their post → NPC community, sound, multiplayer, chat and the game rules run together.
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

const ui = createUI(ctx, { root: uiRoot, game, kit: kitPromise, audio, input, onStart: (profile) => enter(profile) });

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

    loading.set('Meeting the community', 0.85);
    await nextFrame();
    const community = createCommunity(ctx, { world, physics, kit, bubbles, player, seed: 20261010 });

    loading.set('Connecting', 0.95);
    const net = createNet({ room: params.get('room') || 'yaba', name: profile.name || game.state?.name || 'Guest', role, appearance });
    const remotes = createRemotes(ctx, { net, kit, bubbles });
    const chat = createChatUI(ctx, { net, root: uiRoot, input, roomLabel: 'Yaba' });
    const syncOnline = () => ui.setOnline?.(net.online || 1, net.mode);
    net.on('online', syncOnline);
    net.on('welcome', syncOnline);
    net.on('status', syncOnline);

    // Your own chat lines appear above your head too.
    ctx.bus.on('chat:message', (e) => { if (e?.self) bubbles.show(player.object, e.text, { kind: 'self' }); });

    Object.assign(session, { world, player, camera, community, net, remotes, chat, character });
    Object.assign(debug, { game, ui, input, physics, world, player, camera, community, net, remotes, chat, audio, bubbles, kit });

    input.enabled = true;
    input.setVisible?.(true);
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
  s.world.update?.(dt, t);
  s.player.update(dt, t);
  s.camera.update(dt, s.player.position, physics);
  s.community.update(dt, t);
  bubbles.update();
  ctx.camera.getWorldDirection(yawVec);
  audio.update(ctx.camera.position, Math.atan2(yawVec.x, yawVec.z));
  s.net.sendState({ position: s.player.position, rotY: s.player.heading, anim: s.player.animState, seat: s.player.seat ? 1 : 0 });
}

function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }

// Render only while playing; the start screen has its own small preview renderer.
ctx.bus.on('ui:screen', ({ screen }) => {
  if (screen === 'game') ctx.start();
  else ctx.stop();
});
