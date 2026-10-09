// Headwear sculpted procedurally around the measured skull and skinned 100% to the Head
// bone: gele (tall pleated head-tie with a fan), fila (soft folded cap), beret, cap and
// headscarf with a knot. Built in character rest space so it merges with the garments.

const TAU = Math.PI * 2;
const zig = (x) => Math.abs(((x % 1) + 1) % 1 - 0.5) * 4 - 1; // triangle wave -1..1

/**
 * Emit a parametric surface into the builder.
 * @param {object} b builder
 * @param {(u: number, v: number) => number[]} fn local position (u, v in 0..1)
 * @param {object} o {nu, nv, closedU, double, thick, slot, head (bone index), c (center), uvScale}
 */
function surface(b, fn, o) {
  const { nu, nv, closedU = false, double = false, thick = 0.003, slot, head, c } = o;
  const P = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(fn(i / nu, j / nv));
  const at = (i, j) => P[j * (nu + 1) + i];
  const N = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      let i0 = i - 1, i1 = i + 1;
      if (closedU) { if (i0 < 0) i0 = nu - 1; if (i1 > nu) i1 = 1; } else { i0 = Math.max(0, i0); i1 = Math.min(nu, i1); }
      const j0 = Math.max(0, j - 1), j1 = Math.min(nv, j + 1);
      const a = at(i1, j), bb = at(i0, j), cc = at(i, j1), d = at(i, j0);
      const du = [a[0] - bb[0], a[1] - bb[1], a[2] - bb[2]];
      const dv = [cc[0] - d[0], cc[1] - d[1], cc[2] - d[2]];
      const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      N.push([n[0] / l, n[1] / l, n[2] / l]);
    }
  }
  const si = [head, 0, 0, 0], sw = [1, 0, 0, 0];
  const emit = (flip) => {
    const base = b.count();
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const p = at(i, j), n = N[j * (nu + 1) + i];
        const off = flip ? -thick : 0;
        const q = [c.x + p[0] + n[0] * off, c.y + p[1] + n[1] * off, c.z + p[2] + n[2] * off];
        b.vertex(q, flip ? [-n[0], -n[1], -n[2]] : n, [i / nu * 0.5, j / nv * 0.3], si, sw, slot, q);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, cc = a + 1, d = a + nu + 1, e = d + 1;
        if (flip) b.idx.push(a, d, cc, cc, d, e); else b.idx.push(a, cc, d, cc, e, d);
      }
    }
  };
  emit(false);
  if (double) emit(true);
}

/**
 * Build a headwear item into the builder.
 * @param {string} kind
 * @param {object} body prepared body (uses lm.head3)
 * @param {object} b builder
 * @param {{slot: number, low: boolean}} o
 */
