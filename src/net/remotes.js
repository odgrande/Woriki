// Remote players: one character per player, interpolated ~120 ms in the past,
// playing their animation state, with name tags and chat bubbles.
import * as THREE from 'three';
import { createCharacter, randomAppearance } from '../characters/index.js';
import { EMOTES } from '../../server/protocol.js';
import { createClockSync, createTrack, interpDelay, lerpAngle } from './interp.js';
import { createNameTags } from './nametags.js';
import { createStandIn } from './standin.js';

const LOCO = new Set(['idle', 'walk', 'walkFormal', 'jog', 'run']);
/** States character.setLocomotion() moves between by itself (walkFormal is not one of them). */
const CH_LOCO = new Set(['idle', 'walk', 'jog', 'run']);
const MAX_HIGH = { low: 6, medium: 8, high: 10 };

/** Deterministic RNG so a player without an appearance looks the same on every screen. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {any} ctx engine context
 * @param {{
 *   net: ReturnType<typeof import('./client.js').createNet>,
 *   kit?: any | Promise<any>,               // from loadCharacterKit; a promise is fine; null → stand-ins
 *   bubbles?: {show(o: THREE.Object3D, text: string, opts?: object): void} | null,
 *   root?: HTMLElement, parent?: THREE.Object3D, maxHigh?: number, hideDistance?: number,
 *   makeCharacter?: (appearance: any, detail: 'high'|'low') => any,   // adapter override
 *   autoUpdate?: boolean,
 * }} o
 */
