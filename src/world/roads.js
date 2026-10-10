// The roads you see yourself on when you travel (src/world/journey.js): Herbert Macaulay Way in
// Yaba (the playable street), and four more stretches of Lagos built far away in world space
// the first time you use them: Third Mainland Bridge over the lagoon (Makoko on stilts below),
// Ikorodu Road with its BRT lane and pedestrian bridge, the Lekki–Epe Expressway with the toll
// plaza and palm-lined estates, and the market under the Ojuelegba bridge. Church posters on
// the billboards everywhere — this is a Christian city.
import * as THREE from 'three';
import { mat } from './geo.js';
import { block, signboard } from './buildings.js';
import { POLE_ARM_Y } from './props.js';
import { rng } from './noise.js';
import { drawPoster, defaultPosters } from '../map/posters.js';

/**
 * Route stretches. `origin` is where local (0, 0) sits in the world; the journey runs along +X
 * from x = −38. `lane` is the z of your vehicle, `walk` the z you trek on; `traffic` lists the
 * other lanes ({z, dir}) for passing cars, danfos, kekes and okadas.
 */
export const ROUTES = {
  herbert: { label: 'Herbert Macaulay Way, Yaba', origin: [0, 0], lane: 2, walk: 6.5, traffic: [] },
  thirdmainland: { label: 'Third Mainland Bridge', origin: [-1500, 0], lane: 2, walk: 8.2, traffic: [{ z: 4.6, dir: 1 }, { z: -2.2, dir: -1 }, { z: -4.8, dir: -1 }] },
  ikorodu: { label: 'Ikorodu Road', origin: [-1500, 400], lane: 2.2, walk: 9.6, traffic: [{ z: 5.2, dir: 1 }, { z: -2.4, dir: -1 }, { z: -6.2, dir: -1, brt: true }] },
  lekki: { label: 'Lekki–Epe Expressway', origin: [-1500, 800], lane: 2.2, walk: 11, traffic: [{ z: 5.4, dir: 1 }, { z: -3.6, dir: -1 }, { z: -6.6, dir: -1 }] },
  ojuelegba: { label: 'Under the Ojuelegba bridge', origin: [-1500, 1200], lane: 2, walk: 7.6, traffic: [{ z: 4.4, dir: 1 }, { z: -2.2, dir: -1 }] },
};

const X0 = -95, X1 = 115; // extent of each stretch along the road

/** Build one route stretch (not Herbert Macaulay Way, which is the Yaba street). */
export function buildRoute(W, id) {
  const R = ROUTES[id];
  if (!R || id === 'herbert') return;
  const [ox, oz] = R.origin;
  // Builders work in local coordinates: wrap the batch so every piece lands at the origin.
  const L = local(W, ox, oz);
  ({ thirdmainland, ikorodu, lekki, ojuelegba })[id](L, R);
}

/* ---------------------------------------------------------------- local-coordinate builder */
export function local(W, ox, oz) {
  const B = W.b;
  const off = new THREE.Matrix4().makeTranslation(ox, 0, oz);
  const b = {
    add: (key, geo, o = {}) => B.add(key, geo, { ...o, m: o.m ? off.clone().multiply(o.m) : off }),
    box: (key, x, y, z, sx, sy, sz, o = {}) => B.box(key, x + ox, y, z + oz, sx, sy, sz, o),
    boxMM: (key, x0, y0, z0, x1, y1, z1, o = {}) => B.boxMM(key, x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, o),
    cyl: (key, x, y, z, rt, rb, h, seg, o = {}) => B.cyl(key, x + ox, y, z + oz, rt, rb, h, seg, o),
    quad: (key, x, y, z, w, h, o = {}) => B.quad(key, x + ox, y, z + oz, w, h, o),
  };
  return {
    ...W, b,
    ox, oz,
    inst: (name, mm, color) => W.inst(name, new THREE.Matrix4().makeTranslation(ox, 0, oz).multiply(mm), color),
    collide: (x0, y0, z0, x1, y1, z1, kind) => W.collide(x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, kind),
    cylinder: (x, z, r, h, kind) => W.cylinder(x + ox, z + oz, r, h, kind),
    line: (a, c) => W.lines.push(new THREE.Vector3(a.x + ox, a.y, a.z + oz), new THREE.Vector3(c.x + ox, c.y, c.z + oz)),
    /** A canvas-painted sign or poster (own material), facing −Z (towards the road's north side) unless ry says otherwise. */
    canvas(draw, cw, ch, x, y, z, w, h, ry = Math.PI, o = {}) {
      W.extras.push(() => {
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        draw(c.getContext('2d'), cw, ch);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: o.glow ?? 0.1 }));
        mesh.position.set(x + ox, y, z + oz);
        mesh.rotation.y = ry;
        return { object: mesh };
      });
    },
  };
}

