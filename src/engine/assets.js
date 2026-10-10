// Loads glTF assets once and caches them. Character files are meshopt-compressed.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Hosts that refuse .glb files get {"glb": base64} copies with compression already decoded
// (see tools/embed-gltf.mjs), so no WebAssembly decoder or data: URL is needed.
const JSON_MODE = !!import.meta.env.VITE_GLTF_JSON;

export function createAssets(base = '/assets/') {
  const loader = new GLTFLoader();
  const ready = JSON_MODE
    ? Promise.resolve()
    : import('three/addons/libs/meshopt_decoder.module.js').then(({ MeshoptDecoder }) => { loader.setMeshoptDecoder(MeshoptDecoder); });
  const cache = new Map();

  async function loadJson(path) {
    const res = await fetch(base + path.replace(/\.glb$/, '.glb.json'));
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const { glb } = await res.json();
    const bin = atob(glb);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Strict hosts also refuse fetch() of blob: URLs, which GLTFLoader's ImageBitmapLoader uses.
    // Hiding createImageBitmap while the parser is constructed makes it fall back to <img> loading.
    return new Promise((resolve, reject) => {
      const cib = globalThis.createImageBitmap;
      globalThis.createImageBitmap = undefined;
      try { loader.parse(bytes.buffer, base, resolve, reject); } finally { globalThis.createImageBitmap = cib; }
    });
  }

  return {
    /** @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>} */
    gltf(path) {
      if (!cache.has(path)) cache.set(path, ready.then(() => (JSON_MODE ? loadJson(path) : loader.loadAsync(base + path))));
      return cache.get(path);
    },
  };
}
