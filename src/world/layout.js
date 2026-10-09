// Map layout for the Yaba street: every coordinate the builders, physics, zones and nav share.
// Pure data + functions (no three.js objects) so it can be unit-tested.
//
// Axes: +X = east, +Z = south, +Y = up. Herbert Macaulay Way runs east–west along z = 0.
// North of the road (−Z): shops, the Grace Assembly compound. South (+Z): bus stop, market row, home.

export const MAP = { minX: -70, maxX: 70, minZ: -45, maxZ: 45 };
export const ROAD = { z0: -4, z1: 4 };
/** Open concrete drains between road and walkway: |z| from 4 to 4.84 (0.6 m channel + walls). */
export const GUTTER = { inner: 4, outer: 4.84 };
/** Walkway (laterite shoulder) from the gutter to the plot fronts. */
export const WALK = { outer: 8.5 };

/** Slab crossings over the gutters: [x0, x1]. */
export const CROSS_N = [[-63, -61.4], [-49, -47.4], [-33, -31.4], [-20, -18.4], [5.5, 14.8], [26, 27.6], [44, 45.6], [58, 59.6]];
export const CROSS_S = [[-58, -50], [-42.5, -40.9], [-30, -28.4], [-17, -13], [-8, -4], [12, 16], [36, 37.6], [52, 53.6], [64, 65.6]];

export const CHURCH = { x0: -22, x1: 52, z0: -44, z1: -8.5, gate: [6, 12], wicket: [12.8, 14.2] };
export const HALL = { x0: 4, x1: 34, z0: -42, z1: -20, h: 6.6, ceil: 6.0 };
export const ALTAR = { x0: 8, x1: 30, z0: -41.75, z1: -36.2, h: 0.6 };
export const CHOIR = { x0: 24.5, x1: 30, z0: -41.75, z1: -38.6 };
export const MEDIA = { x0: 27.5, x1: 33.75, z0: -24.6, z1: -20.25, h: 0.25 };
export const PRAYER = { x0: 38, x1: 48, z0: -42, z1: -34, h: 4.2 };
export const CANTEEN = { x0: 38, x1: 50, z0: -30, z1: -21, h: 4.2 };
export const KIDS = { x0: 37, x1: 49, z0: -17.5, z1: -11.5 };
export const CARPARK = { x0: -20, x1: 2, z0: -27, z1: -10 };
export const SECPOST = { x0: 15.2, x1: 17.8, z0: -12.8, z1: -10.2 };

export const HOME = { x0: 6, x1: 32, z0: 8.5, z1: 34, gate: [12, 15.6] };
export const HOUSE = { x0: 11, x1: 25, z0: 18, z1: 27, h: 3.5, floor: 0.3, veranda: 15.4, door: [14, 15.2], living: 19 };
export const MARKET = { x0: -46, x1: 2, z0: 5, z1: 24 };
export const BUSSTOP = { x0: -62, x1: -46, z0: 0, z1: 12, shelter: [-58, -50] };
export const BUKA = { x0: -11, x1: -1, z0: 9.5, z1: 16 };

