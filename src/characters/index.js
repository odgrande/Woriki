// Characters public API (see ARCHITECTURE.md → Characters).
export { loadCharacterKit } from './kit.js';
export { createCharacter } from './character.js';
export {
  randomAppearance, normalizeAppearance, normalizeRole,
  SKIN_TONES, OUTFITS, HEADWEAR, HAIR_STYLES, PATTERNS, ROLES,
} from './appearance.js';
export { STATE_CLIPS, locomotionFor } from './animation.js';
