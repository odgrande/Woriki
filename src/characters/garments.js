// Garments built from the body mesh itself: triangles are selected with signed-distance
// "cuts" (hems, necklines, sleeve ends) over the rest pose, outside vertices are snapped
// onto the cut so hems are straight, everything is pushed out along welded normals and
// keeps the body's skin weights, so clothes deform exactly with every animation.
// Body triangles fully covered by an opaque garment are dropped (no skin poke-through).

export const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Cuts: (p, g) => signed distance (>= 0 inside the garment); g receives the unit
// direction in which the distance grows (used to snap outside vertices onto the cut).
export const Cut = {
  below: (y0) => (p, g) => { g[0] = 0; g[1] = -1; g[2] = 0; return y0 - p[1]; },
  above: (y0) => (p, g) => { g[0] = 0; g[1] = 1; g[2] = 0; return p[1] - y0; },
  /** Sleeve end: |x| <= xEnd (arms are horizontal in the rest T-pose). */
  armMax: (xEnd) => (p, g) => { const s = Math.sign(p[0]) || 1; g[0] = -s; g[1] = 0; g[2] = 0; return xEnd - Math.abs(p[0]); },
  /** Armholes for sleeveless garments, only above `fromY`. */
  armholes: (xMax, fromY) => (p, g) => {
    if (p[1] < fromY) { g[0] = 0; g[1] = 1; g[2] = 0; return 1; }
    const s = Math.sign(p[0]) || 1; g[0] = -s; g[1] = 0; g[2] = 0; return xMax - Math.abs(p[0]);
  },
  /** Neck hole: hole = above y (lower at the front) and within radius R of the neck axis. */
  neckHole: ({ y, r0, frontR = 0, frontDip = 0, zc }) => (p, g) => {
    const dx = p[0], dz = p[2] - zc;
    const r = Math.hypot(dx, dz) || 1e-6;
    const c = Math.max(0, dz / r);
    const a = (y - frontDip * c * c) - p[1];
    const b = r - (r0 + frontR * c * c);
    if (a >= b) { g[0] = 0; g[1] = -1; g[2] = 0; return a; }
    g[0] = dx / r; g[1] = 0; g[2] = dz / r; return b;
  },
  /** V opening at the front (suit jacket, vest). */
  vHole: ({ bottom, slope, zc }) => (p, g) => {
    const a = bottom + slope * Math.abs(p[0]) - p[1];
    const b = zc - p[2];
    if (a >= b) { g[0] = 0; g[1] = -1; g[2] = 0; return a; }
    g[0] = 0; g[1] = 0; g[2] = -1; return b;
  },
  /** Within `width` above the V edge (lapels). */
  nearV: ({ bottom, slope, width }) => (p, g) => { g[0] = 0; g[1] = 1; g[2] = 0; return width - ((bottom + slope * Math.abs(p[0])) - p[1]); },
  /** Vertical band |(|x| - center)| <= halfW (center 0 = one band on the midline). */
  bandX: (center, halfW) => (p, g) => {
    const ax = Math.abs(p[0]);
    const u = center === 0 ? ax : ax - center;
    const s = (Math.sign(u) || 1) * (Math.sign(p[0]) || 1);
    g[0] = -s; g[1] = 0; g[2] = 0;
    return halfW - Math.abs(u);
  },
  front: (z0) => (p, g) => { g[0] = 0; g[1] = 0; g[2] = 1; return p[2] - z0; },
  back: (z0) => (p, g) => { g[0] = 0; g[1] = 0; g[2] = -1; return z0 - p[2]; },
  /** Diagonal band in the frontal plane (usher sash). */
  diagBand: ({ x0, y0, nx, ny, halfW }) => (p, g) => {
    const u = (p[0] - x0) * nx + (p[1] - y0) * ny;
    const s = Math.sign(u) || 1;
    g[0] = -s * nx; g[1] = -s * ny; g[2] = 0;
    return halfW - Math.abs(u);
  },
  /** Within radius R of the vertical neck axis (collars). */
  nearAxis: (R, zc) => (p, g) => {
    const dx = p[0], dz = p[2] - zc;
    const r = Math.hypot(dx, dz) || 1e-6;
    g[0] = -dx / r; g[1] = 0; g[2] = -dz / r;
    return R - r;
  },
  /** Collar opening at the front centre. */
  frontGap: (halfW, zc) => (p, g) => {
    const a = Math.abs(p[0]) - halfW;
    const b = zc - p[2];
    if (a >= b) { g[0] = Math.sign(p[0]) || 1; g[1] = 0; g[2] = 0; return a; }
    g[0] = 0; g[1] = 0; g[2] = -1; return b;
  },
};

// ---------------------------------------------------------------------------
// Outfit plans

const ARM = { none: -0.02, cap: 0.1, short: 0.3, elbow: 0.5, threequarter: 0.68, jacket: 0.93, long: 0.965 };

/**
 * Turn an appearance into a structural garment plan for one body.
 * @param {import('./appearance.js').Appearance} a
 * @param {object} lm body landmarks (see body.js)
 */
