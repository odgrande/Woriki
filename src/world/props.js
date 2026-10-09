// Reusable prop kits (Map<materialKey, BufferGeometry>), built once and placed many times
// by merging or instancing. Kits face +Z (seats) or +X (vehicles) unless noted.
import * as THREE from 'three';
import { kit, mat, rectUV, bezier } from './geo.js';
import { rng } from './noise.js';

/** Box with a different atlas rectangle per face. faces: {px,nx,py,ny,pz,nz,all} → rect or {r, flip}. */
export function atlasBox(sx, sy, sz, faces) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  for (let f = 0; f < 6; f++) {
    const spec = faces[order[f]] ?? faces.all;
    const r = spec.r || spec, flip = !!spec.flip;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      let u = uv.getX(i); const v = uv.getY(i);
      if (flip) u = 1 - u;
      uv.setXY(i, r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0));
    }
  }
  return g;
}

/** Wheel along Z: black tread, hub-cap faces. */
export function wheelGeo(r, w, P, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, w, seg, 1);
  const torso = (seg + 1) * 2;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const R = i < torso ? P.black : P.tyre;
    uv.setXY(i, R.u0 + uv.getX(i) * (R.u1 - R.u0), R.v0 + uv.getY(i) * (R.v1 - R.v0));
  }
  g.rotateX(Math.PI / 2);
  return g;
}

/** Lathe around Y from [radius, y] pairs. */
export function lathe(profile, seg = 12) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Monobloc plastic chair (seat height 0.43), faces +Z. Tint with instance colour. */
export function plasticChair() {
  return kit((b) => {
    b.box('plastic', 0, 0.43, 0.02, 0.46, 0.035, 0.44, { uv: 'keep' });
    b.box('plastic', 0, 0.69, -0.215, 0.44, 0.42, 0.03, { rx: -0.16, uv: 'keep' });
    b.box('plastic', 0, 0.9, -0.25, 0.47, 0.05, 0.05, { rx: -0.16, uv: 'keep' });
    for (const s of [-1, 1]) {
      b.box('plastic', s * 0.235, 0.62, -0.02, 0.04, 0.03, 0.42, { uv: 'keep' });
      b.box('plastic', s * 0.235, 0.53, 0.17, 0.035, 0.18, 0.035, { uv: 'keep' });
      for (const t of [-1, 1]) b.box('plastic', s * 0.205, 0.21, t * 0.19, 0.045, 0.44, 0.05, { rz: s * 0.08, rx: -t * 0.08, uv: 'keep' });
    }
  });
}

/** Low kids' chair. */
export function kidsChair() {
  return kit((b) => {
    b.box('plastic', 0, 0.28, 0, 0.32, 0.03, 0.3, { uv: 'keep' });
    b.box('plastic', 0, 0.45, -0.15, 0.3, 0.3, 0.025, { rx: -0.12, uv: 'keep' });
    for (const s of [-1, 1]) for (const t of [-1, 1]) b.box('plastic', s * 0.14, 0.14, t * 0.13, 0.035, 0.28, 0.035, { uv: 'keep' });
  });
}

/** Wooden church pew of length L (along X), sitters face +Z. */
export function pew(L) {
  return kit((b) => {
    const wd = '#8a5a34';
    b.box('wood', 0, 0.44, 0.02, L, 0.05, 0.44, { color: wd });
    b.box('wood', 0, 0.8, -0.2, L, 0.5, 0.045, { rx: -0.1, color: wd });
    b.box('wood', 0, 1.05, -0.225, L + 0.04, 0.05, 0.08, { rx: -0.1, color: '#6e4426' });
    b.box('wood', 0, 0.62, -0.29, L, 0.03, 0.12, { color: '#6e4426' });
    for (const s of [-1, 1]) b.box('wood', s * (L / 2 + 0.02), 0.48, -0.04, 0.06, 0.96, 0.52, { color: '#5e381f' });
    b.box('wood', 0, 0.21, -0.05, 0.05, 0.42, 0.34, { color: '#5e381f' });
    b.box('wood', 0, 0.08, -0.05, L, 0.04, 0.05, { color: '#5e381f' });
  });
}

