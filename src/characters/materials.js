// Materials for characters. Skin is the body texture re-tinted so its average matches a
// real skin albedo; plain cloth uses one shared shader with a per-vertex colour slot
// (so a whole outfit is one draw call) plus small procedural details: hi-vis reflective
// tape, chest embroidery, aso-oke shimmer and denim twill.
import * as THREE from 'three';
import { getFabric } from './fabrics.js';

const linear = (hex) => new THREE.Color(hex); // THREE.Color stores linear components

/** Average linear colour of a texture's skin pixels (ignores the dark underwear). */
export function textureAverage(texture) {
  const img = texture?.image;
  if (!img) return new THREE.Color(0.5, 0.35, 0.25);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 64, 64);
  const px = g.getImageData(0, 0, 64, 64).data;
  const acc = [0, 0, 0];
  let n = 0;
  const tmp = new THREE.Color();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
    // skip near-grey (underwear) and near-black pixels
    if (r - b < 0.08 || r < 0.25) continue;
    tmp.setRGB(r, gg, b, THREE.SRGBColorSpace);
    acc[0] += tmp.r; acc[1] += tmp.g; acc[2] += tmp.b; n++;
  }
  return n ? new THREE.Color(acc[0] / n, acc[1] / n, acc[2] / n) : new THREE.Color(0.5, 0.35, 0.25);
}

/**
 * Skin material: body texture tinted so the average equals the target tone.
 * @param {THREE.MeshStandardMaterial} src
 * @param {THREE.Color} avg linear average of the texture
 * @param {string} toneHex sRGB target
 */
export function makeSkinMaterial(src, avg, toneHex) {
  const m = src.clone();
  const t = linear(toneHex);
  m.color.setRGB(t.r / avg.r, t.g / avg.g, t.b / avg.b);
  m.vertexColors = false;
  m.roughness = 0.68;
  m.metalness = 0;
  m.envMapIntensity = 0.7;
  if (m.normalScale) m.normalScale.set(0.8, 0.8);
  m.name = 'skin';
  return m;
}

export function makeHairMaterial(src, colorHex) {
  const m = src.clone();
  m.color.set(colorHex).multiplyScalar(2.2);
  m.vertexColors = false;
  m.roughness = 0.55;
  m.metalness = 0;
  m.envMapIntensity = 0.6;
  m.name = 'hair';
  return m;
}

export const FX = { none: 0, hivis: 1, embroidery: 2, asooke: 3, denim: 4 };

/**
 * Plain-cloth material driven by per-vertex slots.
 * @param {{color: string, rough: number, metal: number, fx: number}[]} slots
 * @param {object} o {low, lm (landmarks for effects), embroidery: hex, anisotropy, skin?: hex}
 */
