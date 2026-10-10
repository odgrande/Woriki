// Herbert Macaulay Way: asphalt, drains with slab crossings, laterite shoulders, electric poles
// with sagging wires, the bus stop and the surrounding (closed) buildings.
import * as THREE from 'three';
import { mat, quad4, rectUV } from './geo.js';
import { block, fence, signboard, wallText, shedRoof } from './buildings.js';
import { POLE_ARM_Y } from './props.js';
import { MAP, ROAD, GUTTER, WALK, CROSS_N, CROSS_S, BUSSTOP, gutterRuns } from './layout.js';
import { rng } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildStreet(W) {
  const { b: B, P } = W;
  const ext = 100; // visual extent beyond the playable map

  // --- ground: laterite everywhere except road and drains
  B.add('ground', quad4(V(-ext, 0, -GUTTER.outer), V(ext, 0, -GUTTER.outer), V(ext, 0, -70), V(-ext, 0, -70)), { uv: 'box' });
  B.add('ground', quad4(V(-ext, 0, 70), V(ext, 0, 70), V(ext, 0, GUTTER.outer), V(-ext, 0, GUTTER.outer)), { uv: 'box' });

  // --- asphalt with faded centre dashes and a worn zebra by the church gate
  B.add('asphalt', quad4(V(-ext, 0.012, ROAD.z1), V(ext, 0.012, ROAD.z1), V(ext, 0.012, ROAD.z0), V(-ext, 0.012, ROAD.z0)), { color: '#ffffff' });
  for (let x = -ext + 2; x < ext; x += 9) {
    if (x > 4 && x < 14) continue;
    B.quad('props', x + 1.5, 0.02, 0, 3, 0.12, { rx: -Math.PI / 2, uv: P.roadpaint, color: '#e8e4d8' });
  }
  for (let i = 0; i < 8; i++) B.quad('props', 9.5, 0.02, -3.3 + i * 0.95, 3.2, 0.5, { rx: -Math.PI / 2, uv: P.roadpaint, color: '#d9d5c8' });

  // --- drains: concrete walls, murky water, slab crossings; colliders on open runs
  for (const side of [-1, 1]) {
    const zi = side * GUTTER.inner, zo = side * GUTTER.outer;
    const zIn = side * (GUTTER.inner + 0.12), zOut = side * (GUTTER.outer - 0.12);
    B.boxMM('concrete', -ext, -0.6, Math.min(zi, zIn), ext, 0.07, Math.max(zi, zIn), { color: '#b8b3a8' });
    B.boxMM('concrete', -ext, -0.6, Math.min(zo, zOut), ext, 0.04, Math.max(zo, zOut), { color: '#aaa598' });
    B.boxMM('water', -ext, -0.62, Math.min(zIn, zOut), ext, -0.42, Math.max(zIn, zOut), { color: '#3b3a26', uv: 'keep' });
    const crossings = side < 0 ? CROSS_N : CROSS_S;
    for (const [a, c] of crossings) {
      B.boxMM('concrete', a, -0.05, Math.min(zi, zo) - 0.05, c, 0.09, Math.max(zi, zo) + 0.05, { color: '#c9c4b6' });
    }
    for (const [a, c] of gutterRuns(crossings)) W.collide(a, -0.6, Math.min(zi, zo), c, 1.2, Math.max(zi, zo), 'gutter');
    // litter in the drain
    const r = rng(side > 0 ? 3 : 4);
    for (let i = 0; i < 40; i++) {
      const x = -68 + r() * 136, z = side * (GUTTER.inner + 0.2 + r() * 0.4);
      B.quad('props', x, -0.41, z, 0.12, 0.08, { rx: -Math.PI / 2, rz: r() * 3, uv: r() < 0.6 ? P.white : P.sachet, color: r() < 0.5 ? '#e8eef2' : '#5a7fa8' });
    }
  }

  // --- electric poles + wires
  const poleList = [];
  for (let x = -64; x <= 66; x += 20) poleList.push([x, -7.9]);
  for (let x = -60; x <= 66; x += 20) poleList.push([x, 7.9]);
  for (const [x, z] of poleList) { W.inst('pole', mat(x, 0, z, z > 0 ? Math.PI : 0)); W.cylinder(x, z, 0.2, 9); }
  const wire = (a, b, sag) => {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = a.clone().lerp(b, t0); p0.y -= sag * 4 * t0 * (1 - t0);
      const p1 = a.clone().lerp(b, t1); p1.y -= sag * 4 * t1 * (1 - t1);
      W.lines.push(p0, p1);
    }
  };
  for (const zs of [-7.9, 7.9]) {
    const row = poleList.filter((p) => p[1] === zs).sort((p, q) => p[0] - q[0]);
    const ends = [[-ext, zs], ...row, [ext, zs]];
    for (let i = 0; i < ends.length - 1; i++) {
      for (const off of [-0.85, 0, 0.85]) wire(V(ends[i][0], POLE_ARM_Y + 0.12, zs + off), V(ends[i + 1][0], POLE_ARM_Y + 0.12, zs + off), 0.55 + (off + 1) * 0.1);
      wire(V(ends[i][0], 6.5, zs), V(ends[i + 1][0], 6.5, zs), 0.8);
    }
  }
  // cross-road and service drops
  wire(V(-4, 8.5, -7.9), V(0, 8.5, 7.9), 0.7);
  wire(V(36, 8.5, -7.9), V(40, 8.5, 7.9), 0.7);
  wire(V(16, 6.4, -7.9), V(17.5, 4.6, -12.6), 0.25);
  wire(V(16, 6.4, -7.9), V(10, 5.8, -20.2), 0.4);
  wire(V(20, 6.4, 7.9), V(22, 3.8, 17.6), 0.3);
  wire(V(-20, 6.4, 7.9), V(-11, 3.0, 12), 0.3);
  wire(V(-44, 6.4, -7.9), V(-45, 4.6, -10), 0.2);
  wire(V(-64, 6.4, -7.9), V(-62, 6.0, -10), 0.2);
  wire(V(40, 6.4, 7.9), V(42, 6.2, 14), 0.3);
  // transformer on the pole near the shops
  B.box('metal', -44, 6.0, -8.35, 0.7, 0.9, 0.5, { color: '#7f8a8f' });
  for (let i = 0; i < 5; i++) B.box('metal', -44.25 + i * 0.12, 6.0, -8.65, 0.03, 0.7, 0.12, { color: '#6f7a7f', uv: 'keep' });
  for (const s of [-0.2, 0, 0.2]) B.cyl('plastic', -44 + s, 6.45, -8.35, 0.03, 0.05, 0.25, 6, { color: '#7a3b1e' });

  // --- street name sign
  signboard(W, 'street', -21, 2.9, -7.6, 1.6, 0, { posts: false });
  B.box('metal', -21, 1.45, -7.62, 0.06, 2.9, 0.06, { color: '#2f3336', uv: 'keep' });
  W.cylinder(-21, -7.62, 0.08, 3);

  buildBusStop(W);
  buildBackground(W);

  // --- playable perimeter
  W.collide(MAP.minX + 1, -1, -60, MAP.minX + 1.6, 6, 60, 'boundary');
  W.collide(MAP.maxX - 1.6, -1, -60, MAP.maxX - 1, 6, 60, 'boundary');
  W.collide(-80, -1, MAP.minZ, 80, 6, MAP.minZ + 0.6, 'boundary');
  W.collide(-80, -1, 34.4, 80, 6, 35, 'boundary');
}

