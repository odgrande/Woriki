// Long garments (gowns, robes, agbada, wrappers, aprons): a flared skirt piece fitted to
// the body's cross-section, skinned to a small procedural rig parented to the pelvis.
// Four panel bones pivot at the hips and follow the legs outward only (front panel = the
// forward leg, back panel = the rear leg, sides = their own leg); four knee bones follow
// the calves and gravity. So the cloth clears the legs when walking and drapes over the
// lap and down the shins when sitting, without any cloth simulation.
import * as THREE from 'three';
import { smooth } from './garments.js';
import { nearestVertexLookup } from './body.js';

export const SKIRT_BONES = ['skirt_root', 'skirt_F', 'skirt_L', 'skirt_B', 'skirt_R', 'skirt_F2', 'skirt_L2', 'skirt_B2', 'skirt_R2'];

/** Rest-pose rig layout for a body (character space). */
export function skirtRigLayout(body) {
  const lm = body.lm;
  const pivot = new THREE.Vector3(0, lm.hipY, (lm.hipL.z + lm.pelvis.z) / 2);
  const knee = lm.hipY - lm.kneeY;
  const rest = SKIRT_BONES.map((_, i) => new THREE.Matrix4().makeTranslation(pivot.x, pivot.y - (i >= 5 ? knee : 0), pivot.z));
  return { pivot, knee, rest, inverses: rest.map((m) => m.clone().invert()), base: body.names.length };
}

/**
 * Generate a skirt into a builder.
 * @param {object} body prepared body
 * @param {object} M body mesh data (high or low)
 * @param {object} spec plan skirt spec
 * @param {ReturnType<typeof import('./garments.js').createBuilder>} b
 * @param {{slot: number, low: boolean, slotFor?: (band) => number}} o
 */
