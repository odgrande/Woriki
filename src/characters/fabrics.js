// Procedural fabric textures painted on canvas: Ankara wax prints, stripes, lace and a
// neutral cotton weave. All tiles are seamless; garment UVs are in metres, so each
// texture's `tile` (metres per repeat) sets a believable motif size on the body.
import * as THREE from 'three';

const SIZE = 512;

/** Metres covered by one texture repeat. */
export const TILE_METRES = { 'ankara-1': 0.36, 'ankara-2': 0.4, 'ankara-3': 0.3, stripes: 0.16, lace: 0.2, plain: 0.06, weave: 0.06 };

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const col = (hex) => new THREE.Color(hex);
function shade(hex, f) { // f < 1 darker, > 1 lighter (towards white)
  const c = col(hex);
  if (f <= 1) c.multiplyScalar(f);
  else c.lerp(new THREE.Color(1, 1, 1), Math.min(1, f - 1));
  return '#' + c.getHexString();
}
function mix(a, b, t) { return '#' + col(a).lerp(col(b), t).getHexString(); }
function luma(hex) { const c = col(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

/** Draw a motif at (x, y) and its wrapped copies so the tile is seamless. */
function wrapped(g, x, y, r, draw) {
  for (const dx of [-SIZE, 0, SIZE]) {
    for (const dy of [-SIZE, 0, SIZE]) {
      const px = x + dx, py = y + dy;
      if (px + r < 0 || px - r > SIZE || py + r < 0 || py - r > SIZE) continue;
      g.save(); g.translate(px, py); draw(g); g.restore();
    }
  }
}

/** Wax-print character: slight mottling plus fine crackle veins. */
function waxFinish(g, rnd, dark) {
  g.save();
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
    const s = 1 + rnd() * 3;
    g.fillRect(rnd() * SIZE, rnd() * SIZE, s, s);
  }
  g.strokeStyle = dark;
  g.lineWidth = 0.8;
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = 0.08 + rnd() * 0.1;
    let x = rnd() * SIZE, y = rnd() * SIZE;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.restore();
  weaveOverlay(g, rnd, 0.05);
}

function weaveOverlay(g, rnd, strength) {
  g.save();
  for (let y = 0; y < SIZE; y += 2) { g.fillStyle = `rgba(0,0,0,${strength * (0.4 + rnd() * 0.6)})`; g.fillRect(0, y, SIZE, 1); }
  for (let x = 0; x < SIZE; x += 2) { g.fillStyle = `rgba(255,255,255,${strength * 0.6 * (0.4 + rnd() * 0.6)})`; g.fillRect(x, 0, 1, SIZE); }
  g.restore();
}

function palette(primary, secondary) {
  const cream = '#f4ead2';
  const ink = '#16110d';
  const dark = shade(primary, 0.45);
  // A third colour that harmonises: warm mustard for cool primaries, teal for warm ones.
  const c = col(primary);
  const warm = c.r > c.b;
  const third = warm ? '#0f766e' : '#e0a526';
  return { bg: primary, a: secondary, cream, ink, dark, third, light: luma(secondary) > 0.55 ? ink : cream };
}

// --- Ankara 1: bold concentric "target" circles on a brick grid, dotted between.
function ankara1(g, P, rnd) {
  g.fillStyle = P.bg; g.fillRect(0, 0, SIZE, SIZE);
  const cell = SIZE / 2;
  const centers = [[cell / 2, cell / 2], [cell * 1.5, cell / 2], [0, cell * 1.5], [cell, cell * 1.5]];
  // dotted background lattice
  for (let y = 16; y < SIZE; y += 32) {
    for (let x = (y / 32) % 2 ? 0 : 16; x < SIZE; x += 32) {
      g.fillStyle = P.dark; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  }
  centers.forEach(([x, y], i) => {
    wrapped(g, x, y, 120, (c) => {
      const rings = [[112, P.ink], [104, P.a], [80, P.ink], [74, P.cream], [56, i % 2 ? P.third : P.dark], [40, P.a], [30, P.ink], [22, P.cream]];
      for (const [r, f] of rings) { c.fillStyle = f; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); }
      // petals on the outer band
      c.fillStyle = P.ink;
      for (let k = 0; k < 16; k++) {
        c.save(); c.rotate((k / 16) * Math.PI * 2); c.beginPath(); c.ellipse(0, -92, 5, 9, 0, 0, Math.PI * 2); c.fill(); c.restore();
      }
      c.fillStyle = P.a;
      for (let k = 0; k < 8; k++) { c.save(); c.rotate((k / 8) * Math.PI * 2 + 0.2); c.beginPath(); c.arc(0, -64, 5, 0, Math.PI * 2); c.fill(); c.restore(); }
      c.fillStyle = P.dark; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
    });
  });
  waxFinish(g, rnd, P.ink);
}

// --- Ankara 2: large stylised leaves / fronds at varied angles.
function ankara2(g, P, rnd) {
  g.fillStyle = P.bg; g.fillRect(0, 0, SIZE, SIZE);
  // speckle field
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rnd() < 0.5 ? P.dark : mix(P.bg, P.cream, 0.35);
    g.beginPath(); g.arc(rnd() * SIZE, rnd() * SIZE, 1.5 + rnd() * 2.5, 0, Math.PI * 2); g.fill();
  }
  const leaves = [
    [110, 120, 0.6, P.a], [370, 90, -0.9, P.cream], [250, 300, 2.3, P.a], [60, 400, -2.2, P.third], [430, 380, 0.9, P.cream], [250, 40, 1.9, P.third],
  ];
  for (const [x, y, rot, fill] of leaves) {
    wrapped(g, x, y, 150, (c) => {
      c.rotate(rot);
      const len = 120, w = 48;
      c.fillStyle = P.ink;
      c.beginPath(); c.moveTo(0, -len - 6); c.bezierCurveTo(w + 8, -len * 0.5, w + 8, len * 0.5, 0, len + 6); c.bezierCurveTo(-w - 8, len * 0.5, -w - 8, -len * 0.5, 0, -len - 6); c.fill();
      c.fillStyle = fill;
      c.beginPath(); c.moveTo(0, -len); c.bezierCurveTo(w, -len * 0.5, w, len * 0.5, 0, len); c.bezierCurveTo(-w, len * 0.5, -w, -len * 0.5, 0, -len); c.fill();
      c.strokeStyle = P.ink; c.lineWidth = 4;
      c.beginPath(); c.moveTo(0, -len + 4); c.lineTo(0, len - 4); c.stroke();
      c.lineWidth = 2.5;
      for (let k = -4; k <= 4; k++) {
        const yy = k * 22;
        const ww = w * Math.cos((k / 5) * Math.PI / 2) * 0.85;
        c.beginPath(); c.moveTo(0, yy); c.quadraticCurveTo(ww * 0.5, yy - 10, ww, yy - 22); c.stroke();
        c.beginPath(); c.moveTo(0, yy); c.quadraticCurveTo(-ww * 0.5, yy - 10, -ww, yy - 22); c.stroke();
      }
      c.fillStyle = P.dark;
      for (let k = -3; k <= 3; k++) { c.beginPath(); c.arc(w * 0.45, k * 26 - 6, 3.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(-w * 0.45, k * 26 - 6, 3.5, 0, Math.PI * 2); c.fill(); }
    });
  }
  waxFinish(g, rnd, P.ink);
}

// --- Ankara 3: geometric diamonds with zig-zag bands (adire / kente feel).
function ankara3(g, P, rnd) {
  g.fillStyle = P.bg; g.fillRect(0, 0, SIZE, SIZE);
  const n = 4, step = SIZE / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = i * step + step / 2, cy = j * step + step / 2;
      const alt = (i + j) % 2;
      g.save(); g.translate(cx, cy);
      const s = step * 0.48;
      const layers = [[1, P.ink], [0.9, alt ? P.a : P.cream], [0.66, P.ink], [0.58, alt ? P.dark : P.third], [0.36, P.ink], [0.28, alt ? P.cream : P.a]];
      for (const [k, f] of layers) {
        g.fillStyle = f; g.beginPath(); g.moveTo(0, -s * k); g.lineTo(s * k, 0); g.lineTo(0, s * k); g.lineTo(-s * k, 0); g.closePath(); g.fill();
      }
      g.fillStyle = P.ink; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  // zig-zag bands between diamond rows
  g.strokeStyle = P.cream; g.lineWidth = 5;
  for (let j = 0; j <= n; j++) {
    const y = j * step;
    g.beginPath();
    for (let x = 0; x <= SIZE; x += 16) g.lineTo(x, y + ((x / 16) % 2 ? 7 : -7));
    g.stroke();
  }
  // small triangles in the gaps
  g.fillStyle = P.a;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * step, y = j * step + step / 2;
      g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 10, y); g.lineTo(x, y + 10); g.lineTo(x - 10, y); g.fill();
    }
  }
  waxFinish(g, rnd, P.ink);
}

