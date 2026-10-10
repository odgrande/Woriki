// Normal life in Lagos, around the church: places on the map, how you get there (trek, bike,
// danfo, taxi or a free ride), things to do and pay for at each place, and the furniture
// catalog for your home. Pure data and pure functions over the game state, like systems.js.
// Real Lagos places; every person and business in the game is fictional.
import { naira } from './content.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================ places */

/**
 * Places on the Lagos map. `at` = map position [x, z] (1 unit ≈ 150 m, north = −z).
 * `walk` = a walkable 3D place (key of world.spawns.places), otherwise a trip: you go, do
 * one thing and come back. `zones` = world zones that count as being there.
 */
export const PLACES = [
  { id: 'home', emoji: '🏠', name: 'Home, No. 14', area: 'Yaba', at: [-37, 9], walk: 'home', zones: ['home'],
    desc: 'Your bungalow behind the church. Furnish it from the catalog.' },
  { id: 'grace', emoji: '⛪', name: 'Grace Assembly', area: 'Yaba', at: [-33.5, 4.5], walk: 'church', zones: ['compound', 'gate', 'carpark', 'church-hall', 'altar', 'choir', 'media', 'prayer-room', 'kitchen', 'children'],
    desc: 'Your church on Herbert Macaulay Way. Services, prayer room, canteen.' },
  { id: 'market', emoji: '🛒', name: 'Yaba Market Row', area: 'Yaba', at: [-30.5, 8.5], walk: 'market', zones: ['market', 'busstop', 'street'],
    desc: 'Mama Nkechi\'s buka, pure water, the POS kiosk and the danfo park.' },
  { id: 'beach', emoji: '🏖️', name: 'Elegushi Beach', area: 'Lekki', at: [98, 55], walk: 'beach', zones: ['beach'], fee: 2000,
    desc: 'Sand, waves, suya and coconut. Gate fee ₦2,000. The beach party at night is not for everybody.' },
  { id: 'theatre', emoji: '🎬', name: 'National Theatre', area: 'Iganmu', at: [-41, 21], walk: 'theatre', zones: ['theatre', 'cinema'],
    desc: 'The famous "military cap" building. Its cinema shows Nollywood and gospel films.' },
  { id: 'govhouse', emoji: '🏛️', name: 'Lagos House (Government House)', area: 'Marina, Lagos Island', at: [-7, 32], gov: true,
    desc: 'Where the Governor lives. On Saturdays the public tour shows the gardens and the history of Lagos.' },
  { id: 'secretariat', emoji: '🏢', name: 'Lagos State Secretariat', area: 'Alausa, Ikeja', at: [-66, -64], gov: true,
    desc: 'The seat of the Lagos State Government. Bring your documents and your patience.' },
  { id: 'balogun', emoji: '🧵', name: 'Balogun Market', area: 'Lagos Island', at: [1, 25],
    desc: 'The biggest market in Lagos. Fabric, shoes, everything. Hold your phone well.' },
  { id: 'tbs', emoji: '🏟️', name: 'Tafawa Balewa Square', area: 'Lagos Island', at: [8, 30],
    desc: 'Big crusades and national events happen here.' },
  { id: 'computer', emoji: '📱', name: 'Computer Village', area: 'Ikeja', at: [-62, -52],
    desc: 'Phones, laptops and repairs. Check what you are buying.' },
  { id: 'unilag', emoji: '🎓', name: 'University of Lagos', area: 'Akoka', at: [-27, -16],
    desc: 'UNILAG by the lagoon. The campus fellowship meets on Thursdays.' },
  { id: 'makoko', emoji: '🛶', name: 'Makoko Waterfront', area: 'Makoko', at: [-18.5, 2], mission: 'm_slum',
    desc: 'A community on stilts over the lagoon. Outreach here is hard and needs a canoe.' },
  { id: 'oshodi', emoji: '🚌', name: 'Oshodi', area: 'Oshodi', at: [-72, -30], mission: 'm_tracts',
    desc: 'The busiest bus interchange in Lagos. Share tracts under the bridge.' },
  { id: 'ekoatlantic', emoji: '🌆', name: 'Eko Atlantic', area: 'Victoria Island', at: [18, 57],
    desc: 'The new city built on the sea. Big towers, sea breeze.' },
  { id: 'lekkibridge', emoji: '🌉', name: 'Lekki–Ikoyi Link Bridge', area: 'Ikoyi', at: [44, 21],
    desc: 'The cable bridge. Evening joggers and fine views of the lagoon.' },
  { id: 'police', emoji: '🚓', name: 'Police Station, Sabo', area: 'Yaba', at: [-38, -9],
    desc: 'Where you report a crime, bail a friend or get a police report. Some officers expect "something".' },
  { id: 'luth', emoji: '🏥', name: 'LUTH (Teaching Hospital)', area: 'Idi-Araba', at: [-50, -4],
    desc: 'Lagos University Teaching Hospital. Visit the sick, pray with them, donate blood.' },
  { id: 'orphanage', emoji: '🧸', name: 'Hope Children\'s Home', area: 'Ikeja', at: [-80, -46],
    desc: 'A home for children without parents. "Pure religion… is this, To visit the fatherless" (James 1:27).' },
  { id: 'radio', emoji: '📻', name: 'Gospel radio station', area: 'Ikeja', at: [-76, -58],
    desc: 'Share your testimony live on air on Sunday Praise Hour.' },
  { id: 'betting', emoji: '🎰', name: 'Betting shop', area: 'Ojuelegba', at: [-45, 9],
    desc: 'Everybody is "one game away" from a jackpot. The devil is very busy here.' },
  { id: 'lounge', emoji: '🍸', name: 'Lounge on the Island', area: 'Victoria Island', at: [30, 44],
    desc: 'Loud music, expensive drinks and "big boys". A place many Christians avoid.' },
  { id: 'owambe', emoji: '💃', name: 'Event centre (owambe)', area: 'Surulere', at: [-64, 22],
    desc: 'Weddings and parties every Saturday. A church member is getting married today!' },
  // Coming soon: on the map already, opening in later updates.
  { id: 'camp', emoji: '⛺', name: 'Prayer City camp', area: 'Lagos–Ibadan Expressway', at: [-110, -100], soon: true,
    desc: 'Coming soon: the monthly all-night Holy Ghost service with millions of worshippers, camp meetings and conventions.' },
  { id: 'airport', emoji: '✈️', name: 'Murtala Muhammed Airport', area: 'Ikeja', at: [-92, -78], soon: true,
    desc: 'Coming soon: mission trips abroad and welcoming visiting ministers.' },
  { id: 'bibleschool', emoji: '🎓', name: 'Bible school campus', area: 'Ojota', at: [-100, -38], soon: true,
    desc: 'Coming soon: walk to your lectures, write exams in the hall, graduate in a gown.' },
  { id: 'stadium', emoji: '🏟️', name: 'National Stadium', area: 'Surulere', at: [-55, 12], soon: true,
    desc: 'Coming soon: the big gospel concert and the city-wide crusade.' },
  { id: 'mile12', emoji: '🥬', name: 'Mile 12 Market', area: 'Ketu', at: [-58, -84], soon: true,
    desc: 'Coming soon: buy food in bulk for the church harvest and the hospitality unit.' },
  { id: 'lcc', emoji: '🐒', name: 'Lekki Conservation Centre', area: 'Lekki', at: [112, 38], soon: true,
    desc: 'Coming soon: the canopy walk for church youth outings and couples\' retreats.' },
  { id: 'churchland', emoji: '🏗️', name: 'Land for your church', area: 'Ajah', at: [140, 36], soon: true,
    desc: 'Coming soon: pastors buy land and build their own church building, block by block.' },
  { id: 'bodethomas', emoji: '🍲', name: 'Bode Thomas amala joints', area: 'Surulere', at: [-58, 18],
    desc: 'Famous amala, gbegiri and ewedu spots. Long queues on Saturday afternoon, and agberos at the junction.' },
  { id: 'ojuelegba', emoji: '🍛', name: 'Ojuelegba mama put', area: 'Ojuelegba', at: [-47, 4],
    desc: 'Rice and stew, plantain and assorted meat by the roadside. Cheap and sweet.' },
  { id: 'mountain', emoji: '⛰️', name: 'Prayer Mountain', area: 'Ikorodu', at: [96, -84],
    desc: 'A quiet prayer ground across the lagoon. People go up to seek God.' },
];
export const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/** Map units to kilometres. */
export const KM_PER_UNIT = 0.15;