export function makePlan(a, lm) {
  const female = a.body === 'female';
  const slots = [];
  const fabrics = [];
  const pieces = [];
  const skirts = [];
  const collars = [];
  const addSlot = (color, rough = 0.85, metal = 0, fx = 0) => slots.push({ color, rough, metal, fx }) - 1;
  const addFabric = (kind, primary, secondary, rough = 0.75) => fabrics.push({ kind, primary, secondary, rough }) - 1;
  const { primary, secondary, pattern } = a.colors;
  const patterned = pattern !== 'plain';
  const zc = lm.neckZ;
  const collarY = lm.neckY - 0.012;
  const neckCut = (extraR = 0, frontR = 0) => Cut.neckHole({ y: lm.necklineFront - 0.07, r0: lm.necklineR + extraR, frontR, zc });
  const hipHem = lm.pelvisY + 0.012;
  const tuckHem = lm.waistY - 0.05;
  const trouserTop = lm.waistY + 0.012;
  const xAt = (s) => lm.shoulderX + s * (lm.wristX - lm.shoulderX);
  // Slots 0 and 1 are reserved for skin and hair (used by the low-detail crowd material).
  addSlot('#000000', 0.6); addSlot(a.hairColor, 0.8);

  /** Fabric reference for a garment: pattern texture or a plain slot. */
  const cloth = (color, { kind = pattern, rough = 0.82, metal = 0, fx = 0, second = secondary } = {}) => (
    kind && kind !== 'plain' ? { fabric: addFabric(kind, color, second, kind === 'lace' ? 0.6 : 0.7) } : { slot: addSlot(color, rough, metal, fx) }
  );

  const top = ({ id = 'top', mat, sleeve = 'long', hem = tuckHem, neck = 'round', loose = 0.004, hipFlare = 0, sleeveFlare = 0.004, base = 0.006, collar = false, vNeck = null, frontR = 0.01, neckR = 0, tucked = false, tuckMax = 0.01, smooth: smoothIt = 8, coveredBy = null }) => {
    const xEnd = xAt(ARM[sleeve]);
    const over = tucked ? 0 : 0.016;
    const cuts = [Cut.below(lm.height), Cut.above(hem), Cut.armMax(xEnd)];
    if (neck !== 'none') cuts.push(neckCut(neckR, frontR));
    if (vNeck) cuts.push(Cut.vHole({ ...vNeck, zc: zc + 0.02 }));
    pieces.push({
      id, ...mat, cuts, excl: ['head', 'hand', 'foot'], rim: true, hide: true, smooth: smoothIt, hang: over ? lm.waistY : undefined, coveredBy,
      maxOffset: over ? null : (p) => (p[1] < trouserTop + 0.01 ? tuckMax : Infinity),
      offset: (p) => base + loose * smooth(lm.chestY, lm.waistY, p[1]) + over * smooth(trouserTop + 0.05, trouserTop, p[1]) + hipFlare * smooth(lm.waistY + 0.04, hem, p[1])
        + sleeveFlare * smooth(xEnd - 0.12, xEnd, Math.abs(p[0])) * (Math.abs(p[0]) > lm.shoulderX ? 1 : 0),
    });
    if (collar) collars.push({ ...mat, height: 0.034, gap: 0.2, offset: base + 0.003 });
  };

  const trousers = ({ mat, top: yTop = trouserTop, hem = lm.ankleY + 0.025, flare = 0.016, base = 0.011, belt = null }) => {
    pieces.push({
      id: 'trousers', ...mat, cuts: [Cut.below(yTop), Cut.above(hem)], excl: ['head', 'upperarm', 'lowerarm', 'hand'], rim: true, hide: true, smooth: 6,
      offset: (p) => base + 0.006 * smooth(yTop - 0.11, yTop - 0.06, p[1]) + flare * smooth(lm.kneeY + 0.12, hem + 0.04, p[1]),
    });
    if (belt) {
      pieces.push({
        id: 'belt', slot: belt, cuts: [Cut.below(yTop - 0.004), Cut.above(yTop - 0.036)], excl: ['upperarm', 'lowerarm', 'hand'], rim: true, hide: false, smooth: 4,
        offset: () => base + 0.0095,
      });
    }
  };

  const shoes = (style, color = a.shoes) => {
    if (style === 'barefoot') return;
    const upper = addSlot(color, style === 'sneakers' ? 0.7 : 0.42, 0);
    const sole = addSlot(style === 'sneakers' ? '#f2f2f0' : '#1a1512', 0.8);
    if (style === 'sandals') {
      pieces.push({ id: 'sole', slot: sole, cuts: [Cut.below(0.022)], excl: ['thigh', 'head', 'hand'], rim: true, hide: false, offset: () => 0.0035 });
      pieces.push({
        id: 'strap', slot: upper, cuts: [Cut.below(0.07), Cut.above(0.004), Cut.front(lm.ballL.z - 0.075), Cut.back(lm.ballL.z - 0.02)],
        excl: ['thigh', 'head', 'hand'], rim: true, hide: false, offset: () => 0.004,
      });
      return;
    }
    const topY = style === 'boots' ? lm.ankleY + 0.11 : lm.ankleY + 0.035;
    pieces.push({
      id: 'shoes', slot: upper, cuts: [Cut.below(topY)], excl: ['thigh', 'head', 'hand'], rim: true, hide: true,
      slotFn: (p) => (p[1] < 0.016 ? sole : upper),
      offset: (p) => 0.005 + (p[2] > lm.ballL.z ? 0.003 : 0),
    });
  };

  const skirt = (spec) => {
    const s = { id: 'skirt', topY: lm.waistY, hemY: 0.06, flare: 0.06, ease: 0.006, xScale: 1, zScale: 1, gravity: 0.25, folds: 9, foldAmp: 0.006, ...spec };
    skirts.push(s);
    // Below-the-knee skirts always cover the hips and thighs: drop those body triangles.
    if (!s.arc && s.hemY < lm.kneeY - 0.05) {
      pieces.push({ id: 'skirt-hide', hideOnly: true, cuts: [Cut.below(Math.min(s.topY, lm.waistY) - 0.02), Cut.above(lm.kneeY + 0.07)], excl: ['upperarm', 'lowerarm', 'hand'], hide: true });
    }
  };

  let shoeStyle = 'shoes';
  let headMat = null;
  const fxColor = { embroidery: secondary };

  switch (a.outfit) {
    case 'shirt-trousers': {
      top({ mat: cloth(primary, { kind: pattern === 'lace' ? 'plain' : pattern }), sleeve: female ? 'elbow' : 'long', collar: true, hem: tuckHem, tucked: true });
      trousers({ mat: { slot: addSlot(secondary, 0.8) }, belt: addSlot('#18120e', 0.45) });
      break;
    }
    case 'ankara-shirt': {
      top({ mat: cloth(primary, { kind: patterned ? pattern : 'ankara-1' }), sleeve: 'short', hem: hipHem, hipFlare: 0.012, sleeveFlare: 0.012, base: 0.008, frontR: 0.006 });
      trousers({ mat: { slot: addSlot(female ? '#1f2937' : '#1c1c1f', 0.8) } });
      break;
    }
    case 'agbada': {
      const robe = addSlot(primary, 0.6, 0, 2);
      top({ mat: { slot: robe }, sleeve: 'long', hem: lm.chestY - 0.16, base: 0.016, sleeveFlare: 0.05, frontR: 0.02 });
      trousers({ mat: { slot: addSlot(primary, 0.7) }, flare: 0.012 });
      skirt({ topY: lm.necklineFront - 0.035, hemY: lm.kneeY - 0.27, flare: 0.06, ease: 0.014, xScale: 1.5, zScale: 0.98, scaleIn: 0.4, gravity: 0.6, folds: 7, foldAmp: 0.012, slot: robe });
      headMat = { slot: addSlot(secondary === '#111827' ? primary : secondary, 0.55, 0.15, 3) };
      break;
    }
    case 'senator': {
      const s = addSlot(primary, 0.72, 0, 2);
      top({ mat: { slot: s }, sleeve: 'long', hem: hipHem - 0.02, base: 0.009, hipFlare: 0.006, frontR: 0.004 });
      trousers({ mat: { slot: addSlot(primary, 0.75) }, flare: 0.012 });
      skirt({ topY: lm.waistY - 0.03, hemY: lm.kneeY - 0.07, flare: 0.035, ease: 0.008, gravity: 0.2, folds: 6, foldAmp: 0.004, slot: s });
      headMat = { slot: addSlot(primary, 0.6, 0.1, 3) };
      break;
    }
    case 'ankara-gown': {
      const m = cloth(primary, { kind: patterned ? pattern : 'ankara-2' });
      top({ mat: m, sleeve: 'short', hem: lm.waistY - 0.035, sleeveFlare: 0.014, frontR: 0.014 });
      skirt({ topY: lm.waistY + 0.005, hemY: 0.05, flare: 0.13, ease: 0.006, gravity: 0.3, folds: 10, foldAmp: 0.01, ...m });
      shoeStyle = 'sandals';
      headMat = a.headwear === 'headscarf' ? m : { slot: addSlot(secondary, 0.42, 0.25) };
      break;
    }
    case 'skirt-blouse': {
      top({ mat: cloth(primary, { kind: pattern === 'lace' || pattern === 'stripes' ? pattern : 'plain' }), sleeve: 'elbow', hem: lm.waistY - 0.05, sleeveFlare: 0.008, frontR: 0.012, tucked: true, tuckMax: 0.005 });
      skirt({ topY: lm.waistY + 0.01, hemY: lm.kneeY - 0.2, flare: 0.04, ease: 0.006, gravity: 0.15, folds: 6, foldAmp: 0.004, slot: addSlot(secondary, 0.75) });
      shoeStyle = 'shoes';
      headMat = { slot: addSlot(secondary, 0.45, 0.2) };
      break;
    }
    case 'iro-buba': {
      top({ mat: cloth(primary, { kind: pattern === 'lace' || pattern === 'plain' ? pattern : 'lace' }), sleeve: 'threequarter', hem: lm.pelvisY - 0.025, base: 0.008, hipFlare: 0.04, sleeveFlare: 0.04, frontR: 0.02 });
      const wrap = patterned && pattern !== 'lace' ? { fabric: addFabric(pattern, secondary, primary, 0.68) } : { slot: addSlot(secondary, 0.5, 0.1) };
      skirt({ id: 'iro', topY: lm.waistY + 0.02, hemY: 0.035, flare: 0.05, ease: 0.006, gravity: 0.25, folds: 5, foldAmp: 0.006, wrapFold: true, ...wrap });
      shoeStyle = 'sandals';
      headMat = { slot: addSlot(secondary, 0.42, 0.28) };
      break;
    }
    case 'choir-robe': {
      const robe = addSlot(primary, 0.5, 0.05);
      const stole = addSlot(secondary, 0.4, 0.35, 3);
      top({ mat: { slot: robe }, sleeve: 'long', hem: lm.waistY - 0.04, base: 0.01, sleeveFlare: 0.05, frontR: 0.006 });
      pieces.push({
        id: 'stole', slot: stole, cuts: [Cut.bandX(0.075, 0.024), Cut.above(lm.waistY - 0.03), Cut.armMax(lm.shoulderX - 0.02), neckCut(0.004, 0.006)],
        excl: ['head', 'hand'], rim: true, hide: false, smooth: 8, offset: () => 0.018,
      });
      skirt({ topY: lm.waistY - 0.01, hemY: 0.08, flare: 0.09, ease: 0.012, gravity: 0.35, folds: 8, foldAmp: 0.008, slot: robe, bands: [{ x: 0.075, halfW: 0.024, slot: stole }] });
      break;
    }
    case 'white-garment': {
      const w = addSlot('#f7f6f1', 0.82);
      top({ mat: { slot: w }, sleeve: 'long', hem: lm.waistY - 0.04, base: 0.009, sleeveFlare: 0.02, frontR: 0.004 });
      skirt({ topY: lm.waistY - 0.01, hemY: 0.035, flare: 0.07, ease: 0.01, gravity: 0.35, folds: 8, foldAmp: 0.008, slot: w });
      shoeStyle = 'barefoot';
      headMat = { slot: w };
      break;
    }
    case 'security': {
      top({ mat: { slot: addSlot(primary, 0.78) }, sleeve: 'short', collar: true, hem: tuckHem, sleeveFlare: 0.006, tucked: true, coveredBy: ['vest'] });
      trousers({ mat: { slot: addSlot(secondary, 0.75) }, belt: addSlot('#0d0d0d', 0.4) });
      pieces.push({
        id: 'vest', slot: addSlot('#c6f21c', 0.7, 0, 1),
        cuts: [Cut.above(trouserTop + 0.004), Cut.armholes(lm.shoulderX - 0.022, lm.chestY - 0.12), neckCut(0.02), Cut.vHole({ bottom: lm.chestY - 0.02, slope: 1.2, zc: zc + 0.02 })],
        excl: ['head', 'hand'], rim: true, hide: false, smooth: 8, offset: (p) => 0.02 + 0.004 * smooth(lm.waistY + 0.08, lm.pelvisY, p[1]),
      });
      shoeStyle = 'boots';
      headMat = { slot: addSlot(primary === '#111827' ? '#1c1c1c' : '#7f1d1d', 0.9) };
      break;
    }
    case 'usher': {
      const white = addSlot('#f8f8f6', 0.75);
      top({ mat: { slot: white }, sleeve: female ? 'elbow' : 'long', collar: true, hem: tuckHem, tucked: true, tuckMax: female ? 0.005 : 0.01 });
      if (female) skirt({ topY: lm.waistY + 0.01, hemY: lm.kneeY - 0.14, flare: 0.03, ease: 0.006, gravity: 0.15, folds: 5, foldAmp: 0.003, slot: addSlot(secondary, 0.7) });
      else trousers({ mat: { slot: addSlot(secondary, 0.75) }, belt: addSlot('#111111', 0.45) });
      // Sash from the left shoulder to the right hip, front and back.
      const p0 = [lm.shoulderX * 0.55, lm.chestY + 0.12];
      const dir = [-(lm.shoulderX * 1.1), -(lm.chestY + 0.12 - lm.waistY + 0.03)];
      const len = Math.hypot(dir[0], dir[1]);
      pieces.push({
        id: 'sash', slot: addSlot(primary, 0.45, 0.1, 3),
        cuts: [Cut.diagBand({ x0: p0[0], y0: p0[1], nx: -dir[1] / len, ny: dir[0] / len, halfW: 0.04 }), Cut.above(lm.waistY - 0.07), Cut.armMax(lm.shoulderX + 0.03), neckCut(0.02)],
        excl: ['head', 'hand'], rim: true, hide: false, smooth: 8, offset: () => 0.017,
      });
      shoeStyle = 'shoes';
      break;
    }
    case 'suit': {
      const jacket = addSlot(primary, 0.7);
      top({ id: 'shirt', mat: { slot: addSlot(secondary, 0.7) }, sleeve: 'long', collar: true, hem: tuckHem, tucked: true, coveredBy: ['jacket'] });
      pieces.push({
        id: 'tie', slot: addSlot(primary === '#1e3a8a' ? '#7f1d1d' : '#8b1e2d', 0.45, 0.1, 3),
        cuts: [Cut.bandX(0, 0.02), Cut.front(zc + 0.03), Cut.below(collarY + 0.008), Cut.above(lm.waistY + 0.04)],
        excl: ['head', 'hand'], rim: true, hide: false,
        offset: (p) => 0.011 + 0.006 * smooth(collarY - 0.03, collarY, p[1]),
      });
      const v = { bottom: lm.chestY - 0.07, slope: 1.6 };
      top({ id: 'jacket', mat: { slot: jacket }, sleeve: 'jacket', hem: lm.pelvisY - 0.08, base: 0.02, loose: 0.01, hipFlare: 0.012, sleeveFlare: 0.006, vNeck: v, frontR: 0.01, smooth: 16 });
      pieces.push({
        id: 'lapel', slot: jacket, cuts: [Cut.vHole({ ...v, zc: zc + 0.02 }), Cut.nearV({ ...v, width: 0.05 }), Cut.front(zc + 0.02), neckCut(0.002, 0.01)],
        excl: ['head', 'hand'], rim: true, hide: false, offset: () => 0.028, smooth: 4,
      });
      trousers({ mat: { slot: addSlot(primary, 0.7) } });
      break;
    }
    case 'tshirt-jeans': {
      top({ mat: cloth(primary, { kind: 'plain' }), sleeve: 'short', hem: hipHem, hipFlare: 0.006, base: 0.007, frontR: 0.004 });
      trousers({ mat: { slot: addSlot(secondary, 0.9, 0, 4) }, flare: 0.01, base: 0.01 });
      shoeStyle = 'sneakers';
      headMat = { slot: addSlot(primary === '#111827' ? '#1f2937' : '#111827', 0.85) };
      break;
    }
    case 'apron': {
      const ap = addSlot(primary, 0.8);
      top({ mat: { slot: addSlot(secondary, 0.82) }, sleeve: 'short', hem: tuckHem, frontR: 0.004, tucked: true, tuckMax: female ? 0.005 : 0.01 });
      if (female) skirt({ topY: lm.waistY + 0.01, hemY: lm.kneeY - 0.16, flare: 0.04, ease: 0.006, gravity: 0.15, folds: 5, foldAmp: 0.003, slot: addSlot('#1f2937', 0.75) });
      else trousers({ mat: { slot: addSlot('#1f2937', 0.8) } });
      pieces.push({
        id: 'strap', slot: ap, cuts: [Cut.bandX(0.085, 0.011), Cut.above(lm.chestY + 0.0), neckCut(0.006)],
        excl: ['head', 'hand'], rim: true, hide: false, offset: () => 0.02, smooth: 8,
      });
      pieces.push({
        id: 'bib', slot: ap, cuts: [Cut.bandX(0, 0.105), Cut.front(zc + 0.0), Cut.below(lm.chestY + (female ? -0.01 : 0.03)), Cut.above(lm.waistY - 0.02)],
        excl: ['head', 'hand'], rim: true, hide: false, offset: () => 0.022, smooth: 12,
      });
      pieces.push({ id: 'apron-tie', slot: ap, cuts: [Cut.below(lm.waistY + 0.005), Cut.above(lm.waistY - 0.02)], excl: ['upperarm', 'lowerarm', 'hand'], rim: true, hide: false, offset: () => 0.024 });
      skirt({ id: 'apron', topY: lm.waistY - 0.01, hemY: lm.kneeY - 0.04, flare: 0.03, ease: 0.026, gravity: 0.2, folds: 3, foldAmp: 0.003, slot: ap, arc: [-1.25, 1.25] });
      break;
    }
    default:
      break;
  }
  shoes(shoeStyle);

  // Headwear and what it does to the hair.
  let hair = a.hair;
  const hw = a.headwear;
  if (hw === 'gele' || hw === 'headscarf') hair = 'none';
  if ((hw === 'fila' || hw === 'cap' || hw === 'beret') && !['buzzed', 'buzzedfemale', 'none'].includes(hair)) hair = female ? 'buzzedfemale' : 'buzzed';
  let headwear = null;
  if (hw !== 'none') {
    let mat = headMat;
    if (hw === 'beret' && a.outfit !== 'security') mat = { slot: addSlot('#1c1c1c', 0.9) };
    if (hw === 'cap' && !mat) mat = { slot: addSlot(secondary, 0.85) };
    if (hw === 'gele' && (!mat || mat.fabric !== undefined)) mat = { slot: addSlot(secondary, 0.42, 0.25) };
    if (!mat) mat = patterned && pattern !== 'lace' && pattern !== 'stripes' ? { fabric: addFabric(pattern, primary, secondary, 0.7) } : { slot: addSlot(primary, 0.6, 0.05, hw === 'fila' ? 3 : 0) };
    headwear = { kind: hw, ...mat };
  }

  const key = [
    a.body, a.outfit, hw, hair, a.beard ? 'b' : '',
    pieces.map((p) => `${p.id}:${p.slot ?? ''}:${p.fabric ?? ''}`).join(','),
    skirts.map((s) => `${s.id}:${s.slot ?? ''}:${s.fabric ?? ''}`).join(','),
    collars.map((c) => `${c.slot ?? ''}:${c.fabric ?? ''}`).join(','),
    headwear ? `${headwear.kind}:${headwear.slot ?? ''}:${headwear.fabric ?? ''}` : '',
  ].join('|');
  return { pieces, skirts, collars, headwear, hair, beard: a.beard, slots, fabrics, fx: fxColor, key };
}