/* ---------------------------------------------------------------- shared pieces */
/** Asphalt with lane dashes between z0 and z1, and dashes at `dashes`. */
function carriageway(L, z0, z1, dashes = [], color = '#ffffff') {
  const { b } = L;
  b.boxMM('asphalt', X0, -0.02, z0, X1, 0.012, z1, { color });
  for (const dz of dashes) for (let x = X0 + 2; x < X1; x += 9) b.boxMM('concrete', x, 0.012, dz - 0.07, x + 3, 0.02, dz + 0.07, { color: '#eeeae0' });
}
/** Yellow-and-black kerb along z (Lagos style). */
function kerb(L, z, h = 0.18) {
  for (let x = X0; x < X1; x += 2) L.b.boxMM('concrete', x, 0, z - 0.12, x + 1, h, z + 0.12, { color: Math.round((x - X0) / 2) % 2 ? '#1c1c1c' : '#f2c230' });
}
/** Street light on a pole facing the road. */
function streetLight(L, x, z, face = -1, H = 9) {
  const { b } = L;
  b.cyl('metal', x, 0, z, 0.09, 0.14, H, 8, { color: '#6b7178' });
  b.box('metal', x, H - 0.05, z + face * 0.9, 0.08, 0.08, 1.8, { color: '#6b7178', uv: 'keep' });
  b.box('lamp', x, H - 0.16, z + face * 1.75, 0.5, 0.1, 0.24, { color: '#fff3c4' });
  L.cylinder(x, z, 0.15, H);
}
/** A church poster billboard on two legs (faces the road: −Z). */
function billboard(L, x, z, poster, W = 9, H = 4, Y = 7) {
  const { b } = L;
  for (const s of [-1, 1]) b.cyl('metal', x + s * (W / 2 - 0.8), 0, z + 0.3, 0.16, 0.2, Y - H / 2, 8, { color: '#3a3f45' });
  b.box('metal', x, Y, z + 0.25, W + 0.3, H + 0.3, 0.25, { color: '#2a2d31', uv: 'keep' });
  b.box('metal', x, Y - H / 2 - 0.35, z - 0.35, W, 0.08, 0.9, { color: '#3a3f45', uv: 'keep' }); // catwalk
  L.canvas((g, w, h) => drawPoster(g, 0, 0, w, h, poster), 512, 228, x, Y, z + 0.1, W, H, Math.PI, { glow: 0.14 });
}
/** Green road sign (white letters), e.g. on a gantry. */
function roadSign(L, lines, x, y, z, w, h, ry = Math.PI, bg = '#0f6b3a') {
  L.canvas((g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, cw - 16, ch - 16);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((t, i) => {
      const big = i === 0;
      g.font = `800 ${big ? Math.round(ch * 0.34 / Math.max(1, n * 0.7)) : Math.round(ch * 0.16)}px Inter, Arial, sans-serif`;
      g.fillText(t, cw / 2, ch * ((i + 0.5) / n) + (big ? 2 : 0), cw - 40);
    });
  }, 512, Math.round(512 * h / w), x, y, z, w, h, ry);
}
/** Overhead gantry with a sign across the road (z0..z1). */
function gantry(L, x, z0, z1, lines) {
  const { b } = L;
  for (const z of [z0, z1]) { b.cyl('metal', x, 0, z, 0.18, 0.22, 7.2, 8, { color: '#7d848c' }); L.cylinder(x, z, 0.22, 7.2); }
  b.boxMM('metal', x - 0.15, 6.9, z0, x + 0.15, 7.2, z1, { color: '#7d848c', uv: 'keep' });
  roadSign(L, lines, x - 0.25, 6.2, (z0 + z1) / 2, Math.min(9, z1 - z0 - 2), 2.2, -Math.PI / 2);
}
const POSTERS = defaultPosters(14, 5);