/** Road distance in km between two places (straight line × Lagos detour factor). */
export function distanceKm(a, b) {
  const pa = PLACE_BY_ID[a]?.at, pb = PLACE_BY_ID[b]?.at;
  if (!pa || !pb) return 0;
  const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * KM_PER_UNIT * 1.35;
  return Math.max(0.3, Math.round(d * 10) / 10);
}

/** Which place a world zone belongs to (the first place listing it). */
export function placeOfZone(zone) {
  if (!zone) return null;
  return PLACES.find((p) => p.zones?.includes(zone))?.id || null;
}

/* ================================================================ getting around */

/**
 * Ways to travel. Prices are Lagos 2026 street prices, roughly. `kmh` = average speed
 * including go-slow. `maxKm` = too far for this mode.
 */
export const TRAVEL_MODES = [
  { id: 'trek', emoji: '🚶', name: 'Trek', blurb: 'Free, slow, tiring.', kmh: 5, energyPerKm: 4, maxKm: 6 },
  { id: 'bike', emoji: '🏍️', name: 'Bike', blurb: 'Okada, or your own bicycle. Quick through traffic.', kmh: 18, energyPerKm: 0.6, base: 300, perKm: 180, maxKm: 15 },
  { id: 'danfo', emoji: '🚐', name: 'Danfo', blurb: 'Cheap. Hold your change and your phone.', kmh: 16, energyPerKm: 0.8, base: 300, perKm: 45 },
  { id: 'taxi', emoji: '🚕', name: 'Taxi', blurb: 'Air-conditioned and straight there.', kmh: 26, energyPerKm: 0, base: 1500, perKm: 380 },
  { id: 'free', emoji: '🙏', name: 'Free ride', blurb: 'Ask a church member who is driving that way.', kmh: 24, energyPerKm: 0, base: 0, perKm: 0 },
];
export const MODE_BY_ID = Object.fromEntries(TRAVEL_MODES.map((m) => [m.id, m]));

/**
 * What a trip costs with each mode: `{mode, ok, reason, naira, energy, minutes}`.
 * @param {object} s game state
 * @param {number} km
 */
export function travelQuote(s, km, modeId) {
  const m = MODE_BY_ID[modeId];
  const ownBike = modeId === 'bike' && !!s.items?.bike;
  const cost = ownBike ? 0 : Math.round(((m.base || 0) + (m.perKm || 0) * km) / 50) * 50;
  const kmh = ownBike ? 14 : m.kmh;
  const energy = Math.round((ownBike ? 2 : m.energyPerKm) * km);
  const minutes = Math.max(3, Math.round((km / kmh) * 60));
  let reason = null;
  if (m.maxKm && km > m.maxKm) reason = `Too far to ${modeId === 'trek' ? 'trek' : 'go by bike'}`;
  else if (cost > s.naira) reason = `You need ${naira(cost)}`;
  else if (energy > s.energy) reason = 'You are too tired';
  else if (modeId === 'free' && s.doneToday?.freeRide >= 2) reason = 'Nobody else is going your way today';
  return { mode: m, ok: !reason, reason, naira: cost, energy, minutes, ownBike };
}

/**
 * Pay for a trip and roll what happened on the way. Mutates `s`.
 * @returns {{ok: boolean, reason?: string, text: string, minutes: number, mode: object, lost?: number, stuck?: boolean}}
 */