// ---------------------------------------------------------------------------
// Geometry assembly

/** Growable typed-array builder for one merged skinned geometry. */
export function createBuilder() {
  const b = { pos: [], nor: [], uv: [], si: [], sw: [], slot: [], rest: [], idx: [] };
  b.count = () => b.pos.length / 3;
  b.vertex = (p, n, uv, si, sw, slot, rest) => {
    b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); b.uv.push(uv[0], uv[1]);
    b.si.push(si[0], si[1], si[2], si[3]); b.sw.push(sw[0], sw[1], sw[2], sw[3]);
    b.slot.push(slot); b.rest.push(rest[0], rest[1], rest[2]);
    return b.count() - 1;
  };
  return b;
}

const tmpG = [0, 0, 0];

/** Minimum signed distance over all cuts for every body vertex. */
function evalCuts(M, cuts) {
  const out = new Float32Array(M.count);
  const p = [0, 0, 0];
  for (let i = 0; i < M.count; i++) {
    p[0] = M.position[i * 3]; p[1] = M.position[i * 3 + 1]; p[2] = M.position[i * 3 + 2];
    let m = Infinity;
    for (const c of cuts) m = Math.min(m, c(p, tmpG));
    out[i] = m;
  }
  return out;
}

/**
 * Build one body-derived garment piece into a builder.
 * @param {object} M body mesh data (body.js finishMesh)
 * @param {object} piece plan piece
 * @param {ReturnType<typeof createBuilder>} b
 * @param {{uvScale: number, rims: boolean, slot: number}} o
 */
