// Pure mapping from world zones to ambience beds and mix settings (no Web Audio here).

/** @typedef {'street'|'church'|'market'|'home'|'prayer'|'none'} Ambience */
/** @typedef {'inside'|'adjacent'|'compound'|'far'} Placement where the listener is relative to the church hall */

export const AMBIENCES = ['street', 'church', 'market', 'home', 'prayer'];

/** World zone id → [ambience bed, placement relative to the auditorium]. */
export const ZONE_MAP = {
  street: ['street', 'far'],
  busstop: ['street', 'far'],
  market: ['market', 'far'],
  gate: ['street', 'compound'],
  carpark: ['street', 'compound'],
  'church-hall': ['church', 'inside'],
  altar: ['church', 'inside'],
  choir: ['church', 'inside'],
  media: ['church', 'inside'],
  'prayer-room': ['prayer', 'adjacent'],
  kitchen: ['church', 'adjacent'],
  home: ['home', 'far'],
};

const DEFAULT_PLACEMENT = { street: 'far', church: 'inside', market: 'far', home: 'far', prayer: 'adjacent', none: 'far' };

/**
 * Resolve whatever the caller passed (zone object, zone id, ambience name, null) into
 * an ambience bed and a placement.
 * @param {any} zone
 * @returns {{ambience: Ambience, placement: Placement, id: string|null}}
 */
export function resolveZone(zone) {
  if (zone == null) return { ambience: 'street', placement: 'far', id: null };
  if (typeof zone === 'object') {
    const id = zone.id ?? null;
    if (id && ZONE_MAP[id]) return { ambience: zone.ambience && AMBIENCES.includes(zone.ambience) ? zone.ambience : ZONE_MAP[id][0], placement: ZONE_MAP[id][1], id };
    const amb = AMBIENCES.includes(zone.ambience) ? zone.ambience : 'street';
    return { ambience: amb, placement: DEFAULT_PLACEMENT[amb], id };
  }
  const s = String(zone);
  if (ZONE_MAP[s]) return { ambience: /** @type {Ambience} */ (ZONE_MAP[s][0]), placement: /** @type {Placement} */ (ZONE_MAP[s][1]), id: s };
  if (AMBIENCES.includes(s) || s === 'none') return { ambience: /** @type {Ambience} */ (s), placement: DEFAULT_PLACEMENT[s], id: null };
  return { ambience: 'street', placement: 'far', id: s };
}

/**
 * How the worship music is heard from where the listener is: full in the hall,
 * through a wall next door, muffled across the compound, faint down the street.
 * @param {Placement} placement
 */
export function musicMix(placement) {
  switch (placement) {
    case 'inside': return { gain: 1, lowpass: 16000, reverb: 1 };
    case 'adjacent': return { gain: 0.45, lowpass: 1600, reverb: 0.7 };
    case 'compound': return { gain: 0.4, lowpass: 900, reverb: 0.5 };
    default: return { gain: 0.16, lowpass: 520, reverb: 0.35 };
  }
}

/** Room reverb send for effects and footsteps per ambience (0..1). */
export function reverbFor(ambience) {
  return { church: 0.32, prayer: 0.2, home: 0.1, street: 0.07, market: 0.05, none: 0.05 }[ambience] ?? 0.07;
}

/** Footstep loudness per surface (relative), run boost and playback rate. */
export function footstepParams(surface, run) {
  const base = { asphalt: 0.36, concrete: 0.36, tile: 0.34, carpet: 0.42, wood: 0.34, dirt: 0.36 }[surface] ?? 0.36;
  return { gain: base * (run ? 1.4 : 1), rate: run ? 1.04 : 1 };
}
