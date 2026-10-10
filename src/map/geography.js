// A simplified Lagos for the map view: coastlines, the lagoon, bridges, main roads, landmarks
// and billboards. Pure data and helpers (no three.js) so it can be unit-tested.
//
// Units: 1 map unit ≈ 150 m. Axes: +X = east, +Z = south. The Atlantic is to the south, the
// Lagos Lagoon in the middle, the mainland (Yaba, Surulere, Ikeja) to the west and north, and
// the islands (Lagos Island, Ikoyi, Victoria Island) with the Lekki peninsula to the south-east.

/** Visible map area. */
export const BOUNDS = { minX: -140, maxX: 160, minZ: -110, maxZ: 85 };

/** Land masses as [x, z] polygons. Everything else is water (lagoon, harbour, ocean). */
export const LAND = [
  {
    id: 'mainland', name: 'Mainland', color: '#b9b184',
    pts: [[-260, -260], [260, -260], [260, -64], [190, -66], [150, -58], [110, -72], [60, -80], [20, -74], [-8, -66], [-19, -58],
      [-23, -44], [-22.5, -30], [-21.5, -20], [-20.5, -8], [-21.5, 4], [-23, 13], [-23.5, 21], [-29, 25.5], [-38, 27], [-45, 32],
      [-44, 42], [-37, 49], [-60, 53], [-260, 53]],
  },
  { id: 'lagos-island', name: 'Lagos Island', color: '#c9c09a', pts: [[-16.5, 22], [-6, 18.5], [6, 19.5], [13.5, 23.5], [13, 31], [3, 35], [-9, 35], [-16.5, 30]] },
  { id: 'ikoyi', name: 'Ikoyi', color: '#b7b789', pts: [[15.5, 18.5], [27, 14.5], [37, 13.5], [46, 17], [45, 25.5], [31, 30], [16, 29.5]] },
  {
    id: 'vi-lekki', name: 'Victoria Island & Lekki', color: '#c3bb90',
    pts: [[4, 38.5], [16, 34.5], [32, 33], [46, 31.5], [62, 30], [90, 29], [125, 27], [160, 25], [260, 23], [260, 57], [160, 57.5],
      [100, 56.5], [60, 54], [36, 51.5], [20, 51.5], [6, 48.5]],
  },
  { id: 'eko-atlantic', name: 'Eko Atlantic', color: '#d4cbb0', pts: [[7, 48.5], [30, 51.5], [32, 61], [9, 61]] },
];

/** Sandy beaches along the ocean (thin strips drawn over the land). */
export const BEACHES = [
  { pts: [[60, 53.6], [100, 56.1], [160, 57.1], [260, 56.6], [260, 59.5], [160, 60], [100, 59], [60, 56.5]] },
  { pts: [[-260, 52.6], [-60, 52.6], [-60, 55.4], [-260, 55.4]] },
];

/** Bridges: centre lines at deck height `y`, `w` = deck width. */
export const BRIDGES = [
  { id: 'third-mainland', name: 'Third Mainland Bridge', y: 1.3, w: 1.5, pillar: 2.6,
    pts: [[-22, -60], [-17, -48], [-14.5, -34], [-13, -20], [-12.8, -6], [-13.5, 6], [-13, 14], [-9.5, 20]] },
  { id: 'carter', name: 'Carter Bridge', y: 1.0, w: 1.2, pillar: 2.2, pts: [[-24, 23.6], [-20, 23.8], [-15.6, 24.3]] },
  { id: 'eko', name: 'Eko Bridge', y: 1.1, w: 1.3, pillar: 2.2, pts: [[-30, 27.5], [-24, 29], [-16, 29.5]] },
  { id: 'lekki-ikoyi', name: 'Lekki–Ikoyi Link Bridge', y: 1.1, w: 1.1, pillar: 3.4, pylon: true, pts: [[45.5, 22], [50, 24.5], [55, 27.5], [58, 29.8]] },
];