/** Simple wooden bench with no back. */
export function bench(L, color = '#7a5232') {
  return kit((b) => {
    b.box('wood', 0, 0.44, 0, L, 0.05, 0.34, { color });
    for (const s of [-1, 1]) b.box('wood', s * (L / 2 - 0.12), 0.21, 0, 0.06, 0.42, 0.3, { color });
    b.box('wood', 0, 0.15, 0, L - 0.2, 0.04, 0.04, { color });
  });
}

/** Table (wood or plastic) w × d, height h. */
export function table(w, d, h = 0.76, key = 'wood', color = '#7a5232') {
  return kit((b) => {
    b.box(key, 0, h - 0.02, 0, w, 0.04, d, { color, uv: key === 'wood' ? 'box' : 'keep' });
    for (const s of [-1, 1]) for (const t of [-1, 1]) b.box(key, s * (w / 2 - 0.05), (h - 0.04) / 2, t * (d / 2 - 0.05), 0.05, h - 0.04, 0.05, { color, uv: 'keep' });
  });
}

/** Coconut palm with a curved trunk. Variant seed changes lean and frond layout. */
export function palm(H = 9, seed = 1) {
  const r = rng(seed);
  return kit((b) => {
    const lean = 0.6 + r() * 1.2, dir = r() * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(dir) * lean, H, Math.sin(dir) * lean);
    const mid = new THREE.Vector3(Math.cos(dir) * lean * 0.2, H * 0.55, Math.sin(dir) * lean * 0.2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), mid, top);
    const tube = new THREE.TubeGeometry(curve, 10, 0.17, 7, false);
    const uv = tube.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const along = uv.getX(i), around = uv.getY(i); uv.setXY(i, around * 0.8, along * H); }
    b.add('bark', tube, { color: '#9c8d78' });
    b.cyl('bark', 0, 0, 0, 0.2, 0.32, 0.6, 8, { color: '#8d7f6b' });
    b.cyl('bark', top.x, H - 0.15, top.z, 0.26, 0.19, 0.55, 8, { color: '#6f6a3c' });
    const fronds = 13;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + r() * 0.4;
      const dead = i >= fronds - 2;
      const L = dead ? 2.4 : 3.6 + r() * 1.4;
      const lift = dead ? -1.8 : 0.9 + r() * 0.9;
      const droop = dead ? 0.3 : 2.4 + r() * 1.0;
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-d.z, 0, d.x);
      const seg = 5, pos = [], uvs = [], idx = [];
      for (let k = 0; k <= seg; k++) {
        const t = k / seg;
        const c = top.clone().addScaledVector(d, L * t * (dead ? 0.4 : 1)).add(new THREE.Vector3(0, lift * t - droop * t * t + 0.1 - (dead ? L * t * 0.9 : 0), 0));
        const wv = (dead ? 0.35 : 0.85) * Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI) + 0.05;
        const down = 0.28 * wv;
        for (const [s, u] of [[-1, 0], [0, 0.25], [1, 0.5]]) {
          const p = c.clone().addScaledVector(side, s * wv).add(new THREE.Vector3(0, s ? -down : 0, 0));
          pos.push(p.x, p.y, p.z); uvs.push(u, 0.03 + t * 0.95);
        }
      }
      for (let k = 0; k < seg; k++) {
        const o = k * 3;
        idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const tint = dead ? '#a8844a' : (r() < 0.3 ? '#d6dc9a' : '#ffffff');
      b.add('foliage', g, { color: tint });
    }
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const g = new THREE.IcosahedronGeometry(0.13, 0);
      b.add('bark', g, { m: mat(top.x + Math.cos(a) * 0.25, H - 0.25 - r() * 0.2, top.z + Math.sin(a) * 0.25), color: r() < 0.5 ? '#5b6b2a' : '#7a5a2a' });
    }
  });
}

