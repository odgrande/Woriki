// Appearance data for Amen City characters: enums, defaults and a role-aware
// random look generator. Pure logic (no three.js) so it is unit-tested.

/** Skin tones, 0 = light brown … 5 = very deep brown (sRGB albedo targets). */
export const SKIN_TONES = ['#9c6b4c', '#85573b', '#6e462f', '#583824', '#45291b', '#331d13'];

export const BODIES = ['male', 'female'];
export const HAIR_STYLES = ['buzzed', 'buzzedfemale', 'buns', 'long', 'simpleparted', 'none'];
export const OUTFITS = [
  'shirt-trousers', 'ankara-shirt', 'agbada', 'senator', 'ankara-gown', 'skirt-blouse', 'iro-buba',
  'choir-robe', 'white-garment', 'security', 'usher', 'suit', 'tshirt-jeans', 'apron',
];
export const HEADWEAR = ['none', 'gele', 'fila', 'cap', 'beret', 'headscarf'];
export const PATTERNS = ['ankara-1', 'ankara-2', 'ankara-3', 'plain', 'stripes', 'lace'];
export const ROLES = ['worshipper', 'prayer', 'security', 'usher', 'choir', 'media', 'hospitality', 'children', 'visitor', 'minister'];

/** Outfits that are normally worn by one body type (used by the random generator only). */
export const FEMALE_OUTFITS = ['ankara-gown', 'skirt-blouse', 'iro-buba'];
export const MALE_OUTFITS = ['agbada', 'senator', 'suit'];

// Colour pools that read as real Lagos Sunday wear.
const ANKARA = ['#c2410c', '#1d4ed8', '#15803d', '#7e22ce', '#b91c1c', '#0f766e', '#ca8a04', '#be185d', '#1e3a8a', '#9a3412'];
const ANKARA_2ND = ['#facc15', '#f97316', '#0ea5e9', '#22c55e', '#f5f0e6', '#111827', '#e11d48', '#a3e635', '#fde68a'];
const RICH = ['#1e3a8a', '#14532d', '#7f1d1d', '#111827', '#e7e2d4', '#57534e', '#0c4a6e', '#4c1d95', '#713f12', '#f3efe4'];
const AGBADA = ['#f3efe4', '#e8dcc2', '#9cc3e6', '#1e40af', '#7f1d1d', '#c9a227', '#14532d', '#e5e7eb', '#6b21a8'];
const LACE = ['#f8f4ec', '#f3d3c0', '#e9d5a1', '#d8c8f0', '#f1c6d3', '#c8e6d4', '#d6b47a'];
const GELE = ['#c9a227', '#be185d', '#7e22ce', '#0f766e', '#c2410c', '#1d4ed8', '#b45309', '#e11d48'];
const SHIRT = ['#f8fafc', '#dbeafe', '#e0f2fe', '#fef3c7', '#f1f5f9', '#fce7f3', '#dcfce7', '#e2e8f0'];
const TROUSERS = ['#1f2937', '#111827', '#374151', '#1e3a8a', '#44403c', '#78716c', '#0f172a', '#a8a29e'];
const TEES = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f8fafc', '#f59e0b', '#7c3aed', '#0891b2', '#e11d48'];
const CHOIR = ['#7f1d1d', '#4c1d95', '#1e3a8a', '#14532d', '#831843'];
const STOLE = ['#d4af37', '#f5f0e6', '#c0c0c0', '#facc15'];
const SHOES_DARK = ['#1c1917', '#2b2118', '#3f2a1c', '#111111'];
const SHOES_LIGHT = ['#f5f5f4', '#e7e5e4', '#c8a27a'];
const CHURCH_COLOURS = ['#7f1d1d', '#1e3a8a', '#4c1d95', '#14532d', '#9d174d'];

