// The furniture of No. 14 (src/game/life.js FURNITURE): every slot is built from its current
// model, so you can click a piece and replace or upgrade it. The sofa set, the old TV and the
// foam mattress are there from the start.
// Living room: x 11.1–18.9, bedroom: x 19.1–24.9, both z 18.1–26.9, floor at y 0.3.
// createDecor(ctx, {physics, seats, interactables}) → { root, set(home), slotOf(object), update(dt) }.
import * as THREE from 'three';
import { HOUSE } from './layout.js';
import { FURNITURE, variantOf } from '../game/life.js';

const Y = HOUSE.floor;
const mats = new Map();
const m = (color, o = {}) => {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));
  return mats.get(key);
};

/** Builders: each returns {group, colliders: [x0, z0, x1, z1, h][], seats: [x, y, z, rotY][], spin?} */
const ITEMS = {
  sofa(g, v) {
    const color = { maroon: '#6b2d3a', lshape: '#7d838a', leather: '#5a3a24' }[v] || '#6b2d3a';
    const cushion = { maroon: '#7c3a47', lshape: '#9aa0a6', leather: '#6b4630' }[v] || '#7c3a47';
    const shine = v === 'leather' ? { roughness: 0.35 } : {};
    const seats = [];
    const colliders = [];
    // three-seater on the west wall facing the room, two singles (or a long piece for the L-shape)
    const set = v === 'lshape'
      ? [[HOUSE.x0 + 0.55, 22.5, Math.PI / 2, 3], [13.9, 19.0, 0, 2]]
      : [[HOUSE.x0 + 0.55, 22.5, Math.PI / 2, 3], [13.6, 19.0, 0, 1], [13.6, 26.1, Math.PI, 1]];
    for (const [x, z, ry, n] of set) sofaPiece(g, x, z, ry, n, color, cushion, shine, seats, colliders);
    return { seats, colliders };
  },
  chairs(g, v) {
    const out = { colliders: [[16.3, 18.6, 18.0, 19.6, 0.8]], seats: [] };
    box(g, 17.15, Y + 0.45, 19.1, 0.6, 0.04, 0.6, '#f2f2ee');
    for (const [x, z] of [[16.85, 18.85], [17.45, 18.85], [16.85, 19.35], [17.45, 19.35]]) box(g, x, Y + 0.22, z, 0.04, 0.44, 0.04, '#f2f2ee');
    for (const [x, ry] of [[16.55, Math.PI / 2], [17.75, -Math.PI / 2]]) { chair(g, x, 19.1, ry, v === 'cane' ? '#b08850' : '#1d4ed8', v === 'cane'); out.seats.push([x, Y + 0.45, 19.1, ry]); }
    return out;
  },
  plants(g, v) {
    const big = v === 'big' ? 1.6 : 1;
    for (const [x, z] of [[18.55, 26.55], [11.5, 26.55]]) {
      g.add(mesh(new THREE.CylinderGeometry(0.2 * big, 0.15 * big, 0.36, 12), '#b45309', x, Y + 0.18, z));
      for (let i = 0; i < 6; i++) {
        const leaf = mesh(new THREE.SphereGeometry(0.18, 8, 6), '#2f7d32', x + Math.sin(i) * 0.16 * big, Y + 0.55 * big + (i % 3) * 0.16 * big, z + Math.cos(i * 1.7) * 0.16 * big);
        leaf.scale.set(big, 1.6 * big, 0.6 * big);
        leaf.rotation.y = i;
        g.add(leaf);
      }
    }
    return { colliders: [[18.3, 26.3, 18.85, 26.85, 0.8], [11.2, 26.3, 11.8, 26.85, 0.8]] };
  },
  altar(g, v) {
    box(g, 11.9, Y + 0.4, 18.45, 1.1, 0.8, 0.5, '#5b3a22');
    box(g, 11.9, Y + 0.81, 18.45, 1.14, 0.02, 0.54, '#f8fafc');
    box(g, 11.9, Y + 0.9, 18.45, 0.32, 0.16, 0.24, '#7f1d1d'); // Bible
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), '#fef3c7', 11.55, Y + 0.93, 18.45));
    const flame = mesh(new THREE.SphereGeometry(0.03, 6, 4), '#ffb02e', 11.55, Y + 1.07, 18.45, { emissive: '#ff9f1c', emissiveIntensity: 2 });
    flame.scale.y = 1.8;
    g.add(flame);
    box(g, 11.9, Y + 1.75, 18.13, 0.08, 0.7, 0.04, '#a16207'); // cross
    box(g, 11.9, Y + 1.9, 18.13, 0.4, 0.08, 0.04, '#a16207');
    if (v === 'altar') {
      const c = canvasTex(256, 96, (x) => { x.fillStyle = '#7f1d1d'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#facc15'; x.font = '700 30px Georgia, serif'; x.textAlign = 'center'; x.fillText('JESUS IS LORD', 128, 58); });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshStandardMaterial({ map: c }));
      b.position.set(11.9, Y + 2.5, 18.13); g.add(b);
    }
    return { colliders: [[11.3, 18.15, 12.5, 18.75, 0.9]], flicker: flame };
  },
  picture(g, v) {
    box(g, 18.88, Y + 1.85, 25.4, 0.04, 0.7, 1.0, '#a16207');
    const c = canvasTex(256, 180, (x) => {
      x.fillStyle = '#fef9c3'; x.fillRect(0, 0, 256, 180);
      x.fillStyle = '#1e3a8a'; x.textAlign = 'center';
      if (v === 'house') {
        x.font = 'italic 700 22px Georgia, serif'; x.fillText('As for me and', 128, 66); x.fillText('my house,', 128, 96);
        x.font = 'italic 18px Georgia, serif'; x.fillText('we will serve the LORD.', 128, 128);
        x.font = '14px Georgia, serif'; x.fillText('Joshua 24:15', 128, 160);
        return;
      }
      x.font = 'italic 700 26px Georgia, serif'; x.fillText('The LORD is my', 128, 70); x.fillText('shepherd;', 128, 102);
      x.font = 'italic 20px Georgia, serif'; x.fillText('I shall not want.', 128, 134);
      x.font = '14px Georgia, serif'; x.fillText('Psalm 23:1', 128, 162);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), new THREE.MeshStandardMaterial({ map: c, roughness: 0.8 }));
    p.position.set(18.855, Y + 1.85, 25.4);
    p.rotation.y = -Math.PI / 2;
    g.add(p);
    return {};
  },
  bookshelf(g, v) {
    if (v === 'library') {
      box(g, 11.32, Y + 1.2, 25.4, 0.36, 2.4, 1.6, '#4a2f1c');
      const cl = ['#7f1d1d', '#1e3a8a', '#15803d', '#a16207', '#4c1d95'];
      for (let r = 0; r < 5; r++) for (let i = 0; i < 12; i++) box(g, 11.36, Y + 0.18 + r * 0.46, 24.72 + i * 0.115, 0.24, 0.32, 0.085, cl[(r + i) % cl.length]);
      return { colliders: [[11.12, 24.55, 11.52, 26.25, 2.4]] };
    }
    box(g, 11.32, Y + 0.9, 25.5, 0.36, 1.8, 1.2, '#6b4a2d');
    const cols = ['#7f1d1d', '#1e3a8a', '#15803d', '#a16207', '#4c1d95', '#0f766e'];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) box(g, 11.36, Y + 0.18 + r * 0.43, 25.0 + i * 0.11, 0.24, 0.3 + (i % 3) * 0.04, 0.08, cols[(r * 3 + i) % cols.length]);
    return { colliders: [[11.12, 24.9, 11.52, 26.1, 1.8]] };
  },
  fridge(g, v) {
    if (v === 'double') {
      box(g, 18.5, Y + 0.95, 24.05, 0.7, 1.9, 0.9, '#9ca3af', { metalness: 0.6, roughness: 0.3 });
      box(g, 18.14, Y + 0.95, 24.05, 0.02, 1.8, 0.02, '#111');
      return { colliders: [[18.15, 23.6, 18.9, 24.5, 1.9]] };
    }
    box(g, 18.55, Y + 0.9, 23.95, 0.62, 1.8, 0.66, '#e5e7eb', { metalness: 0.3, roughness: 0.35 });
    box(g, 18.22, Y + 1.25, 24.2, 0.03, 0.4, 0.04, '#9ca3af');
    return { colliders: [[18.22, 23.6, 18.9, 24.3, 1.8]] };
  },
  tv(g, v) {
    if (v === 'old') {
      // the old box TV on the stand
      box(g, 18.5, Y + 0.88, 21.0, 0.5, 0.52, 0.66, '#1a1a1a');
      const cs = canvasTex(128, 96, (x) => { x.fillStyle = '#25303b'; x.fillRect(0, 0, 128, 96); x.fillStyle = '#9fb7c9'; x.font = '600 14px system-ui'; x.textAlign = 'center'; x.fillText('NTA', 64, 54); });
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.4), new THREE.MeshBasicMaterial({ map: cs }));
      sc.position.set(18.24, Y + 0.9, 21.0); sc.rotation.y = -Math.PI / 2; g.add(sc);
      return {};
    }
    const big = v === 'flat75' ? 1.35 : 1;
    box(g, 18.86, Y + 1.85, 21.0, 0.05, 0.74 * big, 1.3 * big, '#111');
    const c = canvasTex(256, 144, (x) => {
      const gr = x.createLinearGradient(0, 0, 256, 144); gr.addColorStop(0, '#1e3a8a'); gr.addColorStop(1, '#7e22ce');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 144);
      x.fillStyle = '#fff'; x.font = '700 20px system-ui'; x.textAlign = 'center'; x.fillText('GOSPEL TV', 128, 64);
      x.font = '14px system-ui'; x.fillText('Praise • Worship • Word', 128, 92);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.22 * big, 0.68 * big), new THREE.MeshBasicMaterial({ map: c, toneMapped: false }));
    s.position.set(18.83, Y + 1.85, 21.0);
    s.rotation.y = -Math.PI / 2;
    g.add(s);
    return {};
  },
  dining(g, v) {
    if (v === 'glass6') {
      box(g, 16.75, Y + 0.75, 25.4, 1.7, 0.03, 0.9, '#9fc3cf', { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7 });
      for (const [x, z] of [[16.0, 25.0], [17.5, 25.0], [16.0, 25.8], [17.5, 25.8]]) box(g, x, Y + 0.37, z, 0.05, 0.74, 0.05, '#c0c0c0', { metalness: 0.8 });
      const seats = [];
      for (const [x, z, ry] of [[16.2, 24.65, 0], [16.8, 24.65, 0], [17.4, 24.65, 0], [16.2, 26.2, Math.PI], [16.8, 26.2, Math.PI], [17.4, 26.2, Math.PI]]) { chair(g, x, z, ry, '#f8fafc'); seats.push([x, Y + 0.45, z, ry]); }
      return { colliders: [[15.85, 24.95, 17.65, 25.85, 0.8]], seats };
    }
    box(g, 16.8, Y + 0.75, 25.5, 1.3, 0.05, 0.85, '#7c4a24');
    for (const [x, z] of [[16.25, 25.15], [17.35, 25.15], [16.25, 25.85], [17.35, 25.85]]) box(g, x, Y + 0.37, z, 0.06, 0.74, 0.06, '#5b3418');
    const seats = [];
    for (const [x, z, ry] of [[16.45, 24.75, 0], [17.15, 24.75, 0], [16.45, 26.3, Math.PI], [17.15, 26.3, Math.PI]]) { chair(g, x, z, ry, '#7c4a24', true); seats.push([x, Y + 0.45, z, ry]); }
    return { colliders: [[16.1, 25.05, 17.5, 25.95, 0.8]], seats };
  },
  bed(g, v) {
    if (v === 'foam') {
      box(g, 23.4, Y + 0.09, 25.8, 1.6, 0.18, 2.0, '#e8edf5');
      box(g, 23.05, Y + 0.24, 26.42, 0.6, 0.12, 0.45, '#ffffff');
      return { seats: [[23.4, Y + 0.2, 24.95, 0]] };
    }
    if (v === 'king') {
      box(g, 23.2, Y + 0.22, 25.7, 2.1, 0.44, 2.3, '#3b2412');
      box(g, 23.2, Y + 0.52, 25.7, 2.0, 0.2, 2.2, '#f8fafc');
      box(g, 23.2, Y + 0.66, 25.45, 2.02, 0.06, 1.7, '#7e22ce');
      for (const x of [22.7, 23.7]) box(g, x, Y + 0.7, 26.55, 0.7, 0.16, 0.38, '#ffffff');
      box(g, 23.2, Y + 1.0, 26.86, 2.2, 1.5, 0.12, '#d4b483');
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) box(g, 22.4 + i * 0.4, Y + 0.6 + j * 0.42, 26.8, 0.06, 0.06, 0.03, '#a07d4f');
      return { colliders: [[22.15, 24.55, 24.25, 26.9, 0.75]], seats: [[23.2, Y + 0.62, 24.55, 0]] };
    }
    box(g, 23.4, Y + 0.2, 25.75, 1.7, 0.4, 2.15, '#5b3418');
    box(g, 23.4, Y + 0.48, 25.75, 1.6, 0.18, 2.05, '#f8fafc');
    box(g, 23.4, Y + 0.6, 25.55, 1.62, 0.06, 1.55, '#1d4ed8');
    for (const x of [23.0, 23.8]) box(g, x, Y + 0.64, 26.5, 0.6, 0.14, 0.35, '#ffffff');
    box(g, 23.4, Y + 0.75, 26.85, 1.75, 1.1, 0.08, '#5b3418');
    return { colliders: [[22.55, 24.65, 24.25, 26.9, 0.75]], seats: [[23.4, Y + 0.6, 24.7, 0]] };
  },
  fan(g, v) {
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.05, 16), '#e5e7eb', 21.9, Y + 0.03, 24.0));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), '#d1d5db', 21.9, Y + 0.6, 24.0));
    const head = new THREE.Group();
    head.position.set(21.9, Y + 1.2, 24.0);
    head.add(mesh(new THREE.TorusGeometry(0.24, 0.012, 6, 24), '#d1d5db', 0, 0, 0.05));
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.01), v === 'rechargeable' ? '#f97316' : '#60a5fa', 0, 0, 0); b.position.set(Math.sin((i * Math.PI * 2) / 3) * 0.1, Math.cos((i * Math.PI * 2) / 3) * 0.1, 0); b.rotation.z = -(i * Math.PI * 2) / 3; blades.add(b); }
    head.add(blades);
    head.rotation.y = Math.PI * 0.85;
    g.add(head);
    return { colliders: [[21.7, 23.8, 22.1, 24.2, 1.3]], spin: blades };
  },
  wardrobe(g, v) {
    box(g, 23.8, Y + 1.05, 18.45, 1.6, 2.1, 0.6, '#7c4a24');
    box(g, 23.8, Y + 1.05, 18.76, 0.02, 2.0, 0.02, '#3b2412');
    if (v === 'mirror') for (const x of [23.4, 24.2]) box(g, x, Y + 1.05, 18.77, 0.72, 1.9, 0.01, '#cfe3ef', { metalness: 0.9, roughness: 0.05 });
    for (const x of [23.7, 23.9]) box(g, x, Y + 1.1, 18.77, 0.03, 0.25, 0.03, '#d4af37');
    return { colliders: [[23.0, 18.1, 24.6, 18.8, 2.1]] };
  },
  desk(g, v) {
    box(g, 19.5, Y + 0.74, 19.6, 0.6, 0.04, 1.2, '#a16207');
    for (const [x, z] of [[19.25, 19.05], [19.75, 19.05], [19.25, 20.15], [19.75, 20.15]]) box(g, x, Y + 0.37, z, 0.04, 0.74, 0.04, '#713f12');
    box(g, 19.45, Y + 0.8, 19.4, 0.24, 0.05, 0.32, '#7f1d1d');
    chair(g, 20.15, 19.6, -Math.PI / 2, '#a16207', true);
    if (v === 'study') {
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), '#111', 19.35, Y + 0.98, 20.05));
      g.add(mesh(new THREE.ConeGeometry(0.12, 0.14, 10, 1, true), '#facc15', 19.35, Y + 1.2, 20.05, { emissive: '#fde68a', emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    }
    return { colliders: [[19.15, 18.95, 19.85, 20.25, 0.8]], seats: [[20.15, Y + 0.45, 19.6, -Math.PI / 2]] };
  },
  keyboard(g, v) {
    if (v === 'piano') {
      box(g, 20.5, Y + 0.45, 26.5, 1.45, 0.9, 0.38, '#111');
      box(g, 20.5, Y + 0.93, 26.42, 1.35, 0.03, 0.18, '#f8fafc');
      for (let i = 0; i < 20; i++) box(g, 19.9 + i * 0.065, Y + 0.95, 26.38, 0.025, 0.02, 0.09, '#111');
      return { colliders: [[19.75, 26.25, 21.25, 26.75, 1.0]] };
    }
    for (const x of [20.0, 21.0]) { box(g, x, Y + 0.4, 26.45, 0.04, 0.8, 0.35, '#111', {}, 0.6); }
    box(g, 20.5, Y + 0.82, 26.45, 1.3, 0.08, 0.32, '#111');
    box(g, 20.5, Y + 0.87, 26.38, 1.2, 0.02, 0.14, '#f8fafc');
    for (let i = 0; i < 16; i++) box(g, 20.0 + i * 0.07, Y + 0.885, 26.36, 0.03, 0.02, 0.08, '#111');
    return { colliders: [[19.8, 26.25, 21.2, 26.65, 0.9]] };
  },
  ac(g, v) {
    box(g, 24.82, Y + 2.65, 22.8, 0.22, v === '2hp' ? 0.34 : 0.3, v === '2hp' ? 1.2 : 0.95, '#f8fafc');
    box(g, 24.7, Y + 2.55, 22.8, 0.02, 0.04, 0.85, '#9ca3af');
    return {};
  },
  solar(g, v) {
    for (let i = 0; i < 4; i++) {
      const p = mesh(new THREE.BoxGeometry(1.6, 0.05, 1.0), '#1e3a8a', 14.2 + i * 1.75, 4.8, 24.2, { metalness: 0.6, roughness: 0.25 });
      p.rotation.x = 0.42;
      g.add(p);
    }
    return {};
  },
  chandelier(g, v) {
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), '#d4af37', 15.2, Y + 3.0, 25.0));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24).rotateX(Math.PI / 2), '#d4af37', 15.2, Y + 2.75, 25.0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(mesh(new THREE.OctahedronGeometry(0.05), '#e0f2fe', 15.2 + Math.cos(a) * 0.3, Y + 2.6, 25.0 + Math.sin(a) * 0.3, { emissive: '#fff7d6', emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.1 }));
    }
    return {};
  },
};

