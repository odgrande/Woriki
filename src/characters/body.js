// Body preparation: bakes the glTF skinned meshes into a canonical rest space
// (metres, character space: +Y up, faces +Z, left = +X) so every garment, hair and
// headwear piece shares one set of inverse bind matrices and can be merged freely.
import * as THREE from 'three';

/** Bone name → coarse body group, used to keep garments off hands, head, feet. */
export function boneGroup(name) {
  if (name === 'Head') return 'head';
  if (name === 'neck_01') return 'neck';
  if (/^spine_0[123]$/.test(name) || /^clavicle_/.test(name)) return 'torso';
  if (name === 'pelvis' || name === 'root') return 'pelvis';
  if (/^upperarm_/.test(name)) return 'upperarm';
  if (/^lowerarm_/.test(name)) return 'lowerarm';
  if (/^(hand|index|middle|pinky|ring|thumb)_/.test(name)) return 'hand';
  if (/^thigh_/.test(name)) return 'thigh';
  if (/^calf_/.test(name)) return 'calf';
  if (/^(foot|ball)_/.test(name)) return 'foot';
  return 'torso';
}

const _m = new THREE.Matrix4();
const _acc = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * Bake a skinned mesh's current (rest) pose into flat arrays in world space.
 * Skin indices are remapped by bone name onto `targetNames`.
 * @param {THREE.SkinnedMesh} mesh
 * @param {string[]} targetNames
 */
export function bakeSkinned(mesh, targetNames) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  mesh.updateMatrixWorld(true);
  const skel = mesh.skeleton;
  skel.update();
  const bm = skel.boneMatrices;
  const remap = skel.bones.map((b) => targetNames.indexOf(b.name));
  const n = pos.count;
  const out = {
    position: new Float32Array(n * 3),
    normal: new Float32Array(n * 3),
    uv: new Float32Array(n * 2),
    skinIndex: new Uint16Array(n * 4),
    skinWeight: new Float32Array(n * 4),
    index: geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: n }, (_, i) => i),
  };
  for (let i = 0; i < n; i++) {
    _acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w <= 0) continue;
      const b = si.getComponent(i, k);
      _m.fromArray(bm, b * 16);
      for (let e = 0; e < 16; e++) _acc.elements[e] += _m.elements[e] * w;
      wsum += w;
    }
    // bind = bindMatrixInverse * blended * bindMatrix, then into world.
    _m.multiplyMatrices(mesh.bindMatrixInverse, _acc).multiply(mesh.bindMatrix).premultiply(mesh.matrixWorld);
    _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
    _nm.getNormalMatrix(_m);
    if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize(); else _n.set(0, 1, 0);
    out.position.set([_v.x, _v.y, _v.z], i * 3);
    out.normal.set([_n.x, _n.y, _n.z], i * 3);
    if (uv) out.uv.set([uv.getX(i), uv.getY(i)], i * 2);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k) / (wsum || 1);
      const b = si.getComponent(i, k);
      out.skinIndex[i * 4 + k] = w > 0 ? Math.max(0, remap[b]) : 0;
      out.skinWeight[i * 4 + k] = w;
    }
  }
  return out;
}