/** Default colours per outfit (used when appearance.colors is missing). */
export const OUTFIT_DEFAULT_COLORS = {
  'shirt-trousers': { primary: '#f8fafc', secondary: '#1f2937', pattern: 'plain' },
  'ankara-shirt': { primary: '#c2410c', secondary: '#facc15', pattern: 'ankara-1' },
  agbada: { primary: '#f3efe4', secondary: '#c9a227', pattern: 'plain' },
  senator: { primary: '#1e3a8a', secondary: '#d4af37', pattern: 'plain' },
  'ankara-gown': { primary: '#7e22ce', secondary: '#facc15', pattern: 'ankara-2' },
  'skirt-blouse': { primary: '#f8f4ec', secondary: '#1e3a8a', pattern: 'lace' },
  'iro-buba': { primary: '#f3d3c0', secondary: '#be185d', pattern: 'ankara-3' },
  'choir-robe': { primary: '#7f1d1d', secondary: '#d4af37', pattern: 'plain' },
  'white-garment': { primary: '#f8f8f4', secondary: '#f8f8f4', pattern: 'plain' },
  security: { primary: '#1f2937', secondary: '#111111', pattern: 'plain' },
  usher: { primary: '#7f1d1d', secondary: '#1e293b', pattern: 'plain' },
  suit: { primary: '#1f2937', secondary: '#f8fafc', pattern: 'plain' },
  'tshirt-jeans': { primary: '#dc2626', secondary: '#2c4a7a', pattern: 'plain' },
  apron: { primary: '#15803d', secondary: '#f8fafc', pattern: 'plain' },
};

const HEX = /^#[0-9a-f]{6}$/i;
const pickOr = (v, list, fallback) => (list.includes(v) ? v : fallback);
const hexOr = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);

/**
 * @typedef {object} Appearance
 * @property {'male'|'female'} body
 * @property {number} skin 0..5
 * @property {string} hair
 * @property {boolean} beard
 * @property {string} hairColor
 * @property {string} outfit
 * @property {{primary: string, secondary: string, pattern: string}} colors
 * @property {string} headwear
 * @property {string} shoes
 */

/**
 * Fill in defaults and clamp every field to a valid value.
 * @param {Partial<Appearance>} [a]
 * @returns {Appearance}
 */
export function normalizeAppearance(a = {}) {
  const body = pickOr(a.body, BODIES, 'male');
  const outfit = pickOr(a.outfit, OUTFITS, body === 'female' ? 'skirt-blouse' : 'shirt-trousers');
  const def = OUTFIT_DEFAULT_COLORS[outfit];
  const c = a.colors || {};
  const skin = Number.isFinite(a.skin) ? Math.max(0, Math.min(5, Math.round(a.skin))) : 3;
  return {
    body,
    skin,
    hair: pickOr(a.hair, HAIR_STYLES, body === 'female' ? 'buns' : 'buzzed'),
    beard: body === 'male' && !!a.beard,
    hairColor: hexOr(a.hairColor, '#1b1b1b'),
    outfit,
    colors: {
      primary: hexOr(c.primary, def.primary),
      secondary: hexOr(c.secondary, def.secondary),
      pattern: pickOr(c.pattern, PATTERNS, def.pattern),
    },
    headwear: pickOr(a.headwear, HEADWEAR, 'none'),
    shoes: hexOr(a.shoes, outfit === 'tshirt-jeans' ? '#f5f5f4' : '#2b2118'),
  };
}

/** Map loose role names (UI labels, ids) onto ROLES. */
export function normalizeRole(role) {
  if (!role) return null;
  const r = String(role).toLowerCase();
  if (r.startsWith('prayer')) return 'prayer';
  if (r.startsWith('child') || r.includes('teacher')) return 'children';
  if (r.startsWith('pastor') || r.startsWith('minister')) return 'minister';
  if (r.startsWith('choir')) return 'choir';
  if (r.startsWith('secur')) return 'security';
  if (r.startsWith('usher')) return 'usher';
  if (r.startsWith('media')) return 'media';
  if (r.startsWith('hosp') || r.includes('kitchen')) return 'hospitality';
  if (r.startsWith('visit')) return 'visitor';
  if (r.startsWith('worship') || r.startsWith('member')) return 'worshipper';
  return ROLES.includes(r) ? r : null;
}