export function buildHeadwear(kind, body, b, o) {
  const H = body.lm.head3;
  const c = H.center.clone();
  const rx = H.rx, rz = H.rz, ry = H.top - c.y;
  const eyeRel = H.eyeY - c.y;
  const q = o.low ? 0.35 : 1;
  const R = (n) => Math.max(4, Math.round(n * q));
  const base = { slot: o.slot, head: body.headIndex, c };

  // Ellipsoid shell whose lower edge runs from `front` (forehead) to `back` (nape) heights.
  const shell = (ex, ey, ez, front, back, dz = 0, ripple = null) => (u, v) => {
    const phi = u * TAU;
    const w = (1 - Math.cos(phi)) / 2; // 0 front, 1 back
    const yb = front + (back - front) * Math.pow(w, 0.8);
    const b0 = Math.asin(Math.max(-0.99, Math.min(0.99, yb / ey)));
    const beta = b0 + (Math.PI / 2 - b0) * Math.pow(v, 0.9);
    let k = 1;
    if (ripple) k += ripple(phi, beta, v);
    const cb = Math.cos(beta);
    return [Math.sin(phi) * cb * ex * k, Math.sin(beta) * ey * (1 + (k - 1) * 0.3), dz + Math.cos(phi) * cb * ez * k];
  };

  switch (kind) {
    case 'gele': {
      // Wrapped base: taller at the back, diagonal pleats spiralling round the head.
      const ex = rx + 0.026, ez = rz + 0.03, ey = ry + 0.055;
      surface(b, shell(ex, ey, ez, eyeRel + 0.04, -0.075, -0.012,
        (phi, beta, v) => 0.05 * zig((phi * 5 + beta * 4) / TAU * 1.0) * Math.sin(Math.PI * Math.min(1, v * 1.2)) + 0.06 * Math.max(0, -Math.cos(phi)) * v),
      { ...base, nu: R(56), nv: R(14), closedU: true });
      // The fan: a tall pleated crown sweeping up and back from the top of the wrap.
      const fan = (spread, height, lean, pleats, phase, rise) => (u, v) => {
        const a = (u - 0.5) * spread + Math.PI + phase; // centred at the back
        const sa = Math.sin(a), ca = Math.cos(a);
        const r0x = ex * 0.72, r0z = ez * 0.72;
        const y0 = ey * 0.72 + rise;
        const h = height * (0.75 + 0.25 * Math.cos((u - 0.5) * Math.PI)) * (1 + 0.12 * zig(u * pleats * 0.5));
        const out = lean * v;
        const pleat = 0.018 * zig(u * pleats) * Math.pow(v, 0.8);
        const rr = 1 + out / Math.max(r0x, 0.01) + pleat * 6;
        return [sa * r0x * rr, y0 + h * v - 0.03 * v * v, -0.012 + ca * r0z * rr * 1.05];
      };
      surface(b, fan(3.6, 0.12, 0.07, 11, 0, 0), { ...base, nu: R(88), nv: R(8), double: true });
      surface(b, fan(2.2, 0.085, 0.05, 8, 0.5, 0.01), { ...base, nu: R(56), nv: R(6), double: true });
      // Front band crossing the forehead (the tie's tightened edge).
      surface(b, (u, v) => {
        const phi = (u - 0.5) * 2.4;
        const yy = eyeRel + 0.04 + v * 0.045;
        const k = 1.02 + 0.08 * v;
        return [Math.sin(phi) * (ex + 0.004) * k, yy + 0.012 * Math.cos(phi * 2) * v, -0.012 + Math.cos(phi) * (ez + 0.004) * k];
      }, { ...base, nu: R(24), nv: R(3), double: true });
      break;
    }
    case 'headscarf': {
      const ex = rx + 0.016, ez = rz + 0.018, ey = ry + 0.022;
      surface(b, shell(ex, ey, ez, eyeRel + 0.045, -0.1, -0.004,
        (phi, beta, v) => 0.012 * Math.sin(phi * 9 + beta * 3) * Math.sin(Math.PI * v)),
      { ...base, nu: R(44), nv: R(12), closedU: true });
      // Knot at the nape and two short tails.
      const knotY = -0.055, knotZ = -ez - 0.004;
      surface(b, (u, v) => {
        const a = u * TAU, bta = (v - 0.5) * Math.PI;
        return [Math.cos(a) * Math.cos(bta) * 0.034, knotY + Math.sin(bta) * 0.026, knotZ - 0.01 + Math.sin(a) * Math.cos(bta) * 0.018];
      }, { ...base, nu: R(14), nv: R(8), closedU: true });
      for (const s of [-1, 1]) {
        surface(b, (u, v) => [s * (0.008 + u * 0.03 + v * 0.012), knotY - 0.01 - v * 0.085, knotZ - 0.016 - v * 0.012 + Math.sin(u * Math.PI) * 0.004], { ...base, nu: R(4), nv: R(6), double: true });
      }
      break;
    }
    case 'fila': {
      // Soft cylindrical cap folded over to one side (gobi style).
      const ringFront = eyeRel + 0.06, ringBack = eyeRel + 0.035;
      const bx = rx + 0.012, bz = rz + 0.012;
      const h = 0.13;
      surface(b, (u, v) => {
        const phi = u * TAU;
        const w = (1 - Math.cos(phi)) / 2;
        const y0 = ringFront + (ringBack - ringFront) * w;
        // radius of the head at the ring height, widening slightly towards the top
        const k = 1 + 0.05 * Math.sin(Math.PI * Math.min(1, v * 1.4)) - 0.04 * v;
        const bend = Math.max(0, v - 0.55) / 0.45;
        let x = Math.sin(phi) * bx * k, z = -0.004 + Math.cos(phi) * bz * k;
        let y = y0 + h * v;
        // Fold: the top falls over to the wearer's right and slightly forward.
        x -= 0.07 * bend * bend;
        y -= 0.05 * bend * bend * (0.6 + 0.4 * Math.sin(phi));
        z += 0.012 * bend;
        // pinch the top closed along the fold line
        const pinch = Math.pow(Math.max(0, v - 0.8) / 0.2, 1.5);
        x *= 1 - pinch * 0.75 * Math.abs(Math.cos(phi)) * 0;
        z = z * (1 - pinch * 0.92) + (-0.004 + 0.012 * bend) * pinch * 0.92;
        return [x, y, z];
      }, { ...base, nu: R(40), nv: R(12), closedU: true, double: true });
      break;
    }
    case 'beret': {
      // Head band, then a broad soft crown pulled down to the wearer's right.
      const ringFront = eyeRel + 0.055, ringBack = eyeRel + 0.03;
      const bx = rx + 0.012, bz = rz + 0.012;
      surface(b, (u, v) => {
        const phi = u * TAU;
        const w = (1 - Math.cos(phi)) / 2;
        const tilt = -Math.sin(phi) * 0.012; // lower on the right (-x)
        const y0 = ringFront + (ringBack - ringFront) * w + tilt;
        if (v < 0.25) {
          const t = v / 0.25;
          return [Math.sin(phi) * bx, y0 + t * 0.022, -0.004 + Math.cos(phi) * bz];
        }
        const t = (v - 0.25) / 0.75;
        // profile: bulge out to 1.35x then roll in to the top centre
        const bulge = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.42;
        const rr = (1 - t * t) + bulge;
        const sx = Math.sin(phi) * bx * rr, sz = Math.cos(phi) * bz * rr * 0.95;
        const lean = (1 - Math.cos(Math.PI * t)) / 2;
        return [sx - 0.045 * lean, y0 + 0.022 + Math.sin(t * Math.PI * 0.5) * 0.06 - 0.025 * lean + 0.012 * Math.sin(phi) * t, -0.004 + sz];
      }, { ...base, nu: R(40), nv: R(12), closedU: true, double: true });
      // Badge on the left front of the band.
      if (!o.low && o.badgeSlot !== undefined) {
        const phi0 = 0.55;
        surface(b, (u, v) => {
          const a = u * TAU, r = v * 0.013;
          const px = Math.sin(phi0) * (bx + 0.004), pz = -0.004 + Math.cos(phi0) * (bz + 0.004);
          return [px + Math.cos(a) * r * Math.cos(phi0), ringFront + 0.02 + Math.sin(a) * r, pz - Math.cos(a) * r * Math.sin(phi0) + (1 - v) * 0.002];
        }, { ...base, slot: o.badgeSlot, nu: 12, nv: 2, closedU: true });
      }
      break;
    }
    case 'cap': {
      const ex = rx + 0.014, ez = rz + 0.014, ey = ry + 0.016;
      surface(b, shell(ex, ey, ez, eyeRel + 0.055, eyeRel + 0.01, -0.004, (phi, beta) => 0.01 * Math.cos(phi * 6) * Math.cos(beta) * 0.3),
        { ...base, nu: R(36), nv: R(10), closedU: true, double: true });
      // Brim
      surface(b, (u, v) => {
        const phi = (u - 0.5) * 2.1;
        const yb = eyeRel + 0.055;
        const r = 1 + v * 0.75 * Math.cos(phi * 0.75);
        return [Math.sin(phi) * ex * r, yb - v * v * 0.012, -0.004 + Math.cos(phi) * ez * r];
      }, { ...base, nu: R(20), nv: R(5), double: true, thick: 0.004 });
      break;
    }
    default:
      break;
  }
}
