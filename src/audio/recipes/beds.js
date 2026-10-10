// Ambience beds baked to one seamless stereo loop each: filtered noise layers with their
// slow modulations, steady hums, crowd babble and generator drones, already panned and
// mixed. At runtime a whole bed is then a single looping buffer (very cheap on phones);
// random events (cars, horns, birds…) are layered on top live.
import { Biquad, Pink, Brown, rng, makeSound, loopify, panGains, TAU } from './dsp.js';
import { babble } from './voices.js';
import { generator } from './vehicles.js';

function noiseInto(buf, color, r) {
  const gen = color === 'pink' ? new Pink(r) : color === 'brown' ? new Brown(r) : null;
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = gen ? gen.next() : r() * 2 - 1;
    buf[i] = v;
    const a = Math.abs(v); if (a > peak) peak = a;
  }
  // same level convention as the shared noise loops: peak 0.9
  const k = 0.9 / (peak || 1);
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
}

/**
 * @param {{layers: object[], seconds?: number, sr?: number, seed?: number}} o
 * Layer: { noise | osc | babble | generator, filters: [type, Hz, Q][], gain, lfo: [Hz, depth][], pan }
 */
export function bed({ layers = [], seconds = 16, sr = 12000, seed = 1 } = {}) {
  const r = rng(seed);
  const xf = 0.5;
  const out = makeSound(sr, seconds + xf, 2);
  const n = out.channels[0].length;
  const [L, R] = out.channels;
  for (const layer of layers) {
    // source material: one or two channels
    let src;
    if (layer.noise) { src = [new Float32Array(n)]; noiseInto(src[0], layer.noise, r); }
    else if (layer.osc) {
      src = [new Float32Array(n)];
      const w = TAU * layer.freq / sr;
      for (let i = 0; i < n; i++) src[0][i] = Math.sin(w * i);
    } else if (layer.babble) {
      src = babble({ ...layer.babble, seconds: seconds + xf, sr, loop: false })[0].channels;
    } else if (layer.generator) {
      const g = generator({ ...layer.generator, sr })[0].channels[0];
      src = [new Float32Array(n)];
      for (let i = 0; i < n; i++) src[0][i] = g[i % g.length];
    } else continue;
    const [gl, gr] = panGains(layer.pan || 0);
    const lfos = (layer.lfo || []).map(([hz, depth]) => ({ w: TAU * hz * (0.9 + r() * 0.2) / sr, depth, ph: r() * TAU }));
    src.forEach((ch, c) => {
      const filters = (layer.filters || []).map(([type, f, q]) => new Biquad(type, f, q, sr));
      // stereo sources keep their own image; mono sources are panned
      const toL = src.length > 1 ? (c === 0 ? 1 : 0) : gl, toR = src.length > 1 ? (c === 1 ? 1 : 0) : gr;
      for (let i = 0; i < n; i++) {
        let x = ch[i];
        for (let k = 0; k < filters.length; k++) x = filters[k].process(x);
        let g = layer.gain;
        for (let k = 0; k < lfos.length; k++) g += lfos[k].depth * Math.sin(lfos[k].w * i + lfos[k].ph);
        x *= g;
        L[i] += x * toL; R[i] += x * toR;
      }
    });
  }
  loopify(out, xf);
  return [out];
}
