// Grace Assembly compound: fence + gate + security post, car park, auditorium (pews, altar,
// pulpit, cross, choir stand, band, PA, projector screens, fans, media desk), prayer room,
// canteen/kitchen, children's church canopy, bell, tanks and generator.
import * as THREE from 'three';
import { mat, quad4, rectUV } from './geo.js';
import { wall, gableRoof, hipRoof, fence, signboard, wallText } from './buildings.js';
import { atlasBox, lathe } from './props.js';
import { CHURCH, HALL, ALTAR, CHOIR, MEDIA, PRAYER, CANTEEN, KIDS, CARPARK, SECPOST } from './layout.js';
import { rng } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = '#f6f2e7', BLUE = '#2f5d9a', CREAM = '#f1e7cf';

export function buildChurch(W) {
  const { b: B, P, S } = W;
  const r = rng(21);

  // --- ground: interlocking pavers, concrete car park
  B.add('pavers', quad4(V(CHURCH.x0, 0.008, CHURCH.z1), V(CHURCH.x1, 0.008, CHURCH.z1), V(CHURCH.x1, 0.008, CHURCH.z0), V(CHURCH.x0, 0.008, CHURCH.z0)), { uv: 'box' });
  B.add('concrete', quad4(V(CARPARK.x0, 0.014, CARPARK.z1), V(CARPARK.x1, 0.014, CARPARK.z1), V(CARPARK.x1, 0.014, CARPARK.z0), V(CARPARK.x0, 0.014, CARPARK.z0)), { uv: 'box', color: '#d7d2c6' });
  // entrance apron across the drain-side walkway
  B.add('concrete', quad4(V(5.5, 0.025, -4.84), V(14.8, 0.025, -4.84), V(14.8, 0.025, -8.5), V(5.5, 0.025, -8.5)), { uv: 'box', color: '#cfcabe' });

  // --- perimeter fence with razor wire, gate pillars and arch sign
  const [g0, g1] = CHURCH.gate, [w0, w1] = CHURCH.wicket;
  fence(W, 'x', CHURCH.x0, CHURCH.x1, CHURCH.z1, { h: 2.4, color: WHITE, base: BLUE, gaps: [[g0, g1], [w0, w1]], wire: true });
  fence(W, 'z', CHURCH.z0, CHURCH.z1, CHURCH.x0, { h: 2.4, color: WHITE, base: BLUE, wire: true });
  fence(W, 'z', CHURCH.z0, CHURCH.z1, CHURCH.x1, { h: 2.4, color: WHITE, base: BLUE, wire: true });
  fence(W, 'x', CHURCH.x0, CHURCH.x1, CHURCH.z0, { h: 2.4, color: WHITE, base: BLUE, wire: true });
  for (const x of [g0 - 0.35, g1 + 0.4, w1 + 0.35]) {
    B.box('plaster', x, 1.6, CHURCH.z1, 0.7, 3.2, 0.7, { color: WHITE });
    B.box('plaster', x, 0.4, CHURCH.z1, 0.74, 0.8, 0.74, { color: BLUE });
    B.box('concrete', x, 3.26, CHURCH.z1, 0.8, 0.12, 0.8, { color: '#d6d0c2' });
    W.collide(x - 0.35, 0, CHURCH.z1 - 0.35, x + 0.35, 3.2, CHURCH.z1 + 0.35, 'fence');
  }
  B.box('metal', (g0 + w1) / 2, 3.75, CHURCH.z1, w1 - g0 + 1.4, 0.22, 0.25, { color: BLUE });
  signboard(W, 'church-arch', (g0 + w1) / 2, 4.55, CHURCH.z1 + 0.06, 6.4, 0, { backColor: '#14306b' });
  B.box('metal', g0 + 0.2, 4.2, CHURCH.z1, 0.08, 0.7, 0.08, { color: '#14306b', uv: 'keep' });
  B.box('metal', w1 - 0.2, 4.2, CHURCH.z1, 0.08, 0.7, 0.08, { color: '#14306b', uv: 'keep' });
  // sliding gate leaves parked open behind the fence
  for (const [x0, x1] of [[g0 - 6.2, g0 - 3.2], [g0 - 3.1, g0 - 0.1]]) {
    B.boxMM('metal', x0, 0.08, CHURCH.z1 - 0.48, x1, 2.25, CHURCH.z1 - 0.4, { color: '#1e3f73' });
    for (let x = x0 + 0.15; x < x1; x += 0.3) B.box('metal', x, 2.4, CHURCH.z1 - 0.44, 0.03, 0.3, 0.03, { color: '#1e3f73', uv: 'keep' });
  }
  W.collide(g0 - 6.2, 0, CHURCH.z1 - 0.5, g0 - 0.1, 2.3, CHURCH.z1 - 0.38, 'gate');
  // wicket leaf swung open inward
  B.add('metal', new THREE.BoxGeometry(w1 - w0 - 0.05, 2.1, 0.05), { m: mat(w0, 1.13, CHURCH.z1 - 0.1, Math.PI / 2 - 0.15).multiply(mat((w1 - w0) / 2, 0, 0)), color: '#1e3f73', uv: 'box' });
  // boom barrier raised
  B.box('metal', g1 - 0.2, 0.55, CHURCH.z1 - 1.4, 0.3, 1.1, 0.3, { color: '#c1121f' });
  const boom = new THREE.BoxGeometry(5.6, 0.09, 0.09);
  B.add('paint', boom, { m: mat(g1 - 0.2, 1.1, CHURCH.z1 - 1.4, 0, 0, Math.PI / 2 - 0.25).multiply(mat(-2.8, 0, 0)), color: '#e8e4dc' });
  W.collide(g1 - 0.4, 0, CHURCH.z1 - 1.6, g1, 1.1, CHURCH.z1 - 1.2, 'prop');

  buildSecurityPost(W);
  buildCarPark(W, r);
  buildHall(W, r);
  buildPrayerRoom(W);
  buildCanteen(W, r);
  buildKids(W);

  // --- bell on a steel frame
  {
    const x = 1.8, z = -15.5;
    for (const s of [-1, 1]) { B.box('metal', x + s * 0.7, 1.6, z, 0.1, 3.2, 0.1, { color: '#2b2b2b' }); W.cylinder(x + s * 0.7, z, 0.1, 3.2); }
    B.box('metal', x, 3.2, z, 1.6, 0.12, 0.12, { color: '#2b2b2b' });
    W.interact('bell', V(x, 0, z), 2, 'Ring the church bell', 'ring-bell');
    B.box('concrete', x, 0.05, z, 2.0, 0.1, 0.8, { color: '#bdb8ad' });
  }

  // --- utilities behind the hall: tanks on a tower and the big generator
  W.inst('tankTall', mat(-4, 0, -40.5));
  W.inst('tankTall', mat(-1.5, 0, -40.5, 0.4));
  W.collide(-4.8, 0, -41.3, -0.7, 4, -39.7, 'prop');
  B.boxMM('metal', -13.5, 0, -42.8, -8.5, 1.9, -40.6, { color: '#2f5d3a' });
  for (let i = 0; i < 8; i++) B.box('metal', -13.2 + i * 0.6, 1.2, -40.58, 0.4, 0.5, 0.02, { color: '#244a2e', uv: 'keep' });
  B.box('metal', -9, 2.4, -42.2, 0.12, 1.0, 0.12, { color: '#555', uv: 'keep' });
  W.collide(-13.5, 0, -42.8, -8.5, 1.9, -40.6, 'prop');

  // --- trees and hedges
  for (const [x, z, k] of [[-19, -10.6, 0], [2.6, -10.8, 1], [24, -10.8, 2], [33.5, -10.8, 0], [50.4, -10.5, 1], [1.8, -36, 2], [37, -43.2, 1], [-20, -42, 0], [-20.8, -31, 2]]) {
    W.inst('palm' + k, mat(x, 0, z, r() * 6)); W.cylinder(x, z, 0.3, 4);
  }
  for (const [x, z] of [[-11, -18.5], [50, -42]]) { W.inst('mango', mat(x, 0, z, r() * 6)); W.cylinder(x, z, 0.35, 3); }
  for (const [x0, x1] of [[10, 14.6], [23.4, 33]]) {
    W.inst('hedge', mat((x0 + x1) / 2, 0, -19.2, 0, 0, 0, (x1 - x0) / 4, 1, 1));
    W.collide(x0, 0, -19.5, x1, 0.8, -18.9, 'hedge');
  }
}

