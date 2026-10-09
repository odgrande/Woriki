// Net harness: a small compound plaza, a keyboard-driven local player, remote players,
// name tags and the chat UI against the real server (default ws://<host>:8790/ws).
// Query: name, role, room (test), server, auto (circle|line), x, z, yaw, cam, bots (N headless
// players walking about), botchat (1), standin (1 → stand-in meshes), quality, autochat.
import * as THREE from 'three';
import { createContext } from '/src/engine/context.js';
import { createNet } from '/src/net/client.js';
import { createRemotes } from '/src/net/remotes.js';
import { createNameTags } from '/src/net/nametags.js';
import { createStandIn } from '/src/net/standin.js';
import { createChatUI } from '/src/ui/chat.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : d);
const name = q.get('name') || 'Ada';
const role = q.get('role') || 'choir';
const room = q.get('room') || 'test';
const server = q.get('server') || `ws://${location.hostname}:8790/ws`;
const useStandIn = q.get('standin') === '1';

const ctx = createContext(document.getElementById('world'), { quality: q.get('quality') || 'medium' });
const ui = document.getElementById('ui');

// --------------------------------------------------------------------------- scene
function paverTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6f6a63';
  g.fillRect(0, 0, 512, 512);
  // Interlocking pavers, the standard Lagos church-compound floor.
  const tones = ['#a39a8e', '#9b9184', '#ada497', '#958b7e', '#a8846c', '#9c7a63'];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const ox = x * 64 + (y % 2) * 32;
      for (const dx of [0, -512]) {
        g.fillStyle = tones[(x * 7 + y * 3) % tones.length];
        g.beginPath();
        g.roundRect(ox + dx + 2, y * 64 + 2, 60, 60, 6);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.fillRect(ox + dx + 6, y * 64 + 6, 50, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = 4;
  return tex;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshStandardMaterial({ map: paverTexture(), roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ctx.scene.add(ground);
const lawn = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#6b8e3a', roughness: 1 }));
lawn.rotation.x = -Math.PI / 2;
lawn.position.y = -0.02;
ctx.scene.add(lawn);
// Compound wall: cream paint with a blue band, typical of Lagos churches.
const wallMat = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.9 });
const bandMat = new THREE.MeshStandardMaterial({ color: '#2b5aa6', roughness: 0.8 });
for (const [x, z, w, d] of [[0, -24, 48, 0.3], [0, 24, 48, 0.3], [-24, 0, 0.3, 48], [24, 0, 0.3, 48]]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), wallMat);
  wall.position.set(x, 1.1, z);
  wall.castShadow = wall.receiveShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.25, d + 0.02), bandMat);
  band.position.set(x, 1.9, z);
  ctx.scene.add(wall, band);
}
const pillarGeo = new THREE.CylinderGeometry(0.22, 0.25, 3.2, 16);
for (const [x, z] of [[-6, -10], [6, -10], [-6, 10], [6, 10]]) {
  const p = new THREE.Mesh(pillarGeo, wallMat);
  p.position.set(x, 1.6, z);
  p.castShadow = true;
  ctx.scene.add(p);
}

// --------------------------------------------------------------------------- characters
let kit = null;
let kitPromise = null;
let randomAppearance = null;
if (!useStandIn) {
  kitPromise = import('/src/characters/index.js').then(async (m) => {
    randomAppearance = m.randomAppearance;
    kit = await m.loadCharacterKit(ctx);
    return { kit, createCharacter: m.createCharacter };
  }).catch((err) => { console.warn('[harness] characters unavailable, stand-ins', err); return null; });
}
const charMod = kitPromise ? await kitPromise : null;
// Tiny adapter: the only line to change when integrating a different character factory.
const makeCharacter = (appearance, detail) => (charMod ? charMod.createCharacter(charMod.kit, appearance, { detail }) : createStandIn(appearance));

