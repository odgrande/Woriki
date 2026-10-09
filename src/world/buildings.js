// Architectural helpers: walls with door/window openings, burglar-proof windows, roofs,
// closed background buildings, block fences and signboards. All axis-aligned.
import * as THREE from 'three';
import { mat, quad4, rectUV } from './geo.js';
import { atlasBox } from './props.js';
import { rng } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Builder state shared by all area builders.
 * @typedef {{ b: import('./geo.js').Batch, col: any[], P: Record<string, any>, S: Record<string, any>,
 *   collide(x0,y0,z0,x1,y1,z1,kind?): void, cylinder(x,z,r,h): void }} W
 */

/** A window inserted in an opening on a wall. axis 'x' = wall runs along X (normal ±Z). */
function windowFill(W, axis, c, out, a, b, y0, y1, t, o) {
  const { b: B, P } = W;
  const w = b - a, h = y1 - y0, cx = (a + b) / 2, cy = (y0 + y1) / 2;
  const ry = axis === 'x' ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2);
  const at = (d) => (axis === 'x' ? [cx, cy, c + out * d] : [c + out * d, cy, cx]);
  if (o.type !== 'hallwin') {
    const R = P[o.win || 'win-louvre-a'];
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(w, h); rectUV(g, R);
      const [x, y, z] = at(s * 0.02);
      B.add('props', g, { m: mat(x, y, z, ry + (s < 0 ? Math.PI : 0)) });
    }
  }
  // burglar-proof grille on the outside face (and inside for open hall windows)
  const gc = o.grille ?? '#161616';
  if (gc) {
    const [x, y, z] = at(t / 2 + 0.015);
    const g = new THREE.PlaneGeometry(w, h);
    B.add('grille', g, { m: mat(x, y, z, ry), color: gc });
  }
  // sill
  const [sx, , sz] = at(t / 2 + 0.05);
  if (axis === 'x') B.box('concrete', cx, y0 - 0.03, sz, w + 0.16, 0.06, 0.14, { color: o.sill || '#cfc9bb' });
  else B.box('concrete', sx, y0 - 0.03, cx, 0.14, 0.06, w + 0.16, { color: o.sill || '#cfc9bb' });
  // thin frame on both faces
  const fc = o.frame || '#e7e2d6';
  for (const s of [1, -1]) {
    const d = s * (t / 2 + 0.005);
    if (axis === 'x') {
      B.box('paint', cx, y1 - 0.025, c + d, w, 0.05, 0.02, { color: fc, uv: 'keep' });
      B.box('paint', a + 0.025, cy, c + d, 0.05, h, 0.02, { color: fc, uv: 'keep' });
      B.box('paint', b - 0.025, cy, c + d, 0.05, h, 0.02, { color: fc, uv: 'keep' });
    } else {
      B.box('paint', c + d, y1 - 0.025, cx, 0.02, 0.05, w, { color: fc, uv: 'keep' });
      B.box('paint', c + d, cy, a + 0.025, 0.02, h, 0.05, { color: fc, uv: 'keep' });
      B.box('paint', c + d, cy, b - 0.025, 0.02, h, 0.05, { color: fc, uv: 'keep' });
    }
  }
}

