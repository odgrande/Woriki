// Procedural canvas textures for the Yaba street: painted plaster, zinc, asphalt,
// laterite, concrete, pavers, tiles, wood, fabric, foliage, burglar-proof grilles and
// two atlases (hand-painted signs; windows/doors/vehicles/small props).
// Everything is generated at runtime — no image files to download.
import * as THREE from 'three';
import { rng, noiseField, sample, clamp, smooth, lerp } from './noise.js';

/** Let the browser breathe between heavy jobs (MessageChannel is not throttled like setTimeout). */
export const tick = () => new Promise((r) => {
  if (typeof MessageChannel === 'undefined') { setTimeout(r, 0); return; }
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); r(); };
  ch.port2.postMessage(0);
});

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Per-pixel painter. fn(u, v, o) writes o.r, o.g, o.b (0..1), optional o.a and o.h (height).
 * v = 0 is the BOTTOM of the texture (matches three's flipY for canvas textures).
 */
function pixels(w, h, fn) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const height = new Float32Array(w * h);
  const o = { r: 0, g: 0, b: 0, a: 1, h: 0, x: 0, y: 0 };
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      o.a = 1; o.h = 0; o.x = x; o.y = y;
      fn((x + 0.5) / w, v, o);
      const i = (y * w + x) * 4;
      d[i] = clamp(o.r) * 255; d[i + 1] = clamp(o.g) * 255; d[i + 2] = clamp(o.b) * 255; d[i + 3] = clamp(o.a) * 255;
      height[y * w + x] = o.h;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, height, w, h };
}

/** Draw into a mask canvas with 2D calls; returns a Float32Array of white coverage. */
function mask(w, h, draw) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  draw(g);
  const d = g.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i * 4 + 3] / 255;
  return out;
}

/** Tangent-space normal map from a height array (wraps at edges). */
function normalMap(height, w, h, strength = 2) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = height[y * w + ((x - 1 + w) % w)], r = height[y * w + ((x + 1) % w)];
      const t = height[((y - 1 + h) % h) * w + x], b = height[((y + 1) % h) * w + x];
      // canvas y grows downward, texture v grows upward → flip dy
      let nx = (l - r) * strength, ny = (b - t) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / len * 0.5 + 0.5) * 255; d[i + 1] = (ny / len * 0.5 + 0.5) * 255; d[i + 2] = (nz / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function tex(canvas, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Tiling surface textures. Each returns { map, normalMap?, size: [metresU, metresV] }.
// ---------------------------------------------------------------------------------------------

function plaster(S) {
  const w = S, h = S * 2; // 4 m × 8 m
  const F1 = noiseField(96, 192, 4, 8, 5, 11);
  const F2 = noiseField(48, 96, 2, 4, 4, 23);
  const F3 = noiseField(160, 24, 40, 2, 2, 37);
  const F4 = noiseField(160, 320, 12, 24, 3, 41);
  const F5 = noiseField(48, 96, 3, 6, 3, 43);
  const r = rng(5);
  const p = pixels(w, h, (u, v, o) => {
    const ym = v * 8;
    const n1 = sample(F1, u, v);
    let base = 0.91 + (n1 - 0.5) * 0.09 + (r() - 0.5) * 0.035;
    let R = base, G = base * 0.988, B = base * 0.965;
    // soft mildew / dirt, heavier near the ground
    const k = smooth(0.5, 0.85, sample(F2, u, v)) * (0.08 + 0.14 * smooth(2.2, 0.2, ym));
    R *= 1 - k; G *= 1 - k * 0.9; B *= 1 - k * 0.92;
    // faint rain streaks
    const st = smooth(0.6, 0.92, sample(F3, u, v)) * smooth(0.3, 2.5, ym) * 0.11;
    R *= 1 - st; G *= 1 - st; B *= 1 - st * 0.95;
    let hh = n1 * 0.5 + r() * 0.25;
    // small chips of flaked paint, only in some areas
    const pe = sample(F4, u, v) * 0.75 + sample(F5, u, v) * 0.25;
    if (pe > 0.7) {
      const t = smooth(0.7, 0.715, pe);
      R = lerp(R, 0.66, t * 0.8); G = lerp(G, 0.64, t * 0.8); B = lerp(B, 0.6, t * 0.8);
      hh -= t * 0.6;
    }
    // red laterite splash from the rain, strongest at the foot of the wall
    const sp = smooth(0.7, 0.0, ym + (sample(F1, (u * 3) % 1, v) - 0.5) * 0.45) * 0.8;
    R = lerp(R, 0.62 * R + 0.12, sp); G = lerp(G, 0.38 * G + 0.04, sp); B = lerp(B, 0.26 * B + 0.02, sp);
    o.r = R; o.g = G; o.b = B; o.h = hh;
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 1.0), { srgb: false }), size: [4, 8] };
}

/** Clean interior emulsion paint: soft roller mottling, no splash or chips. */
function plasterIn(S) {
  const w = S / 2, h = S / 2; // 3 m × 3 m
  const F1 = noiseField(64, 64, 6, 6, 4, 13);
  const F2 = noiseField(32, 32, 2, 2, 3, 17);
  const r = rng(7);
  const p = pixels(w, h, (u, v, o) => {
    const n1 = sample(F1, u, v), n2 = sample(F2, u, v);
    const c = 0.93 + (n1 - 0.5) * 0.045 + (n2 - 0.5) * 0.05 + (r() - 0.5) * 0.02;
    o.r = c; o.g = c * 0.99; o.b = c * 0.975; o.h = n1 * 0.4 + r() * 0.15;
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 0.5), { srgb: false }), size: [3, 3] };
}

function zinc(S) {
  const w = S, h = S; // 4 m × 4 m; corrugations run along v (down the slope)
  const F1 = noiseField(64, 64, 4, 4, 5, 51);
  const F2 = noiseField(96, 64, 12, 3, 4, 53);
  const F3 = noiseField(128, 16, 64, 2, 2, 57);
  const F4 = noiseField(32, 32, 2, 2, 3, 59);
  const r = rng(9);
  const waves = 44;
  const p = pixels(w, h, (u, v, o) => {
    const ph = u * waves * Math.PI * 2;
    const c = Math.cos(ph);
    let base = 0.82 + c * 0.06 + (sample(F1, u, v) - 0.5) * 0.12 + (r() - 0.5) * 0.03;
    let R = base, G = base, B = base * 1.01;
    const ru = sample(F2, u, v) * 0.7 + sample(F4, u, v) * 0.3 + sample(F3, u, v) * 0.2 - 0.08;
    const rust = smooth(0.52, 0.7, ru) * 0.65;
    R = lerp(R, 0.52, rust); G = lerp(G, 0.32, rust); B = lerp(B, 0.2, rust);
    // dirt streaks running down the slope
    const st = smooth(0.55, 0.9, sample(F3, u, v)) * 0.18;
    R *= 1 - st; G *= 1 - st; B *= 1 - st;
    // sheet laps every 0.9 m and nail rows every metre
    const lap = Math.abs(((u * 4) % 0.9) - 0.02) < 0.012;
    if (lap) { R *= 0.75; G *= 0.75; B *= 0.75; }
    const nail = Math.abs(((v * 4) % 1) - 0.5) < 0.01 && c > 0.9;
    if (nail) { R = 0.35; G = 0.3; B = 0.28; }
    o.r = R; o.g = G; o.b = B; o.h = c * 1.5 + rust * 0.1;
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 1.4), { srgb: false }), size: [4, 4] };
}

function asphalt(S) {
  const w = S * 2, h = S; // 16 m along the road × 8 m across it (road edges at v = 0 and 1)
  const F1 = noiseField(128, 64, 8, 4, 5, 61);
  const F2 = noiseField(128, 64, 16, 8, 3, 63);
  const F3 = noiseField(256, 32, 64, 4, 2, 67);
  const r = rng(13);
  const cracks = mask(w, h, (g) => {
    const rr = rng(21);
    g.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      let x = rr() * w, y = h * (0.12 + rr() * 0.76), a = rr() * Math.PI * 2;
      g.lineWidth = Math.max(1, S / 512) * (0.8 + rr() * 1.2);
      g.globalAlpha = 0.5 + rr() * 0.5;
      g.beginPath(); g.moveTo(x, y);
      const n = 6 + rr() * 18;
      for (let i = 0; i < n; i++) {
        a += (rr() - 0.5) * 1.3; x += Math.cos(a) * S * 0.02; y += Math.sin(a) * S * 0.02;
        g.lineTo(x, y);
        if (rr() < 0.15) { g.moveTo(x, y); a += (rr() - 0.5) * 2.5; }
      }
      g.stroke();
    }
  });
  const pr = rng(31);
  const patches = [];
  for (let k = 0; k < 3; k++) patches.push({ x: pr() * 0.9 + 0.05, y: 0.2 + pr() * 0.55, w: 0.015 + pr() * 0.035, h: 0.04 + pr() * 0.12 });
  const holes = [];
  for (let k = 0; k < 4; k++) holes.push({ x: pr(), y: k < 3 ? (pr() < 0.5 ? 0.1 + pr() * 0.1 : 0.8 + pr() * 0.1) : 0.3 + pr() * 0.4, r: 0.004 + pr() * 0.014 });
  const pp = pixels(w, h, (u, v, o) => {
    const n1 = sample(F1, u, v), n2 = sample(F2, u, v);
    let g0 = 0.3 + (n1 - 0.5) * 0.1 + (n2 - 0.5) * 0.05;
    const agg = r();
    if (agg < 0.07) g0 += 0.1; else if (agg > 0.95) g0 -= 0.06;
    g0 += (r() - 0.5) * 0.03;
    let R = g0, G = g0, B = g0 * 1.03, hh = agg < 0.07 ? 0.4 : 0;
    // wheel paths (oil), lanes at v≈0.18/0.38 and 0.62/0.82
    const lane = Math.min(Math.abs(v - 0.2), Math.abs(v - 0.38), Math.abs(v - 0.62), Math.abs(v - 0.8));
    const oil = smooth(0.05, 0.0, lane) * (0.4 + sample(F3, u, v) * 0.6) * 0.12;
    R -= oil; G -= oil; B -= oil * 0.9;
    // repaired patches (darker, fresher, with sealed edges)
    for (const q of patches) {
      const dx = Math.abs(u - q.x), dy = Math.abs(v - q.y);
      const jag = (n2 - 0.5) * 0.012;
      if (dx < q.w + jag && dy < q.h + jag) {
        const f = 0.24 + (agg - 0.5) * 0.05 + (n1 - 0.5) * 0.05;
        R = lerp(R, f, 0.75); G = lerp(G, f, 0.75); B = lerp(B, f * 1.02, 0.75); hh += 0.2;
      }
    }
    // potholes with red dust and puddle
    for (const q of holes) {
      let dx = u - q.x; if (dx > 0.5) dx -= 1; if (dx < -0.5) dx += 1;
      const d = Math.hypot(dx * 2, v - q.y) / q.r + (n2 - 0.5) * 0.8;
      if (d < 1.25) {
        const rim = smooth(1.25, 0.9, d);
        R = lerp(R, 0.18, rim); G = lerp(G, 0.17, rim); B = lerp(B, 0.17, rim);
        if (d < 0.85) { R = 0.3 + n1 * 0.08; G = 0.22 + n1 * 0.05; B = 0.17; hh -= 1.2; }
        if (d < 0.6) { R = 0.16; G = 0.15; B = 0.12; }
      }
    }
    const ck = cracks[o.y * w + o.x];
    if (ck > 0) { const t = ck * 0.75; R = lerp(R, 0.1, t); G = lerp(G, 0.1, t); B = lerp(B, 0.1, t); hh -= ck * 0.8; }
    // broken road edges eaten by laterite
    const ev = Math.min(v, 1 - v) * 8 + (sample(F2, u, v) - 0.5) * 0.7 + (sample(F1, u * 2 % 1, v) - 0.5) * 0.5;
    if (ev < 0.2) { const t = smooth(0.2, 0.05, ev); R = lerp(R, 0.6, t); G = lerp(G, 0.38, t); B = lerp(B, 0.25, t); hh -= t * 0.5; }
    // red dust film
    const dust = smooth(0.45, 0.8, n1) * 0.22 + smooth(0.8, 0.0, Math.min(v, 1 - v) * 8) * 0.25;
    R = lerp(R, 0.6, dust); G = lerp(G, 0.45, dust); B = lerp(B, 0.36, dust);
    o.r = R; o.g = G; o.b = B; o.h = hh;
  });
  return { map: tex(pp.canvas, { aniso: 8 }), normalMap: tex(normalMap(pp.height, w, h, 1.5), { srgb: false }), size: [16, 8] };
}

