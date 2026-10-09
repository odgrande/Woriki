// Animation: clip preparation per body, state → clip mapping, crossfades, locomotion
// speed matching and procedural upper-body overlays (wave, clap, raise hands).
import * as THREE from 'three';

/** Contract state → clip name. */
export const STATE_CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', walkFormal: 'Walk_Formal_Loop', jog: 'Jog_Fwd_Loop', run: 'Sprint_Loop',
  jumpStart: 'Jump_Start', jumpLoop: 'Jump_Loop', jumpLand: 'Jump_Land',
  sitDown: 'Sitting_Enter', sit: 'Sitting_Idle_Loop', standUp: 'Sitting_Exit', sitTalk: 'Sitting_Talking_Loop',
  talk: 'Idle_Talking_Loop', dance: 'Dance_Loop', kneel: 'Fixing_Kneeling', foldArms: 'Idle_FoldArms_Loop',
  phone: 'Idle_TalkingPhone_Loop', nod: 'Yes', shakeHead: 'Idle_No_Loop', carry: 'Walk_Carry_Loop', eat: 'Consume',
  drive: 'Driving_Loop', interact: 'Interact', pickup: 'PickUp_Table', crouch: 'Crouch_Idle_Loop', lie: 'LayToIdle',
};
/** States that play once and hold their last frame. */
export const ONCE_STATES = new Set(['jumpStart', 'jumpLand', 'sitDown', 'standUp', 'nod', 'interact', 'pickup', 'eat', 'lie']);
export const LOCO_STATES = new Set(['idle', 'walk', 'jog', 'run']);

/**
 * Ground speed (m/s) each locomotion clip matches at timeScale 1. Walk is measured from the
 * planted toe (1.03 m/s); jog and sprint have long flight phases, so these are tuned values.
 */
export const LOCO_SPEED = { walk: 1.05, jog: 3.4, run: 5.8 };

/**
 * Locomotion state for a speed, with hysteresis around the current state.
 * @param {number} speed m/s
 * @param {string} [current]
 * @returns {{state: string, timeScale: number}}
 */
export function locomotionFor(speed, current = 'idle') {
  const s = Math.max(0, speed || 0);
  const h = (state) => (current === state ? 0.15 : 0);
  let state;
  if (s < 0.08 + (current === 'idle' ? 0.04 : 0)) state = 'idle';
  else if (s < 2.2 + h('walk') - h('jog')) state = 'walk';
  else if (s < 4.2 + h('jog') - h('run')) state = 'jog';
  else state = 'run';
  if (state === 'idle') return { state, timeScale: 1 };
  const ts = s / LOCO_SPEED[state];
  return { state, timeScale: Math.max(0.55, Math.min(1.7, ts)) };
}

/**
 * Prepare clips for one body: keep bone rotations, drop scale tracks and every
 * translation except the pelvis (scaled to this body's leg length).
 * @param {THREE.AnimationClip[]} clips
 * @param {number} ratio body pelvis height / animation rig pelvis height
 */
