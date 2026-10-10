// The local player: camera-relative movement with momentum, jumping, sitting on seats,
// kneeling to pray, emotes, interactions, footsteps synced to the animation, and the
// bus events other modules listen to (see ARCHITECTURE.md → Player).
import * as THREE from 'three';
import { applyPrayPose } from './pose.js';

export const WALK_SPEED = 1.6;
export const RUN_SPEED = 4.5;
const GRAVITY = 20;
const JUMP_SPEED = 5.2; // ≈ 0.68 m
const ACCEL = 14;
const DECEL = 18;
const AIR_ACCEL = 3.5;
const TURN_RATE = 11;
/** Keyboard turning speed (rad/s) for the left / right keys. */
const KEY_TURN = 2.6;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.15;
const RADIUS = 0.26;
const SEAT_RANGE = 2;
/** Sitting pose (Sitting_Idle_Loop): pelvis height above the feet and how far behind them. */
const SIT_PELVIS = 0.555;
const SIT_BACK = 0.34;
/** Kneel clip (Fixing_Kneeling): kneeling hold section and the stand-up tail (seconds). */
const KNEEL_HOLD = [1.15, 3.7];
const KNEEL_UP = 4.12;
const KNEEL_END = 5.0;
/** Foot-plant detection thresholds (foot bone height above the feet origin, m). */
const PLANT_Y = 0.15;
const LIFT_Y = 0.2;

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * @param {*} ctx engine context
 * @param {{world?: any, physics?: any, input?: any, camera?: any, character?: any,
 *          updateCharacter?: boolean, shadowFocus?: boolean}} deps
 *   updateCharacter (default true): player.update also calls character.update(dt) —
 *   do not update the character elsewhere. shadowFocus (default true): keep the sun's
 *   shadow box on the player (texel-snapped, no shimmer).
 */