function buildSecurityPost(W) {
  const { b: B } = W;
  const { x0, x1, z0, z1 } = SECPOST;
  const h = 2.7, o = { h, t: 0.18, color: WHITE, inner: '#e9e4d4' };
  wall(W, 'x', x0, x1, z1, { ...o, out: 1, openings: [{ a: x0 + 0.6, b: x1 - 0.6, y0: 1.0, y1: 2.1, type: 'window', win: 'win-slide', grille: '#1e3f73' }] });
  wall(W, 'x', x0, x1, z0, { ...o, out: -1, openings: [{ a: x0 + 0.5, b: x0 + 1.4, y0: 0, y1: 2.1, type: 'door', leaf: 'door-steel' }] });
  wall(W, 'z', z0, z1, x0, { ...o, out: -1, openings: [{ a: z0 + 0.5, b: z1 - 0.5, y0: 1.0, y1: 2.1, type: 'window', win: 'win-slide', grille: '#1e3f73' }] });
  wall(W, 'z', z0, z1, x1, { ...o, out: 1 });
  B.boxMM('concrete', x0 - 0.5, h, z0 - 0.5, x1 + 0.5, h + 0.18, z1 + 0.5, { color: '#d6d0c2' });
  B.boxMM('tiles', x0, 0, z0, x1, 0.02, z1, { color: '#d8cfc0' });
  B.boxMM('plaster', x0 - 0.02, 0, z0 - 0.02, x1 + 0.02, 0.5, z1 + 0.02, { color: BLUE });
  signboard(W, 'security', x0 - 0.13, 2.38, (z0 + z1) / 2, 1.2, -Math.PI / 2, { back: false });
  W.inst('chair', mat(x0 + 0.7, 0, (z0 + z1) / 2 + 0.3, -Math.PI / 2), '#2a2a2a');
  W.seat(x0 + 0.7, 0.45, (z0 + z1) / 2 + 0.3, -Math.PI / 2, 'chair', 'gate');
  B.box('wood', x0 + 0.35, 0.75, (z0 + z1) / 2 - 0.3, 0.5, 0.05, 0.9, { color: '#6d4c30' });
  B.box('props', x0 + 0.35, 0.79, (z0 + z1) / 2 - 0.3, 0.3, 0.02, 0.4, { uv: W.P.white, color: '#1d4ed8' });
}

function buildCarPark(W, r) {
  const { b: B, P } = W;
  // bay lines
  const line = (x, z, w, d) => B.quad('props', x, 0.045, z, w, d, { rx: -Math.PI / 2, uv: P.roadpaint, color: '#efece2' });
  for (let i = 0; i <= 6; i++) line(-17.5, -25.9 + i * 2.6, 5, 0.1);
  line(-15, -18.1, 0.1, 15.6);
  for (let i = 0; i <= 4; i++) line(-4.5, -24.9 + i * 2.6, 5, 0.1);
  line(-7, -19.7, 0.1, 10.4);
  const cols = ['#c9ccd1', '#1c1c1e', '#e9e9e6', '#6b1d24', '#3b4a5c', '#b7a68a'];
  const cars = [[-17.7, -24.6, Math.PI], [-17.7, -21.95, Math.PI], [-17.6, -16.75, Math.PI], [-17.7, -11.55, Math.PI], [-4.3, -23.6, 0], [-4.4, -18.4, 0]];
  cars.forEach(([x, z, ry], i) => {
    W.inst('car', mat(x, 0, z, ry + (r() - 0.5) * 0.05), cols[i % cols.length]);
    W.collide(x - 2.35, 0, z - 0.95, x + 2.35, 1.45, z + 0.95, 'vehicle');
  });
  signboard(W, 'carpark', -8.5, 2.2, -9.25, 1.5, 0, { posts: true, back: true });
}

