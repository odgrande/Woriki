import { describe, it, expect } from 'vitest';
import {
  normalizeAppearance, randomAppearance, normalizeRole,
  OUTFITS, HEADWEAR, HAIR_STYLES, PATTERNS, SKIN_TONES, ROLES,
} from './appearance.js';

function seeded(seed) {
  let t = seed >>> 0;
  return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
}

describe('normalizeAppearance', () => {
  it('fills every field with defaults', () => {
    const a = normalizeAppearance();
    expect(a.body).toBe('male');
    expect(a.skin).toBe(3);
    expect(OUTFITS).toContain(a.outfit);
    expect(a.colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(PATTERNS).toContain(a.colors.pattern);
    expect(a.headwear).toBe('none');
    expect(a.hairColor).toBe('#1b1b1b');
  });
  it('clamps and validates', () => {
    const a = normalizeAppearance({ body: 'robot', skin: 99, hair: 'mohawk', outfit: 'cape', headwear: 'crown', colors: { primary: 'red', pattern: 'tartan' } });
    expect(a.body).toBe('male');
    expect(a.skin).toBe(5);
    expect(HAIR_STYLES).toContain(a.hair);
    expect(OUTFITS).toContain(a.outfit);
    expect(a.headwear).toBe('none');
    expect(a.colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(PATTERNS).toContain(a.colors.pattern);
    expect(normalizeAppearance({ skin: -3 }).skin).toBe(0);
  });
  it('never gives a woman a beard', () => {
    expect(normalizeAppearance({ body: 'female', beard: true }).beard).toBe(false);
    expect(normalizeAppearance({ body: 'male', beard: true }).beard).toBe(true);
  });
  it('has six skin tones from light to deep (decreasing luminance)', () => {
    expect(SKIN_TONES).toHaveLength(6);
    const lum = SKIN_TONES.map((h) => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); });
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1]);
  });
});

describe('normalizeRole', () => {
  it('maps UI labels onto role ids', () => {
    expect(normalizeRole('Prayer Warrior')).toBe('prayer');
    expect(normalizeRole("Children's teacher")).toBe('children');
    expect(normalizeRole('Pastor')).toBe('minister');
    expect(normalizeRole('Security')).toBe('security');
    expect(normalizeRole('nonsense')).toBe(null);
  });
});

describe('randomAppearance', () => {
  it('is deterministic for a seeded rng and always valid', () => {
    const a = randomAppearance(seeded(42));
    const b = randomAppearance(seeded(42));
    expect(a).toEqual(b);
    const rng = seeded(7);
    for (let i = 0; i < 300; i++) {
      const x = randomAppearance(rng, ROLES[i % ROLES.length]);
      expect(normalizeAppearance(x)).toEqual(x);
      if (x.body === 'female') expect(x.beard).toBe(false);
      if (x.headwear === 'gele' || x.headwear === 'headscarf') expect(x.hair === 'buns' || x.body === 'male').toBe(true);
    }
  });
  it('dresses roles appropriately', () => {
    const rng = seeded(3);
    for (let i = 0; i < 40; i++) {
      const s = randomAppearance(rng, 'security');
      expect(s.outfit).toBe('security');
      expect(s.headwear).toBe('beret');
      expect(randomAppearance(rng, 'usher').outfit).toBe('usher');
      expect(randomAppearance(rng, 'choir').outfit).toBe('choir-robe');
      expect(randomAppearance(rng, 'hospitality').outfit).toBe('apron');
    }
  });
  it('dresses most prayer warriors in Aladura white, barefoot style', () => {
    const rng = seeded(11);
    let white = 0;
    for (let i = 0; i < 200; i++) if (randomAppearance(rng, 'prayer').outfit === 'white-garment') white++;
    expect(white).toBeGreaterThan(80);
  });
  it('produces a varied Sunday crowd', () => {
    const rng = seeded(99);
    const outfits = new Set(), skins = new Set(), heads = new Set();
    for (let i = 0; i < 300; i++) { const a = randomAppearance(rng, 'worshipper'); outfits.add(a.outfit); skins.add(a.skin); heads.add(a.headwear); }
    expect(outfits.size).toBeGreaterThanOrEqual(7);
    expect(skins.size).toBe(6);
    expect(heads.has('gele')).toBe(true);
    expect(heads.has('fila')).toBe(true);
  });
  it('keeps men out of gowns and women out of agbada', () => {
    const rng = seeded(5);
    for (let i = 0; i < 300; i++) {
      const a = randomAppearance(rng, ROLES[i % ROLES.length]);
      if (a.body === 'male') expect(['ankara-gown', 'skirt-blouse', 'iro-buba']).not.toContain(a.outfit);
      if (a.body === 'female') expect(['agbada', 'senator', 'suit']).not.toContain(a.outfit);
    }
  });
  it('only uses known headwear', () => {
    const rng = seeded(1);
    for (let i = 0; i < 100; i++) expect(HEADWEAR).toContain(randomAppearance(rng).headwear);
  });
});