/**
 * Pick a realistic Nigerian church look. Role-appropriate when a role is given.
 * @param {() => number} [rng] returns [0, 1)
 * @param {string} [role]
 * @returns {Appearance}
 */
export function randomAppearance(rng = Math.random, role) {
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const chance = (p) => rng() < p;
  const r = normalizeRole(role) || pick(['worshipper', 'worshipper', 'worshipper', 'visitor']);
  const body = r === 'security' ? (chance(0.85) ? 'male' : 'female') : (chance(0.52) ? 'female' : 'male');
  const female = body === 'female';
  // Skin: weighted towards brown and deep brown, the common range in Lagos.
  const skin = pick([0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
  const hair = female ? pick(['buns', 'buns', 'long', 'buzzedfemale', 'simpleparted']) : pick(['buzzed', 'buzzed', 'buzzed', 'simpleparted', 'none']);
  const beard = !female && chance(r === 'minister' ? 0.5 : 0.3);
  const shoesDark = pick(SHOES_DARK);
  /** @type {Partial<Appearance>} */
  let a;

  const sunday = () => {
    if (female) {
      const outfit = pick(['iro-buba', 'iro-buba', 'ankara-gown', 'ankara-gown', 'skirt-blouse']);
      if (outfit === 'iro-buba') {
        return { outfit, colors: { primary: pick(LACE), secondary: pick(ANKARA), pattern: pick(['ankara-1', 'ankara-2', 'ankara-3']) }, headwear: 'gele' };
      }
      if (outfit === 'ankara-gown') {
        return { outfit, colors: { primary: pick(ANKARA), secondary: pick(ANKARA_2ND), pattern: pick(['ankara-1', 'ankara-2', 'ankara-3']) }, headwear: pick(['gele', 'gele', 'headscarf', 'none']) };
      }
      return { outfit, colors: { primary: pick(LACE), secondary: pick(TROUSERS), pattern: pick(['lace', 'lace', 'plain']) }, headwear: pick(['none', 'headscarf', 'gele']) };
    }
    const outfit = pick(['senator', 'senator', 'agbada', 'ankara-shirt', 'suit', 'shirt-trousers']);
    if (outfit === 'agbada') return { outfit, colors: { primary: pick(AGBADA), secondary: pick(['#c9a227', '#f3efe4', '#111827', '#7f1d1d']), pattern: 'plain' }, headwear: 'fila' };
    if (outfit === 'senator') return { outfit, colors: { primary: pick(RICH), secondary: pick(['#d4af37', '#f3efe4', '#111827', '#9ca3af']), pattern: 'plain' }, headwear: chance(0.3) ? 'fila' : 'none' };
    if (outfit === 'ankara-shirt') return { outfit, colors: { primary: pick(ANKARA), secondary: pick(ANKARA_2ND), pattern: pick(['ankara-1', 'ankara-2', 'ankara-3']) }, headwear: 'none' };
    if (outfit === 'suit') return { outfit, colors: { primary: pick(['#1f2937', '#111827', '#1e3a8a', '#374151', '#44403c']), secondary: pick(SHIRT), pattern: 'plain' }, headwear: 'none' };
    return { outfit, colors: { primary: pick(SHIRT), secondary: pick(TROUSERS), pattern: pick(['plain', 'plain', 'stripes']) }, headwear: 'none' };
  };

  const casual = () => {
    if (female && chance(0.4)) return { outfit: 'skirt-blouse', colors: { primary: pick([...SHIRT, ...LACE]), secondary: pick([...TROUSERS, ...ANKARA]), pattern: pick(['plain', 'stripes', 'lace']) }, headwear: pick(['none', 'headscarf']) };
    if (chance(0.5)) return { outfit: 'tshirt-jeans', colors: { primary: pick(TEES), secondary: pick(['#2c4a7a', '#1e3354', '#3b5b8c', '#1f2937']), pattern: 'plain' }, headwear: chance(0.25) ? 'cap' : 'none', shoes: pick(SHOES_LIGHT) };
    if (chance(0.5)) return { outfit: 'ankara-shirt', colors: { primary: pick(ANKARA), secondary: pick(ANKARA_2ND), pattern: pick(['ankara-1', 'ankara-2', 'ankara-3']) }, headwear: 'none' };
    return { outfit: 'shirt-trousers', colors: { primary: pick(SHIRT), secondary: pick(TROUSERS), pattern: pick(['plain', 'stripes']) }, headwear: 'none' };
  };

  switch (r) {
    case 'security':
      a = { outfit: 'security', colors: { primary: pick(['#1f2937', '#111827', '#1e293b']), secondary: '#111111', pattern: 'plain' }, headwear: 'beret', shoes: '#111111' };
      break;
    case 'usher': {
      const sash = pick(CHURCH_COLOURS);
      a = { outfit: 'usher', colors: { primary: sash, secondary: pick(['#1e293b', '#111827', '#1f2937']), pattern: 'plain' }, headwear: female && chance(0.5) ? 'headscarf' : 'none', shoes: '#111111' };
      break;
    }
    case 'choir':
      a = { outfit: 'choir-robe', colors: { primary: pick(CHOIR), secondary: pick(STOLE), pattern: 'plain' }, headwear: 'none' };
      break;
    case 'prayer':
      a = chance(0.6)
        ? { outfit: 'white-garment', colors: { primary: '#f8f8f4', secondary: '#f8f8f4', pattern: 'plain' }, headwear: female ? 'headscarf' : 'none' }
        : sunday();
      break;
    case 'minister':
      a = female
        ? { outfit: pick(['skirt-blouse', 'iro-buba']), colors: { primary: pick(LACE), secondary: pick(['#1e3a8a', '#7f1d1d', '#111827']), pattern: pick(['lace', 'ankara-3']) }, headwear: 'gele' }
        : (chance(0.5)
          ? { outfit: 'suit', colors: { primary: pick(['#111827', '#1f2937', '#1e3a8a']), secondary: pick(['#f8fafc', '#dbeafe']), pattern: 'plain' }, headwear: 'none' }
          : { outfit: pick(['agbada', 'senator']), colors: { primary: pick(AGBADA), secondary: '#c9a227', pattern: 'plain' }, headwear: 'fila' });
      break;
    case 'media':
      a = chance(0.6)
        ? { outfit: 'tshirt-jeans', colors: { primary: pick(['#111827', '#111827', '#1d4ed8', '#7f1d1d']), secondary: pick(['#1e3354', '#1f2937']), pattern: 'plain' }, headwear: chance(0.3) ? 'cap' : 'none', shoes: pick([...SHOES_LIGHT, '#111111']) }
        : casual();
      break;
    case 'hospitality':
      a = { outfit: 'apron', colors: { primary: pick(['#15803d', '#b91c1c', '#1d4ed8', '#c2410c', '#f8fafc']), secondary: pick(TEES), pattern: 'plain' }, headwear: female ? pick(['headscarf', 'headscarf', 'none']) : pick(['cap', 'none']) };
      break;
    case 'children':
      a = female
        ? { outfit: pick(['ankara-gown', 'skirt-blouse']), colors: { primary: pick(ANKARA), secondary: pick(ANKARA_2ND), pattern: pick(['ankara-1', 'ankara-2', 'plain']) }, headwear: pick(['none', 'headscarf']) }
        : casual();
      break;
    case 'visitor':
      a = casual();
      break;
    default:
      a = sunday();
  }

  // Women who cover their hair need a style that fits under the head-tie.
  const headwear = a.headwear || 'none';
  const finalHair = (headwear === 'gele' || headwear === 'headscarf') && female ? 'buns' : hair;
  return normalizeAppearance({
    body, skin, hair: finalHair, beard, hairColor: pick(['#1b1b1b', '#141210', '#201a17', '#1b1b1b']),
    shoes: a.shoes || shoesDark, ...a, headwear,
  });
}
