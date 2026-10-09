import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { locomotionFor, prepareClips, STATE_CLIPS, ONCE_STATES, LOCO_SPEED } from './animation.js';

const CONTRACT_STATES = ['idle', 'walk', 'walkFormal', 'jog', 'run', 'jumpStart', 'jumpLoop', 'jumpLand', 'sitDown', 'sit', 'standUp', 'sitTalk', 'talk', 'dance',
  'kneel', 'foldArms', 'phone', 'nod', 'shakeHead', 'carry', 'eat', 'drive', 'interact', 'pickup', 'crouch', 'lie'];

describe('state map', () => {
  it('covers every contract state with a clip', () => {
    for (const s of CONTRACT_STATES) expect(STATE_CLIPS[s]).toBeTruthy();
    for (const s of ONCE_STATES) expect(STATE_CLIPS[s]).toBeTruthy();
  });
});

describe('locomotionFor', () => {
  it('stands still at zero', () => {
    expect(locomotionFor(0).state).toBe('idle');
    expect(locomotionFor(-1).state).toBe('idle');
  });
  it('walks at the player walk speed and runs at the player run speed', () => {
    const w = locomotionFor(1.6);
    expect(w.state).toBe('walk');
    expect(w.timeScale).toBeCloseTo(1.6 / LOCO_SPEED.walk, 5);
    const r = locomotionFor(4.5);
    expect(r.state).toBe('run');
    expect(r.timeScale).toBeCloseTo(4.5 / LOCO_SPEED.run, 5);
    expect(locomotionFor(3).state).toBe('jog');
  });
  it('has hysteresis between gaits', () => {
    expect(locomotionFor(2.25, 'walk').state).toBe('walk');
    expect(locomotionFor(2.25, 'idle').state).toBe('jog');
  });
  it('clamps the playback rate', () => {
    expect(locomotionFor(0.2).timeScale).toBeGreaterThanOrEqual(0.55);
    expect(locomotionFor(20).timeScale).toBeLessThanOrEqual(1.7);
  });
});

describe('prepareClips', () => {
  it('keeps rotations, drops scale and non-pelvis translations, scales pelvis motion', () => {
    const clip = new THREE.AnimationClip('Walk_Loop', 1, [
      new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 0, 1, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('spine_01.position', [0, 1], [0, 1, 0, 0, 1, 0]),
      new THREE.VectorKeyframeTrack('spine_01.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
      new THREE.QuaternionKeyframeTrack('spine_01.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const out = prepareClips([clip], 1.1).Walk_Loop;
    const names = out.tracks.map((t) => t.name);
    expect(names).toEqual(['pelvis.position', 'spine_01.quaternion']);
    expect(out.tracks[0].values[2]).toBeCloseTo(1.1, 6);
    expect(clip.tracks[0].values[2]).toBe(1); // source untouched
  });
});
