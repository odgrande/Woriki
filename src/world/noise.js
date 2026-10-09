// Small deterministic noise helpers for procedural textures and layout jitter.
// Pure functions (no DOM, no three) so they can be unit-tested.

/** Mulberry32 seeded PRNG → function returning [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer lattice hash → [0, 1). */
export function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise. x, y in lattice cells; px, py = period in cells (integers). */
export function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Tileable fractal noise field computed once on a grid, sampled bilinearly later.
 * @param {number} w grid width  @param {number} h grid height
 * @param {number} cx cells across at the base octave  @param {number} cy cells down
 * @returns {{w:number,h:number,data:Float32Array}}
 */
export function noiseField(w, h, cx, cy, octaves = 4, seed = 1, gain = 0.5) {
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = i / w, v = j / h;
      let sum = 0, amp = 1, norm = 0, fx = cx, fy = cy;
      for (let o = 0; o < octaves; o++) {
        sum += amp * vnoise(u * fx, v * fy, fx, fy, seed + o * 31);
        norm += amp; amp *= gain; fx *= 2; fy *= 2;
      }
      data[j * w + i] = sum / norm;
    }
  }
  return { w, h, data };
}

/** Bilinear wrap-around sample of a noise field at u, v in [0, 1). */
export function sample(field, u, v) {
  const { w, h, data } = field;
  let x = u * w - 0.5, y = v * h - 0.5;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const x0 = ((xi % w) + w) % w, y0 = ((yi % h) + h) % h;
  const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
  const a = data[y0 * w + x0], b = data[y0 * w + x1], c = data[y1 * w + x0], d = data[y1 * w + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