export function buildSkirt(body, M, spec, b, o) {
  const hull = body.hull;
  const rig = skirtRigLayout(body);
  const zc = hull.zc;
  const low = o.low;
  const arc = spec.arc || [-Math.PI, Math.PI];
  const span = arc[1] - arc[0];
  const segs = Math.max(6, Math.round((low ? 14 : 36) * span / (Math.PI * 2)));
  const rowsN = low ? 7 : 16;
  const top = spec.topY, hem = spec.hemY;
  const lookup = nearestVertexLookup(M);

  // Column angles: uniform, plus exact band edges (stole) so colours change crisply.
  const rFront = hull.at(top, 0) + spec.ease;
  const cuts = [];
  for (let i = 0; i <= segs; i++) cuts.push(arc[0] + (span * i) / segs);
  const bandRanges = [];
  const edges = []; // {ang, x} band edges (x is kept constant down the skirt)
  for (const band of spec.bands || []) {
    for (const sgn of [1, -1]) {
      const x0 = sgn * band.x - band.halfW, x1 = sgn * band.x + band.halfW;
      const a0 = Math.asin(Math.max(-1, Math.min(1, x0 / rFront)));
      const a1 = Math.asin(Math.max(-1, Math.min(1, x1 / rFront)));
      bandRanges.push({ a0, a1, slot: band.slot });
      edges.push({ ang: a0, x: x0 }, { ang: a1, x: x1 });
    }
  }
  // no uniform columns inside a band, so the band can narrow per row without crossing
  const inBand = (a) => bandRanges.some((r) => a > r.a0 - 0.02 && a < r.a1 + 0.02);
  const all = [...cuts.filter((a) => !inBand(a)), ...edges.map((e) => e.ang)].sort((x, y) => x - y);
  const angles = all.filter((v, i) => i === 0 || v - all[i - 1] > 1e-4);
  const edgeX = angles.map((a) => { const e = edges.find((q) => Math.abs(q.ang - a) < 1e-6); return e ? e.x : null; });
  const slotAt = (ang) => {
    for (const r of bandRanges) if (ang > r.a0 && ang < r.a1) return r.slot;
    return o.slot;
  };
  // Rows: uniform in t, but always one at the hip pivot.
  const ys = [];
  for (let j = 0; j <= rowsN; j++) ys.push(top - ((top - hem) * j) / rowsN);

  // Cumulative max of the body hull from the top down, per angle.
  const radius = (ang, y) => {
    let r = 0;
    for (let yy = top; yy >= y - 1e-6; yy -= 0.02) r = Math.max(r, hull.at(yy, ang));
    return Math.max(r, hull.at(y, ang));
  };

  const pos = [], restOnBody = [];
  const nCols = angles.length;
  for (let j = 0; j < ys.length; j++) {
    const y = ys[j];
    const t = (top - y) / (top - hem);
    const rowFront = radius(0, y) + spec.ease + spec.flare * Math.pow(t, 1.5);
    for (let i = 0; i < nCols; i++) {
      // band edges keep a constant x (a stole hangs straight), other columns are uniform
      const ang = edgeX[i] === null ? angles[i] : Math.asin(Math.max(-1, Math.min(1, edgeX[i] / rowFront)));
      const rb = radius(ang, y);
      let r = rb + spec.ease + spec.flare * Math.pow(t, 1.5);
      if (!spec.arc) r += (spec.foldAmp || 0) * smooth(0.05, 0.6, t) * Math.sin(ang * (spec.folds || 8) + 1.3);
      if (spec.wrapFold) r += 0.012 * Math.exp(-(((ang - 0.42) / 0.06) ** 2)) * smooth(0.12, 0.4, t);
      const xs = 1 + (spec.xScale - 1) * smooth(0, spec.scaleIn || 0.25, t);
      const zs = 1 + (spec.zScale - 1) * smooth(0, spec.scaleIn || 0.25, t);
      pos.push([Math.sin(ang) * r * xs, y, zc + Math.cos(ang) * r * zs]);
      restOnBody.push([Math.sin(ang) * rb, y, zc + Math.cos(ang) * rb]);
    }
  }

  // Skin weights.
  const weights = [];
  const pivotY = rig.pivot.y;
  for (let j = 0; j < ys.length; j++) {
    for (let i = 0; i < nCols; i++) {
      const k = j * nCols + i;
      const [x, y, z] = restOnBody[k];
      const ang = angles[i];
      const w = new Map();
      const add = (bone, v) => { if (v > 1e-4) w.set(bone, (w.get(bone) || 0) + v); };
      const s = (pivotY - y) / rig.knee;
      const wBody = y >= pivotY ? 1 : 1 - smooth(0, 0.35, s);
      if (wBody > 0) {
        const bi = lookup(x, Math.max(y, pivotY - 0.01), z);
        if (bi >= 0) for (let q = 0; q < 4; q++) add(M.skinIndex[bi * 4 + q], M.skinWeight[bi * 4 + q] * wBody);
      }
      if (wBody < 1) {
        const wl = smooth(0.7, 1.15, s);
        const pw = [Math.max(0, Math.cos(ang)) ** 2, Math.max(0, Math.sin(ang)) ** 2, Math.max(0, -Math.cos(ang)) ** 2, Math.max(0, -Math.sin(ang)) ** 2];
        for (let p = 0; p < 4; p++) {
          add(rig.base + 1 + p, (1 - wBody) * pw[p] * (1 - wl));
          add(rig.base + 5 + p, (1 - wBody) * pw[p] * wl);
        }
      }
      const top4 = [...w.entries()].sort((a1, a2) => a2[1] - a1[1]).slice(0, 4);
      const sum = top4.reduce((acc, e) => acc + e[1], 0) || 1;
      const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
      top4.forEach(([bone, v], q) => { si[q] = bone; sw[q] = v / sum; });
      weights.push({ si, sw });
    }
  }

  // Normals from the grid.
  const nrm = [];
  for (let j = 0; j < ys.length; j++) {
    for (let i = 0; i < nCols; i++) {
      const P = (jj, ii) => pos[Math.max(0, Math.min(ys.length - 1, jj)) * nCols + Math.max(0, Math.min(nCols - 1, ii))];
      let a = P(j, i + 1), c = P(j, i - 1);
      if (!spec.arc && (i === 0 || i === nCols - 1)) { a = P(j, 1); c = P(j, nCols - 2); }
      const tu = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
      const d0 = P(j - 1, i), d1 = P(j + 1, i);
      const tv = [d0[0] - d1[0], d0[1] - d1[1], d0[2] - d1[2]];
      // outward = tu x tv (tu goes around +angle, tv goes up)
      const n = [tu[1] * tv[2] - tu[2] * tv[1], tu[2] * tv[0] - tu[0] * tv[2], tu[0] * tv[1] - tu[1] * tv[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nrm.push([n[0] / l, n[1] / l, n[2] / l]);
    }
  }

  // Emit: each angular interval gets its own vertices at band edges (crisp colour change).
  const rRef = rFront;
  const emitLayer = (inner) => {
    const ids = new Map();
    const vid = (j, i, slot) => {
      const key = `${j},${i},${slot}`;
      let v = ids.get(key);
      if (v !== undefined) return v;
      const k = j * nCols + i;
      const n = nrm[k];
      const p = pos[k];
      const th = inner ? -0.004 : 0;
      const q = [p[0] + n[0] * th, p[1] + n[1] * th, p[2] + n[2] * th];
      const nn = inner ? [-n[0], -n[1], -n[2]] : n;
      v = b.vertex(q, nn, [angles[i] * rRef, ys[j]], weights[k].si, weights[k].sw, slot, restOnBody[k]);
      ids.set(key, v);
      return v;
    };
    for (let j = 0; j < ys.length - 1; j++) {
      for (let i = 0; i < nCols - 1; i++) {
        const slot = slotAt((angles[i] + angles[i + 1]) / 2);
        const a = vid(j, i, slot), c = vid(j, i + 1, slot), d = vid(j + 1, i, slot), e = vid(j + 1, i + 1, slot);
        if (inner) b.idx.push(a, c, d, c, e, d); else b.idx.push(a, d, c, c, d, e);
      }
    }
    return vid;
  };
  const outer = emitLayer(false);
  if (low) return;
  const inner = emitLayer(true);
  // Hem (and open sides of an apron) thickness.
  const rim = (j0, i0, j1, i1) => {
    const slot = slotAt((angles[i0] + angles[i1]) / 2);
    const a = outer(j0, i0, slot), c = outer(j1, i1, slot), a2 = inner(j0, i0, slot), c2 = inner(j1, i1, slot);
    b.idx.push(a, a2, c2, a, c2, c);
  };
  const last = ys.length - 1;
  for (let i = 0; i < nCols - 1; i++) rim(last, i, last, i + 1);
  if (spec.arc) {
    for (let j = 0; j < last; j++) { rim(j, 0, j + 1, 0); rim(j + 1, nCols - 1, j, nCols - 1); }
  }
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * Per-character skirt rig: creates the bones under the pelvis and drives them each frame.
 * @param {Record<string, THREE.Bone>} bones character bones by name
 * @param {object} body prepared body
 * @param {{gravity: number, margin: number}} params
 */
export function createSkirtRig(bones, body, params) {
  const layout = skirtRigLayout(body);
  const pelvis = bones.pelvis;
  const pelvisRest = body.boneRest[body.pelvisIndex];
  const local = new THREE.Matrix4().copy(pelvisRest).invert().multiply(layout.rest[0]);
  const root = new THREE.Bone();
  root.name = SKIRT_BONES[0];
  local.decompose(root.position, root.quaternion, root.scale);
  pelvis.add(root);
  const panels = [], lowers = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Bone(); p.name = SKIRT_BONES[1 + i]; root.add(p); panels.push(p);
    const l = new THREE.Bone(); l.name = SKIRT_BONES[5 + i]; l.position.set(0, -layout.knee, 0); root.add(l); lowers.push(l);
  }
  const Qs = root.quaternion.clone();
  const QsInv = Qs.clone().invert();
  const Y = new THREE.Vector3(0, 1, 0);
  const thighL = bones.thigh_l, thighR = bones.thigh_r, calfL = bones.calf_l, calfR = bones.calf_r;
  // Rest directions in skirt space.
  const dirOf = (q) => Y.clone().applyQuaternion(q).applyQuaternion(QsInv).normalize();
  const restTL = dirOf(thighL.quaternion), restTR = dirOf(thighR.quaternion);
  const restCL = dirOf(thighL.quaternion.clone().multiply(calfL.quaternion));
  const restCR = dirOf(thighR.quaternion.clone().multiply(calfR.quaternion));
  const targets = panels.map(() => new THREE.Quaternion());
  const ltargets = lowers.map(() => new THREE.Quaternion());
  const tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lt = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const tl = new THREE.Vector3(), tr = new THREE.Vector3(), cl = new THREE.Vector3(), cr = new THREE.Vector3();
  const down = new THREE.Vector3();
  const qDown = new THREE.Quaternion();
  const g = params.gravity, margin = params.margin;
  let first = true;

  const legTarget = (thigh, restDir, out) => {
    _v.copy(Y).applyQuaternion(thigh.quaternion).applyQuaternion(QsInv).normalize();
    _q.setFromUnitVectors(restDir, _v);
    return out.copy(DOWN).applyQuaternion(_q);
  };
  const calfTarget = (thigh, calf, restDir, out) => {
    _q2.copy(thigh.quaternion).multiply(calf.quaternion);
    _v.copy(Y).applyQuaternion(_q2).applyQuaternion(QsInv).normalize();
    _q.setFromUnitVectors(restDir, _v);
    return out.copy(DOWN).applyQuaternion(_q);
  };
  const aim = (target, out, m) => {
    const ang = DOWN.angleTo(target);
    out.setFromUnitVectors(DOWN, target);
    if (ang > 1e-4) out.slerp(_q.identity(), Math.min(1, m / ang)).normalize();
    return out;
  };

  return {
    bones: [root, ...panels, ...lowers],
    inverses: layout.inverses,
    update(dt) {
      // World "down" in skirt space (characters only yaw, so this is pelvis-relative).
      qDown.copy(bones.root.quaternion).multiply(pelvis.quaternion).multiply(Qs).invert();
      down.copy(DOWN).applyQuaternion(qDown);
      legTarget(thighL, restTL, tl);
      legTarget(thighR, restTR, tr);
      calfTarget(thighL, calfL, restCL, cl);
      calfTarget(thighR, calfR, restCR, cr);
      const leftFront = tl.z >= tr.z;
      // F, L, B, R upper targets (outward only, centred front/back).
      tmp[0].copy(leftFront ? tl : tr); tmp[0].x *= 0.3;
      tmp[1].copy(tl); tmp[1].x = Math.max(0, tmp[1].x);
      tmp[2].copy(leftFront ? tr : tl); tmp[2].x *= 0.3;
      tmp[3].copy(tr); tmp[3].x = Math.min(0, tmp[3].x);
      lt[0].copy(leftFront ? cl : cr); lt[0].x *= 0.3;
      lt[1].copy(cl); lt[1].x = Math.max(0, lt[1].x);
      lt[2].copy(leftFront ? cr : cl); lt[2].x *= 0.3;
      lt[3].copy(cr); lt[3].x = Math.min(0, lt[3].x);
      const k = first ? 1 : 1 - Math.exp(-dt * 16);
      first = false;
      for (let i = 0; i < 4; i++) {
        tmp[i].normalize().lerp(down, g * 0.35).normalize();
        aim(tmp[i], targets[i], margin);
        panels[i].quaternion.slerp(targets[i], k);
        // Squash front/back panels as they swing up so the lap stays close to the thighs.
        const lift = 1 - Math.abs(_v.copy(Y).applyQuaternion(panels[i].quaternion).y);
        if (i === 0 || i === 2) panels[i].scale.set(1, 1, 1 - 0.5 * Math.max(0, lift));
        // Knee bones hang from the panel's knee point.
        lowers[i].position.set(0, -layout.knee, 0).applyQuaternion(panels[i].quaternion);
        lt[i].normalize().lerp(down, g).normalize();
        aim(lt[i], ltargets[i], margin * 0.5);
        lowers[i].quaternion.slerp(ltargets[i], k);
      }
    },
  };
}