/** Broad-leaf shade tree (mango / almond): trunk, branches, leaf-card canopy. */
export function shadeTree(R = 3.2, seed = 2) {
  const r = rng(seed);
  return kit((b) => {
    const H = 2.4 + r() * 0.6;
    b.cyl('bark', 0, 0, 0, 0.2, 0.3, H, 8, { color: '#5a4a3c' });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + r(), len = 1.6 + r() * 0.8;
      const g = new THREE.CylinderGeometry(0.07, 0.14, len, 6);
      g.translate(0, len / 2, 0);
      b.add('bark', g, { m: mat(0, H - 0.2, 0, a, 0, 0.7 + r() * 0.3), color: '#5a4a3c' });
    }
    const cy = H + R * 0.62;
    const core = new THREE.IcosahedronGeometry(1, 1);
    b.add('fabric', core, { m: mat(0, cy, 0, 0, 0, 0, R * 0.8, R * 0.6, R * 0.8), color: '#26401c' });
    const F = { u0: 0.52, v0: 0.04, u1: 0.98, v1: 0.96 };
    const cards = 34;
    for (let i = 0; i < cards; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 1.4);
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      const s = R * (0.75 + r() * 0.35);
      for (const k of [0, 1]) {
        const g = new THREE.PlaneGeometry(s, s * 0.85);
        rectUV(g, F);
        b.add('foliage', g, { m: mat(nx * R * 0.82, cy + ny * R * 0.62, nz * R * 0.82, th + k * Math.PI / 2 + r(), (r() - 0.5) * 1.2, (r() - 0.5) * 0.6), color: r() < 0.25 ? '#c9d690' : '#ffffff' });
      }
    }
  });
}

/** Low hedge segment (ixora / duranta) of length L along X. */
export function hedge(L) {
  const r = rng(L * 10 | 0);
  return kit((b) => {
    b.box('fabric', 0, 0.35, 0, L, 0.7, 0.6, { color: '#2c4a1f', uv: 'keep' });
    const F = { u0: 0.52, v0: 0.04, u1: 0.98, v1: 0.96 };
    const n = Math.max(3, Math.round(L * 1.6));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * (L / n);
      for (const ry of [0.3, 1.9]) {
        const g = new THREE.PlaneGeometry(1.0, 0.9);
        rectUV(g, F);
        b.add('foliage', g, { m: mat(x, 0.45, (r() - 0.5) * 0.2, ry + r() * 0.5), color: '#ffffff' });
      }
    }
    for (let i = 0; i < n * 2; i++) {
      const g = new THREE.IcosahedronGeometry(0.06, 0);
      b.add('plastic', g, { m: mat(-L / 2 + r() * L, 0.55 + r() * 0.2, (r() - 0.5) * 0.65), color: r() < 0.5 ? '#e63946' : '#ff8fab' });
    }
  });
}

/** Concrete electric pole (9 m) with cross-arm and insulators. Returns kit; wires attach at ARM_Y. */
export const POLE_ARM_Y = 8.45;
export function pole() {
  return kit((b) => {
    const g = new THREE.CylinderGeometry(0.1, 0.17, 9, 4, 1);
    g.rotateY(Math.PI / 4);
    b.add('concrete', g, { m: mat(0, 4.5, 0), color: '#b9b5ab', uv: 'box' });
    b.box('metal', 0, 8.3, 0, 0.08, 0.08, 1.9, { color: '#8a8f93' });
    for (const s of [-0.85, 0, 0.85]) {
      b.cyl('plastic', 0, 8.34, s, 0.04, 0.06, 0.13, 6, { color: '#7a3b1e' });
    }
    b.box('metal', 0, 7.9, 0.4, 0.05, 0.7, 0.05, { rx: 0.6, color: '#8a8f93' });
    b.box('metal', 0, 6.4, 0, 0.3, 0.12, 0.12, { color: '#444' });
  });
}