/** Main roads on land (centre lines). `bridge` links the traffic to a bridge. */
export const ROADS = [
  { id: 'ikorodu', name: 'Ikorodu Road', w: 1.1, pts: [[-33, -12], [-44, -26], [-58, -40], [-72, -60], [-88, -84], [-100, -110]] },
  { id: 'herbert', name: 'Herbert Macaulay Way', w: 0.9, pts: [[-31, -16], [-32.5, -4], [-33.5, 6], [-31.5, 16], [-27, 24]] },
  { id: 'tm-north', name: 'Third Mainland approach', w: 1.2, pts: [[-22, -60], [-28, -72], [-36, -86], [-44, -110]] },
  { id: 'agege', name: 'Agege Motor Road', w: 0.9, pts: [[-33.5, 6], [-48, -6], [-62, -18], [-72, -30], [-74, -50], [-70, -70], [-66, -100]] },
  { id: 'surulere', name: 'Western Avenue', w: 1.0, pts: [[-27, 24], [-40, 15], [-52, 8], [-70, 2], [-100, -4], [-140, -8]] },
  { id: 'apapa', name: 'Apapa Road', w: 1.0, pts: [[-27, 24], [-34, 30], [-41, 38], [-40, 47]] },
  { id: 'marina', name: 'Marina', w: 0.8, pts: [[-15.6, 31.5], [-6, 33.5], [4, 33], [12, 28.5]] },
  { id: 'island', name: 'Broad Street', w: 0.7, pts: [[-9.5, 20], [-4, 26], [4, 27], [13, 25]] },
  { id: 'ikoyi', name: 'Awolowo Road', w: 0.8, pts: [[13, 25], [24, 22.5], [36, 19.5], [45.5, 22]] },
  { id: 'falomo', name: 'Falomo', w: 0.8, pts: [[24, 22.5], [22, 30], [18, 36]] },
  { id: 'vi', name: 'Ozumba Mbadiwe', w: 1.0, pts: [[8, 40], [18, 36], [32, 35.5], [46, 35], [58, 33.5]] },
  { id: 'lekki', name: 'Lekki–Epe Expressway', w: 1.2, pts: [[58, 33.5], [58, 29.8], [70, 34], [90, 36], [120, 35], [160, 33], [260, 31]] },
  { id: 'coastal', name: 'Ahmadu Bello Way', w: 0.8, pts: [[6, 46], [20, 48.5], [36, 48.5], [60, 51]] },
  { id: 'ikeja', name: 'Obafemi Awolowo Way', w: 0.8, pts: [[-74, -50], [-66, -64], [-58, -76]] },
];

/** Areas with their own label on the map. */
export const AREAS = [
  ['Yaba', -36, 0], ['Surulere', -56, 14], ['Ikeja', -70, -66], ['Oshodi', -76, -36], ['Ebute Metta', -31, 21], ['Apapa', -48, 42],
  ['Lagos Island', -2, 23], ['Ikoyi', 32, 20], ['Victoria Island', 26, 41], ['Lekki', 88, 44], ['Akoka', -32, -22], ['Lagos Lagoon', 40, -30],
  ['Atlantic Ocean', 40, 74], ['Ikorodu', 110, -92],
];

/** Dense neighbourhoods (more houses closer to these). [x, z, radius] */
export const DENSE = [[-36, 2, 22], [-56, 12, 22], [-70, -60, 24], [-74, -32, 18], [-2, 27, 12], [-48, 36, 14], [-30, -36, 18], [90, 44, 30], [-100, -20, 30]];

/** Clusters of towers: [x, z, radius, count, minH, maxH]. */
export const TOWERS = [
  [-3, 30, 7, 26, 4, 15],   // Marina / Lagos Island
  [24, 41, 9, 30, 3, 12],   // Victoria Island
  [20, 56, 7, 16, 6, 18],   // Eko Atlantic
  [30, 22, 8, 12, 3, 8],    // Ikoyi
  [-66, -62, 6, 10, 2.5, 6], // Ikeja / Alausa
];

/** Billboards beside busy roads: [x, z, facing (radians), text, colours]. */
export const BILLBOARDS = [
  { at: [-25, -50], rot: 0.9, title: 'HOLY GHOST NIGHT', sub: 'This Friday · Grace Assembly, Yaba', bg: '#1e3a8a', fg: '#facc15' },
  { at: [-36, 12], rot: -1.6, title: 'AMEN CITY', sub: 'Pray. Serve. Live. · Join free', bg: '#facc15', fg: '#18181b' },
  { at: [-60, -36], rot: 2.2, title: 'JOLLOF FEST', sub: 'Saturday · Surulere', bg: '#c2410c', fg: '#fff7ed' },
  { at: [-7, 21.5], rot: 0.3, title: 'DRIVE SAFE', sub: 'Third Mainland Bridge · No phone', bg: '#15803d', fg: '#ffffff' },
  { at: [62, 37], rot: 3.0, title: 'LEKKI HOMES', sub: '2-bed flats from ₦45M', bg: '#0f766e', fg: '#ffffff' },
  { at: [12, 43], rot: -0.5, title: 'CRUSADE @ TBS', sub: 'Come as you are', bg: '#7e22ce', fg: '#fde68a' },
  { at: [-70, -20], rot: 1.4, title: 'FRESH BREAD', sub: 'Agege · Hot from the oven', bg: '#f8fafc', fg: '#b91c1c' },
  { at: [-47, 20], rot: -0.6, title: 'NOLLYWOOD NIGHTS', sub: 'National Theatre · Iganmu', bg: '#111827', fg: '#f97316' },
];