export function prepareClips(clips, ratio) {
  const out = {};
  for (const clip of clips) {
    const tracks = [];
    for (const t of clip.tracks) {
      if (t.name.endsWith('.scale')) continue;
      if (t.name.endsWith('.position')) {
        if (!t.name.startsWith('pelvis.')) continue;
        const c = t.clone();
        for (let i = 0; i < c.values.length; i++) c.values[i] *= ratio;
        tracks.push(c);
        continue;
      }
      tracks.push(t);
    }
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  return out;
}

// --- Procedural overlays -----------------------------------------------------

const Y = new THREE.Vector3(0, 1, 0);
const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _tq = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();

function worldQuat(obj, out) {
  obj.updateWorldMatrix(true, false);
  obj.matrixWorld.decompose(_p, out, _s);
  return out;
}

/**
 * Rotate `bone` so its +Y axis points along `dirWorld` (and optionally its palm axis
 * towards `palmWorld`), blended by weight w over the animated pose.
 */
function aimBone(bone, dirWorld, w, palmLocal = null, palmWorld = null) {
  worldQuat(bone.parent, _pq);
  _wq.copy(_pq).multiply(bone.quaternion);
  if (palmLocal && palmWorld) {
    // Full orientation from an orthonormal basis: Y = along, palmLocal → palmWorld.
    _a.copy(dirWorld).normalize();
    _z.copy(palmWorld).addScaledVector(_a, -palmWorld.dot(_a)).normalize();
    _x.crossVectors(_a, _z);
    _m.makeBasis(_x, _a, _z); // world basis (x, along, palm)
    const pl = palmLocal;
    const xl = new THREE.Vector3().crossVectors(Y, pl);
    _m2.makeBasis(xl, Y, pl).transpose();
    _tq.setFromRotationMatrix(_m.multiply(_m2));
  } else {
    _a.copy(Y).applyQuaternion(_wq);
    _tq.setFromUnitVectors(_a, _d.copy(dirWorld).normalize()).multiply(_wq);
  }
  _tq.premultiply(_pq.invert());
  bone.quaternion.slerp(_tq, w);
  bone.updateMatrixWorld(true);
}

/**
 * Overlay controller for one character.
 * @param {Record<string, THREE.Bone>} bones
 * @param {THREE.Object3D} root the character object (for yaw)
 * @param {{l: THREE.Vector3, r: THREE.Vector3}} palm local palm-normal axes per hand
 */
export function createOverlays(bones, root, palm) {
  const active = [];
  // Finger bones and their rest (open-hand T-pose) rotations, for relaxing the clips' fists.
  const fingers = Object.values(bones).filter((b) => /^(index|middle|ring|pinky|thumb)_0[123]_[lr]$/.test(b.name));
  const fingerRest = fingers.map((b) => b.quaternion.clone());
  const rootQ = new THREE.Quaternion();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const dirs = { upper: v(0, 0, 0), lower: v(0, 0, 0), palm: v(0, 0, 0) };

  /** Character-space directions (left side; x is mirrored for the right). */
  const poses = {
    wave(t, side) {
      if (side === 'l') return null;
      const osc = Math.sin(t * Math.PI * 2 * 1.6);
      dirs.upper.set(0.62, 0.62, 0.32);
      dirs.lower.set(0.16 + osc * 0.42, 0.95, 0.12);
      dirs.palm.set(0, 0.1, 1);
      return dirs;
    },
    clap(t) {
      const c = Math.pow(Math.max(0, Math.cos(t * Math.PI * 2 * 1.9)), 3); // 1 = hands together
      dirs.upper.set(0.22, -0.42, 0.78);
      dirs.lower.set(-0.38 - 0.28 * c, 0.42, 0.72);
      dirs.palm.set(-1, 0.1, 0.25);
      return dirs;
    },
    raiseHands(t, side) {
      const sw = Math.sin(t * 1.6 + (side === 'l' ? 0 : 1.2)) * 0.07;
      dirs.upper.set(0.42, 0.88, 0.16);
      dirs.lower.set(0.2 + sw, 0.97, 0.14);
      dirs.palm.set(0.05, 0.25, 1);
      return dirs;
    },
  };

  const cw = new THREE.Vector3(), lw = new THREE.Vector3(), pw = new THREE.Vector3();
  function applySide(kind, t, side, w) {
    const d = poses[kind](t, side);
    if (!d) return;
    const sx = side === 'l' ? 1 : -1;
    cw.set(d.upper.x * sx, d.upper.y, d.upper.z).applyQuaternion(rootQ);
    lw.set(d.lower.x * sx, d.lower.y, d.lower.z).applyQuaternion(rootQ);
    pw.set(d.palm.x * sx, d.palm.y, d.palm.z).applyQuaternion(rootQ).normalize();
    aimBone(bones[`upperarm_${side}`], cw, w);
    aimBone(bones[`lowerarm_${side}`], lw, w, palm[side], pw);
    aimBone(bones[`hand_${side}`], lw, w * 0.9, palm[side], pw);
  }

  return {
    start(kind, seconds) {
      const ex = active.find((o) => o.kind === kind);
      if (ex) { ex.dur = Math.max(ex.dur, ex.t + seconds); return; }
      // only one arm overlay at a time: replace others
      active.length = 0;
      active.push({ kind, t: 0, dur: Math.max(0.6, seconds) });
    },
    get active() { return active.length ? active[0].kind : null; },
    stop() { for (const o of active) o.dur = Math.min(o.dur, o.t + 0.3); },
    /**
     * @param {number} dt
     * @param {number} [relax] 0..1 how much to open the animation's fists (natural, calm hands)
     */
    update(dt, relax = 0) {
      let open = relax;
      if (active.length) {
        const o = active[0];
        const w = Math.min(1, o.t / 0.3, Math.max(0, (o.dur - o.t) / 0.35));
        open = Math.max(open, 0.9 * w);
      }
      if (open > 0.01) for (let i = 0; i < fingers.length; i++) fingers[i].quaternion.slerp(fingerRest[i], open);
      if (!active.length) return;
      root.updateWorldMatrix(true, false);
      root.matrixWorld.decompose(_p, rootQ, _s);
      for (let i = active.length - 1; i >= 0; i--) {
        const o = active[i];
        o.t += dt;
        if (o.t >= o.dur) { active.splice(i, 1); continue; }
        const fadeIn = Math.min(1, o.t / 0.3), fadeOut = Math.min(1, (o.dur - o.t) / 0.35);
        const w = Math.min(fadeIn, fadeOut);
        const e = w * w * (3 - 2 * w);
        applySide(o.kind, o.t, 'r', e);
        applySide(o.kind, o.t, 'l', e);
      }
    },
  };
}
