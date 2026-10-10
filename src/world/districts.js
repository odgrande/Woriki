// Places you travel to from the Lagos map (far from Yaba in world space, so they never show
// in each other's view): Elegushi Beach in Lekki and the National Theatre in Iganmu with its
// cinema. Built with the same builder state as the Yaba street (see world.js createState).
import * as THREE from 'three';
import { mat } from './geo.js';
import { wall } from './buildings.js';
import { BEACH, THEATRE, CINEMA } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================================================================ Elegushi Beach */

export function buildBeach(W) {
  const { b: B } = W;
  const { x0, x1, z0, z1, shore } = BEACH;
  const cx = (x0 + x1) / 2;
  // ground: laterite car park, then the sand down to the water
  B.boxMM('ground', x0 - 30, -0.05, z0 - 40, x1 + 30, 0, z0, { color: '#c98a5a' });
  B.boxMM('concrete', x0 - 30, -0.05, z0, x1 + 30, 0.0, shore + 30, { color: '#f0dcaa' });
  // wet sand near the waterline
  B.boxMM('concrete', x0 - 30, 0.001, shore - 3, x1 + 30, 0.002, shore + 30, { color: '#cdb27a' });
  // fence with the gate and the ticket booth
  for (const [a, b] of [[x0, cx - 3], [cx + 3, x1]]) {
    B.boxMM('plaster', a, 0, z0 - 0.15, b, 1.6, z0 + 0.15, { color: '#f4ecd9' });
    W.collide(a, 0, z0 - 0.15, b, 1.6, z0 + 0.15, 'fence');
  }
  for (const s of [-1, 1]) { B.box('plaster', cx + s * 3.3, 1.6, z0, 0.6, 3.2, 0.6, { color: '#1d4ed8' }); W.collide(cx + s * 3.3 - 0.3, 0, z0 - 0.3, cx + s * 3.3 + 0.3, 3.2, z0 + 0.3, 'fence'); }
  B.box('paint', cx, 3.25, z0, 7.2, 0.5, 0.3, { color: '#1d4ed8' });
  B.boxMM('plaster', cx + 4.2, 0, z0 - 2.4, cx + 6.4, 2.4, z0 - 0.4, { color: '#facc15' });
  B.box('glass', cx + 5.3, 1.4, z0 - 0.38, 1.4, 0.8, 0.04, { color: '#9ad' });
  W.collide(cx + 4.2, 0, z0 - 2.4, cx + 6.4, 2.4, z0 - 0.4, 'kiosk');
  // keep people inside the beach (side walls, the sea)
  W.collide(x0 - 1, 0, z0, x0, 3, shore + 8, 'wall');
  W.collide(x1, 0, z0, x1 + 1, 3, shore + 8, 'wall');
  W.collide(x0, 0, shore + 6, x1, 3, shore + 7, 'wall');
  // palms along the back of the beach
  for (let i = 0; i < 14; i++) {
    const x = x0 + 4 + i * ((x1 - x0 - 8) / 13) + Math.sin(i * 7.1) * 1.2, z = z0 + 5 + Math.cos(i * 3.3) * 1.5;
    W.inst(['palm0', 'palm1', 'palm2'][i % 3], mat(x, 0, z, i * 1.7));
    W.cylinder(x, z, 0.3, 4);
  }
  // umbrellas with plastic chairs and a table
  const umbrellas = ['umbrellaRY', 'umbrellaGW', 'umbrellaBW'];
  for (let i = 0; i < 9; i++) {
    const x = x0 + 8 + i * 6.2, z = z0 + 14 + (i % 2) * 3;
    W.inst(umbrellas[i % 3], mat(x, 0, z, i));
    W.cylinder(x, z, 0.08, 2.2);
    W.inst('tablePlasticLow', mat(x, 0, z + 0.2), '#f2f2ee');
    for (const s of [-1, 1]) {
      W.inst('chair', mat(x + s * 0.85, 0, z + 0.2, -s * Math.PI / 2), '#f2f2ee');
      W.seat(x + s * 0.85, 0.45, z + 0.2, -s * Math.PI / 2, 'chair', 'beach');
    }
  }
  // suya spot: a hut with a smoking grill
  const sx = x0 + 10, sz = z0 + 6.5;
  B.boxMM('wood', sx - 1.6, 0, sz - 1, sx + 1.6, 0.95, sz + 0.4, { color: '#6b4a2d' });
  B.box('metal', sx, 1.0, sz - 0.3, 2.2, 0.12, 0.8, { color: '#222' });
  B.box('lamp', sx, 1.07, sz - 0.3, 2.0, 0.02, 0.6, { color: '#ff7a2a' });
  for (const [px, pz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.3], [1.5, 0.3]]) B.box('wood', sx + px, 1.3, sz + pz, 0.1, 2.6, 0.1, { color: '#4a3220' });
  B.boxMM('roof', sx - 2, 2.6, sz - 1.4, sx + 2, 2.7, sz + 0.8, { color: '#8a6a3a' });
  W.collide(sx - 1.6, 0, sz - 1, sx + 1.6, 1.0, sz + 0.4, 'counter');
  W.interact('suya', V(sx, 0, sz + 1.3), 1.8, 'Suya and a cold drink (₦3,000)', 'activity', { activity: 'suya' });
  // coconut cart
  const kx = cx + 12, kz = z0 + 7;
  B.boxMM('wood', kx - 0.9, 0.5, kz - 0.5, kx + 0.9, 0.9, kz + 0.5, { color: '#8a5a33' });
  for (let i = 0; i < 9; i++) B.add('plastic', new THREE.SphereGeometry(0.17, 8, 6), { m: mat(kx - 0.6 + (i % 3) * 0.4, 1.05 + Math.floor(i / 3) * 0.12, kz - 0.25 + (i % 2) * 0.3), color: '#4f7a2a' });
  W.collide(kx - 0.9, 0, kz - 0.5, kx + 0.9, 1.0, kz + 0.5, 'counter');
  W.interact('coconut', V(kx, 0, kz + 1.2), 1.6, 'Fresh coconut (₦800)', 'activity', { activity: 'coconut' });
  // horse for rides (a simple brown horse) with its owner's post
  const hx = cx - 14, hz = z0 + 22;
  horse(W, hx, hz, 0.4);
  W.collide(hx - 1.1, 0, hz - 0.5, hx + 1.1, 1.6, hz + 0.5, 'prop');
  W.interact('horse', V(hx, 0, hz + 1.4), 2, 'Horse ride on the sand (₦5,000)', 'activity', { activity: 'horse' });
  // beach party bar: bamboo, speakers, coloured bulbs (the temptation is real)
  const bx = x1 - 12, bz = z0 + 8;
  B.boxMM('wood', bx - 3, 0, bz - 1.2, bx + 3, 1.1, bz - 0.4, { color: '#a0743f' });
  for (const px of [-3, 3]) for (const pz of [-1.6, 1.4]) B.box('wood', bx + px, 1.4, bz + pz, 0.14, 2.8, 0.14, { color: '#7a5530' });
  B.boxMM('roof', bx - 3.4, 2.8, bz - 2, bx + 3.4, 2.9, bz + 1.8, { color: '#c9a35a' });
  for (let i = 0; i < 8; i++) B.add('lamp', new THREE.SphereGeometry(0.07, 6, 4), { m: mat(bx - 3 + i * 0.85, 2.7, bz + 1.4), color: ['#ff3b6b', '#3bd1ff', '#ffe23b', '#7cff6b'][i % 4] });
  W.inst('speaker', mat(bx - 2.6, 0, bz + 1.1, Math.PI));
  W.inst('speaker', mat(bx + 2.6, 0, bz + 1.1, Math.PI));
  W.collide(bx - 3, 0, bz - 1.2, bx + 3, 1.1, bz - 0.4, 'counter');
  W.interact('beachparty', V(bx, 0, bz + 0.4), 2, 'Beach party bar', 'activity', { activity: 'beachparty' });
  // a quiet place to pray at the water's edge
  W.interact('beachpray', V(cx + 6, 0, shore - 1), 2.2, 'Pray by the sea', 'activity', { activity: 'beachpray' });
  // the Atlantic
  W.extras.push(() => sea(x0 - 200, x1 + 200, shore, shore + 400));
  W.extras.push(() => textSign('ELEGUSHI BEACH', '#1d4ed8', '#ffffff', V(cx, 3.25, z0 + 0.16), 0, 6.8, 0.46));
  W.extras.push(() => textSign('Pray by the sea 🌅', '#fffdf7', '#18181b', V(cx + 6, 1.1, shore - 2.2), Math.PI, 1.6, 0.4, true));
}

