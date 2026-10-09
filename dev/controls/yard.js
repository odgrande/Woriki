// Test yard for the controls harness: a walled Lagos compound corner with a ramp and
// platform, stairs, ledges of known heights, seats (bench, plastic chairs, pews), a
// canopy to bump your head on, posts, a palm, a thin wall and a narrow passage.
// Exposes the same shape as the real world (seats, interactables, zones, surfaceAt…).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** Draw `fn(x, y)` so it wraps across the tile edges (seamless textures). */
function tiled(s, x, y, reach, fn) {
  for (const dx of [-s, 0, s]) {
    if ((dx < 0 && x < s - reach) || (dx > 0 && x > reach)) continue;
    for (const dy of [-s, 0, s]) {
      if ((dy < 0 && y < s - reach) || (dy > 0 && y > reach)) continue;
      fn(x + dx, y + dy);
    }
  }
}
function speckle(g, n, s, colors, rmax, r) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(r() * colors.length) | 0];
    g.globalAlpha = 0.15 + r() * 0.5;
    const rr = 0.4 + r() * rmax;
    tiled(s, r() * s, r() * s, rr, (x, y) => { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); });
  }
  g.globalAlpha = 1;
}

function textures() {
  const r = rng(7);
  const laterite = canvasTex(512, (g, s) => {
    g.fillStyle = '#a4673f'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const cx = r() * s, cy = r() * s, rad = 30 + r() * 90;
      const col = r() > 0.5 ? 'rgba(122,70,40,.35)' : 'rgba(190,128,84,.3)';
      tiled(s, cx, cy, rad, (x, y) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
    speckle(g, 5000, s, ['#7a4426', '#c58a5c', '#5e341d', '#d9a77a'], 1.6, r);
    speckle(g, 260, s, ['#e9d8c2', '#6e6259', '#3d2a1d'], 3.2, r);
  }, 14);
  const concrete = canvasTex(256, (g, s) => {
    g.fillStyle = '#a9a59c'; g.fillRect(0, 0, s, s);
    speckle(g, 3000, s, ['#8f8b83', '#c4c0b6', '#77736c'], 1.2, r);
    g.strokeStyle = 'rgba(60,55,50,.35)'; g.lineWidth = 1.5; g.strokeRect(0, 0, s, s);
  }, 1);
  const plaster = canvasTex(256, (g, s) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, s, s);
    speckle(g, 2500, s, ['#e2d6bd', '#f8f1e2', '#d5c8ad'], 1.4, r);
    // rain streaks
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(120,105,80,.05)'; g.fillRect(r() * (s - 8), 0, 2 + r() * 6, s); }
  }, 1);
  const wood = canvasTex(256, (g, s) => {
    g.fillStyle = '#7a4b2a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(${40 + r() * 30},${20 + r() * 15},10,${0.08 + r() * 0.12})`; g.fillRect(0, y, s, 1 + r() * 2); }
    for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(30,15,5,.35)'; g.beginPath(); g.moveTo(0, (i + 0.5) * s / 6); g.lineTo(s, (i + 0.5) * s / 6); g.stroke(); }
  }, 1);
  const mat = canvasTex(256, (g, s) => {
    g.fillStyle = '#7b1e2b'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#d9a441'; g.lineWidth = 10; g.strokeRect(14, 14, s - 28, s - 28);
    g.lineWidth = 3; g.strokeRect(34, 34, s - 68, s - 68);
    g.fillStyle = '#d9a441';
    for (let i = 0; i < 4; i++) { g.save(); g.translate(s / 2, s / 2); g.rotate((i * Math.PI) / 2); g.beginPath(); g.moveTo(0, -60); g.lineTo(18, -24); g.lineTo(-18, -24); g.fill(); g.restore(); }
    g.beginPath(); g.arc(s / 2, s / 2, 16, 0, Math.PI * 2); g.fill();
  }, 1);
  const frond = canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = '#3d5a1e'; g.lineWidth = 4; g.beginPath(); g.moveTo(s / 2, s); g.lineTo(s / 2, 0); g.stroke();
    for (let y = 8; y < s; y += 7) {
      const w = (s / 2) * Math.sin((y / s) * Math.PI) * 0.95;
      g.strokeStyle = y % 14 ? '#4f7a26' : '#5f8f2c'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(s / 2, y); g.lineTo(s / 2 - w, y + 18); g.moveTo(s / 2, y); g.lineTo(s / 2 + w, y + 18); g.stroke();
    }
  }, 1);
  frond.wrapS = frond.wrapT = THREE.ClampToEdgeWrapping;
  return { laterite, concrete, plaster, wood, mat, frond };
}

