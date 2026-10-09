// Market row on the south side: pure-water seller, umbrella stalls with produce, a POS/recharge
// kiosk and Mama Nkechi's buka with benches, pots and a generator.
import * as THREE from 'three';
import { mat, rectUV } from './geo.js';
import { signboard, shedRoof } from './buildings.js';
import { lathe } from './props.js';
import { BUKA } from './layout.js';
import { rng } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Heap of produce on a tray: a low mound textured with goods. */
function heap(W, x, y, z, w, d, goods, ry = 0) {
  const { b: B, P } = W;
  const g = new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  rectUV(g, P[goods]);
  B.add('props', g, { m: mat(x, y, z, ry, 0, 0, w, 0.35, d) });
  B.add('props', new THREE.CylinderGeometry(w * 0.5, w * 0.45, 0.06, 12), { m: mat(x, y - 0.01, z, 0, 0, 0, 1, 1, d / w), uv: P.black, color: '#8b6b3e' });
}

export function buildMarket(W) {
  const { b: B, P, S } = W;
  const r = rng(7);

  // --- pure water seller by the bus stop
  {
    const x = -44.2, z = 9.8;
    W.inst('tablePlastic', mat(x, 0, z), '#2b6cb0');
    const top = new THREE.PlaneGeometry(1.0, 0.7); rectUV(top, P.sachet);
    B.add('props', top, { m: mat(x, 0.77, z, 0, -Math.PI / 2) });
    for (let i = 0; i < 6; i++) B.box('props', x - 1.1 + (i % 2) * 0.42, 0.18 + Math.floor(i / 2) * 0.32, z + 0.2, 0.4, 0.3, 0.3, { uv: P.sachet, color: '#ffffff' });
    B.box('plastic', x + 0.9, 0.3, z - 0.1, 0.6, 0.6, 0.45, { color: '#1d6fc4', uv: 'keep' });
    B.box('plastic', x + 0.9, 0.62, z - 0.1, 0.64, 0.06, 0.48, { color: '#f2f2f2', uv: 'keep' });
    W.inst('umbrellaBW', mat(x, 0, z + 0.3));
    W.cylinder(x, z + 0.3, 0.3, 2.4);
    W.collide(x - 0.6, 0, z - 0.4, x + 1.25, 0.8, z + 0.4, 'stall');
    W.collide(x - 1.35, 0, z + 0.03, x - 0.45, 1.0, z + 0.38, 'stall');
    signboard(W, 'water', x - 0.2, 1.25, z - 0.62, 1.0, 0, { posts: true, collide: false });
    W.inst('chair', mat(x + 0.1, 0, z + 0.9, Math.PI), '#e23b3b');
    W.seat(x + 0.1, 0.45, z + 0.9, Math.PI, 'chair', 'market');
    W.interact('buy-water', V(x, 0, z - 0.9), 1.8, 'Buy pure water (N20)', 'buy-food');
  }

  // --- produce stalls with umbrellas
  const goodsSets = [['tomato', 'pepper', 'onion'], ['yam', 'onion', 'tomato'], ['pepper', 'tomato', 'pepper'], ['onion', 'yam', 'tomato'], ['tomato', 'onion', 'pepper']];
  const umbs = ['umbrellaRY', 'umbrellaGW', 'umbrellaBW', 'umbrellaRY', 'umbrellaGW'];
  const xs = [-39.5, -34.5, -29.2, -24, -19];
  xs.forEach((x, i) => {
    const z = 10.6;
    // wooden table with a cloth
    B.box('wood', x, 0.8, z, 2.0, 0.05, 0.95, { color: '#8a6a44' });
    for (const s of [-1, 1]) for (const t of [-1, 1]) B.box('wood', x + s * 0.92, 0.39, z + t * 0.4, 0.06, 0.78, 0.06, { color: '#6d5236' });
    B.box('fabric', x, 0.7, z - 0.48, 2.02, 0.22, 0.01, { color: ['#1f6f8b', '#c1121f', '#f4a261', '#2a9d8f', '#6a4c93'][i], uv: 'keep' });
    goodsSets[i].forEach((gd, k) => heap(W, x - 0.62 + k * 0.62, 0.85, z, 0.5, 0.5, gd, r()));
    W.collide(x - 1.0, 0, z - 0.48, x + 1.0, 0.85, z + 0.48, 'stall');
    W.inst(umbs[i], mat(x, 0, z + 0.2, r()));
    W.cylinder(x, z + 0.2, 0.06, 2.4);
    // seller's stool and spare basket
    W.inst('chair', mat(x + 0.4, 0, z + 1.0, Math.PI + (r() - 0.5) * 0.5), ['#e23b3b', '#f2f2ef', '#2f6fd1'][i % 3]);
    W.seat(x + 0.4, 0.45, z + 1.0, Math.PI, 'chair', 'market');
    B.add('wood', lathe([[0.01, 0], [0.22, 0], [0.3, 0.28], [0.32, 0.3]], 10), { m: mat(x - 0.6, 0, z + 0.9), color: '#b58a52' });
    heap(W, x - 0.6, 0.28, z + 0.9, 0.5, 0.5, goodsSets[i][1]);
  });
  // second row: rice, provisions, jerrycans
  {
    const x = -32, z = 16;
    B.box('wood', x, 0.8, z, 3.0, 0.05, 1.0, { color: '#7a5a3a' });
    for (const s of [-1, 1]) for (const t of [-1, 1]) B.box('wood', x + s * 1.42, 0.39, z + t * 0.44, 0.06, 0.78, 0.06, { color: '#5d4430' });
    const sn = new THREE.PlaneGeometry(2.8, 0.9); rectUV(sn, P.snacks);
    B.add('props', sn, { m: mat(x, 0.84, z, 0, -Math.PI / 2) });
    for (let i = 0; i < 5; i++) B.box('props', x - 2.4 + (i % 3) * 0.55, 0.25 + Math.floor(i / 3) * 0.48, z + 0.1, 0.5, 0.48, 0.3, { uv: P.ricebag, color: '#ffffff' });
    W.collide(x - 2.7, 0, z - 0.5, x + 1.5, 0.9, z + 0.5, 'stall');
    W.inst('umbrellaGW', mat(x, 0, z + 0.4));
    for (let i = 0; i < 7; i++) W.inst('jerrycan', mat(-26 + (i % 4) * 0.34, 0, 15.6 + Math.floor(i / 4) * 0.25, r() * 0.3), ['#f2c200', '#f2c200', '#2a7fd1', '#f2c200'][i % 4]);
    W.collide(-26.2, 0, 15.4, -24.8, 0.5, 16.1, 'stall');
  }
  // wooden shack stall with zinc shed roof
  {
    const x0 = -44, x1 = -40.5, z0 = 15, z1 = 18;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { B.box('wood', x, 1.25, z, 0.1, 2.5, 0.1, { color: '#5a4430' }); W.cylinder(x, z, 0.08, 2.5); }
    shedRoof(W, x0 - 0.3, z0 - 0.4, x1 + 0.3, z1 + 0.3, 2.6, 2.3, { color: '#8f8a80', dir: 1 });
    B.box('wood', (x0 + x1) / 2, 0.5, z1, x1 - x0, 1.0, 0.04, { color: '#7a5a3a' });
    B.box('wood', (x0 + x1) / 2, 0.85, z0 + 0.3, x1 - x0 - 0.2, 0.05, 0.6, { color: '#7a5a3a' });
    heap(W, x0 + 0.8, 0.9, z0 + 0.3, 0.5, 0.45, 'pepper');
    heap(W, x0 + 1.7, 0.9, z0 + 0.3, 0.5, 0.45, 'tomato');
    heap(W, x0 + 2.6, 0.9, z0 + 0.3, 0.5, 0.45, 'onion');
    W.collide(x0, 0, z0, x1, 1.0, z0 + 0.6, 'stall');
    W.collide(x0, 0, z1 - 0.05, x1, 1.0, z1 + 0.05, 'stall');
  }

  // --- POS / recharge card kiosk (painted container)
  {
    const x0 = -16.6, x1 = -12.6, z0 = 9.4, z1 = 11.8;
    B.boxMM('metal', x0, 0.05, z0, x1, 2.5, z1, { color: '#1a7a43' });
    B.boxMM('metal', x0 - 0.05, 2.5, z0 - 0.05, x1 + 0.05, 2.6, z1 + 0.05, { color: '#145c33' });
    const win = new THREE.PlaneGeometry(2.6, 1.0); rectUV(win, P['shop-int']);
    B.add('props', win, { m: mat((x0 + x1) / 2, 1.45, z0 - 0.012, Math.PI) });
    B.box('wood', (x0 + x1) / 2, 0.95, z0 - 0.2, 2.8, 0.05, 0.4, { color: '#8a6a44' });
    B.add('grille', new THREE.PlaneGeometry(2.6, 1.0), { m: mat((x0 + x1) / 2, 1.45, z0 - 0.03, Math.PI), color: '#d9d9d2' });
    signboard(W, 'pos', (x0 + x1) / 2, 3.05, z0 + 0.1, 3.4, Math.PI, { back: true });
    W.collide(x0, 0, z0 - 0.4, x1, 2.6, z1, 'kiosk');
    B.box('props', x0 + 0.6, 1.02, z0 - 0.25, 0.3, 0.05, 0.2, { uv: P.laptop, color: '#ffffff' });
    W.inst('chair', mat(x1 + 0.7, 0, z0 - 0.2, -Math.PI / 2 - 0.3), '#2f6fd1');
    W.seat(x1 + 0.7, 0.45, z0 - 0.2, -Math.PI / 2, 'chair', 'market');
    W.inst('umbrellaRY', mat(x1 + 1.0, 0, z0 - 0.4));
    W.interact('pos-kiosk', V((x0 + x1) / 2, 0, z0 - 0.9), 1.8, 'Recharge card / POS', 'buy-food');
  }

  // --- Mama Nkechi Buka
  {
    const { x0, x1, z0, z1 } = BUKA;
    B.boxMM('concrete', x0, 0, z0, x1, 0.06, z1, { color: '#a9a397' });
    const posts = [];
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) { posts.push([x, z0]); posts.push([x, z1]); }
    for (const [x, z] of posts) { B.box('wood', x, 1.4, z, 0.12, 2.8, 0.12, { color: '#5b4330' }); W.cylinder(x, z, 0.08, 2.8); }
    shedRoof(W, x0 - 0.5, z0 - 0.6, x1 + 0.5, z1 + 0.4, 3.0, 2.7, { color: '#7d7f7a', dir: 1 });
    // plank half walls on the back and sides
    B.boxMM('wood', x0, 0, z1 - 0.04, x1, 1.1, z1 + 0.04, { color: '#7a5a3a' });
    B.boxMM('wood', x0 - 0.04, 0, z0 + 1.6, x0 + 0.04, 1.1, z1, { color: '#7a5a3a' });
    B.boxMM('wood', x1 - 0.04, 0, z0 + 1.6, x1 + 0.04, 1.1, z1, { color: '#7a5a3a' });
    W.collide(x0, 0, z1 - 0.05, x1, 1.1, z1 + 0.05, 'wall');
    W.collide(x0 - 0.05, 0, z0 + 1.6, x0 + 0.05, 1.1, z1, 'wall');
    W.collide(x1 - 0.05, 0, z0 + 1.6, x1 + 0.05, 1.1, z1, 'wall');
    signboard(W, 'buka', (x0 + x1) / 2, 3.35, z0 - 0.62, 5.2, Math.PI, { back: true });
    // serving counter with pots and a food warmer
    const cz = z0 + 0.7;
    B.boxMM('wood', x0 + 1.5, 0, cz - 0.35, x0 + 5.5, 0.9, cz + 0.35, { color: '#6d4c30' });
    W.collide(x0 + 1.5, 0, cz - 0.35, x0 + 5.5, 0.9, cz + 0.35, 'counter');
    for (let i = 0; i < 3; i++) W.inst('pot', mat(x0 + 2.0 + i * 0.75, 0.9, cz, r()));
    B.boxMM('glass', x0 + 4.1, 0.9, cz - 0.25, x0 + 5.4, 1.35, cz + 0.25, { color: '#93a7ad', uv: 'keep' });
    B.box('props', x0 + 4.75, 0.95, cz, 1.2, 0.04, 0.4, { uv: P.tomato, color: '#ffffff' });
    // cooking corner: firewood stove + big pot + gas cylinder
    B.cyl('metal', x0 + 0.8, 0, z1 - 0.8, 0.35, 0.35, 0.3, 10, { color: '#2a2a2a' });
    W.inst('potBig', mat(x0 + 0.8, 0.3, z1 - 0.8));
    B.cyl('paint', x0 + 1.6, 0, z1 - 0.5, 0.16, 0.16, 0.6, 10, { color: '#2e6bd1' });
    W.collide(x0 + 0.4, 0, z1 - 1.2, x0 + 1.9, 0.9, z1 - 0.3, 'counter');
    // tables and benches
    for (const tz of [z0 + 2.4, z0 + 4.4]) {
      const tx = x0 + 6.5;
      B.box('wood', tx, 0.76, tz, 3.0, 0.05, 0.8, { color: '#8a6a44' });
      B.box('fabric', tx, 0.79, tz, 3.0, 0.01, 0.8, { color: '#d9e8f0', uv: 'keep' });
      for (const s of [-1, 1]) B.box('wood', tx + s * 1.4, 0.38, tz, 0.08, 0.76, 0.6, { color: '#5b4330' });
      W.collide(tx - 1.5, 0, tz - 0.4, tx + 1.5, 0.8, tz + 0.4, 'furniture');
      for (const side of [-1, 1]) {
        const bz = tz + side * 0.72;
        W.inst('bench3', mat(tx, 0, bz));
        for (let k = 0; k < 3; k++) W.seat(tx - 1.0 + k * 1.0, 0.47, bz + side * 0.02, side > 0 ? Math.PI : 0, 'bench', 'market');
      }
      W.inst('plate', mat(tx - 0.6, 0.79, tz - 0.15));
      W.inst('plate', mat(tx + 0.7, 0.79, tz + 0.12));
    }
    // generator outside with its fumes corner
    W.inst('generator', mat(x1 + 0.8, 0, z1 + 1.2, Math.PI));
    W.collide(x1 + 0.5, 0, z1 + 0.85, x1 + 1.1, 0.7, z1 + 1.55, 'prop');
    W.inst('jerrycan', mat(x1 + 1.6, 0, z1 + 1.1, 0.4), '#f2c200');
    W.interact('buka', V(x0 + 3.5, 0, z0 - 0.2), 2.2, "Buy food at Mama Nkechi's", 'buy-food');
  }

  // scattered plastic chairs / jerrycans around the market
  for (let i = 0; i < 4; i++) W.inst('chair', mat(-37 + i * 4.2, 0, 13.3 + r() * 1.5, r() * 6), ['#e23b3b', '#f2f2ef', '#2f6fd1', '#f2f2ef'][i]);
}