export function createRemotes(ctx, { net, kit = null, bubbles = null, root, parent, maxHigh, hideDistance = 60, makeCharacter, autoUpdate = true }) {
  const scene = parent || ctx.scene;
  const camera = ctx.camera;
  const maxHi = maxHigh ?? MAX_HIGH[ctx.quality] ?? 8;
  const clock = createClockSync();
  const tags = createNameTags({
    camera, canvas: ctx.renderer?.domElement,
    root: root || document.getElementById('ui') || document.body,
    max: ctx.quality === 'low' ? 8 : 12,
  });
  /** @type {Map<string, any>} */
  const map = new Map();
  const queue = []; // remotes waiting for a (re)build
  const camPos = new THREE.Vector3();
  let kitRef = null;
  let kitState = kit ? 'loading' : 'none';
  let lastT = -1;
  let lastLocal = 0;
  let lodTimer = 0;
  let lastBuildAt = 0;

  Promise.resolve(kit).then((k) => { kitRef = k || null; kitState = k ? 'ready' : 'none'; }, (err) => {
    console.warn('[remotes] character kit failed, using stand-ins', err);
    kitState = 'none';
  });

  // The one place that builds a character. Integration swaps happen here.
  const build = makeCharacter || ((appearance, detail) => (kitRef ? createCharacter(kitRef, appearance, { detail }) : createStandIn(appearance)));

  const appearanceFor = (p) => (p.appearance && Object.keys(p.appearance).length >= 3
    ? p.appearance
    : { ...randomAppearance(seeded(`${p.name}|${p.role}`), p.role), ...p.appearance });

  function enqueue(r) { if (!queue.includes(r)) queue.push(r); }

  function add(p) {
    if (!p || p.id === net.id) return;
    const existing = map.get(p.id);
    if (existing) {
      existing.name = p.name;
      existing.role = p.role;
      tags.set(p.id, { name: p.name, role: p.role });
      const next = JSON.stringify(p.appearance || {});
      if (next !== existing.rawAppearance) {
        existing.rawAppearance = next;
        existing.appearance = appearanceFor(p);
        existing.rebuild = true;
        enqueue(existing);
      }
      return;
    }
    const holder = new THREE.Group();
    holder.name = `remote:${p.id}`;
    holder.visible = false;
    scene.add(holder);
    const r = {
      id: p.id, name: p.name, role: p.role, holder, object: holder,
      appearance: appearanceFor(p), rawAppearance: JSON.stringify(p.appearance || {}),
      character: null, detail: null, want: 'high', rebuild: false,
      track: createTrack(), initial: p.p ? { x: p.p[0], y: p.p[1], z: p.p[2], r: p.r || 0, a: p.a || 'idle' } : null,
      placed: false, tx: 0, tz: 0, speed: 0, anim: 'idle', emote: null, talkUntil: 0, dist: 0, acc: 0,
    };
    map.set(p.id, r);
    tags.add(p.id, holder, { name: p.name, role: p.role });
    tags.setEnabled(p.id, false);
    enqueue(r);
  }

  function remove(id) {
    const r = map.get(id);
    if (!r) return;
    r.character?.dispose();
    r.holder.removeFromParent();
    tags.remove(id);
    map.delete(id);
    const i = queue.indexOf(r);
    if (i >= 0) queue.splice(i, 1);
  }

  function buildOne(r) {
    let ch;
    try { ch = build(r.appearance, r.want); } catch (err) {
      console.warn('[remotes] createCharacter failed, using a stand-in', err);
      ch = createStandIn(r.appearance);
    }
    r.character?.dispose();
    r.character = ch;
    r.detail = r.want;
    r.rebuild = false;
    r.holder.add(ch.object);
    tags.setHeight(r.id, (ch.height || 1.75) + 0.3);
    tags.setEnabled(r.id, true);
  }

  /** Drive the character from the remote's animation state and measured speed. */
  function animate(r, a, nowS) {
    const ch = r.character;
    if (EMOTES.has(a)) {
      if (r.emote !== a) {
        r.emote = a;
        if (a === 'wave') ch.wave(2.2);
        else if (a === 'clap') ch.clap(3);
        else ch.raiseHands(3);
      }
      a = 'idle';
    } else r.emote = null;

    if (LOCO.has(a)) {
      if (r.speed < 0.2 && r.talkUntil > nowS) {
        if (ch.state !== 'talk') ch.play('talk', { fade: 0.3 });
        return;
      }
      if (a === 'walkFormal' && r.speed > 0.3 && r.speed < 2.2) {
        if (ch.state !== 'walkFormal') ch.play('walkFormal', { fade: 0.25 });
        return;
      }
      if (!CH_LOCO.has(ch.state)) ch.play('idle', { fade: 0.3 }); // leaving sit / talk / formal walk…
      ch.setLocomotion(r.speed);
    } else if (ch.state !== a) {
      // Sitting in a remote pew while chatting reads better as "sit and talk".
      const s = a === 'sit' && r.talkUntil > nowS ? 'sitTalk' : a;
      if (ch.state !== s) ch.play(s, { fade: 0.25 });
    }
  }

  function updateLod() {
    const list = [...map.values()].filter((r) => r.character || queue.includes(r));
    list.sort((a, b) => a.dist - b.dist);
    let hi = 0;
    for (const r of list) {
      const keep = r.detail === 'high' && r.dist < 24 && hi < maxHi;
      const want = keep || (hi < maxHi && r.dist < 20) ? 'high' : 'low';
      if (want === 'high') hi++;
      r.want = want;
      if (r.character && r.detail !== want && r.dist < hideDistance) enqueue(r);
    }
  }

  function update(dt, t) {
    if (t === lastT) return; // guard against being driven twice in one frame
    lastT = t;
    const local = performance.now();
    const nowS = local / 1000;
    // Positions follow wall-clock time (the engine clamps dt to 50 ms, which would
    // make remotes lag and over-estimate speed after a frame hitch).
    const wdt = Math.min(2, Math.max(1e-3, (local - (lastLocal || local - dt * 1000)) / 1000));
    lastLocal = local;
    camera.getWorldPosition(camPos);

    // Build at most one character per frame (each build costs a few ms on phones).
    if (queue.length && kitState !== 'loading' && local - lastBuildAt > 40) {
      queue.sort((a, b) => a.dist - b.dist);
      const r = queue.shift();
      if (r.character && !r.rebuild && r.detail === r.want) { /* nothing to do */ } else {
        if (!r.character) r.want = r.dist < 20 && [...map.values()].filter((o) => o.detail === 'high').length < maxHi ? 'high' : 'low';
        buildOne(r);
        lastBuildAt = performance.now();
      }
    }

    lodTimer -= dt;
    if (lodTimer <= 0) { lodTimer = 0.5; updateLod(); }

    const serverNow = clock.serverNow(local);
    const baseDelay = interpDelay(clock.jitter);
    for (const r of map.values()) {
      const pose = clock.ready ? r.track.sample(serverNow - r.track.delay(baseDelay)) : null;
      const target = pose || r.initial;
      if (!target) continue;
      const hp = r.holder.position;
      if (!r.placed) {
        hp.set(target.x, target.y, target.z);
        r.holder.rotation.y = target.r;
        r.placed = true;
        r.tx = target.x; r.tz = target.z;
      } else {
        const dx = target.x - hp.x, dy = target.y - hp.y, dz = target.z - hp.z;
        if (dx * dx + dy * dy + dz * dz > 9) {
          hp.set(target.x, target.y, target.z); // teleport: no smoothing, no speed spike
          r.holder.rotation.y = target.r;
          r.speed = 0;
        } else {
          const k = 1 - Math.exp(-wdt / 0.06);
          hp.x += dx * k; hp.y += dy * k; hp.z += dz * k;
          // Ground speed of the interpolated path (not of the smoothing), for the walk cycle.
          const inst = Math.hypot(target.x - r.tx, target.z - r.tz) / wdt;
          r.speed += (Math.min(inst, 12) - r.speed) * (1 - Math.exp(-wdt / 0.2));
          r.holder.rotation.y = lerpAngle(r.holder.rotation.y, target.r, 1 - Math.exp(-wdt / 0.08));
        }
        r.tx = target.x; r.tz = target.z;
      }
      r.dist = hp.distanceTo(camPos);
      r.anim = target.a;
      const vis = !!r.character && r.dist < hideDistance;
      r.holder.visible = vis;
      if (!vis) continue;
      animate(r, r.anim, nowS);
      if (r.dist > 25) {
        // Far characters animate at ~15 fps.
        r.acc += dt;
        if (r.acc >= 1 / 15) { r.character.update(r.acc); r.acc = 0; }
      } else r.character.update(dt);
    }
    tags.update();
  }

  // ---------------------------------------------------------------- net wiring
  const offs = [
    net.on('join', add),
    net.on('leave', ({ id }) => remove(id)),
    net.on('states', ({ ts, list }) => {
      clock.sample(ts, performance.now());
      for (const e of list) {
        const r = map.get(e[0]);
        if (r) r.track.push(ts - e[6], e[1], e[2], e[3], e[4], e[5]);
      }
    }),
    net.on('status', () => {
      // Server ↔ local switch changes the clock domain: restart interpolation from the current poses.
      clock.reset();
      for (const r of map.values()) {
        const p = r.holder.position;
        r.initial = { x: p.x, y: p.y, z: p.z, r: r.holder.rotation.y, a: r.anim };
        r.track.clear();
      }
    }),
    net.on('chat', (m) => {
      if (m.self) return;
      const r = map.get(m.id);
      if (!r) return;
      r.talkUntil = performance.now() / 1000 + Math.min(5, 1.5 + m.text.length * 0.05);
      r.lastBubble = m.text;
      if (bubbles) bubbles.show(r.holder, m.text, { kind: 'chat', seconds: Math.min(8, 3 + m.text.length * 0.06) });
      else tags.say(m.id, m.text, Math.min(8, 3 + m.text.length * 0.06));
    }),
  ];
  for (const p of net.players.values()) add(p);

  const offUpdate = autoUpdate && ctx.onUpdate ? ctx.onUpdate(update) : null;

  const remotes = {
    update,
    /** @returns {any[]} */
    get list() { return [...map.values()]; },
    get(id) { return map.get(id) || null; },
    get count() { return map.size; },
    tags,
    /** Read-only snapshot for tests / debugging. */
    debug() {
      return [...map.values()].map((r) => ({
        id: r.id, name: r.name, role: r.role, built: !!r.character, detail: r.detail, visible: r.holder.visible,
        x: +r.holder.position.x.toFixed(2), y: +r.holder.position.y.toFixed(2), z: +r.holder.position.z.toFixed(2),
        yaw: +r.holder.rotation.y.toFixed(2), anim: r.anim, state: r.character?.state ?? null, speed: +r.speed.toFixed(2),
        bubble: r.lastBubble ?? null,
      }));
    },
    dispose() {
      offs.forEach((off) => off());
      offUpdate?.();
      for (const id of [...map.keys()]) remove(id);
      tags.dispose();
    },
  };
  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.remotes = { get count() { return map.size; }, list: () => remotes.debug() };
  }
  return remotes;
}