/** Door frame + optional leaf swung open 90° towards the inside. Returns the leaf pivot info. */
function doorFill(W, axis, c, out, a, b, y0, y1, t, o) {
  const { b: B, P } = W;
  const w = b - a, h = y1 - y0;
  const fc = o.frame || '#5e381f';
  if (axis === 'x') {
    B.box('wood', a - 0.04, y0 + h / 2, c, 0.08, h, t + 0.04, { color: fc });
    B.box('wood', b + 0.04, y0 + h / 2, c, 0.08, h, t + 0.04, { color: fc });
    B.box('wood', (a + b) / 2, y1 + 0.04, c, w + 0.16, 0.08, t + 0.04, { color: fc });
  } else {
    B.box('wood', c, y0 + h / 2, a - 0.04, t + 0.04, h, 0.08, { color: fc });
    B.box('wood', c, y0 + h / 2, b + 0.04, t + 0.04, h, 0.08, { color: fc });
    B.box('wood', c, y1 + 0.04, (a + b) / 2, t + 0.04, 0.08, w + 0.16, { color: fc });
  }
  if (!o.leaf) return null;
  const leaves = o.double ? 2 : 1;
  const lw = w / leaves;
  const out2 = [];
  for (let i = 0; i < leaves; i++) {
    const hinge = i === 0 ? a : b;
    const sgn = i === 0 ? 1 : -1;
    const R = P[o.leaf];
    const g = atlasBox(lw - 0.02, h - 0.02, 0.05, { all: P.black, pz: R, nz: R });
    // pivot at hinge; open into the room (−out side)
    const inward = -out;
    let m;
    if (axis === 'x') {
      const px = hinge, pz = c + inward * 0.06;
      const ang = o.closed ? 0 : sgn * inward * Math.PI / 2 * 0.95;
      m = mat(px, y0 + h / 2, pz, ang).multiply(mat(sgn * lw / 2, 0, 0));
    } else {
      const pz = hinge, px = c + inward * 0.06;
      const ang = o.closed ? Math.PI / 2 : Math.PI / 2 - sgn * inward * Math.PI / 2 * 0.95;
      m = mat(px, y0 + h / 2, pz, ang).multiply(mat(-sgn * lw / 2, 0, 0));
    }
    if (o.dynamic) out2.push({ geo: g, matrix: m, hingeAxis: axis, hinge, c, sgn, inward, lw, y: y0 + h / 2 });
    else B.add('props', g, { m });
  }
  return out2;
}

/**
 * Axis-aligned wall with openings.
 * @param {W} W
 * @param {'x'|'z'} axis wall runs along X (at z = c) or along Z (at x = c)
 * @param {number} s0 start along axis @param {number} s1 end along axis
 * @param {number} c position on the other axis (wall centre line)
 * @param {object} o { y0=0, h, t=0.22, out=+1, color, inner?, mat='plaster', openings: [{a,b,y0,y1,type:'door'|'window'|'hallwin'|'open', win, grille, leaf, double, dynamic}], kind }
 */
export function wall(W, axis, s0, s1, c, o) {
  const { b: B } = W;
  const y0 = o.y0 ?? 0, h = o.h, t = o.t ?? 0.22, out = o.out ?? 1, key = o.mat || 'plaster';
  const ops = [...(o.openings || [])].sort((p, q) => p.a - q.a);
  const piece = (a, b, ya, yb) => {
    if (b - a < 0.005 || yb - ya < 0.005) return;
    const L = b - a, H = yb - ya, m = (a + b) / 2, my = (ya + yb) / 2;
    if (o.inner) {
      // two-tone wall: outer half and inner half
      const ho = t / 2;
      if (axis === 'x') {
        B.box(key, m, my, c + out * ho / 2, L, H, ho, { color: o.color });
        B.box(key, m, my, c - out * ho / 2, L, H, ho, { color: o.inner });
      } else {
        B.box(key, c + out * ho / 2, my, m, ho, H, L, { color: o.color });
        B.box(key, c - out * ho / 2, my, m, ho, H, L, { color: o.inner });
      }
    } else if (axis === 'x') B.box(key, m, my, c, L, H, t, { color: o.color });
    else B.box(key, c, my, m, t, H, L, { color: o.color });
  };
  let cur = s0;
  const leaves = [];
  for (const op of ops) {
    piece(cur, op.a, y0, y0 + h);
    const oy0 = op.y0 ?? 0, oy1 = Math.min(op.y1 ?? 2.1, h);
    piece(op.a, op.b, y0, y0 + oy0);
    piece(op.a, op.b, y0 + oy1, y0 + h);
    if (op.type === 'door') { const l = doorFill(W, axis, c, out, op.a, op.b, y0 + oy0, y0 + oy1, t, op); if (l) leaves.push(...l); }
    else if (op.type === 'window' || op.type === 'hallwin') windowFill(W, axis, c, out, op.a, op.b, y0 + oy0, y0 + oy1, t, op);
    cur = op.b;
  }
  piece(cur, s1, y0, y0 + h);
  // colliders: split only at walkable openings
  if (o.collide !== false) {
    let cs = s0;
    const walk = ops.filter((p) => p.type === 'door' || p.type === 'open');
    for (const p of walk) { if (p.a > cs) collideSeg(W, axis, cs, p.a, c, t, y0, y0 + h, o.kind); cs = p.b; }
    if (s1 > cs) collideSeg(W, axis, cs, s1, c, t, y0, y0 + h, o.kind);
  }
  return leaves;
}