/* ================================================================ Third Mainland Bridge */
function thirdmainland(L, R) {
  const { b } = L;
  const r = rng(71);
  // the lagoon, to the horizon
  b.boxMM('water', -260, -7, -260, 280, -6, 260, { color: '#3f7f95', uv: 'keep' });
  // deck: concrete slab, six lanes, a median barrier, footway on the south edge
  b.boxMM('concrete', X0, -1.0, -9.6, X1, -0.02, 9.6, { color: '#a19e96' });
  carriageway(L, -7.4, 7.4, [-2.5 - 1.2, 2.5 + 1.2, -1.2, 1.2].filter((z) => Math.abs(z) > 2), '#e8e8e8');
  for (const dz of [3.4, -3.4]) for (let x = X0 + 2; x < X1; x += 9) b.boxMM('concrete', x, 0.012, dz - 0.07, x + 3, 0.02, dz + 0.07, { color: '#eeeae0' });
  b.boxMM('concrete', X0, 0, -0.3, X1, 0.6, 0.3, { color: '#c9c5bb' }); // New Jersey barrier
  b.boxMM('concrete', X0, 0, 7.4, X1, 0.16, 9.2, { color: '#b9b5ab' }); // footway
  kerb(L, 7.4);
  // parapets with rails
  for (const z of [-9.4, 9.4]) {
    b.boxMM('concrete', X0, 0, z - 0.2, X1, 0.75, z + 0.2, { color: '#d4d0c6' });
    b.boxMM('metal', X0, 1.05, z - 0.05, X1, 1.12, z + 0.05, { color: '#56708a', uv: 'keep' });
    for (let x = X0; x < X1; x += 2.5) b.box('metal', x, 0.9, z, 0.06, 0.35, 0.06, { color: '#56708a', uv: 'keep' });
    L.collide(X0, 0, z - 0.2, X1, 1.2, z + 0.2, 'wall');
  }
  // piers down into the water, and the lights
  for (let x = X0 + 10; x < X1; x += 30) {
    for (const z of [-5.5, 5.5]) b.cyl('concrete', x, -6.5, z, 0.9, 1.0, 5.6, 12, { color: '#9b978e' });
    b.boxMM('concrete', x - 1.2, -1.6, -8.5, x + 1.2, -1.0, 8.5, { color: '#9b978e' });
  }
  for (let x = X0 + 6; x < X1; x += 24) { streetLight(L, x, -9.1, 1, 10); streetLight(L, x + 12, 9.1, -1, 10); }
  gantry(L, 30, -9.2, 9.2, ['THIRD MAINLAND BRIDGE', 'Lagos Island · Ikoyi · V.I. →']);
  // Makoko on stilts, the canoes and the fishermen's nets out on the water
  for (let i = 0; i < 46; i++) {
    const x = -80 + r() * 190, z = 26 + r() * 60;
    const w = 2.4 + r() * 2.2, d = 2.2 + r() * 1.8, y = -4.2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl('wood', x + sx * w * 0.4, -6.5, z + sz * d * 0.4, 0.07, 0.08, 2.4, 5, { color: '#4f3b28' });
    b.boxMM('wood', x - w / 2, y, z - d / 2, x + w / 2, y + 2.1, z + d / 2, { color: ['#6b4f35', '#7a5c3e', '#8a6a48', '#5e4630'][i % 4] });
    b.box('roof', x, y + 2.35, z, w + 0.5, 0.08, d + 0.6, { color: r() < 0.7 ? '#8d6e57' : '#9aa3a8', rz: (r() - 0.5) * 0.2 });
    if (r() < 0.4) b.box('fabric', x + w / 2 + 0.2, y + 1.2, z, 0.04, 0.9, 1.2, { color: ['#e11d48', '#2563eb', '#f59e0b', '#16a34a'][i % 4] }); // washing
  }
  // a small wooden church on stilts, with its cross
  b.boxMM('wood', 52, -4.2, 32, 60, -1.4, 37, { color: '#f1e3c8' });
  b.box('roof', 56, -1.0, 34.5, 9, 0.1, 6.2, { color: '#1e3a8a' });
  b.box('paint', 56, 0.3, 32.1, 0.18, 1.8, 0.18, { color: '#ffffff' });
  b.box('paint', 56, 0.7, 32.1, 1.0, 0.18, 0.18, { color: '#ffffff' });
  for (let i = 0; i < 12; i++) {
    const x = -70 + r() * 170, z = 13 + r() * 70;
    b.box('wood', x, -5.92, z, 4.2, 0.2, 0.7, { color: '#3f2d1d', ry: r() * 0.6 - 0.3 });
  }
  // the Island skyline across the water
  for (let i = 0; i < 16; i++) {
    const x = -40 + i * 11 + r() * 5, z = 95 + r() * 20, h = 14 + r() * 40;
    b.boxMM(r() < 0.5 ? 'glass' : 'plaster', x, -6, z, x + 6 + r() * 4, h, z + 6, { color: r() < 0.5 ? '#8fb2c9' : '#d8d2c4' });
  }
  for (let i = 0; i < 4; i++) billboard(L, -60 + i * 50, 11.5, POSTERS[i]);
}

