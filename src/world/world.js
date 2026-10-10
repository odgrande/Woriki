// buildWorld(ctx, physics): ONE continuous map — a street in Yaba, Lagos with the Grace Assembly
// compound, the player's home, a market row and a bus stop. See ARCHITECTURE.md (World).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextures, createLyricsScreen, createSkyTexture, tick } from './textures.js';
import { createMaterials } from './materials.js';
import { Batch, kit, instanced, mat } from './geo.js';
import * as K from './props.js';
import { buildStreet } from './street.js';
import { buildChurch } from './church.js';
import { buildMarket } from './market.js';
import { buildHome } from './home.js';
import { buildBeach, buildTheatre } from './districts.js';
import { createStreetBillboards } from './billboards.js';
import { createRoadRules } from './roadrules.js';
import { buildVehicles, createTraffic } from './vehicles.js';
import { ZONE_DEFS, groundAt, surfaceAt, pickZone, navNodes, HALL, ALTAR } from './layout.js';
import { buildEdges, createNav } from './nav.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const SUN = new THREE.Color('#fff1d6'), MOON = new THREE.Color('#8fa6ff'), DUSK = new THREE.Color('#ff9a52'), WHITE = new THREE.Color('#ffffff');
const NIGHT_SKY = new THREE.Color('#5b6cb0'), SKY_NIGHT = new THREE.Color('#1a2448'), DUSK_SKY = new THREE.Color('#ffb27a');
const FOG_DAY = new THREE.Color('#cfe2ee'), FOG_NIGHT = new THREE.Color('#141c33'), DUSK_FOG = new THREE.Color('#e7a77a');

/** 1 in daylight, 0 at night, smooth at dawn (5:45–7:00) and dusk (18:15–19:30). */
export function daylight(hour) {
  const s = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return s(5.75, 7.0, hour) * (1 - s(18.25, 19.5, hour));
}

/** Kinds of collider the follow camera should not pass through. */
export const CAMERA_BLOCKING = new Set(['wall', 'building', 'fence', 'gate', 'pillar', 'kiosk', 'ceiling', 'roof']);
/** Kinds that only exist for the camera (above head height: rooms' ceilings and roof spaces). */
const OVERHEAD = new Set(['ceiling', 'roof']);

/**
 * Register the builder's colliders with a physics world (see ARCHITECTURE.md → Collisions).
 * Nothing in the map is meant to be stood on (raised floors come from `groundAt`), so every
 * collider is non-walkable; only walls, fences, buildings, ceilings and roofs block the camera.
 * @param {{addBox:Function, addCylinder:Function}} physics
 * @param {any[]} colliders from createState().col
 */
export function registerColliders(physics, colliders) {
  for (const c of colliders) {
    const o = { kind: c.kind, camera: CAMERA_BLOCKING.has(c.kind), walkable: false };
    if (c.cyl) physics.addCylinder(V(c.x, 0, c.z), c.r, c.h, o);
    else physics.addBox(V(c.x0, c.y0, c.z0), V(c.x1, c.y1, c.z1), o);
  }
}

/**
 * Builder state shared by the area builders (pure data + geometry batches; no GPU work).
 * @param {Record<string, any>} P props-atlas regions @param {Record<string, any>} S signs-atlas regions
 */
export function createState(P, S, mats = {}, root = new THREE.Group(), kits = {}) {
  const colliders = [];
  const seats = [];
  const interactables = [];
  const instances = new Map();
  const lines = [];
  const fans = [];
  const doors = [];
  /** Factories of objects with their own materials and animation (() => {object, update?}), e.g. the sea. */
  const extras = [];
  return {
    b: new Batch(), P, S, mats, root, lines, fans, kits, seats, interactables, instances, doors, extras,
    col: colliders,
    collide(x0, y0, z0, x1, y1, z1, kind = 'wall') {
      colliders.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), kind });
    },
    cylinder(x, z, r, h, kind = 'post') { colliders.push({ cyl: true, x, z, r, h, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0: 0, y1: h, kind }); },
    inst(name, m, color) {
      if (!instances.has(name)) instances.set(name, { m: [], c: [] });
      const e = instances.get(name); e.m.push(m); e.c.push(color ?? null);
    },
    seat(x, y, z, rotY, kind, zone) { seats.push({ position: V(x, y, z), rotY, kind, zone, taken: false }); },
    interact(id, position, radius, label, action, extra = {}) { const it = { id, position, radius, label, action, ...extra }; interactables.push(it); return it; },
    dynamicDoor(id, leaf, label) { doors.push({ id, leaf, label }); },
  };
}

