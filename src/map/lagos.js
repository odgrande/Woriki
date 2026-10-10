// The Lagos map: a miniature 3D Lagos you can pan, zoom and turn, like looking down from a
// helicopter. The lagoon and the Atlantic, Third Mainland Bridge and the other bridges, the
// Government House on the Marina, the National Theatre, towers on the islands, thousands of
// tin roofs, billboards, go-slow traffic and boats. Lit by the real time of day in Lagos.
//
// createLagosMap(ctx, {root, onPick}) → map. It renders into the shared renderer while open
// (ctx.setView) and puts HTML pins for the places into `root`.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAND, BEACHES, BRIDGES, ROADS, AREAS, TOWERS, BILLBOARDS, BOUNDS, AREA_INFO, ROUTE_INFO, housePlots, landAt, distToPolyline, rng32 } from './geography.js';
import { PLACES, PLACE_BY_ID } from '../game/life.js';
import { defaultPosters, drawPoster } from './posters.js';
import { paintGround, paintWater, cloudTexture, worldUV } from './paint.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const LAND_Y = 0.5;

/** Lagos hour now (WAT, UTC+1) as a fraction 0..24. */
export function lagosHour(now = Date.now()) {
  return (((now / 3600_000) + 1) % 24 + 24) % 24;
}

/** 1 at midday, 0 at night, smooth at dawn (6–7) and dusk (18–19). */
export function daylight(hour) {
  const s = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return s(5.6, 7.2, hour) * (1 - s(18.2, 19.6, hour));
}

/**
 * @param {object} ctx engine context (renderer, quality, setView)
 * @param {{root: HTMLElement, onPick?: (place: object) => void}} opts
 */
