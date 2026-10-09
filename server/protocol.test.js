import { describe, it, expect } from 'vitest';
import {
  LIMITS, sanitizeName, sanitizeRole, sanitizeRoom, sanitizeAppearance, sanitizeState, sanitizeChatText,
  parseMessage, wrapAngle, cutCodePoints, sanitizeAnim,
} from './protocol.js';

describe('sanitizeName', () => {
  it('keeps letters, digits and simple punctuation, max 20 code points', () => {
    expect(sanitizeName('  Ada   Okafor ')).toBe('Ada Okafor');
    expect(sanitizeName("Bro. Tunde-Ade O'Neil")).toBe("Bro. Tunde-Ade O'Nei");
    expect(sanitizeName('Ọlá Àdìgún')).toBe('Ọlá Àdìgún');
    expect(Array.from(sanitizeName('x'.repeat(50))).length).toBe(LIMITS.name);
  });
  it('strips markup, emoji, control and invisible characters', () => {
    expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(sanitizeName('Ad\u200Ba\u202E')).toBe('Ada');
    expect(sanitizeName('🙏🙏')).toBe('');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName(null)).toBe('');
  });
});

describe('roles, rooms, anims', () => {
  it('only accepts known roles', () => {
    expect(sanitizeRole('usher')).toBe('usher');
    expect(sanitizeRole('admin')).toBe('visitor');
    expect(sanitizeRole(undefined)).toBe('visitor');
  });
  it('rooms are short slugs', () => {
    expect(sanitizeRoom('Yaba')).toBe('yaba');
    expect(sanitizeRoom('ikeja-2')).toBe('ikeja-2');
    expect(sanitizeRoom('../etc')).toBe('yaba');
    expect(sanitizeRoom('x'.repeat(40))).toBe('yaba');
  });
  it('anim states fall back to idle', () => {
    expect(sanitizeAnim('walk')).toBe('walk');
    expect(sanitizeAnim('wave')).toBe('wave');
    expect(sanitizeAnim('moonwalk')).toBe('idle');
  });
});

describe('sanitizeAppearance', () => {
  it('keeps valid fields and clamps numbers', () => {
    const a = sanitizeAppearance({
      body: 'female', skin: 9.4, hair: 'buns', beard: false, hairColor: '#1B1B1B', outfit: 'iro-buba',
      colors: { primary: '#BE185D', secondary: 'red', pattern: 'ankara-3' }, headwear: 'gele', shoes: '#000000', extra: 1,
    });
    expect(a).toEqual({
      body: 'female', skin: 5, hair: 'buns', beard: false, hairColor: '#1b1b1b', outfit: 'iro-buba',
      colors: { primary: '#be185d', pattern: 'ankara-3' }, headwear: 'gele', shoes: '#000000',
    });
  });
  it('drops junk', () => {
    expect(sanitizeAppearance('nope')).toEqual({});
    expect(sanitizeAppearance([1, 2])).toEqual({});
    expect(sanitizeAppearance({ body: 'robot', outfit: '<b>', colors: [] })).toEqual({});
  });
});

describe('sanitizeState', () => {
  it('rounds and clamps positions to the world box', () => {
    expect(sanitizeState({ p: [1.23456, 0, -2.5], r: 1, a: 'walk' })).toEqual({ p: [1.23, 0, -2.5], r: 1, a: 'walk', s: null });
    const s = sanitizeState({ p: [1e9, -1e9, 5], r: 0, a: 'idle' });
    expect(s.p).toEqual([LIMITS.worldHalf, LIMITS.minY, 5]);
  });
  it('wraps yaw and validates seat', () => {
    const s = sanitizeState({ p: [0, 0, 0], r: Math.PI * 3, a: 'sit', s: 12 });
    expect(Math.abs(s.r - Math.PI)).toBeLessThan(0.001);
    expect(s.s).toBe(12);
    expect(sanitizeState({ p: [0, 0, 0], s: -1 }).s).toBe(null);
    expect(sanitizeState({ p: [0, 0, 0], s: 1.5 }).s).toBe(null);
  });
  it('rejects non-finite or malformed positions', () => {
    expect(sanitizeState({ p: [NaN, 0, 0] })).toBe(null);
    expect(sanitizeState({ p: [0, 0] })).toBe(null);
    expect(sanitizeState({ p: ['1', 0, 0] })).toBe(null);
    expect(sanitizeState(null)).toBe(null);
  });
});

describe('sanitizeChatText', () => {
  it('tidies whitespace and caps at 200 code points without splitting emoji', () => {
    expect(sanitizeChatText('  God   bless\n\nyou 🙏 ')).toBe('God bless you 🙏');
    const long = '🙏'.repeat(250);
    const out = sanitizeChatText(long);
    expect(Array.from(out).length).toBe(LIMITS.chat);
    expect(out.endsWith('🙏')).toBe(true);
  });
  it('removes invisible / bidi characters and zalgo', () => {
    expect(sanitizeChatText('he\u200Bllo\u202E')).toBe('hello');
    const z = sanitizeChatText('a' + '\u0301\u0302\u0303\u0304\u0305\u0306');
    expect(z.match(/\p{M}/gu).length).toBeLessThanOrEqual(2); // stacked marks trimmed
    expect(z.startsWith('\u00e1')).toBe(true);
  });
  it('returns empty for non-strings and blank lines', () => {
    expect(sanitizeChatText('   ')).toBe('');
    expect(sanitizeChatText({})).toBe('');
  });
});

describe('parseMessage', () => {
  it('parses JSON objects with a string type', () => {
    expect(parseMessage('{"t":"chat","text":"hi"}')).toEqual({ t: 'chat', text: 'hi' });
    expect(parseMessage(new TextEncoder().encode('{"t":"state"}'))).toEqual({ t: 'state' });
  });
  it('rejects junk, arrays, missing types and oversize frames', () => {
    expect(parseMessage('nope')).toBe(null);
    expect(parseMessage('[1]')).toBe(null);
    expect(parseMessage('{"x":1}')).toBe(null);
    expect(parseMessage(`{"t":"chat","text":"${'a'.repeat(LIMITS.maxPayload)}"}`)).toBe(null);
  });
});

describe('helpers', () => {
  it('wrapAngle maps into (-π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2);
  });
  it('cutCodePoints never splits a surrogate pair', () => {
    expect(cutCodePoints('a🙏b', 2)).toBe('a🙏');
  });
});
