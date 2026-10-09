import { describe, it, expect } from 'vitest';
import { newState, migrate, readSave, writeSave, clearSave, SAVE_KEY, LEGACY_SAVE_KEY, SAVE_VERSION, saveSummary } from './state.js';
import { START_T } from './clock.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m,
  };
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

describe('state', () => {
  it('creates a fresh life from a profile', () => {
    const s = newState({ name: '  Ada <b> ', role: 'usher', tradition: 'baptist', appearance: { body: 'female' } }, { rng: () => 0.1 });
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.name).toBe('Ada b');
    expect(s.role).toBe('usher');
    expect(s.tradition).toBe('baptist');
    expect(s.start).toBe('home');
    expect(s.T).toBe(START_T);
    expect(s.energy).toBe(100);
    expect(s.appearance.body).toBe('female');
    expect(s.log.length).toBe(1);
  });

  it('falls back to safe defaults for bad profiles', () => {
    const s = newState({ role: 'pope', tradition: 'x' }, { rng: () => 0.9 });
    expect(s.role).toBe('worshipper');
    expect(s.tradition).toBe('pentecostal');
    expect(s.name).toBe('Tunde');
    expect(s.start).toBe('convert');
  });

  it('saves, loads and clears (versioned)', () => {
    const st = memoryStorage();
    const s = newState({ name: 'Kunle', role: 'choir' });
    s.naira = 1234;
    expect(writeSave(s, st)).toBe(true);
    const raw = JSON.parse(st.getItem(SAVE_KEY));
    expect(raw.v).toBe(SAVE_VERSION);
    const back = readSave(st);
    expect(back.name).toBe('Kunle');
    expect(back.naira).toBe(1234);
    clearSave(st);
    expect(readSave(st)).toBeNull();
  });

  it('never throws when storage is blocked or corrupt', () => {
    expect(writeSave(newState({}), throwing)).toBe(false);
    expect(readSave(throwing)).toBeNull();
    expect(() => clearSave(throwing)).not.toThrow();
    const st = memoryStorage();
    st.setItem(SAVE_KEY, '{not json');
    expect(readSave(st)).toBeNull();
    expect(readSave(null)).toBeNull();
  });

  it('fills fields added since an older save and clamps bad numbers', () => {
    const s = newState({ name: 'Emeka' });
    delete s.pending;
    s.faith = 500;
    s.naira = 'lots';
    const m = migrate({ v: 2, state: s });
    expect(m.pending).toEqual([]);
    expect(m.faith).toBe(100);
    expect(typeof m.naira).toBe('number');
  });

  it('migrates the legacy prototype save (amencity.v1)', () => {
    const st = memoryStorage();
    st.setItem(LEGACY_SAVE_KEY, JSON.stringify({ name: 'Bisi', church: 'Grace', ctype: 'aladura', role: 'media', funds: 25000, faith: 44, word: 12, character: 51, day: 9, points: 70, items: { mat: true }, stage: 1, streak: 2, log: [] }));
    const s = readSave(st);
    expect(s.name).toBe('Bisi');
    expect(s.tradition).toBe('aladura');
    expect(s.naira).toBe(25000);
    expect(s.items.mat).toBe(true);
    expect(s.day).toBe(9);
    expect(saveSummary(s)).toMatchObject({ name: 'Bisi', roleName: 'Media & Sound' });
  });

  it('rejects saves from a newer version', () => {
    expect(migrate({ v: 99, state: { v: 99, name: 'x' } })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});
