// Geometry batching: every static piece of the map is added to a per-material bucket
// and merged into one mesh per material at the end (few draw calls). Repeated props are
// built once as a "kit" (Map<materialKey, BufferGeometry>) and placed either by merging
// transformed copies or as InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Compose a matrix from position, Y/X/Z rotation and scale. */
export function mat(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Normalise attributes so geometries can be merged: indexed, position/normal/uv/color only. */
function prep(geo) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.color) {
    const c = new Float32Array(n * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

function setColor(geo, color) {
  _c.set(color);
  const a = geo.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, _c.r, _c.g, _c.b);
}

/** Box-project UVs in metres from (already transformed) positions and normals. */
export function boxUV(geo, ox = 0, oz = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, y = p.getY(i), z = p.getZ(i) + oz;
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x, -z);
    else if (nx >= nz) uv.setXY(i, n.getX(i) > 0 ? -z : z, y);
    else uv.setXY(i, n.getZ(i) > 0 ? x : -x, y);
  }
  uv.needsUpdate = true;
}

/** Map a geometry's 0..1 UVs into an atlas rectangle. */
export function rectUV(geo, r) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  uv.needsUpdate = true;
}

/** A bucketed collection of geometry keyed by material name. */
export class Batch {
  constructor() {
    /** @type {Map<string, THREE.BufferGeometry[]>} */
    this.parts = new Map();
    this.tris = 0;
  }

  /**
   * @param {string} key material key
   * @param {THREE.BufferGeometry} geo (consumed)
   * @param {{m?: THREE.Matrix4, color?: any, uv?: 'keep'|'box'|{u0,v0,u1,v1}, uvScale?: number}} [o]
   */
  add(key, geo, o = {}) {
    prep(geo);
    if (o.uv && typeof o.uv === 'object') rectUV(geo, o.uv);
    if (o.m) geo.applyMatrix4(o.m);
    if (o.color !== undefined) setColor(geo, o.color);
    if (o.uv === 'box') boxUV(geo);
    if (o.uvScale) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * o.uvScale, uv.getY(i) * o.uvScale); }
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geo);
    this.tris += geo.index.count / 3;
    return geo;
  }

  /** Axis-aligned (or Y-rotated) box by centre and size. Box-mapped UVs in metres by default. */
  box(key, x, y, z, sx, sy, sz, o = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    return this.add(key, g, { uv: 'box', ...o, m: o.m ? o.m.clone().multiply(mat(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0)) : mat(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0) });
  }

  /** Box from min/max corners. */
  boxMM(key, x0, y0, z0, x1, y1, z1, o = {}) {
    return this.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
  }

  /** Cylinder standing on (x, y, z) with its base at y. */
  cyl(key, x, y, z, rt, rb, h, seg = 8, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open);
    const base = mat(x, y + h / 2, z, o.ry || 0, o.rx || 0, o.rz || 0);
    return this.add(key, g, { uv: 'keep', ...o, m: o.m ? o.m.clone().multiply(base) : base });
  }

  /** A quad of size w × h centred at (x, y, z) facing +Z, then rotated by ry (and rx). */
  quad(key, x, y, z, w, h, o = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    const base = mat(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0);
    return this.add(key, g, { uv: 'keep', ...o, m: o.m ? o.m.clone().multiply(base) : base });
  }

  /** Merge a kit (Map<key, geo>) transformed by m, optionally recoloured. */
  place(kit, m, color) {
    for (const [key, geo] of kit) {
      const g = geo.clone();
      g.applyMatrix4(m);
      if (color !== undefined) setColor(g, color);
      if (!this.parts.has(key)) this.parts.set(key, []);
      this.parts.get(key).push(g);
      this.tris += g.index.count / 3;
    }
  }

  /** Merge buckets → Map<key, BufferGeometry>. */
  finish() {
    const out = new Map();
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      out.set(key, merged);
    }
    this.parts.clear();
    return out;
  }
}

/** Build a reusable kit from a builder callback. */
export function kit(fn) {
  const b = new Batch();
  fn(b);
  return b.finish();
}

/** Count triangles in a kit. */
export function kitTris(k) { let t = 0; for (const g of k.values()) t += g.index.count / 3; return t; }

/**
 * Make one InstancedMesh per material of a kit.
 * @param {Map<string, THREE.BufferGeometry>} k
 * @param {Record<string, THREE.Material>} mats
 * @param {THREE.Matrix4[]} matrices
 * @param {(THREE.Color|string|null)[]} [colors]
 */
export function instanced(k, mats, matrices, colors, { cast = true, receive = true, name = '', tint = ['plastic', 'fabric', 'paint'] } = {}) {
  const out = [];
  for (const [key, geo] of k) {
    const im = new THREE.InstancedMesh(geo, mats[key], matrices.length);
    im.name = `${name}:${key}`;
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    if (colors && tint.includes(key)) {
      colors.forEach((c, i) => im.setColorAt(i, _c.set(c || '#ffffff')));
    }
    im.castShadow = cast; im.receiveShadow = receive;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    out.push(im);
  }
  return out;
}

/** Quadratic Bézier sampled as a polyline (for wires and fronds). */
export function bezier(a, b, c, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push(new THREE.Vector3(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z));
  }
  return pts;
}

/** Quad from 4 corners (counter-clockwise seen from the front) with metre UVs (u along a→b, v along a→d). */
export function quad4(a, b, c, d, uvScale = 1) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z]);
  const lu = a.distanceTo(b) * uvScale, lv = a.distanceTo(d) * uvScale;
  const uv = new Float32Array([0, 0, lu, 0, lu, lv, 0, lv]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export { _n as tmpVec };
