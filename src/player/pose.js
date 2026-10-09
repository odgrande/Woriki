// Small procedural pose fixes applied after the character's mixer + overlays:
// straighten the torso while kneeling in prayer (the only kneel clip is bent over
// "fixing" something), keeping the arms' world directions so the raised-hands
// overlay still points up.
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _d = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _arms = [new THREE.Quaternion(), new THREE.Quaternion()];

/**
 * Rotate a bone by a world-space rotation `delta` (about its own pivot).
 * @param {THREE.Bone} bone @param {THREE.Quaternion} delta
 */
function rotateWorld(bone, delta) {
  bone.parent.getWorldQuaternion(_pq);
  _pqi.copy(_pq).invert();
  // local' = P⁻¹ · Δ · P · local
  _q.copy(_pqi).multiply(delta).multiply(_pq);
  bone.quaternion.premultiply(_q).normalize();
  bone.updateMatrixWorld(true);
}

/** Set a bone's local rotation so its world rotation equals `world`. */
function setWorldQuat(bone, world) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(world)).normalize();
  bone.updateMatrixWorld(true);
}

/**
 * Upright prayer pose over whatever the mixer produced.
 * @param {Record<string, THREE.Bone>} bones character.bones
 * @param {number} heading character rotation.y
 * @param {number} w blend 0..1
 * @param {{lean?: number, headLift?: number, keepArms?: number}} [o] lean: wanted forward lean (rad);
 *   keepArms 0..1: how much the arms keep their world directions (1 while an arm overlay such as
 *   raiseHands runs, 0 to let them follow the straightened torso)
 */
export function applyPrayPose(bones, heading, w, o = {}) {
  if (!bones || w <= 0.001) return;
  const s1 = bones.spine_01, s2 = bones.spine_02, s3 = bones.spine_03, neck = bones.neck_01, head = bones.Head;
  const ua = [bones.upperarm_l, bones.upperarm_r];
  if (!s1 || !s2 || !s3 || !neck || !ua[0] || !ua[1]) return;
  const wantLean = o.lean ?? 0.1;

  s1.updateWorldMatrix(true, true);
  ua[0].getWorldQuaternion(_arms[0]);
  ua[1].getWorldQuaternion(_arms[1]);

  // Current torso lean in the character's forward plane.
  s1.getWorldPosition(_a);
  neck.getWorldPosition(_b);
  _b.sub(_a);
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const fwd = _b.x * fx + _b.z * fz;
  const lean = Math.atan2(fwd, Math.max(1e-3, _b.y));
  const corr = (lean - wantLean) * w;
  if (Math.abs(corr) > 1e-3) {
    // Positive rotation about (cos h, 0, −sin h) tips the torso forward; undo the excess.
    _axis.set(Math.cos(heading), 0, -Math.sin(heading));
    _d.setFromAxisAngle(_axis, -corr / 3);
    rotateWorld(s1, _d);
    rotateWorld(s2, _d);
    rotateWorld(s3, _d);
    // Head: lift a little less than the torso so it stays gently bowed.
    if (head && o.headLift !== 0) {
      _d.setFromAxisAngle(_axis, (o.headLift ?? 0.25) * corr);
      rotateWorld(neck, _d);
    }
  }
  // Arms keep the direction the overlay gave them.
  const k = Math.min(1, Math.max(0, +o.keepArms || 0));
  if (k > 0.001) {
    for (let i = 0; i < 2; i++) {
      ua[i].getWorldQuaternion(_q);
      _q.slerp(_arms[i], k);
      setWorldQuat(ua[i], _q);
    }
  }
}