/** Is [x, z] inside the polygon? (ray casting) */
export function inPolygon(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The land mass at [x, z], or null for water. */
export function landAt(x, z) {
  for (let i = LAND.length - 1; i >= 0; i--) if (inPolygon(LAND[i].pts, x, z)) return LAND[i];
  return null;
}

/** Distance from [x, z] to a polyline. */
export function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

/** Small deterministic RNG (mulberry32). */
export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scatter house plots on land, denser in the busy neighbourhoods, never on roads or bridges.
 * @returns {{x: number, z: number, s: number, r: number, land: string}[]}
 */
export function housePlots(count, seed = 7, avoid = []) {
  const rand = rng32(seed);
  const out = [];
  const lines = [...ROADS, ...BRIDGES].map((r) => ({ pts: r.pts, w: r.w * 0.5 + 0.9 }));
  let tries = 0;
  while (out.length < count && tries < count * 30) {
    tries++;
    const x = BOUNDS.minX + rand() * (BOUNDS.maxX - BOUNDS.minX);
    const z = BOUNDS.minZ + rand() * (BOUNDS.maxZ - BOUNDS.minZ);
    const land = landAt(x, z);
    if (!land) continue;
    let p = 0.12;
    for (const [cx, cz, r] of DENSE) p = Math.max(p, Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)));
    if (rand() > p) continue;
    if (lines.some((l) => distToPolyline(l.pts, x, z) < l.w)) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    if (BEACHES.some((b) => inPolygon(b.pts, x, z))) continue;
    out.push({ x, z, s: 0.7 + rand() * 0.9, r: (rand() - 0.5) * 0.5 + (rand() < 0.5 ? 0 : Math.PI / 2), land: land.id });
  }
  return out;
}

/** What you see when you tap a neighbourhood, the water or a bridge on the map. */
export const AREA_INFO = {
  Yaba: 'Home of Grace Assembly, UNILAG and the tech hubs of "Yabacon Valley". Busy markets, buses and students everywhere.',
  Surulere: 'The National Stadium, Bode Thomas amala joints and owambe parties every Saturday.',
  Ikeja: 'The state capital: the Secretariat in Alausa, Computer Village, the airport and the gospel radio.',
  Oshodi: 'The busiest bus interchange in Lagos. Evangelism here means shouting over the danfo conductors.',
  'Ebute Metta': 'Old Lagos: railway quarters, Otto and the approach to Carter and Eko bridges.',
  Apapa: 'The ports and the trucks. The go-slow to Apapa is legendary.',
  'Lagos Island': 'Marina, Broad Street, Balogun Market and Tafawa Balewa Square, where the big crusades happen.',
  Ikoyi: 'Quiet streets, old money and big churches. The Lekki–Ikoyi Link Bridge starts here.',
  'Victoria Island': 'Banks, towers, lounges and the sea breeze. Eko Atlantic is being built on the ocean.',
  Lekki: 'New estates, the toll gate, Elegushi Beach and the Conservation Centre. Mega churches on every road.',
  Akoka: 'UNILAG by the lagoon. Campus fellowships fill the halls on Thursday nights.',
  'Lagos Lagoon': 'The lagoon joins the mainland and the islands. Ferries cross it, and Makoko\'s canoes fish in it.',
  'Atlantic Ocean': 'The ocean along Lagos\'s coast: Elegushi, Eko Atlantic and the beaches. Pray by the sea.',
  Ikorodu: 'Across the lagoon. Quiet prayer grounds on the hills, and the road to the prayer mountain.',
};

/** Bridges and main roads, for their cards on the map. */
export const ROUTE_INFO = {
  'third-mainland': 'Third Mainland Bridge, 11.8 km over the lagoon. It joins the mainland to Lagos Island, and the go-slow is legendary. Pray before you enter a danfo here.',
  carter: 'Carter Bridge, the old gateway from Ebute Metta to Lagos Island and Idumota.',
  eko: 'Eko Bridge, from Ebute Metta and Apapa Road to Lagos Island.',
  'lekki-ikoyi': 'Lekki–Ikoyi Link Bridge: a cable bridge with a tall pylon. Joggers go up and down it in the evening.',
};