/** Average normals of coincident vertices so offsets never open cracks at UV seams. */
export function weldNormals(position, normal) {
  const n = position.length / 3;
  const ids = new Int32Array(n);
  const map = new Map();
  const acc = [];
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(position[i * 3] * 2e4)},${Math.round(position[i * 3 + 1] * 2e4)},${Math.round(position[i * 3 + 2] * 2e4)}`;
    let id = map.get(key);
    if (id === undefined) { id = acc.length / 3; map.set(key, id); acc.push(0, 0, 0); }
    ids[i] = id;
    acc[id * 3] += normal[i * 3]; acc[id * 3 + 1] += normal[i * 3 + 1]; acc[id * 3 + 2] += normal[i * 3 + 2];
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    const x = acc[id * 3], y = acc[id * 3 + 1], z = acc[id * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  return { weldId: ids, weldNormal: out };
}

/** Area-weighted vertex normals for meshes without normals (the crowd LOD bodies). */
export function computeNormals(position, index) {
  const n = position.length / 3;
  const out = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const i0 = index[t], i1 = index[t + 1], i2 = index[t + 2];
    a.fromArray(position, i0 * 3); b.fromArray(position, i1 * 3); c.fromArray(position, i2 * 3);
    b.sub(a); c.sub(a); b.cross(c);
    for (const i of [i0, i1, i2]) { out[i * 3] += b.x; out[i * 3 + 1] += b.y; out[i * 3 + 2] += b.z; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]) || 1;
    out[i * 3] /= l; out[i * 3 + 1] /= l; out[i * 3 + 2] /= l;
  }
  return out;
}

function findBodyMesh(scene) {
  let body = null, eyes = null, brows = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (/^eyes$/i.test(o.name)) eyes = o;
    else if (/^eyebrows/i.test(o.name)) brows = o;
    else if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o;
  });
  return { body, eyes, brows };
}

/**
 * Prepare one body type from its glTF (and optional low-detail glTF).
 * @param {import('three/addons/loaders/GLTFLoader.js').GLTF} gltf
 * @param {import('three/addons/loaders/GLTFLoader.js').GLTF} [lowGltf]
 */
export function prepareBody(gltf, lowGltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const { body, eyes, brows } = findBodyMesh(scene);
  const names = body.skeleton.bones.map((b) => b.name);
  const rootBone = body.skeleton.bones.find((b) => b.name === 'root');
  const boneRest = body.skeleton.bones.map((b) => b.matrixWorld.clone());
  const boneInverses = boneRest.map((m) => m.clone().invert());
  const restPos = (name) => new THREE.Vector3().setFromMatrixPosition(boneRest[names.indexOf(name)]);
  const groups = names.map(boneGroup);

  const mesh = (src) => finishMesh(bakeSkinned(src, names), groups);
  const high = mesh(body);
  const eyeData = eyes ? bakeSkinned(eyes, names) : null;
  const browData = brows ? bakeSkinned(brows, names) : null;
  let low = null;
  if (lowGltf) {
    lowGltf.scene.updateMatrixWorld(true);
    const lb = findBodyMesh(lowGltf.scene).body;
    const raw = bakeSkinned(lb, names);
    raw.normal = computeNormals(raw.position, raw.index);
    low = finishMesh(raw, groups);
  }

  const L = {
    pelvis: restPos('pelvis'), spine3: restPos('spine_03'), neck: restPos('neck_01'), head: restPos('Head'),
    shoulderL: restPos('upperarm_l'), elbowL: restPos('lowerarm_l'), wristL: restPos('hand_l'),
    hipL: restPos('thigh_l'), kneeL: restPos('calf_l'), ankleL: restPos('foot_l'), ballL: restPos('ball_l'),
  };
  const lm = {
    ...L,
    shoulderX: L.shoulderL.x, wristX: L.wristL.x, elbowX: L.elbowL.x, armY: L.shoulderL.y,
    neckY: L.neck.y, chestY: L.spine3.y, pelvisY: L.pelvis.y, hipY: L.hipL.y,
    kneeY: L.kneeL.y, ankleY: L.ankleL.y,
    waistY: L.pelvis.y + 0.07,
    height: 0,
  };
  // Measure the body: height, neck radius, head ellipsoid.
  let top = 0;
  const headPts = [];
  const neckR = [];
  for (let i = 0; i < high.count; i++) {
    const y = high.position[i * 3 + 1];
    top = Math.max(top, y);
    const g = high.group[i];
    if (g === 'head') headPts.push(i);
    if ((g === 'neck' || g === 'head') && Math.abs(y - (lm.neckY + 0.02)) < 0.015) {
      neckR.push(Math.hypot(high.position[i * 3], high.position[i * 3 + 2] - L.neck.z));
    }
  }
  lm.height = top;
  neckR.sort((a, b) => a - b);
  lm.neckRadius = neckR.length ? neckR[Math.floor(neckR.length * 0.9)] : 0.06;
  const hb = new THREE.Box3();
  for (const i of headPts) hb.expandByPoint(_v.fromArray(high.position, i * 3));
  // The skull (exclude the jaw/neck): use points above the eyes for the cranium fit.
  const cran = new THREE.Box3();
  const eyeY = eyeData ? avgY(eyeData.position) : hb.min.y + (hb.max.y - hb.min.y) * 0.55;
  for (const i of headPts) { _v.fromArray(high.position, i * 3); if (_v.y > eyeY - 0.01) cran.expandByPoint(_v); }
  lm.head3 = {
    box: hb, cranium: cran, eyeY,
    center: new THREE.Vector3((cran.min.x + cran.max.x) / 2, eyeY + 0.01, (cran.min.z + cran.max.z) / 2),
    rx: (cran.max.x - cran.min.x) / 2, rz: (cran.max.z - cran.min.z) / 2, top: cran.max.y,
    front: cran.max.z, back: cran.min.z,
  };

  return {
    names, groups, rootBone, boneRest, boneInverses, lm,
    high, low, eyes: eyeData, brows: browData,
    material: body.material, eyesMaterial: eyes?.material, browsMaterial: brows?.material,
    hull: buildHull(high, lm),
    uvScale: measureUvScale(high),
    headIndex: names.indexOf('Head'), pelvisIndex: names.indexOf('pelvis'),
  };
}

function avgY(position) {
  let s = 0;
  for (let i = 1; i < position.length; i += 3) s += position[i];
  return s / (position.length / 3);
}

/** Add derived per-vertex data used by the garment builder. */
function finishMesh(raw, groups) {
  const count = raw.position.length / 3;
  const { weldId, weldNormal } = weldNormals(raw.position, raw.normal);
  const dominant = new Uint16Array(count);
  const group = new Array(count);
  for (let i = 0; i < count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (raw.skinWeight[i * 4 + k] > bw) { bw = raw.skinWeight[i * 4 + k]; best = raw.skinIndex[i * 4 + k]; }
    dominant[i] = best;
    group[i] = groups[best];
  }
  return { ...raw, count, weldId, weldNormal, dominant, group };
}

/** Metres per UV unit over the torso and legs (where fabrics are mapped). */
function measureUvScale(m) {
  const ratios = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < m.index.length; t += 3) {
    const i0 = m.index[t], i1 = m.index[t + 1], i2 = m.index[t + 2];
    if (!['torso', 'pelvis', 'thigh', 'calf'].includes(m.group[i0])) continue;
    a.fromArray(m.position, i0 * 3); b.fromArray(m.position, i1 * 3); c.fromArray(m.position, i2 * 3);
    const area3 = b.sub(a).cross(c.sub(a)).length() / 2;
    const u0 = m.uv[i0 * 2], v0 = m.uv[i0 * 2 + 1];
    const areaUv = Math.abs((m.uv[i1 * 2] - u0) * (m.uv[i2 * 2 + 1] - v0) - (m.uv[i2 * 2] - u0) * (m.uv[i1 * 2 + 1] - v0)) / 2;
    if (areaUv > 1e-9 && area3 > 1e-7) ratios.push(Math.sqrt(area3 / areaUv));
  }
  ratios.sort((x, y) => x - y);
  return ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1.6;
}

export const HULL_ANGLES = 48;
export const HULL_STEP = 0.02;

/**
 * Body cross-section hull: for each height slab and angle sector, the largest radius
 * of torso/pelvis/leg vertices from the body axis. Used to fit skirts and robes.
 */
function buildHull(m, lm) {
  const rows = Math.ceil(1.6 / HULL_STEP);
  const zc = lm.pelvis.z + 0.01;
  const r = new Float32Array(rows * HULL_ANGLES);
  for (let i = 0; i < m.count; i++) {
    const g = m.group[i];
    if (g === 'upperarm' || g === 'lowerarm' || g === 'hand' || g === 'head') continue;
    const x = m.position[i * 3], y = m.position[i * 3 + 1], z = m.position[i * 3 + 2] - zc;
    if (Math.abs(x) > lm.shoulderX + 0.02 && y > lm.chestY) continue; // arm stubs in T-pose
    const row = Math.round(y / HULL_STEP);
    if (row < 0 || row >= rows) continue;
    const ang = Math.atan2(x, z);
    const s = ((Math.round((ang / (Math.PI * 2)) * HULL_ANGLES) % HULL_ANGLES) + HULL_ANGLES) % HULL_ANGLES;
    const rad = Math.hypot(x, z);
    for (const d of [-1, 0, 1]) {
      const rr = row + d;
      if (rr >= 0 && rr < rows) r[rr * HULL_ANGLES + s] = Math.max(r[rr * HULL_ANGLES + s], rad);
    }
  }
  // Fill empty sectors and smooth around the ring.
  const out = new Float32Array(r.length);
  for (let row = 0; row < rows; row++) {
    for (let s = 0; s < HULL_ANGLES; s++) {
      let v = 0;
      for (let d = -2; d <= 2; d++) v = Math.max(v, r[row * HULL_ANGLES + ((s + d + HULL_ANGLES) % HULL_ANGLES)] * (1 - Math.abs(d) * 0.04));
      out[row * HULL_ANGLES + s] = v;
    }
  }
  return {
    zc, rows, data: out,
    /** Radius at height y and angle (0 = front, +PI/2 = left). */
    at(y, ang) {
      const row = Math.max(0, Math.min(rows - 1, Math.round(y / HULL_STEP)));
      const f = (((ang / (Math.PI * 2)) * HULL_ANGLES) % HULL_ANGLES + HULL_ANGLES) % HULL_ANGLES;
      const s0 = Math.floor(f), s1 = (s0 + 1) % HULL_ANGLES, t = f - s0;
      return out[row * HULL_ANGLES + s0] * (1 - t) + out[row * HULL_ANGLES + s1] * t;
    },
  };
}

/**
 * Bake a separately-skinned asset (hair) onto a target body: its own rest pose is baked,
 * then moved from the source skeleton's head onto the target's head, scaled to fit.
 * @param {THREE.SkinnedMesh} mesh
 * @param {ReturnType<typeof prepareBody>} target
 * @param {ReturnType<typeof prepareBody>[]} bodies candidate source bodies
 */
export function retargetHeadAsset(mesh, target, bodies) {
  const data = bakeSkinned(mesh, target.names);
  mesh.updateMatrixWorld(true);
  // Which body skeleton was this asset rigged on? Compare the source head bone position.
  const srcHeadBone = mesh.skeleton.bones.find((b) => b.name === 'Head');
  const srcHead = srcHeadBone.matrixWorld.clone();
  const srcPos = new THREE.Vector3().setFromMatrixPosition(srcHead);
  let source = target, best = Infinity;
  for (const b of bodies) {
    const d = b.lm.head.distanceTo(srcPos);
    if (d < best) { best = d; source = b; }
  }
  const tgtHead = target.boneRest[target.headIndex];
  const sx = (target.lm.head3.rx / source.lm.head3.rx);
  const sz = (target.lm.head3.rz / source.lm.head3.rz);
  const sy = (sx + sz) / 2;
  // Head-local scale about the source cranium centre so the hair hugs the new skull.
  const c = source.lm.head3.center;
  const toLocal = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  const scale = new THREE.Matrix4().makeScale(sx, sy, sz);
  const back = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
  const fit = back.multiply(scale).multiply(toLocal);
  const m = new THREE.Matrix4().multiplyMatrices(tgtHead, srcHead.clone().invert()).multiply(fit);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < data.position.length / 3; i++) {
    _v.fromArray(data.position, i * 3).applyMatrix4(m).toArray(data.position, i * 3);
    _n.fromArray(data.normal, i * 3).applyMatrix3(nm).normalize().toArray(data.normal, i * 3);
  }
  return data;
}