/** A simple horse made of boxes, facing +X rotated by ry. */
function horse(W, x, z, ry) {
  const { b: B } = W;
  const m = mat(x, 0, z, ry);
  const part = (px, py, pz, sx, sy, sz, rz = 0, c = '#6b3f22') => B.add('fabric', new THREE.BoxGeometry(sx, sy, sz), { m: m.clone().multiply(mat(px, py, pz, 0, 0, rz)), color: c, uv: 'box' });
  part(0, 1.15, 0, 1.5, 0.55, 0.5);
  part(0.85, 1.55, 0, 0.3, 0.75, 0.3, -0.6);
  part(1.15, 1.85, 0, 0.55, 0.25, 0.26, 0.4);
  part(0.62, 1.7, 0, 0.5, 0.12, 0.08, -0.6, '#1d120a');
  part(-0.85, 1.1, 0, 0.12, 0.6, 0.1, 0.5, '#1d120a');
  for (const [lx, lz] of [[0.55, 0.16], [0.55, -0.16], [-0.55, 0.16], [-0.55, -0.16]]) part(lx, 0.45, lz, 0.13, 0.9, 0.13);
  part(0, 1.46, 0, 0.6, 0.06, 0.56, 0, '#b91c1c');
}

/** Animated sea surface with a foam edge (its own mesh, updated every frame). */
function sea(x0, x1, z0, z1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a7fb3';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 18, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((x1 - x0) / 12, (z1 - z0) / 12);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.1 }));
  water.receiveShadow = true;
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 3).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.05, z0 + 0.5),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
  const group = new THREE.Group();
  group.add(water, foam);
  group.name = 'world:sea';
  return {
    object: group,
    update(dt, t) {
      tex.offset.y -= dt * 0.03;
      tex.offset.x += dt * 0.01;
      const k = (Math.sin(t * 0.7) + 1) / 2;
      foam.position.z = -k * 2.2;
      foam.material.opacity = 0.25 + (1 - k) * 0.5;
      water.position.z = -k * 1.2;
    },
  };
}