function collideSeg(W, axis, a, b, c, t, y0, y1, kind = 'wall') {
  if (axis === 'x') W.collide(a, y0, c - t / 2, b, y1, c + t / 2, kind);
  else W.collide(c - t / 2, y0, a, c + t / 2, y1, b, kind);
}

/**
 * Gable roof over a rectangle. ridge 'x' runs along X. Adds gable-end triangles in plaster.
 */
export function gableRoof(W, x0, z0, x1, z1, yE, rise, ridge = 'x', o = {}) {
  const { b: B } = W;
  const oh = o.overhang ?? 0.5, color = o.color || '#8c9396', wallColor = o.wallColor || '#efe9dc';
  if (ridge === 'x') {
    const zm = (z0 + z1) / 2, yR = yE + rise;
    const slope = rise / ((z1 - z0) / 2);
    const yO = yE - oh * slope;
    const xa = x0 - oh, xb = x1 + oh;
    B.add('roof', quad4(V(xb, yO, z0 - oh), V(xa, yO, z0 - oh), V(xa, yR, zm), V(xb, yR, zm)), { color });
    B.add('roof', quad4(V(xa, yO, z1 + oh), V(xb, yO, z1 + oh), V(xb, yR, zm), V(xa, yR, zm)), { color });
    B.box('metal', (xa + xb) / 2, yR + 0.04, zm, xb - xa, 0.08, 0.3, { color, uv: 'keep' });
    for (const x of [x0, x1]) gableTri(B, x, z0, z1, yE, yR, 'x', wallColor);
    for (const z of [z0 - oh, z1 + oh]) B.box('paint', (xa + xb) / 2, yO - 0.1, z, xb - xa, 0.22, 0.04, { color: o.fascia || '#e9e4d8', uv: 'keep' });
  } else {
    const xm = (x0 + x1) / 2, yR = yE + rise;
    const slope = rise / ((x1 - x0) / 2);
    const yO = yE - oh * slope;
    const za = z0 - oh, zb = z1 + oh;
    B.add('roof', quad4(V(x0 - oh, yO, za), V(x0 - oh, yO, zb), V(xm, yR, zb), V(xm, yR, za)), { color });
    B.add('roof', quad4(V(x1 + oh, yO, zb), V(x1 + oh, yO, za), V(xm, yR, za), V(xm, yR, zb)), { color });
    B.box('metal', xm, yR + 0.04, (za + zb) / 2, 0.3, 0.08, zb - za, { color, uv: 'keep' });
    for (const z of [z0, z1]) gableTri(B, z, x0, x1, yE, yR, 'z', wallColor);
    for (const x of [x0 - oh, x1 + oh]) B.box('paint', x, yO - 0.1, (za + zb) / 2, 0.04, 0.22, zb - za, { color: o.fascia || '#e9e4d8', uv: 'keep' });
  }
}

