import { describe, it, expect } from 'vitest';
import { resolveZone, musicMix, reverbFor, footstepParams, ZONE_MAP } from './zones.js';

describe('resolveZone', () => {
  it('accepts zone objects, ids, ambience names and null', () => {
    expect(resolveZone({ id: 'church-hall', ambience: 'church' })).toEqual({ ambience: 'church', placement: 'inside', id: 'church-hall' });
    expect(resolveZone('kitchen')).toEqual({ ambience: 'church', placement: 'adjacent', id: 'kitchen' });
    expect(resolveZone('market')).toMatchObject({ ambience: 'market', placement: 'far' });
    expect(resolveZone('prayer')).toMatchObject({ ambience: 'prayer', placement: 'adjacent' });
    expect(resolveZone('none')).toMatchObject({ ambience: 'none' });
    expect(resolveZone(null)).toMatchObject({ ambience: 'street', placement: 'far' });
    expect(resolveZone({ ambience: 'home' })).toMatchObject({ ambience: 'home', placement: 'far' });
    expect(resolveZone('somewhere-new')).toMatchObject({ ambience: 'street' });
  });

  it('maps every world zone from the architecture', () => {
    for (const id of ['street', 'busstop', 'market', 'gate', 'carpark', 'church-hall', 'altar', 'choir', 'media', 'prayer-room', 'kitchen', 'home']) {
      expect(ZONE_MAP[id]).toBeTruthy();
    }
  });
});

describe('mix rules', () => {
  it('muffles worship music the farther you are from the hall', () => {
    const order = ['inside', 'adjacent', 'compound', 'far'].map(musicMix);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].gain).toBeLessThanOrEqual(order[i - 1].gain);
      expect(order[i].lowpass).toBeLessThan(order[i - 1].lowpass);
    }
  });

  it('gives the church hall the most reverb', () => {
    expect(reverbFor('church')).toBeGreaterThan(reverbFor('street'));
    expect(reverbFor('church')).toBeGreaterThan(reverbFor('prayer'));
  });

  it('makes running louder than walking', () => {
    for (const s of ['asphalt', 'concrete', 'tile', 'carpet', 'wood', 'dirt']) {
      expect(footstepParams(s, true).gain).toBeGreaterThan(footstepParams(s, false).gain);
    }
  });
});