export function createLagosMap(ctx, opts) {
  const quality = ctx.quality || 'medium';
  const scene = new THREE.Scene();
  scene.name = 'lagos-map';
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 1400);
  const rand = rng32(1861);
  const anim = [];

  /* ---------------------------------------------------------------- sky and light */
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog('#cfe3ee', 260, 760);
  const hemi = new THREE.HemisphereLight('#ffffff', '#6b6248', 1.2);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.3);
  sun.position.set(-120, 220, 90);
  const shadows = quality === 'high';
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 130, bottom: -130, near: 10, far: 600 });
    sun.shadow.bias = -0.0006;
  }
  scene.add(hemi, sun, sun.target);

  /* ---------------------------------------------------------------- water */
  const waterTex = rippleTexture(128);
  waterTex.repeat.set(90, 90);
  const waterGeo = worldUV(new THREE.PlaneGeometry(1600, 1600, 1, 1).rotateX(-Math.PI / 2));
  const water = new THREE.Mesh(waterGeo,
    new THREE.MeshStandardMaterial({ map: paintWater(), roughness: 0.18, metalness: 0.08, normalMap: waterTex, normalScale: new THREE.Vector2(0.5, 0.5) }));
  water.receiveShadow = shadows;
  water.userData.pick = { type: 'water' };
  scene.add(water);
  // the normal map tiles on its own UVs: give the water a second set in metres
  {
    const p = waterGeo.attributes.position, uv2 = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv2[i * 2] = p.getX(i) / 18; uv2[i * 2 + 1] = p.getZ(i) / 18; }
    waterGeo.setAttribute('uv1', new THREE.BufferAttribute(uv2, 2));
    water.material.normalMap.channel = 1;
    waterTex.repeat.set(1, 1);
  }
  anim.push((dt) => { waterTex.offset.x += dt * 0.02; waterTex.offset.y += dt * 0.012; });
  // White surf line along the ocean beaches.
  const surf = new THREE.Mesh(ribbonGeo([[-260, 53.4], [-60, 53.4], [-37, 49.6], [8, 61.6], [33, 61.6], [60, 55], [100, 57.6], [160, 58.4], [260, 58]], 1.2, 0.12, false),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(surf);
  anim.push((dt, t) => { surf.material.opacity = 0.35 + Math.sin(t * 1.4) * 0.2; });

  /* ---------------------------------------------------------------- land */
  const groundTex = paintGround(quality);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.97 });
  const sideMat = new THREE.MeshStandardMaterial({ color: '#8a7a5a', roughness: 1 });
  const landMeshes = [];
  for (const L of LAND) {
    const shape = new THREE.Shape(L.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = worldUV(new THREE.ExtrudeGeometry(shape, { depth: LAND_Y, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2));
    const m = new THREE.Mesh(geo, [groundMat, sideMat]);
    m.receiveShadow = shadows;
    m.userData.pick = { type: 'land', land: L.id };
    landMeshes.push(m);
    scene.add(m);
  }

  /* ---------------------------------------------------------------- roads and bridges */
  const roadMat = new THREE.MeshStandardMaterial({ color: '#45464b', roughness: 0.88 });
  const roadMesh = new THREE.Mesh(mergeGeometries(ROADS.map((r) => ribbonGeo(r.pts, r.w, LAND_Y + 0.04, true))), roadMat);
  roadMesh.userData.pick = { type: 'road' };
  scene.add(roadMesh);
  // dashed white centre lines on the wide roads, yellow edge lines
  {
    const dashes = [], edges = [];
    for (const r of ROADS) {
      if (r.w < 0.95) continue;
      const curve = new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => V3(x, LAND_Y + 0.05, z)), false, 'centripetal');
      const len = curve.getLength();
      for (let d = 0; d < len - 1; d += 1.6) {
        const a = curve.getPointAt(d / len), b = curve.getPointAt(Math.min(1, (d + 0.8) / len));
        dashes.push(ribbonGeo([[a.x, a.z], [b.x, b.z]], 0.06, LAND_Y + 0.05, false));
      }
      for (const side of [-1, 1]) edges.push(ribbonGeo(r.pts, 0.05, LAND_Y + 0.05, true, side * (r.w / 2 - 0.08)));
    }
    if (dashes.length) scene.add(new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshBasicMaterial({ color: '#e5e5e5' })));
    if (edges.length) scene.add(new THREE.Mesh(mergeGeometries(edges), new THREE.MeshBasicMaterial({ color: '#d6b84a' })));
  }
  const bridgeCurves = {};
  {
    const decks = [], walls = [], pillars = [];
    for (const b of BRIDGES) {
      const curve = new THREE.CatmullRomCurve3(b.pts.map(([x, z]) => V3(x, b.y + LAND_Y, z)), false, 'centripetal');
      bridgeCurves[b.id] = curve;
      decks.push(ribbonGeo(b.pts, b.w, b.y + LAND_Y, true));
      for (const side of [-1, 1]) walls.push(ribbonGeo(b.pts, 0.12, b.y + LAND_Y + 0.12, true, side * (b.w / 2)));
      const len = curve.getLength();
      for (let d = 1; d < len - 0.5; d += b.pillar) {
        const p = curve.getPointAt(d / len);
        if (landAt(p.x, p.z)) continue;
        pillars.push(new THREE.CylinderGeometry(0.22, 0.26, b.y + LAND_Y, 6).translate(p.x, (b.y + LAND_Y) / 2, p.z));
      }
      if (b.pylon) {
        const p = curve.getPointAt(0.5);
        const pylon = new THREE.BoxGeometry(0.5, 7, 0.5).translate(p.x, b.y + LAND_Y + 3.5, p.z);
        pillars.push(pylon);
        const cables = [];
        for (let i = 1; i <= 8; i++) for (const tt of [0.5 - i * 0.055, 0.5 + i * 0.055]) {
          const q = curve.getPointAt(Math.max(0, Math.min(1, tt)));
          cables.push(V3(p.x, b.y + LAND_Y + 6.6, p.z), V3(q.x, b.y + LAND_Y + 0.2, q.z));
        }
        scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cables), new THREE.LineBasicMaterial({ color: '#e5e7eb' })));
      }
    }
    const deck = new THREE.Mesh(mergeGeometries(decks), new THREE.MeshStandardMaterial({ color: '#56575c', roughness: 0.8 }));
    const wall = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshStandardMaterial({ color: '#d6d3cb', roughness: 0.8 }));
    const pil = new THREE.Mesh(mergeGeometries(pillars), new THREE.MeshStandardMaterial({ color: '#b9b4a7', roughness: 0.9 }));
    deck.castShadow = pil.castShadow = shadows;
    deck.userData.pick = { type: 'bridge' };
    pil.userData.pick = { type: 'bridge' };
    scene.add(deck, wall, pil);
  }

  /* ---------------------------------------------------------------- houses */
  const landmarkSpots = [...PLACES.map((p) => [p.at[0], p.at[1], 2.6]), [-41, 21, 6], [-7, 32, 4.5], [8, 30, 4], [-55, 12, 5], [-27, -16, 4]];
  const plots = housePlots({ low: 1300, medium: 2400, high: 3600 }[quality] || 2400, 11, landmarkSpots);
  const WALLS = ['#e9e0cb', '#e2d3b0', '#d6c4a0', '#efece4', '#dcc9a2', '#cdd3c0', '#e8d2bf', '#d9cdb8', '#c9b796'];
  const ROOFS = ['#7a4a32', '#8b5a3c', '#6d4c3d', '#9a9fa4', '#a3a7ab', '#2f5d8a', '#466b4a', '#9a3b2c', '#7d5038', '#8a8f94'];
  const houses = [];
  {
    // Three kinds of Lagos houses: zinc-roofed bungalows, "face-me-I-face-you" long houses,
    // and two/three-storey flats with flat roofs and black or blue water tanks on top.
    const bungalow = { body: new THREE.BoxGeometry(1, 0.7, 1).translate(0, 0.35, 0), roof: new THREE.ConeGeometry(0.78, 0.45, 4, 1).rotateY(Math.PI / 4).translate(0, 0.92, 0) };
    const long = { body: new THREE.BoxGeometry(2, 0.7, 0.95).translate(0, 0.35, 0), roof: new THREE.CylinderGeometry(0.62, 0.62, 2.1, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6 * 3).scale(1, 0.55, 0.85).translate(0, 0.85, 0) };
    const flats = { body: new THREE.BoxGeometry(1.1, 1, 1.1).translate(0, 0.5, 0), roof: new THREE.BoxGeometry(1.18, 0.08, 1.18).translate(0, 1.0, 0) };
    const kinds = [bungalow, long, flats].map((k) => ({ ...k, list: [] }));
    for (const p of plots) {
      const dense = p.land !== 'mainland' || rand() < 0.4;
      const k = rand() < (dense ? 0.32 : 0.14) ? 2 : rand() < 0.22 ? 1 : 0;
      kinds[k].list.push(p);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    const tanks = [];
    for (const [ki, k] of kinds.entries()) {
      if (!k.list.length) continue;
      const walls = new THREE.InstancedMesh(k.body, new THREE.MeshStandardMaterial({ roughness: 0.92 }), k.list.length);
      const roofs = new THREE.InstancedMesh(k.roof, new THREE.MeshStandardMaterial({ roughness: ki === 2 ? 0.95 : 0.6, metalness: ki === 2 ? 0 : 0.2 }), k.list.length);
      k.list.forEach((p, i) => {
        const storeys = ki === 2 ? 1.4 + Math.floor(rand() * 3) * 0.7 : 1;
        q.setFromAxisAngle(V3(0, 1, 0), p.r);
        sc.set(p.s * (0.9 + rand() * 0.4), p.s * storeys, p.s);
        m.compose(V3(p.x, LAND_Y, p.z), q, sc);
        walls.setMatrixAt(i, m);
        if (ki === 2) {
          // flat roof slab sits on top of the storeys
          const top = new THREE.Matrix4().compose(V3(p.x, LAND_Y + p.s * storeys - p.s, p.z), q, V3(sc.x, p.s, sc.z));
          roofs.setMatrixAt(i, top);
          if (rand() < 0.65) tanks.push([p.x + (rand() - 0.5) * 0.4 * p.s, LAND_Y + p.s * storeys + 0.04, p.z + (rand() - 0.5) * 0.4 * p.s, p.s, rand() < 0.6]);
        } else roofs.setMatrixAt(i, m);
        walls.setColorAt(i, c.set(WALLS[Math.floor(rand() * WALLS.length)]));
        roofs.setColorAt(i, c.set(ki === 2 ? '#bdb6a8' : ROOFS[Math.floor(rand() * ROOFS.length)]));
      });
      walls.castShadow = roofs.castShadow = shadows;
      walls.receiveShadow = shadows;
      walls.userData.pick = roofs.userData.pick = { type: 'house', list: k.list, kind: ki };
      houses.push(walls, roofs);
      scene.add(walls, roofs);
    }
    if (tanks.length) {
      const tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10).translate(0, 0.15, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), tanks.length);
      tanks.forEach(([x, y, z, s0, black], i) => { m.makeScale(s0, s0, s0).setPosition(x, y, z); tm.setMatrixAt(i, m); tm.setColorAt(i, c.set(black ? '#1f1f22' : '#2b5fa8')); });
      tm.castShadow = shadows;
      tm.userData.pick = { type: 'info', emoji: '🛢️', title: 'Rooftop water tank', text: 'There is no tap water on most Lagos streets, so every house pumps from a borehole into a tank on the roof. When NEPA takes the light, the pump stops too.' };
      scene.add(tm);
    }
  }

  /* ---------------------------------------------------------------- trees: bushy trees and palms */
  {
    const n = { low: 500, medium: 900, high: 1400 }[quality] || 900;
    const flat = (g) => (g.index ? g.toNonIndexed() : g);
    const colored = (parts) => {
      const geos = parts.map(([g, col]) => { const f = flat(g); const cc = new THREE.Color(col); const arr = []; for (let i = 0; i < f.attributes.position.count; i++) arr.push(cc.r, cc.g, cc.b); f.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); f.deleteAttribute('uv'); return f; });
      return mergeGeometries(geos);
    };
    const bushy = colored([
      [new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.85, 1).translate(0, 1.05, 0), '#4b7a3a'],
      [new THREE.IcosahedronGeometry(0.4, 1).translate(0.35, 0.9, 0.1), '#56853f'],
      [new THREE.CylinderGeometry(0.06, 0.09, 0.8, 5).translate(0, 0.4, 0), '#6b4a2d'],
    ]);
    const palm = colored([
      [new THREE.CylinderGeometry(0.04, 0.07, 1.8, 5).translate(0, 0.9, 0), '#7a6145'],
      [new THREE.ConeGeometry(0.75, 0.35, 7, 1, true).rotateX(Math.PI).translate(0, 1.85, 0), '#3f6e2f'],
      [new THREE.ConeGeometry(0.55, 0.25, 7, 1, true).rotateX(Math.PI).rotateY(0.4).translate(0, 1.95, 0), '#4f8a3a'],
    ]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const ims = [new THREE.InstancedMesh(bushy, mat, n), new THREE.InstancedMesh(palm, mat, Math.round(n * 0.6))];
    const counts = [0, 0];
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let tries = 0;
    while (counts[0] + counts[1] < n * 1.5 && tries < n * 30) {
      tries++;
      const x = BOUNDS.minX + rand() * (BOUNDS.maxX - BOUNDS.minX);
      const z = BOUNDS.minZ + rand() * (BOUNDS.maxZ - BOUNDS.minZ);
      if (!landAt(x, z)) continue;
      const isPalm = rand() < 0.38 || z > 40;
      const k = isPalm ? 1 : 0;
      if (counts[k] >= ims[k].instanceMatrix.count) continue;
      const s0 = 0.7 + rand() * 0.8;
      m.makeRotationY(rand() * 6.28).scale(V3(s0, s0, s0)).setPosition(x, LAND_Y, z);
      ims[k].setMatrixAt(counts[k], m);
      ims[k].setColorAt(counts[k], c.setHSL(0.25 + rand() * 0.06, 0.25, 0.75 + rand() * 0.25));
      counts[k]++;
    }
    ims.forEach((im, k) => {
      im.count = counts[k]; im.castShadow = shadows;
      im.userData.pick = k ? { type: 'info', emoji: '🌴', title: 'Coconut palm', text: 'Palms line the compounds and the beaches. The coconut man climbs them with a rope around his waist.' }
        : { type: 'info', emoji: '🌳', title: 'Mango tree', text: 'Neighbours sit under the mango tree in the evening to gist. A good place to share the Gospel.' };
      scene.add(im);
    });
  }

  /* ---------------------------------------------------------------- clouds */
  const clouds = new THREE.Group();
  scene.add(clouds);
  {
    const cm = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.85, fog: false });
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(cm);
      sp.position.set(BOUNDS.minX + rand() * (BOUNDS.maxX - BOUNDS.minX), 55 + rand() * 25, BOUNDS.minZ + rand() * (BOUNDS.maxZ - BOUNDS.minZ));
      sp.scale.set(28 + rand() * 30, 16 + rand() * 12, 1);
      sp.raycast = () => {};
      clouds.add(sp);
    }
    anim.push((dt) => { for (const c of clouds.children) { c.position.x += dt * 1.2; if (c.position.x > BOUNDS.maxX + 40) c.position.x = BOUNDS.minX - 40; } });
  }

  /* ---------------------------------------------------------------- towers */
  const windowTex = windowsTexture();
  const towerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: windowTex, roughness: 0.35, metalness: 0.3, emissive: '#ffd27a', emissiveMap: windowTex, emissiveIntensity: 0 });
  {
    const spots = [];
    for (const [cx, cz, r, count, h0, h1] of TOWERS) {
      let made = 0, tries = 0;
      while (made < count && tries < count * 20) {
        tries++;
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (!landAt(x, z) || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 1.9)) continue;
        spots.push({ x, z, h: h0 + rand() * rand() * (h1 - h0), w: 1.1 + rand() * 0.8, d: 1.1 + rand() * 0.8 });
        made++;
      }
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), towerMat, spots.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const tints = ['#dbe7f0', '#c6d6e3', '#e8e4da', '#9fb6c8', '#d6dde2', '#b9c9b8'];
    spots.forEach((s, i) => {
      m.makeScale(s.w, s.h, s.d).setPosition(s.x, LAND_Y, s.z);
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.set(tints[i % tints.length]));
    });
    im.castShadow = shadows;
    im.userData.pick = { type: 'tower' };
    scene.add(im);
  }

  /* ---------------------------------------------------------------- landmarks */
  const lm = new THREE.Group();
  scene.add(lm);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const add = (geo, mat, x, y, z, ry = 0) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = shadows; lm.add(mesh); return mesh; };
  const Y = LAND_Y;
  // Government House (Lagos House), Marina: white mansion with a portico, lawn and the flag.
  {
    const [x, z] = PLACE_BY_ID.govhouse.at;
    add(new THREE.CircleGeometry(3.3, 24).rotateX(-Math.PI / 2), std('#6f9a4c'), x, Y + 0.03, z);
    add(new THREE.BoxGeometry(3.6, 1.3, 1.8), std('#f5f3ee'), x, Y + 0.65, z);
    add(new THREE.BoxGeometry(3.9, 0.18, 2.1), std('#b45c3c'), x, Y + 1.38, z);
    add(new THREE.BoxGeometry(1.4, 0.9, 0.8), std('#f5f3ee'), x, Y + 0.45, z + 1.2);
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), std('#ffffff'), x - 0.5 + i * 0.33, Y + 0.45, z + 1.65);
    add(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), std('#d4d4d4'), x + 2.2, Y + 1.3, z + 1.4);
    const flag = add(flagGeo(), new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 }), x + 2.2, Y + 2.3, z + 1.4);
    anim.push((dt, t) => { flag.rotation.y = Math.sin(t * 1.3) * 0.25; });
  }
  // Lagos State Secretariat, Alausa: office blocks around a square.
  {
    const [x, z] = PLACE_BY_ID.secretariat.at;
    for (const [dx, dz, w, h] of [[-1.6, 0, 1.4, 2.2], [1.6, 0, 1.4, 2.2], [0, -1.6, 2.8, 1.6]]) add(new THREE.BoxGeometry(w, h, 1.3), std('#e9e1cf'), x + dx, Y + h / 2, z + dz);
    add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), std('#d4d4d4'), x, Y + 1.1, z + 1.2);
    add(flagGeo(), new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide }), x, Y + 1.95, z + 1.2);
  }
  // National Theatre, Iganmu: the "military cap".
  {
    const [x, z] = PLACE_BY_ID.theatre.at;
    const prof = [[0, 2.6], [3.4, 2.5], [4.4, 2.2], [4.9, 1.7], [4.4, 1.5], [4.1, 0.7], [4.2, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const cap = new THREE.LatheGeometry(prof, 48);
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i), py = p.getY(i);
      const a = Math.atan2(pz, px);
      const r = Math.hypot(px, pz);
      const fold = py > 1.4 ? 1 + 0.07 * Math.cos(a * 12) : 1;
      p.setXYZ(i, Math.cos(a) * r * fold, py + (py > 1.4 ? 0.12 * Math.cos(a * 12) : 0), Math.sin(a) * r * fold);
    }
    cap.computeVertexNormals();
    add(cap, std('#ebe7dc', { roughness: 0.6 }), x, Y, z);
    add(new THREE.CircleGeometry(6.2, 32).rotateX(-Math.PI / 2), std('#9b9a92'), x, Y + 0.02, z);
  }
  // Grace Assembly, Yaba: a church with a steeple and a cross.
  {
    const [x, z] = PLACE_BY_ID.grace.at;
    add(new THREE.BoxGeometry(2.2, 1.1, 3), std('#f2ecdf'), x, Y + 0.55, z);
    add(new THREE.CylinderGeometry(0.01, 1.7, 0.8, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.35), std('#1e3a8a'), x, Y + 1.5, z);
    add(new THREE.BoxGeometry(0.6, 1.6, 0.6), std('#f2ecdf'), x, Y + 1.1, z + 1.6);
    add(new THREE.ConeGeometry(0.45, 0.9, 4).rotateY(Math.PI / 4), std('#1e3a8a'), x, Y + 2.35, z + 1.6);
    add(new THREE.BoxGeometry(0.06, 0.55, 0.06), std('#facc15', { emissive: '#facc15', emissiveIntensity: 0.4 }), x, Y + 3.05, z + 1.6);
    add(new THREE.BoxGeometry(0.3, 0.06, 0.06), std('#facc15', { emissive: '#facc15', emissiveIntensity: 0.4 }), x, Y + 3.15, z + 1.6);
  }
  // Home, No. 14: a small bungalow with a yellow roof so you can find it.
  {
    const [x, z] = PLACE_BY_ID.home.at;
    add(new THREE.BoxGeometry(1.4, 0.75, 1.1), std('#efdfae'), x, Y + 0.38, z);
    add(new THREE.ConeGeometry(1.05, 0.5, 4).rotateY(Math.PI / 4), std('#eab308'), x, Y + 1.0, z);
  }
  // National Stadium, Surulere: a bowl.
  {
    const ring = new THREE.LatheGeometry([[2.6, 0], [3.4, 0.9], [3.6, 0.95], [3.6, 0], [2.6, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 40).scale(1.25, 1, 1);
    add(ring, std('#d9d4c7', { side: THREE.DoubleSide }), -55, Y, 12);
    add(new THREE.CircleGeometry(2.6, 30).rotateX(-Math.PI / 2).scale(1.25, 1, 1), std('#4f8a3c'), -55, Y + 0.03, 12);
  }
  // Tafawa Balewa Square: open square with stands.
  {
    const [x, z] = PLACE_BY_ID.tbs.at;
    add(new THREE.BoxGeometry(4.2, 0.05, 3), std('#cfc6b1'), x, Y + 0.03, z);
    add(new THREE.BoxGeometry(4.2, 0.6, 0.5), std('#e6e0d2'), x, Y + 0.3, z - 1.5);
  }
  // UNILAG senate tower.
  { const [x, z] = PLACE_BY_ID.unilag.at; add(new THREE.BoxGeometry(1, 4.5, 1), std('#e7e1d1'), x, Y + 2.25, z); add(new THREE.BoxGeometry(2.6, 0.9, 1.4), std('#e7e1d1'), x + 1.6, Y + 0.45, z + 0.6); }
  // Makoko: houses on stilts over the lagoon, canoes.
  {
    const [x, z] = PLACE_BY_ID.makoko.at;
    const huts = [], stilts = [];
    for (let i = 0; i < 26; i++) {
      const hx = x + (rand() - 0.5) * 6, hz = z + (rand() - 0.5) * 9;
      if (landAt(hx, hz)) continue;
      huts.push(new THREE.BoxGeometry(0.7, 0.4, 0.6).translate(hx, 0.75, hz));
      huts.push(new THREE.ConeGeometry(0.55, 0.3, 4).rotateY(Math.PI / 4).translate(hx, 1.1, hz));
      for (const [sx, sz] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]]) stilts.push(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4).translate(hx + sx, 0.3, hz + sz));
    }
    if (huts.length) add(mergeGeometries(huts.map((g) => g.toNonIndexed())), std('#8b6a48'), 0, 0, 0);
    if (stilts.length) add(mergeGeometries(stilts), std('#5d4630'), 0, 0, 0);
  }
  // Prayer mountain: a green hill.
  { const [x, z] = PLACE_BY_ID.mountain.at; add(new THREE.ConeGeometry(6, 4, 14), std('#6c8a48', { flatShading: true }), x, Y + 2, z); }
  // Lekki toll gate.
  { add(new THREE.BoxGeometry(0.4, 1.4, 3.2), std('#d1d5db'), 66, Y + 0.7, 35.5); add(new THREE.BoxGeometry(5, 0.4, 3.2), std('#1f2937'), 66, Y + 1.6, 35.5); }
  // Beach umbrellas at Elegushi.
  {
    const [x, z] = PLACE_BY_ID.beach.at;
    const cols = ['#d62828', '#f4d35e', '#2a9d8f', '#1d4ed8'];
    for (let i = 0; i < 10; i++) {
      const ux = x - 7 + i * 1.5, uz = z + 1.6 + (i % 2) * 0.8;
      add(new THREE.ConeGeometry(0.6, 0.3, 8), std(cols[i % 4]), ux, Y + 0.95, uz);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), std('#e5e5e5'), ux, Y + 0.45, uz);
    }
  }

  // Every landmark mesh knows which place it belongs to (for taps on the map).
  lm.updateMatrixWorld(true);
  for (const mesh of lm.children) {
    mesh.geometry.computeBoundingSphere();
    const c = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
    let best = null, bd = 9;
    for (const p of PLACES) { const d = Math.hypot(p.at[0] - c.x, p.at[1] - c.z); if (d < bd) { bd = d; best = p; } }
    if (best) mesh.userData.pick = { type: 'place', id: best.id };
    else if (Math.hypot(c.x - 66, c.z - 35.5) < 4) mesh.userData.pick = { type: 'info', title: 'Lekki Toll Gate', emoji: '🚧', text: 'The toll gate on the Lekki–Epe Expressway. Have your change ready, or your tag.' };
  }

  /* ---------------------------------------------------------------- billboards (church posters) */
  // All posters live in one canvas atlas (8 × 8 cells) so dozens of boards cost two draw calls.
  const boards = new THREE.Group();
  scene.add(boards);
  const COLS = 8, ROWS = 8, CW = 256, CH = 112;
  const atlas = document.createElement('canvas');
  atlas.width = COLS * CW; atlas.height = ROWS * CH;
  const ag = atlas.getContext('2d');
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 4;
  const spots = billboardSpots(rand);
  const posters = defaultPosters(spots.length, 4);
  posters[1] = { title: 'AMEN CITY', sub: 'Pray · Serve · Live · Join free', church: 'Lagos', theme: 'gold', motif: 'cross' };
  const shown = [];
  const drawCell = (i, p) => { shown[i] = p; drawPoster(ag, (i % COLS) * CW, Math.floor(i / COLS) * CH, CW, CH, p); };
  const currentPoster = (i) => shown[i] || posters[i];
  posters.forEach((p, i) => drawCell(i, p));
  {
    const faces = [], frames = [];
    const W = 6.4, H = 2.8, Yb = 4.6;
    spots.forEach((b, i) => {
      const m = new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.at[0], LAND_Y, b.at[1]);
      const face = new THREE.PlaneGeometry(W, H).translate(0, Yb, 0.08);
      const u0 = (i % COLS) / COLS, v1 = 1 - Math.floor(i / COLS) / ROWS, u1 = u0 + 1 / COLS, v0 = v1 - 1 / ROWS;
      const uv = face.attributes.uv;
      uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
      faces.push(face.applyMatrix4(m));
      // the same poster on the back, so boards read from both directions
      const back = new THREE.PlaneGeometry(W, H).rotateY(Math.PI).translate(0, Yb, -0.08);
      const ub = back.attributes.uv;
      ub.setXY(0, u0, v1); ub.setXY(1, u1, v1); ub.setXY(2, u0, v0); ub.setXY(3, u1, v0);
      faces.push(back.applyMatrix4(m));
      frames.push(new THREE.BoxGeometry(W + 0.2, H + 0.2, 0.12).translate(0, Yb, 0).applyMatrix4(m));
      for (const sx of [-1.2, 1.2]) frames.push(new THREE.CylinderGeometry(0.08, 0.1, Yb - H / 2, 6).translate(sx, (Yb - H / 2) / 2, 0).applyMatrix4(m));
    });
    const faceMesh = new THREE.Mesh(mergeGeometries(faces), new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.55, emissive: '#ffffff', emissiveMap: atlasTex, emissiveIntensity: 0.18 }));
    faceMesh.userData.pick = { type: 'billboard' };
    const frameMesh = new THREE.Mesh(mergeGeometries(frames), std('#374151'));
    frameMesh.castShadow = shadows;
    boards.add(faceMesh, frameMesh);
    // at night the boards light up
    anim.push(() => { faceMesh.material.emissiveIntensity = 0.18 + (1 - daylight(lastHour < 0 ? 12 : lastHour)) * 0.7; });
  }
  /** Ad spots players can book (src/game/life.js AD_SPOTS) → billboard index. */
  const AD_BOARD = { yaba: 1, thirdmainland: 0, lekki: 4 };

  /* ---------------------------------------------------------------- go-slow traffic */
  const traffic = new THREE.Group();
  scene.add(traffic);
  const lanes = [...ROADS.map((r) => ({ pts: r.pts, y: LAND_Y + 0.12, w: r.w, bridge: false })), ...BRIDGES.map((b) => ({ pts: b.pts, y: b.y + LAND_Y + 0.12, w: b.w, bridge: true }))]
    .map((l) => ({ ...l, curve: new THREE.CatmullRomCurve3(l.pts.map(([x, z]) => V3(x, l.y, z)), false, 'centripetal') }))
    .map((l) => ({ ...l, len: l.curve.getLength() }));
  const cars = [];
  {
    const per = { low: 0.6, medium: 1, high: 1.4 }[quality] || 1;
    for (const l of lanes) {
      const n = Math.round((l.len / (l.bridge ? 1.3 : 4)) * per);
      for (let i = 0; i < n; i++) cars.push({ l, t: rand(), dir: rand() < 0.5 ? 1 : -1, speed: (l.bridge ? 1.1 : 3) * (0.6 + rand() * 0.8), danfo: rand() < 0.3 });
    }
    const carGeo = new THREE.BoxGeometry(0.42, 0.22, 0.2).translate(0, 0.11, 0);
    const im = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), cars.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const palette = ['#f4f4f5', '#1f2937', '#9ca3af', '#b91c1c', '#1d4ed8', '#0f766e'];
    const c = new THREE.Color();
    cars.forEach((car, i) => im.setColorAt(i, c.set(car.danfo ? '#facc15' : palette[i % palette.length])));
    im.userData.pick = { type: 'car' };
    traffic.add(im);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
    const one = V3(1, 1, 1);
    anim.push((dt, t) => {
      if (!traffic.visible) return;
      cars.forEach((car, i) => {
        // Go-slow: cars on the bridges crawl and stop in waves.
        const jam = car.l.bridge ? 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.5 + car.t * 9)) : 1;
        car.t = (car.t + (car.dir * car.speed * jam * dt) / car.l.len + 1) % 1;
        car.l.curve.getPointAt(car.t, p);
        car.l.curve.getTangentAt(car.t, tan);
        side.set(-tan.z, 0, tan.x).normalize().multiplyScalar(car.dir * car.l.w * 0.22);
        q.setFromAxisAngle(V3(0, 1, 0), Math.atan2(-tan.z * car.dir, tan.x * car.dir));
        m.compose(p.add(side), q, one);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------------------------------------------------------------- boats */
  const boats = new THREE.Group();
  scene.add(boats);
  {
    const hull = new THREE.BoxGeometry(0.9, 0.2, 0.32).translate(0, 0.1, 0);
    const routes = [[[-8, 22], [20, -10], [50, 10]], [[13, 22], [40, -20], [80, -40]], [[-19, 4], [-16, -4], [-19.5, -10]], [[-26, 45], [-22, 30], [-12, 23]], [[30, 60], [60, 66], [120, 66]]];
    const list = [];
    for (const r of routes) for (let k = 0; k < 3; k++) {
      const mesh = new THREE.Mesh(hull, std(k ? '#f8fafc' : '#c2410c'));
      mesh.userData.pick = k ? { type: 'info', emoji: '⛴️', title: 'Lagos ferry', text: 'Ferries cross the lagoon from Ikorodu to CMS and from Mile 2 to Marina. Life jackets on, and pray before you board!' } : { type: 'info', emoji: '🛶', title: 'Fishing canoe', text: 'Makoko fishermen paddle out at dawn. The Makoko outreach goes by canoe too.' };
      boats.add(mesh);
      list.push({ mesh, curve: new THREE.CatmullRomCurve3(r.map(([x, z]) => V3(x, 0.05, z))), t: rand(), speed: 0.012 + rand() * 0.02 });
    }
    const tan = new THREE.Vector3();
    anim.push((dt, t) => {
      if (!boats.visible) return;
      for (const b of list) {
        b.t = (b.t + b.speed * dt) % 1;
        const f = b.t < 0.5 ? b.t * 2 : 2 - b.t * 2; // there and back
        b.curve.getPointAt(f, b.mesh.position);
        b.curve.getTangentAt(f, tan);
        b.mesh.rotation.y = Math.atan2(-tan.z, tan.x) + (b.t < 0.5 ? 0 : Math.PI);
        b.mesh.position.y = 0.05 + Math.sin(t * 2 + b.t * 20) * 0.04;
      }
    });
  }

  /* ---------------------------------------------------------------- street lights at night */
  const lightPts = [];
  for (const r of [...ROADS, ...BRIDGES]) {
    const curve = new THREE.CatmullRomCurve3(r.pts.map(([x, z]) => V3(x, LAND_Y + (r.y || 0) + 0.6, z)));
    const len = curve.getLength();
    for (let d = 0; d < len; d += 1.6) lightPts.push(curve.getPointAt(d / len));
  }
  const nightLights = new THREE.Points(new THREE.BufferGeometry().setFromPoints(lightPts),
    new THREE.PointsMaterial({ color: '#ffcf70', size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(nightLights);

  /* ---------------------------------------------------------------- "you are here" */
  const here = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, depthWrite: false }));
  here.visible = false;
  scene.add(here);
  anim.push((dt, t) => { const s = 1 + (t * 0.8 % 1) * 1.4; here.scale.setScalar(s); here.material.opacity = 1 - (t * 0.8 % 1); });

  /* ---------------------------------------------------------------- lighting by the hour */
  let lastHour = -1;
  function applyTime(hour = lagosHour()) {
    if (Math.abs(hour - lastHour) < 0.05) return;
    lastHour = hour;
    const day = daylight(hour);
    const dusk = Math.max(0, 1 - Math.abs(hour - 18.6) / 1.2) + Math.max(0, 1 - Math.abs(hour - 6.4) / 1.0);
    const top = new THREE.Color('#14204a').lerp(new THREE.Color('#79b6e6'), day);
    const bottom = new THREE.Color('#2c3a6b').lerp(new THREE.Color('#dcecf3'), day).lerp(new THREE.Color('#f6a96b'), Math.min(1, dusk) * 0.7);
    const g = skyCanvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${bottom.getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    skyTex.needsUpdate = true;
    scene.fog.color.copy(bottom);
    hemi.intensity = 0.55 + day * 0.65;
    hemi.color.set('#9fb3ff').lerp(new THREE.Color('#ffffff'), day);
    sun.intensity = 0.45 + day * 1.9;
    sun.color.set('#a8b8ff').lerp(new THREE.Color('#fff1d6'), day).lerp(new THREE.Color('#ffb070'), Math.min(1, dusk) * 0.6);
    const ang = ((hour - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(ang) * -200, 80 + Math.max(0, Math.sin(ang)) * 160, 90);
    towerMat.emissiveIntensity = (1 - day) * 1.1;
    nightLights.visible = day < 0.5;
    ctx.renderer.toneMappingExposure = 0.85 + day * 0.15;
  }

  /* ---------------------------------------------------------------- camera and controls */
  camera.position.set(-60, 150, 150);
  const controls = new MapControls(camera, ctx.renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 18;
  controls.maxDistance = 320;
  controls.maxPolarAngle = 1.2;
  controls.target.set(-20, 0, 10);
  controls.zoomToCursor = true;
  controls.update();
  const clampTarget = () => {
    const t = controls.target;
    const cx = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, t.x)), cz = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, t.z));
    if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
    t.y = 0;
  };
  controls.addEventListener('change', clampTarget);
  let fly = null;
  /** Glide the camera to look at [x, z] from `dist`. */
  function flyTo(x, z, dist = 70, o = {}) {
    const from = { p: camera.position.clone(), t: controls.target.clone() };
    const az = o.azimuth ?? Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const polar = o.polar ?? 0.95;
    const to = { t: V3(x, 0, z) };
    to.p = V3(x + Math.sin(az) * Math.sin(polar) * dist, Math.cos(polar) * dist, z + Math.cos(az) * Math.sin(polar) * dist);
    fly = { from, to, t: 0, dur: o.instant ? 0 : o.dur ?? 1.4 };
  }

  /* ---------------------------------------------------------------- pins (HTML) */
  const pinRoot = document.createElement('div');
  pinRoot.className = 'lm-pins';
  opts.root.append(pinRoot);
  const pins = [];
  for (const p of PLACES) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `lm-pin${p.walk ? ' is-walk' : ''}${p.gov ? ' is-gov' : ''}${p.soon ? ' is-soon' : ''}${p.id === 'grace' ? ' is-church' : ''}`;
    el.dataset.place = p.id;
    const e = document.createElement('span');
    e.className = 'lm-pin-emoji';
    e.textContent = p.emoji;
    const n = document.createElement('span');
    n.className = 'lm-pin-name';
    n.textContent = p.name;
    el.append(e, n);
    el.setAttribute('aria-label', `${p.name}, ${p.area}`);
    el.addEventListener('click', () => opts.onPick?.({ type: 'place', place: p }));
    pinRoot.append(el);
    pins.push({ p, el, pos: V3(p.at[0], LAND_Y + (p.id === 'mountain' ? 4.5 : 2.4), p.at[1]) });
  }
  const areaLabels = AREAS.map(([name, x, z]) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.addEventListener('click', () => opts.onPick?.(areaPick(name)));
    el.className = `lm-area${/Lagoon|Ocean/.test(name) ? ' is-water' : ''}`;
    el.textContent = name;
    pinRoot.append(el);
    return { el, pos: V3(x, LAND_Y, z) };
  });
  const tmp = new THREE.Vector3();
  function placeLabels() {
    const w = ctx.renderer.domElement.clientWidth, h = ctx.renderer.domElement.clientHeight;
    const dist = camera.position.distanceTo(controls.target);
    const showNames = layers.names && dist < 190;
    for (const pin of pins) {
      tmp.copy(pin.pos).project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && (layers.gov || !pin.p.gov) && (pin.p.walk || pin.p.gov || dist < 230);
      pin.el.hidden = !vis;
      if (!vis) continue;
      pin.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
      pin.el.classList.toggle('is-compact', !showNames && pin.p.id !== 'grace');
      pin.el.style.zIndex = String(Math.round((1 - tmp.z) * 10000));
    }
    for (const a of areaLabels) {
      tmp.copy(a.pos).project(camera);
      const vis = layers.names && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && dist > 45;
      a.el.hidden = !vis;
      if (vis) a.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  /* ---------------------------------------------------------------- taps on the map */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const canvas = ctx.renderer.domElement;
  const onDown = (e) => { if (isOpen) down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e) => {
    if (!isOpen || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 7 || !quick) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene.children, true).filter((h) => pickOf(h.object) && h.object.visible !== false);
    const hit = hits.find((h) => pickOf(h.object).type !== 'water' && pickOf(h.object).type !== 'land') || hits[0];
    if (!hit) return;
    const info = describe(hit);
    if (info) { opts.onPick?.(info); map.tour(false); }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  // Laptop touchpads: two-finger swipe pans the map (like Google Maps), pinch (ctrl+wheel) and a
  // mouse wheel zoom. MapControls does the zooming; we take the panning swipes first.
  const right = new THREE.Vector3(), fwd = new THREE.Vector3();
  const onWheel = (e) => {
    if (!isOpen) return;
    map.tour(false);
    if (e.ctrlKey || e.deltaMode !== 0) return;
    const swipe = Math.abs(e.deltaX) > 0.5 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY));
    if (!swipe) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const k = camera.position.distanceTo(controls.target) / 700;
    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    fwd.set(-right.z, 0, right.x); // towards the viewer on the ground
    const move = right.multiplyScalar(e.deltaX * k).add(fwd.multiplyScalar(e.deltaY * k)); // like scrolling a page
    camera.position.add(move);
    controls.target.add(move);
    clampTarget();
  };
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
  // The slow tour on the landing page stops as soon as you touch the map.
  controls.addEventListener('start', () => map.tour(false));
  function pickOf(o) { while (o) { if (o.userData?.pick) return o.userData.pick; o = o.parent; } return null; }
  /** Turn a ray hit into something to show: a place, a billboard poster, a neighbourhood, a bridge… */
  function describe(hit) {
    const pk = pickOf(hit.object);
    const { x, z } = hit.point;
    if (pk.type === 'place') return { type: 'place', place: PLACE_BY_ID[pk.id] };
    if (pk.type === 'info') return pk;
    if (pk.type === 'billboard') {
      const i = Math.floor(hit.faceIndex / 4); // front and back: 4 triangles per board
      return { type: 'billboard', index: i, poster: currentPoster(i), booked: Object.values(AD_BOARD).includes(i) };
    }
    if (pk.type === 'bridge') {
      let best = BRIDGES[0], bd = Infinity;
      for (const b of BRIDGES) { const d = distToPolyline(b.pts, x, z); if (d < bd) { bd = d; best = b; } }
      return { type: 'info', emoji: '🌉', title: best.name, text: ROUTE_INFO[best.id] || '' };
    }
    if (pk.type === 'road') {
      let best = ROADS[0], bd = Infinity;
      for (const r of ROADS) { const d = distToPolyline(r.pts, x, z); if (d < bd) { bd = d; best = r; } }
      return { type: 'info', emoji: '🛣️', title: best.name, text: `${best.name}: danfos, okadas, hawkers in the go-slow, and church billboards along the way. ${nearestArea(x, z)} is nearby.` };
    }
    if (pk.type === 'water') {
      if (z > 50) return areaPick('Atlantic Ocean');
      if (Math.hypot(x - PLACE_BY_ID.makoko.at[0], z - PLACE_BY_ID.makoko.at[1]) < 8) return { type: 'place', place: PLACE_BY_ID.makoko };
      return areaPick('Lagos Lagoon');
    }
    if (pk.type === 'house') {
      const plot = pk.list?.[hit.instanceId];
      const area = nearestArea(plot ? plot.x : x, plot ? plot.z : z);
      return { type: 'house', key: `${pk.kind}:${hit.instanceId}`, area };
    }
    if (pk.type === 'car') {
      const car = cars[hit.instanceId];
      const road = car && ([...ROADS, ...BRIDGES].find((r) => r.pts === car.l.pts));
      const name = road?.name || 'the road';
      return car?.danfo
        ? { type: 'info', emoji: '🚐', title: `Danfo on ${name}`, text: `"${['Oshodi! Oshodi!', 'CMS! Obalende!', 'Yaba! Ojuelegba!', 'Ikeja along!'][hit.instanceId % 4]}" The conductor hangs out of the door, collecting fares. ₦300 to ₦700, depending on the go-slow.` }
        : { type: 'info', emoji: '🚗', title: `Car on ${name}`, text: car?.l.bridge ? 'Stuck in go-slow on the bridge. Hawkers sell gala, water and phone chargers between the cars.' : 'Lagos traffic: okadas weave in and out, and somebody is always honking.' };
    }
    if (pk.type === 'tower') return { type: 'info', emoji: '🏢', title: `Towers of ${nearestArea(x, z)}`, text: 'Banks, offices and churches that meet in hotel halls on Sunday. Workers pour out at 5pm into the go-slow.' };
    return areaPick(nearestArea(x, z), pk.type === 'house');
  }
  function nearestArea(x, z) {
    let best = AREAS[0][0], bd = Infinity;
    for (const [name, ax, az] of AREAS) { if (/Lagoon|Ocean/.test(name)) continue; const d = Math.hypot(ax - x, az - z); if (d < bd) { bd = d; best = name; } }
    return best;
  }
  function areaPick(name, house = false) {
    const nearby = PLACES.filter((p) => p.area === name || p.area.startsWith(name)).map((p) => p.id);
    return { type: 'area', name, house, text: AREA_INFO[name] || `${name}, Lagos.`, places: nearby };
  }

  /* ---------------------------------------------------------------- layers */
  const layers = { traffic: true, billboards: true, sea: true, gov: true, names: true };
  function setLayer(name, on) {
    layers[name] = on;
    traffic.visible = layers.traffic;
    boards.visible = layers.billboards;
    boats.visible = layers.sea;
  }

  /* ---------------------------------------------------------------- open / close / frame */
  let isOpen = false;
  let time = 0;
  let unsub = null;
  const resize = () => {
    const w = ctx.renderer.domElement.clientWidth || innerWidth, h = ctx.renderer.domElement.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.fov = w < h ? 55 : 42;
    camera.updateProjectionMatrix();
  };
  let prevExposure = 1;
  let fixedHour;

  function update(dt) {
    time += dt;
    if (fly) {
      fly.t = fly.dur ? Math.min(1, fly.t + dt / fly.dur) : 1;
      const k = fly.t * fly.t * (3 - 2 * fly.t);
      camera.position.lerpVectors(fly.from.p, fly.to.p, k);
      controls.target.lerpVectors(fly.from.t, fly.to.t, k);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    for (const f of anim) f(dt, time);
    if (Math.floor(time) !== Math.floor(time - dt)) applyTime(fixedHour);
    placeLabels();
  }

  const map = {
    scene, camera, controls,
    get open() { return isOpen; },
    /** Show the map (renders instead of the world until close()). */
    show(o = {}) {
      if (isOpen) return;
      isOpen = true;
      resize();
      window.addEventListener('resize', resize);
      prevExposure = ctx.renderer.toneMappingExposure;
      lastHour = -1;
      fixedHour = o.hour;
      applyTime(o.hour);
      ctx.setView(scene, camera);
      controls.enabled = o.interactive !== false;
      pinRoot.hidden = false;
      unsub = ctx.onUpdate((dt) => update(dt));
      if (o.focus) map.focus(o.focus, { instant: true, dist: o.dist });
    },
    hide() {
      if (!isOpen) return;
      isOpen = false;
      window.removeEventListener('resize', resize);
      controls.enabled = false;
      pinRoot.hidden = true;
      unsub?.();
      ctx.setView(null);
      ctx.renderer.toneMappingExposure = prevExposure;
    },
    /** Fly to a place by id, or to [x, z]. */
    focus(target, o = {}) {
      const at = Array.isArray(target) ? target : PLACE_BY_ID[target]?.at;
      if (at) flyTo(at[0], at[1], o.dist ?? 55, o);
    },
    /** Slowly circle the whole city (landing page). */
    tour(on = true) {
      if (!on) { controls.autoRotate = false; return; }
      flyTo(-6, 6, 190, { polar: 0.9, azimuth: 0.5, dur: 0.01 });
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
    },
    /** Mark where the player is ("you are here"). */
    setHere(placeId) {
      const p = PLACE_BY_ID[placeId];
      here.visible = !!p;
      if (p) here.position.set(p.at[0], LAND_Y + 0.08, p.at[1]);
      for (const pin of pins) pin.el.classList.toggle('is-here', pin.p.id === placeId);
    },
    /** Badge on a pin, e.g. players online there. */
    setBadge(placeId, text) {
      const pin = pins.find((x) => x.p.id === placeId);
      if (!pin) return;
      let b = pin.el.querySelector('.lm-pin-badge');
      if (!text) { b?.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'lm-pin-badge'; pin.el.append(b); }
      b.textContent = text;
    },
    setLayer,
    layers,
    /** Show players' booked church adverts on their billboards: [{spot, title, sub, church, theme, motif}]. */
    setAds(ads = []) {
      for (const [spot, i] of Object.entries(AD_BOARD)) {
        const ad = ads.find((a) => a.spot === spot);
        drawCell(i, ad ? { ...ad, booked: true } : posters[i]);
      }
      atlasTex.needsUpdate = true;
    },
    /** Zoom buttons: f < 1 moves closer, f > 1 further away. */
    zoomBy(f) {
      map.tour(false);
      const off = camera.position.clone().sub(controls.target);
      const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(off.setLength(d));
      controls.update();
    },
    /** Turn the map around its centre (radians). */
    rotateBy(a) {
      map.tour(false);
      const off = camera.position.clone().sub(controls.target).applyAxisAngle(V3(0, 1, 0), a);
      camera.position.copy(controls.target).add(off);
      controls.update();
    },
    /** Billboard positions (for tests / focusing). */
    billboards: spots,
    applyTime,
    dispose() {
      map.hide();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel, { capture: true });
      controls.dispose();
      pinRoot.remove();
      scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose(); x.dispose(); }); });
    },
  };
  pinRoot.hidden = true;
  return map;
}

