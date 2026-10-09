// Character kit: loads bodies, hair and clips once, prepares canonical rest-space data
// and caches every derived geometry and shared material so characters stay cheap.
import * as THREE from 'three';
import { prepareBody, retargetHeadAsset, nearestVertexLookup } from './body.js';
import { prepareClips } from './animation.js';
import { textureAverage, makeSkinMaterial, makeHairMaterial } from './materials.js';
import { makePlan, createBuilder, buildPiece, visibleBodyIndex, buildCollar } from './garments.js';
import { buildSkirt } from './skirt.js';
import { buildHeadwear } from './headwear.js';
import { SKIN_TONES } from './appearance.js';

const HAIR_FILES = {
  buzzed: 'hair_buzzed', buzzedfemale: 'hair_buzzedfemale', buns: 'hair_buns', long: 'hair_long', simpleparted: 'hair_simpleparted', beard: 'hair_beard',
};

/**
 * Load everything characters need, once.
 * @param {{assets: {gltf(path: string): Promise<any>}, renderer?: THREE.WebGLRenderer}} ctx
 */
export async function loadCharacterKit(ctx) {
  const t0 = performance.now();
  const load = (p) => ctx.assets.gltf(`characters/${p}.glb`);
  const optional = (p) => load(p).catch(() => null);
  const [male, female, maleLow, femaleLow, a1, a2, ...hairs] = await Promise.all([
    load('male'), load('female'), optional('male_low'), optional('female_low'), load('anims_1'), load('anims_2'),
    ...Object.values(HAIR_FILES).map(load),
  ]);
  const tPrep = performance.now();
  const bodies = { male: prepareBody(male, maleLow), female: prepareBody(female, femaleLow) };
  const hairGltf = Object.fromEntries(Object.keys(HAIR_FILES).map((k, i) => [k, hairs[i]]));

  // Clips: scale pelvis motion to each body's leg length.
  a1.scene.updateMatrixWorld(true);
  const animPelvisY = new THREE.Vector3().setFromMatrixPosition(a1.scene.getObjectByName('pelvis').matrixWorld).y;
  const allClips = [...a1.animations, ...a2.animations];
  for (const b of Object.values(bodies)) {
    b.clips = prepareClips(allClips, b.lm.pelvisY / animPelvisY);
    b.skinAvg = textureAverage(b.material.map);
    b.template = makeTemplate(b, 'high');
    b.templateLow = b.low ? makeTemplate(b, 'low') : null;
    // Palm normal axes (bone-local) from the rest T-pose: palms face down.
    b.palm = {};
    for (const s of ['l', 'r']) {
      const q = new THREE.Quaternion();
      b.boneRest[b.names.indexOf(`hand_${s}`)].decompose(new THREE.Vector3(), q, new THREE.Vector3());
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(q.clone().invert());
      const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1)];
      b.palm[s] = ax.reduce((best, a) => (a.dot(down) > best.dot(down) ? a : best));
    }
  }

  const anisotropy = Math.min(4, ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const kit = {
    ctx, bodies, hairGltf, anisotropy,
    cache: { geo: new Map(), hair: new Map(), mat: new Map() },
    stats: { loadMs: Math.round(performance.now() - t0), prepareMs: Math.round(performance.now() - tPrep), high: null, low: null, built: 0 },
    makePlan,
    geometryFor: (body, plan, detail) => geometryFor(kit, body, plan, detail),
    hairGeometry: (body, hair, beard) => hairGeometry(kit, body, hair, beard),
    skinMaterial: (body, skin) => cached(kit, `skin|${body.lm.height}|${skin}`, () => makeSkinMaterial(body.material, body.skinAvg, SKIN_TONES[skin])),
    eyesMaterial: (body) => cached(kit, `eyes|${body.lm.height}`, () => { const m = body.eyesMaterial.clone(); m.vertexColors = false; return m; }),
    hairMaterial: (src, color) => cached(kit, `hair|${src.uuid}|${color}`, () => makeHairMaterial(src, color)),
  };
  return kit;
}