function laterite(S) {
  const w = S, h = S; // 8 m
  const F1 = noiseField(96, 96, 5, 5, 5, 71);
  const F2 = noiseField(64, 64, 3, 3, 4, 73);
  const F3 = noiseField(128, 128, 24, 24, 2, 79);
  const r = rng(17);
  const pebbles = mask(w, h, (g) => {
    const rr = rng(77);
    for (let k = 0; k < 260; k++) {
      g.globalAlpha = 0.35 + rr() * 0.4;
      g.beginPath(); g.ellipse(rr() * w, rr() * h, 0.6 + rr() * S / 320, 0.6 + rr() * S / 420, rr() * 3, 0, 7); g.fill();
    }
  });
  const p = pixels(w, h, (u, v, o) => {
    const n1 = sample(F1, u, v), n2 = sample(F2, u, v), n3 = sample(F3, u, v);
    let R = 0.66 + (n1 - 0.5) * 0.16, G = 0.39 + (n1 - 0.5) * 0.1, B = 0.23 + (n1 - 0.5) * 0.06;
    const comp = smooth(0.55, 0.75, n2) * 0.5; // compacted, dusty paths
    R = lerp(R, 0.72, comp); G = lerp(G, 0.5, comp); B = lerp(B, 0.36, comp);
    const damp = smooth(0.62, 0.8, n3 * 0.5 + n1 * 0.5) * 0.3;
    R *= 1 - damp; G *= 1 - damp; B *= 1 - damp;
    const gr = smooth(0.56, 0.74, 1 - n2 + (n3 - 0.5) * 0.7) * 0.9;
    const blade = r();
    if (gr > 0 && blade < gr * 0.8) {
      const dry = n3 > 0.55;
      const s = 0.75 + blade * 0.4;
      R = lerp(R, dry ? 0.52 * s : 0.3 * s, gr); G = lerp(G, dry ? 0.5 * s : 0.42 * s, gr); B = lerp(B, dry ? 0.25 * s : 0.15 * s, gr);
    }
    let hh = n1 * 0.6 + r() * 0.2 + gr * 0.3;
    const pb = pebbles[o.y * w + o.x];
    if (pb > 0) { R = lerp(R, 0.7, pb); G = lerp(G, 0.54, pb); B = lerp(B, 0.42, pb); hh += pb * 0.8; }
    const g0 = (r() - 0.5) * 0.04;
    o.r = R + g0; o.g = G + g0; o.b = B + g0; o.h = hh;
  });
  return { map: tex(p.canvas, { aniso: 8 }), normalMap: tex(normalMap(p.height, w, h, 1.6), { srgb: false }), size: [8, 8] };
}

function concrete(S) {
  const w = S, h = S; // 4 m
  const F1 = noiseField(64, 64, 4, 4, 5, 81);
  const F2 = noiseField(48, 48, 2, 2, 4, 83);
  const r = rng(19);
  const cracks = mask(w, h, (g) => {
    const rr = rng(85);
    for (let k = 0; k < 8; k++) {
      let x = rr() * w, y = rr() * h, a = rr() * 6.28;
      g.lineWidth = 1; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 12; i++) { a += (rr() - 0.5); x += Math.cos(a) * S * 0.025; y += Math.sin(a) * S * 0.025; g.lineTo(x, y); }
      g.stroke();
    }
  });
  const p = pixels(w, h, (u, v, o) => {
    const n1 = sample(F1, u, v), n2 = sample(F2, u, v);
    let c = 0.8 + (n1 - 0.5) * 0.16 + (r() - 0.5) * 0.06;
    const st = smooth(0.55, 0.85, n2) * 0.22;
    c *= 1 - st;
    let hh = n1 * 0.4 + r() * 0.3;
    if (r() < 0.006) { c *= 0.6; hh -= 0.6; }
    const ck = cracks[o.y * w + o.x];
    if (ck > 0) { c *= 1 - ck * 0.5; hh -= ck * 0.5; }
    o.r = c; o.g = c * 0.99; o.b = c * 0.96; o.h = hh;
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 1.2), { srgb: false }), size: [4, 4] };
}

function pavers(S) {
  const w = S, h = S; // 2.4 m, stretcher bond of 0.2 × 0.1 m pavers
  const cols = 12, rows = 24, pw = w / cols, ph = h / rows;
  const r = rng(23);
  const base = makeCanvas(w, h);
  const g = base.getContext('2d');
  g.fillStyle = '#5c5550'; g.fillRect(0, 0, w, h);
  const top = mask(w, h, (m) => {
    for (let j = 0; j < rows; j++) {
      const off = (j % 2) * pw / 2;
      for (let i = -1; i < cols; i++) {
        const x = i * pw + off, y = j * ph;
        m.fillRect(x + 1.5, y + 1.5, pw - 3, ph - 3);
      }
    }
  });
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * pw / 2;
    for (let i = -1; i < cols; i++) {
      const band = (j % 12 === 0) || r() < 0.06;
      const k = 0.88 + r() * 0.14;
      const c = band ? [160 * k, 112 * k, 92 * k] : [176 * k, 170 * k, 160 * k];
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      g.fillRect(i * pw + off + 1.5, j * ph + 1.5, pw - 3, ph - 3);
    }
  }
  const d = g.getImageData(0, 0, w, h);
  const F1 = noiseField(64, 64, 4, 4, 4, 87);
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, n = sample(F1, x / w, 1 - y / h);
    const f = (0.85 + n * 0.25) * (0.94 + r() * 0.1);
    d.data[i * 4] *= f; d.data[i * 4 + 1] *= f; d.data[i * 4 + 2] *= f;
    height[i] = top[i] + r() * 0.08;
  }
  g.putImageData(d, 0, 0);
  return { map: tex(base), normalMap: tex(normalMap(height, w, h, 1.6), { srgb: false }), size: [2.4, 2.4] };
}

function floorTiles(S) {
  const w = S, h = S, n = 4; // 2.4 m → 60 cm tiles
  const F1 = noiseField(96, 96, 6, 6, 5, 91);
  const F2 = noiseField(96, 96, 3, 3, 4, 93);
  const r = rng(29);
  const tileShade = []; for (let i = 0; i < n * n; i++) tileShade.push(0.95 + r() * 0.07);
  const p = pixels(w, h, (u, v, o) => {
    const tu = u * n, tv = v * n;
    const fu = tu - Math.floor(tu), fv = tv - Math.floor(tv);
    const grout = Math.min(fu, 1 - fu, fv, 1 - fv) < 0.012;
    if (grout) { o.r = 0.62; o.g = 0.6; o.b = 0.56; o.h = 0; return; }
    const s = tileShade[Math.floor(tv) * n + Math.floor(tu)];
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 5 + v * 3 + sample(F1, u, v) * 4) * Math.PI)), 12) * 0.18;
    const m = (sample(F2, u, v) - 0.5) * 0.08;
    o.r = (0.93 + m - vein) * s; o.g = (0.9 + m - vein) * s; o.b = (0.84 + m - vein * 0.9) * s; o.h = 1;
  });
  return { map: tex(p.canvas, { aniso: 8 }), normalMap: tex(normalMap(p.height, w, h, 0.6), { srgb: false }), size: [2.4, 2.4] };
}

function ceiling(S) {
  const w = S / 2, h = S / 2; // 2 m, PVC strips 20 cm
  const r = rng(33);
  const p = pixels(w, h, (u, v, o) => {
    const f = (u * 10) % 1;
    const groove = f < 0.025 ? 0.78 : f < 0.05 ? 0.9 : 1;
    const c = 0.95 * groove + (r() - 0.5) * 0.015;
    o.r = c; o.g = c; o.b = c * 0.99; o.h = groove;
  });
  return { map: tex(p.canvas), size: [2, 2] };
}

function carpet(S) {
  const w = S / 2, h = S / 2; // 1 m
  const F1 = noiseField(32, 32, 4, 4, 3, 97);
  const r = rng(37);
  const p = pixels(w, h, (u, v, o) => {
    const c = 0.82 + (sample(F1, u, v) - 0.5) * 0.12 + (r() - 0.5) * 0.14;
    o.r = c; o.g = c; o.b = c; o.h = r();
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 0.6), { srgb: false }), size: [1, 1] };
}

