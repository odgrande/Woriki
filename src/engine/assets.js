// Loads glTF assets once and caches them. Character files are meshopt-compressed.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export function createAssets(base = '/assets/') {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  return {
    /** @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>} */
    gltf(path) {
      // Hosts that only serve plain data types get JSON glTF copies (see tools/embed-gltf.mjs).
      const file = import.meta.env.VITE_GLTF_JSON ? path.replace(/\.glb$/, '.gltf.json') : path;
      if (!cache.has(path)) cache.set(path, loader.loadAsync(base + file));
      return cache.get(path);
    },
  };
}