function cached(kit, key, make) {
  let v = kit.cache.mat.get(key);
  if (!v) { v = make(); kit.cache.mat.set(key, v); }
  return v;
}

/** Bones + one skinned body mesh, cloned per character with SkeletonUtils. */
function makeTemplate(body, detail) {
  const group = new THREE.Group();
  group.name = 'character-rig';
  const root = body.rootBone.clone(true);
  group.add(root);
  const byName = {};
  root.traverse((o) => { if (o.isBone) byName[o.name] = o; });
  const skeleton = new THREE.Skeleton(body.names.map((n) => byName[n]), body.boneInverses.map((m) => m.clone()));
  const M = detail === 'low' ? body.low : body.high;
  const geo = baseGeometry(M);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.name = 'body';
  mesh.bind(skeleton, new THREE.Matrix4());
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

/** Shared attribute set of a body mesh (indices are swapped per outfit). */
function baseGeometry(M) {
  if (M.baseGeo) return M.baseGeo;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(M.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(M.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(M.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(M.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(M.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(M.index, 1));
  setBounds(g);
  M.baseGeo = g;
  return g;
}

function setBounds(g) {
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.25);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.2, -1), new THREE.Vector3(1, 2.1, 1));
}

/** Turn a builder into a BufferGeometry. */
export function builderToGeometry(b, { rest = true, uv = true } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.sw, 4));
  g.setAttribute('aSlot', new THREE.Float32BufferAttribute(b.slot, 1));
  if (rest) g.setAttribute('aRest', new THREE.Float32BufferAttribute(b.rest, 3));
  const n = b.count();
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  setBounds(g);
  return g;
}

/**
 * Geometry set for a body + plan at a detail level (cached by the plan's structure).
 * high → { body, cloth|null, patterns: [{fabric, geo}] }, low → { merged, slotCount }
 */
function geometryFor(kit, body, plan, detail) {
  const key = `${detail}|${plan.key}`;
  const hit = kit.cache.geo.get(key);
  if (hit) return hit;
  const low = detail === 'low';
  const M = low ? body.low : body.high;
  const uvScale = body.uvScale;
  const opts = (slot) => ({ uvScale, rims: !low, slot, low, boneGroups: body.groups, pelvisIndex: body.pelvisIndex });
  let result;
  if (!low) {
    const plain = createBuilder();
    const pats = plan.fabrics.map(() => createBuilder());
    const target = (item) => (item.fabric !== undefined ? pats[item.fabric] : plain);
    const coversOf = (piece) => (piece.coveredBy || []).map((id) => plan.pieces.find((q) => q.id === id)).filter(Boolean);
    for (const piece of plan.pieces) buildPiece(M, piece, target(piece), { ...opts(piece.slot ?? 0), covers: coversOf(piece) });
    for (const s of plan.skirts) buildSkirt(body, M, s, target(s), { slot: s.slot ?? 0, low: false });
    for (const c of plan.collars) buildCollar(body, M, c, target(c), { slot: c.slot ?? 0, low: false, uvScale }, lookupFor(M));
    if (plan.headwear) {
      buildHeadwear(plan.headwear.kind, body, target(plan.headwear), { slot: plan.headwear.slot ?? 0, low: false, badgeSlot: plan.badgeSlot });
    }
    const bodyGeo = new THREE.BufferGeometry();
    const base = baseGeometry(M);
    for (const [k, v] of Object.entries(base.attributes)) bodyGeo.setAttribute(k, v);
    bodyGeo.setIndex(new THREE.BufferAttribute(visibleBodyIndex(M, plan), 1));
    setBounds(bodyGeo);
    result = {
      body: bodyGeo,
      cloth: plain.idx.length ? builderToGeometry(plain) : null,
      patterns: pats.map((b, i) => ({ fabric: i, geo: b.idx.length ? builderToGeometry(b, { rest: false }) : null })).filter((p) => p.geo),
    };
  } else {
    // One merged geometry: body regions + all garments, coloured by slot.
    const b = createBuilder();
    const fabricSlot = (i) => plan.slots.length + i;
    const visible = visibleBodyIndex(M, plan, 0.006);
    const lm = body.lm;
    const map = new Map();
    const H = lm.head3;
    const hasHair = plan.hair !== 'none';
    for (let t = 0; t < visible.length; t++) {
      const i = visible[t];
      let v = map.get(i);
      if (v === undefined) {
        const p = [M.position[i * 3], M.position[i * 3 + 1], M.position[i * 3 + 2]];
        let slot = 0;
        if (hasHair && M.group[i] === 'head') {
          const front = p[2] > H.center.z + 0.035;
          if (p[1] > (front ? H.eyeY + 0.05 : H.eyeY + 0.005)) slot = 1;
        }
        v = b.vertex(p, [M.normal[i * 3], M.normal[i * 3 + 1], M.normal[i * 3 + 2]], [0, 0],
          [M.skinIndex[i * 4], M.skinIndex[i * 4 + 1], M.skinIndex[i * 4 + 2], M.skinIndex[i * 4 + 3]],
          [M.skinWeight[i * 4], M.skinWeight[i * 4 + 1], M.skinWeight[i * 4 + 2], M.skinWeight[i * 4 + 3]], slot, p);
        map.set(i, v);
      }
      b.idx.push(v);
    }
    const slotOf = (item) => (item.fabric !== undefined ? fabricSlot(item.fabric) : (item.slot ?? 2));
    for (const piece of plan.pieces) buildPiece(M, piece, b, { uvScale: 0, rims: false, slot: slotOf(piece), boneGroups: body.groups, pelvisIndex: body.pelvisIndex, offsetScale: 1.6, covers: (piece.coveredBy || []).map((id) => plan.pieces.find((q) => q.id === id)).filter(Boolean) });
    for (const s of plan.skirts) buildSkirt(body, M, s, b, { slot: slotOf(s), low: true });
    for (const c of plan.collars) buildCollar(body, M, c, b, { slot: slotOf(c), low: true, uvScale: 0 }, lookupFor(M));
    if (plan.headwear) buildHeadwear(plan.headwear.kind, body, b, { slot: slotOf(plan.headwear), low: true });
    result = { merged: builderToGeometry(b, { rest: false, uv: false }), slotCount: plan.slots.length + plan.fabrics.length };
  }
  kit.cache.geo.set(key, result);
  return result;
}

