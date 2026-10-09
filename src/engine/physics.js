// Collisions for characters: a vertical capsule sliding against boxes and cylinders,
// stepping up small ledges, standing on a ground function (terrain + raised floors)
// and on the tops of low boxes. Cheap enough for the player plus a crowd of NPCs:
// colliders live in a uniform grid and every query works on a small candidate list.
//
// Conventions: metres, +Y up. A capsule is described by its feet position (bottom
// centre), radius and height. Collision is resolved on XZ (circle vs rectangle /
// circle); Y comes from the ground and from the tops of colliders that are low
// enough to step onto.
import * as THREE from 'three';

/** Highest ledge a capsule climbs without jumping (m). */
export const STEP_HEIGHT = 0.35;
/** Largest XZ distance moved per sub-step, as a fraction of the radius (prevents tunnelling). */
const SUBSTEP_FRACTION = 0.45;
const MAX_SUBSTEPS = 1024;
const EPS = 1e-4;
/** Kinds nobody should stand on (jumping onto pews, tables or cars looks wrong). */
export const NON_WALKABLE = new Set(['furniture', 'vehicle', 'counter', 'prop', 'hedge', 'kiosk', 'pew', 'table']);
/** Kinds the follow camera passes through by default (small or moving things). */
export const CAMERA_IGNORE = new Set(['furniture', 'vehicle', 'counter', 'prop', 'hedge', 'pew', 'table', 'post', 'step', 'stairs']);

/**
 * @typedef {object} Collider
 * @property {number} id
 * @property {'box'|'cylinder'} type
 * @property {string} kind      e.g. 'wall', 'furniture', 'post' (free text from the caller)
 * @property {number} minX @property {number} minY @property {number} minZ
 * @property {number} maxX @property {number} maxY @property {number} maxZ  world AABB
 * @property {number} cx @property {number} cz centre on XZ
 * @property {number} hx @property {number} hz half extents (box, in its own frame)
 * @property {number} r  radius (cylinder)
 * @property {number} cos @property {number} sin rotation about Y (box)
 * @property {boolean} camera  whether the follow camera treats it as a blocker
 * @property {boolean} walk    whether a capsule can stand on its top (else it is a wall at any height)
 * @property {THREE.Vector3} [min] @property {THREE.Vector3} [max] as given (box)
 */

/**
 * Create a collision world.
 * @param {{cellSize?: number}} [opts]
 */