/**
 * @param {object} ctx engine context
 * @param {{physics: {addBox: Function}, seats?: object[]}} o
 */
export function createDecor(ctx, { physics, seats, interactables }) {
  const root = new THREE.Group();
  root.name = 'world:decor';
  /** slot → {variant, group, colliders, seats, item, spin, flicker} */
  const built = new Map();
  const remove = (slot) => {
    const b = built.get(slot);
    if (!b) return;
    root.remove(b.group);
    b.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    for (const c of b.colliders) physics.remove?.(c);
    for (const st of b.seats) { const i = seats?.indexOf(st); if (i >= 0) seats.splice(i, 1); }
    if (b.item) { const i = interactables?.indexOf(b.item); if (i >= 0) interactables.splice(i, 1); }
    built.delete(slot);
  };
  return {
    root,
    /** Build each slot's current model (rebuild the ones that changed). @param {Record<string, any>} home */
    set(home = {}) {
      for (const f of FURNITURE) {
        const v = variantOf({ home }, f.id);
        const cur = built.get(f.id);
        if (!v || !ITEMS[f.id]) { remove(f.id); continue; }
        if (cur && cur.variant === v.id) continue;
        remove(f.id);
        const g = new THREE.Group();
        g.name = `decor:${f.id}`;
        g.userData.slot = f.id;
        const r = ITEMS[f.id](g, v.id) || {};
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        root.add(g);
        const entry = { variant: v.id, group: g, colliders: [], seats: [], item: null, spin: r.spin, flicker: r.flicker };
        for (const [x0, z0, x1, z1, hgt] of r.colliders || []) entry.colliders.push(physics.addBox(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, Y + hgt, z1), { kind: 'furniture', camera: false, walkable: false }));
        for (const [x, y, z, rotY] of r.seats || []) { const st = { position: new THREE.Vector3(x, y, z), rotY, kind: 'chair', zone: 'home', taken: false }; seats?.push(st); entry.seats.push(st); }
        // press F near it (or click it) to replace or upgrade
        const box3 = new THREE.Box3().setFromObject(g);
        if (!box3.isEmpty() && f.id !== 'solar') {
          const c = box3.getCenter(new THREE.Vector3());
          entry.item = { id: `furniture-${f.id}`, position: new THREE.Vector3(c.x, Y, c.z), radius: 1.5, label: `Change the ${f.name.toLowerCase()}`, action: 'furniture', slot: f.id };
          interactables?.push(entry.item);
        }
        built.set(f.id, entry);
      }
    },
    has: (id) => built.has(id),
    /** Which furniture slot an object belongs to (for clicks), or null. */
    slotOf(o) { while (o) { if (o.userData?.slot) return o.userData.slot; o = o.parent; } return null; },
    update(dt, t) {
      for (const b of built.values()) {
        if (b.spin) b.spin.rotation.z += dt * 14;
        if (b.flicker) b.flicker.scale.y = 1.6 + Math.sin(t * 13) * 0.25 + Math.sin(t * 7.3) * 0.15;
      }
    },
  };
}