function wood(S) {
  const w = S, h = S; // 2 m, grain along u
  const F1 = noiseField(64, 64, 2, 8, 4, 101);
  const F2 = noiseField(256, 16, 64, 2, 2, 103);
  const r = rng(41);
  const p = pixels(w, h, (u, v, o) => {
    const t = v * 26 + sample(F1, u, v) * 5;
    const ring = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const c = 0.72 + ring * 0.12 + (sample(F2, u, v) - 0.5) * 0.12 + (r() - 0.5) * 0.04;
    o.r = c; o.g = c * 0.97; o.b = c * 0.93; o.h = ring * 0.3;
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 0.8), { srgb: false }), size: [2, 2] };
}

function fabric(S) {
  const w = S / 2, h = S / 2; // 1 m
  const F1 = noiseField(32, 32, 4, 4, 3, 107);
  const r = rng(43);
  const p = pixels(w, h, (u, v, o) => {
    const weave = ((o.x >> 1) + (o.y >> 1)) % 2 ? 0.95 : 0.85;
    const c = weave * (0.9 + (sample(F1, u, v) - 0.5) * 0.15) + (r() - 0.5) * 0.04;
    o.r = c; o.g = c; o.b = c; o.h = weave;
  });
  return { map: tex(p.canvas), size: [1, 1] };
}

function metal(S) {
  const w = S / 2, h = S / 2; // 2 m
  const F1 = noiseField(32, 32, 4, 4, 4, 109);
  const F2 = noiseField(32, 32, 3, 3, 3, 113);
  const r = rng(47);
  const p = pixels(w, h, (u, v, o) => {
    let c = 0.9 + (sample(F1, u, v) - 0.5) * 0.12 + (r() - 0.5) * 0.04;
    const rust = smooth(0.62, 0.8, sample(F2, u, v));
    o.r = lerp(c, 0.6, rust); o.g = lerp(c, 0.36, rust); o.b = lerp(c, 0.22, rust);
  });
  return { map: tex(p.canvas), size: [2, 2] };
}

function bark(S) {
  const w = S / 4, h = S; // 0.8 m around × 3.2 m tall; palm-trunk rings
  const F1 = noiseField(16, 64, 2, 8, 3, 127);
  const r = rng(53);
  const p = pixels(w, h, (u, v, o) => {
    const ring = (v * 22 + sample(F1, u, v) * 0.6) % 1;
    const band = ring < 0.18 ? 0.55 : 0.8 + (r() - 0.5) * 0.2;
    const fib = (r() - 0.5) * 0.12;
    const c = band + fib;
    o.r = c; o.g = c * 0.93; o.b = c * 0.85; o.h = band;
  });
  return { map: tex(p.canvas), normalMap: tex(normalMap(p.height, w, h, 1.5), { srgb: false }), size: [0.8, 3.2] };
}