export function travel(s, from, to, modeId, rng = Math.random) {
  const km = distanceKm(from, to);
  const q = travelQuote(s, km, modeId);
  if (!q.ok) return { ok: false, reason: q.reason, text: q.reason, minutes: 0, mode: q.mode };
  s.naira -= q.naira;
  s.energy = clamp(s.energy - q.energy, 0, 100);
  const dest = PLACE_BY_ID[to];
  let minutes = q.minutes;
  let text;
  let lost = 0;
  const bridge = crossesLagoon(from, to);
  switch (modeId) {
    case 'trek':
      text = rng() < 0.3 ? 'You trekked under the sun. A mallam sold you cold zobo on the way.' : 'You trekked. Your legs have testimony today.';
      break;
    case 'bike':
      text = q.ownBike ? 'You rode your bicycle and weaved through the traffic.' : rng() < 0.25 ? 'The okada man drove like Formula One. You held on and prayed.' : 'The okada dropped you right at the gate.';
      break;
    case 'danfo': {
      if (bridge && rng() < 0.45) { minutes += 35; text = 'Go-slow on Third Mainland Bridge! The conductor and a passenger argued about ₦50 change the whole way.'; }
      else text = rng() < 0.3 ? 'The danfo was full, so you sat on the "attachment" seat. You arrived.' : '"Oshodi! Obalende! Enter with your change!" You made it.';
      if (rng() < 0.4) {
        // Agberos at the park collect their "owo ero" from everybody.
        const fee = Math.min(s.naira, 100 + Math.floor(rng() * 3) * 100);
        s.naira -= fee;
        text += ` At the park an agbero shouted "Owo da?!" and collected ${naira(fee)}. You said "God bless you" anyway.`;
      }
      if (rng() < 0.05) { lost = Math.min(s.naira, 1500); s.naira -= lost; text += ` Somebody "picked" ${naira(lost)} from your pocket.`; }
      break;
    }
    case 'taxi':
      if (rng() < 0.12) { const fee = Math.min(s.naira, 500); s.naira -= fee; text = `Police checkpoint at the junction: the officer asked the driver for "something for the boys" and the driver added ${naira(fee)} to your fare.`; break; }
      text = bridge && rng() < 0.3 ? 'Small go-slow on the bridge, but the AC was cold and the driver played worship songs.' : 'Smooth ride. The driver asked you to pray for his family.';
      break;
    case 'free': {
      s.doneToday.freeRide = (s.doneToday.freeRide || 0) + 1;
      const yes = rng() < clamp(0.35 + s.character / 160, 0.35, 0.9);
      if (!yes) return { ok: false, stuck: true, reason: 'Nobody was going that way. Pick another way to go.', text: 'You waited, but nobody was going that way. Pick another way to go.', minutes: 0, mode: q.mode };
      text = `Brother ${['Emeka', 'Segun', 'Ifeanyi', 'Tobi'][Math.floor(rng() * 4)]} from church gave you a free ride. God bless him!`;
      break;
    }
    default:
      text = 'You arrived.';
  }
  s.naira = Math.round(s.naira);
  return { ok: true, text: `${text} You are at ${dest?.name || 'your destination'}.`, minutes, mode: q.mode, lost, cost: q.naira, energy: q.energy, km };
}

/** Does the trip go between the mainland and the islands (over a lagoon bridge)? */
export function crossesLagoon(a, b) {
  const island = (id) => { const p = PLACE_BY_ID[id]?.at; return !!p && p[0] > -20 && p[1] > 15; };
  return island(a) !== island(b);
}

/* ================================================================ home catalog */

/**
 * Furniture slots in No. 14. Each slot has variants (models) you can buy, replace or upgrade;
 * `free` variants are what you start with. src/world/decor.js builds each variant in 3D.
 * `perk` describes the small boost the slot gives (see restBonus, actions.js).
 */
