// Third-person follow camera: orbit with drag, zoom with wheel / pinch, gentle
// auto-follow behind the player while moving, and pull-in on walls so the camera is
// never inside geometry.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * @param {*} ctx engine context (uses ctx.camera)
 * @param {*} [input] from createInput (lookDelta, zoomDelta, looking, lastLookAt, touch)
 * @param {{yaw?: number, pitch?: number, distance?: number, targetHeight?: number,
 *          minDistance?: number, maxDistance?: number, fovKick?: boolean}} [opts]
 */
export function createFollowCamera(ctx, input, opts = {}) {
  const camera = ctx.camera;
  const baseFov = camera.fov || 55;
  const DEFAULT_PITCH = opts.pitch ?? 0.3;

  const pivot = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const hits = [];
  let snapped = false;
  // Portrait phones see less around the player: start a little further out.
  const startDist = opts.distance ?? ((camera.aspect || 1) < 0.8 ? 6 : 5.2);
  let current = startDist; // distance after collision / smoothing
  let lift = 0; // extra pitch used to rise over walls behind the player
  let fov = baseFov;
  let speedAvg = 0;

  const cam = {
    /** Orbit angle around +Y. 0 = camera on the +Z side looking towards −Z. */
    yaw: opts.yaw ?? 0,
    /** Elevation angle (rad). Positive = above the player looking down. */
    pitch: DEFAULT_PITCH,
    /** Wanted distance from the pivot (zoom), 2.5–9 m. */
    distance: startDist,
    minDistance: opts.minDistance ?? 2.5,
    maxDistance: opts.maxDistance ?? 9,
    minPitch: -0.42,
    maxPitch: 1.22,
    /** Pivot height above the target's feet. */
    targetHeight: opts.targetHeight ?? 1.5,
    /** Radians per dragged pixel. */
    sensitivity: 0.0052,
    touchSensitivity: 0.0072,
    /** Rotate gently behind the player while they move. */
    autoFollow: true,
    /** Auto-follow rate (1/s) at running speed. */
    followStrength: 0.6,
    /** Widen the view a little when running. */
    fovKick: opts.fovKick ?? true,
    /** Distance actually used this frame (after wall pull-in). */
    get currentDistance() { return current; },
    /** The point the camera looks at. */
    pivot,
    object: camera,

    /** Forward direction on XZ (where the camera looks). */
    forward(out = new THREE.Vector3()) { return out.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)); },
    /** Right direction on XZ. */
    right(out = new THREE.Vector3()) { return out.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)); },
    /**
     * Camera-relative movement: input {x right, y forward} → world XZ vector (same length).
     * @param {{x: number, y: number}} move
     */
    moveDir(move, out = new THREE.Vector3()) {
      const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
      return out.set(c * move.x - s * move.y, 0, -s * move.x - c * move.y);
    },
    /** Put the camera straight behind a heading (rotation.y of a character). */
    behind(rotY) { cam.yaw = wrap(rotY + Math.PI); },
    /** Skip smoothing on the next update (after a teleport). */
    snap() { snapped = false; },

    /**
     * @param {number} dt seconds
     * @param {THREE.Vector3} target feet position of the player
     * @param {*} [physics] from createPhysics (raycast, groundHeight, blockers)
     */
    update(dt, target, physics) {
      dt = Math.min(Math.max(dt, 0), 0.1);
      // ---- input
      if (input) {
        const { dx, dy } = input.lookDelta();
        const sens = input.touch ? cam.touchSensitivity : cam.sensitivity;
        cam.yaw = wrap(cam.yaw - dx * sens);
        cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * sens, cam.minPitch, cam.maxPitch);
        const z = input.zoomDelta();
        if (z) cam.distance = THREE.MathUtils.clamp(cam.distance * Math.pow(1.12, z), cam.minDistance, cam.maxDistance);
      }
      cam.distance = THREE.MathUtils.clamp(cam.distance, cam.minDistance, cam.maxDistance);

      // ---- follow the target
      if (!snapped) {
        pivot.set(target.x, target.y + cam.targetHeight, target.z);
        lastTarget.copy(target);
        current = cam.distance;
        snapped = true;
      }
      const vx = dt > 0 ? (target.x - lastTarget.x) / dt : 0;
      const vz = dt > 0 ? (target.z - lastTarget.z) / dt : 0;
      let speed = Math.hypot(vx, vz);
      if (speed > 20) speed = 0; // teleport
      lastTarget.copy(target);
      speedAvg += (speed - speedAvg) * damp(6, dt);

      const kx = damp(11, dt), ky = damp(6.5, dt);
      pivot.x += (target.x - pivot.x) * kx;
      pivot.z += (target.z - pivot.z) * kx;
      pivot.y += (target.y + cam.targetHeight - pivot.y) * ky;
      // never let the pivot drift far (fast moves)
      if (Math.hypot(target.x - pivot.x, target.z - pivot.z) > 2.5) { pivot.x = target.x; pivot.z = target.z; }

      // ---- auto-follow: swing gently behind the movement direction
      const lookingRecently = input && (input.looking || performance.now() - input.lastLookAt < 1400);
      if (cam.autoFollow && !lookingRecently && speedAvg > 0.6 && speed > 0.3) {
        const want = Math.atan2(vx, vz) + Math.PI;
        const diff = wrap(want - cam.yaw);
        // only when moving away or sideways (running at the camera must not spin it)
        if (Math.abs(diff) < 2.0) {
          // ≈ 55°/s when running sideways, ≈ 20°/s walking; nothing when moving straight away
          const strength = THREE.MathUtils.clamp(speedAvg / 4.5, 0.35, 1) * cam.followStrength;
          const fade = Math.abs(diff) > 1.6 ? (2.0 - Math.abs(diff)) / 0.4 : 1;
          cam.yaw = wrap(cam.yaw + diff * damp(strength * fade, dt));
        }
        cam.pitch += (DEFAULT_PITCH - cam.pitch) * damp(0.35, dt);
      }

      // ---- collision: pull in on walls (5 parallel rays ≈ the near plane) + mesh blockers.
      // In tight spots (a wall right behind you) also try looking down from higher up and keep
      // whichever angle leaves the camera farther away, so it never ends up in your face.
      const corners = [[0, 0], [0.22, 0.14], [-0.22, 0.14], [0.22, -0.14], [-0.22, -0.14]];
      const clearance = (pitch, wantDist) => {
        const cpp = Math.cos(pitch);
        dir.set(Math.sin(cam.yaw) * cpp, Math.sin(pitch), Math.cos(cam.yaw) * cpp).normalize();
        side.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
        up.crossVectors(side, dir).normalize();
        let hit = wantDist;
        if (typeof physics.raycast === 'function') {
          for (const [sx, sy] of corners) {
            origin.copy(pivot).addScaledVector(side, sx).addScaledVector(up, sy);
            const t = physics.raycast(origin, dir, wantDist + 0.3, { camera: true });
            if (t - 0.3 < hit) hit = t - 0.3;
          }
        }
        if (physics.blockers?.length) {
          raycaster.set(pivot, dir);
          raycaster.near = 0;
          raycaster.far = wantDist + 0.3;
          hits.length = 0;
          raycaster.intersectObjects(physics.blockers, true, hits);
          if (hits.length) hit = Math.min(hit, hits[0].distance - 0.3);
        }
        return hit;
      };
      let want = cam.distance;
      let liftTarget = 0;
      if (physics) {
        let hit = clearance(cam.pitch, want);
        if (hit < Math.min(1.8, want)) {
          for (const extra of [0.35, 0.7, 1.0]) {
            const p2 = Math.min(cam.maxPitch ?? 1.3, cam.pitch + extra);
            const h2 = clearance(p2, want);
            if (h2 > hit + 0.4) { hit = h2; liftTarget = p2 - cam.pitch; }
            if (hit >= Math.min(1.8, want)) break;
          }
        }
        want = Math.max(0.45, Math.min(want, hit));
      }
      lift += (liftTarget - lift) * damp(liftTarget > lift ? 6 : 2.5, dt);
      const pitchNow = cam.pitch + lift;
      const cp = Math.cos(pitchNow);
      offset.set(Math.sin(cam.yaw) * cp, Math.sin(pitchNow), Math.cos(cam.yaw) * cp);
      // pull in at once, ease back out
      if (want < current) current = want;
      else current += (want - current) * damp(3.2, dt);

      desired.copy(pivot).addScaledVector(offset, current);
      // keep above the ground
      if (physics?.groundHeight) {
        const g = physics.groundHeight(desired.x, desired.z);
        if (desired.y < g + 0.3) desired.y = g + 0.3;
      }
      camera.position.copy(desired);
      camera.lookAt(pivot);

      // ---- field of view: wider on portrait screens, a small kick when running
      const aspect = camera.aspect || 1;
      const portrait = aspect < 1 ? (1 - aspect) * 18 : 0;
      const kick = cam.fovKick ? THREE.MathUtils.clamp((speedAvg - 2.5) / 2, 0, 1) * 4 : 0;
      const wantFov = baseFov + portrait + kick;
      fov += (wantFov - fov) * damp(4, dt);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
  return cam;
}