export function createPhysics(opts = {}) {
  const CELL = opts.cellSize ?? 4;
  const INV = 1 / CELL;
  /** @type {Map<number, Collider[]>} */
  const grid = new Map();
  /** @type {Collider[]} */
  const colliders = [];
  let nextId = 1;
  let stamp = 1;
  /** @type {(x: number, z: number) => number} */
  let groundFn = () => 0;

  const key = (ix, iz) => ((ix + 32768) & 0xffff) | (((iz + 32768) & 0xffff) << 16);

  function cellsOf(c, fn) {
    const ix0 = Math.floor(c.minX * INV), ix1 = Math.floor(c.maxX * INV);
    const iz0 = Math.floor(c.minZ * INV), iz1 = Math.floor(c.maxZ * INV);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) fn(key(ix, iz));
  }
  function insert(c) {
    cellsOf(c, (k) => { let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(c); });
  }
  function unindex(c) {
    cellsOf(c, (k) => { const a = grid.get(k); if (!a) return; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); if (!a.length) grid.delete(k); });
  }

  const found = [];
  /** Colliders whose AABB may touch the XZ rectangle. Returns a shared array. */
  function query(minX, minZ, maxX, maxZ) {
    found.length = 0;
    stamp++;
    const ix0 = Math.floor(minX * INV), ix1 = Math.floor(maxX * INV);
    const iz0 = Math.floor(minZ * INV), iz1 = Math.floor(maxZ * INV);
    // Very long queries (huge frame spikes) fall back to a linear scan.
    if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > 256) {
      for (const c of colliders) if (c.maxX >= minX && c.minX <= maxX && c.maxZ >= minZ && c.minZ <= maxZ) found.push(c);
      return found;
    }
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const a = grid.get(key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const c = a[i];
          if (c.q === stamp) continue;
          c.q = stamp;
          if (c.maxX >= minX && c.minX <= maxX && c.maxZ >= minZ && c.minZ <= maxZ) found.push(c);
        }
      }
    }
    return found;
  }

  // ---------------------------------------------------------------- shape tests

  /** Signed-ish XZ test: does a circle at (x, z) with radius r touch collider c? */
  function circleTouches(c, x, z, r) {
    if (c.type === 'cylinder') {
      const dx = x - c.cx, dz = z - c.cz, rr = r + c.r;
      return dx * dx + dz * dz < rr * rr;
    }
    let lx = x - c.cx, lz = z - c.cz;
    if (c.sin !== 0) { const t = lx * c.cos - lz * c.sin; lz = lx * c.sin + lz * c.cos; lx = t; }
    const qx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
    const qz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
    const dx = lx - qx, dz = lz - qz;
    return dx * dx + dz * dz < r * r;
  }

  const push = { x: 0, z: 0, nx: 0, nz: 0, hit: false };
  /** Push a circle out of collider c on XZ. Writes the corrected centre into `push`. */
  function pushOut(c, x, z, r) {
    push.hit = false; push.x = x; push.z = z;
    if (c.type === 'cylinder') {
      const dx = x - c.cx, dz = z - c.cz, rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return push;
      const d = Math.sqrt(d2);
      const nx = d > 1e-9 ? dx / d : 1, nz = d > 1e-9 ? dz / d : 0;
      push.x = c.cx + nx * rr; push.z = c.cz + nz * rr; push.nx = nx; push.nz = nz; push.hit = true;
      return push;
    }
    let lx = x - c.cx, lz = z - c.cz;
    const rot = c.sin !== 0;
    if (rot) { const t = lx * c.cos - lz * c.sin; lz = lx * c.sin + lz * c.cos; lx = t; }
    const qx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
    const qz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
    let dx = lx - qx, dz = lz - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return push;
    let nx, nz;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nx = dx / d; nz = dz / d;
      lx = qx + nx * r; lz = qz + nz * r;
    } else {
      // Centre inside the rectangle: leave through the nearest face.
      const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
      if (px < pz) { nx = lx >= 0 ? 1 : -1; nz = 0; lx = nx * (c.hx + r); }
      else { nz = lz >= 0 ? 1 : -1; nx = 0; lz = nz * (c.hz + r); }
    }
    if (rot) {
      const t = lx * c.cos + lz * c.sin; lz = -lx * c.sin + lz * c.cos; lx = t;
      const tn = nx * c.cos + nz * c.sin; nz = -nx * c.sin + nz * c.cos; nx = tn;
    }
    push.x = c.cx + lx; push.z = c.cz + lz; push.nx = nx; push.nz = nz; push.hit = true;
    return push;
  }

  /**
   * Highest support under a footprint: the ground function, or the top of any collider
   * whose top is at or below `maxTop` and that the footprint overlaps.
   */
  function supportAt(x, z, maxTop, footR, list) {
    let g = groundFn(x, z);
    if (!Number.isFinite(g)) g = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.walk || c.maxY > maxTop + EPS || c.maxY <= g) continue;
      if (circleTouches(c, x, z, footR)) g = c.maxY;
    }
    return g;
  }

  const info = {
    /** Standing on something after the last moveCapsule. */
    grounded: false,
    /** Support height under the capsule after the last move. */
    ground: 0,
    /** Hit a wall (XZ) during the last move. */
    hitWall: false,
    /** Last wall normal on XZ (unit) when hitWall. */
    normal: new THREE.Vector3(),
    /** Head hit a ceiling during the last move (caller should zero upward velocity). */
    ceiling: false,
    /** Climbed a ledge (y rose by more than 5 cm without jumping). */
    stepped: false,
  };

  const physics = {
    /** Camera blockers (meshes) the follow camera may raycast against. */
    blockers: /** @type {THREE.Object3D[]} */ ([]),
    /** All colliders (read-only). */
    colliders,
    /** Contact info from the most recent moveCapsule call. */
    last: info,
    STEP_HEIGHT,

    /**
     * Axis-aligned box (optionally rotated about Y around its centre).
     * @param {THREE.Vector3} min
     * @param {THREE.Vector3} max
     * @param {{kind?: string, rotY?: number, camera?: boolean, walkable?: boolean}} [o]
     *   camera: whether the follow camera pulls in on it (default: true unless kind is in CAMERA_IGNORE).
     *   walkable: whether its top can be stood on (default: true unless kind is in NON_WALKABLE).
     * @returns {Collider}
     */
    addBox(min, max, o = {}) {
      const x0 = Math.min(min.x, max.x), x1 = Math.max(min.x, max.x);
      const y0 = Math.min(min.y, max.y), y1 = Math.max(min.y, max.y);
      const z0 = Math.min(min.z, max.z), z1 = Math.max(min.z, max.z);
      const rotY = o.rotY || 0;
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // World AABB of the (possibly rotated) footprint.
      const ex = Math.abs(hx * cos) + Math.abs(hz * sin), ez = Math.abs(hx * sin) + Math.abs(hz * cos);
      /** @type {Collider} */
      const c = {
        id: nextId++, type: 'box', kind: o.kind || 'solid',
        minX: cx - ex, maxX: cx + ex, minY: y0, maxY: y1, minZ: cz - ez, maxZ: cz + ez,
        cx, cz, hx, hz, r: 0, cos: rotY ? cos : 1, sin: rotY ? sin : 0,
        camera: o.camera ?? !CAMERA_IGNORE.has(o.kind || ''),
        walk: o.walkable ?? !NON_WALKABLE.has(o.kind || ''),
        min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1),
      };
      colliders.push(c);
      insert(c);
      return c;
    },

    /**
     * Vertical cylinder. `center` is the centre of its base (x, bottom y, z); it spans
     * bottom … bottom + height. (A mid-height centre is tolerated: the test also extends
     * height/2 below the given y.)
     * @param {THREE.Vector3} center
     * @param {number} radius
     * @param {number} height
     * @param {{kind?: string, camera?: boolean, walkable?: boolean}} [o] camera defaults to true for
     *   radius ≥ 0.3 m; walkable defaults to false (posts, trunks, stools)
     * @returns {Collider}
     */
    addCylinder(center, radius, height, o = {}) {
      /** @type {Collider} */
      const c = {
        id: nextId++, type: 'cylinder', kind: o.kind || 'post',
        minX: center.x - radius, maxX: center.x + radius,
        minY: center.y - height / 2, maxY: center.y + height,
        minZ: center.z - radius, maxZ: center.z + radius,
        cx: center.x, cz: center.z, hx: radius, hz: radius, r: radius, cos: 1, sin: 0,
        camera: o.camera ?? (radius >= 0.3 && !CAMERA_IGNORE.has(o.kind || '')),
        walk: o.walkable ?? false,
      };
      colliders.push(c);
      insert(c);
      return c;
    },

    /** Remove a collider returned by addBox / addCylinder. */
    remove(c) {
      const i = colliders.indexOf(c);
      if (i < 0) return false;
      colliders.splice(i, 1);
      unindex(c);
      return true;
    },

    /** Remove every collider. */
    clear() {
      colliders.length = 0;
      grid.clear();
    },

    /** @param {(x: number, z: number) => number} fn terrain / floor height */
    setGround(fn) { groundFn = typeof fn === 'function' ? fn : () => 0; },

    /**
     * Ground height at (x, z). With `fromY` it also counts the tops of colliders a
     * capsule standing at `fromY` could step onto (tops ≤ fromY + STEP_HEIGHT).
     * @param {number} x @param {number} z @param {number} [fromY] @param {number} [radius]
     */
    groundHeight(x, z, fromY, radius = 0.15) {
      if (fromY === undefined) { const g = groundFn(x, z); return Number.isFinite(g) ? g : 0; }
      const list = query(x - radius, z - radius, x + radius, z + radius);
      return supportAt(x, z, fromY + STEP_HEIGHT, radius, list);
    },

    /**
     * Move a capsule by `delta`, sliding along walls, stepping up ledges ≤ STEP_HEIGHT,
     * following the ground down small drops and landing on supports. Never tunnels:
     * the XZ motion is sub-stepped (≤ 0.45 × radius per step).
     *
     * Vertical rules: a capsule that starts on the ground follows it (up steps, down
     * ramps and drops ≤ `snapDown`); `delta.y` > 0 lifts it off (jump); otherwise it
     * falls by `delta.y` and lands on the highest support below. Details of the
     * contact are in `physics.last` (grounded, ceiling, hitWall, normal, ground).
     *
     * @param {THREE.Vector3} position feet position (not modified)
     * @param {THREE.Vector3} delta    displacement this frame
     * @param {number} [radius]
     * @param {number} [height]
     * @param {{out?: THREE.Vector3, snapDown?: number, step?: number}} [o]
     * @returns {THREE.Vector3} new feet position
     */
    moveCapsule(position, delta, radius = 0.3, height = 1.7, o = {}) {
      const out = o.out || new THREE.Vector3();
      const step = o.step ?? STEP_HEIGHT;
      const snapDown = o.snapDown ?? step;
      const footR = radius * 0.8;
      let x = position.x, y = position.y, z = position.z;
      let dx = delta.x || 0, dy = delta.y || 0, dz = delta.z || 0;
      if (!Number.isFinite(x + y + z)) { x = 0; y = 0; z = 0; }
      if (!Number.isFinite(dx + dy + dz)) { dx = 0; dy = 0; dz = 0; }

      const len = Math.hypot(dx, dz);
      const maxStep = Math.max(0.02, radius * SUBSTEP_FRACTION);
      let n = Math.max(1, Math.ceil(len / maxStep));
      if (n > MAX_SUBSTEPS) { const k = (MAX_SUBSTEPS * maxStep) / len; dx *= k; dz *= k; n = MAX_SUBSTEPS; }

      // One broad-phase query for the whole swept footprint.
      const pad = radius + 0.05;
      const list = query(Math.min(x, x + dx) - pad, Math.min(z, z + dz) - pad, Math.max(x, x + dx) + pad, Math.max(z, z + dz) + pad);
      // Copy: the shared result array is reused by supportAt callers.
      const cand = list.slice();

      info.hitWall = false; info.ceiling = false; info.stepped = false;
      const y0 = y;
      const g0 = supportAt(x, z, y + step, footR, cand);
      let grounded = y - g0 <= 0.05 && dy <= 0;
      if (grounded) y = Math.max(y, g0);

      const sx = dx / n, sz = dz / n;
      for (let s = 0; s < n; s++) {
        let nx = x + sx, nz = z + sz;
        // Walls: anything overlapping the body that is too tall to step onto.
        for (let iter = 0; iter < 4; iter++) {
          let moved = false;
          for (let i = 0; i < cand.length; i++) {
            const c = cand[i];
            if (c.maxY <= y + (c.walk ? step : 0) + EPS || c.minY >= y + height - EPS) continue;
            const p = pushOut(c, nx, nz, radius);
            if (p.hit) {
              nx = p.x; nz = p.z; moved = true;
              info.hitWall = true; info.normal.set(p.nx, 0, p.nz);
            }
          }
          if (!moved) break;
        }
        // Terrain cliffs (ground function discontinuities) higher than a step block too.
        const gNew = groundFn(nx, nz);
        if (gNew > y + step + EPS) {
          if (groundFn(nx, z) <= y + step + EPS) { nz = z; info.normal.set(0, 0, -Math.sign(sz)); }
          else if (groundFn(x, nz) <= y + step + EPS) { nx = x; info.normal.set(-Math.sign(sx), 0, 0); }
          else { nx = x; nz = z; info.normal.set(-sx, 0, -sz).normalize(); }
          info.hitWall = true;
        }
        x = nx; z = nz;
        if (grounded) {
          const g = supportAt(x, z, y + step, footR, cand);
          if (g >= y - snapDown - EPS) y = g;
          else grounded = false; // walked off a ledge: start falling
        }
      }

      // Vertical motion.
      if (dy !== 0 || !grounded) {
        if (dy > 0) {
          // Ceiling: lowest collider bottom above the head that the body overlaps.
          const head = y + height;
          for (let i = 0; i < cand.length; i++) {
            const c = cand[i];
            if (c.minY < head - EPS || c.minY >= head + dy) continue;
            if (!circleTouches(c, x, z, radius * 0.9)) continue;
            dy = Math.max(0, c.minY - head);
            info.ceiling = true;
          }
        }
        const yPrev = y;
        y += dy;
        const g = supportAt(x, z, Math.max(yPrev, y) + step, footR, cand);
        if (y <= g + EPS && dy <= 0) { y = g; grounded = true; }
        else if (y < g) { y = g; grounded = true; }
        else grounded = false;
      }

      info.grounded = grounded;
      info.ground = supportAt(x, z, y + step, footR, cand);
      info.stepped = grounded && y - y0 > 0.05 && dy <= 0;
      return out.set(x, y, z);
    },

    /**
     * Is a capsule at `position` overlapping a wall? (For spawn checks.)
     * @param {THREE.Vector3} position @param {number} [radius] @param {number} [height]
     */
    overlaps(position, radius = 0.3, height = 1.7) {
      const list = query(position.x - radius, position.z - radius, position.x + radius, position.z + radius);
      for (const c of list) {
        if (c.maxY <= position.y + (c.walk ? STEP_HEIGHT : 0) || c.minY >= position.y + height) continue;
        if (circleTouches(c, position.x, position.z, radius)) return true;
      }
      return false;
    },

    /**
     * Distance along a ray to the first collider (or the ground), or Infinity.
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} dir unit vector
     * @param {number} maxDist
     * @param {{camera?: boolean, ground?: boolean}} [o] camera: only colliders that block the camera
     */
    raycast(origin, dir, maxDist, o = {}) {
      const onlyCam = o.camera ?? false;
      const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
      const list = query(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez));
      let best = maxDist;
      let hit = false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (onlyCam && !c.camera) continue;
        const t = c.type === 'cylinder' ? rayCylinder(c, origin, dir, best) : rayBox(c, origin, dir, best);
        if (t < best) { best = t; hit = true; }
      }
      if (o.ground !== false) {
        // March the ground function (coarse, then refine).
        const stepLen = 0.25;
        let prevT = 0;
        for (let t = stepLen; t <= best + 1e-6; t += stepLen) {
          const tt = Math.min(t, best);
          const px = origin.x + dir.x * tt, py = origin.y + dir.y * tt, pz = origin.z + dir.z * tt;
          if (py < groundFn(px, pz)) {
            let a = prevT, b = tt;
            for (let k = 0; k < 6; k++) {
              const m = (a + b) / 2;
              if (origin.y + dir.y * m < groundFn(origin.x + dir.x * m, origin.z + dir.z * m)) b = m; else a = m;
            }
            if (a < best) { best = a; hit = true; }
            break;
          }
          prevT = tt;
        }
      }
      return hit ? best : Infinity;
    },

    /** Debug numbers. */
    stats() { return { colliders: colliders.length, cells: grid.size }; },
  };
  return physics;
}