export const FURNITURE = [
  { id: 'sofa', emoji: '🛋️', name: 'Sofa set', room: 'Living room', perk: 'Seats for visitors from church.', variants: [
    { id: 'maroon', name: 'Old maroon sofa set', naira: 0, free: true },
    { id: 'lshape', name: 'Grey fabric L-shape', naira: 250000 },
    { id: 'leather', name: 'Brown leather sofa set', naira: 380000 },
  ] },
  { id: 'tv', emoji: '📺', name: 'Television', room: 'Living room', perk: 'Gospel channels, news, and the occasional football match.', variants: [
    { id: 'old', name: 'Old box TV', naira: 0, free: true },
    { id: 'flat55', name: '55-inch flat screen', naira: 320000 },
    { id: 'flat75', name: '75-inch flat screen', naira: 650000 },
  ] },
  { id: 'bed', emoji: '🛏️', name: 'Bed', room: 'Bedroom', perk: '+20 energy when you rest (better beds rest you more).', variants: [
    { id: 'foam', name: 'Foam mattress on the floor', naira: 0, free: true },
    { id: 'spring', name: 'Spring bed and frame', naira: 95000 },
    { id: 'king', name: 'King-size bed with headboard', naira: 280000 },
  ] },
  { id: 'chairs', emoji: '🪑', name: 'Plastic chairs and table', room: 'Living room', perk: 'Seats for visitors from church.', variants: [{ id: 'plastic', name: 'Plastic chairs and table', naira: 15000 }, { id: 'cane', name: 'Cane chairs and table', naira: 60000 }] },
  { id: 'plants', emoji: '🪴', name: 'Potted plants', room: 'Living room', perk: 'Fresh and green.', variants: [{ id: 'small', name: 'Potted plants', naira: 9000 }, { id: 'big', name: 'Big indoor palms', naira: 25000 }] },
  { id: 'altar', emoji: '🕯️', name: 'Family prayer corner', room: 'Living room', perk: '+2 faith when you pray at home.', variants: [{ id: 'corner', name: 'Prayer corner with candle', naira: 18000 }, { id: 'altar', name: 'Family altar with banner', naira: 45000 }] },
  { id: 'picture', emoji: '🖼️', name: 'Framed scripture', room: 'Living room', perk: 'The Word on your wall.', variants: [{ id: 'psalm23', name: '"The LORD is my shepherd"', naira: 12000 }, { id: 'house', name: '"As for me and my house" (Joshua 24:15)', naira: 15000 }] },
  { id: 'bookshelf', emoji: '📚', name: 'Bookshelf', room: 'Living room', perk: '+1 word every time you read.', variants: [{ id: 'small', name: 'Bookshelf with Christian books', naira: 45000 }, { id: 'library', name: 'Wall library', naira: 120000 }] },
  { id: 'fridge', emoji: '🧊', name: 'Fridge', room: 'Living room', perk: 'Cooking at home fills you more.', variants: [{ id: 'small', name: 'Fridge', naira: 240000 }, { id: 'double', name: 'Double-door fridge', naira: 520000 }] },
  { id: 'dining', emoji: '🍽️', name: 'Dining set', room: 'Living room', perk: 'Family meals.', variants: [{ id: 'wood4', name: 'Wooden dining set (4 chairs)', naira: 130000 }, { id: 'glass6', name: 'Glass dining set (6 chairs)', naira: 310000 }] },
  { id: 'fan', emoji: '🌀', name: 'Standing fan', room: 'Bedroom', perk: '+5 energy when you rest (when there is light).', variants: [{ id: 'standing', name: 'Standing fan', naira: 28000 }, { id: 'rechargeable', name: 'Rechargeable fan (works without NEPA)', naira: 45000 }] },
  { id: 'wardrobe', emoji: '🚪', name: 'Wardrobe', room: 'Bedroom', perk: 'Your Sunday best stays neat.', variants: [{ id: 'wood', name: 'Wooden wardrobe', naira: 70000 }, { id: 'mirror', name: 'Wardrobe with mirror doors', naira: 150000 }] },
  { id: 'desk', emoji: '🗒️', name: 'Reading desk', room: 'Bedroom', perk: '+1 word when you study.', variants: [{ id: 'desk', name: 'Reading desk and chair', naira: 35000 }, { id: 'study', name: 'Study desk with lamp', naira: 90000 }] },
  { id: 'keyboard', emoji: '🎹', name: 'Keyboard', room: 'Bedroom', perk: 'Practise at home. Choir members love it.', variants: [{ id: 'keyboard', name: 'Keyboard on a stand', naira: 160000 }, { id: 'piano', name: 'Digital piano', naira: 450000 }] },
  { id: 'ac', emoji: '❄️', name: 'Air conditioner', room: 'Bedroom', perk: '+10 energy when you rest. Needs light.', variants: [{ id: '1hp', name: '1 HP split AC', naira: 420000 }, { id: '2hp', name: '2 HP split AC', naira: 650000 }] },
  { id: 'solar', emoji: '🔆', name: 'Solar panels and inverter', room: 'Roof', perk: 'No more NEPA wahala: fans and AC always work.', variants: [{ id: 'solar', name: 'Solar panels and inverter', naira: 1250000 }] },
  { id: 'chandelier', emoji: '💡', name: 'Crystal chandelier', room: 'Living room', perk: 'Pure show. Visitors will talk.', vanity: true, variants: [{ id: 'crystal', name: 'Crystal chandelier', naira: 380000 }] },
];
export const FURNITURE_BY_ID = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));
/** The Buy tab list: each slot from its cheapest paid model. */
export const CATALOG = FURNITURE.map((f) => ({ id: f.id, emoji: f.emoji, name: f.name, room: f.room, perk: f.perk, vanity: f.vanity, naira: Math.min(...f.variants.filter((v) => !v.free).map((v) => v.naira)) }));
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/** The model in a slot (old saves stored `true`), or the free default, or null. */
export function variantOf(s, slot) {
  const f = FURNITURE_BY_ID[slot];
  if (!f) return null;
  const v = s.home?.[slot];
  if (v === true) return f.variants.find((x) => !x.free) || f.variants[0];
  return f.variants.find((x) => x.id === v) || f.variants.find((x) => x.free) || null;
}

/**
 * Buy a model for a slot, replacing what was there (the old one goes to a neighbour in need).
 * Mutates `s`. `variant` defaults to the cheapest model you don't have.
 */
export function buyFurniture(s, slot, variant) {
  const f = FURNITURE_BY_ID[slot];
  if (!f) return { ok: false, reason: 'Not in the catalog' };
  s.home = s.home || {};
  const cur = variantOf(s, slot);
  const v = f.variants.find((x) => x.id === variant) || f.variants.find((x) => !x.free && x.id !== cur?.id);
  if (!v || v.free) return { ok: false, reason: 'Choose a model' };
  if (cur && cur.id === v.id && (s.home[slot] || cur.free)) return { ok: false, reason: 'You already have it' };
  if (s.naira < v.naira) return { ok: false, reason: `You need ${naira(v.naira)}` };
  s.naira -= v.naira;
  const hadOld = !!(cur && (s.home[slot] || cur.free));
  s.home[slot] = v.id;
  if (f.vanity) s.character = clamp(s.character - 2, 0, 100);
  if (hadOld) s.character = clamp(s.character + 1, 0, 100);
  const text = `${f.emoji} ${v.name} delivered to No. 14!${hadOld ? ` You gave your ${cur.name.toLowerCase()} to a neighbour who needed it. +1 character.` : ''}${f.vanity ? ' A neighbour asked where the money came from.' : ''}`;
  return { ok: true, text, slot, variant: v.id };
}

/** Extra energy when you rest at home, from the furniture. */
export function restBonus(s) {
  const h = s.home || {};
  const light = !!h.solar || Math.random() < 0.6; // NEPA: sometimes there is light, sometimes not
  const bed = { king: 28, spring: 20, true: 20 }[h.bed] || 0;
  const fan = h.fan && (light || h.fan === 'rechargeable') ? 5 : 0;
  const ac = h.ac && light ? (h.ac === '2hp' ? 12 : 10) : 0;
  return bed + fan + ac;
}

/* ================================================================ things to do */

/**
 * Activities at places. `naira` = price, `energy` = cost (negative = rest), `zones` = where in
 * the 3D world (walkable places) else it happens on a trip. `shady` = a temptation.
 * `run(s, rng)` applies the rest and returns the story text.
 */