/* ================================================================ Ikorodu Road */
function ikorodu(L, R) {
  const { b } = L;
  const r = rng(73);
  b.boxMM('ground', X0, -0.05, -40, X1, 0, 40, { color: '#c98a5a' });
  carriageway(L, 0.6, 8.2, [4.3]);
  carriageway(L, -8.2, -0.6, [-4.3]);
  b.boxMM('asphalt', X0, 0.014, -8.2, X1, 0.018, -4.3, { color: '#c46a5a' }); // the red BRT lane
  for (let x = X0 + 4; x < X1; x += 18) b.boxMM('concrete', x, 0.018, -6.6, x + 2.6, 0.024, -5.8, { color: '#f4f1ea' }); // "BRT ONLY" bars
  b.boxMM('concrete', X0, 0, -0.6, X1, 0.5, 0.6, { color: '#cfcab9' }); // median
  b.boxMM('pavers', X0, 0, 8.2, X1, 0.16, 11.6, { color: '#c4bba9' });
  kerb(L, 8.2);
  b.boxMM('pavers', X0, 0, -11.6, X1, 0.16, -8.2, { color: '#c4bba9' });
  kerb(L, -8.2);
  for (let x = X0 + 6; x < X1; x += 26) { streetLight(L, x, 11.2, -1, 9); streetLight(L, x + 13, -11.2, 1, 9); }
  // shops and offices on the south side, facing the road
  const signs = ['buka', 'pos', 'chemist', 'minimart', 'barber', 'tailor', 'water'];
  let x = X0 + 2, i = 0;
  while (x < X1 - 8) {
    const w = 9 + r() * 8, floors = 1 + Math.floor(r() * 3);
    block(L, { x0: x, z0: 13.5, x1: x + w, z1: 22, floors, color: ['#f1e6d0', '#e7d4b5', '#dbe7e4', '#f3d9c7', '#e9e4f2'][i % 5], seed: 300 + i, roof: 'flat', shops: [{ face: 'n', a: x + 1, b: x + w - 1 }] });
    signboard(L, signs[i % signs.length], x + w / 2, 3.1, 13.35, Math.min(5, w - 1.5), Math.PI);
    x += w + 1.5 + r() * 2; i++;
  }
  for (let k = 0; k < 9; k++) L.inst(['palm0', 'palm1', 'mango'][k % 3], mat(X0 + 10 + k * 23, 0, 12.4, k));
  // the pedestrian bridge across the road
  const F = { x: 24, top: 5.6 };
  b.boxMM('metal', F.x - 1.2, F.top, -11, F.x + 1.2, F.top + 0.25, 11, { color: '#1e3a8a', uv: 'keep' });
  for (const z of [-11, 11]) b.boxMM('metal', F.x - 1.2, F.top + 0.25, z - 0.05, F.x + 1.2, F.top + 1.3, z + 0.05, { color: '#1e3a8a', uv: 'keep' });
  for (const z of [-10.6, 10.6]) for (const s of [-1, 1]) { b.cyl('metal', F.x + s * 1.0, 0, z, 0.15, 0.15, F.top, 8, { color: '#30476e' }); L.cylinder(F.x + s, z, 0.16, F.top); }
  roadSign(L, ['IKORODU ROAD', 'Ojota · Ketu · Mile 12 →'], F.x - 1.3, F.top - 0.7, 2, 7, 1.4, -Math.PI / 2);
  // the bus stop with danfos loading and the conductor's shout
  b.boxMM('metal', 58, 2.6, 8.6, 70, 2.75, 11.2, { color: '#16449a', uv: 'keep' });
  for (const px of [58.2, 64, 69.8]) b.cyl('metal', px, 0, 10.9, 0.06, 0.06, 2.6, 6, { color: '#e2b007' });
  L.inst('danfo', mat(61, 0, 7.0, 0));
  L.inst('danfo', mat(67.5, 0, 7.0, 0));
  L.inst('keke', mat(48, 0, 7.2, 0));
  for (let k = 0; k < 5; k++) billboard(L, X0 + 20 + k * 44, 26, POSTERS[(k + 4) % POSTERS.length]);
  // the north side, behind the BRT lane
  for (let k = 0; k < 12; k++) block(L, { x0: X0 + k * 18, z0: -24, x1: X0 + k * 18 + 14, z1: -14, floors: 2 + (k % 3), color: ['#e9dfcc', '#d7e3e8', '#efe0c8'][k % 3], seed: 400 + k, roof: 'flat' });
}

