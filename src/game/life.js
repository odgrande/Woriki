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
      if (rng() < 0.05) { lost = Math.min(s.naira, 1500); s.naira -= lost; text += ` Somebody "picked" ${naira(lost)} from your pocket.`; }
      break;
    }
    case 'taxi':
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
 * Furniture and appliances for No. 14. `slot` = where it goes (src/world/decor.js builds it).
 * `perk` describes the small boost it gives; `effect` is applied by the game (see perks()).
 */
export const CATALOG = [
  { id: 'chairs', emoji: '🪑', name: 'Plastic chairs and table', naira: 15000, room: 'Living room', perk: 'Seats for visitors from church.' },
  { id: 'plants', emoji: '🪴', name: 'Potted plants', naira: 9000, room: 'Living room', perk: 'Fresh and green.' },
  { id: 'altar', emoji: '🕯️', name: 'Family prayer corner', naira: 18000, room: 'Living room', perk: '+2 faith when you pray at home.' },
  { id: 'picture', emoji: '🖼️', name: 'Framed "The Lord is my Shepherd"', naira: 12000, room: 'Living room', perk: 'Psalm 23 on your wall.' },
  { id: 'bookshelf', emoji: '📚', name: 'Bookshelf with Christian books', naira: 45000, room: 'Living room', perk: '+1 word every time you read.' },
  { id: 'fridge', emoji: '🧊', name: 'Fridge', naira: 240000, room: 'Living room', perk: 'Cooking at home fills you more.' },
  { id: 'tv', emoji: '📺', name: '55-inch flat-screen TV', naira: 320000, room: 'Living room', perk: 'Watch gospel channels. Also cartoons. Also football…' },
  { id: 'dining', emoji: '🍽️', name: 'Dining set (4 chairs)', naira: 130000, room: 'Living room', perk: 'Family meals. +2 character on Sundays at home.' },
  { id: 'bed', emoji: '🛏️', name: 'Spring bed and frame', naira: 95000, room: 'Bedroom', perk: '+20 energy when you rest.' },
  { id: 'fan', emoji: '🌀', name: 'Standing fan', naira: 28000, room: 'Bedroom', perk: '+5 energy when you rest (when there is light).' },
  { id: 'wardrobe', emoji: '🚪', name: 'Wardrobe', naira: 70000, room: 'Bedroom', perk: 'Your Sunday best stays neat.' },
  { id: 'desk', emoji: '🗒️', name: 'Reading desk and chair', naira: 35000, room: 'Bedroom', perk: '+1 word when you study.' },
  { id: 'keyboard', emoji: '🎹', name: 'Keyboard (piano)', naira: 160000, room: 'Bedroom', perk: 'Practise at home. Choir members love it.' },
  { id: 'ac', emoji: '❄️', name: 'Split air conditioner', naira: 420000, room: 'Bedroom', perk: '+10 energy when you rest. Needs light.' },
  { id: 'solar', emoji: '🔆', name: 'Solar panels and inverter', naira: 1250000, room: 'Roof', perk: 'No more NEPA wahala: fans and AC always work.' },
  { id: 'chandelier', emoji: '💡', name: 'Crystal chandelier', naira: 380000, room: 'Living room', perk: 'Pure show. Visitors will talk.', vanity: true },
];
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/** Buy a piece of furniture. Mutates `s`. */
export function buyFurniture(s, id) {
  const it = CATALOG_BY_ID[id];
  if (!it) return { ok: false, reason: 'Not in the catalog' };
  s.home = s.home || {};
  if (s.home[id]) return { ok: false, reason: 'You already have it' };
  if (s.naira < it.naira) return { ok: false, reason: `You need ${naira(it.naira)}` };
  s.naira -= it.naira;
  s.home[id] = true;
  if (it.vanity) s.character = clamp(s.character - 2, 0, 100);
  return { ok: true, text: `${it.emoji} ${it.name} delivered to No. 14!${it.vanity ? ' A neighbour asked where the money came from.' : ''}` };
}

/** Extra energy when you rest at home, from the furniture. */
export function restBonus(s) {
  const h = s.home || {};
  const light = !!h.solar || Math.random() < 0.6; // NEPA: sometimes there is light, sometimes not
  return (h.bed ? 20 : 0) + (h.fan && light ? 5 : 0) + (h.ac && light ? 10 : 0);
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