export const ACTIVITIES = [
  // Elegushi Beach
  { id: 'suya', place: 'beach', emoji: '🍢', name: 'Suya and a cold drink', naira: 3000, energy: -5, run: (s) => { eat(s, 30); return 'Hot suya with plenty yaji and onions. The breeze from the Atlantic was everything.'; } },
  { id: 'coconut', place: 'beach', emoji: '🥥', name: 'Fresh coconut', naira: 800, energy: -3, run: (s) => { eat(s, 8); return 'The coconut man cut it open with one swing. Sweet!'; } },
  { id: 'horse', place: 'beach', emoji: '🐎', name: 'Horse ride on the sand', naira: 5000, energy: 5, run: (s) => { s.points += 3; return 'You rode a horse along the shore and laughed like a child. +3⭐'; } },
  { id: 'beachpray', place: 'beach', emoji: '🌅', name: 'Pray by the sea', naira: 0, energy: 5, once: true, run: (s) => { s.faith = clamp(s.faith + 6, 0, 100); return 'The waves kept coming, like His mercies. +6 faith.'; } },
  { id: 'beachparty', place: 'beach', emoji: '🍾', name: 'Join the beach party', naira: 10000, energy: 25, shady: true, once: true, after: 18, run: (s) => fall(s, 'the beach party: shisha, alcohol and loud music till 3am', 8) },
  // National Theatre
  { id: 'nollywood', place: 'theatre', emoji: '🎞️', name: 'Watch a Nollywood film', naira: 3500, energy: -5, run: (s) => { s.points += 2; return 'The film was long, the twist was longer, everybody shouted at the screen. +2⭐'; } },
  { id: 'gospelfilm', place: 'theatre', emoji: '✝️', name: 'Watch a gospel film', naira: 2500, energy: -5, run: (s) => { s.faith = clamp(s.faith + 5, 0, 100); return 'A film about forgiveness. You cried small. +5 faith.'; } },
  { id: 'popcorn', place: 'theatre', emoji: '🍿', name: 'Popcorn and a drink', naira: 2500, energy: -2, run: (s) => { eat(s, 12); return 'Big popcorn, small drink, as usual.'; } },
  { id: 'horror', place: 'theatre', emoji: '👻', name: '"Blood Money" (the juju film)', naira: 3000, energy: 5, shady: true, once: true, run: (s) => { s.faith = clamp(s.faith - 4, 0, 100); return 'Money rituals and shrines for two hours. You could not sleep well. −4 faith.'; } },
  // Police station: distractions and choices
  { id: 'reportcrime', place: 'police', emoji: '📝', name: 'Report your stolen phone', naira: 0, energy: 15, once: true, run: (s) => { s.points += 1; return 'You wrote a statement and got a police report. The officer asked for "bail" money for the biro. You smiled and said God bless you.'; } },
  { id: 'bailfriend', place: 'police', emoji: '🔓', name: 'Bail Bro. Emeka (arrested at a checkpoint)', naira: 20000, energy: 20, once: true, run: (s) => { s.character = clamp(s.character + 4, 0, 100); s.testimonies += 1; return 'Bro. Emeka was arrested for "wandering". You paid the bail and took him home. He cried and thanked God for you. +4 character.'; } },
  { id: 'preachcell', place: 'police', emoji: '📖', name: 'Pray with the people in the cell', naira: 0, energy: 20, once: true, run: (s) => { s.souls += 1; s.faith = clamp(s.faith + 4, 0, 100); return 'The officer let you pray with the people in the cell. One young man gave his life to Christ. +1 soul.'; } },
  { id: 'roger', place: 'police', emoji: '💸', name: 'Pay "something" to skip the queue', naira: 5000, energy: 0, shady: true, once: true, run: (s) => fall(s, 'bribery at the police station', 5) },
  // LUTH
  { id: 'visitsick', place: 'luth', emoji: '🙏', name: 'Visit and pray for the sick', naira: 0, energy: 20, once: true, run: (s) => { s.faith = clamp(s.faith + 5, 0, 100); s.character = clamp(s.character + 3, 0, 100); s.points += 4; return '"I was sick, and ye visited me" (Matthew 25:36). You prayed in the children\'s ward. A mother hugged you.'; } },
  { id: 'blood', place: 'luth', emoji: '🩸', name: 'Donate blood', naira: 0, energy: 30, once: true, run: (s) => { s.character = clamp(s.character + 5, 0, 100); s.points += 5; return 'You donated a pint of blood for a woman in labour. The nurse gave you Malta and biscuits. +5 character.'; } },
  { id: 'paybill', place: 'luth', emoji: '💊', name: 'Pay a stranger\'s hospital bill', naira: 15000, energy: 5, once: true, run: (s) => { s.character = clamp(s.character + 6, 0, 100); s.points += 8; return 'A young man was crying at the pharmacy. You paid for his mother\'s drugs. "Who are you?" "Just a child of God."'; } },
  // Hope Children's Home
  { id: 'orphanvisit', place: 'orphanage', emoji: '🎁', name: 'Visit with gifts and food', naira: 10000, energy: 20, once: true, run: (s) => { s.character = clamp(s.character + 5, 0, 100); s.faith = clamp(s.faith + 3, 0, 100); s.points += 8; return 'You brought rice, biscuits and Bibles. The children sang "Jesus loves me" for you.'; } },
  { id: 'teachkids', place: 'orphanage', emoji: '✏️', name: 'Teach the children a Bible story', naira: 0, energy: 15, once: true, run: (s) => { s.word = clamp(s.word + 2, 0, 100); s.points += 3; return 'You told them about David and Goliath. Little Tobi wants to be a "giant killer" now.'; } },
  // Gospel radio
  { id: 'onair', place: 'radio', emoji: '🎙️', name: 'Share your testimony on air', naira: 0, energy: 15, once: true, days: ['Sun', 'Sat'], run: (s) => { s.points += 10; s.fame = clamp((s.fame || 0) + 3, 0, 100); s.testimonies += 1; return 'You shared your testimony on Sunday Praise Hour. Callers phoned in to thank God with you. +10⭐'; } },
  // Betting shop (temptation)
  { id: 'betslip', place: 'betting', emoji: '🎰', name: 'Stake ₦5,000 on "sure odds"', naira: 5000, energy: 5, shady: true, run: (s, rng) => { if (rng() < 0.15) { s.naira += 30000; s.convicted = true; return 'You won ₦30,000! Your friends are cheering, but your spirit is not at peace. You feel convicted.'; } return fall(s, 'gambling: the "sure odds" lost', 4); } },
  { id: 'witnessbet', place: 'betting', emoji: '💬', name: 'Talk to the boys about Jesus', naira: 0, energy: 20, once: true, run: (s) => { s.souls += 1; s.character = clamp(s.character + 2, 0, 100); return 'They laughed at first, but one of them, Kola, asked for your number. He wants to come to church on Sunday.'; } },
  // Lounge (temptation)
  { id: 'clubnight', place: 'lounge', emoji: '🍾', name: 'Party till morning', naira: 25000, energy: 30, shady: true, once: true, run: (s) => fall(s, 'a night of drinking and "vibes" at the lounge', 9) },
  { id: 'mocktail', place: 'lounge', emoji: '🥤', name: 'Have a mocktail and leave early', naira: 4000, energy: 5, run: (s) => { s.character = clamp(s.character + 1, 0, 100); return 'You came for a friend\'s birthday, had a Chapman and left before things got rough. Wisdom! +1 character.'; } },
  // Owambe
  { id: 'wedding', place: 'owambe', emoji: '💒', name: 'Attend Sis. Funke\'s wedding', naira: 3000, energy: 15, once: true, days: ['Sat'], run: (s) => { s.hunger = clamp(s.hunger + 40, 0, 100); s.points += 4; return 'A beautiful church wedding, then jollof, small chops and dancing at the reception. +4⭐'; } },
  { id: 'spraymoney', place: 'owambe', emoji: '💵', name: 'Spray ₦20,000 to "show yourself"', naira: 20000, energy: 5, shady: true, once: true, run: (s) => { s.character = clamp(s.character - 2, 0, 100); s.fame = clamp((s.fame || 0) + 2, 0, 100); return 'Everybody saw you spraying crisp notes. Pride feels sweet, but your rent is due next week. −2 character.'; } },
  // Popular bukas
  { id: 'amala', place: 'bodethomas', emoji: '🍲', name: 'Amala, gbegiri, ewedu and assorted', naira: 4500, energy: -10, run: (s) => { eat(s, 55); return 'The amala was hot, the gbegiri was thick, and the assorted meat was plenty. Lagos ti o!'; } },
  { id: 'agbero', place: 'bodethomas', emoji: '😤', name: 'Argue with the agbero', naira: 0, energy: 15, shady: true, once: true, run: (s) => { s.character = clamp(s.character - 3, 0, 100); return 'You exchanged words with an agbero over ₦200 and almost fought. Your Bible was in your bag. −3 character.'; } },
  { id: 'mamaput', place: 'ojuelegba', emoji: '🍛', name: 'Rice, dodo and assorted meat', naira: 2500, energy: -8, run: (s) => { eat(s, 45); return 'Mama put added extra stew and called you "my pikin". You prayed over the food before eating.'; } },
  { id: 'buyforneighbour', place: 'ojuelegba', emoji: '🤝', name: 'Buy food for a hungry boy', naira: 1500, energy: 0, once: true, run: (s) => { s.character = clamp(s.character + 4, 0, 100); s.points += 3; return 'A boy was looking at the food. You bought him a plate and told him Jesus loves him. +4 character. +3⭐'; } },
  // Trips
  { id: 'govtour', place: 'govhouse', emoji: '🏛️', name: 'Public tour (Saturdays)', naira: 0, energy: 10, once: true, days: ['Sat'], run: (s) => { s.points += 5; s.word = clamp(s.word + 1, 0, 100); return 'You saw the gardens and old pictures of Lagos. Pray for those in authority (1 Timothy 2:2). +5⭐'; } },
  { id: 'fabric', place: 'balogun', emoji: '🧵', name: 'Buy Ankara for a new outfit', naira: 12000, energy: 15, run: (s) => { s.items.outfit = true; return 'Six yards of fine Ankara. Your tailor will sew your Sunday best.'; } },
  { id: 'shoes', place: 'balogun', emoji: '👞', name: 'Sunday shoes', naira: 18000, energy: 10, run: (s) => { s.points += 2; return 'Shiny shoes for Sunday. The trader said "Oga, na your size!" +2⭐'; } },
  { id: 'crusade', place: 'tbs', emoji: '🔥', name: 'Attend the crusade', naira: 0, energy: 25, once: true, days: ['Fri', 'Sat', 'Sun'], run: (s) => { s.faith = clamp(s.faith + 10, 0, 100); s.points += 4; return 'Thousands worshipping under the open sky. +10 faith. +4⭐'; } },
  { id: 'phone', place: 'computer', emoji: '📱', name: 'Smartphone with Bible app', naira: 60000, energy: 10, needs: (s) => !s.items.phone, run: (s) => { s.items.phone = true; return 'A clean phone (you checked the IMEI). Reading the Bible is easier now.'; } },
  { id: 'fakephone', place: 'computer', emoji: '🤫', name: '"London-used" iPhone, half price', naira: 90000, energy: 5, shady: true, once: true, run: (s) => { s.character = clamp(s.character - 3, 0, 100); return 'It was stolen. A man came to collect it at your house with the police. You lost the money. −3 character.'; } },
  { id: 'fellowship', place: 'unilag', emoji: '🙌', name: 'Campus fellowship', naira: 0, energy: 15, once: true, days: ['Thu', 'Sun'], run: (s) => { s.faith = clamp(s.faith + 5, 0, 100); s.word = clamp(s.word + 3, 0, 100); return 'Students praising like it was a vigil. +5 faith, +3 word.'; } },
  { id: 'jog', place: 'lekkibridge', emoji: '🏃', name: 'Evening jog on the bridge', naira: 0, energy: 20, once: true, run: (s) => { s.points += 2; return 'Sunset over the lagoon. You jogged with half of Lekki. +2⭐'; } },
  { id: 'seaview', place: 'ekoatlantic', emoji: '🌊', name: 'Walk the sea wall', naira: 0, energy: 10, once: true, run: (s) => { s.points += 1; return 'The ocean on one side, glass towers on the other. +1⭐'; } },
  { id: 'prayermountain', place: 'mountain', emoji: '⛰️', name: 'Pray on the mountain', naira: 1000, energy: 35, once: true, run: (s) => { s.faith = clamp(s.faith + 14, 0, 100); return 'You fasted and prayed on the mountain. Heaven felt close. +14 faith.'; } },
  { id: 'documents', place: 'secretariat', emoji: '🗂️', name: 'Register your small business', naira: 25000, energy: 20, once: true, needs: (s) => !s.items.business, run: (s) => { s.items.business = true; s.salary += 1500; return 'After three offices and one "come back tomorrow", your business is registered. +₦1,500 daily income.'; } },
  { id: 'settle', place: 'secretariat', emoji: '💸', name: '"Settle" the officer to go faster', naira: 15000, energy: 5, shady: true, once: true, run: (s) => fall(s, 'bribery at the Secretariat', 6) },
];
export const ACTIVITY_BY_ID = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