/* ================================================================ geometry helpers */

/**
 * A flat ribbon along a polyline at height y (roads, bridge decks). `offset` shifts it sideways.
 * @param {number[][]} pts [x, z] points
 */
function ribbonGeo(pts, width, y, smooth = true, offset = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V3(x, y, z)), false, 'centripetal');
  const len = curve.getLength();
  const n = smooth ? Math.max(2, Math.ceil(len / 1.2)) : pts.length - 1;
  const pos = [], idx = [], nor = [];
  const p = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (smooth) { curve.getPointAt(u, p); curve.getTangentAt(u, t); }
    else {
      const k = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)));
      const a = pts[k], b = pts[k + 1], f = u * (pts.length - 1) - k;
      p.set(a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f);
      t.set(b[0] - a[0], 0, b[1] - a[1]).normalize();
    }
    const sx = -t.z, sz = t.x;
    const l = Math.hypot(sx, sz) || 1;
    const ox = (sx / l), oz = (sz / l);
    pos.push(p.x + ox * (offset - width / 2), p.y, p.z + oz * (offset - width / 2), p.x + ox * (offset + width / 2), p.y, p.z + oz * (offset + width / 2));
    nor.push(0, 1, 0, 0, 1, 0);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  // Make both windings visible from above.
  const tri = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  a.fromBufferAttribute(g.attributes.position, tri[0]); b.fromBufferAttribute(g.attributes.position, tri[1]); c.fromBufferAttribute(g.attributes.position, tri[2]);
  const up = b.sub(a).cross(c.sub(a)).y;
  if (up < 0) for (let i = 0; i < tri.length; i += 3) { const s = tri[i + 1]; tri[i + 1] = tri[i + 2]; tri[i + 2] = s; }
  return g;
}