/** Text label texture for the ledge signs. */
function labelTex(text, bg = '#fde047') {
  return canvasTex(256, (g, s) => {
    g.fillStyle = bg; g.fillRect(0, 0, s, s / 2);
    g.strokeStyle = '#000'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s / 2 - 8);
    g.fillStyle = '#000'; g.font = 'bold 64px "Space Grotesk", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, s / 2, s / 4 + 4);
  });
}

/**
 * Build the yard into ctx.scene and register colliders in physics.
 * @returns {{root: THREE.Group, seats: any[], interactables: any[], zones: any[], spawns: any,
 *   surfaceAt: (x: number, z: number) => string, zoneAt: (p: THREE.Vector3) => any, groundAt: (x: number, z: number) => number, update: Function}}
 */
export function buildYard(ctx, physics) {
  const T = textures();
  const root = new THREE.Group();
  root.name = 'yard';
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: T.laterite, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ map: T.plaster, roughness: 0.9 }),
    band: new THREE.MeshStandardMaterial({ color: '#2f6f8f', roughness: 0.75 }),
    coping: new THREE.MeshStandardMaterial({ color: '#d8cdb5', roughness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.7 }),
    darkwood: new THREE.MeshStandardMaterial({ map: T.wood, color: '#8a6a55', roughness: 0.6 }),
    plasticW: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.45 }),
    plasticR: new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: '#5d6166', roughness: 0.5, metalness: 0.6 }),
    zinc: new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }),
    pole: new THREE.MeshStandardMaterial({ color: '#7b7466', roughness: 0.9 }),
    palm: new THREE.MeshStandardMaterial({ color: '#6e5a45', roughness: 1 }),
    frond: new THREE.MeshStandardMaterial({ map: T.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
    mat: new THREE.MeshStandardMaterial({ map: T.mat, roughness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.3, metalness: 0.9 }),
  };
  /** @type {Record<string, THREE.BufferGeometry[]>} */
  const parts = {};
  const put = (m, geo) => { (parts[m] || (parts[m] = [])).push(geo); };
  /** Box mesh part from min/max; optional collider. */
  function box(m, x0, y0, z0, x1, y1, z1, col) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    // world-scale UVs so textures tile evenly
    const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const px = pos.getX(i) + (x0 + x1) / 2, py = pos.getY(i) + (y0 + y1) / 2, pz = pos.getZ(i) + (z0 + z1) / 2;
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      if (ny > 0.5) uv.setXY(i, px / 2, pz / 2); else if (nx > 0.5) uv.setXY(i, pz / 2.6, py / 2.6); else uv.setXY(i, px / 2.6, py / 2.6);
    }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    put(m, g);
    if (col) physics.addBox(V(x0, y0, z0), V(x1, y1, z1), typeof col === 'string' ? { kind: col } : col);
    return g;
  }
  function cyl(m, x, y, z, r0, r1, h, seg = 10, col) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg);
    g.translate(x, y + h / 2, z);
    put(m, g);
    if (col) physics.addCylinder(V(x, y, z), Math.max(r0, r1), h, typeof col === 'string' ? { kind: col } : col);
  }

  // ---------------------------------------------------------------- ground + ramp
  const RAMP = { x0: 4, x1: 10, z0: -8, z1: -5, h: 1.2 };
  const PLAT = { x0: 10, x1: 13.5, z0: -11, z1: -5, h: 1.2 };
  const groundAt = (x, z) => {
    if (z >= PLAT.z0 && z <= PLAT.z1 && x >= PLAT.x0 && x <= PLAT.x1) return PLAT.h;
    if (z >= RAMP.z0 && z <= RAMP.z1 && x >= RAMP.x0 && x < RAMP.x1) return ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * RAMP.h;
    return 0;
  };
  physics.setGround(groundAt);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  // ramp slab (sloped box) + platform block
  {
    const len = Math.hypot(RAMP.x1 - RAMP.x0, RAMP.h);
    const g = new THREE.BoxGeometry(len, 0.2, RAMP.z1 - RAMP.z0);
    const ang = Math.atan2(RAMP.h, RAMP.x1 - RAMP.x0);
    g.translate(0, -0.1, 0);
    g.rotateZ(ang);
    g.translate((RAMP.x0 + RAMP.x1) / 2, RAMP.h / 2, (RAMP.z0 + RAMP.z1) / 2);
    put('concrete', g);
    // ramp side walls (visual)
    const side = new THREE.BufferGeometry();
    const tri = [];
    for (const z of [RAMP.z0, RAMP.z1]) tri.push(RAMP.x0, 0, z, RAMP.x1, 0, z, RAMP.x1, RAMP.h - 0.2, z);
    side.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    side.computeVertexNormals();
    const sm = new THREE.Mesh(side, new THREE.MeshStandardMaterial({ color: '#8f8a80', side: THREE.DoubleSide, roughness: 0.9 }));
    root.add(sm);
  }
  box('concrete', PLAT.x0, 0, PLAT.z0, PLAT.x1, PLAT.h, PLAT.z1);
  // stairs down from the platform's south edge (box tops = support)
  for (let i = 0; i < 5; i++) {
    const top = PLAT.h - 0.2 * (i + 1);
    box('concrete', PLAT.x0, 0, PLAT.z1 + i * 0.42, PLAT.x1, top, PLAT.z1 + (i + 1) * 0.42, 'step');
  }
  // railing on the platform's east + north side (collider = full panel, visual = rails + balusters)
  {
    const top = PLAT.h + 1.0;
    physics.addBox(V(PLAT.x1 - 0.06, PLAT.h, PLAT.z0), V(PLAT.x1, top, PLAT.z1), { kind: 'railing', camera: false });
    physics.addBox(V(PLAT.x0, PLAT.h, PLAT.z0), V(PLAT.x1, top, PLAT.z0 + 0.06), { kind: 'railing', camera: false });
    for (const y of [top - 0.05, PLAT.h + 0.5]) {
      box('metal', PLAT.x1 - 0.05, y, PLAT.z0, PLAT.x1 - 0.01, y + 0.05, PLAT.z1);
      box('metal', PLAT.x0, y, PLAT.z0 + 0.01, PLAT.x1, y + 0.05, PLAT.z0 + 0.05);
    }
    for (let z = PLAT.z0; z <= PLAT.z1 + 1e-6; z += 0.5) box('metal', PLAT.x1 - 0.045, PLAT.h, z - 0.015, PLAT.x1 - 0.015, top, z + 0.015);
    for (let x = PLAT.x0; x <= PLAT.x1 + 1e-6; x += 0.5) box('metal', x - 0.015, PLAT.h, PLAT.z0 + 0.015, x + 0.015, top, PLAT.z0 + 0.045);
  }

  // ---------------------------------------------------------------- compound walls
  const wall = (x0, z0, x1, z1, h = 2.4) => {
    box('plaster', x0, 0.5, z0, x1, h, z1, 'wall');
    box('band', x0 - 0.01, 0, z0 - 0.01, x1 + 0.01, 0.5, z1 + 0.01);
    box('coping', x0 - 0.05, h, z0 - 0.05, x1 + 0.05, h + 0.08, z1 + 0.05);
    physics.addBox(V(x0, 0, z0), V(x1, 0.5, z1), { kind: 'wall' });
  };
  wall(-16, -16, 16, -15.7);
  wall(-16, -15.7, -15.7, 14);
  wall(15.7, -15.7, 16, 14);
  // inner wall with a doorway (lintel at 2.1 m)
  wall(-6, -12, -1.6, -11.8, 2.6);
  wall(-0.4, -12, 4, -11.8, 2.6);
  box('plaster', -1.6, 2.1, -12, -0.4, 2.6, -11.8, 'wall');
  // thin wall (5 cm) for the anti-tunnelling test
  box('plaster', 8, 0, 5, 8.05, 2, 10, 'wall');
  // narrow passage: 0.62 m gap between two walls
  wall(-13, 7, -10, 7.2, 2);
  wall(-13, 7.82, -10, 8.02, 2);
  // low wall you can jump onto (0.8 m)
  box('plaster', 9, 0, -1.5, 13, 0.8, -1.1, 'wall');
  box('coping', 8.95, 0.8, -1.55, 13.05, 0.86, -1.05);

  // ---------------------------------------------------------------- ledge test row
  const ledges = [0.15, 0.3, 0.45, 0.6];
  ledges.forEach((h, i) => {
    const z0 = -2 - i * 2.4;
    box('concrete', -11, 0, z0 - 1.8, -8.6, h, z0, i < 2 ? 'step' : 'wall');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: labelTex(`${Math.round(h * 100)} cm`, i < 2 ? '#86efac' : '#ff9ebb'), toneMapped: false }));
    sign.position.set(-8.58, h + 0.32, z0 - 0.9);
    sign.rotation.y = Math.PI / 2;
    root.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), mats.metal);
    post.position.set(-8.6, h + 0.08, z0 - 0.9);
    root.add(post);
  });

  // ---------------------------------------------------------------- seats
  const seats = [];
  const seat = (x, y, z, rotY, kind, zone = 'yard') => seats.push({ position: V(x, y, z), rotY, kind, zone, taken: false });
  // wooden bench along the west wall, facing east (+X)
  {
    const x = -14.6, z0 = 0, z1 = 3;
    box('wood', x - 0.22, 0.42, z0, x + 0.22, 0.47, z1);
    for (const z of [z0 + 0.15, z1 - 0.15]) box('darkwood', x - 0.18, 0, z - 0.04, x + 0.18, 0.42, z + 0.04);
    physics.addBox(V(x - 0.22, 0, z0), V(x + 0.22, 0.47, z1), { kind: 'furniture' });
    for (let i = 0; i < 3; i++) seat(x, 0.47, z0 + 0.55 + i * 0.95, Math.PI / 2, 'bench');
  }
  // white plastic chairs (the Lagos classic) around a red table
  {
    const chair = (x, z, rotY, m = 'plasticW') => {
      const g = [];
      const add = (geo) => g.push(geo);
      add(new THREE.BoxGeometry(0.44, 0.04, 0.42).translate(0, 0.44, 0));
      add(new THREE.BoxGeometry(0.44, 0.46, 0.04).translate(0, 0.7, -0.2).rotateX(0));
      for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) add(new THREE.CylinderGeometry(0.018, 0.024, 0.44, 6).translate(lx, 0.22, lz));
      for (const piece of g) { piece.rotateY(rotY); piece.translate(x, 0, z); put(m, piece); }
      physics.addBox(V(x - 0.24, 0, z - 0.24), V(x + 0.24, 0.92, z + 0.24), { kind: 'furniture' });
      seat(x + Math.sin(rotY) * 0.02, 0.46, z + Math.cos(rotY) * 0.02, rotY, 'chair');
    };
    // table
    box('plasticR', 2.6, 0.7, 2.6, 3.6, 0.74, 3.6, 'furniture');
    for (const [lx, lz] of [[2.66, 2.66], [3.54, 2.66], [2.66, 3.54], [3.54, 3.54]]) cyl('plasticR', lx, 0, lz, 0.025, 0.025, 0.7, 6);
    chair(3.1, 2.05, 0);
    chair(3.1, 4.15, Math.PI);
    chair(2.05, 3.1, Math.PI / 2, 'plasticR');
    chair(4.15, 3.1, -Math.PI / 2);
  }
  // two church pews facing the back wall (−Z), like the auditorium
  for (let k = 0; k < 2; k++) {
    const z = -6.6 + k * 1.2, a = -5.5, b = -1.5;
    box('wood', a, 0.42, z - 0.25, b, 0.47, z + 0.2); // seat
    box('wood', a, 0.47, z + 0.2, b, 1.0, z + 0.27); // backrest
    for (const x of [a + 0.05, b - 0.12]) box('darkwood', x, 0, z - 0.25, x + 0.07, 0.95, z + 0.27);
    physics.addBox(V(a, 0, z - 0.25), V(b, 1.0, z + 0.32), { kind: 'furniture' });
    for (let i = 0; i < 5; i++) seat(a + 0.45 + i * 0.75, 0.47, z - 0.02, Math.PI, 'pew', 'prayer-room');
  }

  // ---------------------------------------------------------------- canopy (head bump), posts, palm
  {
    const x0 = -3, x1 = 1, z0 = 9, z1 = 12.5, h = 2.25;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) cyl('metal', x, 0, z, 0.05, 0.05, h, 8, { kind: 'post' });
    const roof = new THREE.PlaneGeometry(x1 - x0 + 0.4, z1 - z0 + 0.4, 12, 1);
    // corrugation
    const p = roof.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 18) * 0.02);
    roof.computeVertexNormals();
    roof.rotateX(-Math.PI / 2);
    roof.translate((x0 + x1) / 2, h + 0.05, (z0 + z1) / 2);
    put('zinc', roof);
    physics.addBox(V(x0 - 0.2, h, z0 - 0.2), V(x1 + 0.2, h + 0.1, z1 + 0.2), { kind: 'roof' });
  }
  // electric pole (thin: camera ignores it) and a palm tree
  cyl('pole', 6.5, 0, 1.5, 0.16, 0.11, 8, 8, 'post');
  box('pole', 5.6, 7.2, 1.45, 7.4, 7.3, 1.55);
  {
    const px = -7, pz = 7;
    const trunk = new THREE.CylinderGeometry(0.17, 0.24, 6.5, 9, 6);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) + 3.25; tp.setX(i, tp.getX(i) + Math.sin(y * 0.35) * 0.25); }
    trunk.computeVertexNormals();
    trunk.translate(px, 3.25, pz);
    put('palm', trunk);
    physics.addCylinder(V(px, 0, pz), 0.24, 6.5, { kind: 'tree' });
    for (let i = 0; i < 9; i++) {
      const f = new THREE.PlaneGeometry(1.1, 3.2, 1, 4);
      const fp = f.attributes.position;
      for (let k = 0; k < fp.count; k++) { const yy = fp.getY(k) + 1.6; fp.setZ(k, -0.12 * yy * yy); }
      f.translate(0, 1.6, 0);
      f.rotateX(-1.1 + (i % 3) * 0.15);
      f.rotateY((i / 9) * Math.PI * 2);
      f.translate(px + Math.sin(6.5 * 0.35) * 0.25, 6.4, pz);
      f.computeVertexNormals();
      put('frond', f);
    }
  }

  // ---------------------------------------------------------------- interactables
  // prayer mat near the pews
  {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7), mats.mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-3.5, 0.012, -9.5);
    m.receiveShadow = true;
    root.add(m);
  }
  // church bell on a frame
  {
    const bx = 12, bz = 5;
    for (const s of [-1, 1]) box('metal', bx + s * 0.6 - 0.04, 0, bz - 0.04, bx + s * 0.6 + 0.04, 2.3, bz + 0.04, { kind: 'post' });
    box('metal', bx - 0.65, 2.3, bz - 0.05, bx + 0.65, 2.38, bz + 0.05);
    const prof = [[0.27, 0], [0.25, 0.03], [0.2, 0.1], [0.165, 0.22], [0.15, 0.32], [0.11, 0.39], [0.04, 0.42]];
    const bell = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
    bell.translate(bx, 1.82, bz);
    put('brass', bell);
  }
  const interactables = [
    { id: 'mat', position: V(-3.5, 0, -9.5), radius: 1.1, label: 'Pray here', action: 'pray' },
    { id: 'bell', position: V(12, 0, 5), radius: 1.3, label: 'Ring bell', action: 'ring-bell' },
    { id: 'table', position: V(3.1, 0, 3.1), radius: 1.6, label: 'Sit down', action: 'sit' },
  ];

  // ---------------------------------------------------------------- merge static meshes per material
  for (const [m, list] of Object.entries(parts)) {
    const geo = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), false);
    const mesh = new THREE.Mesh(geo, mats[m]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `yard:${m}`;
    root.add(mesh);
  }
  ctx.scene.add(root);

  const zones = [
    { id: 'prayer-room', label: 'Prayer corner', ambience: 'prayer', box: new THREE.Box3(V(-6, -1, -11.8), V(-1, 5, -5)) },
    { id: 'yard', label: 'Test yard', ambience: 'street', box: new THREE.Box3(V(-16, -1, -16), V(16, 5, 14)) },
  ];
  const surfaceAt = (x, z) => {
    if (x >= -4.05 && x <= -2.95 && z >= -10.35 && z <= -8.65) return 'carpet';
    if (groundAt(x, z) > 0.01) return 'concrete';
    if (x >= PLAT.x0 && x <= PLAT.x1 && z >= PLAT.z1 && z <= PLAT.z1 + 2.1) return 'concrete';
    if (x >= -11 && x <= -8.6 && z <= -2 && z >= -11.4) return 'concrete';
    return 'dirt';
  };
  const zoneAt = (p) => zones.find((zz) => zz.box.containsPoint(p)) || null;
  return {
    root, seats, interactables, zones, surfaceAt, zoneAt, groundAt,
    spawns: { player: { position: V(0, 0, 1), rotY: Math.PI } },
    update() {},
  };
}
