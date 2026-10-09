// Snapshot interpolation for remote players. Pure (no three.js) and unit-tested.
//
// The server stamps each 10 Hz `states` frame with its clock (`ts`) and each entry
// with the age of that state, so a sample's time is `ts - age` on the server clock.
// createClockSync maps the local clock to the server clock; createTrack keeps a
// short buffer per player and is sampled ~120 ms in the past, so there is almost
// always a pair of samples to blend between.

const TAU = Math.PI * 2;

/** Shortest-path angle interpolation. */
export function lerpAngle(a, b, f) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * f;
}

/**
 * Tracks offset = serverClock − localClock along the upper envelope of
 * (ts − arrival), i.e. the fastest observed delivery, decaying slowly so a
 * permanent latency change is absorbed within a couple of seconds.
 */
export function createClockSync({ decay = 0.04 } = {}) {
  let offset = 0;
  let ready = false;
  let jitter = 0;
  return {
    /** Feed one observation: server timestamp and the local time it arrived. */
    sample(serverTs, localNow) {
      const off = serverTs - localNow;
      if (!ready) { offset = off; ready = true; jitter = 0; return; }
      const dev = Math.abs(off - offset);
      jitter += (dev - jitter) * 0.1;
      offset = off > offset ? off : offset + (off - offset) * decay;
    },
    /** Estimated server time now. */
    serverNow(localNow) { return localNow + offset; },
    reset() { ready = false; offset = 0; jitter = 0; },
    get ready() { return ready; },
    get offset() { return offset; },
    /** Mean deviation of deliveries (ms) — grows on bumpy networks. */
    get jitter() { return jitter; },
  };
}

/**
 * Interpolation delay for the current network: ~120 ms on a good link,
 * more when deliveries are jittery (capped at 400 ms).
 */
export function interpDelay(jitter, base = 120) {
  return Math.max(base, Math.min(400, base + jitter * 1.5));
}

/**
 * @typedef {{t: number, x: number, y: number, z: number, r: number, a: string}} Sample
 * @typedef {{x: number, y: number, z: number, r: number, a: string, extrapolated: boolean}} Pose
 */

const MOVING = /^(walk|walkFormal|jog|run|jumpStart|jumpLoop|jumpLand)$/;

/**
 * Per-player sample buffer.
 * @param {{max?: number, teleport?: number, maxExtrapolate?: number, canExtrapolate?: (anim: string) => boolean}} [o]
 *   teleport: metres between consecutive samples treated as a jump cut (no blending).
 *   canExtrapolate: only states that are actually moving are pushed forward when samples run late,
 *   so a player who stopped never overshoots.
 */
export function createTrack({ max = 24, teleport = 6, maxExtrapolate = 220, canExtrapolate = (a) => MOVING.test(a) } = {}) {
  /** @type {Sample[]} */
  const buf = [];
  let interval = 100; // EMA of the spacing between this sender's samples (ms)
  /** @type {Pose} */
  const out = { x: 0, y: 0, z: 0, r: 0, a: 'idle', extrapolated: false };

  return {
    get length() { return buf.length; },
    get last() { return buf[buf.length - 1] || null; },
    /** Typical time between samples (ms): ~100 for a healthy sender, more for a slow phone. */
    get interval() { return interval; },
    /** Render delay that keeps a pair of samples to blend for this sender. */
    delay(base) { return Math.min(600, Math.max(base, interval * 1.2)); },
    clear() { buf.length = 0; },

    /** Add a sample (out-of-order or duplicate times are ignored). */
    push(t, x, y, z, r, a) {
      const last = buf[buf.length - 1];
      if (last && t <= last.t) {
        if (t === last.t) Object.assign(last, { x, y, z, r, a });
        return;
      }
      if (last && t - last.t < 2000) interval += (t - last.t - interval) * 0.15;
      buf.push({ t, x, y, z, r, a });
      if (buf.length > max) buf.splice(0, buf.length - max);
    },

    /**
     * Pose at render time `rt` (server clock). Returns null with no samples.
     * Teleports (a jump of more than `teleport` metres) are not blended: the pose
     * holds and then cuts, so callers should skip smoothing when the pose jumps.
     * @param {number} rt
     * @returns {Pose|null}
     */
    sample(rt) {
      if (!buf.length) return null;
      out.extrapolated = false;
      // Drop samples that are well behind, keeping one at or before rt for blending.
      while (buf.length > 2 && buf[1].t <= rt) buf.shift();
      const s0 = buf[0];
      if (rt <= s0.t || buf.length === 1) {
        Object.assign(out, { x: s0.x, y: s0.y, z: s0.z, r: s0.r, a: s0.a });
        return out;
      }
      const s1 = buf[1];
      const dx = s1.x - s0.x, dy = s1.y - s0.y, dz = s1.z - s0.z;
      const jump = dx * dx + dy * dy + dz * dz > teleport * teleport || s1.t - s0.t > 2000;
      if (rt < s1.t) {
        if (jump) {
          Object.assign(out, { x: s0.x, y: s0.y, z: s0.z, r: s0.r, a: s0.a });
          return out;
        }
        const f = (rt - s0.t) / (s1.t - s0.t);
        out.x = s0.x + dx * f;
        out.y = s0.y + dy * f;
        out.z = s0.z + dz * f;
        out.r = lerpAngle(s0.r, s1.r, f);
        out.a = f < 0.5 ? s0.a : s1.a;
        return out;
      }
      // Past the newest sample: extrapolate a little along the last velocity, then hold.
      const dt = s1.t - s0.t;
      const k = !jump && dt > 0 && dt < 400 && canExtrapolate(s1.a) ? Math.min(rt - s1.t, maxExtrapolate) / dt : 0;
      out.x = s1.x + dx * k;
      out.y = s1.y + dy * k;
      out.z = s1.z + dz * k;
      out.r = s1.r;
      out.a = s1.a;
      out.extrapolated = k > 0;
      return out;
    },
  };
}