export function buildPiece(M, piece, b, o) {
  if (piece.hideOnly) return;
  const d = evalCuts(M, piece.cuts);
  const excl = new Set(piece.excl || []);
  // Parts hidden under an outer garment (shirt under a jacket) are not built at all.
  const cover = o.covers && o.covers.length ? o.covers.map((cp) => evalCuts(M, cp.cuts)) : null;
  const covered = (i) => cover.some((cd) => cd[i] >= 0.02);
  const tris = [];
  const idx = M.index;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], bb = idx[t + 1], c = idx[t + 2];
    if (excl.size && (excl.has(M.group[a]) || excl.has(M.group[bb]) || excl.has(M.group[c]))) continue;
    if (cover && covered(a) && covered(bb) && covered(c)) continue;
    if (d[a] >= 0 || d[bb] >= 0 || d[c] >= 0) tris.push(a, bb, c);
  }
  if (!tris.length) return;
  // Inside neighbours of every outside vertex: the hem is found on the body surface along
  // these edges (no floating points, no spikes), instead of projecting into the air.
  const insideNb = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const v = tris[t + e];
      if (d[v] >= 0) continue;
      for (let f = 1; f < 3; f++) {
        const u = tris[t + ((e + f) % 3)];
        if (d[u] >= 0) (insideNb.get(v) || insideNb.set(v, new Set()).get(v)).add(u);
      }
    }
  }
  const evalAt = (q) => { let m = Infinity; for (const c of piece.cuts) m = Math.min(m, c(q, g)); return m; };
  const edgeHit = (u, v, out) => {
    let lo = 0, hi = 1; // d(u) >= 0, d(v) < 0
    const q = [0, 0, 0];
    for (let it = 0; it < 10; it++) {
      const mid = (lo + hi) / 2;
      for (let k = 0; k < 3; k++) q[k] = M.position[u * 3 + k] + (M.position[v * 3 + k] - M.position[u * 3 + k]) * mid;
      if (evalAt(q) >= 0) lo = mid; else hi = mid;
    }
    for (let k = 0; k < 3; k++) out[k] = M.position[u * 3 + k] + (M.position[v * 3 + k] - M.position[u * 3 + k]) * lo;
    return out;
  };
  const map = new Map();
  const p = [0, 0, 0], g = [0, 0, 0], n = [0, 0, 0], q = [0, 0, 0], uv = [0, 0];
  const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  const finalPos = new Map();
  const vert = (i) => {
    let v = map.get(i);
    if (v !== undefined) return v;
    p[0] = M.position[i * 3]; p[1] = M.position[i * 3 + 1]; p[2] = M.position[i * 3 + 2];
    if (d[i] < 0) {
      const nbs = insideNb.get(i);
      if (nbs && nbs.size) {
        const h = [0, 0, 0], acc = [0, 0, 0];
        for (const u of nbs) { edgeHit(u, i, h); acc[0] += h[0]; acc[1] += h[1]; acc[2] += h[2]; }
        p[0] = acc[0] / nbs.size; p[1] = acc[1] / nbs.size; p[2] = acc[2] / nbs.size;
      } else {
        for (let it = 0; it < 3; it++) {
          for (const cut of piece.cuts) { const dd = cut(p, g); if (dd < 0) { p[0] -= dd * g[0]; p[1] -= dd * g[1]; p[2] -= dd * g[2]; } }
        }
      }
    }
    n[0] = M.weldNormal[i * 3]; n[1] = M.weldNormal[i * 3 + 1]; n[2] = M.weldNormal[i * 3 + 2];
    let off = (piece.offset ? piece.offset(p, n) : 0.006) * (o.offsetScale || 1);
    if (piece.maxOffset) off = Math.min(off, piece.maxOffset(p));
    q[0] = p[0] + n[0] * off; q[1] = p[1] + n[1] * off; q[2] = p[2] + n[2] * off;
    uv[0] = M.uv[i * 2] * o.uvScale; uv[1] = M.uv[i * 2 + 1] * o.uvScale;
    for (let k = 0; k < 4; k++) { si[k] = M.skinIndex[i * 4 + k]; sw[k] = M.skinWeight[i * 4 + k]; }
    if (piece.hang !== undefined && o.boneGroups) {
      // Tops hang from the hips: leg influence fades to the pelvis below the waist.
      const f = smooth(piece.hang, piece.hang - 0.08, p[1]);
      if (f > 0) {
        let moved = 0;
        for (let k = 0; k < 4; k++) {
          const g = o.boneGroups[si[k]];
          if (g === 'thigh' || g === 'calf') { moved += sw[k] * f; sw[k] *= 1 - f; }
        }
        if (moved > 0) {
          let k = -1;
          for (let q = 0; q < 4; q++) if (si[q] === o.pelvisIndex && sw[q] > 0) k = q;
          if (k < 0) {
            k = 0;
            for (let q = 1; q < 4; q++) if (sw[q] < sw[k]) k = q;
            moved += sw[k]; // the weakest influence (if any) is folded into the pelvis
            si[k] = o.pelvisIndex; sw[k] = 0;
          }
          sw[k] += moved;
        }
      }
    }
    const slot = piece.slotFn ? piece.slotFn(p) : o.slot;
    v = b.vertex(q, n, uv, si, sw, slot, p);
    map.set(i, v);
    finalPos.set(i, { q: [q[0], q[1], q[2]], p: [p[0], p[1], p[2]], n: [n[0], n[1], n[2]], uv: [uv[0], uv[1]], si: [...si], sw: [...sw], slot });
    return v;
  };
  for (let t = 0; t < tris.length; t += 3) b.idx.push(vert(tris[t]), vert(tris[t + 1]), vert(tris[t + 2]));
  if (piece.smooth) relax(M, tris, map, finalPos, b, piece.smooth, piece.offset, piece.maxOffset);

  if (!(o.rims && piece.rim)) return;
  // Hem thickness: a thin strip turning in from every open edge.
  const W = M.weldId;
  const edges = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], c = tris[t + ((e + 1) % 3)];
      const wa = W[a], wc = W[c];
      const k = wa < wc ? wa * 1e6 + wc : wc * 1e6 + wa;
      const ex = edges.get(k);
      if (ex) ex.n++; else edges.set(k, { a, c, n: 1 });
    }
  }
  const h = [0, 0, 0], nn = [0, 0, 0];
  for (const { a, c, n: cnt } of edges.values()) {
    if (cnt !== 1) continue;
    const A = finalPos.get(a), C = finalPos.get(c);
    const ex = C.q[0] - A.q[0], ey = C.q[1] - A.q[1], ez = C.q[2] - A.q[2];
    nn[0] = A.n[0] + C.n[0]; nn[1] = A.n[1] + C.n[1]; nn[2] = A.n[2] + C.n[2];
    // outward = e x n
    h[0] = ey * nn[2] - ez * nn[1]; h[1] = ez * nn[0] - ex * nn[2]; h[2] = ex * nn[1] - ey * nn[0];
    const hl = Math.hypot(h[0], h[1], h[2]) || 1;
    h[0] /= hl; h[1] /= hl; h[2] /= hl;
    const inner = (V) => [V.p[0] + V.n[0] * 0.0015, V.p[1] + V.n[1] * 0.0015, V.p[2] + V.n[2] * 0.0015];
    const a0 = b.vertex(A.q, h, A.uv, A.si, A.sw, A.slot, A.p);
    const c0 = b.vertex(C.q, h, C.uv, C.si, C.sw, C.slot, C.p);
    const a1 = b.vertex(inner(A), h, [A.uv[0], A.uv[1] + 0.01], A.si, A.sw, A.slot, A.p);
    const c1 = b.vertex(inner(C), h, [C.uv[0], C.uv[1] + 0.01], C.si, C.sw, C.slot, C.p);
    b.idx.push(a0, a1, c1, a0, c1, c0);
  }
}

