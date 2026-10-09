// The player's home: No. 14, a painted bungalow behind a block fence with a steel gate,
// veranda, walkable living room, GeePee tank on a stand, satellite dish, generator,
// clothesline, mango tree and a tokunbo car.
import * as THREE from 'three';
import { mat, quad4, rectUV } from './geo.js';
import { wall, hipRoof, fence, signboard } from './buildings.js';
import { atlasBox } from './props.js';
import { HOME, HOUSE } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildHome(W) {
  const { b: B, P } = W;
  const { x0, x1, z0, z1 } = HOME;
  const [g0, g1] = HOME.gate;
  const FENCE = '#efe3c8', BASE = '#9c4a32';

  // --- fence and gate
  fence(W, 'x', x0, x1, z0, { h: 2.3, color: FENCE, base: BASE, gaps: [[g0, g1]] });
  fence(W, 'z', z0, z1, x0, { h: 2.3, color: FENCE, base: BASE });
  fence(W, 'z', z0, z1, x1, { h: 2.3, color: FENCE, base: BASE });
  fence(W, 'x', x0, x1, z1, { h: 2.3, color: FENCE, base: BASE });
  for (const x of [g0 - 0.3, g1 + 0.3]) {
    B.box('plaster', x, 1.4, z0, 0.6, 2.8, 0.6, { color: FENCE });
    B.box('plaster', x, 0.35, z0, 0.64, 0.7, 0.64, { color: BASE });
    B.box('concrete', x, 2.86, z0, 0.7, 0.12, 0.7, { color: '#d6d0c2' });
    W.collide(x - 0.3, 0, z0 - 0.3, x + 0.3, 2.8, z0 + 0.3, 'fence');
  }
  signboard(W, 'houseno', g0 - 0.3, 2.05, z0 - 0.31, 0.42, Math.PI, { back: false });
  // two steel leaves swung inward
  const lw = (g1 - g0) / 2;
  for (const [hx, s] of [[g0, 1], [g1, -1]]) {
    const leaf = new THREE.BoxGeometry(lw - 0.04, 2.1, 0.05);
    const m = mat(hx, 1.12, z0 + 0.1, s * (Math.PI / 2 - 0.35)).multiply(mat(s * lw / 2, 0, 0));
    B.add('metal', leaf, { m, color: '#1c1c1c', uv: 'box' });
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.ConeGeometry(0.03, 0.18, 4);
      B.add('paint', sp, { m: m.clone().multiply(mat(-lw / 2 + 0.15 + i * (lw - 0.3) / 5, 1.14, 0)), color: '#c9a23a' });
    }
  }

  // --- yard: concrete apron and path, laterite elsewhere
  B.add('concrete', quad4(V(x0, 0.02, 15), V(x1, 0.02, 15), V(x1, 0.02, z0), V(x0, 0.02, z0)), { uv: 'box', color: '#cfc9bc' });
  B.add('concrete', quad4(V(g0 - 0.6, 0.025, z0), V(g1 + 0.6, 0.025, z0), V(g1 + 0.6, 0.025, -0.5 + 5.34), V(g0 - 0.6, 0.025, 4.84)), { uv: 'box', color: '#c9c4b6' });

  // --- house shell
  const { x0: hx0, x1: hx1, z0: hz0, z1: hz1, floor: fy } = HOUSE;
  const ver = HOUSE.veranda;
  const top = fy + HOUSE.h;
  B.boxMM('concrete', hx0 - 0.1, 0, ver, hx1 + 0.1, fy - 0.02, hz1 + 0.1, { color: '#bdb6a6' });
  B.boxMM('tiles', hx0, fy - 0.02, ver, hx1, fy, hz1, { color: '#e8dccb' });
  B.boxMM('concrete', HOUSE.door[0] - 1, 0, ver - 0.45, HOUSE.door[1] + 1.2, 0.15, ver, { color: '#c9c2b2' });
  const EXT = '#efdfae', INT = '#cfe3ef';
  const o = { y0: fy, h: HOUSE.h, t: 0.22, color: EXT };
  const win = (a, b, w = 'win-louvre-b') => ({ a, b, y0: 0.95, y1: 2.25, type: 'window', win: w, grille: '#151515' });
  const leaves = wall(W, 'x', hx0, hx1, hz0, { ...o, out: -1, inner: INT, openings: [{ a: HOUSE.door[0], b: HOUSE.door[1], y0: 0, y1: 2.15, type: 'door', leaf: 'door-steel', dynamic: true }, win(16.3, 17.9), win(21.0, 22.6, 'win-louvre-a')] });
  wall(W, 'x', hx0, hx1, hz1, { ...o, out: 1, inner: INT, openings: [win(13, 14.4, 'win-dark'), win(21, 22.2, 'win-louvre-a')] });
  wall(W, 'z', hz0, hz1, hx0, { ...o, out: -1, inner: INT, openings: [win(21.5, 23.1)] });
  wall(W, 'z', hz0, hz1, hx1, { ...o, out: 1, inner: '#f1e3c8', openings: [win(20, 21.6, 'win-louvre-a'), win(24, 25.4, 'win-dark')] });
  wall(W, 'z', hz0, hz1, HOUSE.living, { y0: fy, h: HOUSE.h, t: 0.15, color: INT, out: 1, inner: '#f1e3c8', mat: 'wallIn' });
  const dg = new THREE.PlaneGeometry(0.9, 2.05); rectUV(dg, P['door-white']);
  B.add('props', dg, { m: mat(HOUSE.living - 0.08, fy + 1.03, 22.5, -Math.PI / 2) });
  // base band outside
  for (const [a, b, c, ax] of [[hx0, hx1, hz1 + 0.12, 'x'], [hz0, hz1, hx0 - 0.12, 'z'], [hz0, hz1, hx1 + 0.12, 'z']]) {
    if (ax === 'x') B.boxMM('plaster', a, 0, c - 0.02, b, fy + 0.45, c + 0.02, { color: BASE });
    else B.boxMM('plaster', c - 0.02, 0, a, c + 0.02, fy + 0.45, b, { color: BASE });
  }
  B.boxMM('ceiling', hx0, top - 0.25, hz0, hx1, top - 0.2, hz1, { color: '#f6f5ef' });
  // veranda pillars + roof
  for (const x of [hx0 + 0.2, 16.6, 20.6, hx1 - 0.2]) { B.box('plaster', x, fy + HOUSE.h / 2, ver + 0.2, 0.3, HOUSE.h, 0.3, { color: '#f4ecd9' }); W.collide(x - 0.15, 0, ver + 0.05, x + 0.15, top, ver + 0.35, 'pillar'); }
  hipRoof(W, hx0, ver, hx1, hz1, top, 2.0, { color: '#8a9093', overhang: 0.6 });
  // satellite dish and AC-less house: louvres + burglar bars
  W.inst('dish', mat(hx1 + 0.15, top - 0.6, 19.5, Math.PI / 2 + 0.6));

  // --- living room furniture
  const fl = fy;
  // sofa against the west wall, facing +X
  sofa(W, hx0 + 0.55, fl, 22.5, Math.PI / 2, 3, '#6b2d3a');
  sofa(W, 13.6, fl, 19.0, 0, 1, '#6b2d3a');
  sofa(W, 13.6, fl, 26.1, Math.PI, 1, '#6b2d3a');
  // centre table, TV stand + TV on the partition wall
  B.box('wood', 15.0, fl + 0.42, 22.5, 1.1, 0.05, 0.6, { color: '#4a2f1c' });
  B.box('glass', 15.0, fl + 0.45, 22.5, 1.0, 0.01, 0.5, { color: '#7d9aa3', uv: 'keep' });
  for (const s of [-1, 1]) for (const t of [-1, 1]) B.box('wood', 15 + s * 0.5, fl + 0.2, 22.5 + t * 0.25, 0.05, 0.4, 0.05, { color: '#4a2f1c' });
  W.collide(14.4, 0, 22.15, 15.6, fl + 0.5, 22.85, 'furniture');
  B.box('paint', 15.1, fl + 0.48, 22.4, 0.28, 0.06, 0.2, { color: '#1a1a1a', uv: 'keep' });
  B.box('wood', HOUSE.living - 0.4, fl + 0.3, 21.0, 0.5, 0.6, 1.5, { color: '#3a2a1e' });
  W.collide(HOUSE.living - 0.7, 0, 20.2, HOUSE.living - 0.1, fl + 0.6, 21.8, 'furniture');
  B.add('props', atlasBox(0.06, 0.62, 1.05, { all: P.black, nx: P.tv }), { m: mat(HOUSE.living - 0.42, fl + 0.95, 21.0) });
  B.add('props', atlasBox(0.03, 0.5, 0.5, { all: P.black, nx: P.clock }), { m: mat(HOUSE.living - 0.09, fl + 2.6, 21.0) });
  B.add('props', atlasBox(0.03, 0.45, 0.3, { all: P.white, px: P.calendar }), { m: mat(hx0 + 0.13, fl + 1.9, 24.8) });
  const pic = new THREE.PlaneGeometry(1.2, 0.4); rectUV(pic, W.S.scripture);
  B.add('signs', pic, { m: mat(hx0 + 0.13, fl + 2.3, 22.5, Math.PI / 2) });
  B.box('carpet', 15.0, fl + 0.006, 22.5, 2.6, 0.012, 1.9, { color: '#8a3b2a', uv: 'box' });
  // curtains at the living room windows
  curtains(W, 17.1, fl, hz0 + 0.2, 0, 1.6, '#c08a3e');
  curtains(W, hx0 + 0.2, fl, 22.3, Math.PI / 2, 1.6, '#c08a3e');
  W.inst('fanHub', mat(15.0, top - 0.95, 22.5)); W.fans.push(V(15.0, top - 1.01, 22.5));
  W.inst('tube', mat(17.0, top - 0.25, 25.0, 0));

  // --- veranda plastic chairs + table
  for (const x of [20.4, 21.7]) { W.inst('chair', mat(x, fl, 16.4, Math.PI), '#f2f2ee'); W.seat(x, fl + 0.45, 16.4, Math.PI, 'chair', 'home'); }
  W.inst('tablePlasticLow', mat(21.05, fl, 15.9), '#f2f2ee');

  // --- yard: tank, generator, clothesline, trees, car, drums
  W.inst('tankHome', mat(28.6, 0, 25.5, 0.3));
  W.collide(27.8, 0, 24.7, 29.4, 3, 26.3, 'prop');
  B.cyl('plastic', 27.3, 0, 23.6, 0.3, 0.3, 0.9, 14, { color: '#2a5fae' });
  for (let i = 0; i < 3; i++) W.inst('jerrycan', mat(27.9 + i * 0.35, 0, 23.2, 0.2 * i), i === 1 ? '#2a7fd1' : '#f2c200');
  W.collide(26.9, 0, 22.9, 29.0, 0.9, 24.0, 'prop');
  W.inst('generator', mat(30.6, 0.02, 15.8, -Math.PI / 2 + 0.2));
  W.collide(30.2, 0, 15.4, 31.0, 0.7, 16.2, 'prop');
  // clothesline with wrappers drying
  for (const x of [25.6, 31.2]) { B.box('metal', x, 1.0, 30.5, 0.05, 2.0, 0.05, { color: '#666', uv: 'keep' }); W.cylinder(x, 30.5, 0.06, 2); }
  W.lines.push(V(25.6, 1.95, 30.5), V(28.4, 1.85, 30.5), V(28.4, 1.85, 30.5), V(31.2, 1.95, 30.5));
  const cloths = [['ankara-1', 26.3, 0.9, 1.1], ['ankara-2', 27.4, 0.8, 1.0], ['white', 28.4, 0.55, 0.7], ['ankara-3', 29.4, 0.9, 1.15], ['white', 30.5, 0.5, 0.6]];
  for (const [name, x, w, h] of cloths) {
    const g = new THREE.PlaneGeometry(w, h); rectUV(g, P[name]);
    B.add('props', g, { m: mat(x, 1.86 - h / 2, 30.5, 0.05) });
    const g2 = new THREE.PlaneGeometry(w, h); rectUV(g2, P[name]);
    B.add('props', g2, { m: mat(x, 1.86 - h / 2, 30.49, Math.PI + 0.05), color: name === 'white' ? '#9fc3e6' : undefined });
  }
  W.inst('mango', mat(9.3, 0, 12.3, 1.2)); W.cylinder(9.3, 12.3, 0.35, 3);
  W.inst('palm1', mat(30.2, 0, 10.6, 2.0)); W.cylinder(30.2, 10.6, 0.3, 4);
  W.inst('car', mat(24.4, 0, 11.6, Math.PI + 0.04), '#e9e9e6');
  W.collide(22.05, 0, 10.65, 26.75, 1.45, 12.55, 'vehicle');
  W.inst('hedgeShort', mat(12.5, 0, 33.4));
  W.collide(11.0, 0, 33.1, 14.0, 0.8, 33.9, 'hedge');

  // dynamic front door
  for (const l of leaves) W.dynamicDoor('home-door', l, 'Open / close the front door');
}

