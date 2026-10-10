// The journey scene: after you choose how to travel, you see yourself on the road along
// Herbert Macaulay Way for a few seconds — trekking on the walkway, on the back of an okada,
// in a danfo with the conductor hanging out, in a yellow taxi or a church member's car —
// with the camera tracking from the roadside. Then you arrive.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SEAT_DROP = 0.555; // character root below the seat surface when sitting (see npc/index.js)

/**
 * @param {object} ctx engine context
 * @param {{world: object, kit: object, createCharacter: Function, randomAppearance: Function}} o
 */
export function createJourney(ctx, { world, kit, createCharacter, randomAppearance }) {
  let active = null;

  /**
   * Play the journey. Resolves when it ends (or is skipped).
   * @param {{mode: string, ownBike?: boolean}} go
   * @param {object} character the player's character (moved for the scene, put back by the caller)
   */
  function play(go, character) {
    return new Promise((resolve) => {
      const group = new THREE.Group();
      group.name = 'journey';
      ctx.scene.add(group);
      const extras = [];
      const rng = Math.random;
      const mode = go.mode;
      let speed = 9;
      let carrier = null;
      let start = V(-38, 0, 2);
      let dur = 6.5;
      const charWas = { parent: character.object.parent, visible: character.object.visible };
      ctx.scene.add(character.object);
      character.object.visible = true;

      const person = (role, appearance) => {
        const c = createCharacter(kit, appearance || randomAppearance(rng, role), { detail: 'low' });
        group.add(c.object);
        extras.push(c);
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
        speed = 1.55; dur = 6;
        start = V(-30, 0, 6.5);
        character.object.position.copy(start);
        character.object.rotation.y = Math.PI / 2;
        character.setLocomotion?.(speed);
      } else {
        carrier = new THREE.Group();
        group.add(carrier);
        if (mode === 'bike') {
          speed = 10;
          carrier.add(world.vehicleMesh('okada'));
          if (!go.ownBike) { const rider = person('security'); carrier.add(rider.object); sitOn(rider, -0.02, 0.92); }
          carrier.add(character.object);
          sitOn(character, go.ownBike ? -0.05 : -0.42, 0.92);
        } else if (mode === 'danfo') {
          speed = 8;
          carrier.add(world.vehicleMesh('danfo'));
          character.object.visible = false;
          // the conductor hangs out of the sliding door, shouting the route
          const cond = person('visitor');
          carrier.add(cond.object);
          cond.object.position.set(0.3, 0.35, -1.05);
          cond.object.rotation.y = Math.PI;
          cond.play?.('idle', { fade: 0 });
          cond.wave?.(30);
        } else {
          speed = mode === 'taxi' ? 11 : 9.5;
          carrier.add(world.vehicleMesh('car', mode === 'taxi' ? '#facc15' : '#c9ccd1'));
          character.object.visible = false;
        }
        carrier.position.copy(start);
      }

      // camera: on the north walkway, tracking alongside
      const cam = ctx.camera;
      const lookAt = V();
      let t = 0;
      let done = false;
      const skip = () => finish();
      const t0 = performance.now();
      let last = t0;
      const off = ctx.onUpdate(() => {
        // wall-clock time, so a slow phone does not make the trip longer
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        t = (now - t0) / 1000;
        const k = Math.min(1, t / dur);
        const x = start.x + speed * t;
        if (carrier) {
          carrier.position.x = x;
          carrier.position.y = Math.sin(t * 13) * 0.012; // Lagos roads
          carrier.rotation.z = Math.sin(t * 7.3) * 0.006;
        } else {
          character.object.position.x = x;
          character.update?.(dt);
        }
        for (const c of extras) c.update?.(dt);
        if (carrier && mode === 'bike') character.update?.(dt);
        const target = carrier ? carrier.position : character.object.position;
        const side = mode === 'trek' ? 4.2 : 6.2;
        cam.position.set(target.x - 2.6 + k * 4.5, 1.9 + (mode === 'trek' ? 0 : 0.4), target.z - side - 2.4);
        lookAt.set(target.x + 0.6, 1.0, target.z);
        cam.lookAt(lookAt);
        ctx.setShadowFocus(target);
        if (t >= dur) finish();
      });
      active = { skip };

      function finish() {
        if (done) return;
        done = true;
        off();
        for (const c of extras) c.dispose?.();
        // give the character back to the caller (player.teleport puts it in place)
        if (charWas.parent) charWas.parent.add(character.object); else ctx.scene.add(character.object);
        character.object.visible = charWas.visible;
        character.object.position.set(0, 0, 0);
        character.play?.('idle', { fade: 0 });
        ctx.scene.remove(group);
        active = null;
        resolve();
      }
    });
  }

  return {
    play,
    get active() { return !!active; },
    skip() { active?.skip(); },
  };
}