function buildHall(W, r) {
  const { b: B, P, S } = W;
  const { x0, x1, z0, z1, h } = HALL;
  const cx = (x0 + x1) / 2;
  const wo = { h, t: 0.25, color: WHITE, inner: CREAM };
  const winSide = (a, b) => ({ a, b, y0: 1.5, y1: 4.1, type: 'hallwin', grille: '#2b2b2b', sill: '#d8d2c4', frame: '#d0c8b4' });
  const sideWins = [[-40.4, -38.6], [-36.9, -35.1], [-33.4, -31.6], [-25.4, -23.6], [-22.6, -20.9]].map(([a, b]) => winSide(a, b));
  const sideDoor = { a: -29.1, b: -26.9, y0: 0, y1: 2.6, type: 'door', leaf: 'door-wood', double: true };
  wall(W, 'z', z0, z1, x0, { ...wo, out: -1, openings: [...sideWins, sideDoor] });
  wall(W, 'z', z0, z1, x1, { ...wo, out: 1, openings: [...sideWins, sideDoor] });
  wall(W, 'x', x0, x1, z0, { ...wo, out: -1, openings: [{ a: 6.0, b: 7.6, y0: 3.4, y1: 5.0, type: 'hallwin', grille: '#2b2b2b' }, { a: 30.4, b: 32.0, y0: 3.4, y1: 5.0, type: 'hallwin', grille: '#2b2b2b' }] });
  const mainDoor = { a: cx - 2, b: cx + 2, y0: 0, y1: 3.0, type: 'door', leaf: 'door-wood', double: true };
  wall(W, 'x', x0, x1, z1, { ...wo, out: 1, openings: [{ a: 7.4, b: 9.4, y0: 0, y1: 2.6, type: 'door', leaf: 'door-wood' }, { a: 11.4, b: 13.2, y0: 1.5, y1: 4.1, type: 'hallwin', grille: '#2b2b2b' }, mainDoor, { a: 24.8, b: 26.6, y0: 1.5, y1: 4.1, type: 'hallwin', grille: '#2b2b2b' }] });
  // plinth band outside, wood dado inside
  const band = (axis, s0, s1, c, out, gaps) => {
    let cur = s0;
    for (const [a, b] of [...gaps, [s1, s1]]) {
      if (a > cur) {
        if (axis === 'x') { B.boxMM('plaster', cur, 0, c + out * 0.125, a, 0.7, c + out * 0.16, { color: BLUE }); B.boxMM('wood', cur, 0, c - out * 0.125, a, 1.1, c - out * 0.145, { color: '#9a6a3e' }); }
        else { B.boxMM('plaster', c + out * 0.125, 0, cur, c + out * 0.16, 0.7, a, { color: BLUE }); B.boxMM('wood', c - out * 0.125, 0, cur, c - out * 0.145, 1.1, a, { color: '#9a6a3e' }); }
      }
      cur = Math.max(cur, b);
    }
  };
  band('z', z0, z1, x0, -1, [[-29.1, -26.9]]);
  band('z', z0, z1, x1, 1, [[-29.1, -26.9]]);
  band('x', x0, x1, z1, 1, [[7.4, 9.4], [cx - 2, cx + 2]]);
  // pilasters between the side windows, and a gutter board
  for (const z of [-41.7, -37.5, -34.2, -30.5, -26.1, -20.3]) for (const [x, s] of [[x0, -1], [x1, 1]]) {
    B.box('plaster', x + s * 0.2, h / 2, z, 0.18, h, 0.45, { color: '#ece6d8' });
    B.box('plaster', x + s * 0.21, 0.35, z, 0.2, 0.7, 0.47, { color: BLUE });
  }
  // floor, ceiling, roof
  B.boxMM('tiles', x0, -0.05, z0, x1, 0.02, z1, { color: '#efe7da' });
  B.boxMM('carpet', cx - 1, 0.02, -35.4, cx + 1, 0.03, z1 - 0.3, { color: '#7d1f2b' });
  B.boxMM('ceiling', x0, HALL.ceil, z0, x1, HALL.ceil + 0.05, z1, { color: '#f7f6f1' });
  for (const z of [-26, -32, -38]) B.boxMM('paint', x0, HALL.ceil - 0.06, z - 0.06, x1, HALL.ceil, z + 0.06, { color: '#d9d4c7', uv: 'keep' });
  gableRoof(W, x0, z0, x1, z1, h, 3.6, 'z', { color: '#7b2b27', wallColor: WHITE, overhang: 0.7, fascia: '#efe9dc' });
  // facade: cross on the gable, name, porch
  B.box('plaster', cx, h + 4.4, z1 + 0.25, 0.3, 2.2, 0.2, { color: WHITE });
  B.box('plaster', cx, h + 4.9, z1 + 0.25, 1.3, 0.3, 0.2, { color: WHITE });
  signboard(W, 'church-arch', cx, h + 1.25, z1 + 0.2, 7.2, 0, { backColor: '#14306b' });
  B.boxMM('concrete', cx - 4.4, 3.7, z1, cx + 4.4, 3.95, z1 + 3.2, { color: '#e6e0d2' });
  B.boxMM('paint', cx - 4.45, 3.62, z1 + 3.15, cx + 4.45, 3.98, z1 + 3.25, { color: BLUE, uv: 'keep' });
  for (const s of [-1, 1]) { B.box('plaster', cx + s * 3.9, 1.85, z1 + 2.8, 0.4, 3.7, 0.4, { color: WHITE }); W.collide(cx + s * 3.9 - 0.2, 0, z1 + 2.6, cx + s * 3.9 + 0.2, 3.7, z1 + 3.0, 'pillar'); }
  B.boxMM('tiles', cx - 4.4, 0.0, z1, cx + 4.4, 0.03, z1 + 3.2, { color: '#d8cfc0' });
  // gutters and downpipes, AC outdoor units
  for (const x of [x0 + 0.2, x1 - 0.2]) for (const z of [z0 + 0.3, z1 - 0.3]) B.cyl('plastic', x + (x < cx ? -0.25 : 0.25), 0, z, 0.05, 0.05, h, 6, { color: '#e9e6dd' });
  for (const [x, z, ry] of [[x0 - 0.3, -32.5, -Math.PI / 2], [x0 - 0.3, -39.5, -Math.PI / 2], [x1 + 0.3, -32.5, Math.PI / 2], [x1 + 0.3, -39.5, Math.PI / 2]]) W.inst('acOut', mat(x, 0.65, z, ry));

  // --- altar platform, steps, choir risers
  const carpet = '#8b1d2c';
  B.boxMM('wood', ALTAR.x0, 0, ALTAR.z0, ALTAR.x1, ALTAR.h - 0.02, ALTAR.z1, { color: '#6b4226' });
  B.boxMM('carpet', ALTAR.x0, ALTAR.h - 0.02, ALTAR.z0, ALTAR.x1, ALTAR.h, ALTAR.z1, { color: carpet });
  B.boxMM('carpet', ALTAR.x0, 0, ALTAR.z1, ALTAR.x1, 0.4, ALTAR.z1 + 0.4, { color: carpet });
  B.boxMM('carpet', ALTAR.x0, 0, ALTAR.z1 + 0.4, ALTAR.x1, 0.2, ALTAR.z1 + 0.8, { color: carpet });
  for (const y of [0.2, 0.4]) B.boxMM('paint', ALTAR.x0, y - 0.015, ALTAR.z1 + (y === 0.4 ? 0 : 0.4) + 0.36, ALTAR.x1, y + 0.005, ALTAR.z1 + (y === 0.4 ? 0.4 : 0.8), { color: '#d4af37', uv: 'keep' });
  B.boxMM('wood', CHOIR.x0, 0.6, -40.2, CHOIR.x1, 0.85, CHOIR.z1, { color: '#7a4b2a' });
  B.boxMM('wood', CHOIR.x0, 0.6, CHOIR.z0, CHOIR.x1, 1.1, -40.2, { color: '#7a4b2a' });
  // pleated curtain + valance behind the altar
  {
    const n = 44, xa = ALTAR.x0, xb = ALTAR.x1, y0 = ALTAR.h, y1 = 5.85, zc = z0 + 0.3;
    const pos = [], idx = [], uv = [];
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * i / n, z = zc + (i % 2 ? 0.09 : 0);
      pos.push(x, y0, z, x, y1, z); uv.push(x, y0, x, y1);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    B.add('fabric', g, { color: '#4a2370' });
    B.boxMM('fabric', xa, 5.45, zc + 0.12, xb, 5.95, zc + 0.16, { color: '#c9a23a', uv: 'keep' });
  }
  // cross with a soft glow panel
  B.box('lamp', cx, 3.1, z0 + 0.47, 0.44, 3.36, 0.03, { color: '#ffd98a' });
  B.box('lamp', cx, 3.95, z0 + 0.47, 2.06, 0.44, 0.03, { color: '#ffd98a' });
  B.box('wood', cx, 3.1, z0 + 0.55, 0.28, 3.2, 0.14, { color: '#4a2a14' });
  B.box('wood', cx, 3.95, z0 + 0.55, 1.9, 0.28, 0.14, { color: '#4a2a14' });
  signboard(W, 'banner-welcome', cx, 5.2, z0 + 0.6, 5.2, 0, { back: false });
  for (const [x, name] of [[6.0, 'banner-holiness'], [32.0, 'banner-jesus']]) {
    signboard(W, name, x, 3.6, z0 + 0.16, 1.0, 0, { back: false });
    B.box('metal', x, 5.38, z0 + 0.17, 1.15, 0.04, 0.04, { color: '#d4af37', uv: 'keep' });
  }

  // pulpit with microphone
  {
    const px = cx, pz = -37.4, y = ALTAR.h;
    B.add('wood', new THREE.CylinderGeometry(0.42, 0.34, 1.05, 4, 1), { m: mat(px, y + 0.52, pz, Math.PI / 4, 0, 0, 1.1, 1, 0.75), color: '#5b3518', uv: 'box' });
    B.box('wood', px, y + 1.1, pz - 0.03, 0.82, 0.06, 0.58, { rx: 0.22, color: '#6e4426' });
    B.box('paint', px, y + 0.62, pz + 0.27, 0.06, 0.42, 0.02, { color: '#d4af37', uv: 'keep' });
    B.box('paint', px, y + 0.72, pz + 0.27, 0.28, 0.06, 0.02, { color: '#d4af37', uv: 'keep' });
    B.box('metal', px, y + 1.3, pz + 0.12, 0.012, 0.32, 0.012, { rx: 0.4, color: '#222', uv: 'keep' });
    B.box('props', px, y + 1.13, pz - 0.05, 0.32, 0.03, 0.24, { rx: 0.22, uv: P.white, color: '#1a1a1a' });
    W.collide(px - 0.45, 0, pz - 0.35, px + 0.45, 1.8, pz + 0.35, 'furniture');
  }
  // flowers on pedestals and along the step
  for (const x of [cx - 2.6, cx + 2.6]) flowerStand(W, x, ALTAR.h, -36.9);
  for (const x of [cx - 6, cx + 6]) { B.box('wood', x, 0.15, -35.15, 1.6, 0.3, 0.4, { color: '#5b3518' }); flowerBall(W, x, 0.42, -35.15, 0.45, 0.9); }
  // ministers' chairs
  for (const [i, x] of [12.2, 13.5, 14.8].entries()) {
    const z = -40.6;
    B.box('wood', x, ALTAR.h + 0.45, z, 0.6, 0.08, 0.55, { color: '#5b3518' });
    B.box('fabric', x, ALTAR.h + 0.5, z, 0.54, 0.06, 0.5, { color: '#7d1f2b', uv: 'keep' });
    B.box('wood', x, ALTAR.h + 1.0, z - 0.25, 0.62, 1.1 + (i === 1 ? 0.25 : 0), 0.08, { color: '#5b3518' });
    B.box('fabric', x, ALTAR.h + 1.0, z - 0.2, 0.5, 0.9 + (i === 1 ? 0.25 : 0), 0.03, { color: '#7d1f2b', uv: 'keep' });
    for (const s of [-1, 1]) B.box('wood', x + s * 0.28, ALTAR.h + 0.22, z, 0.06, 0.44, 0.5, { color: '#5b3518' });
    W.seat(x, ALTAR.h + 0.5, z + 0.02, 0, 'chair', 'altar');
  }
  W.collide(11.8, 0, -41, 15.2, 1.8, -40.1, 'furniture');
  // choir chairs on the risers
  for (const [zz, y] of [[-39.4, 0.85], [-41.0, 1.1]]) {
    for (let i = 0; i < 6; i++) {
      const x = 25.1 + i * 0.9;
      W.inst('chair', mat(x, y, zz), '#7d1f2b');
      W.seat(x, y + 0.45, zz + 0.02, 0, 'chair', 'choir');
    }
  }
  // band: keyboard and drum kit
  {
    const kx = 10.6, kz = -38.6, y = ALTAR.h;
    for (const s of [-1, 1]) B.box('metal', kx, y + 0.38, kz + s * 0.12, 1.0, 0.04, 0.04, { rx: s * 0.6, ry: 0.4, color: '#222', uv: 'keep' });
    B.add('props', atlasBox(1.3, 0.1, 0.36, { all: P.black, py: P.keys }), { m: mat(kx, y + 0.84, kz, 0.4) });
    W.inst('chair', mat(kx - 0.25, y, kz + 0.75, 0.4 + Math.PI), '#1a1a1a');
    W.collide(kx - 0.75, 0, kz - 0.4, kx + 0.75, 1.2, kz + 0.4, 'furniture');
    W.interact('keyboard', V(kx - 0.2, y, kz + 0.75), 1.6, 'Play the keyboard', 'play-keyboard');
    const dx = 12.9, dz = -40.4;
    const drum = (x, yy, z, rr, hh, rx = 0) => {
      const g = new THREE.CylinderGeometry(rr, rr, hh, 14, 1);
      const uv = g.attributes.uv; const tv = 15 * 2;
      for (let i = 0; i < uv.count; i++) { const R = i < tv ? P.white : P.drumhead; uv.setXY(i, R.u0 + uv.getX(i) * (R.u1 - R.u0), R.v0 + uv.getY(i) * (R.v1 - R.v0)); }
      const gg = B.add('props', g, { m: mat(x, yy, z, 0, rx, 0) });
      const c = gg.attributes.color; for (let i = 0; i < tv; i++) c.setXYZ(i, 0.45, 0.04, 0.06);
    };
    drum(dx, y + 0.3, dz, 0.28, 0.42, Math.PI / 2);
    drum(dx - 0.45, y + 0.62, dz + 0.3, 0.17, 0.14);
    drum(dx - 0.15, y + 0.75, dz + 0.05, 0.13, 0.14, 0.3);
    drum(dx + 0.18, y + 0.75, dz + 0.05, 0.14, 0.15, 0.3);
    drum(dx + 0.55, y + 0.5, dz + 0.3, 0.2, 0.36);
    for (const [x, yy, z, rr] of [[dx - 0.75, y + 0.9, dz + 0.2, 0.18], [dx - 0.55, y + 1.25, dz - 0.25, 0.24], [dx + 0.7, y + 1.3, dz - 0.15, 0.27]]) {
      B.cyl('metal', x, y, z, 0.012, 0.012, yy - y, 5, { color: '#999' });
      B.cyl('paint', x, yy, z, rr, rr * 0.9, 0.012, 16, { color: '#c9a23a', rx: 0.1 });
    }
    W.collide(dx - 1, 0, dz - 0.5, dx + 1, 1.3, dz + 0.6, 'furniture');
    W.inst('chair', mat(dx, y, dz - 0.6), '#1a1a1a');
  }
  // PA speakers and stage monitors
  for (const [x, ry] of [[6.3, 0.35], [31.7, -0.35]]) { W.inst('speaker', mat(x, 0, -35.0, ry)); W.cylinder(x, -35.0, 0.35, 2.2); }
  for (const x of [cx - 3.5, cx, cx + 3.5]) B.add('props', atlasBox(0.55, 0.3, 0.36, { all: P.black, pz: P.speaker }), { m: mat(x + (x === cx ? 1.2 : 0), ALTAR.h + 0.15, -36.55, 0, -0.5, 0) });
  // projector screens hung from the ceiling, projectors
  for (const [x, ry] of [[6.6, 0.42], [31.4, -0.42]]) {
    B.box('metal', x, 4.05, -37.2, 3.36, 1.98, 0.06, { ry, color: '#111' });
    const sc = new THREE.PlaneGeometry(3.2, 1.8);
    B.add('screen', sc, { m: mat(x + Math.sin(ry) * 0.035, 4.05, -37.2 + Math.cos(ry) * 0.035, ry) });
    for (const s of [-1, 1]) B.box('metal', x + Math.cos(ry) * s * 1.4, 5.5, -37.2 - Math.sin(ry) * s * 1.4, 0.02, 1.0, 0.02, { color: '#222', uv: 'keep' });
  }
  for (const x of [9, 29]) { B.box('paint', x, 5.6, -27.5, 0.4, 0.14, 0.35, { color: '#ececec', uv: 'keep' }); B.box('metal', x, 5.83, -27.5, 0.03, 0.34, 0.03, { color: '#222', uv: 'keep' }); }
  // clock over the main door, AC units on the side walls
  B.add('props', atlasBox(0.5, 0.5, 0.05, { all: P.black, nz: P.clock }), { m: mat(cx, 4.4, z1 - 0.17) });
  for (const [x, z, ry] of [[x0 + 0.24, -30.2, Math.PI / 2], [x0 + 0.24, -37.8, Math.PI / 2], [x1 - 0.24, -30.2, -Math.PI / 2], [x1 - 0.24, -37.8, -Math.PI / 2]]) W.inst('ac', mat(x, 4.8, z, ry));

  // pews: 4 blocks × 8 rows, sitters face the altar (−Z)
  const blocks = [[6.0, 11.4], [12.6, 18.0], [20.0, 25.4], [26.6, 32.0]];
  for (let k = 0; k < 8; k++) {
    const z = -33.8 + k * 1.2;
    for (const [a, bx] of blocks) {
      W.inst('pew', mat((a + bx) / 2, 0, z, Math.PI));
      W.collide(a, 0, z - 0.3, bx, 1.05, z + 0.32, 'furniture');
      for (let i = 0; i < 7; i++) W.seat(a + 0.48 + i * 0.74, 0.47, z - 0.02, Math.PI, 'pew', 'church-hall');
    }
  }
  // ushers' offering table by the door
  B.box('wood', 14.6, 0.76, -21.2, 1.4, 0.05, 0.6, { color: '#6d4c30' });
  B.box('fabric', 14.6, 0.6, -20.92, 1.42, 0.35, 0.02, { color: '#ffffff', uv: 'keep' });
  for (const s of [-1, 1]) B.box('wood', 14.6 + s * 0.6, 0.37, -21.2, 0.06, 0.74, 0.5, { color: '#5b3518' });
  B.box('wood', 14.4, 0.95, -21.2, 0.4, 0.32, 0.32, { color: '#7a4b2a' });
  B.box('paint', 14.4, 1.115, -21.2, 0.2, 0.01, 0.03, { color: '#111', uv: 'keep' });
  W.collide(13.9, 0, -21.5, 15.3, 1.0, -20.9, 'furniture');

  // media desk on its riser
  {
    const { x0: mx0, x1: mx1, z0: mz0, z1: mz1, h: mh } = MEDIA;
    B.boxMM('wood', mx0, 0, mz0, mx1, mh, mz1, { color: '#6b4226' });
    B.boxMM('metal', mx0, mh, mz0, 32.6, mh + 0.9, mz0 + 0.05, { color: '#2b2b2b' });
    W.collide(mx0, 0, mz0 - 0.03, 32.6, mh + 0.9, mz0 + 0.08, 'furniture');
    const dz = mz0 + 0.65, dy = mh + 0.76;
    B.box('wood', 30.6, dy, dz, 4.2, 0.05, 0.8, { color: '#3a2a1e' });
    for (const s of [-1, 1]) B.box('wood', 30.6 + s * 2.0, mh + 0.38, dz, 0.06, 0.76, 0.7, { color: '#2a1e14' });
    W.collide(28.5, 0, dz - 0.4, 32.7, 1.1, dz + 0.4, 'furniture');
    B.add('props', atlasBox(0.9, 0.08, 0.45, { all: P.black, py: P.mixer }), { m: mat(29.6, dy + 0.06, dz, 0, 0.18, 0) });
    B.add('props', atlasBox(0.36, 0.02, 0.25, { all: P.black }), { m: mat(31.0, dy + 0.035, dz + 0.05) });
    B.add('props', atlasBox(0.36, 0.25, 0.015, { all: P.black, nz: P.laptop }), { m: mat(31.0, dy + 0.16, dz - 0.07, 0, 0.25, 0) });
    B.add('props', atlasBox(0.6, 0.38, 0.04, { all: P.black, nz: P.laptop }), { m: mat(32.2, dy + 0.33, dz - 0.1) });
    B.box('metal', 32.2, dy + 0.08, dz - 0.05, 0.05, 0.14, 0.05, { color: '#111', uv: 'keep' });
    for (const x of [29.6, 31.0, 32.2]) {
      W.inst('chair', mat(x, mh, dz + 0.65, Math.PI), '#1a1a1a');
      W.seat(x, mh + 0.45, dz + 0.67, Math.PI, 'chair', 'media');
    }
    // camera on a tripod
    B.box('paint', 28.4, mh + 1.45, mz0 + 0.25, 0.22, 0.18, 0.35, { color: '#151515', uv: 'keep' });
    for (let i = 0; i < 3; i++) { const a = i * 2.09; B.box('metal', 28.4 + Math.cos(a) * 0.2, mh + 0.68, mz0 + 0.25 + Math.sin(a) * 0.2, 0.025, 1.4, 0.025, { ry: -a, rz: 0.15, color: '#333', uv: 'keep' }); }
  }

  // ceiling fans (blades animated) and tube lights
  const fanPos = [];
  for (const z of [-23.5, -29, -34.5, -39]) for (const x of [10.5, 19, 27.5]) fanPos.push([x, z]);
  for (const [x, z] of fanPos) { W.inst('fanHub', mat(x, HALL.ceil - 0.72, z)); W.fans.push(V(x, HALL.ceil - 0.78, z)); }
  for (const z of [-21.8, -26.3, -31.8, -36.8]) for (const x of [6.5, 14.7, 23.3, 31.5]) W.inst('tube', mat(x, HALL.ceil, z, Math.PI / 2));
  for (const x of [8, 13, 25, 30]) W.inst('tube', mat(x, HALL.ceil, -40.6));

  // spawns & interactables
  W.interact('altar-pray', V(cx, 0, -34.9), 2.5, 'Pray at the altar', 'pray');
}