function seededRng(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const appearanceFor = (n, r) => (randomAppearance ? randomAppearance(seededRng(n), r) : { skin: 3, colors: { primary: '#7f1d1d', secondary: '#1f2937' } });

// --------------------------------------------------------------------------- local player
const myLook = appearanceFor(name, role);
const me = makeCharacter(myLook, 'high');
ctx.scene.add(me.object);
const pos = new THREE.Vector3(num('x', 0), 0, num('z', 0));
let yaw = num('yaw', 0);
let camYaw = num('cam', yaw);
me.object.position.copy(pos);
me.object.rotation.y = yaw;

const net = createNet({ url: server, room, name, role, appearance: myLook, connectTimeoutMs: num('timeout', 3000) });
const remotes = (() => {
  // Register the player/camera update first so remotes project tags after the camera moved.
  ctx.onUpdate(updatePlayer);
  return createRemotes(ctx, { net, makeCharacter, root: ui, bubbles: null });
})();
const selfTags = createNameTags({ camera: ctx.camera, root: ui, canvas: ctx.renderer.domElement, max: 1 });
selfTags.add('self', me.object, { name, role, self: true, height: (me.height || 1.75) + 0.3 });
const chat = createChatUI(ctx, { net, root: ui });
ctx.bus.on('chat:message', (m) => { if (m.self) selfTags.say('self', m.text, Math.min(8, 3 + m.text.length * 0.06)); });
net.on('welcome', (w) => { if (w.mode === 'ws') selfTags.set('self', { name: net.name }); });

// Keyboard + simple drag-to-orbit.
const keys = new Set();
let emote = null;
let emoteUntil = 0;
let sitting = false;
const typing = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
addEventListener('keydown', (e) => {
  if (typing(e.target) || chat.isOpen) return;
  keys.add(e.code);
  const t = performance.now() / 1000;
  if (e.code === 'KeyE') { emote = 'wave'; emoteUntil = t + 2.2; me.wave(2.2); }
  if (e.code === 'KeyG') { emote = 'clap'; emoteUntil = t + 3; me.clap(3); }
  if (e.code === 'KeyH') { emote = 'praise'; emoteUntil = t + 3; me.raiseHands(3); }
  if (e.code === 'KeyC') { sitting = !sitting; me.play(sitting ? 'sit' : 'idle'); }
  if (e.code === 'KeyB') { emote = emote === 'dance' ? null : 'dance'; emoteUntil = Infinity; me.play(emote ? 'dance' : 'idle'); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let drag = null;
ctx.renderer.domElement.addEventListener('pointerdown', (e) => { drag = e.clientX; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => { if (drag !== null) { camYaw -= (e.clientX - drag) * 0.006; drag = e.clientX; } });

const auto = q.get('auto');
const autoR = num('r', 3);
const autoC = new THREE.Vector3(num('cx', 0), 0, num('cz', 0));
let autoA = 0;
const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function updatePlayer(dt, t) {
  const before = tmp.copy(pos);
  let speed = 0;
  if (auto === 'circle' || auto === 'line') {
    // Wall-clock driven so a slow device (or a software-GL test browser) still walks at 1.6 m/s.
    const wall = performance.now() / 1000;
    const step = Math.min(0.5, wall - (updatePlayer.wall ?? wall));
    updatePlayer.wall = wall;
    const v = keys.has('ShiftLeft') ? 4.5 : 1.6;
    if (auto === 'circle') {
      autoA += (v / autoR) * step;
      pos.set(autoC.x + Math.sin(autoA) * autoR, 0, autoC.z + Math.cos(autoA) * autoR);
    } else {
      autoA += step;
      pos.set(autoC.x + Math.sin(autoA * 0.4) * autoR * 2, 0, autoC.z);
    }
  } else if (!sitting) {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (f || s) {
      const v = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4.5 : 1.6;
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const dx = fx * f - fz * s, dz = fz * f + fx * s;
      const l = Math.hypot(dx, dz);
      pos.x = THREE.MathUtils.clamp(pos.x + (dx / l) * v * dt, -23, 23);
      pos.z = THREE.MathUtils.clamp(pos.z + (dz / l) * v * dt, -23, 23);
    }
  }
  const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
  speed = auto ? (keys.has('ShiftLeft') ? 4.5 : 1.6) : moved / Math.max(dt, 1e-3);
  if (moved > 1e-4) {
    const target = Math.atan2(pos.x - before.x, pos.z - before.z);
    let d = target - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += d * Math.min(1, dt * 12);
    if (emote === 'dance') { emote = null; }
  }
  if (emote && t * 1 > 0 && performance.now() / 1000 > emoteUntil) emote = null;
  me.object.position.copy(pos);
  me.object.rotation.y = yaw;
  if (!sitting && emote !== 'dance') me.setLocomotion(speed);
  me.update(dt);
  const anim = sitting ? 'sit' : emote || (speed > 3 ? 'run' : speed > 0.1 ? 'walk' : 'idle');
  net.sendState({ p: [pos.x, pos.y, pos.z], r: yaw, a: anim });

  // Third-person camera behind camYaw.
  const dist = num('dist', 5.2);
  camTarget.set(pos.x, 1.35, pos.z);
  ctx.camera.position.set(pos.x - Math.sin(camYaw) * dist, 2.6, pos.z - Math.cos(camYaw) * dist);
  ctx.camera.lookAt(camTarget);
  ctx.setShadowFocus(pos);
  selfTags.update();
  info();
}

// --------------------------------------------------------------------------- bots (headless extra players)
const BOT_NAMES = ['Chidi', 'Funke', 'Emeka', 'Ngozi', 'Tunde', 'Aisha', 'Segun', 'Bisi', 'Ifeanyi', 'Kemi', 'Musa', 'Yemi', 'Tobi', 'Amaka', 'Dayo', 'Halima'];
const BOT_ROLES = ['worshipper', 'usher', 'security', 'choir', 'media', 'hospitality', 'prayer', 'visitor', 'minister', 'children'];
const BOT_LINES = ['Good morning sir!', 'How body?', 'God dey!', 'Amen!', 'Service don start?', 'Welcome, sister!', 'Praise the Lord 🙌', 'See you on Sunday'];
const bots = [];
for (let i = 0; i < num('bots', 0); i++) {
  const bn = BOT_NAMES[i % BOT_NAMES.length];
  const br = BOT_ROLES[i % BOT_ROLES.length];
  const b = createNet({ url: server, room, name: bn, role: br, appearance: appearanceFor(bn, br), fallback: false });
  const ang = (i / Math.max(1, num('bots', 0))) * Math.PI * 2;
  bots.push({ net: b, a: ang, r: 4 + (i % 4) * 2.2, v: (i % 3 === 0 ? 0 : 1.1 + (i % 2) * 0.5) * (i % 2 ? 1 : -1), cx: 0, cz: 0 });
}
if (bots.length) {
  let last = performance.now();
  setInterval(() => {
    const nowMs = performance.now();
    const dt = (nowMs - last) / 1000;
    last = nowMs;
    for (const b of bots) {
      b.a += (b.v / b.r) * dt;
      const x = b.cx + Math.sin(b.a) * b.r, z = b.cz + Math.cos(b.a) * b.r;
      const yawB = b.v === 0 ? Math.atan2(-x, -z) : b.a + (b.v > 0 ? Math.PI / 2 : -Math.PI / 2);
      b.net.sendState({ p: [x, 0, z], r: yawB, a: b.v === 0 ? 'talk' : 'walk' });
    }
  }, 100);
  if (q.get('botchat') === '1') {
    let k = 0;
    setInterval(() => { const b = bots[k++ % bots.length]; b.net.sendChat(BOT_LINES[k % BOT_LINES.length]); }, 2500);
  }
}

// --------------------------------------------------------------------------- dev card + debug hooks
const card = document.createElement('div');
card.className = 'dev-card';
card.innerHTML = '<h1>Net harness</h1><div class="st"></div><div class="help"><kbd>WASD</kbd> move · <kbd>Shift</kbd> run · <kbd>E</kbd> wave · <kbd>G</kbd> clap · <kbd>C</kbd> sit · <kbd>B</kbd> dance · <kbd>Enter</kbd> chat · drag to look</div>';
ui.appendChild(card);
const st = card.querySelector('.st');
let infoAt = 0;
const stats = { calls: 0, triangles: 0 };
function info() {
  const r = ctx.renderer.info.render;
  stats.calls = r.calls;
  stats.triangles = r.triangles;
  const nowMs = performance.now();
  if (nowMs - infoAt < 500) return;
  infoAt = nowMs;
  st.innerHTML = `<span class="k">mode</span> ${net.mode} · <span class="k">id</span> ${net.id ?? '–'} · <span class="k">online</span> ${net.online}<br>`
    + `<span class="k">remotes</span> ${remotes.count} · <span class="k">calls</span> ${r.calls} · <span class="k">tris</span> ${(r.triangles / 1000).toFixed(1)}k`;
}

window.__amen = Object.assign(window.__amen || {}, {
  ctx, net, chat, remotes: window.__amen?.remotes, bots,
  player: { get x() { return pos.x; }, get z() { return pos.z; }, get yaw() { return yaw; } },
  stats,
  harness: { ready: true, characters: !!charMod },
});
if (q.get('autochat')) setTimeout(() => net.sendChat(q.get('autochat')), 1500);
ctx.start();