/**
 * Cloth relaxation: Laplacian smoothing over the piece's welded surface so fabric bridges
 * over muscle detail instead of being painted on, never closer to the skin than the
 * piece's offset. Open edges (hems) stay put. Normals are recomputed for shading.
 */
function relax(M, tris, map, finalPos, b, iterations, offsetFn, maxFn) {
  const W = M.weldId;
  const ids = new Map(); // weld id -> body vertex indices in this piece
  for (const i of map.keys()) { const w = W[i]; (ids.get(w) || ids.set(w, []).get(w)).push(i); }
  const nb = new Map();
  const edgeCount = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = W[tris[t + e]], c = W[tris[t + ((e + 1) % 3)]];
      if (a === c) continue;
      (nb.get(a) || nb.set(a, new Set()).get(a)).add(c);
      (nb.get(c) || nb.set(c, new Set()).get(c)).add(a);
      const k = a < c ? a * 1e6 + c : c * 1e6 + a;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }
  const fixed = new Set();
  for (const [k, n] of edgeCount) if (n === 1) { fixed.add(Math.floor(k / 1e6)); fixed.add(k % 1e6); }
  const P = new Map(), base = new Map(), N = new Map(), minOff = new Map(), maxOff = new Map();
  for (const [w, list] of ids) {
    const f = finalPos.get(list[0]);
    P.set(w, [...f.q]); base.set(w, f.p); N.set(w, f.n);
    minOff.set(w, offsetFn ? offsetFn(f.p, f.n) * 0.8 : 0.004);
    maxOff.set(w, maxFn ? maxFn(f.p) : Infinity);
  }
  const lambda = 0.55;
  for (let it = 0; it < iterations; it++) {
    const next = new Map();
    for (const [w, p] of P) {
      const ns = nb.get(w);
      if (fixed.has(w) || !ns || ns.size < 2) { next.set(w, p); continue; }
      let x = 0, y = 0, z = 0;
      for (const o of ns) { const q = P.get(o); x += q[0]; y += q[1]; z += q[2]; }
      const k = 1 / ns.size;
      const q = [p[0] + (x * k - p[0]) * lambda, p[1] + (y * k - p[1]) * lambda, p[2] + (z * k - p[2]) * lambda];
      // never sink below the minimum offset from the skin
      const bp = base.get(w), n = N.get(w);
      const d = (q[0] - bp[0]) * n[0] + (q[1] - bp[1]) * n[1] + (q[2] - bp[2]) * n[2];
      const m = minOff.get(w);
      if (d < m) { q[0] += n[0] * (m - d); q[1] += n[1] * (m - d); q[2] += n[2] * (m - d); }
      const mx = maxOff.get(w);
      if (d > mx) { q[0] -= n[0] * (d - mx); q[1] -= n[1] * (d - mx); q[2] -= n[2] * (d - mx); }
      next.set(w, q);
    }
    for (const [w, q] of next) P.set(w, q);
  }
  // Smooth normals from the relaxed surface.
  const acc = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    const a = P.get(W[tris[t]]), c = P.get(W[tris[t + 1]]), d = P.get(W[tris[t + 2]]);
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (let e = 0; e < 3; e++) {
      const w = W[tris[t + e]];
      const s = acc.get(w) || acc.set(w, [0, 0, 0]).get(w);
      s[0] += n[0]; s[1] += n[1]; s[2] += n[2];
    }
  }
  for (const [w, list] of ids) {
    const q = P.get(w);
    const n = acc.get(w) || [0, 1, 0];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const i of list) {
      const v = map.get(i);
      b.pos[v * 3] = q[0]; b.pos[v * 3 + 1] = q[1]; b.pos[v * 3 + 2] = q[2];
      b.nor[v * 3] = n[0] / l; b.nor[v * 3 + 1] = n[1] / l; b.nor[v * 3 + 2] = n[2] / l;
      const f = finalPos.get(i);
      f.q = q;
    }
  }
}