/** Flower arrangement: a dome of small blossoms with leaves spilling out. */
function flowerBall(W, x, y, z, rr, hh = 1) {
  const { b: B } = W;
  const r = rng((x * 100) | 0);
  const cols = ['#ffffff', '#fff3f6', '#ffd23f', '#e63946', '#ff8fab', '#ffffff', '#c1121f'];
  const F = { u0: 0.52, v0: 0.04, u1: 0.98, v1: 0.96 };
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(rr * 1.4, rr * 0.9); rectUV(g, F);
    B.add('foliage', g, { m: mat(x, y + rr * 0.3, z, i * 0.55, 0.9 + r() * 0.3, 0), color: '#ffffff' });
  }
  const n = Math.round(22 * rr / 0.32);
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
    const px = Math.sin(ph) * Math.cos(th), py = Math.cos(ph), pz = Math.sin(ph) * Math.sin(th);
    const s = rr * (0.16 + r() * 0.08);
    B.add('fabric', new THREE.IcosahedronGeometry(1, 0), { m: mat(x + px * rr, y + py * rr * hh * 0.75 + rr * 0.2, z + pz * rr, r() * 3, r() * 3, 0, s, s * 0.8, s), color: cols[(r() * cols.length) | 0], uv: 'keep' });
  }
}

