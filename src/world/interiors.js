// Inside the places you travel to on the Lagos map: when you arrive you find yourself inside —
// the LUTH ward with patients in their beds, the Sabo police station with its counter and cell,
// a buka with its pots, the betting shop's screens, the children's home, the gospel radio
// studio, a lounge, an owambe hall, government offices, Balogun and Computer Village, and open
// places (TBS, the sea wall, Prayer Mountain, Makoko, UNILAG). Built on demand far from Yaba
// with the street's builders (world.scenery). Each activity of the place has a spot with a
// floating sign: walk up and press F (or tap it). The door takes you back out to the map.
import * as THREE from 'three';
import { mat } from './geo.js';
import { signboard } from './buildings.js';
import { local } from './roads.js';
import { drawPoster, defaultPosters } from '../map/posters.js';

/** Which interior each place has. */
export const INTERIOR_OF = {
  luth: 'hospital', police: 'police', bodethomas: 'buka', ojuelegba: 'buka', betting: 'betting',
  orphanage: 'orphanage', radio: 'radio', lounge: 'lounge', owambe: 'hall', govhouse: 'office',
  secretariat: 'office', balogun: 'market', oshodi: 'market', computer: 'phones', tbs: 'square',
  ekoatlantic: 'seawall', lekkibridge: 'seawall', mountain: 'mountain', makoko: 'makoko', unilag: 'campus',
};
const ORDER = Object.keys(INTERIOR_OF);

/** Where a place's interior sits in the world (far east of Yaba, in a grid). */
export function interiorOrigin(placeId) {
  const i = ORDER.indexOf(placeId);
  return i < 0 ? null : [1500 + (i % 5) * 140, -280 + Math.floor(i / 5) * 140];
}

const HALF_W = 8, HALF_D = 6, H = 4.2;

/**
 * Build a place's interior. Returns what the caller needs to bring it to life.
 * @returns {{spawn: THREE.Vector3, spawnRot: number, exit: THREE.Vector3, stations: THREE.Vector3[],
 *   npcs: {role: string, pos: THREE.Vector3, rotY: number, pose: string, scale?: number}[], ambience: string,
 *   zone: object, outdoor: boolean}}
 */
export function buildInterior(W, placeId, place) {
  const kind = INTERIOR_OF[placeId];
  const [ox, oz] = interiorOrigin(placeId);
  const L = local(W, ox, oz);
  const spec = KINDS[kind];
  const out = spec(L, place) || {};
  const outdoor = !!out.outdoor;
  if (!outdoor) shell(L, out.walls || '#efe6d2', out.floor || ['tiles', '#e7e2d6'], place, out.lower);
  else fenceOff(L, out.size || 15);
  const V = (x, z, y = 0) => new THREE.Vector3(ox + x, y, oz + z);
  const sz = out.size || 15;
  return {
    kind,
    spawn: V(0, outdoor ? sz - 4 : HALF_D - 3.2),
    spawnRot: Math.PI,
    exit: V(0, outdoor ? sz - 1.2 : HALF_D - 0.4),
    stations: (out.stations || []).map(([x, z]) => V(x, z)),
    npcs: (out.npcs || []).map((n) => ({ ...n, pos: V(n.x, n.z, n.y || 0) })),
    ambience: out.ambience || 'home',
    outdoor,
    zone: { id: `inside:${placeId}`, label: place?.name || placeId, ambience: out.ambience || 'home', min: [ox - 30, -2, oz - 30], max: [ox + 30, 14, oz + 30] },
  };
}