function gableTri(B, at, a, b, yE, yR, ridge, color) {
  // triangle in the plane x = at (ridge x) or z = at (ridge z), thickness 0.2 via two faces
  const m = (a + b) / 2;
  const g = new THREE.BufferGeometry();
  let pts;
  if (ridge === 'x') pts = [[at, yE, a], [at, yE, b], [at, yR, m]];
  else pts = [[a, yE, at], [b, yE, at], [m, yR, at]];
  const pos = [];
  for (const d of [-0.11, 0.11]) {
    const P = pts.map(([x, y, z]) => (ridge === 'x' ? [x + d, y, z] : [x, y, z + d]));
    if ((d > 0) === (ridge === 'z')) pos.push(...P[0], ...P[1], ...P[2]); else pos.push(...P[1], ...P[0], ...P[2]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  B.add('plaster', g, { color, uv: 'box' });
}

/** Hip roof (four slopes). */
export function hipRoof(W, x0, z0, x1, z1, yE, rise, o = {}) {
  const { b: B } = W;
  const oh = o.overhang ?? 0.6, color = o.color || '#8c9396';
  const xa = x0 - oh, xb = x1 + oh, za = z0 - oh, zb = z1 + oh;
  const halfShort = Math.min(xb - xa, zb - za) / 2;
  const slope = rise / ((Math.min(x1 - x0, z1 - z0)) / 2);
  const yO = yE - oh * slope, yR = yO + halfShort * slope;
  const alongX = (xb - xa) >= (zb - za);
  const r0 = alongX ? V(xa + halfShort, yR, (za + zb) / 2) : V((xa + xb) / 2, yR, za + halfShort);
  const r1 = alongX ? V(xb - halfShort, yR, (za + zb) / 2) : V((xa + xb) / 2, yR, zb - halfShort);
  const A = V(xa, yO, za), Bv = V(xb, yO, za), C = V(xb, yO, zb), D = V(xa, yO, zb);
  if (alongX) {
    B.add('roof', quad4(Bv, A, r0, r1), { color });
    B.add('roof', quad4(D, C, r1, r0), { color });
    B.add('roof', quad4(A, D, r0, r0.clone()), { color });
    B.add('roof', quad4(C, Bv, r1, r1.clone()), { color });
  } else {
    B.add('roof', quad4(A, D, r1, r0), { color });
    B.add('roof', quad4(C, Bv, r0, r1), { color });
    B.add('roof', quad4(Bv, A, r0, r0.clone()), { color });
    B.add('roof', quad4(D, C, r1, r1.clone()), { color });
  }
  const fc = o.fascia || '#e9e4d8';
  B.box('paint', (xa + xb) / 2, yO - 0.1, za, xb - xa, 0.2, 0.04, { color: fc, uv: 'keep' });
  B.box('paint', (xa + xb) / 2, yO - 0.1, zb, xb - xa, 0.2, 0.04, { color: fc, uv: 'keep' });
  B.box('paint', xa, yO - 0.1, (za + zb) / 2, 0.04, 0.2, zb - za, { color: fc, uv: 'keep' });
  B.box('paint', xb, yO - 0.1, (za + zb) / 2, 0.04, 0.2, zb - za, { color: fc, uv: 'keep' });
  // soffit
  B.box('ceiling', (xa + xb) / 2, yO - 0.21, (za + zb) / 2, xb - xa, 0.02, zb - za, { color: '#f2efe6', uv: 'box' });
}

/** Mono-pitch roof sloping down towards −Z (or +Z if dir = 1). */
export function shedRoof(W, x0, z0, x1, z1, yHigh, yLow, o = {}) {
  const { b: B } = W;
  const color = o.color || '#8c9396';
  if (o.dir === 1) B.add('roof', quad4(V(x0, yHigh, z0), V(x1, yHigh, z0), V(x1, yLow, z1), V(x0, yLow, z1)), { color });
  else B.add('roof', quad4(V(x1, yHigh, z1), V(x0, yHigh, z1), V(x0, yLow, z0), V(x1, yLow, z0)), { color });
}

const WIN_TYPES = ['win-louvre-a', 'win-louvre-b', 'win-louvre-c', 'win-dark', 'win-slide'];

/** Window decoration flat on a solid facade (for closed buildings). face: 'n'|'s'|'e'|'w'. */
function facadeWindow(W, face, x, y, z, w, h, win, grille) {
  const { b: B, P } = W;
  const ry = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face];
  const nx = { s: 0, n: 0, e: 1, w: -1 }[face], nz = { s: 1, n: -1, e: 0, w: 0 }[face];
  const g = new THREE.PlaneGeometry(w, h); rectUV(g, P[win]);
  B.add('props', g, { m: mat(x + nx * 0.012, y, z + nz * 0.012, ry) });
  if (grille) B.add('grille', new THREE.PlaneGeometry(w, h), { m: mat(x + nx * 0.06, y, z + nz * 0.06, ry), color: grille });
  const sw = w + 0.16;
  if (nz) B.box('concrete', x, y - h / 2 - 0.03, z + nz * 0.07, sw, 0.06, 0.14, { color: '#cfc9bb' });
  else B.box('concrete', x + nx * 0.07, y - h / 2 - 0.03, z, 0.14, 0.06, sw, { color: '#cfc9bb' });
}

/**
 * Closed building block with painted facades, windows with burglar bars and a roof.
 * o: { x0,z0,x1,z1, floors, fh, color, base, roof:'hip'|'gable-x'|'gable-z'|'flat', roofColor, seed,
 *      shops: [{face, a, b, sign}], doors: [{face, at, leaf}], balcony: face, noWin: [faces], rebar }
 */
export function block(W, o) {
  const { b: B, P, S } = W;
  const r = rng(o.seed || 1);
  const floors = o.floors || 1, fh = o.fh || 3.2, H = floors * fh;
  const { x0, z0, x1, z1 } = o;
  B.boxMM('plaster', x0, 0, z0, x1, H, z1, { color: o.color });
  // base band and floor slabs
  B.boxMM('plaster', x0 - 0.03, 0, z0 - 0.03, x1 + 0.03, 0.45, z1 + 0.03, { color: o.base || '#8d8a83' });
  for (let f = 1; f < floors; f++) B.boxMM('concrete', x0 - 0.06, f * fh - 0.12, z0 - 0.06, x1 + 0.06, f * fh + 0.1, z1 + 0.06, { color: o.trim || '#d9d3c5' });
  W.collide(x0, 0, z0, x1, H, z1, 'building');
  const winType = WIN_TYPES[(r() * WIN_TYPES.length) | 0];
  const grille = r() < 0.7 ? '#151515' : r() < 0.5 ? '#f2f2ee' : '#1f5c3a';
  const faces = { s: [x0, x1, z1], n: [x0, x1, z0], e: [z0, z1, x1], w: [z0, z1, x0] };
  for (const [face, [a, b, c]] of Object.entries(faces)) {
    if (o.noWin?.includes(face)) continue;
    const L = b - a, n = Math.max(1, Math.floor(L / 3.2));
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const s = a + (i + 0.5) * (L / n);
        const shop = f === 0 && o.shops?.some((p) => p.face === face && s > p.a - 1 && s < p.b + 1);
        const door = f === 0 && o.doors?.some((p) => p.face === face && Math.abs(s - p.at) < 1.2);
        if (shop || door) continue;
        const y = f * fh + 1.0 + 0.6;
        const wt = r() < 0.75 ? winType : WIN_TYPES[(r() * WIN_TYPES.length) | 0];
        if (face === 's' || face === 'n') facadeWindow(W, face, s, y, c, 1.2, 1.2, wt, grille);
        else facadeWindow(W, face, c, y, s, 1.2, 1.2, wt, grille);
      }
    }
  }
  for (const d of o.doors || []) {
    const [a, b, c] = faces[d.face];
    const ry = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[d.face];
    const nx = { s: 0, n: 0, e: 1, w: -1 }[d.face], nz = { s: 1, n: -1, e: 0, w: 0 }[d.face];
    const g = new THREE.PlaneGeometry(1.0, 2.1); rectUV(g, P[d.leaf || 'door-steel']);
    const x = d.face === 's' || d.face === 'n' ? d.at : c, z = d.face === 's' || d.face === 'n' ? c : d.at;
    B.add('props', g, { m: mat(x + nx * 0.015, 1.05, z + nz * 0.015, ry) });
  }
  for (const sp of o.shops || []) {
    const [, , c] = faces[sp.face];
    const ry = { s: 0, n: Math.PI }[sp.face], nz = sp.face === 's' ? 1 : -1;
    const w = sp.b - sp.a, x = (sp.a + sp.b) / 2;
    const g = new THREE.PlaneGeometry(w, 2.4); rectUV(g, P['shop-int']);
    B.add('props', g, { m: mat(x, 1.2, c + nz * 0.012, ry) });
    B.box('metal', x, 2.55, c + nz * 0.12, w + 0.1, 0.3, 0.22, { color: '#8f9598' }); // rolled shutter
    // small zinc awning
    B.add('roof', quad4(V(sp.a - 0.3, 2.95, c + nz * 1.3), V(sp.b + 0.3, 2.95, c + nz * 1.3), V(sp.b + 0.3, 3.25, c), V(sp.a - 0.3, 3.25, c)), { color: '#7d8588' });
    if (nz < 0) { /* north face awning winding flipped is fine with DoubleSide */ }
    if (sp.sign) {
      const sg = new THREE.PlaneGeometry(Math.min(w + 0.6, 4.2), Math.min(w + 0.6, 4.2) / (S[sp.sign].u1 - S[sp.sign].u0) * (S[sp.sign].v1 - S[sp.sign].v0)); rectUV(sg, S[sp.sign]);
      B.add('signs', sg, { m: mat(x, 3.9, c + nz * 0.04, ry) });
    }
  }
  if (o.balcony) {
    const face = o.balcony, nz = face === 's' ? 1 : -1, c = face === 's' ? z1 : z0;
    for (let f = 1; f < floors; f++) {
      const y = f * fh;
      B.boxMM('concrete', x0 + 0.6, y - 0.12, Math.min(c, c + nz * 1.3), x1 - 0.6, y + 0.08, Math.max(c, c + nz * 1.3), { color: o.trim || '#d9d3c5' });
      const g = new THREE.PlaneGeometry(x1 - x0 - 1.2, 1.0);
      B.add('grille', g, { m: mat((x0 + x1) / 2, y + 0.58, c + nz * 1.3, 0), color: grille });
      B.box('paint', (x0 + x1) / 2, y + 1.1, c + nz * 1.3, x1 - x0 - 1.2, 0.05, 0.06, { color: grille, uv: 'keep' });
    }
  }
  const rc = o.roofColor || '#8c9396';
  if (o.roof === 'hip') hipRoof(W, x0, z0, x1, z1, H, Math.min(x1 - x0, z1 - z0) * 0.22, { color: rc });
  else if (o.roof === 'gable-x') gableRoof(W, x0, z0, x1, z1, H, (z1 - z0) * 0.22, 'x', { color: rc, wallColor: o.color });
  else if (o.roof === 'gable-z') gableRoof(W, x0, z0, x1, z1, H, (x1 - x0) * 0.22, 'z', { color: rc, wallColor: o.color });
  else {
    // flat roof with parapet and rebar stubs waiting for the next floor
    const t = 0.15;
    B.boxMM('plaster', x0, H, z0, x1, H + 0.7, z0 + t, { color: o.color });
    B.boxMM('plaster', x0, H, z1 - t, x1, H + 0.7, z1, { color: o.color });
    B.boxMM('plaster', x0, H, z0, x0 + t, H + 0.7, z1, { color: o.color });
    B.boxMM('plaster', x1 - t, H, z0, x1, H + 0.7, z1, { color: o.color });
    if (o.rebar !== false) {
      for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) {
        B.boxMM('concrete', x - 0.15, H, z - 0.15, x + 0.15, H + 0.9, z + 0.15, { color: '#bdb8ad' });
        for (const [dx, dz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) B.box('metal', x + dx, H + 1.4, z + dz, 0.02, 1.0, 0.02, { color: '#6b3a1e', uv: 'keep', rz: dx * 0.6 });
      }
    }
  }
}

