import { describe, it, expect } from 'vitest';
import { createFilter, LOCAL_INSULTS } from './filter.js';

const f = createFilter();

describe('profanity filter', () => {
  it('masks English profanity with asterisks (same length)', () => {
    expect(f.clean('fuck this')).toBe('**** this');
    expect(f.clean('what a b!tch')).toBe('what a *****');
    expect(f.clean('sh1t happens')).toBe('**** happens');
    expect(f.hasProfanity('bastard')).toBe(true);
  });

  it('masks common Nigerian Pidgin / Yoruba / Igbo / Hausa insults', () => {
    expect(f.clean('You be werey!')).toBe('You be *****!');
    expect(f.clean('mumu!!')).toBe('****!!');
    expect(f.clean('Oponu, come here')).toBe('*****, come here');
    expect(f.clean('na ashawo')).toBe('na ******');
    expect(f.clean('onye ara')).toBe('********');
    expect(f.clean('yeye man')).toBe('********');
    expect(f.clean('dan iska')).toBe('********');
    expect(f.clean('MUMUUU')).toMatch(/^\*{4}/); // stretched letters are caught too
    expect(f.clean('w3rey')).toBe('*****');
  });

  it('every listed local word is caught', () => {
    for (const w of LOCAL_INSULTS) expect(f.hasProfanity(`you ${w}`), w).toBe(true);
  });

  it('leaves clean church talk alone (no false positives)', () => {
    for (const s of [
      'Good morning sir! God bless you 🙏', 'An ode to Lagos', 'Were you at service?', 'The code is in the mode',
      'The fool hath said in his heart, There is no God', 'Grass and cocktails at the reception', 'Assassin\'s Creed',
      'Yeye Oge came to church', 'Tomorrow by 9', 'Scunthorpe', 'Amen! Hallelujah', 'Obodo oyinbo', 'Make we go Ikeja',
    ]) {
      expect(f.clean(s), s).toBe(s);
    }
  });

  it('keeps the rest of the message readable', () => {
    expect(f.clean('Brother, you be mumu but God still love you')).toBe('Brother, you be **** but God still love you');
  });

  it('accepts extra words', () => {
    const g = createFilter({ extra: ['ode buruku'] });
    expect(g.clean('you ode buruku')).toBe('you **********');
  });
});