/** A painted sign with text, as its own mesh. */
function textSign(text, bg, fg, pos, ry, w, h, post = false) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = `800 ${Math.round(c.height * 0.62)}px "Space Grotesk", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2, c.width - 20);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
  group.add(face);
  if (post) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, pos.y, 6), new THREE.MeshStandardMaterial({ color: '#555' })); p.position.y = -pos.y / 2 - h / 2 + 0.05; group.add(p); }
  group.position.copy(pos);
  group.rotation.y = ry;
  return { object: group };
}

/* ================================================================ National Theatre + cinema */

export function buildTheatre(W) {
  const { b: B } = W;
  const { x0, x1, z0, z1, cap } = THEATRE;
  // plaza and approach
  B.boxMM('concrete', x0, -0.05, z0, x1, 0, z1, { color: '#cfc9bc' });
  B.boxMM('ground', x0 - 40, -0.06, z0 - 40, x1 + 40, -0.01, z1 + 40, { color: '#b77d55' });
  B.boxMM('asphalt', x0, 0.001, z1 - 8, x1, 0.002, z1, { color: '#555' });
  // the "military cap": a lathe with a folded brim, on a plinth
  {
    const [cx, cz, R] = cap;
    const prof = [[0, 15], [R * 0.72, 14.6], [R * 0.92, 13], [R * 1.05, 10.2], [R * 0.93, 9], [R * 0.86, 4], [R * 0.9, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(prof, 64);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i), py = p.getY(i);
      const a = Math.atan2(pz, px), r = Math.hypot(px, pz);
      const fold = py > 8.5 ? 1 + 0.06 * Math.cos(a * 16) : 1;
      p.setXYZ(i, Math.cos(a) * r * fold + cx, py + (py > 8.5 ? 0.5 * Math.cos(a * 16) : 0), Math.sin(a) * r * fold + cz);
    }
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(p.count * 2).fill(0), 2));
    B.add('paint', g, { color: '#e9e4d6' });
    W.cylinder(cx, cz, R * 0.92, 15);
    // dark glass band of windows
    B.add('glass', new THREE.CylinderGeometry(R * 0.875, R * 0.875, 2.2, 64, 1, true), { m: mat(cx, 6.2, cz), color: '#38505e', uv: 'keep' });
  }
  // the cinema hall in front of the theatre
  const { x0: hx0, x1: hx1, z0: hz0, z1: hz1, h, door } = CINEMA;
  B.boxMM('carpet', hx0, 0.0, hz0, hx1, 0.01, hz1, { color: '#4a1420' });
  const o = { y0: 0, h, t: 0.3, color: '#f2ecdf', out: 1, inner: '#2a1a24' };
  const leaves = wall(W, 'x', hx0, hx1, hz1, { ...o, openings: [{ a: door[0], b: door[1], y0: 0, y1: 2.6, type: 'door', leaf: 'door-white', double: true, dynamic: true }] });
  wall(W, 'x', hx0, hx1, hz0, { ...o, out: -1 });
  wall(W, 'z', hz0, hz1, hx0, { ...o, out: -1 });
  wall(W, 'z', hz0, hz1, hx1, { ...o });
  B.boxMM('ceiling', hx0, h - 0.2, hz0, hx1, h, hz1, { color: '#1b1418' });
  B.boxMM('roof', hx0 - 0.4, h, hz0 - 0.4, hx1 + 0.4, h + 0.25, hz1 + 0.4, { color: '#8a9093' });
  W.collide(hx0, h - 0.2, hz0, hx1, h, hz1, 'ceiling');
  W.collide(hx0, h, hz0, hx1, h + 1, hz1, 'roof');
  for (const l of leaves) W.dynamicDoor('cinema-door', l, 'Open / close the cinema door');
  // screen wall, stage and seats facing it (−Z)
  B.boxMM('paint', hx0 + 1, 0, hz0 + 0.15, hx1 - 1, 0.6, hz0 + 1.6, { color: '#1a1a1a' });
  W.collide(hx0 + 1, 0, hz0 + 0.15, hx1 - 1, 0.6, hz0 + 1.6, 'counter');
  const rows = 6, perRow = 14;
  for (let r = 0; r < rows; r++) for (let i = 0; i < perRow; i++) {
    const x = hx0 + 2.2 + i * ((hx1 - hx0 - 4.4) / (perRow - 1));
    if (Math.abs(x - (hx0 + hx1) / 2) < 0.6) continue; // centre aisle
    const z = hz0 + 6 + r * 1.25;
    W.inst('chair', mat(x, 0, z, Math.PI), '#b91c1c');
    W.seat(x, 0.45, z, Math.PI, 'chair', 'cinema');
  }
  // ticket and snack counter by the door
  const cx = hx1 - 2.6, cz = hz1 - 2.2;
  B.boxMM('wood', cx - 1.8, 0, cz - 0.4, cx + 1.8, 1.05, cz + 0.4, { color: '#7a1f2b' });
  B.box('lamp', cx, 1.08, cz, 3.4, 0.04, 0.7, { color: '#ffe8a8' });
  W.collide(cx - 1.8, 0, cz - 0.4, cx + 1.8, 1.05, cz + 0.4, 'counter');
  W.interact('ticket-nollywood', V(cx - 0.9, 0, cz - 1.1), 1.4, 'Ticket: Nollywood film (₦3,500)', 'activity', { activity: 'nollywood' });
  W.interact('ticket-gospel', V(cx + 0.2, 0, cz - 1.1), 1.4, 'Ticket: gospel film (₦2,500)', 'activity', { activity: 'gospelfilm' });
  W.interact('popcorn', V(cx + 1.3, 0, cz - 1.1), 1.4, 'Popcorn and a drink (₦2,500)', 'activity', { activity: 'popcorn' });
  W.interact('ticket-horror', V(hx0 + 2.5, 0, hz1 - 1.5), 1.4, '"Blood Money" poster (late show)', 'activity', { activity: 'horror' });
  W.extras.push(() => filmScreen((hx0 + hx1) / 2, 3.4, hz0 + 0.4, hx1 - hx0 - 4, 4.6));
  W.extras.push(() => textSign('NATIONAL THEATRE · CINEMA', '#111827', '#f97316', V((hx0 + hx1) / 2, h - 0.7, hz1 + 0.17), 0, 9, 0.8));
  W.extras.push(() => textSign('NOW SHOWING ▸ "Sunday Morning"', '#fffdf7', '#18181b', V(hx0 + 2.5, 1.8, hz1 - 0.17), Math.PI, 2.6, 0.5));
  // palms and parked cars on the plaza
  for (const [x, z] of [[x0 + 6, z1 - 12], [x1 - 6, z1 - 12], [x0 + 6, z0 + 22], [x1 - 6, z0 + 22]]) { W.inst('palm1', mat(x, 0, z, x)); W.cylinder(x, z, 0.3, 4); }
  for (let i = 0; i < 4; i++) { const x = x0 + 8 + i * 5, z = z1 - 4; W.inst('car', mat(x, 0, z, Math.PI / 2), ['#e9e9e6', '#1f2937', '#b91c1c', '#1d4ed8'][i]); W.collide(x - 1.0, 0, z - 2.3, x + 1.0, 1.45, z + 2.3, 'vehicle'); }
  // invisible edge
  W.collide(x0 - 1, 0, z0, x0, 3, z1, 'wall'); W.collide(x1, 0, z0, x1 + 1, 3, z1, 'wall'); W.collide(x0, 0, z1, x1, 3, z1 + 1, 'wall');
}

/** The cinema screen: a "film" drawn on a canvas (scenes, light, subtitles), updated a few times a second. */
function filmScreen(x, y, z, w, h) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = Math.round((384 * h) / w);
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.position.set(x, y, z);
  const lines = ['"Mama, I am going to church."', '"You will not go anywhere today!"', '"God, if You are there…"', '"I forgive you."', '"Na wa o."', '"Sunday morning came."'];
  const skies = [['#f59e0b', '#7c2d12'], ['#1e3a8a', '#0f172a'], ['#38bdf8', '#065f46'], ['#be185d', '#1e1b4b']];
  let acc = 0, t = 0;
  function draw() {
    const W = c.width, H = c.height;
    const scene = Math.floor(t / 6) % skies.length;
    const [a, b] = skies[scene];
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, a); grd.addColorStop(1, b);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(0, H * 0.72, W, H * 0.28);
    // two people talking
    const sway = Math.sin(t * 1.3) * 3;
    for (const [px, ph] of [[W * 0.35 + sway, 0.46], [W * 0.62 - sway, 0.5]]) {
      g.beginPath(); g.arc(px, H * (0.72 - ph) + 12, 13, 0, Math.PI * 2); g.fill();
      g.fillRect(px - 16, H * (0.72 - ph) + 26, 32, H * ph - 26);
    }
    g.fillStyle = '#fff';
    g.font = '600 15px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(lines[Math.floor(t / 3) % lines.length], W / 2, H - 12);
    tex.needsUpdate = true;
  }
  draw();
  return {
    object: mesh,
    update(dt) { acc += dt; t += dt; if (acc > 0.2) { acc = 0; draw(); } },
  };
}
