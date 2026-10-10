// The community: NPCs that make Grace Assembly and the Yaba street feel alive.
// Security at the gate, ushers at the hall door, vendors calling out, a danfo conductor,
// people walking and gisting, kids playing, and during services a congregation in the pews,
// a pastor preaching and the choir singing. See ARCHITECTURE.md → NPC community.
import * as THREE from 'three';
import { createCharacter, randomAppearance } from '../characters/index.js';
import * as L from './lines.js';

const WALK_ZONES = ['street', 'market', 'busstop', 'compound', 'carpark', 'gate'];
const COUNTS = { low: 16, medium: 30, high: 42 };
const MAX_HIGH = { low: 5, medium: 9, high: 13 };
const CONGREGATION = { low: 10, medium: 20, high: 30 };
const HIGH_IN = 16;
const HIGH_OUT = 20;
const HIDE = 46;
const tmp = new THREE.Vector3();

/** Small seeded RNG so the town looks the same for everyone in a room. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function turn(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

/**
 * @param {any} ctx engine context
 * @param {{world: any, physics?: any, kit: any, bubbles?: any, count?: number, seed?: number, player?: {position: THREE.Vector3}}} opts
 */
export function createCommunity(ctx, opts) {
  const { world, kit, bubbles } = opts;
  const physics = opts.physics || null;
  const quality = ctx.quality || 'medium';
  const rng = mulberry(opts.seed ?? 20261010);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const root = new THREE.Group();
  root.name = 'community';
  ctx.scene.add(root);

  /** @type {any[]} */
  const npcs = [];
  let player = opts.player || null;
  let service = null;
  let highCount = 0;
  let highQueue = 0;
  let lodTimer = 0;
  let brainIndex = 0;
  let greetGlobal = 0;
  let sermonTimer = 4;
  const offs = [];
  const maxHigh = MAX_HIGH[quality] ?? 9;

  const ground = (x, z) => (physics ? physics.groundHeight(x, z) : (world.groundAt ? world.groundAt(x, z) : 0));

  function say(npc, text, seconds) {
    if (!bubbles || !text) return;
    if (npc.dist > 26 || !npc.char.object.visible) return;
    bubbles.show(npc.char.object, text, { kind: 'npc', seconds, height: (npc.sitting ? 1.45 : 2.0) });
    ctx.bus?.emit('npc:say', { npc, text });
  }

  /* ---------------------------------------------------------------- creation */
  function makeNpc(kind, role, spot, extra = {}) {
    const appearance = extra.appearance || randomAppearance(rng, role);
    const low = createCharacter(kit, appearance, { detail: 'low' });
    root.add(low.object);
    const female = appearance.body === 'female';
    const npc = {
      id: npcs.length + 1,
      kind, role,
      name: extra.name || pick(female ? L.NAMES.female : L.NAMES.male),
      appearance,
      low, high: null, char: low,
      pos: spot.position.clone(),
      rotY: spot.rotY ?? 0,
      home: { position: spot.position.clone(), rotY: spot.rotY ?? 0 },
      path: [],
      speed: 1.05 + rng() * 0.35,
      moving: false,
      anim: extra.anim || 'idle',
      animOpts: {},
      sitting: false,
      seat: null,
      timer: rng() * 6,
      lineTimer: 4 + rng() * 10,
      greetCD: 0,
      lines: extra.lines || null,
      dist: 99,
      animAcc: 0,
      group: null,
      ...extra,
    };
    npc.pos.y = ground(npc.pos.x, npc.pos.z);
    applyAnim(npc, npc.char, 0);
    place(npc);
    npcs.push(npc);
    return npc;
  }

  function place(npc) {
    const o = npc.char.object;
    o.position.copy(npc.pos);
    o.rotation.y = npc.rotY;
  }

  function applyAnim(npc, char, fade = 0.25) {
    if (npc.moving) char.setLocomotion(npc.speed);
    else char.play(npc.anim, { fade, ...npc.animOpts });
  }

  function setAnim(npc, anim, o = {}) {
    npc.moving = false;
    npc.anim = anim;
    npc.animOpts = o;
    npc.char.play(anim, { fade: 0.3, ...o });
  }

  function walkTo(npc, target) {
    const path = world.nav?.path ? world.nav.path(npc.pos, target) : [target];
    if (!path || !path.length) return false;
    npc.path = path.map((p) => new THREE.Vector3(p.x, p.y ?? 0, p.z));
    npc.moving = true;
    npc.sitting = false;
    return true;
  }

  function sitOn(npc, seat) {
    if (npc.seat) npc.seat.taken = false;
    npc.seat = seat;
    seat.taken = true;
    const rot = seat.rotY || 0;
    const x = seat.position.x + Math.sin(rot) * 0.34;
    const z = seat.position.z + Math.cos(rot) * 0.34;
    const floor = ground(x, z);
    npc.pos.set(x, Math.max(seat.position.y - 0.555, Math.min(floor, seat.position.y - 0.3)), z);
    npc.rotY = rot;
    npc.path = [];
    npc.sitting = true;
    setAnim(npc, 'sit');
    place(npc);
  }

  function standUp(npc) {
    if (npc.seat) { npc.seat.taken = false; npc.seat = null; }
    npc.sitting = false;
    npc.pos.y = ground(npc.pos.x, npc.pos.z);
  }

  function despawn(npc) {
    if (npc.seat) npc.seat.taken = false;
    npc.low.dispose();
    root.remove(npc.low.object);
    if (npc.high) { npc.high.dispose(); root.remove(npc.high.object); highCount--; }
    const i = npcs.indexOf(npc);
    if (i >= 0) npcs.splice(i, 1);
  }

  /* ---------------------------------------------------------------- the cast */
  const sp = world.spawns?.byRole || {};
  const V = (x, z, rotY = 0) => ({ position: new THREE.Vector3(x, 0, z), rotY });
  const near = (s, dx, dz, rotY) => V(s.position.x + dx, s.position.z + dz, rotY ?? s.rotY);
  const interact = (id) => world.interactables?.find((i) => i.id === id);

  function populate() {
    const total = opts.count ?? COUNTS[quality] ?? 30;
    // Posts: people who stay where they work.
    if (sp.security) {
      makeNpc('post', 'security', sp.security, { anim: 'foldArms', lines: L.SECURITY, patrol: [sp.security.position.clone(), sp.security.position.clone().add(new THREE.Vector3(-5, 0, -1.5))] });
      makeNpc('post', 'security', near(sp.security, -14, -6, Math.PI / 2), { anim: 'foldArms', lines: L.SECURITY });
    }
    if (sp.usher) {
      makeNpc('post', 'usher', near(sp.usher, -1.2, 0.6, Math.PI), { anim: 'idle', lines: L.USHER });
      makeNpc('post', 'usher', near(sp.usher, 1.6, 0.6, Math.PI), { anim: 'idle', lines: L.USHER });
    }
    const vend = (id, lines, dx, dz) => {
      const it = interact(id);
      if (it) makeNpc('vendor', 'hospitality', V(it.position.x + dx, it.position.z + dz, Math.PI), { anim: 'idle', lines });
    };
    vend('buka', L.VENDOR.buka, 0, -1.4);
    vend('buy-water', L.VENDOR.water, 0, -1.2);
    vend('pos-kiosk', L.VENDOR.pos, 0, -1.2);
    vend('canteen', L.VENDOR.canteen, 0, -1.3);
    const danfo = interact('danfo');
    if (danfo) makeNpc('vendor', 'visitor', V(danfo.position.x + 1.6, danfo.position.z + 1.2, Math.PI / 2), { anim: 'talk', lines: L.CONDUCTOR, name: 'Conductor', lineTimer: 2 });
    // Choir rehearsing in the stand; they sing during services.
    const choirSpot = sp.choir;
    if (choirSpot) for (let i = 0; i < (quality === 'low' ? 3 : 5); i++) {
      makeNpc('choir', 'choir', near(choirSpot, (i % 3) * 0.9 - 0.9, -Math.floor(i / 3) * 0.9, 0), { anim: 'idle', lines: L.CHOIR });
    }
    // Kids at the children's church.
    if (sp.children) for (let i = 0; i < (quality === 'low' ? 2 : 4); i++) {
      const kid = makeNpc('kid', 'visitor', near(sp.children, rng() * 3 - 1.5, rng() * 3 - 1.5), { lines: L.KIDS, speed: 2.2 });
      kid.low.object.scale.setScalar(0.66);
      kid.scale = 0.66;
    }
    // Pastor: near the hall door between services, at the pulpit during them.
    if (sp.minister) makeNpc('pastor', 'minister', near(sp.usher || sp.minister, 3, -1.5, 0), { anim: 'talk', lines: L.GIST, name: 'Pastor Ade', appearance: randomAppearance(rng, 'minister') });

    // Gist groups: two or three people talking in a circle.
    const groupSpots = [[-20, 8.2], [6, -18.5], [-55, 8.2], [28, -18.5]];
    for (const [gx, gz] of groupSpots.slice(0, quality === 'low' ? 2 : 4)) {
      const n = 2 + (rng() < 0.5 ? 1 : 0);
      const group = { center: new THREE.Vector3(gx, 0, gz), speaker: 0, timer: 2 + rng() * 3 };
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.4;
        const pos = V(gx + Math.sin(a) * 0.8, gz + Math.cos(a) * 0.8, a + Math.PI);
        const m = makeNpc('group', pick(['worshipper', 'worshipper', 'visitor']), pos, { anim: i % 2 ? 'talk' : 'idle', group });
        m.group = group;
      }
    }
    // Everyone else walks around the neighbourhood.
    while (npcs.length < total) {
      const node = world.nav?.randomNode?.(pick(WALK_ZONES), rng);
      if (!node) break;
      const w = makeNpc('wander', pick(['worshipper', 'worshipper', 'visitor', 'hospitality']), { position: node.position, rotY: rng() * Math.PI * 2 }, { lines: L.GIST });
      w.timer = rng() * 4;
    }
  }

  /* ---------------------------------------------------------------- services */
  const congregants = [];
  function setService(kind) {
    if (kind === service) return;
    service = kind || null;
    const pastor = npcs.find((n) => n.kind === 'pastor');
    if (service) {
      // The pastor goes to the pulpit; the choir starts praising.
      if (pastor && sp.minister) { pastor.pos.copy(sp.minister.position); pastor.rotY = sp.minister.rotY; pastor.path = []; setAnim(pastor, 'talk'); place(pastor); }
      for (const c of npcs.filter((n) => n.kind === 'choir')) setAnim(c, 'dance');
      // The congregation fills the pews.
      const free = (world.seats || []).filter((s) => s.zone === 'church-hall' && !s.taken);
      free.sort((a, b) => b.position.z - a.position.z);
      const want = Math.min(free.length, CONGREGATION[quality] ?? 20);
      // Front rows first, with gaps like a real Sunday.
      const chosen = free.filter(() => rng() < 0.7).slice(-want);
      for (const seat of chosen) {
        const c = makeNpc('congregant', pick(['worshipper', 'worshipper', 'visitor']), { position: seat.position, rotY: seat.rotY }, { lines: L.CONGREGATION });
        sitOn(c, seat);
        congregants.push(c);
      }
      sermonTimer = 3;
    } else {
      if (pastor) { pastor.pos.copy(pastor.home.position); pastor.rotY = pastor.home.rotY; setAnim(pastor, 'talk'); place(pastor); }
      for (const c of npcs.filter((n) => n.kind === 'choir')) setAnim(c, 'idle');
      // Everyone stands up and heads out through the gate, then goes home.
      const out = sp.security ? sp.security.position : new THREE.Vector3(10, 0, -8);
      for (const c of congregants.splice(0)) {
        standUp(c);
        c.kind = 'leaving';
        if (!walkTo(c, out)) despawn(c);
      }
    }
  }

  /* ---------------------------------------------------------------- brains */
  function brain(npc, dt) {
    npc.timer -= dt;
    npc.lineTimer -= dt;
    npc.greetCD -= dt;
    switch (npc.kind) {
      case 'wander':
        if (!npc.moving && npc.timer <= 0) {
          const node = world.nav?.randomNode?.(pick(WALK_ZONES), rng);
          if (node && npc.pos.distanceTo(node.position) > 3 && walkTo(npc, node.position)) break;
          npc.timer = 2 + rng() * 6;
        }
        if (!npc.moving && npc.lineTimer <= 0 && rng() < 0.3) { say(npc, pick(L.GIST)); npc.lineTimer = 15 + rng() * 25; }
        break;
      case 'post':
        if (npc.patrol && !npc.moving && npc.timer <= 0) {
          npc.patrolI = (npc.patrolI || 0) + 1;
          walkTo(npc, npc.patrol[npc.patrolI % npc.patrol.length]);
          npc.timer = 12 + rng() * 12;
        }
        if (npc.lineTimer <= 0) { if (npc.dist < 12) say(npc, pick(npc.lines)); npc.lineTimer = 10 + rng() * 14; }
        break;
      case 'vendor':
        if (npc.lineTimer <= 0) { if (npc.dist < 18) say(npc, pick(npc.lines)); npc.lineTimer = 6 + rng() * 8; }
        break;
      case 'kid':
        if (!npc.moving && npc.timer <= 0) {
          const c = npc.home.position;
          const target = new THREE.Vector3(c.x + rng() * 5 - 2.5, 0, c.z + rng() * 5 - 2.5);
          npc.path = [target];
          npc.moving = true;
          npc.timer = 1 + rng() * 3;
          if (rng() < 0.25) setAnim(npc, 'dance');
        }
        if (npc.lineTimer <= 0) { say(npc, pick(npc.lines), 2.5); npc.lineTimer = 8 + rng() * 10; }
        break;
      case 'choir':
        if (service && npc.timer <= 0) {
          if (rng() < 0.5) npc.char.raiseHands(2 + rng() * 2);
          npc.timer = 3 + rng() * 4;
        }
        if (service && npc.lineTimer <= 0) { say(npc, pick(L.CHOIR), 4); npc.lineTimer = 10 + rng() * 10; }
        break;
      case 'pastor':
        if (!service && npc.lineTimer <= 0) { if (npc.dist < 12) say(npc, pick(L.GREET)); npc.lineTimer = 20 + rng() * 15; }
        break;
      case 'congregant':
        if (service && npc.timer <= 0) {
          if (rng() < 0.2) npc.char.raiseHands(2 + rng() * 2);
          npc.timer = 4 + rng() * 8;
        }
        break;
      case 'leaving':
        if (!npc.moving) despawn(npc);
        break;
      default: break;
    }
  }

  function updateGroups(dt) {
    const groups = new Set(npcs.filter((n) => n.group).map((n) => n.group));
    for (const g of groups) {
      g.timer -= dt;
      if (g.timer > 0) continue;
      const members = npcs.filter((n) => n.group === g);
      g.speaker = (g.speaker + 1) % members.length;
      members.forEach((m, i) => setAnim(m, i === g.speaker ? 'talk' : (rng() < 0.3 ? 'nod' : 'idle')));
      say(members[g.speaker], pick(rng() < 0.75 ? L.GIST : L.GREET));
      g.timer = 5 + rng() * 5;
    }
  }

  function updateSermon(dt) {
    if (!service) return;
    sermonTimer -= dt;
    if (sermonTimer > 0) return;
    const pastor = npcs.find((n) => n.kind === 'pastor');
    if (pastor) {
      say(pastor, pick(L.SERMON), 4.5);
      if (rng() < 0.4) pastor.char.raiseHands(2.5);
    }
    // A few voices answer.
    setTimeout(() => {
      const listeners = congregants.filter((c) => c.dist < 20);
      for (let i = 0; i < Math.min(2, listeners.length); i++) say(pick(listeners), pick(L.CONGREGATION), 2.2);
    }, 1600);
    sermonTimer = 7 + rng() * 5;
  }

  /* ---------------------------------------------------------------- the player */
  function greetPlayer(dt) {
    greetGlobal -= dt;
    if (!player || greetGlobal > 0) return;
    let best = null;
    for (const n of npcs) {
      if (n.greetCD > 0 || n.sitting || n.kind === 'leaving' || n.kind === 'kid') continue;
      const d = n.pos.distanceTo(player.position);
      if (d < 3 && (!best || d < best.d)) best = { n, d };
    }
    if (!best) return;
    const n = best.n;
    n.greetCD = 50;
    greetGlobal = 7;
    n.path = [];
    if (n.moving) { n.moving = false; setAnim(n, 'idle'); }
    n.faceUntil = ctx.time + 3;
    n.char.wave(1.4);
    say(n, pick(n.kind === 'post' || n.kind === 'vendor' ? (n.lines || L.GREET) : L.GREET), 3);
  }

  function onPlayerAction(e) {
    if (!player || e?.name !== 'wave') return;
    const close = npcs.filter((n) => !n.sitting && n.kind !== 'leaving' && n.pos.distanceTo(player.position) < 12)
      .sort((a, b) => a.pos.distanceTo(player.position) - b.pos.distanceTo(player.position)).slice(0, 2);
    close.forEach((n, i) => setTimeout(() => {
      n.faceUntil = ctx.time + 3;
      n.char.wave(1.8);
      say(n, pick(L.WAVE_BACK), 2.5);
    }, 300 + i * 500));
  }

  /* ---------------------------------------------------------------- motion + LOD */
  function move(npc, dt) {
    if (!npc.moving) return;
    const target = npc.path[0];
    if (!target) {
      npc.moving = false;
      setAnim(npc, npc.kind === 'kid' ? 'idle' : (npc.home && npc.kind === 'post' ? npc.anim : 'idle'));
      if (npc.kind === 'post') npc.rotY = npc.home.rotY;
      npc.timer = npc.kind === 'kid' ? 0.5 + rng() * 2 : 2 + rng() * 6;
      return;
    }
    tmp.set(target.x - npc.pos.x, 0, target.z - npc.pos.z);
    const d = tmp.length();
    if (d < 0.2) { npc.path.shift(); return; }
    tmp.multiplyScalar(1 / d);
    // Keep a little distance from other people and from the player.
    for (const o of npcs) {
      if (o === npc || o.dist > 30) continue;
      const dx = npc.pos.x - o.pos.x, dz = npc.pos.z - o.pos.z;
      const dd = dx * dx + dz * dz;
      if (dd > 0.0001 && dd < 0.5) { tmp.x += (dx / dd) * 0.08; tmp.z += (dz / dd) * 0.08; }
    }
    if (player) {
      const dx = npc.pos.x - player.position.x, dz = npc.pos.z - player.position.z;
      const dd = dx * dx + dz * dz;
      if (dd > 0.0001 && dd < 0.8) { tmp.x += (dx / dd) * 0.15; tmp.z += (dz / dd) * 0.15; }
    }
    tmp.normalize();
    const step = Math.min(d, npc.speed * dt);
    npc.pos.x += tmp.x * step;
    npc.pos.z += tmp.z * step;
    npc.pos.y = ground(npc.pos.x, npc.pos.z);
    npc.rotY = turn(npc.rotY, Math.atan2(tmp.x, tmp.z), dt * 6);
    npc.char.setLocomotion(npc.speed);
  }

  function updateLod(camPos) {
    for (const n of npcs) n.dist = n.pos.distanceTo(camPos);
    const ranked = npcs.filter((n) => n.dist < HIGH_OUT).sort((a, b) => a.dist - b.dist);
    const wantHigh = new Set(ranked.filter((n, i) => i < maxHigh && (n.dist < HIGH_IN || (n.high && n.char === n.high))).slice(0, maxHigh));
    for (const n of npcs) {
      const visible = n.dist < HIDE;
      if (wantHigh.has(n)) {
        if (!n.high && highQueue <= 0) {
          n.high = createCharacter(kit, n.appearance, { detail: 'high' });
          if (n.scale) n.high.object.scale.setScalar(n.scale);
          root.add(n.high.object);
          highCount++;
          highQueue = 0.25; // build at most ~4 per second to avoid hitches
        }
        if (n.high && n.char !== n.high) swap(n, n.high);
      } else if (n.char === n.high) {
        swap(n, n.low);
      }
      // Free memory for detailed characters that are far away.
      if (n.high && n.char !== n.high && n.dist > HIGH_OUT * 1.6) {
        n.high.dispose();
        root.remove(n.high.object);
        n.high = null;
        highCount--;
      }
      n.char.object.visible = visible;
    }
  }

  function swap(n, to) {
    const from = n.char;
    from.object.visible = false;
    n.char = to;
    to.object.visible = true;
    applyAnim(n, to, 0);
    place(n);
  }

  /* ---------------------------------------------------------------- loop */
  function update(dt, t) {
    highQueue -= dt;
    const cam = ctx.camera.position;
    lodTimer -= dt;
    if (lodTimer <= 0) { updateLod(cam); lodTimer = 0.4; }
    // Brains: a slice of the crowd each frame.
    const slice = Math.max(1, Math.ceil(npcs.length / 6));
    for (let i = 0; i < slice && npcs.length; i++) {
      brainIndex = (brainIndex + 1) % npcs.length;
      const n = npcs[brainIndex];
      brain(n, dt * 6);
    }
    updateGroups(dt);
    updateSermon(dt);
    greetPlayer(dt);
    for (const n of [...npcs]) {
      move(n, dt);
      if (n.faceUntil && player && ctx.time < n.faceUntil && !n.moving) n.rotY = turn(n.rotY, angleTo(n.pos, player.position), dt * 5);
      place(n);
      if (!n.char.object.visible) continue;
      // Far people animate at a lower rate.
      n.animAcc += dt;
      const every = n.dist > 25 ? 0.066 : 0;
      if (n.animAcc >= every) { n.char.update(n.animAcc); n.animAcc = 0; }
    }
  }

  populate();
  if (ctx.bus) {
    offs.push(ctx.bus.on('service:start', (e) => {
      const kind = e?.kind || 'service';
      // Workers' meetings (cleaning, choir practice) don't fill the pews; at practice the choir sings.
      if (kind === 'practice') { for (const c of npcs.filter((n) => n.kind === 'choir')) setAnim(c, 'dance'); return; }
      if (kind === 'cleaning') return;
      setService(kind);
    }));
    offs.push(ctx.bus.on('service:end', () => {
      if (!service) for (const c of npcs.filter((n) => n.kind === 'choir')) setAnim(c, 'idle');
      setService(null);
    }));
    offs.push(ctx.bus.on('player:action', onPlayerAction));
  }

  const community = {
    root,
    npcs,
    update,
    setService,
    get service() { return service; },
    /** The player's object (anything with a .position) for greetings and avoidance. */
    setPlayer(p) { player = p; },
    stats() {
      return { npcs: npcs.length, high: npcs.filter((n) => n.char === n.high).length, visible: npcs.filter((n) => n.char.object.visible).length, congregants: congregants.length, service };
    },
    dispose() {
      offs.forEach((off) => off());
      for (const n of [...npcs]) despawn(n);
      ctx.scene.remove(root);
    },
  };
  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.community = community;
  }
  return community;
}