function flowerStand(W, x, y, z) {
  const { b: B } = W;
  B.add('paint', lathe([[0.01, 0], [0.22, 0], [0.13, 0.08], [0.1, 0.72], [0.2, 0.86], [0.24, 0.95], [0.2, 1.0]], 12), { m: mat(x, y, z), color: '#efe9df' });
  flowerBall(W, x, y + 0.95, z, 0.32, 1.2);
  W.collide(x - 0.25, 0, z - 0.25, x + 0.25, 1.8, z + 0.25, 'furniture');
}

function buildPrayerRoom(W) {
  const { b: B, P } = W;
  const { x0, x1, z0, z1, h } = PRAYER;
  const o = { h, t: 0.22, color: WHITE, inner: '#ebe4f2' };
  const win = (a, b) => ({ a, b, y0: 1.1, y1: 2.5, type: 'window', win: 'win-louvre-c', grille: '#1a1a1a' });
  const doorOp = { a: 42.0, b: 43.4, y0: 0, y1: 2.3, type: 'door', leaf: 'door-wood', dynamic: true };
  const leaves = wall(W, 'x', x0, x1, z1, { ...o, out: 1, openings: [win(39.2, 40.8), doorOp, win(45.2, 46.8)] });
  wall(W, 'x', x0, x1, z0, { ...o, out: -1, openings: [win(39.4, 40.8), win(45.2, 46.6)] });
  wall(W, 'z', z0, z1, x0, { ...o, out: -1, openings: [win(-39.2, -37.4)] });
  wall(W, 'z', z0, z1, x1, { ...o, out: 1, openings: [win(-39.2, -37.4)] });
  B.boxMM('plaster', x0 - 0.12, 0, z0 - 0.12, x1 + 0.12, 0.5, z0 - 0.1, { color: BLUE });
  B.boxMM('plaster', x0 - 0.12, 0, z1 + 0.1, x1 + 0.12, 0.5, z1 + 0.12, { color: BLUE });
  B.boxMM('carpet', x0, 0, z0, x1, 0.025, z1, { color: '#2f5e4a' });
  B.boxMM('ceiling', x0, h - 0.2, z0, x1, h - 0.15, z1, { color: '#f7f6f1' });
  hipRoof(W, x0, z0, x1, z1, h, 2.0, { color: '#6f777a', overhang: 0.6 });
  signboard(W, 'prayer', (42.0 + 43.4) / 2, 2.75, z1 + 0.14, 1.5, 0, { back: false });
  // north wall: cross and scripture
  B.box('wood', 43, 2.3, z0 + 0.16, 0.14, 1.5, 0.06, { color: '#4a2a14' });
  B.box('wood', 43, 2.6, z0 + 0.16, 0.8, 0.14, 0.06, { color: '#4a2a14' });
  signboard(W, 'scripture', 43, 3.45, z0 + 0.15, 2.2, 0, { back: false });
  // mats in rows facing north, cushions, Bible table, bench at the back
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    const x = 39.6 + i * 2.25, z = -39.4 + row * 2.0;
    W.inst('mat', mat(x, 0.03, z, ((row * 4 + i) % 3 - 1) * 0.04), ['#8e2c48', '#2a6f97', '#c7972b', '#3f7d4f'][(i + row) % 4]);
  }
  for (const [x, z, c] of [[39.6, -38.5, '#c7972b'], [41.85, -38.4, '#8e2c48'], [44.1, -38.6, '#2a6f97'], [46.35, -38.5, '#c7972b'], [41.85, -36.4, '#3f7d4f'], [46.35, -36.5, '#8e2c48']]) {
    B.add('fabric', new THREE.BoxGeometry(0.45, 0.12, 0.45), { m: mat(x, 0.09, z, 0.2), color: c, uv: 'keep' });
  }
  B.box('wood', 43, 0.25, -40.9, 1.2, 0.05, 0.5, { color: '#5b3518' });
  for (const s of [-1, 1]) B.box('wood', 43 + s * 0.55, 0.12, -40.9, 0.05, 0.24, 0.45, { color: '#5b3518' });
  B.box('paint', 43, 0.3, -40.9, 0.36, 0.05, 0.26, { color: '#1a1a1a', uv: 'keep' });
  B.box('paint', 43, 0.33, -40.9, 0.34, 0.01, 0.24, { color: '#f4f1e6', uv: 'keep' });
  W.inst('bench', mat(40.5, 0, -34.6));
  W.seat(39.7, 0.47, -34.62, Math.PI, 'bench', 'prayer-room'); W.seat(41.2, 0.47, -34.62, Math.PI, 'bench', 'prayer-room');
  W.collide(39.3, 0, -34.8, 41.7, 0.5, -34.4, 'furniture');
  W.inst('fanHub', mat(43, h - 0.85, -38)); W.fans.push(V(43, h - 0.91, -38));
  W.inst('tube', mat(40.2, h - 0.2, -38, Math.PI / 2)); W.inst('tube', mat(45.8, h - 0.2, -38, Math.PI / 2));
  // shoe rack by the door
  B.box('wood', 44.4, 0.3, z1 + 0.45, 0.9, 0.6, 0.35, { color: '#6d4c30' });
  for (let i = 0; i < 4; i++) B.box('paint', 44.1 + (i % 2) * 0.4, 0.37 + Math.floor(i / 2) * 0.25, z1 + 0.45, 0.24, 0.07, 0.1, { color: ['#222', '#7a3b1e', '#c1121f', '#333'][i], uv: 'keep' });
  W.collide(43.9, 0, z1 + 0.25, 44.9, 0.6, z1 + 0.65, 'furniture');
  W.interact('prayer-room', V(43, 0, -38.3), 3.2, 'Kneel and pray', 'pray');
  for (const l of leaves) W.dynamicDoor('prayer-door', l, 'Open / close the prayer room door');
}