/** Black GeePee-style plastic water tank on a steel stand (stand height h). */
export function waterTank(h = 3) {
  return kit((b) => {
    const prof = [[0.01, 0], [0.62, 0], [0.66, 0.06], [0.64, 0.3], [0.67, 0.36], [0.64, 0.62], [0.67, 0.68], [0.64, 0.94], [0.67, 1.0], [0.63, 1.26], [0.55, 1.42], [0.3, 1.52], [0.24, 1.55], [0.24, 1.62], [0.01, 1.63]];
    b.add('plastic', lathe(prof, 14), { m: mat(0, h + 0.06, 0), color: '#121212' });
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      b.box('metal', s * 0.6, h / 2, t * 0.6, 0.07, h, 0.07, { color: '#3d3f40' });
    }
    for (const s of [-1, 1]) {
      b.box('metal', 0, h * 0.45, s * 0.6, 1.25, 0.05, 0.05, { color: '#3d3f40' });
      b.box('metal', s * 0.6, h * 0.45, 0, 0.05, 0.05, 1.25, { color: '#3d3f40' });
      b.box('metal', 0, h * 0.7, s * 0.6, 0.05, 1.7, 0.05, { rz: 0.7 * s, color: '#3d3f40' });
    }
    b.box('metal', 0, h + 0.03, 0, 1.35, 0.06, 1.35, { color: '#3d3f40' });
    b.cyl('plastic', 0.45, 0, 0.45, 0.03, 0.03, h + 0.2, 6, { color: '#d9d9d2' });
  });
}

/** Satellite dish on a wall bracket; dish faces +Z, tilted up. */
export function dish() {
  return kit((b) => {
    const prof = []; for (let i = 0; i <= 5; i++) { const r = i / 5 * 0.45; prof.push([Math.max(0.005, r), r * r * 0.6]); }
    const g = lathe(prof, 14);
    b.add('paint', g, { m: mat(0, 0.2, 0.1, 0, Math.PI / 2 - 0.6, 0), color: '#d9d9d4' });
    b.box('metal', 0, 0.05, -0.05, 0.05, 0.05, 0.4, { color: '#777' });
    b.box('metal', 0, 0.25, 0.35, 0.03, 0.03, 0.55, { rx: -0.5, color: '#777' });
    b.box('paint', 0, 0.42, 0.55, 0.07, 0.07, 0.12, { color: '#333' });
  });
}

/** Small petrol generator (the neighbourhood soundtrack). Faces +Z. */
export function generator(P) {
  return kit((b) => {
    for (const s of [-1, 1]) for (const t of [-1, 1]) b.box('metal', s * 0.3, 0.25, t * 0.22, 0.03, 0.5, 0.03, { color: '#151515' });
    for (const s of [-1, 1]) { b.box('metal', 0, 0.5, s * 0.22, 0.63, 0.03, 0.03, { color: '#151515' }); b.box('metal', 0, 0.02, s * 0.22, 0.63, 0.03, 0.03, { color: '#151515' }); }
    b.box('paint', 0, 0.5, 0, 0.55, 0.12, 0.38, { color: '#c1121f' });
    b.box('metal', -0.08, 0.22, 0, 0.32, 0.3, 0.3, { color: '#4a4d50' });
    b.add('props', atlasBox(0.2, 0.15, 0.02, { all: P.black, pz: P['gen-panel'] }), { m: mat(0.17, 0.22, 0.2) });
    b.cyl('metal', 0.22, 0.12, -0.12, 0.05, 0.05, 0.2, 8, { color: '#777' });
  });
}

