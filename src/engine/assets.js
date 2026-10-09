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
      if (!cache.has(path)) cache.set(path, loader.loadAsync(base + path));
      return cache.get(path);
    },
  };
}