/**
 * Indices of body triangles still visible under the plan's opaque garments.
 * @returns {Uint32Array}
 */
export function visibleBodyIndex(M, plan, margin = 0.014) {
  const hidden = new Uint8Array(M.index.length / 3);
  for (const piece of plan.pieces) {
    if (!piece.hide) continue;
    const d = evalCuts(M, piece.cuts);
    const excl = new Set(piece.excl || []);
    for (let t = 0, f = 0; t < M.index.length; t += 3, f++) {
      if (hidden[f]) continue;
      const a = M.index[t], b = M.index[t + 1], c = M.index[t + 2];
      if (excl.size && (excl.has(M.group[a]) || excl.has(M.group[b]) || excl.has(M.group[c]))) continue;
      if (d[a] >= margin && d[b] >= margin && d[c] >= margin) hidden[f] = 1;
    }
  }
  const out = [];
  for (let t = 0, f = 0; t < M.index.length; t += 3, f++) if (!hidden[f]) out.push(M.index[t], M.index[t + 1], M.index[t + 2]);
  return Uint32Array.from(out);
}

/**
 * Shirt collar: a standing band generated along the measured neckline, open at the front.
 * Skin weights are copied from the nearest neck/torso vertex.
 */
export function buildCollar(body, M, spec, b, o, lookup) {
  const lm = body.lm;
  const zc = lm.neckZ;
  const R = lm.necklineR + spec.offset;
  const n = o.low ? 8 : 30;
  const gap = spec.gap;
  const rows = [0, 0.5, 1];
  const grid = [];
  for (let i = 0; i <= n; i++) {
    const th = gap + ((Math.PI * 2 - 2 * gap) * i) / n;
    const back = (1 - Math.cos(th)) / 2;
    const yb = lm.necklineAt(th) + 0.002;
    const h = spec.height * (0.7 + 0.3 * back);
    const tip = 1 - smooth(gap, gap + 0.6, Math.min(th, Math.PI * 2 - th));
    const bi = lookup(Math.sin(th) * (R - spec.offset), yb, zc + Math.cos(th) * (R - spec.offset));
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) { si[k] = M.skinIndex[bi * 4 + k]; sw[k] = M.skinWeight[bi * 4 + k]; }
    grid.push(rows.map((v) => {
      const r = R - 0.004 * v + tip * 0.018 * v * v;
      return { p: [Math.sin(th) * r, yb + h * v - tip * 0.008 * v, zc + Math.cos(th) * r], n: [Math.sin(th), 0.15, Math.cos(th)], si, sw, th, v };
    }));
  }
  const emit = (inner) => {
    const ids = grid.map((col) => col.map((g) => {
      const nn = inner ? [-g.n[0], -g.n[1], -g.n[2]] : g.n;
      const q = inner ? [g.p[0] - g.n[0] * 0.003, g.p[1], g.p[2] - g.n[2] * 0.003] : g.p;
      return b.vertex(q, nn, [g.th * R * (o.uvScale ? 1 : 0), g.v * 0.04], g.si, g.sw, o.slot, g.p);
    }));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < rows.length - 1; j++) {
        const a = ids[i][j], c = ids[i + 1][j], d = ids[i][j + 1], e = ids[i + 1][j + 1];
        if (inner) b.idx.push(a, d, c, c, d, e); else b.idx.push(a, c, d, c, e, d);
      }
    }
    return ids;
  };
  const out = emit(false);
  if (o.low) return;
  const inn = emit(true);
  const t = rows.length - 1;
  for (let i = 0; i < n; i++) b.idx.push(out[i][t], inn[i + 1][t], inn[i][t], out[i][t], out[i + 1][t], inn[i + 1][t]);
}