/** Market umbrella with alternating coloured panels. */
export function umbrella(c1, c2, R = 1.5) {
  return kit((b) => {
    const n = 8, apex = 2.45, rim = 1.95;
    const pos = [], col = [], uvs = [];
    const A = new THREE.Color(c1), B = new THREE.Color(c2);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const c = i % 2 ? A : B;
      const p0 = [Math.cos(a0) * R, rim, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, rim, Math.sin(a1) * R];
      pos.push(0, apex, 0, ...p1, ...p0);
      uvs.push(0.5, 1, 1, 0, 0, 0);
      // valance
      const q0 = [p0[0], rim - 0.16, p0[2]], q1 = [p1[0], rim - 0.16, p1[2]];
      pos.push(...p0, ...p1, ...q1, ...p0, ...q1, ...q0);
      uvs.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
      for (let k = 0; k < 9; k++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    b.add('fabric', g);
    b.cyl('metal', 0, 0, 0, 0.025, 0.025, apex, 6, { color: '#cfcfcf' });
    b.cyl('rubber', 0, 0, 0, 0.28, 0.3, 0.2, 10, { color: '#1a1a1a' });
  });
}

/** Yellow danfo (VW-type minibus), forward +X, length 4.6 m. */
export function danfo(P, S) {
  return kit((b) => {
    const body = atlasBox(4.5, 1.6, 1.86, { px: P['danfo-front'], nx: P['danfo-back'], pz: P['danfo-side'], nz: { r: P['danfo-side'], flip: true }, py: P.white, ny: P.black });
    b.add('props', body, { m: mat(0, 1.22, 0) });
    // yellow tint only on the roof (white region) — vertex colour per face
    const col = body.attributes.color;
    for (let i = 8; i < 12; i++) col.setXYZ(i, 0.9, 0.62, 0.02);
    for (const [x, z] of [[1.45, 0.86], [1.45, -0.86], [-1.5, 0.86], [-1.5, -0.86]]) b.add('props', wheelGeo(0.34, 0.22, P), { m: mat(x, 0.34, z) });
    b.add('props', atlasBox(0.12, 0.2, 1.9, { all: P.black }), { m: mat(2.29, 0.62, 0) });
    b.add('props', atlasBox(0.12, 0.2, 1.9, { all: P.black }), { m: mat(-2.29, 0.62, 0) });
    for (const s of [-1, 1]) {
      b.add('props', atlasBox(0.05, 0.22, 0.14, { all: P.black }), { m: mat(2.1, 1.75, s * 1.08) });
      b.add('props', atlasBox(0.4, 0.03, 0.03, { all: P.black }), { m: mat(2.15, 1.7, s * 0.98, 0, 0, 0) });
    }
    // roof rack
    for (const s of [-1, 1]) b.add('props', atlasBox(3.2, 0.05, 0.05, { all: P.black }), { m: mat(-0.2, 2.1, s * 0.8) });
    for (let i = 0; i < 4; i++) b.add('props', atlasBox(0.05, 0.05, 1.65, { all: P.black }), { m: mat(-1.6 + i * 0.95, 2.1, 0) });
    // sticker on the rear window region is in the texture; extra side sticker
    const st = new THREE.PlaneGeometry(0.9, 0.17); rectUV(st, S['sticker-jesus']);
    b.add('signs', st, { m: mat(-0.6, 1.62, 0.935) });
  });
}

/** Keke NAPEP tricycle, forward +X. */
export function keke(P) {
  return kit((b) => {
    const Y = '#f0b800';
    b.add('props', atlasBox(1.9, 0.6, 1.2, { pz: P['keke-side'], nz: { r: P['keke-side'], flip: true }, all: P.white }), { m: mat(-0.25, 0.62, 0), color: undefined });
    const nose = atlasBox(0.55, 1.0, 0.75, { all: P.white });
    b.add('props', nose, { m: mat(0.95, 0.8, 0), color: Y });
    b.add('props', atlasBox(0.06, 0.6, 1.1, { all: P.glass }), { m: mat(0.92, 1.55, 0, 0, 0, -0.15) });
    b.add('props', atlasBox(2.0, 0.06, 1.3, { all: P.black }), { m: mat(-0.15, 1.85, 0) });
    for (const [x, z] of [[0.82, 0.58], [0.82, -0.58], [-1.15, 0.6], [-1.15, -0.6]]) b.add('props', atlasBox(0.05, 0.95, 0.05, { all: P.black }), { m: mat(x, 1.37, z) });
    b.add('props', atlasBox(0.5, 0.45, 1.1, { all: P.black }), { m: mat(-0.75, 1.1, 0) });
    b.add('props', wheelGeo(0.22, 0.14, P), { m: mat(1.05, 0.22, 0) });
    for (const s of [-1, 1]) b.add('props', wheelGeo(0.22, 0.14, P), { m: mat(-0.75, 0.22, s * 0.62) });
    b.add('props', atlasBox(0.06, 0.08, 0.6, { all: P.black }), { m: mat(0.75, 1.15, 0) });
    // yellow tint for the white-region faces of the body box
    const body = b.parts.get('props')[0];
    const col = body.attributes.color;
    for (let i = 0; i < 16; i++) col.setXYZ(i, 0.86, 0.58, 0.0);
  });
}

/** Okada motorbike, forward +X. */
export function okada(P) {
  return kit((b) => {
    for (const x of [0.66, -0.62]) b.add('props', wheelGeo(0.31, 0.1, P, 12), { m: mat(x, 0.31, 0) });
    b.box('metal', 0.02, 0.5, 0, 0.9, 0.06, 0.06, { rz: 0.2, color: '#222', uv: 'keep' });
    b.box('metal', 0.55, 0.62, 0, 0.06, 0.65, 0.05, { rz: -0.35, color: '#bbb', uv: 'keep' });
    b.box('paint', 0.25, 0.86, 0, 0.42, 0.18, 0.26, { color: '#b0101c', uv: 'keep' });
    b.box('rubber', -0.25, 0.86, 0, 0.62, 0.09, 0.26, { color: '#111', uv: 'keep' });
    b.box('metal', 0.0, 0.42, 0, 0.32, 0.26, 0.2, { color: '#3a3a3a', uv: 'keep' });
    b.box('metal', 0.62, 1.03, 0, 0.04, 0.04, 0.7, { color: '#222', uv: 'keep' });
    b.box('paint', 0.72, 0.92, 0, 0.1, 0.14, 0.16, { color: '#1a1a1a', uv: 'keep' });
    b.cyl('metal', -0.3, 0.32, 0.16, 0.04, 0.04, 0.6, 8, { rz: Math.PI / 2 - 0.15, color: '#c9c9c9' });
    b.box('metal', -0.75, 0.78, 0, 0.3, 0.03, 0.22, { color: '#222', uv: 'keep' });
  });
}

/** Saloon car (Corolla-like), forward +X. Body uses 'paint' tinted per instance. */
export function car(P) {
  return kit((b) => {
    const sh = new THREE.Shape();
    const pts = [[-2.25, 0.32], [2.2, 0.32], [2.3, 0.5], [2.25, 0.78], [1.05, 0.92], [0.3, 1.36], [-0.95, 1.4], [-1.62, 0.98], [-2.2, 0.94], [-2.32, 0.62]];
    sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -0.81);
    b.add('paint', g, { color: '#ffffff' });
    // windows: side glass and windscreens
    const side = new THREE.Shape();
    const sp = [[-1.5, 0.98], [0.95, 0.98], [0.3, 1.32], [-0.9, 1.35]];
    side.moveTo(...sp[0]); for (const p of sp.slice(1)) side.lineTo(...p); side.closePath();
    for (const s of [-1, 1]) {
      const sg = new THREE.ShapeGeometry(side);
      b.add('glass', sg, { m: mat(0, 0, s * 0.885), color: '#1d262c' });
      b.box('glass', -0.3, 1.16, s * 0.888, 0.05, 0.34, 0.01, { color: '#0e1316', uv: 'keep' });
    }
    const ws = new THREE.PlaneGeometry(1.5, 0.62);
    b.add('glass', ws, { m: mat(0.7, 1.165, 0, Math.PI / 2, -1.03, 0), color: '#1d262c' });
    const rs = new THREE.PlaneGeometry(1.45, 0.62);
    b.add('glass', rs, { m: mat(-1.3, 1.205, 0, -Math.PI / 2, -1.0, 0), color: '#1d262c' });
    for (const [x, z] of [[1.42, 0.8], [1.42, -0.8], [-1.4, 0.8], [-1.4, -0.8]]) b.add('props', wheelGeo(0.31, 0.2, P), { m: mat(x, 0.31, z) });
    for (const s of [-1, 1]) {
      b.add('props', atlasBox(0.05, 0.1, 0.28, { all: P.white }), { m: mat(2.3, 0.7, s * 0.6) });
      b.add('props', atlasBox(0.05, 0.1, 0.3, { all: P.white }), { m: mat(-2.34, 0.78, s * 0.6), color: '#c1121f' });
    }
    b.add('props', atlasBox(0.02, 0.12, 0.42, { all: P.plate, nx: P.plate }), { m: mat(-2.36, 0.55, 0) });
  });
}