export function makeClothMaterial(slots, o = {}) {
  const low = !!o.low;
  const MAX = 16;
  const colors = [], mats = [];
  for (let i = 0; i < MAX; i++) {
    const s = slots[i] || slots[0] || { color: '#888888', rough: 0.8, metal: 0, fx: 0 };
    const c = linear(s.color);
    colors.push(new THREE.Vector4(c.r, c.g, c.b, s.fx || 0));
    mats.push(new THREE.Vector4(s.rough ?? 0.8, s.metal ?? 0, 0, 0));
  }
  const weave = low ? null : getFabric('weave', '#ffffff', '#ffffff', o.anisotropy || 4).texture;
  const m = new THREE.MeshStandardMaterial({ map: weave, roughness: 0.8, metalness: 0 });
  m.name = low ? 'cloth-low' : 'cloth';
  const lm = o.lm;
  const emb = linear(o.embroidery || '#d4af37');
  const uniforms = {
    uSlotColor: { value: colors },
    uSlotMat: { value: mats },
    uFx0: { value: new THREE.Vector4(lm ? lm.chestY - 0.02 : 1.3, lm ? lm.waistY + 0.02 : 1.0, 0.022, lm ? lm.shoulderX * 0.52 : 0.1) },
    uFx1: { value: new THREE.Vector4(lm ? lm.necklineFront + 0.035 : 1.5, lm ? lm.neckZ + 0.03 : 0, 0.04, 0.26) },
    uEmb: { value: new THREE.Vector3(emb.r, emb.g, emb.b) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSlot;
uniform vec4 uSlotColor[${MAX}];
uniform vec4 uSlotMat[${MAX}];
varying vec4 vSlotColor;
varying vec2 vSlotMat;
${low ? '' : 'attribute vec3 aRest;\nvarying vec3 vRest;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
int sIdx = int(aSlot + 0.5);
vSlotColor = uSlotColor[sIdx];
vSlotMat = uSlotMat[sIdx].xy;
${low ? '' : 'vRest = aRest;'}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vSlotColor;
varying vec2 vSlotMat;
${low ? '' : `varying vec3 vRest;
uniform vec4 uFx0;
uniform vec4 uFx1;
uniform vec3 uEmb;`}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float clothRough = vSlotMat.x;
float clothMetal = vSlotMat.y;
diffuseColor.rgb *= vSlotColor.rgb;
${low ? '' : `
float fx = vSlotColor.a;
if (fx > 0.5 && fx < 1.5) {
  // hi-vis vest: two horizontal reflective bands and two braces over the shoulders
  float bw = uFx0.z;
  float band = max(step(abs(vRest.y - uFx0.x), bw), step(abs(vRest.y - uFx0.y), bw));
  band = max(band, step(abs(abs(vRest.x) - uFx0.w), bw * 0.8) * step(uFx0.x, vRest.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.66), band);
  clothRough = mix(clothRough, 0.3, band);
  clothMetal = mix(clothMetal, 0.55, band);
} else if (fx > 1.5 && fx < 2.5) {
  // embroidered yoke round the front neckline and a panel down the placket
  vec2 q = vec2(vRest.x, vRest.y - uFx1.x);
  float front = smoothstep(uFx1.y - 0.01, uFx1.y + 0.01, vRest.z);
  float d = length(q);
  float r1 = uFx1.z, r2 = uFx1.z + 0.05;
  float v = (d - r1) / (r2 - r1);
  float inRing = step(0.0, v) * step(v, 1.0) * step(q.y, 0.01);
  float ang = atan(q.x, -q.y);
  vec2 cell = vec2(fract(ang * 6.0), fract(v * 1.5 + 0.25));
  float motif = smoothstep(0.36, 0.3, abs(cell.x - 0.5) + abs(cell.y - 0.5)) - smoothstep(0.24, 0.18, abs(cell.x - 0.5) + abs(cell.y - 0.5));
  float lines = step(abs(v - 0.1), 0.05) + step(abs(v - 0.9), 0.05);
  float inPl = step(abs(q.x), 0.032) * step(q.y, -r1 + 0.005) * step(-uFx1.w, q.y);
  vec2 pc = vec2(q.x / 0.064 + 0.5, fract(q.y * 22.0));
  float pm = smoothstep(0.34, 0.28, abs(pc.x - 0.5) + abs(pc.y - 0.5)) + step(0.42, abs(pc.x - 0.5));
  float region = front * max(inRing, inPl);
  float thread = front * max(inRing * min(1.0, motif + lines), inPl * min(1.0, pm));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, uEmb, 0.35), region);
  diffuseColor.rgb = mix(diffuseColor.rgb, uEmb, thread);
  clothRough = mix(clothRough, 0.4, thread);
  clothMetal = mix(clothMetal, 0.4, thread);
} else if (fx > 2.5 && fx < 3.5) {
  // aso-oke: fine woven stripes with metallic threads
  #ifdef USE_MAP
  float s1 = abs(fract(vMapUv.y * 3.0) - 0.5);
  float thread = step(0.42, s1);
  diffuseColor.rgb *= 0.85 + 0.25 * smoothstep(0.0, 0.5, s1);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + 0.05, thread * 0.6);
  clothMetal = mix(clothMetal, 0.6, thread);
  #endif
} else if (fx > 3.5 && fx < 4.5) {
  // denim twill
  #ifdef USE_MAP
  float tw = smoothstep(0.3, 0.7, abs(fract((vMapUv.x + vMapUv.y) * 5.0) - 0.5) * 2.0);
  diffuseColor.rgb *= 0.93 + 0.1 * tw;
  #endif
}`}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clothRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = clothMetal;');
  };
  m.customProgramCacheKey = () => (low ? 'amen-cloth-low-1' : 'amen-cloth-1');
  return m;
}

/** Set a slot colour on an existing cloth material (e.g. live appearance editing). */
export function setClothSlot(material, i, hex) {
  const u = material.userData.uniforms;
  if (!u) return;
  const c = linear(hex);
  u.uSlotColor.value[i].set(c.r, c.g, c.b, u.uSlotColor.value[i].w);
}

const patternCache = new Map();
/** Shared material for a patterned fabric. */
export function makePatternMaterial(f, anisotropy = 4) {
  const key = `${f.kind}|${f.primary}|${f.secondary}|${f.rough}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const fab = getFabric(f.kind, f.primary, f.secondary, anisotropy);
  const m = new THREE.MeshStandardMaterial({ map: fab.texture, roughness: f.rough, metalness: 0 });
  m.name = 'fabric-' + f.kind;
  patternCache.set(key, m);
  return m;
}