/** Palm frond (left half) and broad-leaf cluster (right half), alpha-tested. */
function foliage(S) {
  const w = S, h = S;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const r = rng(59);
  // Palm frond: rib from bottom (v=0) to top, leaflets both sides.
  const fx = w * 0.25;
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const y = h * (0.97 - t * 0.94);
    const len = w * 0.23 * Math.sin(Math.min(1, t * 1.25 + 0.08) * Math.PI) + w * 0.02;
    for (const side of [-1, 1]) {
      const droop = 0.25 + r() * 0.2;
      const ex = fx + side * len, ey = y - len * 0.35 + len * droop * 0.6;
      const shade = 0.75 + r() * 0.3;
      g.strokeStyle = `rgb(${(58 * shade) | 0},${(104 * shade) | 0},${(34 * shade) | 0})`;
      g.lineWidth = Math.max(2, w * 0.012 * (1 - t * 0.5));
      g.beginPath(); g.moveTo(fx, y); g.quadraticCurveTo(fx + side * len * 0.5, y - len * 0.4, ex, ey); g.stroke();
      g.strokeStyle = `rgba(150,170,70,0.5)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fx, y); g.quadraticCurveTo(fx + side * len * 0.5, y - len * 0.4, ex, ey); g.stroke();
    }
  }
  g.strokeStyle = '#8a8a4a'; g.lineWidth = w * 0.012;
  g.beginPath(); g.moveTo(fx, h * 0.99); g.lineTo(fx, h * 0.02); g.stroke();
  // Broad leaves (mango / almond style) on the right half, inside a soft oval so cards have round silhouettes.
  const cx0 = w * 0.75, cy0 = h * 0.5, rx = w * 0.22, ry = h * 0.46;
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const x = cx0 + Math.cos(a) * rx * d, y = cy0 + Math.sin(a) * ry * d;
    const L = w * (0.022 + r() * 0.02), ang = a + (r() - 0.5) * 1.6;
    const k = 0.55 + r() * 0.5 - d * 0.15;
    const dry = r() < 0.025;
    g.fillStyle = dry ? `rgb(${(130 * k) | 0},${(128 * k) | 0},${(62 * k) | 0})` : `rgb(${(38 * k) | 0},${(88 * k) | 0},${(30 * k) | 0})`;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.ellipse(0, 0, L, L * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(150,180,90,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
    g.restore();
  }
  const t = tex(c, { repeat: false });
  return { map: t };
}

/** Burglar-proof window grille: bars, scrolls and a centre diamond, white on transparent. */
function grille(S) {
  const w = S / 2, h = S / 2;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const lw = Math.max(3, w / 48);
  g.strokeStyle = '#fff'; g.lineWidth = lw; g.lineCap = 'round';
  const m = lw / 2;
  g.strokeRect(m, m, w - lw, h - lw);
  const n = 7;
  for (let i = 1; i < n; i++) { const x = (i / n) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5); g.stroke();
  // scrolls top and bottom between bars
  for (let i = 0; i < n; i++) {
    const cx = ((i + 0.5) / n) * w, r0 = w / n * 0.38;
    for (const cy of [h * 0.12, h * 0.88]) {
      g.beginPath(); g.arc(cx - r0 * 0.5, cy, r0 * 0.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx + r0 * 0.5, cy, r0 * 0.5, 0, Math.PI * 2); g.stroke();
    }
  }
  // centre diamond
  g.beginPath(); g.moveTo(w / 2, h * 0.32); g.lineTo(w * 0.64, h / 2); g.lineTo(w / 2, h * 0.68); g.lineTo(w * 0.36, h / 2); g.closePath(); g.stroke();
  return { map: tex(c, { repeat: false }) };
}

// ---------------------------------------------------------------------------------------------
// Atlases
// ---------------------------------------------------------------------------------------------

const FONT_BOLD = 'Impact, "Arial Black", "Roboto Condensed", "Roboto", "DejaVu Sans", sans-serif';
const FONT_SANS = '"Arial", "Roboto", "Helvetica Neue", "DejaVu Sans", sans-serif';
const FONT_HAND = '"Comic Sans MS", "Chalkboard", "Marker Felt", "Roboto", "DejaVu Sans", sans-serif';

/** Hand-painted text: per-letter jitter, scaled to fit maxW. */
function paint(g, text, x, y, size, color, o = {}) {
  const { font = FONT_BOLD, weight = '900', align = 'center', maxW = 1e9, wobble = 0.05, seed = 7, stroke = null, strokeW = 0, shadow = null } = o;
  const r = rng(seed + text.length * 13);
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  g.textBaseline = 'middle';
  const w = g.measureText(text).width;
  const sc = Math.min(1, maxW / w);
  g.translate(x, y); g.scale(sc, 1);
  let cx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  for (const ch of text) {
    const cw = g.measureText(ch).width;
    g.save();
    g.translate(cx + cw / 2, (r() - 0.5) * size * wobble);
    g.rotate((r() - 0.5) * wobble * 1.2);
    if (shadow) { g.fillStyle = shadow; g.fillText(ch, -cw / 2 + size * 0.05, size * 0.05); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = strokeW; g.lineJoin = 'round'; g.strokeText(ch, -cw / 2, 0); }
    g.fillStyle = color; g.fillText(ch, -cw / 2, 0);
    g.restore();
    cx += cw;
  }
  g.restore();
}

/** Sun-fade, grime and rust drips over a rectangle of the canvas. */
function weather(g, x, y, w, h, { fade = 0.15, dirt = 0.25, rust = 0, seed = 3 } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const img = g.getImageData(x, y, w, h);
  const d = img.data;
  const F = noiseField(24, 24, 3, 3, 3, seed);
  const r = rng(seed);
  // rust drips: per column, the drip length (0 = none)
  const drip = new Float32Array(w);
  if (rust > 0) for (let k = 0; k < 3 + rust * 6; k++) {
    const cx = r() * w, len = h * (0.2 + r() * 0.7), wd = 1 + r() * 3;
    for (let i = Math.max(0, Math.floor(cx - wd)); i < Math.min(w, Math.ceil(cx + wd)); i++) drip[i] = Math.max(drip[i], len);
  }
  const rt = 0.55 * rust;
  for (let j = 0; j < h; j++) {
    const v = j / h;
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (d[k + 3] === 0) continue;
      const n = sample(F, i / w, v);
      const f = fade * (0.5 + n);
      let R = d[k], G = d[k + 1], B = d[k + 2];
      const lum = (R + G + B) * 0.2;
      R += (lum + 120 - R) * f; G += (lum + 116 - G) * f; B += (lum + 108 - B) * f;
      const dd = (smooth(0.5, 0.9, n) * dirt + (r() < 0.02 ? 0.25 : 0)) * 0.6;
      R *= 1 - dd; G *= 1 - dd; B *= 1 - dd * 1.1;
      if (drip[i] > j) { const t = (1 - j / drip[i]) * rt; R += (120 - R) * t; G += (62 - G) * t; B += (30 - B) * t; }
      d[k] = R; d[k + 1] = G; d[k + 2] = B;
    }
  }
  g.putImageData(img, x, y);
}

function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Simple shelf packer. items: [name, w, h, draw(g, x, y, w, h)]. */
function buildAtlas(size, items, scale = 1) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#6b6b66'; g.fillRect(0, 0, size, size);
  const pad = Math.max(2, Math.round(size / 256));
  const list = items.map(([name, w, h, draw]) => ({ name, w: Math.round(w * scale), h: Math.round(h * scale), draw }));
  const order = [...list].sort((a, b) => b.h - a.h || b.w - a.w);
  // skyline bottom-left packing
  let sky = [{ x: 0, y: 0, w: size }];
  const regions = {};
  for (const it of order) {
    const W = it.w + pad * 2, H = it.h + pad * 2;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + W > size) break;
      let y = 0, span = 0, j = i;
      while (span < W && j < sky.length) { y = Math.max(y, sky[j].y); span += sky[j].w; j++; }
      if (span < W || y + H > size) continue;
      if (!best || y + H < best.y + best.h || (y + H === best.y + best.h && x < best.x)) best = { x, y, h: H };
    }
    if (!best) throw new Error('atlas overflow at ' + it.name);
    it.x = best.x + pad; it.y = best.y + pad;
    // raise the skyline under the item
    const nx0 = best.x, nx1 = best.x + W, top = best.y + H;
    const next = [];
    for (const sg of sky) {
      const a = sg.x, b = sg.x + sg.w;
      if (b <= nx0 || a >= nx1) { next.push(sg); continue; }
      if (a < nx0) next.push({ x: a, y: sg.y, w: nx0 - a });
      if (b > nx1) next.push({ x: nx1, y: sg.y, w: b - nx1 });
    }
    next.push({ x: nx0, y: top, w: W });
    next.sort((p, q) => p.x - q.x);
    sky = [];
    for (const sg of next) { const l = sky[sky.length - 1]; if (l && l.y === sg.y && l.x + l.w === sg.x) l.w += sg.w; else sky.push({ ...sg }); }
  }
  for (const it of list) {
    g.save();
    g.beginPath(); g.rect(it.x - 1, it.y - 1, it.w + 2, it.h + 2); g.clip();
    it.draw(g, it.x, it.y, it.w, it.h);
    g.restore();
    const e = 0.75; // inset half a texel+ so bilinear filtering stays inside the region
    regions[it.name] = { u0: (it.x + e) / size, v0: 1 - (it.y + it.h - e) / size, u1: (it.x + it.w - e) / size, v1: 1 - (it.y + e) / size };
  }
  return { canvas: c, regions };
}

// Wrapped drawing helpers (draw functions get a local box x, y, w, h).
const fill = (col) => (g, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

function boardSign(bg, border, lines, opts = {}) {
  return (g, x, y, w, h) => {
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(3, h * 0.05); g.strokeRect(x + h * 0.05, y + h * 0.05, w - h * 0.1, h - h * 0.1); }
    for (const l of lines) paint(g, l.t, x + w * (l.x ?? 0.5), y + h * l.y, h * l.s, l.c, { maxW: w * (l.mw ?? 0.88), font: l.f, weight: l.wt, wobble: l.wb ?? 0.05, stroke: l.st, strokeW: l.sw, shadow: l.sh, align: l.al });
    weather(g, x, y, w, h, { fade: opts.fade ?? 0.18, dirt: opts.dirt ?? 0.3, rust: opts.rust ?? 0, seed: opts.seed ?? 5 });
  };
}

function signsAtlas(S) {
  const scale = (S / 1024) * 0.88;
  const items = [
    ['church-arch', 512, 112, (g, x, y, w, h) => {
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#24479e'); gr.addColorStop(1, '#152c6b');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.strokeStyle = '#f4d03f'; g.lineWidth = 5; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
      paint(g, 'GRACE ASSEMBLY', x + w / 2, y + h * 0.42, h * 0.46, '#ffffff', { shadow: '#0b1640', maxW: w * 0.86, wobble: 0.02 });
      paint(g, 'YABA PARISH  •  ALL ARE WELCOME', x + w / 2, y + h * 0.78, h * 0.17, '#f4d03f', { font: FONT_SANS, weight: '700', maxW: w * 0.8, wobble: 0.01 });
      weather(g, x, y, w, h, { fade: 0.12, dirt: 0.2, rust: 0.4, seed: 11 });
    }],
    ['church-board', 256, 192, (g, x, y, w, h) => {
      g.fillStyle = '#fbfaf3'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1f3f94'; g.fillRect(x, y, w, h * 0.27);
      g.fillStyle = '#c0392b'; g.fillRect(x, y + h * 0.84, w, h * 0.16);
      paint(g, 'GRACE ASSEMBLY', x + w / 2, y + h * 0.14, h * 0.15, '#fff', { maxW: w * 0.9, wobble: 0.02 });
      const L = [['Yaba Parish, Lagos', 0.35, '#1f3f94'], ['SUNDAY SERVICE  9AM', 0.48, '#111'], ['Bible Study  Wed 6PM', 0.6, '#333'], ['Holy Ghost Vigil  Fri 10PM', 0.72, '#333']];
      for (const [t, yy, c] of L) paint(g, t, x + w / 2, y + h * yy, h * 0.085, c, { font: FONT_SANS, weight: '700', maxW: w * 0.9, wobble: 0.01 });
      paint(g, 'Jesus Is Lord!', x + w / 2, y + h * 0.92, h * 0.1, '#fff', { font: FONT_SANS, weight: '800', maxW: w * 0.8, wobble: 0.01 });
      weather(g, x, y, w, h, { fade: 0.15, dirt: 0.3, rust: 0.3, seed: 13 });
    }],
    ['buka', 512, 96, boardSign('#f7d23e', '#b8281f', [
      { t: 'MAMA NKECHI BUKA', y: 0.4, s: 0.42, c: '#b8281f', sh: 'rgba(0,0,0,0.25)' },
      { t: 'Rice & Stew • Amala & Ewedu • Eba • Pepper Soup • Swallow', y: 0.78, s: 0.17, c: '#111', f: FONT_SANS, wt: '800' }], { seed: 17 })],
    ['water', 256, 128, boardSign('#fdfdf8', '#1d6fc4', [
      { t: 'PURE WATER', y: 0.33, s: 0.3, c: '#1d6fc4' },
      { t: 'SOLD HERE', y: 0.62, s: 0.22, c: '#c0392b' },
      { t: 'N20 each • N300 per bag', y: 0.84, s: 0.11, c: '#222', f: FONT_SANS, wt: '700' }], { seed: 19, dirt: 0.4 })],
    ['pos', 384, 128, boardSign('#0d7a3a', '#f4d03f', [
      { t: 'RECHARGE CARD / POS', y: 0.36, s: 0.26, c: '#fff', sh: 'rgba(0,0,0,0.35)' },
      { t: 'Transfer • Withdrawal • Data • All Networks', y: 0.66, s: 0.12, c: '#f4d03f', f: FONT_SANS, wt: '800' },
      { t: 'Call: 0803 *** 2241', y: 0.84, s: 0.09, c: '#fff', f: FONT_SANS, wt: '700' }], { seed: 23 })],
    ['busstop', 384, 96, (g, x, y, w, h) => {
      g.fillStyle = '#16449a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fff'; g.fillRect(x + 4, y + 4, w - 8, 3); g.fillRect(x + 4, y + h - 7, w - 8, 3);
      paint(g, 'YABA', x + w * 0.36, y + h * 0.5, h * 0.62, '#fff', { wobble: 0.0 });
      paint(g, 'BUS STOP', x + w * 0.76, y + h * 0.36, h * 0.2, '#f4d03f', { font: FONT_SANS, weight: '800', wobble: 0 });
      paint(g, 'Herbert Macaulay Way', x + w * 0.76, y + h * 0.66, h * 0.13, '#fff', { font: FONT_SANS, weight: '600', wobble: 0, maxW: w * 0.38 });
      weather(g, x, y, w, h, { fade: 0.15, dirt: 0.25, rust: 0.5, seed: 29 });
    }],
    ['street', 256, 56, (g, x, y, w, h) => {
      g.fillStyle = '#0f6b3a'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
      paint(g, 'HERBERT MACAULAY WAY', x + w / 2, y + h * 0.42, h * 0.36, '#fff', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 });
      paint(g, 'YABA LCDA', x + w / 2, y + h * 0.76, h * 0.16, '#fff', { font: FONT_SANS, weight: '700', wobble: 0 });
      weather(g, x, y, w, h, { fade: 0.2, dirt: 0.25, rust: 0.4, seed: 31 });
    }],
    ['security', 192, 64, boardSign('#c0392b', '#fff', [
      { t: 'SECURITY', y: 0.42, s: 0.42, c: '#fff' },
      { t: 'All vehicles must stop', y: 0.78, s: 0.15, c: '#fff', f: FONT_SANS, wt: '700' }], { seed: 37 })],
    ['carpark', 192, 64, (g, x, y, w, h) => {
      g.fillStyle = '#1c55b8'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fff'; rrect(g, x + 8, y + 8, h - 16, h - 16, 6); g.fill();
      paint(g, 'P', x + 8 + (h - 16) / 2, y + h / 2, h * 0.6, '#1c55b8', { font: FONT_SANS, weight: '900', wobble: 0 });
      paint(g, 'CAR PARK', x + w * 0.62, y + h * 0.42, h * 0.28, '#fff', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.6 });
      paint(g, 'Members & Visitors', x + w * 0.62, y + h * 0.72, h * 0.13, '#fff', { font: FONT_SANS, weight: '600', wobble: 0, maxW: w * 0.6 });
      weather(g, x, y, w, h, { fade: 0.1, dirt: 0.2, seed: 41 });
    }],
    ['prayer', 192, 64, boardSign('#5b2d8a', '#e9c46a', [
      { t: 'PRAYER ROOM', y: 0.42, s: 0.32, c: '#fff' },
      { t: 'Silence please • Remove your shoes', y: 0.76, s: 0.13, c: '#e9c46a', f: FONT_SANS, wt: '700' }], { seed: 43, fade: 0.08 })],
    ['canteen', 192, 64, boardSign('#e8772e', '#fff', [
      { t: 'CANTEEN', y: 0.42, s: 0.38, c: '#fff' },
      { t: 'Food • Drinks • Fellowship', y: 0.77, s: 0.14, c: '#fff', f: FONT_SANS, wt: '700' }], { seed: 47 })],
    ['children', 256, 64, (g, x, y, w, h) => {
      g.fillStyle = '#fffbea'; g.fillRect(x, y, w, h);
      const cols = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5', '#e76f51'];
      const t = "CHILDREN'S CHURCH";
      g.font = `900 ${h * 0.42}px ${FONT_BOLD}`;
      const tw = g.measureText(t).width; let cx = x + (w - Math.min(tw, w * 0.92)) / 2; const sc = Math.min(1, w * 0.92 / tw);
      [...t].forEach((ch, i) => { const cw = g.measureText(ch).width * sc; paint(g, ch, cx + cw / 2, y + h * 0.45 + (i % 2 ? -2 : 2), h * 0.42, cols[i % cols.length], { wobble: 0.1, seed: i }); cx += cw; });
      paint(g, 'Ages 3 – 12 • Sundays 9AM', x + w / 2, y + h * 0.82, h * 0.14, '#333', { font: FONT_SANS, weight: '700', wobble: 0 });
      weather(g, x, y, w, h, { fade: 0.1, dirt: 0.15, seed: 53 });
    }],
    ['banner-welcome', 512, 96, (g, x, y, w, h) => {
      g.fillStyle = '#6d1530'; g.fillRect(x, y, w, h);
      g.fillStyle = '#d4af37'; g.fillRect(x, y + 6, w, 3); g.fillRect(x, y + h - 9, w, 3);
      paint(g, 'WELCOME TO GRACE ASSEMBLY', x + w / 2, y + h * 0.42, h * 0.36, '#f3d27a', { font: FONT_SANS, weight: '900', wobble: 0, maxW: w * 0.9 });
      paint(g, 'Where Jesus Is Lord  •  Yaba, Lagos', x + w / 2, y + h * 0.74, h * 0.15, '#fff', { font: FONT_SANS, weight: '600', wobble: 0 });
    }],
    ['banner-holiness', 112, 384, (g, x, y, w, h) => {
      g.fillStyle = '#4a2370'; g.fillRect(x, y, w, h);
      g.fillStyle = '#d4af37'; g.fillRect(x + 6, y, 3, h); g.fillRect(x + w - 9, y, 3, h);
      const words = ['HOLINESS', 'UNTO', 'THE', 'LORD'];
      words.forEach((t, i) => paint(g, t, x + w / 2, y + h * (0.2 + i * 0.18), w * 0.24, '#f3d27a', { font: FONT_SANS, weight: '900', wobble: 0, maxW: w * 0.8 }));
      g.fillStyle = '#f3d27a'; g.fillRect(x + w / 2 - 3, y + h * 0.86, 6, h * 0.1); g.fillRect(x + w / 2 - 14, y + h * 0.89, 28, 5);
    }],
    ['banner-jesus', 112, 384, (g, x, y, w, h) => {
      g.fillStyle = '#fbfbf6'; g.fillRect(x, y, w, h);
      g.fillStyle = '#b3202a'; g.fillRect(x + 6, y, 3, h); g.fillRect(x + w - 9, y, 3, h);
      ['JESUS', 'IS', 'LORD'].forEach((t, i) => paint(g, t, x + w / 2, y + h * (0.25 + i * 0.2), w * 0.28, '#b3202a', { font: FONT_SANS, weight: '900', wobble: 0, maxW: w * 0.82 }));
      paint(g, 'Phil 2:11', x + w / 2, y + h * 0.88, w * 0.13, '#555', { font: FONT_SANS, weight: '700', wobble: 0 });
    }],
    ['sticker-jesus', 256, 48, (g, x, y, w, h) => {
      g.fillStyle = '#fff'; rrect(g, x + 2, y + 2, w - 4, h - 4, 8); g.fill();
      paint(g, 'JESUS IS LORD', x + w / 2, y + h / 2 + 1, h * 0.62, '#c8102e', { wobble: 0.01 });
      weather(g, x, y, w, h, { fade: 0.2, dirt: 0.15, seed: 59 });
    }],
    ['sticker-condition', 256, 48, (g, x, y, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(x, y, w, h);
      paint(g, 'NO CONDITION IS PERMANENT', x + w / 2, y + h / 2, h * 0.5, '#111', { maxW: w * 0.96, wobble: 0.03 });
    }],
    ['notforsale', 384, 96, (g, x, y, w, h) => {
      g.clearRect(x, y, w, h);
      paint(g, 'THIS HOUSE IS NOT FOR SALE', x + w / 2, y + h * 0.36, h * 0.3, '#b0151c', { maxW: w * 0.95, wobble: 0.08, seed: 61 });
      paint(g, 'BEWARE OF 419!!', x + w / 2, y + h * 0.74, h * 0.24, '#b0151c', { maxW: w * 0.6, wobble: 0.08, seed: 67 });
    }],
    ['postnobill', 192, 48, (g, x, y, w, h) => {
      g.clearRect(x, y, w, h);
      paint(g, 'POST NO BILL', x + w / 2, y + h / 2, h * 0.6, '#151515', { maxW: w * 0.95, wobble: 0.08, seed: 71 });
    }],
    ['barber', 384, 96, boardSign('#ffffff', '#1d3557', [
      { t: "GOD'S TIME", y: 0.3, s: 0.3, c: '#e63946', sh: 'rgba(0,0,0,0.2)' },
      { t: 'BARBING SALON', y: 0.62, s: 0.26, c: '#1d3557' },
      { t: 'Low cut • Punk • Shave • Dye', y: 0.86, s: 0.11, c: '#333', f: FONT_SANS, wt: '700' }], { seed: 73, rust: 0.3 })],
    ['tailor', 384, 96, boardSign('#fde2e4', '#7b2cbf', [
      { t: 'DIVINE TOUCH FASHION', y: 0.36, s: 0.3, c: '#7b2cbf' },
      { t: 'Tailoring • Ankara • Agbada • Senator • Bridal', y: 0.72, s: 0.14, c: '#222', f: FONT_SANS, wt: '700' }], { seed: 79 })],
    ['chemist', 384, 96, (g, x, y, w, h) => {
      g.fillStyle = '#f5fff6'; g.fillRect(x, y, w, h);
      g.fillStyle = '#16a34a'; const cs = h * 0.6, cx = x + h * 0.5, cy = y + h / 2;
      g.fillRect(cx - cs * 0.18, cy - cs / 2, cs * 0.36, cs); g.fillRect(cx - cs / 2, cy - cs * 0.18, cs, cs * 0.36);
      paint(g, 'GOOD HEALTH', x + w * 0.58, y + h * 0.34, h * 0.3, '#15803d', { maxW: w * 0.7 });
      paint(g, 'Patent Medicine Store', x + w * 0.58, y + h * 0.7, h * 0.2, '#111', { font: FONT_SANS, weight: '800', maxW: w * 0.7, wobble: 0.02 });
      weather(g, x, y, w, h, { fade: 0.2, dirt: 0.3, rust: 0.3, seed: 83 });
    }],
    ['minimart', 384, 96, boardSign('#ffe14d', '#0b4f9c', [
      { t: 'DIVINE MERCY MINI MART', y: 0.4, s: 0.32, c: '#0b4f9c' },
      { t: 'Provisions • Soft drinks • Toiletries', y: 0.76, s: 0.15, c: '#c1121f', f: FONT_SANS, wt: '800' }], { seed: 89 })],
    ['crusade', 128, 192, (g, x, y, w, h) => {
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffb703'); gr.addColorStop(0.55, '#fb5607'); gr.addColorStop(1, '#3a0ca3');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      paint(g, 'MEGA', x + w / 2, y + h * 0.12, h * 0.1, '#fff', { wobble: 0 });
      paint(g, 'CRUSADE', x + w / 2, y + h * 0.24, h * 0.13, '#fff', { wobble: 0, maxW: w * 0.9, shadow: 'rgba(0,0,0,.4)' });
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x + w / 2, y + h * 0.48, w * 0.2, 0, 7); g.fill();
      g.fillStyle = '#3a0ca3'; g.fillRect(x + w / 2 - 3, y + h * 0.4, 6, h * 0.16); g.fillRect(x + w / 2 - 12, y + h * 0.45, 24, 5);
      paint(g, 'Come & Receive', x + w / 2, y + h * 0.68, h * 0.065, '#fff', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 });
      paint(g, 'Your Miracle!', x + w / 2, y + h * 0.75, h * 0.065, '#fff', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 });
      paint(g, 'Grace Assembly, Yaba', x + w / 2, y + h * 0.86, h * 0.05, '#ffe066', { font: FONT_SANS, weight: '700', wobble: 0, maxW: w * 0.9 });
      paint(g, 'FRIDAY 10PM', x + w / 2, y + h * 0.93, h * 0.055, '#fff', { font: FONT_SANS, weight: '900', wobble: 0 });
      weather(g, x, y, w, h, { fade: 0.25, dirt: 0.25, seed: 97 });
    }],
    ['poster-vigil', 128, 192, (g, x, y, w, h) => {
      g.fillStyle = '#101820'; g.fillRect(x, y, w, h);
      const gr = g.createRadialGradient(x + w / 2, y + h * 0.42, 4, x + w / 2, y + h * 0.42, w * 0.6); gr.addColorStop(0, '#ffd166'); gr.addColorStop(1, 'rgba(255,209,102,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      paint(g, 'HOLY GHOST', x + w / 2, y + h * 0.14, h * 0.09, '#ffd166', { wobble: 0, maxW: w * 0.9 });
      paint(g, 'NIGHT', x + w / 2, y + h * 0.26, h * 0.14, '#fff', { wobble: 0 });
      paint(g, 'Prayer • Praise • Power', x + w / 2, y + h * 0.7, h * 0.055, '#fff', { font: FONT_SANS, weight: '700', wobble: 0, maxW: w * 0.9 });
      paint(g, 'Every Friday 10PM', x + w / 2, y + h * 0.8, h * 0.06, '#ffd166', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 });
      paint(g, 'Grace Assembly', x + w / 2, y + h * 0.9, h * 0.06, '#fff', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 });
      weather(g, x, y, w, h, { fade: 0.2, dirt: 0.3, seed: 101 });
    }],
    ['menu', 192, 256, (g, x, y, w, h) => {
      g.fillStyle = '#7a4a24'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1f2a24'; g.fillRect(x + 8, y + 8, w - 16, h - 16);
      paint(g, "TODAY'S MENU", x + w / 2, y + h * 0.11, h * 0.07, '#ffe9a8', { font: FONT_HAND, weight: '700', wobble: 0.04 });
      const L = [['Jollof Rice + Chicken', 'N2,000'], ['Fried Rice + Turkey', 'N2,500'], ['Beans & Dodo', 'N1,000'], ['Moi Moi', 'N500'], ['Yam & Egg Sauce', 'N1,200'], ['Zobo / Kunu', 'N300'], ['Pure Water', 'N20']];
      L.forEach(([a, b], i) => {
        paint(g, a, x + 16, y + h * (0.24 + i * 0.1), h * 0.048, '#f1f1f1', { font: FONT_HAND, weight: '600', align: 'left', wobble: 0.04, maxW: w * 0.6, seed: i });
        paint(g, b, x + w - 16, y + h * (0.24 + i * 0.1), h * 0.048, '#ffd166', { font: FONT_HAND, weight: '700', align: 'right', wobble: 0.04, seed: i + 9 });
      });
      paint(g, 'God bless you!', x + w / 2, y + h * 0.93, h * 0.045, '#9be7a3', { font: FONT_HAND, weight: '700', wobble: 0.04 });
    }],
    ['scripture', 384, 128, (g, x, y, w, h) => {
      g.fillStyle = '#7a5230'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fbf6e9'; g.fillRect(x + 8, y + 8, w - 16, h - 16);
      paint(g, 'Be still, and know that I am God.', x + w / 2, y + h * 0.45, h * 0.17, '#3b2a6b', { font: '"Georgia", "Times New Roman", "DejaVu Serif", serif', weight: '700', wobble: 0, maxW: w * 0.88 });
      paint(g, '— Psalm 46:10', x + w / 2, y + h * 0.72, h * 0.11, '#6b5a3b', { font: '"Georgia", "DejaVu Serif", serif', weight: '400', wobble: 0 });
    }],
    ['houseno', 96, 40, (g, x, y, w, h) => {
      g.fillStyle = '#1d4ed8'; rrect(g, x + 2, y + 2, w - 4, h - 4, 6); g.fill();
      paint(g, 'No. 14', x + w / 2, y + h / 2 + 1, h * 0.55, '#fff', { font: FONT_SANS, weight: '800', wobble: 0 });
    }],
    ['whiteboard', 192, 128, (g, x, y, w, h) => {
      g.fillStyle = '#c8ccd0'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fdfdfd'; g.fillRect(x + 5, y + 5, w - 10, h - 10);
      paint(g, 'Jesus Loves Me!', x + w / 2, y + h * 0.25, h * 0.15, '#d62828', { font: FONT_HAND, weight: '700', wobble: 0.06 });
      paint(g, 'Memory verse: John 3:16', x + w / 2, y + h * 0.48, h * 0.1, '#1d4ed8', { font: FONT_HAND, weight: '700', wobble: 0.05 });
      paint(g, '"For God so loved the world..."', x + w / 2, y + h * 0.66, h * 0.085, '#111', { font: FONT_HAND, weight: '600', wobble: 0.05, maxW: w * 0.9 });
      g.strokeStyle = '#2a9d8f'; g.lineWidth = 3; g.beginPath(); g.arc(x + w * 0.2, y + h * 0.85, 8, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x + w * 0.7, y + h * 0.9); g.lineTo(x + w * 0.76, y + h * 0.78); g.lineTo(x + w * 0.82, y + h * 0.9); g.closePath(); g.stroke();
    }],
    ['clinic-poster', 128, 160, (g, x, y, w, h) => {
      g.fillStyle = '#e0f2fe'; g.fillRect(x, y, w, h);
      paint(g, 'FREE MEDICAL', x + w / 2, y + h * 0.15, h * 0.09, '#0369a1', { wobble: 0, maxW: w * 0.9 });
      paint(g, 'OUTREACH', x + w / 2, y + h * 0.27, h * 0.11, '#c1121f', { wobble: 0, maxW: w * 0.9 });
      g.fillStyle = '#c1121f'; g.fillRect(x + w / 2 - 5, y + h * 0.38, 10, h * 0.2); g.fillRect(x + w / 2 - 20, y + h * 0.45, 40, 10);
      paint(g, 'BP • Sugar • Eye test', x + w / 2, y + h * 0.7, h * 0.065, '#111', { font: FONT_SANS, weight: '700', wobble: 0, maxW: w * 0.9 });
      paint(g, 'Saturday 10AM', x + w / 2, y + h * 0.82, h * 0.07, '#0369a1', { font: FONT_SANS, weight: '800', wobble: 0 });
      weather(g, x, y, w, h, { fade: 0.25, dirt: 0.3, seed: 103 });
    }],
  ];
  const { canvas, regions } = buildAtlas(S, items, scale);
  return { map: tex(canvas, { repeat: false, aniso: 8 }), regions, canvas };
}

function propsAtlas(S) {
  const scale = S >= 1024 ? 1 : 0.5;
  const louvre = (curtain) => (g, x, y, w, h) => {
    g.fillStyle = '#3b3f43'; g.fillRect(x, y, w, h);
    // curtain behind louvres
    if (curtain) {
      g.fillStyle = curtain; g.fillRect(x + 6, y + 6, w - 12, h - 12);
      for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(0,0,0,${0.12 + (i % 2) * 0.1})`; g.fillRect(x + 6 + i * (w - 12) / 9, y + 6, (w - 12) / 18, h - 12); }
    } else { g.fillStyle = '#1e2226'; g.fillRect(x + 6, y + 6, w - 12, h - 12); }
    const n = 9;
    for (let i = 0; i < n; i++) {
      const yy = y + 6 + i * (h - 12) / n;
      const gr = g.createLinearGradient(0, yy, 0, yy + (h - 12) / n);
      gr.addColorStop(0, 'rgba(220,235,240,0.55)'); gr.addColorStop(0.5, 'rgba(120,150,160,0.25)'); gr.addColorStop(1, 'rgba(40,50,55,0.55)');
      g.fillStyle = gr; g.fillRect(x + 6, yy + 1, w - 12, (h - 12) / n - 2);
    }
    g.fillStyle = '#d8d8d0'; g.fillRect(x + w / 2 - 2, y, 4, h);
    g.strokeStyle = '#e8e6df'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  };
  const door = (base, panel, knob) => (g, x, y, w, h) => {
    g.fillStyle = base; g.fillRect(x, y, w, h);
    g.strokeStyle = panel; g.lineWidth = 4;
    g.strokeRect(x + w * 0.14, y + h * 0.06, w * 0.72, h * 0.38);
    g.strokeRect(x + w * 0.14, y + h * 0.52, w * 0.72, h * 0.42);
    g.fillStyle = knob; g.beginPath(); g.arc(x + w * 0.84, y + h * 0.52, w * 0.05, 0, 7); g.fill();
    weather(g, x, y, w, h, { fade: 0.1, dirt: 0.25, seed: base.length * 7 });
  };
  const goods = (cols, rad, n) => (g, x, y, w, h) => {
    g.fillStyle = cols[0]; g.fillRect(x, y, w, h);
    const r = rng(n);
    const sc = w / 64;
    for (let i = 0; i < n * 1.6; i++) {
      const c = cols[(r() * cols.length) | 0];
      const cx = x + r() * w, cy = y + r() * h, rr = rad * sc * (0.8 + r() * 0.5);
      const gr = g.createRadialGradient(cx - rr * 0.35, cy - rr * 0.35, 0.5, cx, cy, rr);
      gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.3, c); gr.addColorStop(1, c);
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill();
    }
  };
  const items = [
    ['white', 24, 24, fill('#ffffff')],
    ['black', 24, 24, fill('#141414')],
    ['glass', 48, 48, (g, x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#5d7480'); gr.addColorStop(0.5, '#1f2b33'); gr.addColorStop(1, '#2d3d47'); g.fillStyle = gr; g.fillRect(x, y, w, h); }],
    ['roadpaint', 48, 48, (g, x, y, w, h) => { g.fillStyle = '#e9e6dc'; g.fillRect(x, y, w, h); weather(g, x, y, w, h, { fade: 0.1, dirt: 0.6, seed: 3 }); }],
    ['win-louvre-a', 128, 128, louvre('#c9a227')],
    ['win-louvre-b', 128, 128, louvre('#8e3b46')],
    ['win-louvre-c', 128, 128, louvre('#3d6b8e')],
    ['win-dark', 128, 128, louvre(null)],
    ['win-slide', 128, 128, (g, x, y, w, h) => {
      g.fillStyle = '#7a5a3a'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 2; i++) {
        const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#6f5a45'); gr.addColorStop(0.45, '#2a2420'); gr.addColorStop(0.6, '#5b4a3c'); gr.addColorStop(1, '#2a2420');
        g.fillStyle = gr; g.fillRect(x + 6 + i * (w / 2 - 3), y + 6, w / 2 - 9, h - 12);
      }
      g.fillStyle = '#c9c4ba'; g.fillRect(x, y, w, 5); g.fillRect(x, y + h - 5, w, 5); g.fillRect(x, y, 5, h); g.fillRect(x + w - 5, y, 5, h); g.fillRect(x + w / 2 - 2, y, 4, h);
    }],
    ['shop-int', 192, 128, (g, x, y, w, h) => {
      g.fillStyle = '#2b2622'; g.fillRect(x, y, w, h);
      const r = rng(5);
      for (let s = 0; s < 4; s++) {
        const yy = y + 10 + s * (h - 20) / 4;
        g.fillStyle = '#5a4634'; g.fillRect(x + 4, yy + (h - 20) / 4 - 5, w - 8, 4);
        for (let k = 0; k < 18; k++) {
          const bw = 4 + r() * 9, bh = 8 + r() * ((h - 20) / 4 - 16);
          const cols = ['#c1121f', '#ffb703', '#219ebc', '#f1faee', '#2a9d8f', '#ef476f', '#8338ec'];
          g.fillStyle = cols[(r() * cols.length) | 0];
          g.fillRect(x + 6 + k * (w - 12) / 18, yy + (h - 20) / 4 - 5 - bh, bw, bh);
        }
      }
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    }],
    ['shutter', 128, 128, (g, x, y, w, h) => {
      g.fillStyle = '#9aa0a3'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? '#7f8588' : '#b4babd'; g.fillRect(x, y + i * h / 32, w, h / 64); }
      g.fillStyle = '#555'; g.fillRect(x + w / 2 - 6, y + h - 12, 12, 8);
      weather(g, x, y, w, h, { fade: 0.05, dirt: 0.35, rust: 0.8, seed: 7 });
    }],
    ['door-steel', 96, 192, (g, x, y, w, h) => {
      g.fillStyle = '#2f3b2f'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#d4af37'; g.lineWidth = 3;
      for (let i = 0; i < 3; i++) g.strokeRect(x + w * 0.15, y + h * (0.06 + i * 0.31), w * 0.7, h * 0.26);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + w / 2, y + h * (0.19 + i * 0.31), w * 0.14, 0, 7); g.stroke(); }
      g.fillStyle = '#d4af37'; g.fillRect(x + w * 0.8, y + h * 0.5, w * 0.08, h * 0.06);
      weather(g, x, y, w, h, { fade: 0.1, dirt: 0.3, rust: 0.4, seed: 9 });
    }],
    ['door-wood', 96, 192, door('#6b3f22', '#4a2a15', '#d4af37')],
    ['door-white', 96, 192, door('#ece8df', '#c9c3b5', '#b8b8b8')],
    ['danfo-side', 384, 160, (g, x, y, w, h) => {
      // side view, front of the bus at the RIGHT (u = 1)
      g.fillStyle = '#f2b705'; g.fillRect(x, y, w, h);
      g.fillStyle = '#121212'; g.fillRect(x, y + h * 0.56, w, h * 0.07); g.fillRect(x, y + h * 0.72, w, h * 0.05);
      // windows
      g.fillStyle = '#20292e';
      const wy = y + h * 0.08, wh = h * 0.38;
      for (let i = 0; i < 4; i++) { rrect(g, x + w * (0.04 + i * 0.185), wy, w * 0.16, wh, 6); g.fill(); }
      rrect(g, x + w * 0.79, wy, w * 0.17, wh, 6); g.fill();
      g.fillStyle = 'rgba(160,190,200,0.25)';
      for (let i = 0; i < 5; i++) g.fillRect(x + w * (0.05 + i * 0.185), wy + 4, w * 0.04, wh - 8);
      // sliding door seam + handle
      g.strokeStyle = '#7a5d00'; g.lineWidth = 2; g.strokeRect(x + w * 0.57, y + h * 0.04, w * 0.2, h * 0.9);
      g.fillStyle = '#222'; g.fillRect(x + w * 0.59, y + h * 0.5, w * 0.04, h * 0.03);
      // wheel arches
      g.fillStyle = '#1a1a1a';
      for (const cx of [0.17, 0.84]) { g.beginPath(); g.arc(x + w * cx, y + h, h * 0.24, Math.PI, 0); g.fill(); }
      paint(g, 'GOD DEY', x + w * 0.36, y + h * 0.88, h * 0.09, '#111', { wobble: 0.06 });
      weather(g, x, y, w, h, { fade: 0.08, dirt: 0.5, rust: 1, seed: 11 });
    }],
    ['danfo-front', 160, 160, (g, x, y, w, h) => {
      g.fillStyle = '#f2b705'; g.fillRect(x, y, w, h);
      g.fillStyle = '#20292e'; rrect(g, x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.38, 8); g.fill();
      g.fillStyle = 'rgba(170,200,210,0.25)'; g.fillRect(x + w * 0.12, y + h * 0.1, w * 0.12, h * 0.3);
      g.fillStyle = '#121212'; g.fillRect(x, y + h * 0.56, w, h * 0.07);
      g.fillStyle = '#2b2b2b'; g.fillRect(x + w * 0.3, y + h * 0.66, w * 0.4, h * 0.12);
      g.fillStyle = '#f2f2e6'; for (const cx of [0.14, 0.86]) { g.beginPath(); g.arc(x + w * cx, y + h * 0.72, w * 0.07, 0, 7); g.fill(); }
      g.fillStyle = '#e9e9e9'; g.fillRect(x + w * 0.32, y + h * 0.86, w * 0.36, h * 0.09);
      paint(g, 'LND 482 XA', x + w / 2, y + h * 0.905, h * 0.06, '#1b4d1b', { font: FONT_SANS, weight: '800', wobble: 0 });
      paint(g, 'JESUS IS LORD', x + w / 2, y + h * 0.5, h * 0.07, '#c8102e', { wobble: 0.01 });
      weather(g, x, y, w, h, { fade: 0.08, dirt: 0.5, rust: 0.6, seed: 13 });
    }],
    ['danfo-back', 160, 160, (g, x, y, w, h) => {
      g.fillStyle = '#f2b705'; g.fillRect(x, y, w, h);
      g.fillStyle = '#20292e'; rrect(g, x + w * 0.1, y + h * 0.07, w * 0.8, h * 0.34, 8); g.fill();
      g.fillStyle = '#fff'; g.fillRect(x + w * 0.16, y + h * 0.3, w * 0.68, h * 0.08);
      paint(g, 'JESUS IS LORD', x + w / 2, y + h * 0.34, h * 0.065, '#c8102e', { wobble: 0.01 });
      g.fillStyle = '#121212'; g.fillRect(x, y + h * 0.56, w, h * 0.07);
      paint(g, 'NO CONDITION IS PERMANENT', x + w / 2, y + h * 0.49, h * 0.055, '#111', { wobble: 0.04, maxW: w * 0.9 });
      g.fillStyle = '#c1121f'; g.fillRect(x + w * 0.05, y + h * 0.66, w * 0.1, h * 0.1); g.fillRect(x + w * 0.85, y + h * 0.66, w * 0.1, h * 0.1);
      g.fillStyle = '#e9e9e9'; g.fillRect(x + w * 0.32, y + h * 0.8, w * 0.36, h * 0.09);
      paint(g, 'LND 482 XA', x + w / 2, y + h * 0.845, h * 0.06, '#1b4d1b', { font: FONT_SANS, weight: '800', wobble: 0 });
      weather(g, x, y, w, h, { fade: 0.08, dirt: 0.6, rust: 0.8, seed: 15 });
    }],
    ['keke-side', 192, 128, (g, x, y, w, h) => {
      g.fillStyle = '#f2c200'; g.fillRect(x, y, w, h);
      g.fillStyle = '#0d7a3a'; g.fillRect(x, y + h * 0.62, w, h * 0.12);
      g.fillStyle = '#1a1a1a'; g.fillRect(x, y + h * 0.9, w, h * 0.1);
      weather(g, x, y, w, h, { fade: 0.1, dirt: 0.5, rust: 0.5, seed: 17 });
    }],
    ['tyre', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#141414'; g.fillRect(x, y, w, h);
      g.fillStyle = '#232323'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.36, 0, 7); g.fill();
      g.fillStyle = '#6d6f70'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.26, 0, 7); g.fill();
      g.fillStyle = '#3c3e40'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.09, 0, 7); g.fill();
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { const a = i * 1.2566; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2 + Math.cos(a) * w * 0.28, y + h / 2 + Math.sin(a) * w * 0.28); g.stroke(); }
    }],
    ['plate', 64, 24, (g, x, y, w, h) => { g.fillStyle = '#eee'; g.fillRect(x, y, w, h); paint(g, 'KJA 214 BC', x + w / 2, y + h / 2, h * 0.5, '#1b4d1b', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 }); }],
    ['speaker', 64, 96, (g, x, y, w, h) => {
      g.fillStyle = '#1b1b1b'; g.fillRect(x, y, w, h);
      g.fillStyle = '#0e0e0e';
      for (const [cy, rr] of [[0.28, 0.3], [0.72, 0.36]]) { g.beginPath(); g.arc(x + w / 2, y + h * cy, w * rr, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < h; i += 3) g.fillRect(x, y + i, w, 1);
    }],
    ['keys', 256, 32, (g, x, y, w, h) => {
      g.fillStyle = '#f6f6f2'; g.fillRect(x, y, w, h);
      const n = 36;
      g.fillStyle = '#9a9a9a'; for (let i = 0; i <= n; i++) g.fillRect(x + i * w / n, y, 1, h);
      g.fillStyle = '#111';
      for (let i = 0; i < n; i++) { const k = i % 7; if (k === 0 || k === 1 || k === 3 || k === 4 || k === 5) g.fillRect(x + (i + 0.65) * w / n, y, w / n * 0.7, h * 0.6); }
    }],
    ['laptop', 64, 48, (g, x, y, w, h) => {
      g.fillStyle = '#111'; g.fillRect(x, y, w, h);
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#2563eb'); gr.addColorStop(1, '#7c3aed');
      g.fillStyle = gr; g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.fillStyle = '#fff'; g.fillRect(x + 8, y + 12, w * 0.6, 3); g.fillRect(x + 8, y + 20, w * 0.45, 3); g.fillRect(x + 8, y + 28, w * 0.5, 3);
    }],
    ['mixer', 128, 64, (g, x, y, w, h) => {
      g.fillStyle = '#2b2d31'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 12; i++) {
        const cx = x + 6 + i * (w - 12) / 12 + 3;
        for (let k = 0; k < 4; k++) { g.fillStyle = ['#e63946', '#f4a261', '#2a9d8f', '#ddd'][k]; g.beginPath(); g.arc(cx, y + 8 + k * 8, 2, 0, 7); g.fill(); }
        g.fillStyle = '#111'; g.fillRect(cx - 1, y + 40, 2, 20); g.fillStyle = '#ccc'; g.fillRect(cx - 3, y + 44 + (i * 7) % 12, 6, 4);
      }
    }],
    ['tv', 128, 80, (g, x, y, w, h) => {
      g.fillStyle = '#0b0b0b'; g.fillRect(x, y, w, h);
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#87b6d8'); gr.addColorStop(0.6, '#e9c46a'); gr.addColorStop(1, '#4a6b2a');
      g.fillStyle = gr; g.fillRect(x + 4, y + 4, w - 8, h - 8);
      g.fillStyle = '#2f2f2f'; g.fillRect(x + w * 0.2, y + h * 0.45, w * 0.12, h * 0.4); g.fillRect(x + w * 0.6, y + h * 0.4, w * 0.14, h * 0.45);
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 6, y + h - 16, w * 0.5, 8);
    }],
    ['clock', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#6b3f22'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fbfbf6'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.44, 0, 7); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2, y + h * 0.18); g.stroke();
      g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w * 0.72, y + h * 0.58); g.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = '#111'; g.fillRect(x + w / 2 + Math.cos(a) * w * 0.37 - 1, y + h / 2 + Math.sin(a) * h * 0.37 - 1, 3, 3); }
    }],
    ['calendar', 64, 96, (g, x, y, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1f3f94'; g.fillRect(x, y, w, h * 0.42);
      paint(g, 'GRACE', x + w / 2, y + h * 0.14, h * 0.12, '#fff', { font: FONT_SANS, weight: '900', wobble: 0 });
      paint(g, 'ASSEMBLY 2026', x + w / 2, y + h * 0.3, h * 0.08, '#f4d03f', { font: FONT_SANS, weight: '800', wobble: 0, maxW: w * 0.9 });
      g.fillStyle = '#999'; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) g.fillRect(x + 4 + c * (w - 8) / 7, y + h * 0.5 + r * h * 0.09, (w - 8) / 7 - 2, h * 0.06);
    }],
    ['tomato', 64, 64, goods(['#d62828', '#e63946', '#c1121f', '#f77f00'], 7, 40)],
    ['pepper', 64, 64, goods(['#d00000', '#ffba08', '#e85d04', '#9d0208'], 4, 90)],
    ['onion', 64, 64, goods(['#9d4edd', '#b5838d', '#c08497', '#a26769'], 8, 30)],
    ['yam', 64, 64, (g, x, y, w, h) => { g.fillStyle = '#6f4e37'; g.fillRect(x, y, w, h); const r = rng(3); for (let i = 0; i < 6; i++) { g.fillStyle = ['#8b5a2b', '#7a4e2d', '#9c6b3e'][i % 3]; g.save(); g.translate(x + r() * w, y + r() * h); g.rotate(r() * 3); g.beginPath(); g.ellipse(0, 0, 22, 8, 0, 0, 7); g.fill(); g.restore(); } }],
    ['sachet', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#dfe9ef'; g.fillRect(x, y, w, h);
      const r = rng(5);
      for (let i = 0; i < 14; i++) { g.save(); g.translate(x + r() * w, y + r() * h); g.rotate(r() * 3); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(-10, -6, 20, 12); g.fillStyle = '#1d6fc4'; g.fillRect(-6, -2, 12, 4); g.restore(); }
    }],
    ['ricebag', 64, 96, (g, x, y, w, h) => {
      g.fillStyle = '#f4f1e6'; g.fillRect(x, y, w, h);
      g.fillStyle = '#0d7a3a'; g.fillRect(x, y + h * 0.3, w, h * 0.2);
      paint(g, 'RICE', x + w / 2, y + h * 0.4, h * 0.14, '#fff', { font: FONT_SANS, weight: '900', wobble: 0 });
      paint(g, '50kg', x + w / 2, y + h * 0.65, h * 0.12, '#c1121f', { font: FONT_SANS, weight: '900', wobble: 0 });
    }],
    ['snacks', 128, 64, (g, x, y, w, h) => {
      g.fillStyle = '#2b2622'; g.fillRect(x, y, w, h);
      const r = rng(9); const cols = ['#ffb703', '#e63946', '#219ebc', '#8ac926', '#f15bb5', '#ffffff'];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 10; i++) { g.fillStyle = cols[(r() * 6) | 0]; g.fillRect(x + 2 + i * w / 10, y + 2 + row * h / 3, w / 10 - 3, h / 3 - 4); }
    }],
    ['flowers', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#29522a'; g.fillRect(x, y, w, h);
      const r = rng(11); const cols = ['#ffffff', '#fbe3ea', '#ffd23f', '#e63946', '#ff8fab', '#f8f9fa', '#c1121f'];
      const sc = w / 64;
      for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? '#3f7a34' : '#24502a'; g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 5 * sc, 2.2 * sc, r() * 3, 0, 7); g.fill(); }
      for (let i = 0; i < 70; i++) {
        const c = cols[(r() * cols.length) | 0], cx = x + r() * w, cy = y + r() * h, rr = (2.2 + r() * 2.6) * sc;
        for (let k = 0; k < 5; k++) { const a = k * 1.2566 + r(); g.fillStyle = c; g.beginPath(); g.arc(cx + Math.cos(a) * rr * 0.6, cy + Math.sin(a) * rr * 0.6, rr * 0.55, 0, 7); g.fill(); }
        g.fillStyle = '#f4c430'; g.beginPath(); g.arc(cx, cy, rr * 0.3, 0, 7); g.fill();
      }
    }],
    ['drumhead', 64, 64, (g, x, y, w, h) => { g.fillStyle = '#ece8dc'; g.fillRect(x, y, w, h); g.strokeStyle = '#b8b2a0'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.45, 0, 7); g.stroke(); }],
    ['ankara-1', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#f77f00'; g.fillRect(x, y, w, h);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const cx = x + (i + 0.5) * w / 4, cy = y + (j + 0.5) * h / 4;
        g.fillStyle = '#003049'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
        g.fillStyle = '#fcbf49'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
        g.fillStyle = '#d62828'; g.beginPath(); g.arc(cx, cy, 1.6, 0, 7); g.fill();
      }
    }],
    ['ankara-2', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#2a9d8f'; g.fillRect(x, y, w, h);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const cx = x + (i + 0.5) * w / 4, cy = y + (j + 0.5) * h / 4;
        g.fillStyle = '#e9c46a'; g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 7, cy); g.lineTo(cx, cy + 7); g.lineTo(cx - 7, cy); g.fill();
        g.fillStyle = '#9b2226'; g.beginPath(); g.arc(cx, cy, 2.5, 0, 7); g.fill();
      }
    }],
    ['ankara-3', 64, 64, (g, x, y, w, h) => {
      g.fillStyle = '#5a189a'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#ffbe0b'; g.lineWidth = 3;
      for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(x + i * 16, y); g.quadraticCurveTo(x + i * 16 + 16, y + h / 2, x + i * 16, y + h); g.stroke(); }
      g.fillStyle = '#fb5607'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(x + (i % 3 + 0.5) * w / 3, y + ((i / 3) | 0) * h / 3 + 10, 4, 0, 7); g.fill(); }
    }],
    ['ac', 64, 32, (g, x, y, w, h) => { g.fillStyle = '#f4f4f2'; g.fillRect(x, y, w, h); g.fillStyle = '#c9c9c4'; for (let i = 0; i < 5; i++) g.fillRect(x + 4, y + h * 0.55 + i * 2.5, w - 8, 1.2); g.fillStyle = '#3ad16b'; g.fillRect(x + w - 10, y + 6, 3, 3); }],
    ['acout', 64, 48, (g, x, y, w, h) => { g.fillStyle = '#e8e8e2'; g.fillRect(x, y, w, h); g.fillStyle = '#333'; g.beginPath(); g.arc(x + w * 0.38, y + h / 2, h * 0.38, 0, 7); g.fill(); g.strokeStyle = '#ccc'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + w * 0.38, y + h / 2, h * 0.06 * i + 2, 0, 7); g.stroke(); } weather(g, x, y, w, h, { dirt: 0.4, seed: 21 }); }],
    ['gen-panel', 64, 48, (g, x, y, w, h) => { g.fillStyle = '#c1121f'; g.fillRect(x, y, w, h); g.fillStyle = '#222'; g.fillRect(x + 6, y + 6, w - 12, h - 12); g.fillStyle = '#ddd'; g.beginPath(); g.arc(x + w * 0.3, y + h / 2, 6, 0, 7); g.fill(); g.fillStyle = '#ffb703'; g.fillRect(x + w * 0.55, y + h * 0.35, 14, 8); weather(g, x, y, w, h, { dirt: 0.6, rust: 0.6, seed: 23 }); }],
  ];
  const { canvas, regions } = buildAtlas(S, items, scale);
  return { map: tex(canvas, { repeat: false, aniso: 8 }), regions, canvas };
}