// --- Stripes: shirting with paired stripes and a fine accent line.
function stripes(g, P, rnd) {
  g.fillStyle = P.bg; g.fillRect(0, 0, SIZE, SIZE);
  const accent = luma(P.bg) > 0.6 ? P.a : P.cream;
  for (let x = 0; x < SIZE; x += 64) {
    g.fillStyle = accent; g.fillRect(x + 6, 0, 10, SIZE); g.fillRect(x + 22, 0, 4, SIZE);
    g.fillStyle = mix(accent, P.bg, 0.5); g.fillRect(x + 44, 0, 2, SIZE);
  }
  weaveOverlay(g, rnd, 0.06);
}

// --- Lace: scalloped flowers, cord outlines and eyelets over the base colour.
function lace(g, P, rnd) {
  const base = P.bg;
  const motif = luma(base) > 0.6 ? shade(base, 0.86) : shade(base, 1.35);
  const cord = luma(base) > 0.6 ? shade(base, 0.7) : shade(base, 1.6);
  const hole = shade(base, 0.55);
  g.fillStyle = base; g.fillRect(0, 0, SIZE, SIZE);
  // fine net
  g.strokeStyle = mix(base, hole, 0.25); g.lineWidth = 1;
  for (let i = -SIZE; i < SIZE * 2; i += 12) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + SIZE, SIZE); g.stroke();
    g.beginPath(); g.moveTo(i, SIZE); g.lineTo(i + SIZE, 0); g.stroke();
  }
  const flowers = [[128, 128, 1], [384, 384, 1], [384, 120, 0.7], [120, 390, 0.7], [256, 256, 0.5]];
  for (const [x, y, s] of flowers) {
    wrapped(g, x, y, 110 * s, (c) => {
      c.scale(s, s);
      for (let k = 0; k < 8; k++) {
        c.save(); c.rotate((k / 8) * Math.PI * 2);
        c.fillStyle = motif; c.strokeStyle = cord; c.lineWidth = 3;
        c.beginPath(); c.ellipse(0, -52, 22, 40, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = hole; c.beginPath(); c.ellipse(0, -56, 6, 14, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      c.fillStyle = cord; c.beginPath(); c.arc(0, 0, 18, 0, Math.PI * 2); c.fill();
      c.fillStyle = motif; c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fill();
      for (let k = 0; k < 16; k++) {
        c.save(); c.rotate((k / 16) * Math.PI * 2);
        c.fillStyle = hole; c.beginPath(); c.arc(0, -98, 4, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    });
  }
  weaveOverlay(g, rnd, 0.03);
}

// --- Neutral cotton weave (greyscale multiplier for plain-coloured cloth).
function weave(g, P, rnd) {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 4) {
    for (let x = 0; x < SIZE; x += 4) {
      const v = 225 + Math.floor(rnd() * 30) - (((x + y) / 4) % 2 ? 14 : 0);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 4, 2);
      const w = v - 10;
      g.fillStyle = `rgb(${w},${w},${w})`;
      g.fillRect(x + (((y / 4) % 2) ? 2 : 0), y + 2, 2, 2);
    }
  }
  // occasional slub threads
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.2})`;
    g.fillRect(rnd() * SIZE, Math.floor(rnd() * SIZE / 2) * 2, 20 + rnd() * 60, 1);
  }
}

const PAINTERS = { 'ankara-1': ankara1, 'ankara-2': ankara2, 'ankara-3': ankara3, stripes, lace, weave };

const cache = new Map();

/**
 * Get (cached) fabric texture info.
 * @param {string} kind 'ankara-1'|'ankara-2'|'ankara-3'|'stripes'|'lace'|'weave'
 * @param {string} primary
 * @param {string} secondary
 * @param {number} [anisotropy]
 * @returns {{texture: THREE.CanvasTexture, average: string, tile: number}}
 */
export function getFabric(kind, primary = '#888888', secondary = '#dddddd', anisotropy = 4) {
  const key = kind === 'weave' ? 'weave' : `${kind}|${primary}|${secondary}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas();
  const g = c.getContext('2d');
  const paint = PAINTERS[kind] || weave;
  paint(g, palette(primary, secondary), rngFrom(hashStr(key)));
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = kind === 'weave' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const tile = TILE_METRES[kind] || 0.3;
  texture.repeat.set(1 / tile, 1 / tile);
  // Average colour for the low-detail crowd version.
  const small = document.createElement('canvas');
  small.width = small.height = 8;
  const sg = small.getContext('2d');
  sg.drawImage(c, 0, 0, 8, 8);
  const px = sg.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4;
  const average = '#' + new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace).getHexString();
  const info = { texture, average, tile };
  cache.set(key, info);
  return info;
}

/** Number of distinct fabric textures created (for stats). */
export function fabricCount() { return cache.size; }