/* ---------------------------------------------------------------- room shell */
function shell(L, wallColor, [floorKey, floorColor], place, lower) {
  const { b } = L;
  const X = HALF_W, Z = HALF_D, T = 0.2;
  b.boxMM(floorKey, -X, -0.1, -Z, X, 0.01, Z, { color: floorColor });
  b.boxMM('ground', -40, -0.12, -40, 40, -0.05, 40, { color: '#b9805a' }); // outside, seen through the door
  const door = [-0.8, 0.8];
  // walls (north, east, west, and south with the door)
  b.boxMM('wallIn', -X - T, 0, -Z - T, X + T, H, -Z, { color: wallColor });
  b.boxMM('wallIn', -X - T, 0, -Z, -X, H, Z + T, { color: wallColor });
  b.boxMM('wallIn', X, 0, -Z, X + T, H, Z + T, { color: wallColor });
  b.boxMM('wallIn', -X, 0, Z, door[0], H, Z + T, { color: wallColor });
  b.boxMM('wallIn', door[1], 0, Z, X, H, Z + T, { color: wallColor });
  b.boxMM('wallIn', door[0], 2.3, Z, door[1], H, Z + T, { color: wallColor });
  if (lower) { // painted lower half (dado)
    for (const [x0, z0, x1, z1] of [[-X, -Z, X, -Z + 0.02], [-X, -Z, -X + 0.02, Z], [X - 0.02, -Z, X, Z]]) b.boxMM('wallIn', x0, 0, z0, x1, 1.2, z1, { color: lower });
    b.boxMM('wallIn', -X, 0, Z - 0.02, door[0], 1.2, Z, { color: lower });
    b.boxMM('wallIn', door[1], 0, Z - 0.02, X, 1.2, Z, { color: lower });
  }
  // the door frame and a mat
  b.boxMM('wood', door[0] - 0.1, 0, Z - 0.05, door[0], 2.4, Z + T + 0.05, { color: '#5b3a22' });
  b.boxMM('wood', door[1], 0, Z - 0.05, door[1] + 0.1, 2.4, Z + T + 0.05, { color: '#5b3a22' });
  b.boxMM('wood', door[0] - 0.1, 2.3, Z - 0.05, door[1] + 0.1, 2.4, Z + T + 0.05, { color: '#5b3a22' });
  b.boxMM('carpet', -0.9, 0.012, Z - 1.1, 0.9, 0.02, Z - 0.1, { color: '#7f1d1d' });
  // ceiling and lights
  b.boxMM('ceiling', -X, H, -Z, X, H + 0.1, Z, { color: '#f6f5ef' });
  for (const x of [-X / 2, X / 2]) for (const z of [-Z / 2, Z / 2]) b.box('lamp', x, H - 0.03, z, 1.2, 0.04, 0.16, { color: '#fffbea' });
  for (const [x, z] of [[-X / 2, 0], [X / 2, 0]]) L.inst('fanHub', mat(x, H - 0.55, z));
  // colliders: walls, ceiling, and the doorway closed with an invisible "exit" line further out
  L.collide(-X - T, 0, -Z - T, X + T, H, -Z, 'wall');
  L.collide(-X - T, 0, -Z, -X, H, Z + T, 'wall');
  L.collide(X, 0, -Z, X + T, H, Z + T, 'wall');
  L.collide(-X, 0, Z, door[0], H, Z + T, 'wall');
  L.collide(door[1], 0, Z, X, H, Z + T, 'wall');
  L.collide(-1, 0, Z + T, 1, H, Z + T + 0.3, 'wall');
  L.collide(-X, H, -Z, X, H + 0.3, Z, 'ceiling');
  // the name over the door, inside
  if (place?.name) L.canvas((g, w, h) => nameplate(g, w, h, place), 512, 96, 0, 2.95, Z - 0.03, 4.2, 0.8, Math.PI);
}
function fenceOff(L, s) {
  for (const [x0, z0, x1, z1] of [[-s, -s - 0.4, s, -s], [-s - 0.4, -s, -s, s], [s, -s, s + 0.4, s], [-s, s, s, s + 0.4]]) L.collide(x0, 0, z0, x1, 3, z1, 'boundary');
}
function nameplate(g, w, h, place) {
  g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#facc15'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 40px Inter, Arial, sans-serif';
  g.fillText(`${place.emoji || ''} ${place.name}`.trim().toUpperCase().slice(0, 34), w / 2, h / 2 + 2, w - 30);
}

/* ---------------------------------------------------------------- small helpers */
const posters = defaultPosters(12, 9);
function poster(L, x, y, z, w, h, ry, i) {
  L.canvas((g, cw, ch) => drawPoster(g, 0, 0, cw, ch, posters[i % posters.length]), 384, Math.round(384 * h / w), x, y, z, w, h, ry, { glow: 0.05 });
}
function screenText(L, lines, x, y, z, w, h, ry, bg = '#0f172a', fg = '#e2e8f0') {
  L.canvas((g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((t, i) => { g.font = `${i ? 600 : 800} ${i ? 24 : 34}px Inter, Arial, sans-serif`; g.fillText(t, cw / 2, ch * (i + 0.7) / (lines.length + 0.4), cw - 20); });
  }, 384, Math.round(384 * h / w), x, y, z, w, h, ry, { glow: 0.6 });
}
function bed(L, x, z, blanket = '#60a5fa') {
  const { b } = L;
  b.boxMM('metal', x - 0.5, 0, z - 1.0, x + 0.5, 0.5, z + 1.0, { color: '#e5e7eb', uv: 'keep' });
  b.boxMM('fabric', x - 0.46, 0.5, z - 0.96, x + 0.46, 0.62, z + 0.96, { color: '#f8fafc' });
  b.boxMM('fabric', x - 0.47, 0.6, z - 0.2, x + 0.47, 0.66, z + 0.97, { color: blanket });
  b.boxMM('fabric', x - 0.3, 0.62, z - 0.95, x + 0.3, 0.74, z - 0.6, { color: '#ffffff' });
  b.boxMM('metal', x - 0.5, 0.5, z - 1.05, x + 0.5, 1.1, z - 0.98, { color: '#cbd5e1', uv: 'keep' });
  L.collide(x - 0.5, 0, z - 1.05, x + 0.5, 0.7, z + 1.0, 'furniture');
}
function counter(L, x0, z0, x1, z1, color = '#7c4a24', top = '#d6c7a6') {
  const { b } = L;
  b.boxMM('wood', x0, 0, z0, x1, 1.0, z1, { color });
  b.boxMM('wood', x0 - 0.05, 1.0, z0 - 0.05, x1 + 0.05, 1.06, z1 + 0.05, { color: top });
  L.collide(x0, 0, z0, x1, 1.06, z1, 'furniture');
}
function benchRow(L, x, z, ry = 0, n = 1, seatZone = 'inside') {
  for (let i = 0; i < n; i++) {
    const bx = x + Math.cos(ry) * i * 2.0, bz = z - Math.sin(ry) * i * 2.0;
    L.inst('bench', mat(bx, 0, bz, ry));
    L.collide(bx - 0.9, 0, bz - 0.2, bx + 0.9, 0.45, bz + 0.2, 'bench');
    for (const s of [-0.5, 0.5]) L.seat?.(bx + Math.cos(ry) * s + L.ox, 0.45, bz - Math.sin(ry) * s + L.oz, ry + Math.PI, 'bench', seatZone);
  }
}
const seatAt = (L) => (x, y, z, ry) => L.seat?.(x + L.ox, y, z + L.oz, ry, 'chair', 'inside');