/** PA speaker on a tripod stand. Front faces +Z. */
export function paSpeaker(P, standH = 1.3) {
  return kit((b) => {
    b.add('props', atlasBox(0.5, 0.8, 0.42, { all: P.black, pz: P.speaker }), { m: mat(0, standH + 0.4, 0) });
    b.cyl('metal', 0, 0, 0, 0.025, 0.025, standH, 6, { color: '#222' });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      b.box('metal', Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3, 0.025, 0.7, 0.025, { ry: -a, rz: 0.7, color: '#222', uv: 'keep' });
    }
  });
}

/** Ceiling fan hub (static) and blades (animated separately). Hung so blades sit at y = 0. */
export function fanHub() {
  return kit((b) => {
    b.cyl('metal', 0, 0.02, 0, 0.012, 0.012, 0.75, 6, { color: '#f0efe9' });
    b.cyl('paint', 0, -0.08, 0, 0.12, 0.14, 0.16, 12, { color: '#f0efe9' });
  });
}
export function fanBlades() {
  return kit((b) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box('paint', Math.cos(a) * 0.48, -0.02, Math.sin(a) * 0.48, 0.72, 0.012, 0.13, { ry: -a, color: '#8a5a34', uv: 'keep' });
    }
  });
}

/** Fluorescent tube fitting (1.2 m), hangs below y = 0. */
export function tubeLight() {
  return kit((b) => {
    b.box('metal', 0, -0.02, 0, 1.26, 0.04, 0.1, { color: '#e8e8e2', uv: 'keep' });
    b.box('lamp', 0, -0.06, 0, 1.2, 0.035, 0.035, { color: '#ffffff', uv: 'keep' });
  });
}