const Y0 = -2, Y1 = 14;
/** Zone definitions. `extra` zones (compound, children) are additions to the contract list. */
export const ZONE_DEFS = [
  { id: 'street', label: 'Herbert Macaulay Way', ambience: 'street', min: [MAP.minX, Y0, -WALK.outer], max: [MAP.maxX, Y1, WALK.outer] },
  { id: 'busstop', label: 'Yaba Bus Stop', ambience: 'street', min: [BUSSTOP.x0, Y0, BUSSTOP.z0], max: [BUSSTOP.x1, Y1, BUSSTOP.z1] },
  { id: 'market', label: 'Yaba Market Row', ambience: 'market', min: [MARKET.x0, Y0, MARKET.z0], max: [MARKET.x1, Y1, MARKET.z1] },
  { id: 'compound', label: 'Grace Assembly Compound', ambience: 'street', min: [CHURCH.x0, Y0, CHURCH.z0], max: [CHURCH.x1, Y1, CHURCH.z1] },
  { id: 'gate', label: 'Church Gate', ambience: 'street', min: [3, Y0, -15], max: [19, Y1, -6] },
  { id: 'carpark', label: 'Church Car Park', ambience: 'street', min: [CHURCH.x0, Y0, -30], max: [3, Y1, CHURCH.z1] },
  { id: 'church-hall', label: 'Grace Assembly Auditorium', ambience: 'church', min: [HALL.x0, Y0, HALL.z0], max: [HALL.x1, Y1, HALL.z1] },
  { id: 'altar', label: 'Altar', ambience: 'church', min: [HALL.x0, Y0, HALL.z0], max: [CHOIR.x0, Y1, -35.2] },
  { id: 'choir', label: 'Choir Stand', ambience: 'church', min: [CHOIR.x0, Y0, HALL.z0], max: [HALL.x1, Y1, -35.2] },
  { id: 'media', label: 'Media Desk', ambience: 'church', min: [MEDIA.x0, Y0, MEDIA.z0], max: [HALL.x1, Y1, HALL.z1] },
  { id: 'prayer-room', label: 'Prayer Room', ambience: 'prayer', min: [PRAYER.x0, Y0, PRAYER.z0], max: [PRAYER.x1, Y1, PRAYER.z1] },
  { id: 'kitchen', label: 'Canteen & Kitchen', ambience: 'church', min: [CANTEEN.x0, Y0, CANTEEN.z0], max: [CANTEEN.x1, Y1, CANTEEN.z1] },
  { id: 'children', label: "Children's Church", ambience: 'street', min: [KIDS.x0 - 1, Y0, KIDS.z0 - 1], max: [KIDS.x1 + 1, Y1, KIDS.z1 + 1] },
  { id: 'home', label: 'Home, No. 14', ambience: 'home', min: [HOME.x0, Y0, HOME.z0], max: [HOME.x1, Y1, HOME.z1] },
];

/** Raised floors: [x0, z0, x1, z1, y]. Later entries win. */
export const GROUND_RECTS = [
  // altar platform with two steps across its front
  [ALTAR.x0, ALTAR.z1, ALTAR.x1, ALTAR.z1 + 0.4, 0.4],
  [ALTAR.x0, ALTAR.z1 + 0.4, ALTAR.x1, ALTAR.z1 + 0.8, 0.2],
  [ALTAR.x0, ALTAR.z0, ALTAR.x1, ALTAR.z1, ALTAR.h],
  // choir risers
  [CHOIR.x0, -40.2, CHOIR.x1, CHOIR.z1, 0.85],
  [CHOIR.x0, CHOIR.z0, CHOIR.x1, -40.2, 1.1],
  // media desk riser
  [MEDIA.x0, MEDIA.z0, MEDIA.x1, MEDIA.z1, MEDIA.h],
  // home: veranda + house slab + front step
  [HOUSE.door[0] - 1, HOUSE.veranda - 0.45, HOUSE.door[1] + 1.2, HOUSE.veranda, 0.15],
  [HOUSE.x0, HOUSE.veranda, HOUSE.x1, HOUSE.z1, HOUSE.floor],
];