function eat(s, n) { s.hunger = clamp(s.hunger + n, 0, 100); }
function fall(s, sin, cost) {
  s.convicted = true;
  s.falls += 1;
  s.character = clamp(s.character - cost, 0, 100);
  s.faith = clamp(s.faith - 5, 0, 100);
  return `You fell into ${sin}. You feel convicted. "Confess & Repent" is on your Today tab.`;
}

/** Activities at a place, with availability. */
export function activitiesAt(s, placeId, weekdayShort, hour) {
  return ACTIVITIES.filter((a) => a.place === placeId && (!a.needs || a.needs(s))).map((a) => {
    let reason = null;
    if (a.once && s.doneToday?.[`act:${a.id}`]) reason = 'Done today';
    else if (a.days && !a.days.includes(weekdayShort)) reason = `Only on ${a.days.join(', ')}`;
    else if (a.after && hour < a.after) reason = `From ${a.after}:00`;
    else if (a.naira > s.naira) reason = `You need ${naira(a.naira)}`;
    else if (a.energy > 0 && a.energy > s.energy) reason = 'You are too tired';
    return { ...a, ok: !reason, reason };
  });
}

/** Do an activity (you are already at the place). Mutates `s`. */
export function doActivity(s, id, weekdayShort, hour, rng = Math.random) {
  const a = activitiesAt(s, ACTIVITY_BY_ID[id]?.place, weekdayShort, hour).find((x) => x.id === id);
  if (!a) return { ok: false, reason: 'Not available here' };
  if (!a.ok) return { ok: false, reason: a.reason };
  s.naira -= a.naira;
  s.energy = clamp(s.energy - a.energy, 0, 100);
  if (a.once) s.doneToday[`act:${a.id}`] = true;
  const text = a.run(s, rng);
  s.naira = Math.round(s.naira);
  return { ok: true, text, shady: !!a.shady, emoji: a.emoji };
}