/** Split-unit air conditioner (indoor), front faces +Z. */
export function acUnit(P) {
  return kit((b) => { b.add('props', atlasBox(0.95, 0.3, 0.22, { all: P.white, pz: P.ac }), { color: '#f5f5f2' }); });
}
export function acOutdoor(P) {
  return kit((b) => {
    b.add('props', atlasBox(0.8, 0.55, 0.3, { all: P.white, pz: P.acout }), { color: '#e9e9e4' });
    for (const s of [-1, 1]) b.box('metal', s * 0.3, -0.3, -0.05, 0.04, 0.04, 0.45, { color: '#444', uv: 'keep' });
  });
}

/** Prayer mat (thin, fabric) 0.7 × 1.2, long side along Z. */
export function prayerMat() {
  return kit((b) => {
    b.box('fabric', 0, 0.008, 0, 0.7, 0.016, 1.2, { color: '#ffffff', uv: 'keep' });
    b.box('fabric', 0, 0.018, -0.45, 0.6, 0.006, 0.12, { color: '#e9c46a', uv: 'keep' });
  });
}

/** 25-litre jerrycan ("keg"). */
export function jerrycan() {
  return kit((b) => {
    b.box('plastic', 0, 0.22, 0, 0.3, 0.44, 0.18, { uv: 'keep' });
    b.cyl('plastic', 0.08, 0.44, 0, 0.035, 0.035, 0.06, 8, { uv: 'keep' });
    b.box('plastic', -0.04, 0.47, 0, 0.14, 0.04, 0.04, { uv: 'keep' });
  });
}

/** Big cooking pot on a stove ring. */
export function pot(r = 0.3, h = 0.35) {
  return kit((b) => {
    b.add('metal', lathe([[0.01, 0], [r * 0.95, 0], [r, 0.04], [r, h], [r * 1.05, h + 0.02], [r * 0.95, h + 0.02]], 14), { color: '#b9b9b5' });
    b.add('metal', lathe([[0.01, h + 0.08], [r * 0.6, h + 0.06], [r * 0.95, h + 0.02]], 14), { color: '#a9a9a4' });
  });
}