/** Hazy Lagos sky: pale horizon, soft blue zenith, a few fair-weather clouds. Equirect-ish (u = azimuth, v = elevation). */
export function createSkyTexture(S = 512) {
  const w = S * 2, h = S / 2;
  const F = noiseField(128, 32, 8, 2, 5, 211);
  const F2 = noiseField(256, 32, 24, 3, 3, 223);
  const p = pixels(w, h, (u, v, o) => {
    // v: 0 = horizon (slightly below), 1 = zenith
    const e = Math.max(0, v);
    const t = Math.pow(e, 0.55);
    let R = lerp(0.86, 0.43, t), G = lerp(0.89, 0.64, t), B = lerp(0.9, 0.88, t);
    const n = sample(F, u, v) * 0.75 + sample(F2, u, v) * 0.25;
    const band = smooth(0.06, 0.25, e) * smooth(0.85, 0.45, e);
    const c = smooth(0.55, 0.78, n) * band;
    R = lerp(R, 0.97, c * 0.9); G = lerp(G, 0.97, c * 0.9); B = lerp(B, 0.98, c * 0.9);
    const shade = smooth(0.7, 0.9, n) * band * 0.12;
    R -= shade; G -= shade; B -= shade * 0.6;
    o.r = R; o.g = G; o.b = B;
  });
  const t = tex(p.canvas, { repeat: false, aniso: 1 });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Projector screen with hymn lyrics (public-domain hymns). Returns {map, show(slide)} */
export function createLyricsScreen(S = 512) {
  const w = S, h = Math.round(S * 9 / 16);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const t = tex(c, { repeat: false, aniso: 4 });
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  const slides = [
    { title: 'WELCOME TO GRACE ASSEMBLY', lines: ['You are loved. You are home.', 'Kindly switch your phone to silent', 'Sunday Service 9AM • Bible Study Wed 6PM'] },
    { title: 'Blessed Assurance', lines: ['Blessed assurance, Jesus is mine!', 'O what a foretaste of glory divine!', 'Heir of salvation, purchase of God,', 'Born of His Spirit, washed in His blood.'] },
    { title: 'To God Be the Glory', lines: ['To God be the glory, great things He hath done,', 'So loved He the world that He gave us His Son,', 'Praise the Lord, praise the Lord,', 'Let the earth hear His voice!'] },
    { title: 'It Is Well', lines: ['When peace, like a river, attendeth my way,', 'When sorrows like sea billows roll;', 'Whatever my lot, Thou hast taught me to say,', 'It is well, it is well with my soul.'] },
    { title: 'Amazing Grace', lines: ['Amazing grace! how sweet the sound,', 'That saved a wretch like me!', 'I once was lost, but now am found,', 'Was blind, but now I see.'] },
  ];
  function show(i) {
    const s = slides[((i % slides.length) + slides.length) % slides.length];
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0b1d4d'); gr.addColorStop(1, '#3b0b4d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.75, h * 0.2, 4, w * 0.75, h * 0.2, w * 0.6); glow.addColorStop(0, 'rgba(255,214,120,0.35)'); glow.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd56b'; g.font = `800 ${Math.round(h * 0.085)}px ${FONT_SANS}`;
    g.fillText(s.title, w / 2, h * 0.16, w * 0.9);
    g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(h * 0.07)}px ${FONT_SANS}`;
    s.lines.forEach((l, k) => g.fillText(l, w / 2, h * (0.36 + k * 0.15), w * 0.92));
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = `600 ${Math.round(h * 0.04)}px ${FONT_SANS}`;
    g.fillText('Grace Assembly Media', w / 2, h * 0.94);
    t.needsUpdate = true;
  }
  show(0);
  return { map: t, show, count: slides.length };
}

/**
 * Build every texture the world needs. Async so it can yield between jobs.
 * @param {'low'|'medium'|'high'} quality
 */
export async function createTextures(quality = 'medium', onProgress = () => {}) {
  const S = quality === 'low' ? 256 : 512;
  const A = quality === 'low' ? 512 : 1024;
  const out = {};
  const jobs = [
    ['plaster', () => plaster(S)], ['plasterIn', () => plasterIn(S)], ['zinc', () => zinc(S)], ['asphalt', () => asphalt(S)], ['laterite', () => laterite(S)],
    ['concrete', () => concrete(S)], ['pavers', () => pavers(S)], ['tiles', () => floorTiles(S)], ['ceiling', () => ceiling(S)],
    ['carpet', () => carpet(S)], ['wood', () => wood(S)], ['fabric', () => fabric(S)], ['metal', () => metal(S)],
    ['bark', () => bark(S)], ['foliage', () => foliage(S)], ['grille', () => grille(S)],
    ['signs', () => signsAtlas(A)], ['props', () => propsAtlas(A)],
  ];
  out.timings = {};
  for (const [name, fn] of jobs) { const t0 = performance.now(); out[name] = fn(); out.timings[name] = Math.round(performance.now() - t0); onProgress(Object.keys(out.timings).length / jobs.length); await tick(); }
  return out;
}