/** Ray vs (optionally Y-rotated) box; returns entry distance or Infinity. Origin inside → Infinity. */
function rayBox(c, o, d, maxT) {
  let ox = o.x - c.cx, oz = o.z - c.cz, dx = d.x, dz = d.z;
  if (c.sin !== 0) {
    let t = ox * c.cos - oz * c.sin; oz = ox * c.sin + oz * c.cos; ox = t;
    t = dx * c.cos - dz * c.sin; dz = dx * c.sin + dz * c.cos; dx = t;
  }
  const oy = o.y, dy = d.y;
  let t0 = 0, t1 = maxT;
  const slab = (oo, dd, lo, hi) => {
    if (Math.abs(dd) < 1e-12) return oo >= lo && oo <= hi;
    let a = (lo - oo) / dd, b = (hi - oo) / dd;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    return t0 <= t1;
  };
  if (!slab(ox, dx, -c.hx, c.hx)) return Infinity;
  if (!slab(oz, dz, -c.hz, c.hz)) return Infinity;
  if (!slab(oy, dy, c.minY, c.maxY)) return Infinity;
  return t0 > 0 ? t0 : Infinity;
}

/** Ray vs vertical cylinder side + caps. */
function rayCylinder(c, o, d, maxT) {
  const ox = o.x - c.cx, oz = o.z - c.cz;
  const a = d.x * d.x + d.z * d.z;
  let best = Infinity;
  if (a > 1e-12) {
    const b = 2 * (ox * d.x + oz * d.z);
    const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0 && t < maxT) {
        const y = o.y + d.y * t;
        if (y >= c.minY && y <= c.maxY) best = t;
      }
    }
  }
  if (Math.abs(d.y) > 1e-12) {
    for (const yy of [c.minY, c.maxY]) {
      const t = (yy - o.y) / d.y;
      if (t > 0 && t < Math.min(best, maxT)) {
        const px = ox + d.x * t, pz = oz + d.z * t;
        if (px * px + pz * pz <= c.r * c.r) best = t;
      }
    }
  }
  return best;
}