/** Run every area builder synchronously (used by tests). */
export function planWorld(P, S) {
  const W = createState(P, S);
  buildStreet(W); buildChurch(W); buildMarket(W); buildHome(W); buildVehicles(W); buildBeach(W); buildTheatre(W);
  return W;
}

/** Colliders that block walking between knee and head height (for nav). */
export function navBlockersOf(colliders) { return colliders.filter((c) => c.y0 < 1.5 && c.y1 > 0.15); }

/** Spawn points for the player and each role. */
export function makeSpawns() {
  const sp = (x, z, rotY) => ({ position: V(x, groundAt(x, z), z), rotY });
  return {
    player: sp(14.6, 16.6, Math.PI),
    /** In the living room of No. 14: every day starts at home. */
    home: sp(16.6, 23.8, Math.PI / 2),
    /** Where you arrive after travelling (keys of PLACES[].walk in src/game/life.js). */
    places: {
      home: sp(16.6, 23.8, Math.PI / 2),
      church: sp(9, -6.2, Math.PI),
      market: sp(-21.5, 9.6, 0),
      beach: sp(0, 592, 0),
      theatre: sp(600, 30, Math.PI),
    },
    byRole: {
      worshipper: sp(14.6, 16.6, Math.PI),
      visitor: sp(-53.2, 6.4, Math.PI),
      security: sp(14.4, -11.4, 0),
      usher: sp(17.2, -21.4, 0),
      choir: sp(26.2, -38.9, 0),
      media: sp(30.6, -23.1, Math.PI),
      hospitality: sp(44.6, -28.3, 0),
      children: sp(47.2, -15.4, -Math.PI / 2),
      prayer: sp(43, -36.6, Math.PI),
      minister: sp(19, -38.6, 0),
    },
  };
}

/**
 * @param {*} ctx engine context
 * @param {{addBox:Function, addCylinder:Function, setGround:Function, blockers?:THREE.Object3D[]}} physics
 */