/* ---------------------------------------------------------------- helpers */
/** One sofa (n seats), back towards −Z before rotating by ry. Adds its seats and collider. */
function sofaPiece(g, x, z, ry, n, color, cushion, shine, seats, colliders) {
  const w = n * 0.75 + 0.3;
  const s = new THREE.Group();
  s.position.set(x, Y, z);
  s.rotation.y = ry;
  const part = (cx, cy, cz, sx, sy, sz, col) => { const me = mesh(new THREE.BoxGeometry(sx, sy, sz), col, cx, cy, cz, shine); s.add(me); };
  part(0, 0.22, 0.05, w, 0.3, 0.8, color);
  for (let i = 0; i < n; i++) part(-((n - 1) * 0.75) / 2 + i * 0.75, 0.42, 0.1, 0.72, 0.12, 0.66, cushion);
  part(0, 0.62, -0.28, w, 0.75, 0.22, color);
  for (const sd of [-1, 1]) part(sd * (w / 2 - 0.08), 0.4, 0.05, 0.16, 0.42, 0.8, color);
  part(0, 0.03, 0.05, w - 0.1, 0.06, 0.7, '#2a1a10');
  g.add(s);
  const c = Math.cos(ry), sn = Math.sin(ry);
  const ex = Math.abs(c) * w / 2 + Math.abs(sn) * 0.45, ez = Math.abs(sn) * w / 2 + Math.abs(c) * 0.45;
  colliders.push([x - ex, z - ez, x + ex, z + ez, 0.6]);
  for (let i = 0; i < n; i++) {
    const lx = -((n - 1) * 0.75) / 2 + i * 0.75, lz = 0.12;
    seats.push([x + lx * c + lz * sn, Y + 0.48, z - lx * sn + lz * c, ry]);
  }
}

function mesh(geo, color, x, y, z, o) {
  const me = new THREE.Mesh(geo, m(color, o));
  me.position.set(x, y, z);
  return me;
}
function box(g, x, y, z, sx, sy, sz, color, o, ry = 0) {
  const me = mesh(new THREE.BoxGeometry(sx, sy, sz), color, x, y, z, o);
  me.rotation.y = ry;
  g.add(me);
  return me;
}
/** A simple chair facing rotY (back on the far side). */
function chair(g, x, z, ry, color, wood = false) {
  const c = new THREE.Group();
  c.position.set(x, Y, z);
  c.rotation.y = ry;
  const mat = wood ? '#5b3418' : color;
  c.add(mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), color, 0, 0.45, 0));
  c.add(mesh(new THREE.BoxGeometry(0.44, 0.5, 0.04), color, 0, 0.72, -0.2));
  for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) c.add(mesh(new THREE.BoxGeometry(0.035, 0.45, 0.035), mat, lx, 0.225, lz));
  g.add(c);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