function buildBusStop(W) {
  const { b: B, P } = W;
  const [x0, x1] = BUSSTOP.shelter;
  const z0 = 5.3, z1 = 7.7;
  // concrete pad
  B.boxMM('concrete', x0 - 0.5, 0, GUTTER.outer, x1 + 0.5, 0.06, 8.3, { color: '#bdb7aa' });
  // posts painted yellow and black
  for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) {
    for (const z of [z0 + 0.15, z1 - 0.15]) {
      B.box('metal', x, 1.35, z, 0.1, 2.7, 0.1, { color: '#e2b007', uv: 'keep' });
      B.box('metal', x, 0.3, z, 0.11, 0.6, 0.11, { color: '#151515', uv: 'keep' });
      W.cylinder(x, z, 0.08, 2.7);
    }
  }
  shedRoof(W, x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.3, 2.95, 2.75, { color: '#2c5d8f', dir: 0 });
  W.collide(x0 - 0.4, 2.75, z0 - 0.4, x1 + 0.4, 2.95, z1 + 0.3, 'roof');
  B.box('metal', (x0 + x1) / 2, 2.73, z0 - 0.4, x1 - x0 + 0.8, 0.12, 0.06, { color: '#1d3f66', uv: 'keep' });
  // back panel with adverts
  B.box('metal', (x0 + x1) / 2, 1.4, z1 - 0.05, x1 - x0 - 0.4, 1.6, 0.05, { color: '#d8d6d0' });
  W.collide(x0 + 0.2, 0, z1 - 0.1, x1 - 0.2, 2.2, z1, 'wall');
  const ad = new THREE.PlaneGeometry(1.1, 1.65); rectUV(ad, W.S.crusade);
  B.add('signs', ad, { m: mat(x0 + 1.4, 1.45, z1 - 0.085, Math.PI) });
  B.add('signs', ad.clone(), { m: mat(x0 + 1.4, 1.45, z1 - 0.085 - 0.001, 0) });
  const ad2 = new THREE.PlaneGeometry(1.0, 1.25); rectUV(ad2, W.S['clinic-poster']);
  B.add('signs', ad2, { m: mat(x1 - 1.6, 1.45, z1 - 0.085, 0) });
  // bench
  B.box('metal', (x0 + x1) / 2, 0.45, z1 - 0.45, x1 - x0 - 1, 0.05, 0.4, { color: '#9aa3a8' });
  for (const x of [x0 + 0.9, (x0 + x1) / 2, x1 - 0.9]) B.box('metal', x, 0.22, z1 - 0.45, 0.06, 0.44, 0.34, { color: '#4b5155', uv: 'keep' });
  W.collide(x0 + 0.5, 0, z1 - 0.65, x1 - 0.5, 0.5, z1 - 0.25, 'furniture');
  for (let i = 0; i < 9; i++) W.seat(x0 + 0.8 + i * 0.75, 0.47, z1 - 0.42, Math.PI, 'bench', 'busstop');
  // YABA sign on the roof edge
  signboard(W, 'busstop', (x0 + x1) / 2, 3.35, z0 - 0.3, 2.8, Math.PI, { back: true });
  signboard(W, 'busstop', (x0 + x1) / 2, 3.35, z0 - 0.36, 2.8, 0, { back: false });
  // litter bin
  B.cyl('metal', x1 + 0.6, 0, 7.6, 0.25, 0.22, 0.8, 10, { color: '#1f6b3a' });
  W.cylinder(x1 + 0.6, 7.6, 0.25, 0.8);
  W.interact('busstop-wait', V((x0 + x1) / 2, 0, 6.3), 3, 'Wait for a danfo', 'sit');
}