export function createPlayer(ctx, deps = {}) {
  const { world, physics, input, camera } = deps;
  let character = deps.character || null;
  const bus = ctx.bus;

  const object = new THREE.Group();
  object.name = 'player';
  const visual = new THREE.Group(); // smoothed offset for step-ups and snaps
  object.add(visual);
  const body = character ? character.object : makeStandIn();
  visual.add(body);
  ctx.scene?.add(object);

  const position = object.position;
  const height = character?.height || 1.75;
  const vel = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const next = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const footPos = new THREE.Vector3();
  const frameStart = new THREE.Vector3();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  let vy = 0;
  let grounded = true;
  let heading = 0;
  let state = /** @type {'move'|'air'|'sit'|'lie'|'kneel'|'emote'} */ ('move');
  let phase = '';
  let phaseT = 0;
  let airT = 0;
  let sinceGround = 0;
  let jumpBuf = 0;
  let jumped = false;
  let fallFrom = 0;
  let landT = 0;
  let speed = 0; // actual horizontal speed (m/s), smoothed
  let seat = null;
  let sitFrom = { pos: new THREE.Vector3(), rot: 0 };
  let sitTo = { pos: new THREE.Vector3(), rot: 0 };
  let kneelAct = null;
  let prayW = 0;
  let armW = 0;
  let handsUp = false;
  let emoteAct = null;
  let emoteKind = '';
  let nearby = null;
  let nearbyT = 0;
  let zoneT = 0;
  let zoneId = undefined;
  let surface = 'concrete';
  const surfaceAt = new THREE.Vector3(1e9, 0, 0);
  const feet = { l: { armed: false }, r: { armed: false } };
  let strideAcc = 0;
  let lastAnimState = 'idle';

  // ------------------------------------------------------------ helpers
  const play = (s, o) => character?.play(s, o) ?? null;
  const emitAction = (name) => bus?.emit('player:action', { name });
  const toast = (text) => bus?.emit('game:toast', { text });

  function groundAt(x, z) {
    if (physics) return physics.groundHeight(x, z);
    if (world?.groundAt) return world.groundAt(x, z);
    return 0;
  }

  function surfaceHere() {
    if (surfaceAt.distanceToSquared(position) > 0.25) {
      surfaceAt.copy(position);
      surface = world?.surfaceAt?.(position.x, position.z) || 'concrete';
    }
    return surface;
  }

  function nearestSeat(range = SEAT_RANGE, from = position) {
    const seats = world?.seats;
    if (!seats?.length) return null;
    let best = null, bd = range * range;
    for (const s of seats) {
      if (s.taken && s !== seat) continue;
      const dx = s.position.x - from.x, dz = s.position.z - from.z;
      const d = dx * dx + dz * dz;
      if (d < bd && Math.abs(s.position.y - from.y) < 1.6) { bd = d; best = s; }
    }
    return best;
  }

  function nearestInteractable() {
    const items = world?.interactables;
    if (!items?.length) return null;
    let best = null, bs = Infinity;
    for (const it of items) {
      const p = it.position;
      const d = Math.hypot(p.x - position.x, p.z - position.z);
      const r = (it.radius ?? 1.5) + 0.4;
      if (d > r || Math.abs((p.y ?? position.y) - position.y) > 2.5) continue;
      const score = d / r;
      if (score < bs) { bs = score; best = it; }
    }
    return best;
  }

  function toMove(fade = 0.25) {
    state = 'move';
    phase = '';
    if (character) {
      play(speed > 0.3 ? 'walk' : 'idle', { fade });
      lastAnimState = character.state;
    }
  }

  // ------------------------------------------------------------ sit / stand
  /**
   * Sit on a seat (glides into place, then sits down).
   * @param {{position: THREE.Vector3, rotY: number, taken?: boolean}} s
   */
  function sitAt(s) {
    if (!s || (s.taken && s !== seat)) return false;
    if (state === 'sit' && seat === s) return true;
    if (seat && seat !== s) seat.taken = false;
    stopEmote();
    if (state === 'kneel') { kneelAct = null; prayW = 0; }
    seat = s;
    s.taken = true;
    const rot = s.rotY || 0;
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const fx2 = s.position.x + fx * SIT_BACK, fz2 = s.position.z + fz * SIT_BACK;
    const floor = groundAt(fx2, fz2);
    const y = Math.max(s.position.y - SIT_PELVIS, Math.min(floor, s.position.y - 0.3));
    sitFrom.pos.copy(position);
    sitFrom.rot = heading;
    sitTo.pos.set(fx2, y, fz2);
    sitTo.rot = rot;
    state = 'sit';
    phase = 'approach';
    phaseT = 0;
    vel.set(0, 0, 0);
    vy = 0;
    if (sitFrom.pos.distanceTo(sitTo.pos) > 0.05) play('walk', { fade: 0.15, timeScale: 1 });
    input?.setButton?.('sit', { label: 'Stand' });
    emitAction('sit');
    return true;
  }

  /** Stand up from a seat or from kneeling. */
  function stand() {
    if (state === 'sit') {
      if (phase === 'up') return;
      phase = 'up';
      phaseT = 0;
      play('standUp', { fade: 0.15, timeScale: 1.35 });
      emitAction('stand');
    } else if (state === 'kneel') {
      if (phase === 'up') return;
      phase = 'up';
      phaseT = 0;
      if (kneelAct) { kneelAct.time = Math.max(kneelAct.time, KNEEL_UP); kneelAct.timeScale = 1.35; }
      emitAction('stand');
    } else if (state === 'lie') {
      getUp();
    } else if (state === 'emote') {
      stopEmote(true);
    }
  }

  // ------------------------------------------------------------ lie down (bed)
  let lieSpot = null;
  let lieStand = new THREE.Vector3();
  /**
   * Lie down on your back at a spot (the head is about 0.93 m behind the spot along rotY).
   * @param {{position: THREE.Vector3, rotY: number}} spot @param {THREE.Vector3} standAt where you get up to
   */
  function lieAt(spot, standAt) {
    if (!spot || state === 'air') return false;
    if (seat) { seat.taken = false; seat = null; }
    stopEmote();
    kneelAct = null; prayW = 0;
    lieSpot = spot;
    lieStand.copy(standAt || position);
    sitFrom.pos.copy(position); sitFrom.rot = heading;
    sitTo.pos.copy(spot.position); sitTo.rot = spot.rotY;
    state = 'lie';
    phase = 'approach';
    phaseT = 0;
    vel.set(0, 0, 0); vy = 0;
    play('walk', { fade: 0.15 });
    input?.setButton?.('sit', { label: 'Get up' });
    emitAction('lie');
    return true;
  }
  function getUp() {
    if (state !== 'lie') return;
    position.copy(lieStand);
    if (physics) position.y = Math.max(position.y, physics.groundHeight(position.x, position.z, position.y + 0.3));
    heading = wrap(lieSpot ? lieSpot.rotY : heading);
    lieSpot = null;
    visual.position.set(0, 0, 0);
    input?.setButton?.('sit', { label: null });
    emitAction('stand');
    toMove(0.35);
  }

  // ------------------------------------------------------------ do something (read, eat, use)
  /** Play an action clip on the spot ('interact', 'eat', 'phone' = reading…) for a few seconds. */
  function act(anim = 'interact', seconds = 2.5) {
    if (state === 'air' || state === 'sit' || state === 'lie' || state === 'kneel') return false;
    stopEmote();
    state = 'emote';
    emoteKind = 'act';
    emoteFor = seconds;
    phaseT = 0;
    vel.set(0, 0, 0);
    emoteAct = play(anim, { fade: 0.25, loop: anim === 'phone' || anim === 'talk' });
    return true;
  }
  let emoteFor = 0;

  function finishStand() {
    if (seat) { seat.taken = false; seat = null; }
    input?.setButton?.('sit', { label: null });
    input?.setButton?.('kneel', { label: null });
    kneelAct = null;
    prayW = 0;
    // settle out of the seat / bench volume smoothly
    if (physics) {
      prev.copy(position);
      physics.moveCapsule(position, tmp.set(0, 0, 0), RADIUS, height, { out: next });
      offsetVisual(tmp.subVectors(next, prev));
      position.copy(next);
    }
    toMove(0.3);
  }

  /** Keep the body where it was drawn while the capsule jumps by `d` (world), then ease in. */
  function offsetVisual(d) {
    tmp.copy(d).applyAxisAngle(Y_AXIS, -heading);
    visual.position.sub(tmp);
  }

  // ------------------------------------------------------------ kneel / pray
  function kneel() {
    if (state !== 'move' || !grounded) return false;
    stopEmote();
    state = 'kneel';
    phase = 'down';
    phaseT = 0;
    vel.set(0, 0, 0);
    kneelAct = play('kneel', { fade: 0.3, timeScale: 1 });
    handsUp = false;
    armW = 0;
    input?.setButton?.('kneel', { label: 'Stand' });
    emitAction('kneel');
    return true;
  }

  // ------------------------------------------------------------ emotes
  function dance() {
    if (state !== 'move' || !grounded) return;
    state = 'emote';
    emoteKind = 'dance';
    emoteAct = play('dance', { fade: 0.3 });
    vel.set(0, 0, 0);
    emitAction('dance');
  }
  function interactAnim() {
    if (state !== 'move' || !grounded || speed > 0.4 || !character) return;
    state = 'emote';
    emoteKind = 'interact';
    phaseT = 0;
    emoteAct = play('interact', { fade: 0.2, timeScale: 1.25 });
  }
  function stopEmote(anim = false) {
    if (state !== 'emote') return;
    emoteAct = null;
    emoteKind = '';
    if (anim) toMove(0.3);
    else state = 'move';
  }

  function interact() {
    const it = nearestInteractable();
    if (!it) { toast('Nothing to use here.'); return; }
    bus?.emit('player:interact', it);
    if (it.action === 'sit') {
      const s = nearestSeat(SEAT_RANGE + 1, it.position);
      if (s) sitAt(s);
    } else if (it.action === 'pray') {
      if (state === 'move') kneel();
    } else {
      interactAnim();
    }
  }

  // ------------------------------------------------------------ physics move
  function moveBody(dt) {
    prev.copy(position);
    delta.set(vel.x * dt, vy * dt, vel.z * dt);
    if (physics) {
      physics.moveCapsule(position, delta, RADIUS, height, { out: next });
      const info = physics.last;
      if (info.hitWall) {
        // drop the velocity going into the wall so speed doesn't build up against it
        const n = info.normal;
        const into = vel.x * n.x + vel.z * n.z;
        if (into < 0) { vel.x -= n.x * into; vel.z -= n.z * into; }
      }
      if (info.ceiling && vy > 0) vy = 0;
      const wasGrounded = grounded;
      grounded = info.grounded;
      if (grounded && vy < 0) vy = 0;
      // smooth visual over step-ups / snaps (no pops)
      const dy = next.y - prev.y - delta.y;
      if (wasGrounded && grounded && Math.abs(dy) > 0.04) visual.position.y -= next.y - prev.y;
    } else {
      next.copy(position).add(delta);
      const g = groundAt(next.x, next.z);
      if (next.y <= g) { next.y = g; grounded = true; if (vy < 0) vy = 0; } else grounded = false;
    }
    position.copy(next);
    return Math.hypot(position.x - prev.x, position.z - prev.z);
  }

  // ------------------------------------------------------------ footsteps
  function emitStep(run) {
    bus?.emit('player:step', { surface: surfaceHere(), position: position.clone(), run });
  }
  function detectSteps(dt) {
    if (!grounded || state !== 'move' || speed < 0.35) {
      feet.l.armed = feet.r.armed = true;
      strideAcc = 0;
      return;
    }
    const run = speed > 3;
    const bones = character?.bones;
    if (bones?.foot_l && bones?.foot_r) {
      const base = visual.getWorldPosition(footPos).y;
      for (const side of ['l', 'r']) {
        const f = feet[side];
        const h = bones[`foot_${side}`].getWorldPosition(footPos).y - base;
        if (f.armed && h < PLANT_Y) { f.armed = false; emitStep(run); }
        else if (!f.armed && h > LIFT_Y) f.armed = true;
      }
    } else {
      strideAcc += speed * dt;
      const stride = run ? 1.35 : 0.72;
      if (strideAcc >= stride) { strideAcc -= stride; emitStep(run); }
    }
  }

  // ------------------------------------------------------------ shadow focus (texel-snapped)
  const shadowAxes = (() => {
    const sun = ctx.sun;
    if (!sun || typeof ctx.setShadowFocus !== 'function') return null;
    const d = new THREE.Vector3().subVectors(sun.position, sun.target.position).normalize();
    const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const y = new THREE.Vector3().crossVectors(d, x);
    const sc = sun.shadow?.camera;
    const size = sc ? (sc.right - sc.left) / (sun.shadow.mapSize.x || 1024) : 0.06;
    return { d, x, y, texel: size };
  })();
  const focus = new THREE.Vector3();
  function updateShadowFocus() {
    if (!shadowAxes || deps.shadowFocus === false) return;
    const { d, x, y, texel } = shadowAxes;
    const px = Math.round(position.dot(x) / texel) * texel;
    const py = Math.round(position.dot(y) / texel) * texel;
    const pd = position.dot(d);
    focus.set(0, 0, 0).addScaledVector(x, px).addScaledVector(y, py).addScaledVector(d, pd);
    ctx.setShadowFocus(focus);
  }

  // ------------------------------------------------------------ update
  function update(dt, t) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    let mv = input?.move || { x: 0, y: 0 };
    // Keyboard steering: left / right turn you (and the camera stays behind you), up walks
    // forward, down walks back towards the camera. Nobody walks sideways across the screen.
    if (input?.keyboardMove && camera && 'yaw' in camera && Math.abs(mv.x) > 0.05 && (state === 'move' || state === 'air')) {
      const turn = -Math.sign(mv.x) * KEY_TURN * dt;
      camera.yaw = wrap(camera.yaw + turn);
      if (mv.y >= -0.05) heading = wrap(heading + turn);
      mv = { x: 0, y: mv.y };
    }
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const wantsMove = mag > 0.05;
    const run = !!input?.run;
    frameStart.copy(position);

    // ---------------- actions
    if (input) {
      if (input.consume('jump')) jumpBuf = JUMP_BUFFER;
      if (input.consume('sit')) {
        if (state === 'sit' || state === 'lie') stand();
        else if (state === 'move' || state === 'emote' || state === 'kneel') {
          const s = nearestSeat();
          if (s) sitAt(s);
          else toast('No free seat nearby. Find a pew, bench or chair.');
        }
      }
      if (input.consume('kneel')) {
        if (state === 'kneel') stand();
        else if (state === 'sit' && phase === 'seated') { character?.raiseHands(4); emitAction('pray'); }
        else if (state === 'move' || state === 'emote') { stopEmote(); kneel(); }
      }
      if (input.consume('wave') && state !== 'air') { character?.wave(2.2); emitAction('wave'); }
      if (input.consume('clap') && state !== 'air') { character?.clap(3); emitAction('clap'); }
      if (input.consume('dance')) {
        if (state === 'emote' && emoteKind === 'dance') stopEmote(true);
        else if (state === 'move') dance();
      }
      if (input.consume('interact')) interact();
    }
    jumpBuf = Math.max(0, jumpBuf - dt);

    // ---------------- states
    let moved = 0;
    phaseT += dt;
    if (state === 'move' || state === 'air') {
      // camera-relative wish velocity
      if (wantsMove) {
        if (camera?.moveDir) camera.moveDir(mv, wish); else wish.set(mv.x, 0, -mv.y);
        wish.normalize();
        // analog stick: slow walk … walk; past 90 % (or Shift) run
        const target = run ? RUN_SPEED : WALK_SPEED * (0.35 + 0.65 * Math.min(1, mag / 0.9));
        wish.multiplyScalar(target);
        // face where we're going
        const want = Math.atan2(wish.x, wish.z);
        heading = wrap(heading + wrap(want - heading) * damp(state === 'air' ? 4 : TURN_RATE, dt));
      } else wish.set(0, 0, 0);
      const ax = grounded ? (wish.lengthSq() >= vel.lengthSq() ? ACCEL : DECEL) : AIR_ACCEL;
      tmp.subVectors(wish, vel);
      tmp.y = 0;
      const dl = tmp.length();
      if (dl > 1e-6) vel.addScaledVector(tmp, Math.min(1, (ax * dt) / dl));

      // jump (buffered, with coyote time)
      if (jumpBuf > 0 && state === 'move' && (grounded || sinceGround < COYOTE) && landT <= 0.05) {
        jumpBuf = 0;
        vy = JUMP_SPEED;
        grounded = false;
        jumped = true;
        state = 'air';
        airT = 0;
        fallFrom = position.y;
        const a = play('jumpStart', { fade: 0.08, timeScale: 1.5 });
        if (a) a.time = 0.06;
        emitAction('jump');
      }
      if (!grounded) vy -= GRAVITY * dt;
      const wasGrounded = grounded;
      moved = moveBody(dt);
      if (grounded) sinceGround = 0; else sinceGround += dt;

      if (state === 'move' && !grounded && !wasGrounded && sinceGround > 0.14) {
        // walked off a ledge
        state = 'air';
        airT = 0;
        jumped = false;
        fallFrom = position.y;
        play('jumpLoop', { fade: 0.25 });
      } else if (state === 'move' && wasGrounded && !grounded) {
        fallFrom = position.y;
      }
      if (state === 'air') {
        airT += dt;
        if (jumped && airT > 0.42 && character?.state === 'jumpStart') play('jumpLoop', { fade: 0.3 });
        if (grounded) {
          // landed
          const drop = fallFrom - position.y;
          state = 'move';
          jumped = false;
          emitStep(speed > 3);
          if ((drop > 0.25 || airT > 0.45) && speed < 1.2) {
            play('jumpLand', { fade: 0.08, timeScale: 1.6 });
            landT = 0.42;
          } else {
            landT = 0;
            play(speed > 0.3 ? 'walk' : 'idle', { fade: 0.18 });
          }
        }
      }
    } else if (state === 'sit') {
      if (phase === 'approach') {
        const k = Math.min(1, phaseT / (0.3 + 0.15 * sitFrom.pos.distanceTo(sitTo.pos)));
        const e = smooth(k);
        position.lerpVectors(sitFrom.pos, sitTo.pos, e);
        heading = sitFrom.rot + wrap(sitTo.rot - sitFrom.rot) * e;
        if (k >= 1) { phase = 'down'; phaseT = 0; play('sitDown', { fade: 0.2, timeScale: 1.25 }); }
      } else if (phase === 'down') {
        if (phaseT > 1.3 / 1.25 - 0.08) { phase = 'seated'; phaseT = 0; play('sit', { fade: 0.25 }); }
        else if (wantsMove && phaseT > 0.25) stand();
      } else if (phase === 'seated') {
        if ((wantsMove && phaseT > 0.25) || jumpBuf > 0) { jumpBuf = 0; stand(); }
      } else if (phase === 'up') {
        if (phaseT > 1.033 / 1.35 - 0.05 || (wantsMove && phaseT > 0.5)) finishStand();
      }
    } else if (state === 'kneel') {
      if (phase === 'down') {
        if (!handsUp && (!kneelAct || kneelAct.time > 0.62)) handsUp = true;
        if (wantsMove && phaseT > 0.3) stand();
        else if (!kneelAct || kneelAct.time >= KNEEL_HOLD[0]) {
          phase = 'pray';
          phaseT = 0;
          emitAction('pray');
        }
      } else if (phase === 'pray') {
        if (kneelAct && kneelAct.time > KNEEL_HOLD[1]) kneelAct.time = KNEEL_HOLD[0] + (kneelAct.time - KNEEL_HOLD[1]);
        if ((wantsMove && phaseT > 0.3) || jumpBuf > 0) { jumpBuf = 0; stand(); }
      } else if (phase === 'up') {
        const done = kneelAct ? kneelAct.time >= KNEEL_END - 0.12 || kneelAct.time < KNEEL_UP - 0.5 : phaseT > 0.7;
        if (done) finishStand();
      }
      if (phase === 'up') handsUp = false;
      if (handsUp) character?.raiseHands(0.8); // keep-alive: fades out ~0.8 s after we stop
      const wantPray = phase === 'pray' || (phase === 'down' && (!kneelAct || kneelAct.time > 0.45)) ? 1 : 0;
      prayW += (wantPray - prayW) * damp(phase === 'up' ? 9 : 5, dt);
      armW += ((handsUp ? 1 : 0) - armW) * damp(handsUp ? 7 : 12, dt);
    } else if (state === 'lie') {
      if (phase === 'approach') {
        const k = Math.min(1, phaseT / (0.35 + 0.2 * sitFrom.pos.distanceTo(sitTo.pos)));
        const e = smooth(k);
        position.lerpVectors(sitFrom.pos, sitTo.pos, e);
        heading = sitFrom.rot + wrap(sitTo.rot - sitFrom.rot) * e;
        if (k >= 1) { phase = 'lying'; phaseT = 0; play('lie', { fade: 0.35 }); }
      } else if ((wantsMove && phaseT > 0.4) || jumpBuf > 0) { jumpBuf = 0; getUp(); }
    } else if (state === 'emote') {
      if (wantsMove || jumpBuf > 0) stopEmote(true);
      else if (emoteKind === 'interact' && phaseT > 1.0) stopEmote(true);
      else if (emoteKind === 'act' && phaseT > emoteFor) stopEmote(true);
    }

    // ---------------- speed (actual, so walking into a wall plays idle)
    const actual = dt > 0 ? moved / dt : 0;
    speed += (Math.min(actual, RUN_SPEED * 1.2) - speed) * damp(14, dt);
    if (speed < 0.02) speed = 0;

    // ---------------- animation
    if (landT > 0 && state === 'move') {
      landT -= dt;
      if (speed > 0.6) landT = 0;
      if (landT <= 0) play(speed > 0.3 ? 'walk' : 'idle', { fade: 0.25 });
    } else if (state !== 'move') landT = 0;
    if (character) {
      if (state === 'move') {
        if (landT <= 0) {
          const cur = character.state;
          if (cur && !['idle', 'walk', 'jog', 'run'].includes(cur)) play(speed > 0.3 ? 'walk' : 'idle', { fade: 0.2 });
          character.setLocomotion(speed);
        }
      }
      if (deps.updateCharacter !== false) character.update(dt);
      if (prayW > 0.001) applyPrayPose(character.bones, heading, prayW, { keepArms: armW, lean: 0.12 });
      lastAnimState = character.state || lastAnimState;
    }
    object.rotation.y = heading;
    visual.position.multiplyScalar(1 - damp(14, dt));
    if (visual.position.lengthSq() < 1e-8) visual.position.set(0, 0, 0);

    // ---------------- events
    detectSteps(dt);
    if (frameStart.distanceToSquared(position) > 1e-8) {
      bus?.emit('player:moved', { position, surface: surfaceHere(), speed });
    }
    zoneT -= dt;
    if (zoneT <= 0 && world?.zoneAt) {
      zoneT = 0.25;
      const z = world.zoneAt(position);
      const id = z?.id ?? null;
      if (id !== zoneId) {
        zoneId = id;
        if (z) bus?.emit('player:zone', { zone: z });
      }
    }
    nearbyT -= dt;
    if (nearbyT <= 0) {
      nearbyT = 0.15;
      const it = state === 'move' || state === 'emote' ? nearestInteractable() : null;
      if (it !== nearby) {
        nearby = it;
        input?.setButton?.('interact', { label: it ? buttonLabel(it) : null, active: !!it });
        bus?.emit('player:nearby', { item: it });
      }
    }
    updateShadowFocus();
  }

  /**
   * Place the player (spawns, fast travel). Stands up first if needed.
   * @param {THREE.Vector3|{x:number,y:number,z:number}} p
   * @param {number} [rotY]
   */
  function teleport(p, rotY = heading) {
    if (seat) { seat.taken = false; seat = null; }
    if (state !== 'move') { state = 'move'; phase = ''; kneelAct = null; prayW = 0; emoteAct = null; emoteKind = ''; }
    input?.setButton?.('sit', { label: null });
    input?.setButton?.('kneel', { label: null });
    position.set(p.x, p.y ?? groundAt(p.x, p.z), p.z);
    if (physics) position.y = Math.max(position.y, physics.groundHeight(p.x, p.z, position.y));
    vel.set(0, 0, 0);
    vy = 0;
    grounded = true;
    speed = 0;
    heading = rotY;
    object.rotation.y = heading;
    visual.position.set(0, 0, 0);
    play('idle', { fade: 0 });
    camera?.behind?.(heading);
    camera?.snap?.();
    zoneT = 0;
    surfaceAt.set(1e9, 0, 0);
  }

  const player = {
    object,
    position,
    /** 'move' | 'air' | 'sit' | 'lie' | 'kneel' | 'emote' */
    get state() { return state; },
    /** Sub-phase of sit / kneel ('approach', 'down', 'seated', 'pray', 'up'). */
    get phase() { return phase; },
    /** Horizontal velocity (m/s) and vertical speed. */
    velocity: vel,
    get verticalSpeed() { return vy; },
    get grounded() { return grounded; },
    /** Actual ground speed (m/s), smoothed. */
    get speed() { return speed; },
    /** Facing (rotation.y). */
    get heading() { return heading; },
    /** Seat being used, or null. */
    get seat() { return seat; },
    /** Nearest interactable in reach, or null. */
    get nearby() { return nearby; },
    /** Animation state for multiplayer (`a` in state messages). */
    get animState() { return lastAnimState; },
    get character() { return character; },
    radius: RADIUS,
    height,
    update,
    sitAt,
    lieAt,
    act,
    stand,
    teleport,
    kneel,
    dispose() {
      object.removeFromParent();
      if (seat) seat.taken = false;
    },
  };

  if (world?.spawns?.player) teleport(world.spawns.player.position, world.spawns.player.rotY || 0);
  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.player = {
      get state() { return state; }, get phase() { return phase; }, get grounded() { return grounded; },
      get speed() { return speed; }, get heading() { return heading; }, get seat() { return seat; },
      get nearby() { return nearby; }, get anim() { return lastAnimState; },
      get position() { return position.clone(); },
    };
  }
  return player;
}

/** Short verbs for the touch Interact button when an interactable's label is long. */
const ACTION_LABELS = {
  pray: 'Pray', sit: 'Sit', 'buy-food': 'Buy food', 'board-danfo': 'Board bus', 'ring-bell': 'Ring bell',
  'play-keyboard': 'Play keys', 'open-door': 'Door',
};
/** Keep context labels short enough for the touch button (`short` wins, then the label, then the action). */
function buttonLabel(it) {
  if (it.short) return String(it.short);
  const s = String(it.label || '').trim();
  if (s && s.length <= 12) return s;
  return ACTION_LABELS[it.action] || (s ? `${s.slice(0, 11)}…` : 'Interact');
}

/** Simple stand-in body when no character is given (tests / tools). */
function makeStandIn() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#c4b5fd', roughness: 0.6 });
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.2, 4, 12), mat);
  cap.position.y = 0.86;
  cap.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), new THREE.MeshStandardMaterial({ color: '#000' }));
  nose.position.set(0, 1.5, 0.27);
  g.add(cap, nose);
  return g;
}