/* ================================================================ giving (bank app) */

/** Ways to give at Grace Assembly. `amounts` = choices in the app (null: computed). */
export const GIVING = [
  { id: 'tithe', emoji: '🙌', name: 'Tithe (10%)', desc: 'A tenth of your week\'s income. Once a week.', weekly: true },
  { id: 'offering', emoji: '🪙', name: 'Offering', desc: 'Give what is in your heart.', amounts: [500, 1000, 2000, 5000] },
  { id: 'thanksgiving', emoji: '🎉', name: 'Thanksgiving', desc: 'Thank God for what He has done this week.', amounts: [5000, 10000, 20000], weekly: true },
  { id: 'building', emoji: '🏗️', name: 'Building fund', desc: 'For the new auditorium.', amounts: [1000, 5000, 20000] },
  { id: 'missions', emoji: '🌍', name: 'Support missions', desc: 'Bibles and food for the Makoko outreach.', amounts: [2000, 5000] },
];
export const GIVING_BY_ID = Object.fromEntries(GIVING.map((g) => [g.id, g]));

/** The tithe on a week of salary. */
export const titheAmount = (s) => Math.max(500, Math.round(((s.salary || 0) * 7 * 0.1) / 50) * 50);

/**
 * Give to the church. Mutates `s`. `week` = the current week number (once-a-week gifts).
 * Giving is between you and God: small blessings, never a "money back" promise.
 */
export function give(s, id, amount, week) {
  const g = GIVING_BY_ID[id];
  if (!g) return { ok: false, reason: 'Unknown gift' };
  s.gifts = s.gifts || {};
  const n = id === 'tithe' ? titheAmount(s) : Math.round(Number(amount) || 0);
  if (n <= 0) return { ok: false, reason: 'Choose an amount' };
  if (g.weekly && s.gifts[id] === week) return { ok: false, reason: 'Already given this week. God bless you!' };
  if (s.naira < n) return { ok: false, reason: `You need ${naira(n)}` };
  s.naira -= n;
  s.doneToday = s.doneToday || {};
  s.doneToday.given = true;
  if (g.weekly) s.gifts[id] = week;
  s.given = (s.given || 0) + n;
  const k = Math.min(1, n / 5000);
  let text;
  switch (id) {
    case 'tithe': s.faith = clamp(s.faith + 5, 0, 100); s.character = clamp(s.character + 2, 0, 100); s.points += 10; text = `You paid your tithe of ${naira(n)}. "Bring ye all the tithes into the storehouse" (Malachi 3:10). +10⭐`; break;
    case 'thanksgiving': s.faith = clamp(s.faith + 4, 0, 100); s.testimonies += 1; s.points += 8; text = `Thanksgiving offering of ${naira(n)}. You danced to the altar. +8⭐`; break;
    case 'missions': s.points += 6; s.character = clamp(s.character + 2, 0, 100); text = `${naira(n)} sent to the missions team. Bibles are going to Makoko. +6⭐`; break;
    default: s.faith = clamp(s.faith + 1 + Math.round(k * 2), 0, 100); s.points += 2 + Math.round(k * 4); text = `You gave ${naira(n)} (${g.name.toLowerCase()}). "God loveth a cheerful giver" (2 Corinthians 9:7).`;
  }
  return { ok: true, text, amount: n };
}

