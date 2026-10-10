// Painted textures for the Lagos map, so it reads like a city seen from the air instead of
// flat colours: laterite earth, grey-brown dense neighbourhoods, green patches and mangroves
// along the shore, sandy beaches and road verges; and water that is lighter near the shore,
// brown-green in the lagoon and deep blue in the Atlantic.
import * as THREE from 'three';
import { LAND, BEACHES, ROADS, DENSE, BOUNDS, rng32 } from './geography.js';

const PAD = 40; // painted margin around the visible map
export const PAINT_BOUNDS = { minX: BOUNDS.minX - PAD, maxX: BOUNDS.maxX + PAD, minZ: BOUNDS.minZ - PAD, maxZ: BOUNDS.maxZ + PAD };
const W = PAINT_BOUNDS.maxX - PAINT_BOUNDS.minX, H = PAINT_BOUNDS.maxZ - PAINT_BOUNDS.minZ;

/** World [x, z] → texture uv (for geometry built in world coordinates). */
export function worldUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - PAINT_BOUNDS.minX) / W;
    uv[i * 2 + 1] = 1 - (p.getZ(i) - PAINT_BOUNDS.minZ) / H;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function canvasFor(px) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round((px * H) / W);
  const g = c.getContext('2d');
  const k = c.width / W;
  const X = (x) => (x - PAINT_BOUNDS.minX) * k, Z = (z) => (z - PAINT_BOUNDS.minZ) * k;
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); };
  const line = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); };
  return { c, g, k, X, Z, poly, line };
}

const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

/** The ground: earth, neighbourhoods, greenery, mangroves, beaches and road verges. */
export function paintGround(quality = 'medium') {
  const { c, g, k, X, Z, poly, line } = canvasFor(quality === 'low' ? 1024 : 2048);
  const r = rng32(29);
  g.fillStyle = '#b5a07a';
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  // clip to land
  g.beginPath();
  for (const L of LAND) L.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
  g.clip('evenodd');
  // earth variation
  const blob = (x, y, rad, col, a) => { g.globalAlpha = a; g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  const earth = ['#a99168', '#c2ad84', '#9c8865', '#b9a37b', '#ad9a74'];
  for (let i = 0; i < 9000; i++) blob(r() * c.width, r() * c.height, (1 + r() * 7) * k * 0.5, earth[i % earth.length], 0.35);
  // vegetation: bushes and farms, more in the east and the north
  const green = ['#6f8a4a', '#7d9a55', '#5f7d40', '#86a25e'];
  for (let i = 0; i < 7000; i++) {
    const x = PAINT_BOUNDS.minX + r() * W, z = PAINT_BOUNDS.minZ + r() * H;
    const wild = (x > 60 ? 0.6 : 0.25) + (z < -70 ? 0.3 : 0);
    if (r() > wild) continue;
    blob(X(x), Z(z), (1 + r() * 4) * k, green[i % green.length], 0.55);
  }
  // dense neighbourhoods: grey-brown roofs and concrete
  const town = ['#8f8676', '#9b9182', '#857b6c', '#a39883', '#7e7466'];
  for (const [cx, cz, rad] of DENSE) {
    for (let i = 0; i < 1400; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(-2 * Math.log(1 - r() * 0.98)) * rad * 0.55;
      blob(X(cx + Math.cos(a) * d), Z(cz + Math.sin(a) * d), (0.4 + r() * 1.6) * k, town[i % town.length], 0.5);
    }
  }
  // mangroves and swamp along the lagoon shores
  g.globalAlpha = 0.45;
  g.strokeStyle = '#4f6b3c';
  g.lineWidth = 3 * k;
  g.lineJoin = 'round';
  for (const L of LAND) { poly(L.pts); g.stroke(); }
  g.restore();
  g.globalAlpha = 1;
  // beaches
  g.fillStyle = '#e8d6a3';
  for (const B of BEACHES) { poly(B.pts); g.fill(); }
  // light verges along the roads (the asphalt itself is 3D)
  g.strokeStyle = '#a49a86';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const rd of ROADS) { g.lineWidth = (rd.w + 1.6) * k; line(rd.pts); g.stroke(); }
  return tex(c);
}

/** Water colour: light near the shore, brown-green lagoon, deep blue ocean. */
export function paintWater() {
  const { c, g, k, X, Z, poly } = canvasFor(1024);
  // lagoon
  g.fillStyle = '#2e6f84';
  g.fillRect(0, 0, c.width, c.height);
  // the Atlantic: deeper and bluer to the south
  const y0 = Z(50), y1 = Z(PAINT_BOUNDS.maxZ);
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, '#2a6f9a');
  grad.addColorStop(1, '#0f3f6e');
  g.filter = 'blur(6px)';
  g.fillStyle = grad;
  g.fillRect(0, y0, c.width, y1 - y0);
  // shallow water near every shore
  g.filter = `blur(${Math.round(4 * k)}px)`;
  g.fillStyle = '#5fa39c';
  for (const L of LAND) { poly(L.pts); g.fill(); }
  g.filter = 'none';
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft cloud puff texture. */
export function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng32(7);
  for (let i = 0; i < 9; i++) {
    const x = 30 + r() * 68, y = 44 + r() * 40, rad = 18 + r() * 22;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  return tex(c);
}
