// Controls harness: input + follow camera + physics + player in a test yard
// (or the real map with ?world=1). Query params:
//   ?world=1      use src/world (Yaba street) instead of the yard
//   ?capsule=1    no character (stand-in capsule)
//   ?touch=1|0    force touch controls on/off
//   ?q=low|medium|high quality tier
//   ?o=outfit&b=body  character look
//   ?manual=1     no animation loop: tests drive __amen.step(n, dt) and __amen.render()
import * as THREE from 'three';
import { createContext } from '/src/engine/context.js';
import { createInput, KEY_BINDINGS } from '/src/engine/input.js';
import { createFollowCamera } from '/src/engine/camera.js';
import { createPhysics } from '/src/engine/physics.js';
import { createPlayer } from '/src/player/player.js';
import { buildYard } from './yard.js';

const q = new URLSearchParams(location.search);
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world'));
const ui = /** @type {HTMLElement} */ (document.getElementById('ui'));
const ctx = createContext(canvas, { quality: /** @type {any} */ (q.get('q')) || undefined });
const physics = createPhysics();

let world;
if (q.get('world') === '1') {
  const { buildWorld } = await import('/src/world/index.js');
  world = await buildWorld(ctx, physics);
  if (world.root && !world.root.parent) ctx.scene.add(world.root);
} else {
  world = buildYard(ctx, physics);
}

const input = createInput(ui, { touch: q.has('touch') ? q.get('touch') !== '0' : undefined, pressTTL: q.get('manual') === '1' ? 1e9 : undefined });
const camera = createFollowCamera(ctx, input);

let character = null;
if (q.get('capsule') !== '1') {
  try {
    const { loadCharacterKit, createCharacter } = await import('/src/characters/index.js');
    const kit = await loadCharacterKit(ctx);
    character = createCharacter(kit, {
      body: q.get('b') || 'male', skin: +(q.get('skin') ?? 3), hair: q.get('b') === 'female' ? 'buns' : 'buzzed',
      outfit: q.get('o') || 'senator', colors: { primary: '#1f3a5f', secondary: '#c9a227', pattern: 'plain' },
      headwear: q.get('hw') || 'none', shoes: '#2b1d14',
    });
  } catch (e) {
    console.warn('[controls] characters unavailable, using the stand-in capsule', e);
  }
}
const player = createPlayer(ctx, { world, physics, input, camera, character });

// ---------------------------------------------------------------- debug HUD
const events = { step: 0, moved: 0, zone: [], action: [], interact: [], nearby: [], toast: [], steps: [] };
const logLines = [];
const log = (s) => { logLines.unshift(s); logLines.length = Math.min(logLines.length, 6); };
ctx.bus.on('player:step', (e) => { events.step++; events.steps.push({ t: performance.now(), surface: e.surface, run: e.run }); if (events.steps.length > 200) events.steps.shift(); });
ctx.bus.on('player:moved', () => { events.moved++; });
ctx.bus.on('player:zone', (e) => { events.zone.push(e.zone.id); log(`zone → ${e.zone.id}`); });
ctx.bus.on('player:action', (e) => { events.action.push(e.name); log(`action: ${e.name}`); });
ctx.bus.on('player:interact', (e) => { events.interact.push(e.id); log(`interact: ${e.label}`); });
ctx.bus.on('player:nearby', (e) => { events.nearby.push(e.item?.id ?? null); });
const toastEl = document.createElement('div');
toastEl.className = 'toast';
toastEl.style.opacity = '0';
document.body.appendChild(toastEl);
let toastTimer = 0;
ctx.bus.on('game:toast', (e) => { events.toast.push(e.text); toastEl.textContent = e.text; toastEl.style.opacity = '1'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 1800); });

const dbg = document.createElement('div');
dbg.className = 'dbg';
dbg.innerHTML = `<h1>Controls <b>${q.get('world') === '1' ? 'world' : 'yard'}</b></h1><div class="body"><div class="rows"></div><div class="log"></div></div><button type="button">Hide</button>`;
document.body.appendChild(dbg);
const rowsEl = dbg.querySelector('.rows');
const logEl = dbg.querySelector('.log');
dbg.querySelector('button').addEventListener('click', () => {
  dbg.classList.toggle('is-min');
  dbg.querySelector('button').textContent = dbg.classList.contains('is-min') ? 'Show' : 'Hide';
});
if (input.touch) { dbg.classList.add('is-min'); dbg.querySelector('button').textContent = 'Show'; }

const help = document.createElement('div');
help.className = 'help';
help.hidden = input.touch;
help.innerHTML = `<h2>Controls</h2><table>${KEY_BINDINGS.map((b) => `<tr><td>${b.keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}${b.alt ? ` <small>${b.alt}</small>` : ''}</td><td>${b.action}</td></tr>`).join('')}</table>`;
document.body.appendChild(help);

let fps = 60, hudT = 0, lastNow = performance.now();
const info = ctx.renderer.info;
function frame(dt, t) {
  world.update?.(dt, t);
  player.update(dt, t);
  camera.update(dt, player.position, physics);
  if (input.consume('help')) help.hidden = !help.hidden;
  if (input.consume('escape')) help.hidden = true;
  input.consume('chat'); input.consume('endday');

  const now = performance.now();
  fps += (1000 / Math.max(now - lastNow, 1) - fps) * 0.05;
  lastNow = now;
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    const p = player.position;
    const rows = [
      ['state', `${player.state}${player.phase ? ` · ${player.phase}` : ''}`],
      ['anim', player.animState],
      ['speed', `${player.speed.toFixed(2)} m/s`],
      ['pos', `${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}`],
      ['ground', player.grounded ? 'yes' : 'air'],
      ['surface', world.surfaceAt?.(p.x, p.z) ?? '-'],
      ['zone', world.zoneAt?.(p)?.id ?? '-'],
      ['steps', String(events.step)],
      ['near', player.nearby?.label ?? '-'],
      ['cam', `${camera.currentDistance.toFixed(1)} m`],
      ['draws', `${info.render.calls} · ${(info.render.triangles / 1000).toFixed(0)}k tris`],
      ['fps', fps.toFixed(0)],
    ];
    rowsEl.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
    logEl.textContent = logLines.join('\n');
  }
}
let simT = 0;
const manual = q.get('manual') === '1';
if (manual) {
  // Deterministic stepping for tests (slow CI machines render at a few fps).
  window.__amen = Object.assign(window.__amen || {}, {
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { simT += dt; ctx.time = simT; frame(dt, simT); } },
    render() { ctx.renderer.render(ctx.scene, ctx.camera); return { calls: info.render.calls, triangles: info.render.triangles }; },
  });
  frame(0, 0);
  ctx.renderer.render(ctx.scene, ctx.camera);
} else {
  ctx.onUpdate(frame);
  ctx.start();
}

window.__amen = Object.assign(window.__amen || {}, { ctx, physics, input, camera, player, world, events, character, THREE });
window.__ready = true;
