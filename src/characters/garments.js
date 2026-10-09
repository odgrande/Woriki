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

const ARM = { none: -0.02, cap: 0.1, short: 0.3, elbow: 0.5, threequarter: 0.68, long: 0.965 };

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
  const addSlot = (color, rough = 0.85, metal = 0, fx = 0) => slots.push({ color, rough, metal, fx }) - 1;
  const addFabric = (kind, primary, secondary, rough = 0.75) => fabrics.push({ kind, primary, secondary, rough }) - 1;
  const { primary, secondary, pattern } = a.colors;
  const patterned = pattern !== 'plain';
  const zc = lm.neck.z;
  const collarY = lm.neckY - 0.012;
  const hipHem = lm.pelvisY - 0.025;
  const tuckHem = lm.waistY - 0.05;
  const trouserTop = lm.waistY + 0.012;
  const xAt = (s) => lm.shoulderX + s * (lm.wristX - lm.shoulderX);
  // Slots 0 and 1 are reserved for skin and hair (used by the low-detail crowd material).
  addSlot('#000000', 0.6); addSlot(a.hairColor, 0.8);

  /** Fabric reference for a garment: pattern texture or a plain slot. */
  const cloth = (color, { kind = pattern, rough = 0.82, metal = 0, fx = 0, second = secondary } = {}) => (
    kind && kind !== 'plain' ? { fabric: addFabric(kind, color, second, kind === 'lace' ? 0.6 : 0.7) } : { slot: addSlot(color, rough, metal, fx) }
  );

  const top = ({ id = 'top', mat, sleeve = 'long', hem = tuckHem, neck = 'round', loose = 0.004, hipFlare = 0, sleeveFlare = 0.004, base = 0.006, collar = false, vNeck = null, frontR = 0.012, frontDip = 0.025 }) => {
    const xEnd = xAt(ARM[sleeve]);
    const cuts = [Cut.below(lm.height), Cut.above(hem), Cut.armMax(xEnd)];
    if (neck !== 'none') cuts.push(Cut.neckHole({ y: collarY, r0: lm.neckRadius + 0.004, frontR, frontDip, zc }));
    if (vNeck) cuts.push(Cut.vHole({ ...vNeck, zc: zc + 0.02 }));
    pieces.push({
      id, ...mat, cuts, excl: ['head', 'hand', 'foot'], rim: true, hide: true,
      offset: (p) => base + loose * smooth(lm.chestY, lm.waistY, p[1]) + hipFlare * smooth(lm.waistY + 0.04, hem, p[1])
        + sleeveFlare * smooth(xEnd - 0.12, xEnd, Math.abs(p[0])) * (Math.abs(p[0]) > lm.shoulderX ? 1 : 0),
    });
    if (collar) {
      pieces.push({
        id: id + '-collar', ...mat,
        cuts: [Cut.above(collarY - 0.012), Cut.below(collarY + 0.032), Cut.nearAxis(lm.neckRadius + 0.03, zc), Cut.frontGap(0.012, zc + 0.01)],
        excl: ['hand', 'upperarm', 'lowerarm'], rim: true, hide: false,
        offset: (p) => 0.006 + 0.008 * smooth(collarY - 0.01, collarY + 0.03, p[1]),
      });
    }
  };

  const trousers = ({ mat, top: yTop = trouserTop, hem = lm.ankleY + 0.025, flare = 0.016, base = 0.011, belt = null }) => {
    pieces.push({
      id: 'trousers', ...mat, cuts: [Cut.below(yTop), Cut.above(hem)], excl: ['head', 'upperarm', 'lowerarm', 'hand'], rim: true, hide: true,
      offset: (p) => base + 0.004 * smooth(yTop - 0.06, yTop - 0.01, p[1]) + flare * smooth(lm.kneeY + 0.12, hem + 0.04, p[1]),
    });
    if (belt) {
      pieces.push({
        id: 'belt', slot: belt, cuts: [Cut.below(yTop - 0.004), Cut.above(yTop - 0.036)], excl: ['upperarm', 'lowerarm', 'hand'], rim: true, hide: false,
        offset: () => base + 0.0075,
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

  const skirt = (spec) => skirts.push({ id: 'skirt', topY: lm.waistY, hemY: 0.06, flare: 0.06, ease: 0.006, xScale: 1, zScale: 1, gravity: 0.25, folds: 9, foldAmp: 0.006, ...spec });

  let shoeStyle = 'shoes';
  let headMat = null;
  const fxColor = { embroidery: secondary };

  switch (a.outfit) {
    case 'shirt-trousers': {
      top({ mat: cloth(primary, { kind: pattern === 'lace' ? 'plain' : pattern }), sleeve: female ? 'elbow' : 'long', collar: true, hem: tuckHem });
      trousers({ mat: { slot: addSlot(secondary, 0.8) }, belt: addSlot('#18120e', 0.45) });
      break;
    }
    case 'ankara-shirt': {
      top({ mat: cloth(primary, { kind: patterned ? pattern : 'ankara-1' }), sleeve: 'short', hem: hipHem, hipFlare: 0.022, sleeveFlare: 0.012, base: 0.008, frontR: 0.006, frontDip: 0.012 });
      trousers({ mat: { slot: addSlot(female ? '#1f2937' : '#1c1c1f', 0.8) } });
      break;
    }
    case 'agbada': {
      const robe = addSlot(primary, 0.6, 0, 2);
      top({ mat: { slot: robe }, sleeve: 'long', hem: lm.chestY - 0.16, base: 0.016, sleeveFlare: 0.05, frontR: 0.02, frontDip: 0.035 });
      trousers({ mat: { slot: addSlot(primary, 0.7) }, flare: 0.012 });
      skirt({ topY: lm.chestY - 0.07, hemY: lm.kneeY - 0.25, flare: 0.16, ease: 0.014, xScale: 1.42, zScale: 1.12, gravity: 0.6, folds: 7, foldAmp: 0.014, slot: robe });
      headMat = { slot: addSlot(secondary === '#111827' ? primary : secondary, 0.55, 0.15, 3) };
      break;
    }
    case 'senator': {
      const s = addSlot(primary, 0.72, 0, 2);
      top({ mat: { slot: s }, sleeve: 'long', hem: hipHem - 0.02, base: 0.009, hipFlare: 0.006, frontR: 0.004, frontDip: 0.01 });
      trousers({ mat: { slot: addSlot(primary, 0.75) }, flare: 0.012 });
      skirt({ topY: lm.waistY - 0.03, hemY: lm.kneeY - 0.07, flare: 0.035, ease: 0.008, gravity: 0.2, folds: 6, foldAmp: 0.004, slot: s });
      headMat = { slot: addSlot(primary, 0.6, 0.1, 3) };
      break;
    }
    case 'ankara-gown': {
      const m = cloth(primary, { kind: patterned ? pattern : 'ankara-2' });
      top({ mat: m, sleeve: 'short', hem: lm.waistY - 0.035, sleeveFlare: 0.014, frontR: 0.014, frontDip: 0.03 });
      skirt({ topY: lm.waistY + 0.005, hemY: 0.05, flare: 0.13, ease: 0.006, gravity: 0.3, folds: 10, foldAmp: 0.01, ...m });
      shoeStyle = 'sandals';
      headMat = a.headwear === 'headscarf' ? m : { slot: addSlot(secondary, 0.4, 0.25, 3) };
      break;
    }
    case 'skirt-blouse': {
      top({ mat: cloth(primary, { kind: pattern === 'lace' || pattern === 'stripes' ? pattern : 'plain' }), sleeve: 'elbow', hem: lm.waistY - 0.05, sleeveFlare: 0.008, frontR: 0.012, frontDip: 0.028 });
      skirt({ topY: lm.waistY + 0.01, hemY: lm.kneeY - 0.2, flare: 0.04, ease: 0.006, gravity: 0.15, folds: 6, foldAmp: 0.004, slot: addSlot(secondary, 0.75) });
      shoeStyle = 'shoes';
      headMat = { slot: addSlot(secondary, 0.45, 0.2, 3) };
      break;
    }
    case 'iro-buba': {
      top({ mat: cloth(primary, { kind: pattern === 'lace' || pattern === 'plain' ? pattern : 'lace' }), sleeve: 'threequarter', hem: lm.pelvisY - 0.07, base: 0.008, hipFlare: 0.034, sleeveFlare: 0.04, frontR: 0.02, frontDip: 0.03 });
      const wrap = patterned && pattern !== 'lace' ? { fabric: addFabric(pattern, secondary, primary, 0.68) } : { slot: addSlot(secondary, 0.5, 0.1) };
      skirt({ id: 'iro', topY: lm.waistY + 0.02, hemY: 0.035, flare: 0.05, ease: 0.006, gravity: 0.25, folds: 5, foldAmp: 0.006, wrapFold: true, ...wrap });
      shoeStyle = 'sandals';
      headMat = { slot: addSlot(secondary, 0.4, 0.3, 3) };
      break;
    }
    case 'choir-robe': {
      const robe = addSlot(primary, 0.5, 0.05);
      const stole = addSlot(secondary, 0.4, 0.35, 3);
      top({ mat: { slot: robe }, sleeve: 'long', hem: lm.waistY - 0.04, base: 0.01, sleeveFlare: 0.05, frontR: 0.006, frontDip: 0.014 });
      pieces.push({
        id: 'stole', slot: stole, cuts: [Cut.bandX(0.085, 0.032), Cut.above(lm.waistY - 0.03), Cut.armMax(lm.shoulderX - 0.02), Cut.neckHole({ y: collarY, r0: lm.neckRadius + 0.004, frontR: 0.006, frontDip: 0.014, zc })],
        excl: ['head', 'hand', 'upperarm', 'lowerarm'], rim: true, hide: false, offset: () => 0.017,
      });
      skirt({ topY: lm.waistY - 0.01, hemY: 0.08, flare: 0.09, ease: 0.012, gravity: 0.35, folds: 8, foldAmp: 0.008, slot: robe, bands: [{ x: 0.085, halfW: 0.032, slot: stole }] });
      break;
    }
    case 'white-garment': {
      const w = addSlot('#f7f6f1', 0.82);
      top({ mat: { slot: w }, sleeve: 'long', hem: lm.waistY - 0.04, base: 0.009, sleeveFlare: 0.02, frontR: 0.004, frontDip: 0.012 });
      skirt({ topY: lm.waistY - 0.01, hemY: 0.035, flare: 0.07, ease: 0.01, gravity: 0.35, folds: 8, foldAmp: 0.008, slot: w });
      shoeStyle = 'barefoot';
      headMat = { slot: w };
      break;
    }
    case 'security': {
      top({ mat: { slot: addSlot(primary, 0.78) }, sleeve: 'short', collar: true, hem: tuckHem, sleeveFlare: 0.006 });
      trousers({ mat: { slot: addSlot(secondary, 0.75) }, belt: addSlot('#0d0d0d', 0.4) });
      pieces.push({
        id: 'vest', slot: addSlot('#c6f21c', 0.7, 0, 1),
        cuts: [Cut.above(lm.pelvisY + 0.01), Cut.armholes(lm.shoulderX - 0.035, lm.chestY - 0.12), Cut.neckHole({ y: collarY, r0: lm.neckRadius + 0.02, zc }), Cut.vHole({ bottom: lm.chestY - 0.02, slope: 1.2, zc: zc + 0.02 })],
        excl: ['head', 'hand', 'upperarm', 'lowerarm'], rim: true, hide: false, offset: (p) => 0.02 + 0.004 * smooth(lm.waistY + 0.08, lm.pelvisY, p[1]),
      });
      shoeStyle = 'boots';
      headMat = { slot: addSlot(primary === '#111827' ? '#1c1c1c' : '#7f1d1d', 0.9) };
      break;
    }
    case 'usher': {
      const white = addSlot('#f8f8f6', 0.75);
      top({ mat: { slot: white }, sleeve: female ? 'elbow' : 'long', collar: true, hem: tuckHem });
      if (female) skirt({ topY: lm.waistY + 0.01, hemY: lm.kneeY - 0.14, flare: 0.03, ease: 0.006, gravity: 0.15, folds: 5, foldAmp: 0.003, slot: addSlot(secondary, 0.7) });
      else trousers({ mat: { slot: addSlot(secondary, 0.75) }, belt: addSlot('#111111', 0.45) });
      // Sash from the left shoulder to the right hip, front and back.
      const p0 = [lm.shoulderX * 0.55, lm.chestY + 0.12];
      const dir = [-(lm.shoulderX * 1.1), -(lm.chestY + 0.12 - lm.waistY + 0.03)];
      const len = Math.hypot(dir[0], dir[1]);
      pieces.push({
        id: 'sash', slot: addSlot(primary, 0.45, 0.1, 3),
        cuts: [Cut.diagBand({ x0: p0[0], y0: p0[1], nx: -dir[1] / len, ny: dir[0] / len, halfW: 0.04 }), Cut.above(lm.waistY - 0.07), Cut.armMax(lm.shoulderX + 0.03), Cut.neckHole({ y: collarY, r0: lm.neckRadius + 0.02, zc })],
        excl: ['head', 'hand', 'lowerarm'], rim: true, hide: false, offset: () => 0.016,
      });
      shoeStyle = 'shoes';
      break;
    }
    case 'suit': {
      const jacket = addSlot(primary, 0.7);
      top({ id: 'shirt', mat: { slot: addSlot(secondary, 0.7) }, sleeve: 'long', collar: true, hem: tuckHem });
      pieces.push({
        id: 'tie', slot: addSlot(primary === '#1e3a8a' ? '#7f1d1d' : '#8b1e2d', 0.45, 0.1, 3),
        cuts: [Cut.bandX(0, 0.02), Cut.front(zc + 0.03), Cut.below(collarY + 0.008), Cut.above(lm.waistY + 0.04)],
        excl: ['head', 'hand', 'upperarm', 'lowerarm'], rim: true, hide: false,
        offset: (p) => 0.011 + 0.006 * smooth(collarY - 0.03, collarY, p[1]),
      });
      const v = { bottom: lm.chestY - 0.07, slope: 1.6 };
      top({ id: 'jacket', mat: { slot: jacket }, sleeve: 'long', hem: lm.pelvisY - 0.08, base: 0.019, hipFlare: 0.012, sleeveFlare: 0.006, vNeck: v, frontR: 0.01, frontDip: 0.02 });
      pieces.push({
        id: 'lapel', slot: jacket, cuts: [Cut.vHole({ ...v, zc: zc + 0.02 }), Cut.nearV({ ...v, width: 0.05 }), Cut.front(zc + 0.02), Cut.neckHole({ y: collarY, r0: lm.neckRadius + 0.004, frontR: 0.01, frontDip: 0.02, zc })],
        excl: ['head', 'hand', 'upperarm', 'lowerarm'], rim: true, hide: false, offset: () => 0.024,
      });
      trousers({ mat: { slot: addSlot(primary, 0.7) } });
      break;
    }
    case 'tshirt-jeans': {
      top({ mat: cloth(primary, { kind: 'plain' }), sleeve: 'short', hem: hipHem, hipFlare: 0.012, base: 0.007, frontR: 0.004, frontDip: 0.012 });
      trousers({ mat: { slot: addSlot(secondary, 0.9, 0, 4) }, flare: 0.01, base: 0.01, belt: addSlot('#3b2a1e', 0.5) });
      shoeStyle = 'sneakers';
      headMat = { slot: addSlot(primary === '#111827' ? '#1f2937' : '#111827', 0.85) };
      break;
    }
    case 'apron': {
      const ap = addSlot(primary, 0.8);
      top({ mat: { slot: addSlot(secondary, 0.82) }, sleeve: 'short', hem: tuckHem, frontR: 0.004, frontDip: 0.012 });
      if (female) skirt({ topY: lm.waistY + 0.01, hemY: lm.kneeY - 0.16, flare: 0.04, ease: 0.006, gravity: 0.15, folds: 5, foldAmp: 0.003, slot: addSlot('#1f2937', 0.75) });
      else trousers({ mat: { slot: addSlot('#1f2937', 0.8) } });
      pieces.push({
        id: 'bib', slot: ap, cuts: [Cut.bandX(0, 0.12), Cut.front(zc + 0.0), Cut.below(lm.chestY + 0.07), Cut.above(lm.waistY - 0.02)],
        excl: ['head', 'hand', 'upperarm', 'lowerarm'], rim: true, hide: false, offset: () => 0.022,
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
    if (hw === 'gele' && (!mat || mat.fabric !== undefined)) mat = { slot: addSlot(secondary, 0.4, 0.3, 3) };
    if (!mat) mat = patterned && pattern !== 'lace' && pattern !== 'stripes' ? { fabric: addFabric(pattern, primary, secondary, 0.7) } : { slot: addSlot(primary, 0.6, 0.05, hw === 'fila' ? 3 : 0) };
    headwear = { kind: hw, ...mat };
  }

  const key = [
    a.body, a.outfit, hw, hair, a.beard ? 'b' : '',
    pieces.map((p) => `${p.id}:${p.slot ?? ''}:${p.fabric ?? ''}`).join(','),
    skirts.map((s) => `${s.id}:${s.slot ?? ''}:${s.fabric ?? ''}`).join(','),
    headwear ? `${headwear.kind}:${headwear.slot ?? ''}:${headwear.fabric ?? ''}` : '',
  ].join('|');
  return { pieces, skirts, headwear, hair, beard: a.beard, slots, fabrics, fx: fxColor, key };
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
  const d = evalCuts(M, piece.cuts);
  const excl = new Set(piece.excl || []);
  const tris = [];
  const idx = M.index;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], bb = idx[t + 1], c = idx[t + 2];
    if (excl.size && (excl.has(M.group[a]) || excl.has(M.group[bb]) || excl.has(M.group[c]))) continue;
    if (d[a] >= 0 || d[bb] >= 0 || d[c] >= 0) tris.push(a, bb, c);
  }
  if (!tris.length) return;
  const map = new Map();
  const p = [0, 0, 0], g = [0, 0, 0], n = [0, 0, 0], q = [0, 0, 0], uv = [0, 0];
  const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  const finalPos = new Map();
  const vert = (i) => {
    let v = map.get(i);
    if (v !== undefined) return v;
    p[0] = M.position[i * 3]; p[1] = M.position[i * 3 + 1]; p[2] = M.position[i * 3 + 2];
    if (d[i] < 0) {
      for (let it = 0; it < 3; it++) {
        for (const cut of piece.cuts) { const dd = cut(p, g); if (dd < 0) { p[0] -= dd * g[0]; p[1] -= dd * g[1]; p[2] -= dd * g[2]; } }
      }
    }
    n[0] = M.weldNormal[i * 3]; n[1] = M.weldNormal[i * 3 + 1]; n[2] = M.weldNormal[i * 3 + 2];
    const off = piece.offset ? piece.offset(p, n) : 0.006;
    q[0] = p[0] + n[0] * off; q[1] = p[1] + n[1] * off; q[2] = p[2] + n[2] * off;
    uv[0] = M.uv[i * 2] * o.uvScale; uv[1] = M.uv[i * 2 + 1] * o.uvScale;
    for (let k = 0; k < 4; k++) { si[k] = M.skinIndex[i * 4 + k]; sw[k] = M.skinWeight[i * 4 + k]; }
    const slot = piece.slotFn ? piece.slotFn(p) : o.slot;
    v = b.vertex(q, n, uv, si, sw, slot, p);
    map.set(i, v);
    finalPos.set(i, { q: [q[0], q[1], q[2]], p: [p[0], p[1], p[2]], n: [n[0], n[1], n[2]], uv: [uv[0], uv[1]], si: [...si], sw: [...sw], slot });
    return v;
  };
  for (let t = 0; t < tris.length; t += 3) b.idx.push(vert(tris[t]), vert(tris[t + 1]), vert(tris[t + 2]));

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