function buildCanteen(W, r) {
  const { b: B, P, S } = W;
  const { x0, x1, z0, z1, h } = CANTEEN;
  const o = { h, t: 0.22, color: WHITE, inner: '#f3ead8' };
  const win = (a, b) => ({ a, b, y0: 1.1, y1: 2.4, type: 'window', win: 'win-louvre-a', grille: '#1a1a1a' });
  wall(W, 'x', x0, x1, z1, { ...o, out: 1, openings: [{ a: 40.0, b: 42.0, y0: 0, y1: 2.4, type: 'door', leaf: 'door-steel', double: true }, win(44, 45.6), win(47.2, 48.8)] });
  wall(W, 'x', x0, x1, z0, { ...o, out: -1, openings: [win(41, 42.2), win(46.5, 47.7)] });
  wall(W, 'z', z0, z1, x0, { ...o, out: -1, openings: [win(-25.6, -24)] });
  wall(W, 'z', z0, z1, x1, { ...o, out: 1, openings: [win(-26, -24.4)] });
  B.boxMM('plaster', x0 - 0.12, 0, z1 + 0.1, x1 + 0.12, 0.5, z1 + 0.12, { color: BLUE });
  B.boxMM('tiles', x0, -0.02, z0, x1, 0.02, z1, { color: '#e3dccb' });
  B.boxMM('ceiling', x0, h - 0.2, z0, x1, h - 0.15, z1, { color: '#f7f6f1' });
  gableRoof(W, x0, z0, x1, z1, h, 1.8, 'x', { color: '#7d8588', wallColor: WHITE, overhang: 0.5 });
  signboard(W, 'canteen', 41, 2.75, z1 + 0.14, 1.6, 0, { back: false });
  // counter separating the kitchen
  const cz = -27.2;
  B.boxMM('wood', x0 + 0.2, 0, cz - 0.35, 47.6, 1.0, cz + 0.35, { color: '#7a4b2a' });
  B.boxMM('tiles', x0 + 0.15, 1.0, cz - 0.4, 47.65, 1.05, cz + 0.4, { color: '#e9e2d0' });
  W.collide(x0, 0, cz - 0.4, 47.65, 1.05, cz + 0.4, 'counter');
  for (let i = 0; i < 4; i++) W.inst('pot', mat(41 + i * 1.5, 1.05, cz, r()));
  B.box('glass', 46.5, 1.25, cz, 1.4, 0.4, 0.5, { color: '#a3b5ba', uv: 'keep' });
  // kitchen: stove, gas cylinders, freezer, shelves, sink
  B.boxMM('metal', 39, 0, z0 + 0.25, 42, 0.85, z0 + 0.95, { color: '#c9c9c4' });
  for (let i = 0; i < 3; i++) W.inst('potBig', mat(39.6 + i * 1.0, 0.85, z0 + 0.6, r()));
  for (const x of [42.4, 42.9]) B.cyl('paint', x, 0, z0 + 0.5, 0.17, 0.17, 0.65, 12, { color: '#2e6bd1' });
  B.boxMM('paint', 44, 0, z0 + 0.25, 45.6, 0.9, z0 + 1.0, { color: '#f4f4f0', uv: 'keep' });
  B.boxMM('metal', 46.2, 0, z0 + 0.25, 48, 0.9, z0 + 0.85, { color: '#b9bdbf' });
  B.boxMM('wood', 48.4, 0, z0 + 0.2, 49.7, 2.0, z0 + 0.6, { color: '#6d4c30' });
  W.collide(x0, 0, z0, x1, 1.0, z0 + 1.0, 'counter');
  signboard(W, 'menu', 44.8, 2.6, z0 + 0.13, 1.1, 0, { back: false });
  // dining tables with plastic chairs
  for (const [tx, tz] of [[40.3, -23.8], [44, -23.6], [47.6, -23.8]]) {
    W.inst('tablePlastic', mat(tx, 0, tz), '#f2f2ee');
    W.collide(tx - 0.5, 0, tz - 0.4, tx + 0.5, 0.8, tz + 0.4, 'furniture');
    for (const [dx, dz, ry] of [[0, -0.7, 0], [0, 0.7, Math.PI], [-0.8, 0, Math.PI / 2], [0.8, 0, -Math.PI / 2]]) {
      W.inst('chair', mat(tx + dx, 0, tz + dz, ry), '#e23b3b');
      W.seat(tx + dx, 0.45, tz + dz, ry, 'chair', 'kitchen');
    }
    W.inst('plate', mat(tx - 0.15, 0.76, tz + 0.1));
  }
  W.inst('fanHub', mat(44, h - 0.85, -24)); W.fans.push(V(44, h - 0.91, -24));
  W.inst('tube', mat(41, h - 0.2, -25.5, Math.PI / 2)); W.inst('tube', mat(47, h - 0.2, -25.5, Math.PI / 2));
  W.interact('canteen', V(44, 0, cz + 0.85), 2.2, 'Buy food at the canteen', 'buy-food');
}

