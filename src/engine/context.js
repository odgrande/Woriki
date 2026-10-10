// Core rendering context shared by every module: renderer, scene, camera, lights,
// quality tier, update loop and a tiny event bus.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAssets } from './assets.js';

/** @typedef {'low'|'medium'|'high'} Quality */

/** Guess a quality tier from the device. Players can override it in settings. */
export function detectQuality() {
  try {
    const saved = localStorage.getItem('amen.quality');
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch { /* storage blocked */ }
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile && (mem <= 3 || cores <= 4)) return 'low';
  if (mobile) return 'medium';
  return mem >= 8 ? 'high' : 'medium';
}

/** Minimal event bus. */
function createBus() {
  const map = new Map();
  return {
    on(type, fn) { (map.get(type) || map.set(type, new Set()).get(type)).add(fn); return () => map.get(type)?.delete(fn); },
    emit(type, data) { map.get(type)?.forEach((fn) => fn(data)); },
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ quality?: Quality }} [opts]
 */
export function createContext(canvas, opts = {}) {
  const quality = opts.quality || detectQuality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, { low: 1, medium: 1.5, high: 2 }[quality]));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bcd9ee');
  scene.fog = new THREE.Fog('#cfe2ee', 60, quality === 'low' ? 110 : 170);

  // Soft image-based lighting so PBR skin and fabrics look natural.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const hemi = new THREE.HemisphereLight('#ffffff', '#8c7a5c', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(30, 50, 20);
  sun.castShadow = quality !== 'low';
  const sm = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  const timer = new THREE.Timer();
  const updates = new Set();
  const bus = createBus();
  /** What is drawn: the world, or another scene such as the Lagos map. */
  const view = { scene: null, camera: null };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const ctx = {
    THREE, renderer, scene, camera, quality, bus, sun, hemi,
    // Relative to wherever the game is hosted (Vite's base), so it also runs from a sub-path.
    assets: createAssets(`${import.meta.env.BASE_URL}assets/`),
    /** Elapsed seconds since start. */
    time: 0,
    /** Register a per-frame update. Returns an unsubscribe function. */
    onUpdate(fn) { updates.add(fn); return () => updates.delete(fn); },
    /** Direction towards the sun (or moon), scaled to the shadow distance. */
    sunOffset: new THREE.Vector3(30, 50, 20),
    /** Keep the sun's shadow box centred on the player. */
    setShadowFocus(v) {
      sun.target.position.copy(v);
      sun.position.copy(v).add(ctx.sunOffset);
    },
    start() {
      renderer.setAnimationLoop((now) => {
        timer.update(now);
        const dt = Math.min(timer.getDelta(), 0.05);
        ctx.time += dt;
        for (const fn of updates) fn(dt, ctx.time);
        renderer.render(view.scene || scene, view.camera || camera);
      });
    },
    stop() { renderer.setAnimationLoop(null); },
    /** Draw another scene (e.g. the Lagos map) instead of the world; setView(null) goes back. */
    setView(sc = null, cam = null) { view.scene = sc; view.camera = cam; bus.emit('view:changed', { world: !sc }); },
    get viewingWorld() { return !view.scene; },
  };
  return ctx;
}