/** Block fence along an axis with pillars, base band and coping. gaps: [[a, b], ...] */
export function fence(W, axis, s0, s1, c, o = {}) {
  const { b: B } = W;
  const h = o.h ?? 2.3, t = 0.2, color = o.color || '#efe9dc', base = o.base || '#7b8a96', cap = o.cap || '#d6d0c2';
  const gaps = [...(o.gaps || [])].sort((p, q) => p[0] - q[0]);
  const segs = [];
  let cur = s0;
  for (const [a, b] of gaps) { if (a > cur) segs.push([cur, a]); cur = Math.max(cur, b); }
  if (s1 > cur) segs.push([cur, s1]);
  for (const [a, b] of segs) {
    const L = b - a, m = (a + b) / 2;
    if (axis === 'x') {
      B.box('plaster', m, h / 2, c, L, h, t, { color });
      B.box('plaster', m, 0.3, c, L, 0.6, t + 0.04, { color: base });
      B.box('concrete', m, h + 0.04, c, L + 0.1, 0.08, t + 0.1, { color: cap });
      W.collide(a, 0, c - t / 2, b, h, c + t / 2, 'fence');
    } else {
      B.box('plaster', c, h / 2, m, t, h, L, { color });
      B.box('plaster', c, 0.3, m, t + 0.04, 0.6, L, { color: base });
      B.box('concrete', c, h + 0.04, m, t + 0.1, 0.08, L + 0.1, { color: cap });
      W.collide(c - t / 2, 0, a, c + t / 2, h, b, 'fence');
    }
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) {
      const s = a + (i / n) * L;
      if (axis === 'x') { B.box('plaster', s, (h + 0.25) / 2, c, 0.36, h + 0.25, 0.36, { color }); B.box('concrete', s, h + 0.3, c, 0.44, 0.08, 0.44, { color: cap }); }
      else { B.box('plaster', c, (h + 0.25) / 2, s, 0.36, h + 0.25, 0.36, { color }); B.box('concrete', c, h + 0.3, s, 0.44, 0.08, 0.44, { color: cap }); }
    }
    if (o.wire) {
      // coiled razor wire suggested by a grille strip on short posts
      const g = new THREE.PlaneGeometry(L, 0.35);
      if (axis === 'x') B.add('grille', g, { m: mat(m, h + 0.3, c), color: '#8d9296' });
      else B.add('grille', g, { m: mat(c, h + 0.3, m, Math.PI / 2), color: '#8d9296' });
    }
  }
}