/** Footstep surfaces: [x0, z0, x1, z1, surface]. First match wins; default 'dirt'. */
export const SURFACE_RECTS = [
  [ALTAR.x0, ALTAR.z0, ALTAR.x1, ALTAR.z1 + 0.8, 'carpet'],
  [MEDIA.x0, MEDIA.z0, MEDIA.x1, MEDIA.z1, 'wood'],
  [18, HALL.z0, 20, HALL.z1, 'carpet'],
  [HALL.x0, HALL.z0, HALL.x1, HALL.z1, 'tile'],
  [PRAYER.x0, PRAYER.z0, PRAYER.x1, PRAYER.z1, 'carpet'],
  [CANTEEN.x0, CANTEEN.z0, CANTEEN.x1, CANTEEN.z1, 'tile'],
  [HOUSE.x0, HOUSE.veranda - 0.45, HOUSE.x1, HOUSE.z1, 'tile'],
  [SECPOST.x0, SECPOST.z0, SECPOST.x1, SECPOST.z1, 'concrete'],
  [CARPARK.x0, CARPARK.z0, CARPARK.x1, CARPARK.z1, 'concrete'],
  [KIDS.x0, KIDS.z0, KIDS.x1, KIDS.z1, 'concrete'],
  [CHURCH.x0, CHURCH.z0, CHURCH.x1, CHURCH.z1, 'concrete'],
  [BUKA.x0, BUKA.z0, BUKA.x1, BUKA.z1, 'concrete'],
  [BUSSTOP.shelter[0], GUTTER.outer, BUSSTOP.shelter[1], 7.9, 'concrete'],
  [MAP.minX - 40, ROAD.z0, MAP.maxX + 40, ROAD.z1, 'asphalt'],
  [MAP.minX - 40, -GUTTER.outer, MAP.maxX + 40, GUTTER.outer, 'concrete'],
  [HOME.x0, HOME.z0, HOME.x1, HOME.z1, 'concrete'],
];

const inRect = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

/** Ground height at (x, z) in metres. */
export function groundAt(x, z) {
  let y = 0;
  for (const r of GROUND_RECTS) if (inRect(r, x, z)) y = r[4];
  return y;
}

/** @returns {'asphalt'|'concrete'|'tile'|'dirt'|'wood'|'carpet'} */
export function surfaceAt(x, z) {
  for (const r of SURFACE_RECTS) if (inRect(r, x, z)) return r[4];
  return 'dirt';
}

/**
 * Most specific (smallest) zone containing the position.
 * @param {{box:{min:{x,y,z},max:{x,y,z}}}[]} zones
 * @param {{x:number,y?:number,z:number}} p
 */
export function pickZone(zones, p) {
  let best = null, bestVol = Infinity;
  const y = p.y ?? 0;
  for (const z of zones) {
    const { min, max } = z.box;
    if (p.x < min.x || p.x > max.x || p.z < min.z || p.z > max.z || y < min.y || y > max.y) continue;
    const vol = (max.x - min.x) * (max.z - min.z);
    if (vol < bestVol) { best = z; bestVol = vol; }
  }
  return best;
}

/** Complement of crossing intervals in [a, b]: gutter runs that block walking. */
export function gutterRuns(crossings, a = MAP.minX - 30, b = MAP.maxX + 30) {
  const runs = [];
  let x = a;
  for (const [c0, c1] of [...crossings].sort((p, q) => p[0] - q[0])) {
    if (c0 > x) runs.push([x, c0]);
    x = Math.max(x, c1);
  }
  if (x < b) runs.push([x, b]);
  return runs;
}