export async function buildWorld(ctx, physics) {
  const t0 = performance.now();
  const progress = (stage, p) => ctx.bus.emit('world:progress', { stage, p });
  const T = await createTextures(ctx.quality, (p) => progress('textures', p * 0.7));
  const tTex = performance.now();
  const screen = createLyricsScreen(ctx.quality === 'low' ? 256 : 512);
  const mats = createMaterials(T, screen);
  const P = T.props.regions, S = T.signs.regions;
  const root = new THREE.Group();
  root.name = 'world';

  // ---------------------------------------------------------------- builder state
  const kits = {
    pole: K.pole(), chair: K.plasticChair(), kidsChair: K.kidsChair(), pew: K.pew(5.4), bench: K.bench(1.8), bench3: K.bench(3.0),
    tablePlastic: K.table(0.9, 0.7, 0.74, 'plastic', '#ffffff'), tablePlasticLow: K.table(0.6, 0.6, 0.5, 'plastic', '#ffffff'),
    palm0: K.palm(9.5, 3), palm1: K.palm(8, 5), palm2: K.palm(11, 9), mango: K.shadeTree(3.3, 4),
    hedge: K.hedge(4), hedgeShort: K.hedge(3), tankTall: K.waterTank(3.6), tankHome: K.waterTank(2.8), dish: K.dish(),
    generator: K.generator(P), umbrellaRY: K.umbrella('#d62828', '#f4d35e'), umbrellaGW: K.umbrella('#2a9d8f', '#f1faee'), umbrellaBW: K.umbrella('#1d4ed8', '#f8fafc'),
    danfo: K.danfo(P, S), keke: K.keke(P), okada: K.okada(P), car: K.car(P), speaker: K.paSpeaker(P),
    fanHub: K.fanHub(), tube: K.tubeLight(), ac: K.acUnit(P), acOut: K.acOutdoor(P), mat: K.prayerMat(), jerrycan: K.jerrycan(),
    pot: K.pot(0.24, 0.26), potBig: K.pot(0.36, 0.42),
    plate: kit((b) => b.cyl('plastic', 0, 0, 0, 0.13, 0.1, 0.03, 12, { color: '#f4f4f0' })),
  };
  const fanBladeKit = K.fanBlades();
  await tick();

  const W = createState(P, S, mats, root, kits);
  const { col: colliders, seats, interactables, instances, lines, fans, doors } = W;
  buildStreet(W); progress('street', 0.75); await tick();
  buildChurch(W); progress('church', 0.85); await tick();
  buildMarket(W);
  buildHome(W);
  buildVehicles(W);
  buildBeach(W);
  buildTheatre(W);
  progress('meshes', 0.9);
  await tick();

  // ---------------------------------------------------------------- merged static meshes
  const noCast = new Set(['ground', 'asphalt', 'pavers', 'carpet', 'tiles', 'ceiling', 'water', 'lamp', 'screen']);
  const merged = W.b.finish();
  let staticTris = 0;
  for (const [key, geo] of merged) {
    const mesh = new THREE.Mesh(geo, mats[key]);
    mesh.name = 'world:' + key;
    mesh.castShadow = !noCast.has(key);
    mesh.receiveShadow = key !== 'lamp' && key !== 'screen';
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    staticTris += geo.index.count / 3;
  }
  // ---------------------------------------------------------------- instanced props
  let instTris = 0;
  for (const [name, e] of instances) {
    const k = kits[name];
    if (!k) { console.warn('[world] missing kit', name); continue; }
    const hasColor = e.c.some((c) => c);
    const ims = instanced(k, mats, e.m, hasColor ? e.c : null, { name, cast: !name.startsWith('mat') && name !== 'tube' });
    for (const im of ims) { root.add(im); instTris += (im.geometry.index.count / 3) * im.count; }
  }
  // ceiling fan blades: animated instanced mesh
  const fanMeshes = instanced(fanBladeKit, mats, fans.map((p) => mat(p.x, p.y, p.z)), null, { name: 'fanBlades', cast: false });
  for (const im of fanMeshes) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; root.add(im); }
  // sky dome (follows the camera; drawn first, never fogged)
  const skyGeo = new THREE.SphereGeometry(320, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
  {
    const uv = skyGeo.attributes.uv, pos = skyGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setY(i, Math.max(0, pos.getY(i) / 320 + 0.03));
  }
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: createSkyTexture(ctx.quality === 'low' ? 256 : 512), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.name = 'world:sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);
  // wires
  const wireGeo = new THREE.BufferGeometry().setFromPoints(lines);
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: '#1b1b1b' }));
  wires.name = 'world:wires';
  root.add(wires);
  const extras = W.extras.map((make) => make());
  for (const e of extras) root.add(e.object);
  // Church billboards over the street (posts collide like poles).
  const billboards = createStreetBillboards(root, (x, z, r, h) => colliders.push({ cyl: true, x, z, r, h, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0: 0, y1: h, kind: 'post' }));

  // ---------------------------------------------------------------- dynamic doors and the bell
  const doorState = [];
  for (const d of doors) {
    const geo = kit((b) => b.add('props', d.leaf.geo)).get('props');
    const pivot = new THREE.Group();
    const { hingeAxis, hinge, c, sgn, inward, lw, y } = d.leaf;
    const mesh = new THREE.Mesh(geo, mats.props);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (hingeAxis === 'x') {
      pivot.position.set(hinge, y, c + inward * 0.06);
      mesh.position.set(sgn * lw / 2, 0, 0);
    } else {
      pivot.position.set(c + inward * 0.06, y, hinge);
      mesh.position.set(-sgn * lw / 2, 0, 0);
    }
    pivot.add(mesh);
    root.add(pivot);
    const closedAngle = hingeAxis === 'x' ? 0 : Math.PI / 2;
    const openAngle = hingeAxis === 'x' ? sgn * inward * Math.PI / 2 * 0.95 : Math.PI / 2 - sgn * inward * Math.PI / 2 * 0.95;
    const st = { id: d.id, pivot, open: true, angle: openAngle, closedAngle, openAngle };
    pivot.rotation.y = openAngle;
    doorState.push(st);
    const pos = hingeAxis === 'x' ? V(hinge + sgn * lw / 2, 0, c) : V(c, 0, hinge - sgn * lw / 2);
    pos.y = groundAt(pos.x, pos.z);
    W.interact(d.id, pos, 1.6, d.label, 'open-door', { door: d.id });
  }
  const bell = new THREE.Group();
  {
    const it = interactables.find((i) => i.action === 'ring-bell');
    bell.position.set(it.position.x, 3.12, it.position.z);
    const g = kit((b) => {
      b.add('paint', K.lathe([[0.02, 0], [0.08, -0.03], [0.14, -0.12], [0.18, -0.36], [0.3, -0.52], [0.31, -0.57], [0.01, -0.57]], 14), { color: '#b08d57' });
      b.box('metal', 0, -0.47, 0, 0.04, 0.2, 0.04, { color: '#555', uv: 'keep' });
    }).get('paint');
    const bm = new THREE.Mesh(g, mats.paint);
    bm.castShadow = true;
    bell.add(bm);
    root.add(bell);
  }
  const bellState = { swing: 0 };

  // ---------------------------------------------------------------- physics
  registerColliders(physics, colliders);
  physics.setGround(groundAt);
  // Invisible mesh blockers for cameras that raycast meshes: only the overhead volumes
  // (ceilings, roof spaces). Walls are already camera colliders in `physics`, and a small
  // mesh keeps the per-frame raycast cheap on phones.
  const blockGeos = colliders.filter((c) => !c.cyl && OVERHEAD.has(c.kind)).map((c) => {
    const g = new THREE.BoxGeometry(c.x1 - c.x0, c.y1 - c.y0, c.z1 - c.z0);
    g.translate((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    return g;
  });
  const blocker = new THREE.Mesh(mergeGeometries(blockGeos, false), new THREE.MeshBasicMaterial({ visible: false }));
  blocker.name = 'world:camera-blockers';
  blocker.visible = false;
  blocker.updateMatrixWorld(true);
  if (Array.isArray(physics.blockers)) physics.blockers.push(blocker);

  // ---------------------------------------------------------------- zones, nav, spawns
  const zones = ZONE_DEFS.map((z) => ({ id: z.id, label: z.label, ambience: z.ambience, box: new THREE.Box3(V(...z.min), V(...z.max)) }));
  const zoneAt = (p) => pickZone(zones, p);
  const navBlockers = navBlockersOf(colliders);
  const nodes = navNodes().map(([x, z, zone], id) => ({ id, position: V(x, groundAt(x, z), z), zone }));
  const edges = buildEdges(nodes, navBlockers, 7.5, 0.3);
  const nav = createNav(nodes, edges, { blockers: navBlockers, vec: (x, y, z) => V(x, groundAt(x, z), z) });

  const spawns = makeSpawns();

  // ---------------------------------------------------------------- traffic + per-frame updates
  const traffic = createTraffic(W, kits, mats, ctx.bus);
  // zebra crossing with traffic lights, the pedestrian bridge and the kerb barrier
  const roadRules = createRoadRules(ctx, { root, physics, interactables });
  const fanM = new THREE.Matrix4();
  let slide = 0, slideTimer = 0, inService = false;
  const offs = [
    ctx.bus.on('player:interact', (item) => {
      if (!item) return;
      if (item.action === 'open-door') {
        const d = doorState.find((s) => s.id === item.door);
        if (d) { d.open = !d.open; ctx.bus.emit('audio:play', { name: 'door', position: item.position.clone() }); }
      } else if (item.action === 'ring-bell') {
        bellState.swing = 1;
        ctx.bus.emit('audio:play', { name: 'bell', position: bell.position.clone() });
      }
    }),
    ctx.bus.on('service:start', () => { inService = true; slide = 1; slideTimer = 0; screen.show(slide); }),
    ctx.bus.on('service:end', () => { inService = false; slide = 0; screen.show(0); }),
  ];

  let lastHour = -1;
  const sceneryUpdates = [];
  const world = {
    root, spawns, seats, nav, zones, interactables, roadRules,
    vehicles: traffic.list,
    surfaceAt, zoneAt,
    groundAt,
    colliders,
    /**
     * Build extra scenery on demand (journey roads, the inside of places) with the same
     * builders, materials and kits as the street: `fn(W)` fills a fresh builder state. Its
     * colliders go into physics, its seats / interactables / zones join the world's, and the
     * meshes come back as one group (added to the world, frustum-culled as a unit).
     * @param {(W: ReturnType<typeof createState>) => ({zones?: {id: string, label: string, ambience: string, min: number[], max: number[]}[]}|void)} fn
     */
    scenery(fn, name = 'scenery') {
      const group = new THREE.Group();
      group.name = 'world:' + name;
      const S2 = createState(P, S, mats, group, kits);
      const out = fn(S2) || {};
      for (const [key, geo] of S2.b.finish()) {
        const mesh = new THREE.Mesh(geo, mats[key]);
        mesh.name = `${name}:${key}`;
        mesh.castShadow = !noCast.has(key);
        mesh.receiveShadow = key !== 'lamp' && key !== 'screen';
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      for (const [kname, e] of S2.instances) {
        const k = kits[kname];
        if (!k) continue;
        const hasColor = e.c.some((c) => c);
        for (const im of instanced(k, mats, e.m, hasColor ? e.c : null, { name: kname, cast: kname !== 'tube' })) group.add(im);
      }
      if (S2.lines.length) group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(S2.lines), wires.material));
      for (const make of S2.extras) { const e = make(); group.add(e.object); if (e.update) sceneryUpdates.push(e); }
      registerColliders(physics, S2.col);
      seats.push(...S2.seats);
      interactables.push(...S2.interactables);
      for (const z of out.zones || []) zones.push({ id: z.id, label: z.label, ambience: z.ambience, box: new THREE.Box3(V(...z.min), V(...z.max)) });
      root.add(group);
      return { group, state: S2, ...out };
    },
    /**
     * A vehicle model (danfo, car, keke, okada) as its own group, e.g. for the journey scenes.
     * @param {'danfo'|'car'|'keke'|'okada'} kind @param {string} [color] body colour (cars)
     */
    vehicleMesh(kind, color) {
      const g = new THREE.Group();
      for (const [key, geo] of kits[kind] || []) {
        const m = new THREE.Mesh(geo, mats[key]);
        m.castShadow = true; m.receiveShadow = true;
        if (color && key === 'paint') {
          const c = new THREE.Color(color);
          const g2 = geo.clone();
          const a = g2.attributes.color;
          if (a) for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b);
          m.geometry = g2;
        }
        g.add(m);
      }
      g.name = `vehicle:${kind}`;
      return g;
    },
    /**
     * Light the street for the hour in Lagos (0–24): bright midday sun, orange dusk, moonlit night
     * with the lamps glowing, grey dawn.
     */
    setTime(hour) {
      if (Math.abs(hour - lastHour) < 0.02) return;
      lastHour = hour;
      const day = daylight(hour);
      const dusk = Math.max(0, 1 - Math.abs(hour - 18.7) / 1.1) + Math.max(0, 1 - Math.abs(hour - 6.3) / 0.9);
      const glow = Math.min(1, dusk);
      ctx.sun.intensity = 0.35 + day * 2.05;
      ctx.sun.color.copy(MOON).lerp(SUN, day).lerp(DUSK, glow * 0.65);
      ctx.hemi.intensity = 0.38 + day * 0.72;
      ctx.hemi.color.copy(NIGHT_SKY).lerp(WHITE, day);
      ctx.scene.environmentIntensity = 0.12 + day * 0.33;
      // the sun's path: east in the morning, overhead at noon, west in the evening; the moon high at night
      const a = ((hour - 6) / 12) * Math.PI;
      if (day > 0.05) ctx.sunOffset.set(Math.cos(a) * -38, 18 + Math.max(0, Math.sin(a)) * 40, 20);
      else ctx.sunOffset.set(-20, 55, -15);
      sky.material.color.copy(SKY_NIGHT).lerp(WHITE, day).lerp(DUSK_SKY, glow * 0.5 * (1 - day * 0.5));
      ctx.scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, day).lerp(DUSK_FOG, glow * 0.4);
      if (ctx.scene.background?.isColor) ctx.scene.background.copy(ctx.scene.fog.color);
      ctx.renderer.toneMappingExposure = 0.9 + day * 0.1;
      billboards.setNight(1 - day);
    },
    /** Players' booked church adverts on the street billboard. */
    setAds(ads) { billboards.setAds(ads); },
    /** The poster of a clicked street billboard, or null. */
    posterAt: (o) => billboards.posterAt(o),
    get night() { return lastHour >= 0 && daylight(lastHour) < 0.3; },
    /** Show a lyrics slide on the projector screens (0 = welcome). */
    setLyrics(i) { slide = i; screen.show(i); },
    stats: { staticTris, instTris, textureMs: Math.round(tTex - t0), textureTimings: T.timings, buildMs: 0, seats: seats.length, navNodes: nodes.length, navEdges: edges.length, colliders: colliders.length },
    update(dt, t) {
      sky.position.copy(ctx.camera.position);
      // ceiling fans
      const a = t * 9;
      for (const im of fanMeshes) {
        fans.forEach((p, i) => { fanM.makeRotationY(a + i * 0.7).setPosition(p); im.setMatrixAt(i, fanM); });
        im.instanceMatrix.needsUpdate = true;
      }
      roadRules.update(dt);
      traffic.update(dt, roadRules);
      for (const e of extras) e.update?.(dt, t);
      for (const e of sceneryUpdates) e.update?.(dt, t);
      for (const d of doorState) {
        const target = d.open ? d.openAngle : d.closedAngle;
        d.angle += (target - d.angle) * Math.min(1, dt * 6);
        d.pivot.rotation.y = d.angle;
      }
      if (bellState.swing > 0.001) {
        bellState.swing *= Math.pow(0.35, dt);
        bell.rotation.z = Math.sin(t * 7) * 0.5 * bellState.swing;
      }
      if (inService) {
        slideTimer += dt;
        if (slideTimer > 9) { slideTimer = 0; slide = slide % (screen.count - 1) + 1; screen.show(slide); }
      }
    },
    dispose() {
      offs.forEach((off) => off());
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of Object.values(mats)) { m.map?.dispose(); m.normalMap?.dispose(); m.dispose(); }
      ctx.scene.remove(root);
    },
  };
  world.stats.buildMs = Math.round(performance.now() - t0);
  progress('done', 1);
  ctx.scene.add(root);
  try {
    window.__amen = window.__amen || {};
    window.__amen.world = { stats: world.stats, zones: zones.map((z) => z.id), interactables: interactables.map((i) => i.id) };
  } catch { /* not in a browser */ }
  return world;
}
