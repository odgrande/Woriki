// createCharacter: one animated, dressed Nigerian character from the kit.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { normalizeAppearance } from './appearance.js';
import { makeClothMaterial, makePatternMaterial } from './materials.js';
import { createSkirtRig } from './skirt.js';
import { STATE_CLIPS, ONCE_STATES, LOCO_STATES, locomotionFor, createOverlays } from './animation.js';
import { getFabric } from './fabrics.js';
import { SKIN_TONES } from './appearance.js';

const IDENTITY = new THREE.Matrix4();

/**
 * @param {object} kit from loadCharacterKit
 * @param {Partial<import('./appearance.js').Appearance>} appearance
 * @param {{detail?: 'high'|'low'}} [opts]
 */
export function createCharacter(kit, appearance, { detail = 'high' } = {}) {
  const t0 = performance.now();
  const a = normalizeAppearance(appearance);
  const body = kit.bodies[a.body];
  const low = detail === 'low' && !!body.templateLow;
  const plan = kit.makePlan(a, body.lm);
  if (a.outfit === 'security' && plan.headwear?.kind === 'beret') {
    plan.badgeSlot = plan.slots.push({ color: '#d4af37', rough: 0.3, metal: 0.9, fx: 0 }) - 1;
    plan.key += '|badge';
  }
  const geos = kit.geometryFor(body, plan, low ? 'low' : 'high');

  // Rig: SkeletonUtils clone of the body template (bones + body mesh).
  const rig = SkeletonUtils.clone(low ? body.templateLow : body.template);
  const bodyMesh = rig.children.find((o) => o.isSkinnedMesh);
  const bones = {};
  rig.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  let boneList = body.names.map((n) => bones[n]);
  let inverses = body.boneInverses;
  let skirtRig = null;
  if (plan.skirts.length) {
    const s = plan.skirts[0];
    skirtRig = createSkirtRig(bones, body, { gravity: s.gravity ?? 0.25, margin: Math.atan2(s.flare * 0.5 + s.ease, body.lm.hipY - s.hemY) * 0.8 });
    boneList = [...boneList, ...skirtRig.bones];
    inverses = [...inverses, ...skirtRig.inverses];
  }
  const skeleton = new THREE.Skeleton(boneList, inverses.map((m) => m.clone()));
  const meshes = [];
  const ownMaterials = [];
  const addMesh = (geo, material, name) => {
    const m = new THREE.SkinnedMesh(geo, material);
    m.name = name;
    m.bind(skeleton, IDENTITY);
    m.castShadow = true;
    m.receiveShadow = !low;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
    rig.add(m);
    meshes.push(m);
    return m;
  };

  // The template's body mesh is replaced by this outfit's (trimmed) body.
  rig.remove(bodyMesh);
  const skinHex = SKIN_TONES[a.skin];
  if (!low) {
    addMesh(geos.body, kit.skinMaterial(body, a.skin), 'body');
    if (body.eyes) {
      if (!body.eyesGeo) {
        const g = new THREE.BufferGeometry();
        const e = body.eyes;
        g.setAttribute('position', new THREE.BufferAttribute(e.position, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(e.normal, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(e.uv, 2));
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(e.skinIndex, 4));
        g.setAttribute('skinWeight', new THREE.BufferAttribute(e.skinWeight, 4));
        g.setIndex(new THREE.BufferAttribute(e.index, 1));
        body.eyesGeo = g;
      }
      addMesh(body.eyesGeo, kit.eyesMaterial(body), 'eyes');
    }
    const hair = kit.hairGeometry(body, plan.hair, plan.beard);
    if (hair) addMesh(hair.geo, kit.hairMaterial(hair.material, a.hairColor), 'hair');
    if (geos.cloth) {
      const mat = makeClothMaterial(plan.slots, { lm: body.lm, embroidery: plan.fx.embroidery, anisotropy: kit.anisotropy });
      ownMaterials.push(mat);
      addMesh(geos.cloth, mat, 'cloth');
    }
    for (const p of geos.patterns) addMesh(p.geo, makePatternMaterial(plan.fabrics[p.fabric], kit.anisotropy), 'fabric');
  } else {
    const slots = plan.slots.map((s) => ({ ...s, fx: 0 }));
    slots[0] = { color: skinHex, rough: 0.6, metal: 0, fx: 0 };
    slots[1] = { color: a.hairColor, rough: 0.8, metal: 0, fx: 0 };
    for (const f of plan.fabrics) slots.push({ color: getFabric(f.kind, f.primary, f.secondary, kit.anisotropy).average, rough: f.rough, metal: 0, fx: 0 });
    const mat = makeClothMaterial(slots, { low: true });
    ownMaterials.push(mat);
    addMesh(geos.merged, mat, 'crowd');
  }

  const object = new THREE.Group();
  object.name = 'character';
  object.add(rig);

  // --- animation --------------------------------------------------------------
  const mixer = new THREE.AnimationMixer(rig);
  const actions = new Map();
  const action = (state) => {
    let act = actions.get(state);
    if (!act) {
      const clip = body.clips[STATE_CLIPS[state]];
      if (!clip) return null;
      act = mixer.clipAction(clip);
      actions.set(state, act);
    }
    return act;
  };
  const overlays = createOverlays(bones, object, body.palm);
  let current = null;
  let currentState = null;

  const character = {
    object,
    height: body.lm.height,
    appearance: a,
    detail: low ? 'low' : 'high',
    mixer,
    bones,
    skeleton,
    meshes,
    get state() { return currentState; },
    /**
     * Play an animation state with a crossfade.
     * @param {string} state
     * @param {{fade?: number, loop?: boolean, timeScale?: number, once?: boolean}} [o]
     */
    play(state, o = {}) {
      const act = action(state);
      if (!act) return null;
      const fade = o.fade ?? 0.25;
      const once = o.once ?? (o.loop === undefined ? ONCE_STATES.has(state) : !o.loop);
      if (o.timeScale !== undefined) act.timeScale = o.timeScale;
      else if (current !== act) act.timeScale = 1;
      if (current === act && act.isRunning() && !once) return act;
      act.reset();
      act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      act.clampWhenFinished = once;
      act.enabled = true;
      act.setEffectiveWeight(1);
      if (state === 'lie') { act.paused = true; act.time = 0; }
      // Keep footfalls in phase between walk / jog / run.
      if (current && LOCO_STATES.has(state) && LOCO_STATES.has(currentState) && state !== 'idle' && currentState !== 'idle') {
        act.time = (current.time / current.getClip().duration) * act.getClip().duration;
      }
      act.play();
      if (current && current !== act && fade > 0) current.crossFadeTo(act, fade, false);
      else if (current && current !== act) current.stop();
      current = act;
      currentState = state;
      return act;
    },
    /** Pick idle / walk / jog / run for a ground speed (m/s) and match the stride. */
    setLocomotion(speed) {
      const loco = locomotionFor(speed, currentState);
      // Standing still keeps a non-locomotion pose (talk, phone, sit…) the caller chose.
      if (loco.state === 'idle' && currentState && !LOCO_STATES.has(currentState)) return;
      if (loco.state !== currentState) this.play(loco.state, { fade: 0.22, timeScale: loco.timeScale });
      else if (current) current.timeScale = loco.timeScale;
    },
    wave(seconds = 2) { overlays.start('wave', seconds); },
    clap(seconds = 3) { overlays.start('clap', seconds); },
    raiseHands(seconds = 3) { overlays.start('raiseHands', seconds); },
    get overlay() { return overlays.active; },
    update(dt) {
      mixer.update(dt);
      if (skirtRig) skirtRig.update(dt);
      overlays.update(dt);
    },
    dispose() {
      object.removeFromParent();
      mixer.stopAllAction();
      mixer.uncacheRoot(rig);
      skeleton.dispose();
      for (const m of ownMaterials) m.dispose();
    },
    stats: { triangles: 0, drawCalls: meshes.length, buildMs: 0 },
  };
  character.play('idle', { fade: 0 });
  mixer.update(0);

  let tris = 0;
  for (const m of meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  character.stats.triangles = Math.round(tris);
  character.stats.buildMs = +(performance.now() - t0).toFixed(1);
  const key = low ? 'low' : 'high';
  const s = kit.stats[key] || (kit.stats[key] = { count: 0, trianglesAvg: 0, trianglesMax: 0, drawCallsMax: 0, buildMsAvg: 0, buildMsMax: 0 });
  s.count++;
  s.trianglesAvg = Math.round(s.trianglesAvg + (tris - s.trianglesAvg) / s.count);
  s.trianglesMax = Math.max(s.trianglesMax, Math.round(tris));
  s.drawCallsMax = Math.max(s.drawCallsMax, meshes.length);
  s.buildMsAvg = +(s.buildMsAvg + (character.stats.buildMs - s.buildMsAvg) / s.count).toFixed(1);
  s.buildMsMax = Math.max(s.buildMsMax, character.stats.buildMs);
  kit.stats.built++;
  kit.stats.cachedGeometries = kit.cache.geo.size;
  if (typeof window !== 'undefined') {
    window.__amen = window.__amen || {};
    window.__amen.characterStats = kit.stats;
  }
  return character;
}
