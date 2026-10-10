// The journey scene: after you choose how to travel, you see yourself on the road for a few
// seconds — trekking on the walkway, on the back of an okada, in a danfo with the conductor
// hanging out, in a yellow taxi or a church member's car — with the camera tracking from the
// roadside, other traffic passing and people walking. The roads depend on where you are going
// (src/world/roads.js): Herbert Macaulay Way, Third Mainland Bridge, Ikorodu Road, the
// Lekki–Epe Expressway or under the Ojuelegba bridge — a long trip shows two or three of them.
import * as THREE from 'three';
import { ROUTES, buildRoute } from './roads.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SEAT_DROP = 0.555; // character root below the seat surface when sitting (see npc/index.js)
const START_X = -38;

/**
 * @param {object} ctx engine context
 * @param {{world: object, kit: object, createCharacter: Function, randomAppearance: Function}} o
 */
export function createJourney(ctx, { world, kit, createCharacter, randomAppearance }) {
  let active = null;
  const built = new Set(['herbert']);

  /** Build a route's scenery the first time it is used. */
  function ensure(id) {
    if (built.has(id) || !ROUTES[id] || !world.scenery) return;
    built.add(id);
    world.scenery((W) => { buildRoute(W, id); }, `route:${id}`);
  }

  /**
   * Play the journey. Resolves when it ends (or is skipped).
   * @param {{mode: string, ownBike?: boolean, route?: string[]}} go
   * @param {object} character the player's character (moved for the scene, put back by the caller)
   * @param {(id: string) => void} [onLeg] called when a new stretch of road starts (for a caption)
   */
  function play(go, character, onLeg) {
    return new Promise((resolve) => {
      const route = (go.route?.length ? go.route : ['herbert']).filter((id) => ROUTES[id]);
      for (const id of route) ensure(id);
      const group = new THREE.Group();
      group.name = 'journey';
      ctx.scene.add(group);
      const extras = [];
      const legExtras = [];
      const rng = Math.random;
      const mode = go.mode;
      let speed = 9;
      let carrier = null;
      const totalDur = mode === 'trek' ? 6 : Math.min(10.5, 5.5 + 2.4 * (route.length - 1));
      const legDur = totalDur / route.length;
      const charWas = { parent: character.object.parent, visible: character.object.visible };
      ctx.scene.add(character.object);
      character.object.visible = true;

      const person = (role, appearance, parent = group, list = extras) => {
        const c = createCharacter(kit, appearance || randomAppearance(rng, role), { detail: 'low' });
        parent.add(c.object);
        list.push(c);
        return c;
      };
      // Sit facing +X with the hips on the seat point (x, y): the sit clip's hip point is sitOffset.
      const sitOn = (c, x, y) => {
        const o = c.sitOffset || V(0, SEAT_DROP, -0.34);
        c.object.position.set(x - o.z, y - o.y, 0); // sitOffset (0, py, -0.34) turned a quarter to +X
        c.object.rotation.y = Math.PI / 2;
        c.play?.('sit', { fade: 0 });
      };

      if (mode === 'trek') {
        speed = 1.55;
        character.object.rotation.y = Math.PI / 2;
        character.setLocomotion?.(speed);
      } else {
        carrier = new THREE.Group();
        group.add(carrier);
        if (mode === 'bike') {
          speed = 10;
          carrier.add(world.vehicleMesh('okada'));
          if (!go.ownBike) { const rider = person('security', null, carrier); sitOn(rider, -0.02, 0.92); }
          carrier.add(character.object);
          sitOn(character, go.ownBike ? -0.05 : -0.42, 0.92);
        } else if (mode === 'danfo') {
          speed = 8;
          carrier.add(world.vehicleMesh('danfo'));
          character.object.visible = false;
          // the conductor hangs out of the sliding door, shouting the route
          const cond = person('visitor', null, carrier);
          cond.object.position.set(0.3, 0.35, -1.05);
          cond.object.rotation.y = Math.PI;
          cond.play?.('idle', { fade: 0 });
          cond.wave?.(30);
        } else {
          speed = mode === 'taxi' ? 11 : 9.5;
          carrier.add(world.vehicleMesh('car', mode === 'taxi' ? '#facc15' : '#c9ccd1'));
          character.object.visible = false;
        }
      }

      /* ---------------------------------------------------------------- one stretch of road */
      let leg = -1;
      let R = ROUTES.herbert;
      let start = V();
      let legT0 = 0;
      const traffic = [];
      function startLeg(i) {
        leg = i;
        R = ROUTES[route[i]];
        const [ox, oz] = R.origin;
        start = V(ox + START_X, 0, oz + (mode === 'trek' ? R.walk : R.lane));
        if (carrier) carrier.position.copy(start);
        else character.object.position.copy(start);
        // clear the last stretch's traffic and walkers
        for (const t of traffic) group.remove(t.obj);
        traffic.length = 0;
        for (const c of legExtras.splice(0)) { c.object.removeFromParent(); c.dispose?.(); }
        // other vehicles in the other lanes (not on Herbert Macaulay Way: it has its own traffic)
        for (const ln of R.traffic) {
          const n = 1 + Math.floor(rng() * 2);
          for (let k = 0; k < n; k++) {
            const kind = ln.brt ? 'danfo' : ['car', 'car', 'danfo', 'keke', 'okada', 'car'][Math.floor(rng() * 6)];
            const obj = world.vehicleMesh(kind, kind === 'car' ? ['#facc15', '#c9ccd1', '#1f2937', '#991b1b', '#e5e7eb', '#1e3a8a'][Math.floor(rng() * 6)] : undefined);
            obj.rotation.y = ln.dir > 0 ? 0 : Math.PI;
            const v = (ln.dir > 0 ? speed * (0.75 + rng() * 0.6) : 9 + rng() * 5) * (kind === 'keke' ? 0.7 : 1);
            const x = ox + START_X + (ln.dir > 0 ? -12 + rng() * 40 : 20 + rng() * 70);
            obj.position.set(x, 0, oz + ln.z);
            group.add(obj);
            traffic.push({ obj, v: v * ln.dir });
          }
        }
        // a few people on the walkway
        if (route[i] !== 'herbert') {
          for (let k = 0; k < 2; k++) {
            const c = person(['worshipper', 'visitor', 'hospitality'][k % 3], null, group, legExtras);
            const dir = rng() < 0.5 ? 1 : -1;
            c.object.position.set(ox + START_X + 6 + rng() * 30, 0.16, oz + R.walk + (mode === 'trek' ? 0.9 : 0) + (rng() - 0.5) * 0.6);
            c.object.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            c.setLocomotion?.(1.3);
            c.walkDir = dir;
          }
        }
        ctx.setShadowFocus(start);
        onLeg?.(route[i]);
      }

      // camera: on the far walkway, tracking alongside
      const cam = ctx.camera;
      const lookAt = V();
      let done = false;
      const skip = () => finish();
      let last = performance.now();
      let t = 0;
      startLeg(0);
      const off = ctx.onUpdate(() => {
        // wall-clock time, so a slow phone does not make the trip longer — but one long hitch
        // (building a road, compiling its shaders) must not swallow the whole trip
        const now = performance.now();
        const step = Math.min(0.25, (now - last) / 1000);
        const dt = Math.min(0.1, step);
        last = now;
        t += step;
        const li = Math.min(route.length - 1, Math.floor(t / legDur));
        if (li !== leg) { startLeg(li); legT0 = li * legDur; }
        const tl = t - legT0;
        const k = Math.min(1, tl / legDur);
        const x = start.x + speed * tl;
        if (carrier) {
          carrier.position.x = x;
          carrier.position.y = Math.sin(t * 13) * 0.012; // Lagos roads
          carrier.rotation.z = Math.sin(t * 7.3) * 0.006;
        } else {
          character.object.position.x = x;
          character.object.position.y = route[leg] === 'herbert' ? 0 : 0.16;
          character.update?.(dt);
        }
        for (const c of extras) c.update?.(dt);
        for (const c of legExtras) { c.object.position.x += c.walkDir * 1.3 * dt; c.update?.(dt); }
        for (const tv of traffic) tv.obj.position.x += tv.v * dt;
        if (carrier && mode === 'bike') character.update?.(dt);
        const target = carrier ? carrier.position : character.object.position;
        const side = mode === 'trek' ? 4.2 : 6.2;
        cam.position.set(target.x - 2.6 + k * 4.5, 1.9 + (mode === 'trek' ? 0.2 : 0.4), target.z - side - 2.4);
        lookAt.set(target.x + 0.6, 1.0, target.z);
        cam.lookAt(lookAt);
        ctx.setShadowFocus(target);
        if (t >= totalDur) finish();
      });
      active = { skip };

      function finish() {
        if (done) return;
        done = true;
        off();
        for (const c of extras) c.dispose?.();
        for (const c of legExtras) c.dispose?.();
        // give the character back to the caller (player.teleport puts it in place)
        if (charWas.parent) charWas.parent.add(character.object); else ctx.scene.add(character.object);
        character.object.visible = charWas.visible;
        character.object.position.set(0, 0, 0);
        character.object.rotation.set(0, 0, 0);
        character.play?.('idle', { fade: 0 });
        ctx.scene.remove(group);
        active = null;
        resolve();
      }
    });
  }

  return {
    play,
    /** Build a route's scenery ahead of time (e.g. when the game is idle). */
    prepare: ensure,
    get active() { return !!active; },
    skip() { active?.skip(); },
  };
}