/** Pleated curtains drawn to both sides of a window centred at (x, z), facing ry. */
function curtains(W, x, y, z, ry, winW, color) {
  const { b: B } = W;
  const m0 = mat(x, y, z, ry);
  for (const side of [-1, 1]) {
    const n = 8, pw = 0.5, x0 = side * (winW / 2 + 0.15) - pw / 2;
    const pos = [], idx = [], uv = [];
    for (let i = 0; i <= n; i++) {
      const lx = x0 + pw * i / n, lz = i % 2 ? 0.05 : 0;
      pos.push(lx, 0.5, lz, lx, 2.5, lz); uv.push(lx, 0.5, lx, 2.5);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    B.add('fabric', g, { m: m0, color });
  }
  B.add('metal', new THREE.CylinderGeometry(0.015, 0.015, winW + 1.4, 6).rotateZ(Math.PI / 2), { m: m0.clone().multiply(mat(0, 2.52, 0.02)), color: '#c9a23a' });
}

/** Upholstered sofa (n seats) with its back towards −Z before rotation. */
function sofa(W, x, y, z, ry, n, color) {
  const { b: B } = W;
  const w = n * 0.75 + 0.3;
  const m = mat(x, y, z, ry);
  const add = (cx, cy, cz, sx, sy, sz, c, key = 'fabric') => B.add(key, new THREE.BoxGeometry(sx, sy, sz), { m: m.clone().multiply(mat(cx, cy, cz)), color: c, uv: 'box' });
  add(0, 0.22, 0.05, w, 0.3, 0.8, color);
  add(0, 0.42, 0.1, w - 0.3, 0.12, 0.66, '#7c3a47');
  add(0, 0.62, -0.28, w, 0.75, 0.22, color);
  for (const s of [-1, 1]) add(s * (w / 2 - 0.08), 0.4, 0.05, 0.16, 0.42, 0.8, color);
  add(0, 0.03, 0.05, w - 0.1, 0.06, 0.7, '#2a1a10', 'wood');
  const c = Math.cos(ry), s = Math.sin(ry);
  // collider: rotate the footprint
  const hw = w / 2, hd = 0.45;
  const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
  W.collide(x - ex, 0, z - ez, x + ex, y + 0.9, z + ez, 'furniture');
  for (let i = 0; i < n; i++) {
    const lx = -((n - 1) * 0.75) / 2 + i * 0.75, lz = 0.12;
    W.seat(x + lx * c + lz * s, y + 0.48, z - lx * s + lz * c, ry, n > 1 ? 'chair' : 'chair', 'home');
  }
}