/* ================================================================ phone actions */

/** Food you can order to wherever you are (food app). */
export const DELIVERY = [
  { id: 'amala', emoji: '🍲', name: 'Amala, ewedu and gbegiri', from: 'Bode Thomas', naira: 4800, hunger: 55 },
  { id: 'jollof', emoji: '🍛', name: 'Party jollof and chicken', from: 'Yaba', naira: 5500, hunger: 60 },
  { id: 'ofada', emoji: '🌶️', name: 'Ofada rice and ayamase', from: 'Ikeja', naira: 6000, hunger: 60 },
  { id: 'suya', emoji: '🍢', name: 'Suya (₦2,000 wrap)', from: 'University Road', naira: 2800, hunger: 25 },
  { id: 'bread', emoji: '🍞', name: 'Agege bread and akara', from: 'Yaba', naira: 1500, hunger: 30 },
];

/**
 * Small things you do on the phone. `once` = once a day. Returns story text.
 */
export const PHONE_ACTIONS = {
  callPastor: { once: true, run: (s) => { s.faith = clamp(s.faith + 4, 0, 100); s.points += 2; return 'Pastor Ade prayed with you on the phone and reminded you: "The LORD is my shepherd." +4 faith.'; } },
  callMum: { once: true, run: (s) => { s.character = clamp(s.character + 1, 0, 100); return 'Mum asked if you have eaten, if you went to church, and when you are bringing a wife or husband home. You laughed. +1 character.'; } },
  callPartner: { once: true, run: (s) => { s.faith = clamp(s.faith + 2, 0, 100); return 'You and Sister Chioma prayed for 10 minutes for each other\'s needs. +2 faith.'; } },
  sermon: { once: true, run: (s) => { s.word = clamp(s.word + 3, 0, 100); s.faith = clamp(s.faith + 2, 0, 100); s.points += 1; return 'You listened to last Sunday\'s sermon, "Faith that works". +3 word.'; } },
  blockScam: { run: (s) => { s.character = clamp(s.character + 2, 0, 100); s.points += 2; return 'You blocked and reported the number. Not today, devil! +2 character.'; } },
  replyScam: { run: (s) => { const lost = Math.min(s.naira, 25000); s.naira -= lost; s.character = clamp(s.character - 4, 0, 100); s.convicted = true; s.falls += 1; return `You sent "registration fee" for the "investment". ${naira(lost)} is gone and you feel ashamed. Confess & Repent is on your Today tab.`; } },
};

/** Do a phone action (or order food with id 'order:<food>'). Mutates `s`. */
export function doPhone(s, id) {
  s.doneToday = s.doneToday || {};
  if (id.startsWith('order:')) {
    const f = DELIVERY.find((x) => x.id === id.slice(6));
    if (!f) return { ok: false, reason: 'Not on the menu' };
    if (s.naira < f.naira) return { ok: false, reason: `You need ${naira(f.naira)}` };
    s.naira -= f.naira;
    s.hunger = clamp(s.hunger + f.hunger, 0, 100);
    return { ok: true, text: `${f.emoji} The rider brought your ${f.name.toLowerCase()} from ${f.from}. You prayed and ate. Delivery included.` };
  }
  const a = PHONE_ACTIONS[id];
  if (!a) return { ok: false, reason: 'Not available' };
  if (a.once && s.doneToday[`phone:${id}`]) return { ok: false, reason: 'Already done today' };
  if (a.once) s.doneToday[`phone:${id}`] = true;
  const text = a.run(s);
  s.naira = Math.round(s.naira);
  return { ok: true, text };
}

/* ================================================================ church billboards */

/** Billboards you can book for a church programme (one week). */
export const AD_SPOTS = [
  { id: 'yaba', name: 'Herbert Macaulay Way, Yaba', emoji: '🪧', naira: 50000, reach: 'People walking to church and the market' },
  { id: 'thirdmainland', name: 'Third Mainland Bridge', emoji: '🌉', naira: 250000, reach: 'Thousands stuck in go-slow every day' },
  { id: 'lekki', name: 'Lekki Toll Gate', emoji: '🚗', naira: 500000, reach: 'The Island crowd, day and night' },
];
export const AD_DAYS = 7;

/**
 * Book a billboard for a church programme. Mutates `s`. Returns the ad.
 * @param {{spot: string, title: string, sub?: string, church?: string, theme?: string, motif?: string}} ad
 */
export function bookAd(s, ad) {
  const spot = AD_SPOTS.find((x) => x.id === ad?.spot);
  if (!spot) return { ok: false, reason: 'Choose a billboard' };
  const title = String(ad.title || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 28);
  if (!title) return { ok: false, reason: 'Write the programme title' };
  s.ads = (s.ads || []).filter((a) => a.untilT > s.T);
  if (s.ads.some((a) => a.spot === spot.id)) return { ok: false, reason: 'You already have that billboard this week' };
  if (s.naira < spot.naira) return { ok: false, reason: `You need ${naira(spot.naira)}` };
  s.naira -= spot.naira;
  const booked = {
    spot: spot.id, title: title.toUpperCase(), sub: String(ad.sub || '').trim().slice(0, 40),
    church: String(ad.church || s.pastor?.church || 'Grace Assembly, Yaba').slice(0, 36),
    theme: ad.theme || 'royal', motif: ad.motif || 'cross', untilT: s.T + AD_DAYS * 1440,
  };
  s.ads.push(booked);
  // More people hear about the programme: your own church grows, or Grace Assembly gets visitors.
  const reach = { yaba: 1, thirdmainland: 4, lekki: 7 }[spot.id];
  if (s.pastor) { s.pastor.members += 3 * reach; s.fame = clamp((s.fame || 0) + reach, 0, 100); }
  s.points += 5 * reach;
  return { ok: true, ad: booked, text: `Your poster "${booked.title}" is up on ${spot.name} for a week. People are talking about it! +${5 * reach}⭐` };
}

/** Booked ads still running at time T. */
export const activeAds = (s) => (s.ads || []).filter((a) => a.untilT > s.T);