function flagGeo() { return new THREE.PlaneGeometry(0.9, 0.5).translate(0.45, 0, 0); }

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 24;
  const g = c.getContext('2d');
  g.fillStyle = '#008751'; g.fillRect(0, 0, 48, 24);
  g.fillStyle = '#ffffff'; g.fillRect(16, 0, 16, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Billboard face: big title, small line, the colours of a Lagos roadside board. */
function billboardTexture(b) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = b.bg; g.fillRect(0, 0, 512, 224);
  g.fillStyle = b.fg;
  g.font = '800 64px "Space Grotesk", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(b.title, 256, 92, 480);
  g.font = '600 30px Inter, system-ui, sans-serif';
  g.fillText(b.sub, 256, 168, 480);
  g.strokeStyle = b.fg; g.lineWidth = 8; g.strokeRect(10, 10, 492, 204);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Grid of office windows (also the night-time glow map). */
function windowsTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7d8a96'; g.fillRect(0, 0, 64, 128);
  const r = rng32(5);
  for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) {
    const lit = r() < 0.55;
    g.fillStyle = lit ? '#fff3c4' : '#33414f';
    g.fillRect(x, y, 5, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tileable ripple normal map for the water. */
function rippleTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const h = (x, y) => {
    const u = (x / n) * Math.PI * 2, v = (y / n) * Math.PI * 2;
    return Math.sin(u * 3 + Math.sin(v * 2)) * 0.5 + Math.sin(v * 5 + u) * 0.3 + Math.sin((u + v) * 7) * 0.2;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const len = Math.hypot(dx, dy, 1);
    const i = (y * n + x) * 4;
    img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
    img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Where billboards stand: the hand-placed ones, then boards along the main roads facing the
 * traffic (up to 64, one per atlas cell).
 */
function billboardSpots(rand) {
  const out = BILLBOARDS.map((b) => ({ at: b.at, rot: b.rot }));
  const near = (x, z) => out.some((o) => Math.hypot(o.at[0] - x, o.at[1] - z) < 8) || PLACES.some((p) => Math.hypot(p.at[0] - x, p.at[1] - z) < 4);
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1 && out.length < 64; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 3; d < len && out.length < 64; d += 9 + rand() * 6) {
        const t = d / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const side = rand() < 0.5 ? -1 : 1;
        const nx = (-(bz - az) / len) * side, nz = ((bx - ax) / len) * side;
        const px = x + nx * (r.w / 2 + 2.2), pz = z + nz * (r.w / 2 + 2.2);
        if (!landAt(px, pz) || near(px, pz) || ROADS.some((o) => distToPolyline(o.pts, px, pz) < o.w / 2 + 0.6)) continue;
        // face the road: the board's front (+Z) points back at the road
        out.push({ at: [px, pz], rot: Math.atan2(-nx, -nz) });
      }
    }
  }
  return out.slice(0, 64);
}