function buildKids(W) {
  const { b: B } = W;
  const { x0, x1, z0, z1 } = KIDS;
  const ya = 2.55, yb = 3.6, zm = (z0 + z1) / 2;
  for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, z1]) { B.box('metal', x, ya / 2, z, 0.07, ya, 0.07, { color: '#d9d9d2', uv: 'keep' }); W.cylinder(x, z, 0.08, ya); }
  // striped canopy (alternating white / blue panels along X)
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = x0 - 0.2 + (x1 - x0 + 0.4) * i / n, bx = x0 - 0.2 + (x1 - x0 + 0.4) * (i + 1) / n;
    const c = i % 2 ? '#2f6fd1' : '#f4f4ef';
    B.add('fabric', quad4(V(a, ya - 0.05, z0 - 0.3), V(bx, ya - 0.05, z0 - 0.3), V(bx, yb, zm), V(a, yb, zm)), { color: c });
    B.add('fabric', quad4(V(bx, ya - 0.05, z1 + 0.3), V(a, ya - 0.05, z1 + 0.3), V(a, yb, zm), V(bx, yb, zm)), { color: c });
    for (const z of [z0 - 0.3, z1 + 0.3]) B.box('fabric', (a + bx) / 2, ya - 0.17, z, bx - a, 0.25, 0.01, { color: c, uv: 'keep' });
  }
  B.boxMM('concrete', x0 - 0.3, 0.0, z0 - 0.3, x1 + 0.3, 0.03, z1 + 0.3, { color: '#c8c2b5' });
  signboard(W, 'children', (x0 + x1) / 2, ya - 0.1, z1 + 0.33, 2.6, 0, { back: false });
  // whiteboard on an easel at the east end, kids' chairs facing it
  B.box('metal', x1 - 0.6, 0.85, zm, 0.06, 1.7, 1.2, { color: '#888', uv: 'keep' });
  signboard(W, 'whiteboard', x1 - 0.66, 1.35, zm, 1.6, -Math.PI / 2, { back: false });
  W.collide(x1 - 0.8, 0, zm - 0.8, x1 - 0.4, 1.8, zm + 0.8, 'furniture');
  const cols = ['#f94144', '#f9c74f', '#43aa8b', '#577590', '#f3722c', '#90be6d'];
  let k = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    const x = x0 + 1.5 + i * 1.6, z = z0 + 1.0 + j * 1.0;
    W.inst('kidsChair', mat(x, 0.05, z, Math.PI / 2), cols[k++ % cols.length]);
  }
  W.inst('chair', mat(x1 - 1.4, 0.05, zm - 1.6, -Math.PI / 2), '#f2f2ee');
  W.seat(x1 - 1.4, 0.5, zm - 1.6, -Math.PI / 2, 'chair', 'children');
}
