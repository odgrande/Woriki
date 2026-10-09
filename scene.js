'use strict';

/* =========================================================================
   3D world: a low-poly "dollhouse" view of your room (before ordination)
   or your church (after). Built from primitives so it stays light on
   cheap phones. Your own character can walk, run, jump, sit, kneel and wave.
   Exposes window.World = { update(state), setMode(id), layout(), setMove(dir, on), act(name), turn(d) }.
   ========================================================================= */

(function () {
  const NOOP = { update() {}, setMode() {}, layout() {}, setMove() {}, act() {}, turn() {} };
  const canvas = document.getElementById('world');
  if (!window.THREE || !canvas) { window.World = NOOP; return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.style.display = 'none';
    window.World = NOOP;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb38a, 0.58));
  const sun = new THREE.DirectionalLight(0xffffff, 0.52);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  /* ---------------- primitives ---------------- */

  const FY = 0.2; // floor top
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const SPHERE = new THREE.SphereGeometry(1, 12, 9);
  const cylGeos = {};
  const mats = {};

  const mat = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  function cylGeo(rt, rb, seg) {
    const k = `${rt}|${rb}|${seg}`;
    return cylGeos[k] || (cylGeos[k] = new THREE.CylinderGeometry(rt, rb, 1, seg));
  }
  function finish(m, parent, shadow = true) {
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // Boxes and cylinders are positioned by their bottom centre.
  function box(p, w, h, d, c, x, y, z, ry = 0) {
    const m = new THREE.Mesh(BOX, mat(c));
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = ry;
    return finish(m, p);
  }
  function cyl(p, rt, rb, h, c, x, y, z, seg = 14) {
    const m = new THREE.Mesh(cylGeo(rt, rb, seg), mat(c));
    m.scale.set(1, h, 1);
    m.position.set(x, y + h / 2, z);
    return finish(m, p);
  }
  function ball(p, r, c, x, y, z) {
    const m = new THREE.Mesh(SPHERE, mat(c));
    m.scale.set(r, r, r);
    m.position.set(x, y, z);
    return finish(m, p);
  }

  // Many identical parts (chairs, seated people) as one draw call.
  function instanced(p, geo, items) {
    if (!items.length) return;
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(geo, material, items.length);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(0, it.ry || 0, 0);
      o.scale.set(it.sx, it.sy, it.sz);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, col.set(it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    p.add(im);
  }

  const texCache = {};
  function checker(a, b, n) {
    const k = `${a}|${b}|${n}`;
    if (texCache[k]) return texCache[k];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    const s = 256 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * s, j * s, s, s);
    }
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    return (texCache[k] = new THREE.MeshLambertMaterial({ map: t }));
  }

  function banner(p, text, w, bg, fg, x, y, z) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = bg;
    c.fillRect(0, 0, 1024, 160);
    c.fillStyle = fg;
    let size = 72;
    c.font = `bold ${size}px system-ui, sans-serif`;
    while (c.measureText(text).width > 960 && size > 28) { size -= 4; c.font = `bold ${size}px system-ui, sans-serif`; }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 512, 84);
    const tex = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 1024), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    m.userData.disposable = true;
    p.add(m);
    return m;
  }

  // Raised surfaces the player stands on: {x0, x1, z0, z1, y}.
  let floors = [];

  /* ---------------- people ---------------- */

  const SKIN = ['#5a3825', '#6b4226', '#7d5233', '#8d5524', '#4a2c1d', '#a0663e'];
  const CLOTH = ['#e4572e', '#f3a712', '#29335c', '#669bbc', '#7fb069', '#8e44ad', '#ffffff', '#2a9d8f', '#e76f51', '#d62f6b', '#3d5a80'];
  const pickc = (arr, i) => arr[(i * 7 + 3) % arr.length];

  function figure(p, x, z, cloth, ry = 0, base = FY) {
    const g = new THREE.Group();
    box(g, 0.3, 0.5, 0.18, '#2b2b35', 0, 0, 0);
    cyl(g, 0.17, 0.21, 0.62, cloth, 0, 0.48, 0);
    ball(g, 0.14, '#6b4226', 0, 1.24, 0);
    g.position.set(x, base, z);
    g.rotation.y = ry;
    p.add(g);
    return g;
  }

  function seatedPeople(p, spots, palette) {
    const bodies = [], heads = [];
    spots.forEach((s, i) => {
      bodies.push({ x: s.x, y: s.y + 0.28, z: s.z, sx: 1, sy: 0.56, sz: 1, c: pickc(palette, i + (i >> 2)) });
      heads.push({ x: s.x, y: s.y + 0.69, z: s.z, sx: 0.13, sy: 0.13, sz: 0.13, c: pickc(SKIN, i * 3 + 1) });
    });
    instanced(p, cylGeo(0.15, 0.2, 10), bodies);
    instanced(p, SPHERE, heads);
  }

  /* ---------------- furniture ---------------- */

  function plasticChairs(p, spots, colors) {
    const seats = [], backs = [], bases = [];
    spots.forEach((s, i) => {
      const c = colors[i % colors.length];
      seats.push({ x: s.x, y: FY + 0.42, z: s.z, sx: 0.46, sy: 0.06, sz: 0.44, c });
      backs.push({ x: s.x, y: FY + 0.7, z: s.z + 0.2, sx: 0.46, sy: 0.5, sz: 0.06, c });
      bases.push({ x: s.x, y: FY + 0.2, z: s.z, sx: 0.4, sy: 0.4, sz: 0.38, c });
    });
    instanced(p, BOX, seats);
    instanced(p, BOX, backs);
    instanced(p, BOX, bases);
  }

  function pew(p, x, z, len, wood) {
    box(p, len, 0.08, 0.48, wood, x, FY + 0.4, z);
    box(p, len, 0.55, 0.08, wood, x, FY + 0.48, z + 0.24);
    box(p, 0.08, 0.95, 0.5, wood, x - len / 2, FY, z);
    box(p, 0.08, 0.95, 0.5, wood, x + len / 2, FY, z);
  }

  function fan(p, x, z) {
    cyl(p, 0.18, 0.22, 0.06, '#d9d9d9', x, FY, z);
    cyl(p, 0.03, 0.03, 1.2, '#cfcfcf', x, FY, z);
    const head = cyl(p, 0.26, 0.26, 0.08, '#7cc4e0', x, FY + 1.25, z);
    head.rotation.x = Math.PI / 2;
  }

  function plant(p, x, z) {
    cyl(p, 0.2, 0.15, 0.35, '#c87f4a', x, FY, z, 10);
    for (let i = 0; i < 3; i++) {
      const l = box(p, 0.08, 0.6, 0.18, '#3f8f4f', x + (i - 1) * 0.08, FY + 0.3, z);
      l.rotation.z = (i - 1) * 0.4;
    }
  }

  function speaker(p, x, y, z) {
    box(p, 0.5, 1.3, 0.42, '#1f1f24', x, y, z);
    cyl(p, 0.14, 0.14, 0.04, '#55555f', x, y + 0.85, z + 0.21).rotation.x = Math.PI / 2;
  }

  /* ---------------- outdoor items ---------------- */

  function generator(p, x, z) {
    box(p, 1.2, 0.8, 0.7, '#e0b53a', x, 0, z);
    box(p, 0.7, 0.3, 0.05, '#333', x, 0.3, z + 0.36);
    cyl(p, 0.05, 0.05, 0.3, '#555', x + 0.4, 0.8, z - 0.15);
  }

  function wheels(p, x, z, len, wid, r = 0.3) {
    for (const dx of [-len / 2 + 0.5, len / 2 - 0.5]) for (const dz of [-wid / 2, wid / 2]) {
      const w = cyl(p, r, r, 0.2, '#1b1b1b', x + dx, r, z + dz);
      w.rotation.x = Math.PI / 2;
      w.position.y = r;
    }
  }

  function bus(p, x, z) {
    box(p, 3.6, 1.3, 1.3, '#f2c230', x, 0.3, z);
    box(p, 3.0, 0.4, 1.32, '#3a4a5a', x + 0.1, 0.95, z);
    box(p, 3.62, 0.08, 1.32, '#1e7a46', x, 0.6, z);
    wheels(p, x, z, 3.6, 1.3);
  }

  function jeep(p, x, z) {
    box(p, 2.6, 0.7, 1.3, '#202228', x, 0.3, z);
    box(p, 1.6, 0.6, 1.2, '#202228', x - 0.2, 1.0, z);
    box(p, 1.5, 0.4, 1.22, '#5d7486', x - 0.2, 1.08, z);
    wheels(p, x, z, 2.6, 1.3, 0.32);
  }

  function jet(p, x, z) {
    const g = new THREE.Group();
    const body = cyl(g, 0.45, 0.45, 6, '#f4f6f8', 0, -3, 0, 16);
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 1.1, 0);
    ball(g, 0.45, '#f4f6f8', 3, 1.1, 0);
    box(g, 1.6, 0.1, 6, '#dfe5ea', -0.2, 1.0, 0);
    box(g, 0.7, 1.2, 0.1, '#1d3557', -2.7, 1.3, 0);
    box(g, 2.6, 0.08, 0.06, '#1d3557', 0, 1.25, 0.46);
    g.position.set(x, 0, z);
    g.rotation.y = 0.6;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    p.add(g);
  }

  function schoolBlock(p, x, z) {
    box(p, 4, 1.8, 2.2, '#f0e2c0', x, 0, z);
    box(p, 4.3, 0.2, 2.5, '#b5482f', x, 1.8, z);
    for (let i = 0; i < 4; i++) box(p, 0.5, 0.5, 0.05, '#9fd3ef', x - 1.4 + i * 0.95, 0.9, z + 1.11);
  }

  /* ---------------- rooms ---------------- */

  function shell(p, s) {
    const { w, d, h } = s;
    const t = 0.2;
    const floor = new THREE.Mesh(BOX, checker(s.floor[0], s.floor[1], s.tiles));
    floor.scale.set(w, FY, d);
    floor.position.set(0, FY / 2, 0);
    finish(floor, p, false);
    if (s.open) return;
    const inner = s.wallIn || s.wall;
    box(p, w, h, t, inner, 0, FY, -d / 2 + t / 2);
    box(p, t, h, d, inner, -w / 2 + t / 2, FY, 0);
    box(p, w + 0.02, 0.12, t + 0.02, s.wall, 0, FY + h, -d / 2 + t / 2);
    box(p, t + 0.02, 0.12, d + 0.02, s.wall, -w / 2 + t / 2, FY + h, 0);
    box(p, t, 0.5, d, s.wall, w / 2 - t / 2, FY, 0);
    box(p, w, 0.5, t, s.front || s.wall, 0, FY, d / 2 - t / 2);
    // door on the left wall
    box(p, 0.06, Math.min(2.1, h - 0.3), 0.95, '#5a3420', -w / 2 + t + 0.03, FY, d / 2 - 1.4);
  }

  function windowsBack(p, s, count, color = '#bfe3f5') {
    for (let i = 0; i < count; i++) {
      const x = -s.w / 2 + (s.w / (count + 1)) * (i + 1);
      box(p, Math.min(1.2, s.w / (count * 2)), Math.min(1.1, s.h * 0.3), 0.06, color, x, FY + s.h * 0.5, -s.d / 2 + 0.23);
    }
  }

  /* ---- your room, before ordination ---- */
  function buildHome(p, st) {
    const s = { w: 7, d: 6, h: 2.6, wall: '#2a9d8f', wallIn: '#22867a', floor: ['#ece6da', '#ddd5c5'], tiles: 8 };
    shell(p, s);
    windowsBack(p, s, 2);
    const bx = -s.w / 2 + 1.2, bz = -s.d / 2 + 1.4;
    box(p, 1.6, 0.35, 2.1, '#d9b98c', bx, FY, bz);
    box(p, 1.5, 0.2, 2.0, '#ffffff', bx, FY + 0.35, bz);
    box(p, 1.52, 0.08, 1.2, '#e4572e', bx, FY + 0.55, bz + 0.4);
    box(p, 0.9, 0.14, 0.4, '#f6efe6', bx, FY + 0.55, bz - 0.7);
    box(p, 1.3, 2.0, 0.6, '#c49a6c', s.w / 2 - 1.2, FY, -s.d / 2 + 0.5);
    box(p, 0.04, 1.8, 0.02, '#8a6440', s.w / 2 - 1.2, FY + 0.1, -s.d / 2 + 0.81);
    // study desk with an open Bible
    const dx = 0.6, dz = -s.d / 2 + 0.6;
    box(p, 1.3, 0.75, 0.6, '#d8b07e', dx, FY, dz);
    box(p, 0.36, 0.05, 0.26, '#2b1b12', dx - 0.2, FY + 0.75, dz);
    box(p, 0.32, 0.02, 0.22, '#f5f0e1', dx - 0.2, FY + 0.8, dz);
    cyl(p, 0.08, 0.1, 0.4, '#f3a712', dx + 0.4, FY + 0.75, dz);
    box(p, 0.5, 0.45, 0.5, '#e07a7a', dx, FY, dz + 0.65);
    box(p, 0.5, 0.5, 0.06, '#e07a7a', dx, FY + 0.45, dz + 0.9);
    fan(p, -0.6, -s.d / 2 + 0.6);
    plant(p, s.w / 2 - 0.5, 0.6);
    // TV corner
    box(p, 1.4, 0.45, 0.45, '#d8b07e', s.w / 2 - 1.1, FY, s.d / 2 - 0.6);
    box(p, 1.1, 0.65, 0.06, '#2e3440', s.w / 2 - 1.1, FY + 0.5, s.d / 2 - 0.6);
    box(p, 2.2, 0.02, 1.5, '#c94f4f', 0.3, FY, 0.6);
    if (st && st.stage >= 3) {
      // Bible school bookshelf
      const sx = -s.w / 2 + 0.3;
      box(p, 0.4, 1.8, 1.2, '#a57548', sx, FY, 0.9);
      const books = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#6d597a'];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) box(p, 0.3, 0.32, 0.14, books[(i + r) % 5], sx + 0.03, FY + 0.15 + r * 0.55, 0.45 + i * 0.2);
    }
    if (st && st.stage >= 4) {
      box(p, 0.9, 0.65, 0.05, '#c9a227', 2.0, FY + 1.4, -s.d / 2 + 0.22);
      box(p, 0.78, 0.53, 0.06, '#fffaf0', 2.0, FY + 1.46, -s.d / 2 + 0.22);
    }
    floors.push({ x0: -s.w / 2, x1: s.w / 2, z0: -s.d / 2, z1: s.d / 2, y: FY });
    // compound outside
    box(p, 2.4, 0.06, 1.4, '#c9c3b5', 1.5, 0, s.d / 2 + 1.2);
    return { w: s.w, d: s.d, h: s.h, spawn: { x: 0.2, z: 0.9, ry: 0.5 } };
  }

  /* ---- your church ---- */
  const SPECS = [
    { w: 8,  d: 7,  h: 2.6, wall: '#2a9d8f', wallIn: '#22867a', floor: ['#ece6da', '#ddd5c5'], tiles: 8,  seat: 'plastic', chair: ['#f5f5f5', '#d64545'], kind: 'house' },
    { w: 7,  d: 10, h: 3,   wall: '#3f7cc4', wallIn: '#356cae', floor: ['#c4c4c4', '#bcbcbc'], tiles: 6,  seat: 'plastic', chair: ['#1f5fbf'], kind: 'shop', front: '#8d99a6' },
    { w: 10, d: 9,  h: 3,   wall: '#efe0bf', wallIn: '#e6d3a9', floor: ['#c99a6b', '#bf8f60'], tiles: 10, seat: 'bench', wood: '#9c6b3c', kind: 'classroom' },
    { w: 16, d: 13, h: 4,   wall: '#98a4ad', wallIn: '#8a97a1', floor: ['#ababab', '#a3a3a3'], tiles: 8,  seat: 'plastic', chair: ['#ffffff', '#d64545'], kind: 'warehouse' },
    { w: 20, d: 16, h: 4.5, wall: '#f4ede2', wallIn: '#ece2d2', floor: ['#8e2a3a', '#862738'], tiles: 12, seat: 'pew', wood: '#8b5a2b', kind: 'auditorium' },
    { w: 22, d: 19, h: 6,   wall: '#ece3d0', wallIn: '#e2d6bd', floor: ['#f3f3f3', '#d9d9d9'], tiles: 14, seat: 'pew', wood: '#5c3a1e', kind: 'cathedral' },
    { w: 30, d: 24, h: 0,   open: true, floor: ['#dccfa8', '#d4c69c'], tiles: 10, seat: 'plastic', chair: ['#ffffff', '#f5f5f5'], kind: 'camp' },
  ];

  const ROBES = { pentecostal: '#7b1e3a', mission: '#5b2a86', baptist: '#1d3557', aladura: '#ffffff' };

  function buildChurch(p, st, opts = {}) {
    const s = SPECS[Math.min(st.venue, SPECS.length - 1)];
    const { w, d } = s;
    const h = s.h || 4;
    shell(p, s);
    const owned = st.owned || {};
    const white = st.ctype === 'aladura';
    const palette = white ? ['#ffffff', '#ffffff', '#ffffff', '#dbe9ff'] : CLOTH;

    // altar platform
    const pd = Math.max(1.3, Math.min(3.6, d * 0.2));
    const backZ = -d / 2 + 0.2;
    const house = s.kind === 'house';
    const py = house ? FY : FY + 0.3;
    floors.push({ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, y: FY });
    const platW = w * (s.open ? 0.5 : 0.7);
    if (!house) floors.push({ x0: -platW / 2, x1: platW / 2, z0: backZ, z1: backZ + pd, y: FY + 0.3 });
    if (!house) box(p, w * (s.open ? 0.5 : 0.7), 0.3, pd, s.kind === 'cathedral' || s.kind === 'auditorium' ? '#7a1f2b' : '#b07a4a', 0, FY, backZ + pd / 2);
    // pulpit
    const pz = backZ + pd * 0.55;
    box(p, 0.75, 1.05, 0.5, house ? '#c49a6c' : '#7a4a26', 0, py, pz);
    box(p, 0.8, 0.06, 0.55, '#5a3420', 0, py + 1.05, pz);
    if (!opts.own) figure(p, 0, pz - 0.45, '#1d2b53', 0, py);

    // back wall: cross, banner or blackboard, windows
    if (!s.open) {
      const cy = FY + h * 0.42;
      box(p, 0.14, 1.4, 0.06, '#d4a017', 0, cy, backZ + 0.04);
      box(p, 0.8, 0.14, 0.06, '#d4a017', 0, cy + 0.85, backZ + 0.04);
      if (s.kind === 'classroom') box(p, 3, 1.1, 0.05, '#2f4f3a', -w / 4 - 0.5, FY + 1.1, backZ + 0.04);
      if (!house) banner(p, st.church, Math.min(w * 0.55, 9), '#ffffff', '#1d3557', 0, FY + h - 0.45, backZ + 0.05);
      if (s.kind !== 'house' && s.kind !== 'classroom') windowsBack(p, s, s.kind === 'cathedral' ? 0 : 4);
      if (s.kind === 'cathedral') {
        const glass = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5'];
        for (let i = 0; i < 5; i++) box(p, 0.06, 2.4, 1.1, glass[i], -w / 2 + 0.23, FY + 1.8, -d / 2 + 2.5 + i * 3);
        for (let i = 0; i < 4; i++) {
          cyl(p, 0.35, 0.35, h, '#e8dcc4', -w / 2 + 2, FY, -d / 2 + 4 + i * 4);
          cyl(p, 0.35, 0.35, 0.5, '#e8dcc4', w / 2 - 2, FY, -d / 2 + 4 + i * 4);
        }
      }
      if (s.kind === 'warehouse') for (let i = 0; i < 3; i++) box(p, 0.25, h, 0.25, '#6c7a86', w / 2 - 3, FY, -d / 2 + 3 + i * 4);
      if (s.kind === 'shop') for (let i = 0; i < 4; i++) box(p, w - 0.1, 0.03, 0.22, '#6f7b88', 0, FY + 0.12 + i * 0.1, d / 2 - 0.1);
    } else {
      // camp ground: stage backdrop, canopy poles with flags
      box(p, w * 0.45, 3.2, 0.3, '#1d3557', 0, FY, backZ);
      banner(p, st.church, w * 0.4, '#1d3557', '#f4c542', 0, FY + 2.2, backZ + 0.17);
      box(p, 0.16, 1.6, 0.06, '#f4c542', 0, FY + 0.5, backZ + 0.17);
      box(p, 0.9, 0.16, 0.06, '#f4c542', 0, FY + 1.5, backZ + 0.17);
      const flags = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d'];
      for (let i = 0; i < 8; i++) {
        const x = -w / 2 + 1 + (i % 4) * ((w - 2) / 3);
        const z = i < 4 ? -d / 2 + pd + 1.5 : d / 2 - 1;
        cyl(p, 0.06, 0.06, 3.2, '#cfcfcf', x, FY, z, 8);
        box(p, 0.7, 0.45, 0.04, flags[i % 4], x + 0.36, FY + 2.7, z);
      }
    }
    if (house) {
      box(p, 2.2, 0.45, 0.8, '#7a5c99', -w / 2 + 1.5, FY, -d / 2 + 0.7);
      box(p, 2.2, 0.55, 0.2, '#6a4f86', -w / 2 + 1.5, FY + 0.45, -d / 2 + 0.4);
      box(p, 1.1, 0.65, 0.06, '#2e3440', w / 2 - 1.2, FY + 0.7, -d / 2 + 0.25);
      box(p, 1.4, 0.45, 0.4, '#d8b07e', w / 2 - 1.2, FY, -d / 2 + 0.45);
      plant(p, w / 2 - 0.5, d / 2 - 0.7);
    }

    // choir
    const singers = Math.min(18, 2 + (st.choir || 0) * 3);
    const robe = ROBES[st.ctype] || '#7b1e3a';
    const cx0 = house ? -w / 2 + 0.8 : -w * 0.3;
    for (let i = 0; i < singers; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      figure(p, cx0 + row * 0.5, backZ + 0.5 + col * 0.45, robe, Math.PI / 2 - 0.4, py);
    }
    if (owned.keyboard) {
      const kx = w * (house ? 0.3 : 0.25);
      box(p, 1.1, 0.75, 0.35, '#2b2b2b', kx, py, backZ + 0.8);
      box(p, 1.0, 0.05, 0.3, '#f5f5f5', kx, py + 0.75, backZ + 0.8);
      cyl(p, 0.28, 0.28, 0.35, '#c0392b', kx + 1.0, py, backZ + 0.7);
      cyl(p, 0.2, 0.2, 0.3, '#c0392b', kx + 1.5, py + 0.2, backZ + 1.0);
    }
    if (owned.pa) {
      speaker(p, -w * 0.33 - 0.4, py, backZ + pd - 0.3);
      speaker(p, w * 0.33 + 0.4, py, backZ + pd - 0.3);
    }
    if (owned.livestream) {
      const lz = d / 2 - 1.2;
      for (const a of [0, 2.1, 4.2]) {
        const leg = box(p, 0.04, 1.3, 0.04, '#333', Math.sin(a) * 0.2 + 0.9, FY, lz + Math.cos(a) * 0.2);
        leg.rotation.x = Math.cos(a) * 0.15;
      }
      box(p, 0.35, 0.25, 0.45, '#111', 0.9, FY + 1.3, lz);
    }

    // seating: front rows first, aisle down the middle
    const startZ = backZ + pd + (house ? 0.6 : 1.1);
    const endZ = d / 2 - (s.open ? 1.6 : 0.9);
    const spots = [];
    const colGap = s.seat === 'plastic' ? 0.68 : 0.6;
    const rowGap = s.seat === 'plastic' ? 0.9 : 1.05;
    const margin = house ? 0.9 : 1.0;
    const aisle = house ? 0.3 : 0.6;
    const chairs = [];
    for (let z = startZ; z <= endZ; z += rowGap) {
      const row = [];
      for (let x = -w / 2 + margin; x <= w / 2 - margin + 0.01; x += colGap) {
        if (Math.abs(x) < aisle) continue;
        row.push({ x, z });
      }
      if (s.seat === 'pew' || s.seat === 'bench') {
        for (const side of [-1, 1]) {
          const xs = row.filter((r) => Math.sign(r.x) === side).map((r) => r.x);
          if (xs.length) {
            const a = Math.min(...xs), b = Math.max(...xs);
            pew(p, (a + b) / 2, z, b - a + 0.5, s.wood);
          }
        }
      }
      chairs.push(...row);
    }
    if (s.seat === 'plastic') {
      const colors = owned.chairs && st.venue < 6 ? ['#6b3fa0'] : s.chair;
      plasticChairs(p, chairs, colors);
    }
    const cap = [20, 50, 150, 500, 2500, 9000, 30000][Math.min(st.venue, 6)];
    const fill = Math.min(1, (st.members || 0) / cap);
    const n = Math.min(chairs.length, Math.max(Math.min(st.members || 0, chairs.length), Math.round(chairs.length * fill)));
    // Fill the front rows first, centre seats first within a row.
    const order = chairs.slice().sort((a, b) => (a.z - b.z) || (Math.abs(a.x) - Math.abs(b.x)));
    // Worshippers and visitors get the first front seat; everyone else fills the rest.
    const mySeat = ['worshipper', 'visitor'].includes(opts.role) ? order[0] : null;
    for (let i = mySeat ? 1 : 0; i < n; i++) spots.push({ x: order[i].x, y: FY + 0.45, z: order[i].z });
    seatedPeople(p, spots, palette);

    if (!s.open && s.kind !== 'cathedral' && s.kind !== 'auditorium') {
      fan(p, w / 2 - 0.7, startZ);
      fan(p, -w / 2 + 0.7, startZ + 1.5);
    }

    // outside the building
    const ox = w / 2 + 2.2;
    if (owned.generator) generator(p, ox, -d / 4);
    if (owned.bus) bus(p, ox + 0.8, d / 2 + 2.2);
    if (owned.jeep) jeep(p, -w / 4, d / 2 + 2.2);
    if (owned.school) schoolBlock(p, -w / 2 - 3.5, -d / 4);
    if (owned.jet) jet(p, ox + 4, -d / 2 - 2);

    // Your post in the church
    let spawn = { x: 0, z: startZ + 1, ry: Math.PI };
    switch (opts.role) {
      case 'pastor': spawn = { x: 0, z: pz - 0.45, ry: 0 }; break;
      case 'worshipper': case 'visitor': spawn = { x: mySeat.x, z: mySeat.z, ry: Math.PI, mode: 'sit' }; break;
      case 'usher': spawn = { x: 0, z: startZ + 1.6, ry: 0 }; break;
      case 'choir': spawn = { x: cx0 + 1.7, z: backZ + 0.9, ry: Math.PI / 2 - 0.4 }; break;
      case 'prayer': spawn = { x: 0.9, z: backZ + pd + 0.5, ry: Math.PI, mode: 'kneel' }; break;
      case 'security': {
        const gx = w / 2 + 1.7, gz = d / 2 + 1.3;
        box(p, 1.1, 2.0, 1.1, '#e5e7eb', gx + 1.2, 0, gz);
        box(p, 1.3, 0.12, 1.3, '#1f2937', gx + 1.2, 2.0, gz);
        box(p, 0.7, 0.5, 0.05, '#9fd3ef', gx + 1.2, 1.1, gz + 0.56);
        box(p, 2.6, 0.1, 0.1, '#e63946', gx - 1.4, 0.95, gz);
        box(p, 0.15, 1.0, 0.15, '#1f2937', gx - 0.05, 0, gz);
        spawn = { x: gx, z: gz + 1.0, ry: 0 };
        break;
      }
      case 'media': {
        const mx = w / 4 + 0.5, mz = Math.min(endZ + 0.4, d / 2 - 0.5);
        box(p, 1.8, 0.8, 0.6, '#1f2937', mx, FY, mz);
        box(p, 0.5, 0.04, 0.35, '#475569', mx - 0.4, FY + 0.8, mz);
        box(p, 0.5, 0.35, 0.03, '#0f172a', mx - 0.4, FY + 0.82, mz - 0.15);
        box(p, 0.6, 0.06, 0.4, '#334155', mx + 0.4, FY + 0.8, mz);
        spawn = { x: mx, z: mz + 0.7, ry: Math.PI };
        break;
      }
      case 'hospitality': {
        const kx = -w / 2 - 2.6, kz = d / 4;
        box(p, 2.6, 1.7, 2.2, '#f5e6c8', kx, 0, kz);
        box(p, 2.9, 0.15, 2.5, '#b5482f', kx, 1.7, kz);
        cyl(p, 0.35, 0.3, 0.45, '#9ca3af', kx + 0.6, 0, kz + 1.6);
        cyl(p, 0.3, 0.25, 0.4, '#6b7280', kx - 0.4, 0, kz + 1.6);
        box(p, 0.8, 0.2, 0.5, '#4b5563', kx + 0.6, 0.45, kz + 1.6);
        spawn = { x: kx + 0.1, z: kz + 2.3, ry: Math.PI };
        break;
      }
      case 'children': {
        const tx = w / 2 + 3, tz = d / 4 - 0.5;
        for (const [dx, dz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) box(p, 0.08, 2.1, 0.08, '#d1d5db', tx + dx, 0, tz + dz);
        box(p, 3, 0.08, 2.6, '#fde047', tx, 2.1, tz);
        for (let i = 0; i < 6; i++) {
          const kid = figure(p, tx - 0.9 + (i % 3) * 0.9, tz + (i < 3 ? -0.3 : 0.5), pickc(CLOTH, i + 2), Math.PI, 0);
          kid.scale.set(0.62, 0.62, 0.62);
        }
        spawn = { x: tx, z: tz - 1.0, ry: 0 };
        break;
      }
      default: break;
    }
    return { w, d, h, spawn };
  }

  /* ---------------- scene management ---------------- */

  let world = null;
  let sig = '';
  let size = 10;
  let target = new THREE.Vector3();

  function dispose(o) {
    o.traverse((c) => {
      if (c.isInstancedMesh) { c.material.dispose(); c.dispose && c.dispose(); }
      if (c.userData.disposable) { c.geometry.dispose(); c.material.map.dispose(); c.material.dispose(); }
    });
  }

  function rebuild(st) {
    if (world) { scene.remove(world); dispose(world); }
    world = new THREE.Group();
    floors = [];
    const own = st && st.stage >= 5 && st.role === 'minister';
    const attend = st && !own && st.view === 'church';
    let dims;
    if (own) dims = buildChurch(world, st, { own: true, role: 'pastor' });
    else if (attend) dims = buildChurch(world, ATTENDED(st), { role: st.role === 'minister' ? 'worshipper' : st.role });
    else dims = buildHome(world, st);
    const owned = own ? (st.owned || {}) : {};
    const outside = attend && ['security', 'hospitality', 'children'].includes(st.role);
    const extra = owned.jet || owned.school ? 6 : Object.keys(owned).length || outside || attend ? 3.5 : 1.5;
    size = Math.max(dims.w, dims.d) + extra;
    const R = size * 0.78 + 3;
    groundR = R - 0.8;
    const ground = new THREE.Mesh(cylGeo(R, R + 0.4, 56), mat('#c6d6a8'));
    ground.scale.set(1, 0.8, 1);
    ground.position.y = -0.4;
    finish(ground, world, false);
    const rim = new THREE.Mesh(cylGeo(R + 0.9, R + 1.1, 56), mat('#aec28e'));
    rim.scale.set(1, 0.7, 1);
    rim.position.y = -0.52;
    finish(rim, world, false);
    scene.add(world);
    target.set(0, (dims.h || 2) * 0.12, 0);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -size;
    sc.right = sc.top = size;
    sc.near = 1;
    sc.far = size * 6;
    sc.updateProjectionMatrix();
    sun.position.set(size * 0.6, size * 1.6, size * 0.9);
    sun.target.position.set(0, 0, 0);
    placeAvatar(st, dims.spawn);
    if (avatar && avatar.visible) target.set(me.x, me.y + 0.6, me.z);
  }

  // The church you attend (for every role except a pastor in their own church).
  function ATTENDED(st) {
    return { venue: 3, members: 380, choir: 3, ctype: st.ctype, church: st.church, owned: { pa: 1, keyboard: 1, generator: 1, livestream: 1 } };
  }

  function signature(st) {
    if (!st) return 'start';
    const own = st.stage >= 5 && st.role === 'minister';
    if (!own && st.view === 'church') return `attend|${st.role}|${st.ctype}|${st.church}`;
    if (!own) return `home|${st.stage >= 3}|${st.stage >= 4}|${st.role}`;
    const cap = [20, 50, 150, 500, 2500, 9000, 30000][Math.min(st.venue, 6)];
    const bucket = st.members < 40 ? st.members : Math.round((st.members / cap) * 40);
    return ['church', st.venue, st.ctype, st.choir, Object.keys(st.owned || {}).sort().join(','), bucket, st.church].join('|');
  }

  /* ---------------- your character ---------------- */

  const ROLE_CLOTH = {
    security: '#1f2937', usher: '#f8fafc', media: '#2563eb', hospitality: '#f97316', children: '#22c55e',
    prayer: '#ffffff', worshipper: '#e4572e', visitor: '#64748b', minister: '#1d3557',
  };
  let avatar = null;
  let avatarKey = '';
  let groundR = 8;
  const me = { x: 0, z: 0, y: 0, vy: 0, ry: 0, mode: 'stand', wave: 0, phase: 0 };
  const input = { forward: false, back: false, left: false, right: false, run: false };
  let spawnKey = '';

  function limb(parent, w, h, d, color, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    box(pivot, w, h, d, color, 0, -h, 0);
    parent.add(pivot);
    return pivot;
  }

  function nameTag(text) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#000';
    c.fillRect(6, 10, 244, 48);
    c.fillStyle = '#fde047';
    c.fillRect(0, 4, 244, 48);
    c.strokeStyle = '#000';
    c.lineWidth = 4;
    c.strokeRect(2, 6, 240, 44);
    c.fillStyle = '#000';
    c.font = 'bold 28px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text.slice(0, 14), 122, 30);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sp.scale.set(1.3, 0.33, 1);
    sp.renderOrder = 10;
    return sp;
  }

  function makeAvatar(st) {
    const robe = st.role === 'choir' ? (ROBES[st.ctype] || '#7b1e3a') : null;
    const cloth = robe || (st.stage >= 5 && st.role === 'minister' ? '#1d2b53' : ROLE_CLOTH[st.role] || '#e4572e');
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const legL = limb(body, 0.13, 0.5, 0.15, '#2b2b35', -0.09, 0.52);
    const legR = limb(body, 0.13, 0.5, 0.15, '#2b2b35', 0.09, 0.52);
    box(body, 0.4, 0.56, 0.24, cloth, 0, 0.5, 0);
    if (st.role === 'security') box(body, 0.42, 0.3, 0.26, '#facc15', 0, 0.72, 0);
    if (st.role === 'hospitality') box(body, 0.3, 0.4, 0.02, '#ffffff', 0, 0.55, 0.13);
    const armL = limb(body, 0.1, 0.5, 0.12, cloth, -0.26, 1.04);
    const armR = limb(body, 0.1, 0.5, 0.12, cloth, 0.26, 1.04);
    ball(body, 0.16, '#6b4226', 0, 1.25, 0);
    const hair = ball(body, 0.165, '#1b1b1b', 0, 1.3, -0.01);
    hair.scale.set(0.165, 0.11, 0.165);
    box(body, 0.05, 0.05, 0.05, '#4a2c1d', 0, 1.22, 0.15);
    const tag = nameTag(st.name || 'You');
    tag.position.set(0, 1.85, 0);
    g.add(tag);
    const ring = new THREE.Mesh(cylGeo(0.42, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.85 }));
    ring.scale.set(1, 0.02, 1);
    ring.position.y = 0.02;
    g.add(ring);
    g.userData = { body, legL, legR, armL, armR, ring };
    return g;
  }

  function placeAvatar(st, spawn) {
    if (!st) { if (avatar) avatar.visible = false; return; }
    const key = [st.role, st.ctype, st.stage >= 5, st.name].join('|');
    if (key !== avatarKey) {
      if (avatar) { scene.remove(avatar); avatar.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); }
      avatar = makeAvatar(st);
      scene.add(avatar);
      avatarKey = key;
    }
    avatar.visible = true;
    // Keep your position across small rebuilds; respawn at your post when the place changes.
    const sk = sig.split('|').slice(0, 3).join('|');
    if (sk !== spawnKey && spawn) {
      spawnKey = sk;
      me.x = spawn.x; me.z = spawn.z; me.ry = spawn.ry || 0; me.mode = spawn.mode || 'stand';
      me.vy = 0; me.y = floorAt(me.x, me.z);
    }
  }

  function floorAt(x, z) {
    let y = 0;
    for (const f of floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) y = Math.max(y, f.y);
    return y;
  }

  function act(name) {
    if (!avatar || !avatar.visible) return;
    if (name === 'jump' && me.y <= floorAt(me.x, me.z) + 0.001) { me.mode = 'stand'; me.vy = 4.6; }
    if (name === 'sit') me.mode = me.mode === 'sit' ? 'stand' : 'sit';
    if (name === 'kneel') me.mode = me.mode === 'kneel' ? 'stand' : 'kneel';
    if (name === 'wave') me.wave = 2;
  }

  function stepAvatar(dt, t) {
    if (!avatar || !avatar.visible) return;
    const u = avatar.userData;
    // Camera-relative movement
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let mz = (input.back ? 1 : 0) - (input.forward ? 1 : 0);
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      if (me.mode !== 'stand') me.mode = 'stand';
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const c = Math.cos(theta), s2 = Math.sin(theta);
      // forward on screen = away from the camera
      const wx = mx * c + mz * s2;
      const wz = -mx * s2 + mz * c;
      const speed = input.run ? 5 : 2.6;
      let nx = me.x + wx * speed * dt, nz = me.z + wz * speed * dt;
      const r = Math.hypot(nx, nz);
      if (r > groundR) { nx *= groundR / r; nz *= groundR / r; }
      // Step up onto platforms up to 0.35 high; anything higher blocks you.
      if (floorAt(nx, nz) - me.y <= 0.35) { me.x = nx; me.z = nz; }
      me.ry = Math.atan2(wx, wz);
      me.phase += dt * speed * 3.2;
    }
    // Gravity and jumping
    const ground = floorAt(me.x, me.z);
    me.vy -= 12 * dt;
    me.y += me.vy * dt;
    if (me.y <= ground) { me.y = ground; me.vy = 0; }
    const airborne = me.y > ground + 0.01;
    // Pose
    const swing = moving && !airborne ? Math.sin(me.phase) * 0.7 : 0;
    let legX = swing, armX = -swing, armZr = 0, armZl = 0, drop = 0;
    if (airborne) { legX = 0.4; armX = -2.6; }
    if (me.mode === 'sit') { legX = -1.45; armX = -0.4; drop = -0.24; }
    if (me.mode === 'kneel') { legX = 1.5; armX = -1.1; drop = -0.24; }
    u.legL.rotation.x = legX;
    u.legR.rotation.x = me.mode === 'stand' ? -legX : legX;
    u.armL.rotation.x = armX;
    u.armR.rotation.x = me.mode === 'stand' && !airborne ? -armX : armX;
    if (me.wave > 0) {
      me.wave -= dt;
      u.armR.rotation.x = 0;
      armZr = 2.7 + Math.sin(t / 90) * 0.35;
    }
    u.armR.rotation.z = armZr;
    u.armL.rotation.z = armZl;
    u.body.position.y = drop;
    u.ring.position.y = ground - me.y + 0.02;
    avatar.position.set(me.x, me.y, me.z);
    avatar.rotation.y = me.ry;
    // Follow camera: stay close to your character
    target.x += (me.x - target.x) * 0.08;
    target.y += (me.y + 0.6 - target.y) * 0.08;
    target.z += (me.z - target.z) * 0.08;
  }

  const KEYS = {
    KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  };
  const typing = () => {
    const el = document.activeElement;
    return el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  };
  const blocked = () => typing() || document.querySelector('.modal:not(.hidden)') || document.querySelector('#game.hidden');
  window.addEventListener('keydown', (e) => {
    if (blocked() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
    if (e.key === 'Shift') input.run = true;
    if (e.repeat) return;
    if (e.code === 'Space') { act('jump'); e.preventDefault(); }
    if (e.code === 'KeyC') act('sit');
    if (e.code === 'KeyP') act('kneel');
    if (e.code === 'KeyE') act('wave');
    if (e.code === 'KeyQ') userTheta += 0.35;
    if (e.code === 'KeyR') userTheta -= 0.35;
  });
  window.addEventListener('keyup', (e) => {
    if (KEYS[e.code]) input[KEYS[e.code]] = false;
    if (e.key === 'Shift') input.run = false;
  });
  window.addEventListener('blur', () => { for (const k in input) input[k] = false; });

  /* ---------------- camera, layout, input ---------------- */

  let theta = 0.7;
  let userTheta = 0;
  let dragging = false;
  let lastX = 0;
  let zoom = 1;

  function layout() {
    const W = window.innerWidth, H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    let top = 0, bottom = H, left = 0, right = W;
    const hud = document.querySelector('#game:not(.hidden) .hud');
    const panel = document.querySelector('#game:not(.hidden) .panel');
    const card = document.querySelector('.screen:not(.hidden) .start-card');
    const head = document.querySelector('.screen:not(.hidden) .brand');
    const nav = document.querySelector('#game:not(.hidden) .nav');
    if (hud && panel) {
      const hr = hud.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      if (pr.left > W * 0.5) {
        // desktop: sidebar on the left, panel on the right, HUD on top
        right = pr.left;
        left = nav ? nav.getBoundingClientRect().right : 0;
        top = hr.bottom;
      } else {
        top = hr.bottom;
        bottom = pr.top;
      }
    } else if (card) {
      const cr = card.getBoundingClientRect();
      top = head ? head.getBoundingClientRect().bottom : 0;
      bottom = Math.min(H, cr.top + cr.height * 0.35);
    }
    const aw = Math.max(80, right - left), ah = Math.max(80, bottom - top);
    camera.setViewOffset(W, H, W / 2 - (left + right) / 2, H / 2 - (top + bottom) / 2, W, H);
    // The room is wider than it is tall on screen, so height can be stretched further.
    zoom = Math.max(0.3, Math.min(aw / W * 1.05, ah / H * 1.75));
    if (card) zoom = Math.min(zoom, 0.62, (W / H) * 1.15);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    userTheta -= (e.clientX - lastX) * 0.008;
    lastX = e.clientX;
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  window.addEventListener('resize', layout);

  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || t - last < 33) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    theta = 0.7 + userTheta + Math.sin(t / 7000) * 0.1;
    stepAvatar(dt, t);
    const following = avatar && avatar.visible;
    const dist = following ? Math.min(15, Math.max(9, size * 0.8 + 4)) : size * 1.55 + 5;
    camera.position.set(target.x + Math.sin(theta) * dist * 0.78, target.y + dist * 0.82, target.z + Math.cos(theta) * dist * 0.78);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  window.World = {
    update(st) {
      const s = signature(st);
      if (s !== sig) { sig = s; rebuild(st); }
    },
    // Re-measure once the intro animation has settled.
    setMode() { requestAnimationFrame(layout); setTimeout(layout, 1000); },
    layout,
    setMove(dir, on) { if (dir in input) input[dir] = on; },
    act,
    turn(d) { userTheta += d; },
  };

  rebuild(null);
  layout();
  requestAnimationFrame(frame);
})();