/* ================================================================ Lekki–Epe Expressway */
function lekki(L, R) {
  const { b } = L;
  const r = rng(79);
  b.boxMM('concrete', X0, -0.06, -40, X1, -0.01, 50, { color: '#e3cf9c' }); // sandy ground
  carriageway(L, 0.6, 8.8, [3.4, 6.2]);
  carriageway(L, -9.4, -1.4, [-4.2, -7.0]);
  b.boxMM('ground', X0, 0, -1.4, X1, 0.2, 0.6, { color: '#6d9a43' }); // grassy median
  kerb(L, 0.6); kerb(L, -1.4);
  for (let x = X0 + 4; x < X1; x += 12) L.inst(['palm0', 'palm1', 'palm2'][Math.abs(Math.round(x)) % 3], mat(x, 0.2, -0.4, x));
  b.boxMM('pavers', X0, 0, 8.8, X1, 0.16, 12.4, { color: '#d1c7b3' });
  kerb(L, 8.8);
  // estate walls with gates, palms, and new buildings behind
  b.boxMM('plaster', X0, 0, 15.2, X1, 2.6, 15.6, { color: '#f4ead6' });
  b.boxMM('paint', X0, 2.6, 15.15, X1, 2.8, 15.65, { color: '#1e40af' });
  L.collide(X0, 0, 15.2, X1, 2.8, 15.6, 'wall');
  for (const gx of [-50, 10, 70]) {
    b.boxMM('paint', gx - 4, 0, 15.1, gx + 4, 0.02, 15.7, { color: '#1f2937' });
    for (const s of [-1, 1]) b.box('plaster', gx + s * 4.3, 1.9, 15.4, 0.8, 3.8, 0.8, { color: '#d6c7a6' });
    roadSign(L, [['PALM GROVE ESTATE', 'GOD\'S GRACE ESTATE', 'ROYAL GARDENS'][(gx + 50) / 60], 'Phase 1 · Security post'], gx, 4.3, 15.0, 6.5, 1.1, Math.PI, '#1e3a8a');
  }
  for (let k = 0; k < 14; k++) L.inst(['palm0', 'palm1', 'palm2'][k % 3], mat(X0 + 6 + k * 15 + r() * 3, 0, 13.6, k * 2));
  for (let k = 0; k < 10; k++) {
    const x = X0 + 5 + k * 21;
    block(L, { x0: x, z0: 20, x1: x + 13, z1: 30, floors: 2 + Math.floor(r() * 4), color: ['#f8f7f2', '#e5e7eb', '#f1e7d3', '#dfe9ef'][k % 4], seed: 500 + k, roof: 'flat' });
  }
  // the toll plaza canopy across the road
  const TX = 36;
  for (const z of [-10, -4.6, 0.2, 4.4, 9.6]) { b.box('paint', TX, 3.5, z, 0.5, 7, 0.5, { color: '#e5e7eb' }); L.cylinder(TX, z, 0.3, 7); }
  b.boxMM('paint', TX - 4.5, 7, -11, TX + 4.5, 7.7, 11, { color: '#f2c230' });
  b.boxMM('paint', TX - 4.6, 6.7, -11.1, TX + 4.6, 7.0, 11.1, { color: '#1e3a8a' });
  for (const z of [-0.2, 4.0]) { b.boxMM('plaster', TX - 1.2, 0, z - 0.45, TX + 1.2, 2.4, z + 0.45, { color: '#f8fafc' }); b.box('glass', TX, 1.6, z, 2.42, 0.8, 0.92, { color: '#8fb2c9' }); }
  roadSign(L, ['LEKKI TOLL PLAZA', 'Have your tag or change ready'], TX - 4.65, 6.0, 0, 9, 1.5, -Math.PI / 2, '#1e3a8a');
  gantry(L, -40, -10.4, 12.6, ['LEKKI–EPE EXPRESSWAY', 'Ajah · Elegushi Beach · Chevron →']);
  for (let k = 0; k < 4; k++) billboard(L, X0 + 30 + k * 52, 18.5, POSTERS[(k + 8) % POSTERS.length], 10, 4.4, 8);
}

