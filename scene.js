'use strict';

/* =========================================================================
   3D world: a low-poly "dollhouse" view of your room (before ordination)
   or your church (after). Built from primitives so it stays light on
   cheap phones. Exposes window.World = { update(state), setMode(id), layout() }.
   ========================================================================= */

(function () {
  const NOOP = { update() {}, setMode() {}, layout() {} };
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
    if (st) figure(p, 0.2, 0.9, '#2563eb', 0.5);
    // compound outside
    box(p, 2.4, 0.06, 1.4, '#c9c3b5', 1.5, 0, s.d / 2 + 1.2);
    return { w: s.w, d: s.d, h: s.h };
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

  function buildChurch(p, st) {
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
    if (!house) box(p, w * (s.open ? 0.5 : 0.7), 0.3, pd, s.kind === 'cathedral' || s.kind === 'auditorium' ? '#7a1f2b' : '#b07a4a', 0, FY, backZ + pd / 2);
    // pulpit
    const pz = backZ + pd * 0.55;
    box(p, 0.75, 1.05, 0.5, house ? '#c49a6c' : '#7a4a26', 0, py, pz);
    box(p, 0.8, 0.06, 0.55, '#5a3420', 0, py + 1.05, pz);
    figure(p, 0, pz - 0.45, '#1d2b53', 0, py);

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
    for (let i = 0; i < n; i++) spots.push({ x: order[i].x, y: FY + 0.45, z: order[i].z });
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
    return { w, d, h };
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
    const pastor = st && st.stage >= 5;
    const dims = pastor ? buildChurch(world, st) : buildHome(world, st);
    const extra = pastor && ((st.owned || {}).jet || (st.owned || {}).school) ? 6 : pastor && Object.keys(st.owned || {}).length ? 3 : 1.5;
    size = Math.max(dims.w, dims.d) + extra;
    const R = size * 0.78 + 3;
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
  }

  function signature(st) {
    if (!st) return 'start';
    if (st.stage < 5) return `home|${st.stage >= 3}|${st.stage >= 4}`;
    const cap = [20, 50, 150, 500, 2500, 9000, 30000][Math.min(st.venue, 6)];
    const bucket = st.members < 40 ? st.members : Math.round((st.members / cap) * 40);
    return ['church', st.venue, st.ctype, st.choir, Object.keys(st.owned || {}).sort().join(','), bucket, st.church].join('|');
  }

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
    if (hud && panel) {
      const hr = hud.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      if (pr.left > W * 0.35) { right = pr.left; top = 0; } else { top = hr.bottom; bottom = pr.top; }
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
    last = t;
    theta = 0.7 + userTheta + Math.sin(t / 7000) * 0.1;
    const dist = size * 1.55 + 5;
    camera.position.set(target.x + Math.sin(theta) * dist * 0.78, target.y + dist * 0.82, target.z + Math.cos(theta) * dist * 0.78);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  window.World = {
    update(st) {
      const s = signature(st);
      if (s !== sig) { sig = s; rebuild(st); }
    },
    setMode() { requestAnimationFrame(layout); },
    layout,
  };

  rebuild(null);
  layout();
  requestAnimationFrame(frame);
})();