function buildBackground(W) {
  const { b: B } = W;
  // north-west shops (2-storey with shops on the ground floor)
  block(W, { x0: -68, z0: -20, x1: -55, z1: -10, floors: 2, color: '#e9dcc0', base: '#857c6c', seed: 3, roof: 'flat', balcony: 's',
    shops: [{ face: 's', a: -66.5, b: -63.5, sign: 'barber' }, { face: 's', a: -61, b: -57, sign: 'chemist' }] });
  block(W, { x0: -53, z0: -19, x1: -40, z1: -10, floors: 2, color: '#b9cfdc', base: '#5d6e78', seed: 5, roof: 'hip', roofColor: '#8e3b2f',
    shops: [{ face: 's', a: -51.5, b: -48.5, sign: 'tailor' }, { face: 's', a: -46, b: -42 }] });
  block(W, { x0: -38, z0: -18, x1: -25, z1: -10, floors: 1, fh: 3.4, color: '#e9b48a', base: '#7d5a44', seed: 7, roof: 'gable-x', roofColor: '#7f8689',
    shops: [{ face: 's', a: -36.5, b: -33 }], doors: [{ face: 's', at: -29, leaf: 'door-steel' }] });
  wallText(W, 'postnobill', -27.2, 1.4, -9.98, 1.6, 0);
  // fences tying the fronts together
  fence(W, 'x', -55, -53, -10, { h: 2.4, color: '#e5ddcc' });
  fence(W, 'x', -40, -38, -10, { h: 2.4, color: '#e5ddcc' });
  fence(W, 'x', -25, -22, -9.5, { h: 2.4, color: '#e5ddcc' });
  fence(W, 'z', -10, -8.5, -22, { h: 2.4, color: '#e5ddcc' });
  // deeper rows behind them
  block(W, { x0: -68, z0: -40, x1: -50, z1: -24, floors: 2, color: '#d9c7a7', seed: 11, roof: 'hip', roofColor: '#7d8487', noWin: ['n'] });
  block(W, { x0: -46, z0: -38, x1: -26, z1: -23, floors: 1, fh: 3.4, color: '#c9d8c0', seed: 13, roof: 'gable-x', roofColor: '#8b4a36', noWin: ['n'] });
  // north-east: 3-storey block behind its fence
  block(W, { x0: 55, z0: -25, x1: 68, z1: -12, floors: 3, color: '#dcc9e3', base: '#6a5a72', seed: 17, roof: 'flat', balcony: 's' });
  fence(W, 'x', 52, 70, -8.5, { h: 2.3, color: '#f2ece0', base: '#6a5a72', gaps: [], wire: true });
  B.boxMM('metal', 60, 0, -8.62, 63.6, 2.2, -8.38, { color: '#1f3d2b' });
  block(W, { x0: 55, z0: -43, x1: 68, z1: -29, floors: 2, color: '#ece2cf', seed: 19, roof: 'hip', roofColor: '#3a5f86', noWin: ['n'] });

  // south-west behind the bus stop
  block(W, { x0: -68, z0: 11, x1: -59, z1: 21, floors: 2, color: '#f0e2b6', base: '#857a5a', seed: 23, roof: 'flat', shops: [{ face: 'n', a: -66.5, b: -61.5, sign: 'minimart' }], balcony: 'n' });
  block(W, { x0: -57, z0: 14, x1: -47, z1: 23, floors: 1, fh: 3.3, color: '#dfe7ea', base: '#6b7a80', seed: 29, roof: 'gable-x', roofColor: '#7f8689' });
  const post = new THREE.PlaneGeometry(0.75, 1.1);
  for (const [i, x] of [-55.5, -54.6, -53.7].entries()) {
    const g = post.clone(); rectUV(g, W.S[i === 1 ? 'crusade' : 'poster-vigil']);
    B.add('signs', g, { m: mat(x, 1.6, 13.985, Math.PI) });
  }
  wallText(W, 'postnobill', -50, 2.5, 13.985, 1.6, Math.PI);
  fence(W, 'x', -68, -46, 24, { h: 2.4, color: '#e2dccd' });
  // market back row of lock-up shops
  block(W, { x0: -44, z0: 25, x1: -21, z1: 31, floors: 1, fh: 3.2, color: '#e7d7b3', base: '#7b6a50', seed: 31, roof: 'gable-x', roofColor: '#878d90',
    shops: [{ face: 'n', a: -42, b: -39 }, { face: 'n', a: -36, b: -33 }, { face: 'n', a: -30, b: -27 }], doors: [{ face: 'n', at: -24, leaf: 'door-steel' }] });
  block(W, { x0: -18, z0: 25, x1: 3, z1: 31, floors: 1, fh: 3.2, color: '#cfe0e8', base: '#5b6b72', seed: 37, roof: 'gable-x', roofColor: '#8e3b2f',
    shops: [{ face: 'n', a: -16, b: -13 }, { face: 'n', a: -10, b: -7 }], doors: [{ face: 'n', at: -2, leaf: 'door-steel' }, { face: 'n', at: 1, leaf: 'door-wood' }] });
  fence(W, 'x', -21, -18, 28, { h: 2.4, color: '#e2dccd' });
  fence(W, 'x', 3, 6, 28, { h: 2.4, color: '#e2dccd' });
  fence(W, 'z', 24, 34, -46, { h: 2.4, color: '#e2dccd' });

  // east of home: storey building with balcony, bungalow
  fence(W, 'x', 33, 52, 8.5, { h: 2.3, color: '#f1eadb', base: '#6d7f5e', gaps: [[42, 45.6]] });
  B.boxMM('metal', 42, 0, 8.38, 45.6, 2.25, 8.62, { color: '#2a2a2a' });
  for (let i = 0; i < 12; i++) B.box('metal', 42.15 + i * 0.3, 2.35, 8.5, 0.03, 0.25, 0.03, { color: '#2a2a2a', uv: 'keep' });
  W.collide(42, 0, 8.38, 45.6, 2.3, 8.62, 'gate');
  wallText(W, 'notforsale', 37.6, 1.35, 8.38, 3.4, Math.PI);
  block(W, { x0: 36, z0: 14, x1: 50, z1: 26, floors: 2, color: '#cfe3c8', base: '#5f7457', seed: 41, roof: 'hip', roofColor: '#2f5d8a', balcony: 'n', doors: [{ face: 'n', at: 43.8, leaf: 'door-steel' }] });
  fence(W, 'x', 52, 70, 8.5, { h: 2.3, color: '#f4e6dc', base: '#8a6a5a', gaps: [[58, 61]] });
  B.boxMM('metal', 58, 0, 8.38, 61, 2.25, 8.62, { color: '#5a1f1f' });
  W.collide(58, 0, 8.38, 61, 2.3, 8.62, 'gate');
  block(W, { x0: 54, z0: 12, x1: 68, z1: 22, floors: 1, fh: 3.3, color: '#f2d6c9', base: '#8a6a5a', seed: 43, roof: 'hip', roofColor: '#7d8487' });
  fence(W, 'z', 8.5, 34, 33, { h: 2.4, color: '#e9e2d2' });
  fence(W, 'z', 8.5, 34, 52, { h: 2.4, color: '#e9e2d2' });

  // far skyline rows (cheap, mostly hidden by fog)
  const r = rng(99);
  const cols = ['#e8dcc0', '#d9c7a7', '#c9d8c0', '#e9b48a', '#b9cfdc', '#efe7d6', '#d7c6b0', '#e3d3e8'];
  const roofs = ['#7f8689', '#8e3b2f', '#2f5d8a', '#6d7376', '#8a4a32'];
  for (const [zA, zB, faceAway] of [[36, 48, 's'], [-58, -47, 'n']]) {
    let x = -96;
    while (x < 96) {
      const w = 8 + r() * 10, d = zB - zA - r() * 3;
      const fl = r() < 0.5 ? 1 : r() < 0.7 ? 2 : 3;
      block(W, { x0: x, z0: zA + (zB - zA - d) / 2, x1: x + w, z1: zA + (zB - zA - d) / 2 + d, floors: fl, fh: 3.2, color: cols[(r() * cols.length) | 0], seed: (r() * 1000) | 0,
        roof: fl === 1 ? 'hip' : r() < 0.5 ? 'flat' : 'hip', roofColor: roofs[(r() * roofs.length) | 0], noWin: [faceAway, 'e', 'w'] });
      x += w + 1 + r() * 3;
    }
  }
  // road continues east and west past the play area
  for (const [x0, x1, s] of [[-96, -72, 1], [72, 96, 1], [-96, -72, -1], [72, 96, -1]]) {
    let x = x0;
    while (x < x1) {
      const w = 7 + r() * 8, fl = r() < 0.6 ? 1 : 2;
      const zA = s > 0 ? 10 : -22, zB = s > 0 ? 22 : -10;
      block(W, { x0: x, z0: zA, x1: x + w, z1: zB, floors: fl, color: cols[(r() * cols.length) | 0], seed: (r() * 1000) | 0, roof: 'hip', roofColor: roofs[(r() * roofs.length) | 0], noWin: [s > 0 ? 's' : 'n'] });
      x += w + 2;
    }
  }
}
