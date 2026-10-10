// Navigation graph: nodes + edges with A* path finding. Pure logic (no three.js needed;
// a vector factory can be passed so paths come back as THREE.Vector3).

/**
 * 2D segment vs axis-aligned rectangle test (slab method).
 * @param {number} ax @param {number} az @param {number} bx @param {number} bz
 * @param {{x0:number,z0:number,x1:number,z1:number}} r
 */
export function segmentHitsRect(ax, az, bx, bz, r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, r.x0, r.x1], [az, dz, r.z0, r.z1]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** True when the straight walk a→b is clear of every blocker rectangle grown by `radius`. */
export function clearLine(a, b, blockers, radius = 0.3) {
  for (const k of blockers) {
    const r = { x0: k.x0 - radius, z0: k.z0 - radius, x1: k.x1 + radius, z1: k.z1 + radius };
    if (segmentHitsRect(a.x, a.z, b.x, b.z, r)) return false;
  }
  return true;
}

/**
 * Connect node pairs closer than maxDist with a clear line of sight.
 * @param {{position:{x:number,z:number}}[]} nodes
 * @param {{x0,z0,x1,z1}[]} blockers
 */
export function buildEdges(nodes, blockers, maxDist = 7.5, radius = 0.3) {
  const edges = [];
  const m2 = maxDist * maxDist;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i].position;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j].position;
      const dx = a.x - b.x, dz = a.z - b.z;
      if (dx * dx + dz * dz > m2) continue;
      // only test blockers near the segment
      const minX = Math.min(a.x, b.x) - 1, maxX = Math.max(a.x, b.x) + 1, minZ = Math.min(a.z, b.z) - 1, maxZ = Math.max(a.z, b.z) + 1;
      const near = blockers.filter((k) => k.x1 >= minX && k.x0 <= maxX && k.z1 >= minZ && k.z0 <= maxZ);
      if (clearLine(a, b, near, radius)) edges.push([i, j]);
    }
  }
  return edges;
}

/**
 * @param {{id:number, position:{x:number,y:number,z:number}, zone:string}[]} nodes
 * @param {[number, number][]} edges
 * @param {{ blockers?: {x0,z0,x1,z1}[], vec?: (x:number,y:number,z:number)=>any }} [opts]
 */
export function createNav(nodes, edges, opts = {}) {
  const blockers = opts.blockers || [];
  const vec = opts.vec || ((x, y, z) => ({ x, y, z }));
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /** Nearest node, preferring ones reachable in a straight line. */
  function nearest(p, zone) {
    let best = -1, bestD = Infinity, bestVis = -1, bestVisD = Infinity;
    for (const n of nodes) {
      if (zone && n.zone !== zone) continue;
      if (!adj[n.id].length) continue;
      const dd = d(p, n.position);
      if (dd < bestD) { bestD = dd; best = n.id; }
      if (dd < bestVisD && dd < 25 && clearLine(p, n.position, blockers, 0.05)) { bestVisD = dd; bestVis = n.id; }
    }
    return bestVis >= 0 ? bestVis : best;
  }

  function astar(s, g) {
    const open = new Set([s]);
    const came = new Map();
    const gs = new Map([[s, 0]]);
    const fs = new Map([[s, d(nodes[s].position, nodes[g].position)]]);
    while (open.size) {
      let cur = -1, cf = Infinity;
      for (const o of open) { const f = fs.get(o); if (f < cf) { cf = f; cur = o; } }
      if (cur === g) {
        const out = [cur];
        while (came.has(cur)) { cur = came.get(cur); out.unshift(cur); }
        return out;
      }
      open.delete(cur);
      for (const nb of adj[cur]) {
        const t = gs.get(cur) + d(nodes[cur].position, nodes[nb].position);
        if (t < (gs.get(nb) ?? Infinity)) {
          came.set(nb, cur); gs.set(nb, t); fs.set(nb, t + d(nodes[nb].position, nodes[g].position));
          open.add(nb);
        }
      }
    }
    return null;
  }

  const insideAny = (x, z, grow) => blockers.some((k) => x > k.x0 - grow && x < k.x1 + grow && z > k.z0 - grow && z < k.z1 + grow);
  /**
   * When `p` lies inside a blocker footprint (a seat inside its pew, a spot behind a counter edge),
   * the point just outside its nearest free face, else null. Paths go through it so walkers
   * approach a pew seat from the row gap in front of it, not through the backrest.
   */
  function exitPoint(p, margin = 0.32) {
    const k = blockers.find((b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
    if (!k) return null;
    const faces = [
      [p.x - k.x0, k.x0 - margin, p.z], [k.x1 - p.x, k.x1 + margin, p.z],
      [p.z - k.z0, p.x, k.z0 - margin], [k.z1 - p.z, p.x, k.z1 + margin],
    ].sort((a, b) => a[0] - b[0]);
    for (const [, x, z] of faces) if (!insideAny(x, z, 0.2)) return { x, z };
    return { x: faces[0][1], z: faces[0][2] };
  }

  return {
    nodes, edges,
    nearest,
    exitPoint,
    /** Random node (optionally inside a zone). */
    randomNode(zone, rnd = Math.random) {
      const list = zone ? nodes.filter((n) => n.zone === zone && adj[n.id].length) : nodes.filter((n) => adj[n.id].length);
      return list.length ? list[Math.floor(rnd() * list.length)] : null;
    },
    /** Waypoints from `from` to `to` (excludes the start, ends exactly at `to`). Empty if unreachable. */
    path(from, to) {
      const end = vec(to.x, to.y ?? 0, to.z);
      // leave / reach points inside furniture (pew seats, benches) through their nearest open face
      const exA = exitPoint(from), exB = exitPoint(to);
      const a = exA || from, b = exB || to;
      const head = exA ? [vec(exA.x, from.y ?? 0, exA.z)] : [];
      const tail = exB ? [vec(exB.x, to.y ?? 0, exB.z), end] : [end];
      if (clearLine(a, b, blockers, 0.25) && d(a, b) < 12) return [...head, ...tail];
      const s = nearest(a), g = nearest(b);
      if (s < 0 || g < 0) return [];
      const ids = astar(s, g);
      if (!ids) return [];
      const pts = ids.map((i) => vec(nodes[i].position.x, nodes[i].position.y, nodes[i].position.z));
      // skip the first node if we can already see the second one
      if (pts.length > 1 && clearLine(a, pts[1], blockers, 0.3)) pts.shift();
      // skip the last node if the goal is visible from the one before it
      if (pts.length > 1 && clearLine(pts[pts.length - 2], b, blockers, 0.3)) pts.pop();
      return [...head, ...pts, ...tail];
    },
  };
}