/* ================================================================ Under the Ojuelegba bridge */
function ojuelegba(L, R) {
  const { b } = L;
  const r = rng(83);
  b.boxMM('ground', X0, -0.05, -40, X1, 0, 40, { color: '#b9805a' });
  carriageway(L, -6, 6, [0], '#d8d8d8');
  b.boxMM('concrete', X0, 0, 6, X1, 0.16, 9.4, { color: '#b5ad9c' });
  kerb(L, 6);
  b.boxMM('concrete', X0, 0, -9.4, X1, 0.16, -6, { color: '#b5ad9c' });
  kerb(L, -6);
  // the flyover overhead, on heavy columns
  b.boxMM('concrete', X0, 7.2, -7.5, X1, 8.2, 12.5, { color: '#a8a39a' });
  b.boxMM('concrete', X0, 8.2, -7.6, X1, 9.0, -7.3, { color: '#c9c4b8' });
  b.boxMM('concrete', X0, 8.2, 12.3, X1, 9.0, 12.6, { color: '#c9c4b8' });
  L.collide(X0, 7.2, -7.5, X1, 8.2, 12.5, 'ceiling');
  for (let x = X0 + 8; x < X1; x += 22) for (const z of [-7.2, 11.4]) { b.boxMM('concrete', x - 0.8, 0, z - 0.8, x + 0.8, 7.2, z + 0.8, { color: '#9b968c' }); L.collide(x - 0.8, 0, z - 0.8, x + 0.8, 7.2, z + 0.8, 'wall'); }
  // painted on the columns and the fascia
  roadSign(L, ['OJUELEGBA', 'Surulere · Stadium · Yaba'], 14, 6.2, 10.55, 5.5, 1.3, Math.PI, '#b91c1c');
  // under-bridge market and the mechanics, beyond the walkway
  const umb = ['umbrellaRY', 'umbrellaGW', 'umbrellaBW'];
  for (let i = 0; i < 18; i++) {
    const x = X0 + 6 + i * 11 + r() * 3, z = 14 + r() * 3;
    b.boxMM('wood', x - 1, 0, z - 0.6, x + 1, 0.8, z + 0.6, { color: '#7a5232' });
    for (let k = 0; k < 4; k++) b.box('plastic', x - 0.7 + k * 0.45, 0.9, z, 0.32, 0.18, 0.32, { color: ['#dc2626', '#f97316', '#facc15', '#16a34a'][(i + k) % 4] });
    L.inst(umb[i % 3], mat(x, 0, z, r() * 3));
    L.collide(x - 1, 0, z - 0.6, x + 1, 0.8, z + 0.6, 'stall');
  }
  for (let i = 0; i < 6; i++) L.inst(i % 2 ? 'keke' : 'okada', mat(X0 + 20 + i * 30, 0, 8.6, Math.PI / 2 * (i % 2 ? 0 : 1)));
  for (let i = 0; i < 3; i++) L.inst('danfo', mat(X0 + 40 + i * 50, 0, -4.4, Math.PI));
  for (let k = 0; k < 8; k++) block(L, { x0: X0 + k * 26, z0: 20, x1: X0 + k * 26 + 20, z1: 30, floors: 2 + (k % 2), color: ['#f1e6d0', '#e7d4b5', '#dbe7e4', '#f3d9c7'][k % 4], seed: 600 + k, roof: 'flat' });
  for (let k = 0; k < 4; k++) billboard(L, X0 + 40 + k * 50, 19, POSTERS[(k + 2) % POSTERS.length], 8, 3.6, 5.6);
  for (let x = X0 + 20; x < X1; x += 40) { L.inst('pole', mat(x, 0, 18.6, Math.PI)); L.line(new THREE.Vector3(x, POLE_ARM_Y, 18.6), new THREE.Vector3(x + 40, POLE_ARM_Y, 18.6)); }
}