/** Hand-placed navigation nodes [x, z, zone]. Edges are built by line of sight at load time. */
export function navNodes() {
  const n = [];
  const add = (x, z, zone) => n.push([x, z, zone]);
  // walkways both sides of the road
  for (let x = -66; x <= 66; x += 5.5) { add(x, -6.4, 'street'); add(x, 6.5, x < -46 && x > -62 ? 'busstop' : x > -46 && x < 2 ? 'market' : 'street'); }
  // slab crossings and the road between them
  for (const [a, b] of CROSS_N) { const x = (a + b) / 2; add(x, -4.42, 'street'); }
  for (const [a, b] of CROSS_S) { const x = (a + b) / 2; add(x, 4.42, x < -46 && x > -62 ? 'busstop' : 'street'); }
  for (const [a, b] of CROSS_N) {
    const x = (a + b) / 2;
    if (CROSS_S.some(([c, d]) => x >= c - 2 && x <= d + 2)) add(x, 0, 'street');
  }
  // church gate, forecourt, car park, east yard, back yard
  add(9, -8.5, 'gate'); add(13.5, -8.6, 'gate'); add(9, -12, 'gate'); add(14, -13.2, 'gate');
  for (let x = 4; x <= 34; x += 5) for (const z of [-17.5, -13.5]) add(x, z, x > 3 && x < 19 && z > -15 ? 'gate' : 'compound');
  for (let x = -18; x <= 0; x += 4.5) for (const z of [-11.5, -16.5, -21.5, -26]) add(x, z, 'carpark');
  for (const z of [-19, -24, -28.5, -32.5, -37, -41]) { add(36, z, 'compound'); add(-1.5, z, z < -28 ? 'compound' : 'carpark'); }
  for (const x of [40, 45, 50]) add(x, -19, 'compound');
  add(51, -24, 'compound'); add(51, -31, 'compound'); add(51, -38, 'compound');
  for (let x = 3; x <= 35; x += 6) add(x, -43, 'compound');
  // auditorium: doors, aisles, cross aisle, altar, choir, media
  add(19, -19, 'compound'); add(8, -19, 'compound');
  add(3, -27, 'carpark'); add(35, -27, 'compound');
  for (const z of [-21.3, -24.6, -27.9, -31.2, -34.6]) { add(19, z, 'church-hall'); add(5.1, z, 'church-hall'); add(32.9, z, 'church-hall'); add(12, z, 'church-hall'); add(26, z, 'church-hall'); }
  add(8, -21.3, 'church-hall'); add(16, -21.3, 'church-hall'); add(23, -21.3, 'church-hall');
  add(9, -34.6, 'church-hall'); add(15.5, -34.6, 'church-hall'); add(22.5, -34.6, 'church-hall'); add(29, -34.6, 'church-hall');
  add(11, -37.3, 'altar'); add(15, -37.3, 'altar'); add(19, -36.9, 'altar'); add(22.5, -37.3, 'altar'); add(16, -40.5, 'altar'); add(21.5, -40.5, 'altar');
  add(27, -37.6, 'choir'); add(25.5, -39.4, 'choir'); add(28.5, -41, 'choir');
  add(30.5, -23.5, 'media'); add(29, -21.2, 'media');
  // prayer room, canteen, children's church
  add(42.7, -32.8, 'compound'); add(42.7, -35.5, 'prayer-room'); add(40, -38, 'prayer-room'); add(45.5, -38, 'prayer-room'); add(42.7, -40.5, 'prayer-room');
  add(41, -19.8, 'compound'); add(41, -22.5, 'kitchen'); add(44.5, -23, 'kitchen'); add(48, -23.5, 'kitchen'); add(44, -26.5, 'kitchen'); add(39.5, -26.5, 'kitchen');
  add(39, -13, 'children'); add(43, -15.8, 'children'); add(47, -13, 'children');
  // home compound and house
  add(13.8, 9.7, 'home'); add(13.8, 12.6, 'home'); add(9, 15, 'home'); add(19, 12.5, 'home'); add(27, 12.5, 'home'); add(28.5, 18, 'home');
  add(28.5, 30, 'home'); add(18, 30.5, 'home'); add(8.5, 30, 'home'); add(8.5, 21, 'home');
  add(14.6, 14.6, 'home'); add(14.6, 16.6, 'home'); add(21, 16.6, 'home');
  add(14.6, 19.3, 'home'); add(16.8, 22.5, 'home'); add(13, 25.2, 'home');
  // market and bus stop
  for (let x = -44; x <= -18; x += 5.2) { add(x, 13.6, 'market'); add(x, 19.5, 'market'); }
  add(-15, 13.5, 'market'); add(-13, 19.5, 'market'); add(-6, 12.6, 'market'); add(-6, 18.3, 'market'); add(0.5, 12.5, 'market'); add(1, 19.5, 'market');
  add(-54, 6.6, 'busstop'); add(-59.5, 10.5, 'busstop'); add(-49, 10.5, 'busstop'); add(-54, 2.4, 'busstop');
  return n;
}