/* ---------------------------------------------------------------- the places */
const KINDS = {
  hospital(L) {
    for (const [i, x] of [-6, -3, 0, 3, 6].entries()) { bed(L, x, -4.6, ['#60a5fa', '#a7f3d0', '#fca5a5', '#c4b5fd', '#fde68a'][i]); L.b.cyl('metal', x + 0.75, 0, -5.2, 0.02, 0.02, 1.8, 6, { color: '#cbd5e1' }); L.b.box('plastic', x + 0.75, 1.75, -5.2, 0.16, 0.24, 0.06, { color: '#bfdbfe' }); }
    counter(L, 4.8, 1.0, 7.6, 2.0, '#e5e7eb', '#93c5fd'); // nurses' station
    screenText(L, ['WARD C', 'Visiting hours 4–6pm'], 7.9, 2.2, 1.5, 1.8, 0.7, -Math.PI / 2, '#0e7490', '#ecfeff');
    benchRow(L, -6, 4.4, 0, 3);
    poster(L, -7.9, 1.9, -1, 1.6, 1.1, Math.PI / 2, 1);
    return {
      walls: '#e6f2ee', lower: '#9fd6c4', floor: ['tiles', '#dfeee6'], ambience: 'prayer',
      stations: [[-3, -2.9], [6.2, 2.8], [3, -2.9]],
      npcs: [
        ...[-6, -3, 0, 3, 6].map((x, i) => ({ role: i % 2 ? 'worshipper' : 'visitor', x, z: -4.6 + 0.26, y: 0.62, rotY: 0, pose: 'lie' })),
        { role: 'hospitality', x: 6.2, z: 1.0 - 0.6, rotY: 0, pose: 'talk', name: 'Nurse Bisi' },
        { role: 'worshipper', x: -3.9, z: -3.2, rotY: Math.PI / 2, pose: 'foldArms', name: 'A worried mother' },
      ],
    };
  },
  police(L) {
    counter(L, -2.5, -1.4, 3.5, -0.6, '#3f3f46', '#a1a1aa');
    screenText(L, ['CHARGE ROOM', 'Bail is free'], 0.5, 2.5, -5.95, 2.8, 0.9, 0, '#1e3a8a', '#ffffff');
    // the cell with bars
    for (let x = -8; x <= -4.2; x += 0.22) L.b.cyl('metal', x, 0, -1.2, 0.025, 0.025, H, 6, { color: '#3f3f46' });
    for (let z = -6; z <= -1.2; z += 0.22) L.b.cyl('metal', -4.1, 0, z, 0.025, 0.025, H, 6, { color: '#3f3f46' });
    L.collide(-8, 0, -1.3, -4.0, H, -1.1, 'wall'); L.collide(-4.2, 0, -6, -4.0, H, -1.1, 'wall');
    L.inst('bench', mat(-6.2, 0, -5.4, 0)); seatAt(L)(-6.6, 0.45, -5.4, 0); seatAt(L)(-5.8, 0.45, -5.4, 0);
    benchRow(L, 3, 4.4, 0, 2);
    L.b.box('wood', 6.5, 1.8, -5.95, 2.0, 1.2, 0.04, { color: '#a16207' }); // notice board
    for (let i = 0; i < 6; i++) L.b.box('plastic', 5.8 + (i % 3) * 0.6, 1.55 + Math.floor(i / 3) * 0.55, -5.92, 0.42, 0.4, 0.01, { color: ['#fef3c7', '#ffffff', '#e0f2fe'][i % 3] });
    return {
      walls: '#ece7d8', lower: '#2a4d8f', floor: ['concrete', '#b9b4a6'], ambience: 'home',
      stations: [[0.5, 0.4], [2.6, 0.4], [-3.4, -3.6], [-1.5, 0.4]],
      npcs: [
        { role: 'security', x: 0.5, z: -2.2, rotY: 0, pose: 'foldArms', name: 'Inspector Musa' },
        { role: 'visitor', x: -6.6, z: -5.4 + 0.34, y: 0, rotY: 0, pose: 'sit', seat: true },
        { role: 'visitor', x: -5.8, z: -5.4 + 0.34, y: 0, rotY: 0, pose: 'sit', seat: true },
        { role: 'worshipper', x: 2.8, z: 0.6, rotY: Math.PI, pose: 'talk' },
      ],
    };
  },
  buka(L) {
    counter(L, -4, -5.4, 4, -4.4, '#7c4a24', '#e7d4b5');
    for (let i = 0; i < 5; i++) L.inst(i % 2 ? 'potBig' : 'pot', mat(-3.2 + i * 1.6, 1.06, -4.9, i));
    signboard(L, 'buka', 0, 2.8, -5.97, 4.6, 0);
    signboard(L, 'menu', 6.5, 1.9, -5.97, 1.2, 0);
    const T = seatAt(L);
    for (const [x, z] of [[-4.5, 0], [0, 0], [4.5, 0], [-4.5, 3], [4.5, 3]]) {
      L.inst('tablePlastic', mat(x, 0, z), '#f2f2ee');
      L.collide(x - 0.45, 0, z - 0.35, x + 0.45, 0.75, z + 0.35, 'furniture');
      L.inst('chair', mat(x - 0.75, 0, z, Math.PI / 2), '#2563eb'); T(x - 0.75, 0.45, z, Math.PI / 2);
      L.inst('chair', mat(x + 0.75, 0, z, -Math.PI / 2), '#2563eb'); T(x + 0.75, 0.45, z, -Math.PI / 2);
      for (let k = 0; k < 2; k++) L.inst('plate', mat(x - 0.2 + k * 0.4, 0.75, z), null);
    }
    return {
      walls: '#f7e7b4', lower: '#b45309', floor: ['concrete', '#cfc6b3'], ambience: 'market',
      stations: [[0, -3.6], [-2.4, 1.6]],
      npcs: [
        { role: 'hospitality', x: 0.4, z: -5.0, rotY: 0, pose: 'talk', name: 'Iya Basira' },
        { role: 'worshipper', x: -5.25 + 0.34, z: 0, rotY: Math.PI / 2, pose: 'sit' },
        { role: 'visitor', x: 5.25 - 0.34, z: 3, rotY: -Math.PI / 2, pose: 'sit' },
        { role: 'visitor', x: -1.6, z: 2.6, rotY: 0.4, pose: 'idle', name: 'A hungry boy' },
      ],
    };
  },
  betting(L) {
    counter(L, -3, -5.4, 3, -4.6, '#111827', '#f59e0b');
    screenText(L, ['STAKE HERE', 'Odds: 2.10 · 3.45 · 1.85'], 0, 2.4, -5.95, 3.2, 1.0, 0, '#16a34a', '#ffffff');
    const games = [['ARSENAL vs CHELSEA', '2.10  3.30  3.45'], ['ENYIMBA vs RANGERS', '1.85  3.10  4.20'], ['REAL vs BARCA', 'LIVE 67\' 1 – 1']];
    games.forEach(([a, b2], i) => { const x = -6 + i * 6; L.b.boxMM('paint', x - 1.4, 1.6, -5.99, x + 1.4, 3.2, -5.9, { color: '#111' }); screenText(L, [a, b2], x, 2.4, -5.88, 2.6, 1.45, 0, '#0b3d1c', '#f0fdf4'); });
    for (let i = 0; i < 8; i++) { const x = -6 + (i % 4) * 4, z = -0.5 + Math.floor(i / 4) * 3; L.inst('chair', mat(x, 0, z, Math.PI), '#e11d48'); seatAt(L)(x, 0.45, z, Math.PI); }
    L.b.box('plastic', 7.94, 1.8, 2.5, 0.02, 1.0, 1.6, { color: '#fef08a' });
    return {
      walls: '#1f2937', floor: ['tiles', '#6b7280'], ambience: 'street',
      stations: [[0, -3.8], [-4, 1.2]],
      npcs: [
        { role: 'visitor', x: 0.4, z: -5.1, rotY: 0, pose: 'idle', name: 'The cashier' },
        { role: 'visitor', x: -4.6, z: 0.4, rotY: Math.PI, pose: 'foldArms' },
        { role: 'visitor', x: -3.4, z: 0.6, rotY: Math.PI, pose: 'talk' },
        { role: 'security', x: 2.2, z: 1.2, rotY: Math.PI * 0.9, pose: 'phone' },
      ],
    };
  },
  orphanage(L) {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = -4 + c * 4, z = -2 + r * 3;
      L.inst('tablePlasticLow', mat(x, 0, z), ['#facc15', '#60a5fa', '#f472b6'][c]);
      for (const s of [-0.6, 0.6]) L.inst('kidsChair', mat(x + s, 0, z + 0.55, Math.PI), ['#ef4444', '#22c55e', '#3b82f6'][(r + c) % 3]);
    }
    signboard(L, 'whiteboard', 0, 1.9, -5.97, 3.2, 0, { back: false });
    for (let i = 0; i < 9; i++) L.b.box('plastic', -7 + (i % 3) * 0.5, 0.15 + Math.floor(i / 3) * 0.3, 4.9, 0.4, 0.28, 0.4, { color: ['#ef4444', '#facc15', '#22c55e', '#3b82f6'][i % 4] });
    L.b.boxMM('carpet', -3, 0.012, 3.0, 3, 0.02, 5.0, { color: '#4ade80' });
    poster(L, 7.9, 2.0, -2, 1.6, 1.1, -Math.PI / 2, 7);
    return {
      walls: '#fde68a', lower: '#fb923c', floor: ['tiles', '#fef3c7'], ambience: 'home',
      stations: [[-5.5, 3.6], [0, -3.6]],
      npcs: [
        ...[[-4, -1.45], [-3.4, -1.45], [0, -1.45], [4.6, 1.55], [0.6, 1.55], [-4.6, 1.55]].map(([x, z], i) => ({ role: 'visitor', x, z: z + 0.2, rotY: Math.PI, pose: i % 3 ? 'idle' : 'dance', scale: 0.62 })),
        { role: 'hospitality', x: -6.2, z: 3.2, rotY: Math.PI / 2, pose: 'talk', name: 'Mama Grace (the matron)' },
      ],
    };
  },
  radio(L) {
    counter(L, -2.5, -3.6, 2.5, -2.8, '#27272a', '#3f3f46');
    for (const x of [-1.2, 1.2]) { L.b.cyl('metal', x, 1.06, -3.1, 0.02, 0.02, 0.4, 6, { color: '#111' }); L.b.box('metal', x, 1.5, -3.1, 0.08, 0.16, 0.08, { color: '#18181b' }); }
    L.b.boxMM('glass', -5, 1.0, -5.95, 5, 2.6, -5.9, { color: '#7dd3fc' });
    for (let i = 0; i < 12; i++) L.b.box('fabric', -7.6 + (i % 2) * 15.2, 0.8 + Math.floor(i / 2) * 0.45, -4 + (i % 3) * 3, 0.1, 0.4, 1.2, { color: '#3f3f46' });
    screenText(L, ['● ON AIR', 'Grace FM 104.5'], 0, 3.0, -5.85, 2.4, 0.6, 0, '#7f1d1d', '#fecaca');
    seatAt(L)(1.2, 0.45, -2.2, Math.PI);
    L.inst('chair', mat(-1.2, 0, -2.2, Math.PI), '#18181b'); L.inst('chair', mat(1.2, 0, -2.2, Math.PI), '#18181b');
    return {
      walls: '#e4e4e7', floor: ['carpet', '#334155'], ambience: 'prayer',
      stations: [[1.2, -1.4]],
      npcs: [{ role: 'media', x: -1.2, z: -2.2 - 0.34, rotY: Math.PI, pose: 'sit', name: 'Pastor Femi (the presenter)' }],
    };
  },
  lounge(L) {
    counter(L, -5, -5.2, 5, -4.3, '#3b0764', '#a855f7');
    for (let i = 0; i < 18; i++) L.b.cyl('glass', -4.6 + i * 0.52, 1.06, -4.75, 0.05, 0.05, 0.3, 8, { color: ['#22c55e', '#f59e0b', '#ef4444', '#a3e635'][i % 4] });
    for (let i = 0; i < 6; i++) L.b.box('lamp', -6 + i * 2.4, H - 0.2, 0, 0.3, 0.1, 0.3, { color: ['#f0abfc', '#67e8f9', '#fde047'][i % 3] });
    for (const [x, z, ry] of [[-6.4, 2.5, Math.PI / 2], [6.4, 2.5, -Math.PI / 2]]) { L.b.box('fabric', x, 0.4, z, 0.9, 0.8, 2.4, { color: '#1e1b4b', ry: 0 }); seatAt(L)(x + Math.sin(ry) * 0.2, 0.45, z, ry); }
    return {
      walls: '#2e1065', floor: ['tiles', '#1f2937'], ambience: 'cinema',
      stations: [[0, -3.4], [5.4, 2.5]],
      npcs: [
        { role: 'visitor', x: 0, z: -5.6, rotY: 0, pose: 'idle', name: 'The barman' },
        { role: 'visitor', x: -1.2, z: 0.6, rotY: 0.6, pose: 'dance' },
        { role: 'hospitality', x: 0.6, z: 1.2, rotY: -0.4, pose: 'dance' },
        { role: 'worshipper', x: 6.4 - 0.55, z: 2.5, rotY: -Math.PI / 2, pose: 'sit', name: 'A lonely young man' },
      ],
    };
  },
  hall(L) {
    L.b.boxMM('wood', -5, 0, -6, 5, 0.5, -3.8, { color: '#7c2d12' }); // stage
    L.collide(-5, 0, -6, 5, 0.5, -3.8, 'stage');
    L.inst('speaker', mat(-4.4, 0.5, -4.4, 0.3)); L.inst('speaker', mat(4.4, 0.5, -4.4, -0.3));
    for (let i = 0; i < 14; i++) L.b.cyl('fabric', -7 + i * 1.08, H - 0.8, -5.9, 0.25, 0.25, 0.5, 10, { color: ['#facc15', '#f472b6', '#ffffff'][i % 3] }); // balloons
    const T = seatAt(L);
    for (const [x, z] of [[-5, 0], [0, 0.6], [5, 0], [-5, 3.4], [5, 3.4]]) {
      L.b.cyl('fabric', x, 0, z, 0.8, 0.8, 0.76, 16, { color: '#fef3c7' });
      L.collide(x - 0.8, 0, z - 0.8, x + 0.8, 0.76, z + 0.8, 'furniture');
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; const cx = x + Math.sin(a) * 1.2, cz = z + Math.cos(a) * 1.2; L.inst('chair', mat(cx, 0, cz, a + Math.PI), '#f8fafc'); T(cx, 0.45, cz, a + Math.PI); }
    }
    return {
      walls: '#fdf2f8', floor: ['tiles', '#f5f5f4'], ambience: 'market',
      stations: [[0, -2.8], [2.5, 2.2]],
      npcs: [
        { role: 'choir', x: -1, z: -4.8, y: 0.5, rotY: 0, pose: 'talk', name: 'The juju band' },
        { role: 'hospitality', x: -0.6, z: -2.0, rotY: 0.4, pose: 'dance' },
        { role: 'worshipper', x: 0.8, z: -2.2, rotY: -0.5, pose: 'dance' },
        { role: 'visitor', x: 1.8, z: -1.8, rotY: -0.2, pose: 'dance' },
        { role: 'worshipper', x: -5 + 0.86 * Math.sin(0.4), z: 0.86 * Math.cos(0.4), rotY: 0.4 + Math.PI, pose: 'sit' },
      ],
    };
  },
  office(L) {
    counter(L, -2, -3.6, 2, -2.8, '#52525b', '#e4e4e7');
    for (const [i, c] of ['#15803d', '#ffffff', '#15803d'].entries()) L.b.box('fabric', -6.6 + i * 0.4, 2.2, -5.95, 0.4, 1.2, 0.02, { color: c });
    L.b.cyl('metal', -7.4, 0, -5.6, 0.03, 0.03, 2.9, 6, { color: '#d4af37' });
    L.b.box('wood', 0, 2.3, -5.95, 1.2, 1.4, 0.05, { color: '#a16207' });
    screenText(L, ['RECEPTION', 'Lagos State · Eko o ni baje'], 0, 2.3, -5.9, 1.1, 1.3, 0, '#14532d', '#f0fdf4');
    const T = seatAt(L);
    for (let i = 0; i < 6; i++) { const x = -5 + i * 2; L.inst('chair', mat(x, 0, 3.6, Math.PI), '#1e3a8a'); T(x, 0.45, 3.6, Math.PI); }
    L.inst('mango', mat(7, 0, -5, 0)); // a big potted plant
    return {
      walls: '#f5f5f4', lower: '#a8a29e', floor: ['tiles', '#e7e5e4'], ambience: 'home',
      stations: [[0, -1.8], [1.8, -1.8]],
      npcs: [
        { role: 'media', x: 0, z: -4.3, rotY: 0, pose: 'phone', name: 'The receptionist' },
        { role: 'security', x: 6, z: 4.4, rotY: Math.PI, pose: 'foldArms' },
        { role: 'worshipper', x: -3, z: 3.6 - 0.34, rotY: Math.PI, pose: 'sit' },
      ],
    };
  },
  market(L) {
    const P = L.P;
    for (let i = 0; i < 6; i++) {
      const x = -6 + (i % 3) * 6, z = -3.5 + Math.floor(i / 3) * 5;
      counter(L, x - 1.6, z - 0.5, x + 1.6, z + 0.5, '#7a5232', '#d6c7a6');
      for (let k = 0; k < 6; k++) {
        const g = new THREE.BoxGeometry(0.45, 0.1, 0.6);
        L.b.add('props', g, { m: mat(x - 1.3 + k * 0.52, 1.1 + (k % 2) * 0.1, z), uv: P[`ankara-${(k + i) % 3 + 1}`] });
      }
      L.inst(['umbrellaRY', 'umbrellaGW', 'umbrellaBW'][i % 3], mat(x, 0, z + 0.9, i));
    }
    return {
      walls: '#e7d4b5', floor: ['concrete', '#bfb5a2'], ambience: 'market',
      stations: [[-6, -2.5], [6, 2.5]],
      npcs: [
        { role: 'hospitality', x: -6, z: -4.4, rotY: 0, pose: 'talk', name: 'Alhaja (fabric seller)' },
        { role: 'visitor', x: 6, z: 0.6, rotY: 0, pose: 'idle', name: 'The shoe seller' },
        { role: 'worshipper', x: 0.6, z: -1.6, rotY: 2.0, pose: 'phone' },
      ],
    };
  },
  phones(L) {
    for (let i = 0; i < 6; i++) {
      const x = -6 + (i % 3) * 6, z = -3.5 + Math.floor(i / 3) * 5;
      counter(L, x - 1.6, z - 0.5, x + 1.6, z + 0.5, '#e5e7eb', '#111827');
      for (let k = 0; k < 8; k++) L.b.box('glass', x - 1.35 + k * 0.38, 1.12, z, 0.16, 0.02, 0.3, { color: k % 3 ? '#0f172a' : '#1e293b' });
    }
    screenText(L, ['COMPUTER VILLAGE', 'Phones · Laptops · Repairs'], 0, 2.7, -5.95, 4.0, 1.0, 0, '#1d4ed8', '#ffffff');
    return {
      walls: '#e0f2fe', floor: ['tiles', '#d4d4d8'], ambience: 'market',
      stations: [[-6, -2.5], [6, 2.5]],
      npcs: [
        { role: 'media', x: -6, z: -4.4, rotY: 0, pose: 'phone', name: 'Emeka (phone dealer)' },
        { role: 'visitor', x: 6.2, z: 3.4, rotY: Math.PI, pose: 'talk', name: 'A "London-used" seller' },
      ],
    };
  },
  /* ---- open-air places */
  square(L) {
    const s = 15;
    L.b.boxMM('concrete', -s - 10, -0.1, -s - 10, s + 10, 0.01, s + 10, { color: '#d6d3cb' });
    for (let k = 0; k < 4; k++) L.b.boxMM('concrete', -s, 0, -s + k * 0.9, s, 0.5 + k * 0.5, -s + 0.9 + k * 0.9, { color: '#c4c0b6' }); // the stands
    L.b.boxMM('wood', -6, 0, -8, 6, 1.0, -4, { color: '#1e3a8a' }); L.collide(-6, 0, -8, 6, 1.0, -4, 'stage');
    poster(L, 0, 4.2, -7.9, 9, 3.4, 0, 9);
    for (const x of [-5.6, 5.6]) L.b.cyl('metal', x, 0, -7.8, 0.1, 0.1, 6, 8, { color: '#3f3f46' });
    L.inst('speaker', mat(-6.8, 0, -4.5, 0.2)); L.inst('speaker', mat(6.8, 0, -4.5, -0.2));
    for (let i = 0; i < 6; i++) L.inst('palm1', mat(-14 + i * 5.6, 0, 13.5, i));
    return {
      outdoor: true, size: s, ambience: 'town',
      stations: [[0, -2.6]],
      npcs: [
        { role: 'minister', x: 0, z: -6, y: 1.0, rotY: 0, pose: 'talk', name: 'The evangelist' },
        ...[-3, -1, 1, 3, -2, 2].map((x, i) => ({ role: i % 2 ? 'worshipper' : 'visitor', x, z: -1 + (i > 3 ? 1.5 : 0), rotY: Math.PI, pose: i % 3 ? 'idle' : 'dance' })),
      ],
    };
  },
  seawall(L) {
    const s = 15;
    L.b.boxMM('pavers', -s - 10, -0.1, -s, s + 10, 0.01, s + 10, { color: '#d6cbb5' });
    L.b.boxMM('water', -80, -2.0, -90, 80, -1.2, -s, { color: '#2f7f9a', uv: 'keep' });
    L.b.boxMM('concrete', -s - 10, -1.6, -s - 0.6, s + 10, 0.9, -s, { color: '#cbd5e1' });
    for (let x = -s; x <= s; x += 2.5) L.b.cyl('metal', x, 0.9, -s - 0.3, 0.04, 0.04, 0.6, 6, { color: '#64748b' });
    L.b.boxMM('metal', -s - 10, 1.45, -s - 0.35, s + 10, 1.52, -s - 0.25, { color: '#64748b', uv: 'keep' });
    for (let i = 0; i < 6; i++) { L.inst(['palm0', 'palm1', 'palm2'][i % 3], mat(-13 + i * 5.2, 0, -10, i)); }
    benchRow(L, -8, -8, 0, 2); benchRow(L, 6, -8, 0, 2);
    for (let i = 0; i < 6; i++) L.b.boxMM(i % 2 ? 'glass' : 'plaster', 18 + i * 6, 0, 4 - i * 3, 22 + i * 6, 18 + (i * 7) % 20, 9 - i * 3, { color: i % 2 ? '#8fb2c9' : '#e5e7eb' });
    return {
      outdoor: true, size: s, ambience: 'beach',
      stations: [[0, -12]],
      npcs: [
        { role: 'visitor', x: -4, z: -11.5, rotY: Math.PI, pose: 'idle' },
        { role: 'worshipper', x: 5, z: -6, rotY: 0.6, pose: 'phone' },
      ],
    };
  },
  mountain(L) {
    const s = 15;
    L.b.boxMM('ground', -s - 10, -0.1, -s - 10, s + 10, 0.01, s + 10, { color: '#9a9078' });
    for (let i = 0; i < 18; i++) { const a = i * 2.39, r = 6 + (i % 5) * 1.6; L.b.box('concrete', Math.sin(a) * r, 0.4, Math.cos(a) * r - 2, 1.4 + (i % 3) * 0.6, 0.8 + (i % 4) * 0.4, 1.2, { color: '#8a8378', ry: a }); }
    L.b.box('paint', 0, 3, -9, 0.4, 6, 0.4, { color: '#ffffff' }); L.b.box('paint', 0, 4.4, -9, 2.6, 0.4, 0.4, { color: '#ffffff' });
    L.cylinder(0, -9, 0.4, 6);
    for (let i = 0; i < 6; i++) L.inst('mat', mat(-5 + i * 2, 0.01, -5, 0), ['#7f1d1d', '#1e3a8a', '#15803d'][i % 3]);
    return {
      outdoor: true, size: s, ambience: 'prayer',
      stations: [[0, -6.4]],
      npcs: [
        { role: 'prayer', x: -3, z: -5, rotY: Math.PI, pose: 'kneel', name: 'Mummy G.O. (in prayer)' },
        { role: 'worshipper', x: 3, z: -5, rotY: Math.PI, pose: 'kneel' },
        { role: 'prayer', x: 5.6, z: -2, rotY: -2.2, pose: 'idle' },
      ].map((n) => ({ ...n, rotY: Math.PI })),
    };
  },
  makoko(L) {
    const s = 15;
    L.b.boxMM('water', -60, -1.6, -60, 60, -1.0, 60, { color: '#4b6b5a', uv: 'keep' });
    L.b.boxMM('wood', -s, -0.2, -s, s, 0.01, s, { color: '#6b4f35' }); // the walkways
    for (let i = 0; i < 10; i++) { const x = -12 + (i % 5) * 6, z = -12 + Math.floor(i / 5) * 6; L.b.boxMM('wood', x - 1.8, 0, z - 1.4, x + 1.8, 2.2, z + 1.4, { color: ['#7a5c3e', '#8a6a48', '#5e4630'][i % 3] }); L.b.box('roof', x, 2.4, z, 4.2, 0.08, 3.4, { color: '#8d6e57', rz: 0.08 }); L.collide(x - 1.8, 0, z - 1.4, x + 1.8, 2.2, z + 1.4, 'building'); }
    L.b.boxMM('wood', 4, 0, 3, 11, 2.6, 8, { color: '#f1e3c8' }); L.b.box('roof', 7.5, 2.9, 5.5, 7.6, 0.1, 5.6, { color: '#1e3a8a' }); // the little church
    L.b.box('paint', 7.5, 3.8, 3.0, 0.16, 1.6, 0.16, { color: '#ffffff' }); L.b.box('paint', 7.5, 4.1, 3.0, 0.9, 0.16, 0.16, { color: '#ffffff' });
    L.collide(4, 0, 3, 11, 2.6, 8, 'building');
    return {
      outdoor: true, size: s, ambience: 'beach',
      stations: [[7.5, 1.8], [-3, 5]],
      npcs: [
        { role: 'minister', x: 6.5, z: 1.8, rotY: Math.PI, pose: 'talk', name: 'Pastor Kunle (Makoko outreach)' },
        { role: 'visitor', x: -3.6, z: 6, rotY: 0, pose: 'idle', scale: 0.62 },
        { role: 'visitor', x: -2.2, z: 6.2, rotY: 0, pose: 'dance', scale: 0.62 },
      ],
    };
  },
  campus(L) {
    const s = 15;
    L.b.boxMM('ground', -s - 10, -0.1, -s - 10, s + 10, 0.01, s + 10, { color: '#5f8f3a' });
    L.b.boxMM('concrete', -2, 0, -s, 2, 0.02, s, { color: '#d6d3cb' });
    L.b.boxMM('plaster', -12, 0, -14, 12, 9, -10, { color: '#f5f0e1' }); L.collide(-12, 0, -14, 12, 9, -10, 'building');
    for (let i = 0; i < 8; i++) L.b.box('glass', -10 + i * 2.85, 4.5, -9.98, 1.6, 1.2, 0.04, { color: '#7aa6c2' });
    screenText(L, ['UNIVERSITY OF LAGOS', 'In deed and in truth'], 0, 7.5, -9.95, 8, 1.4, 0, '#1e3a8a', '#facc15');
    benchRow(L, -6, -4, 0, 2); benchRow(L, 4, -4, 0, 2);
    for (let i = 0; i < 6; i++) L.inst(i % 2 ? 'mango' : 'palm0', mat(-13 + i * 5.2, 0, 6 + (i % 2) * 4, i));
    return {
      outdoor: true, size: s, ambience: 'town',
      stations: [[0, -6]],
      npcs: [
        { role: 'worshipper', x: -0.8, z: -7, rotY: 0, pose: 'talk', name: 'The fellowship president' },
        { role: 'visitor', x: 1.2, z: -6.2, rotY: -2.6, pose: 'idle' },
        { role: 'choir', x: -6.5, z: -4 - 0.34, rotY: Math.PI, pose: 'sit' },
      ],
    };
  },
};