function lookupFor(M) {
  if (!M.lookup) M.lookup = nearestVertexLookup(M);
  return M.lookup;
}

/** Merged hair + eyebrows (+ beard) geometry for a body. */
function hairGeometry(kit, body, hair, beard) {
  const key = `${body.lm.height}|${hair}|${beard}`;
  if (kit.cache.hair.has(key)) return kit.cache.hair.get(key);
  const b = createBuilder();
  let srcMaterial = body.browsMaterial;
  const add = (d) => {
    const n = d.position.length / 3;
    const base = b.count();
    for (let i = 0; i < n; i++) {
      b.vertex([d.position[i * 3], d.position[i * 3 + 1], d.position[i * 3 + 2]], [d.normal[i * 3], d.normal[i * 3 + 1], d.normal[i * 3 + 2]],
        [d.uv[i * 2], d.uv[i * 2 + 1]], [d.skinIndex[i * 4], d.skinIndex[i * 4 + 1], d.skinIndex[i * 4 + 2], d.skinIndex[i * 4 + 3]],
        [d.skinWeight[i * 4], d.skinWeight[i * 4 + 1], d.skinWeight[i * 4 + 2], d.skinWeight[i * 4 + 3]], 0, [0, 0, 0]);
    }
    for (const i of d.index) b.idx.push(base + i);
  };
  if (body.brows) add(body.brows);
  const list = [];
  if (hair && hair !== 'none') list.push(hair);
  if (beard) list.push('beard');
  for (const h of list) {
    const gltf = kit.hairGltf[h];
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    if (!mesh) continue;
    add(retargetHeadAsset(mesh, body, Object.values(kit.bodies)));
    if (h !== 'beard') srcMaterial = mesh.material;
  }
  const res = b.idx.length ? { geo: builderToGeometry(b, { rest: false }), material: srcMaterial } : null;
  kit.cache.hair.set(key, res);
  return res;
}