/** Signboard: atlas quad with a metal backing, optionally on two posts. */
export function signboard(W, name, x, y, z, w, ry = 0, o = {}) {
  const { b: B, S } = W;
  const R = S[name];
  const aspect = (R.v1 - R.v0) / (R.u1 - R.u0);
  const h = o.h ?? w * aspect;
  const g = new THREE.PlaneGeometry(w, h); rectUV(g, R);
  const fx = Math.sin(ry), fz = Math.cos(ry);
  B.add('signs', g, { m: mat(x + fx * 0.03, y, z + fz * 0.03, ry) });
  if (o.back !== false) {
    const back = new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.04);
    B.add('metal', back, { m: mat(x, y, z, ry), color: o.backColor || '#3b3f42', uv: 'box' });
  }
  if (o.posts) {
    const px = Math.cos(ry), pz = -Math.sin(ry);
    for (const s of [-1, 1]) {
      const d = s * (w / 2 - 0.15);
      B.box('metal', x + px * d - fx * 0.05, (y - h / 2) / 2 + 0.1, z + pz * d - fz * 0.05, 0.08, y - h / 2 + 0.2, 0.08, { color: o.postColor || '#2f3336', uv: 'keep' });
    }
    if (o.collide !== false) {
      for (const s of [-1, 1]) {
        const d = s * (w / 2 - 0.15);
        W.cylinder(x + px * d, z + pz * d, 0.08, y);
      }
    }
  }
  return h;
}

/** Painted text directly on a wall (alpha-tested signs atlas). */
export function wallText(W, name, x, y, z, w, ry = 0) {
  const { b: B, S } = W;
  const R = S[name];
  const h = w * (R.v1 - R.v0) / (R.u1 - R.u0);
  const g = new THREE.PlaneGeometry(w, h); rectUV(g, R);
  B.add('signs', g, { m: mat(x, y, z, ry) });
}
