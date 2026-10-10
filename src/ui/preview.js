// Live rotating 3D preview of the player's character for the appearance editor.
// Uses its own small WebGLRenderer on the editor's canvas (created when the editor opens,
// fully released when it closes) and createCharacter from src/characters when available.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{getKit: () => Promise<{kit: object, createCharacter: Function}>, quality?: string, onState?: (state: 'loading'|'ready'|'error') => void}} o
 */
export function createPreview(canvas, { getKit, quality = 'medium', onState = () => {} }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    onState('error');
    return { setAppearance() {}, wave() {}, dispose() {}, get ready() { return false; } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.HemisphereLight('#fff8ec', '#b59f7c', 1.1));
  const key = new THREE.DirectionalLight('#fff1d6', 2.3);
  key.position.set(2.2, 3.6, 3.2);
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.5);
  rim.position.set(-2.8, 2.6, -2.6);
  const fill = new THREE.DirectionalLight('#ffe6cc', 0.5);
  fill.position.set(-3, 1, 2.5);
  scene.add(key, rim, fill);

  // Stage: a cream disc with an ink outline (neo-brutalist) and a soft contact shadow.
  const stage = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshBasicMaterial({ color: '#fffdf7' }));
  disc.rotation.x = -Math.PI / 2;
  const ringGeo = new THREE.RingGeometry(0.62, 0.645, 64);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#000000' }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  const shadowTex = makeShadowTexture();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  stage.add(disc, ring, shadow);
  scene.add(stage);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  const target = new THREE.Vector3(0, 0.98, 0);

  let char = null;
  let wanted = null;
  let building = false;
  let disposed = false;
  let raf = 0;
  let last = performance.now();
  let spin = 0.45;
  let vel = 0;
  let drag = null;
  let ready = false;
  let timer = 0;

  function frame(w, h) {
    const aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    // Fit ~2.45 m vertically (head room under the title bar) and ~1.5 m horizontally.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Squarer stages (phones) leave room for the title bar above the head and the
    // name tag below the feet.
    const fit = aspect < 1.3 ? 2.95 : 2.6;
    const dist = Math.max(fit / (2 * tan), 1.5 / (2 * tan * aspect));
    target.y = aspect < 1.3 ? 1.0 : 0.86;
    camera.position.set(0, target.y + dist * 0.06, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    frame(w, h);
  });
  ro.observe(canvas);

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag) {
      vel *= Math.exp(-dt * 3);
      pivot.rotation.y += (spin + vel) * dt;
    }
    if (char) char.update(dt);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  // Drag to turn the character.
  const onDown = (e) => {
    drag = { x: e.clientX, id: e.pointerId, t: performance.now() };
    canvas.setPointerCapture?.(e.pointerId);
    spin = 0;
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const now = performance.now();
    pivot.rotation.y += dx * 0.012;
    vel = (dx * 0.012) / Math.max(0.016, (now - drag.t) / 1000);
    drag.x = e.clientX;
    drag.t = now;
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    vel = Math.max(-6, Math.min(6, vel));
    setTimeout(() => { if (!drag) spin = 0.45; }, 2500);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  async function build() {
    if (building || disposed) return;
    building = true;
    try {
      while (wanted && !disposed) {
        const a = wanted;
        wanted = null;
        let lib;
        try {
          lib = await getKit();
        } catch (e) {
          console.warn('[ui] character preview unavailable', e);
          onState('error');
          return;
        }
        if (disposed) return;
        const next = lib.createCharacter(lib.kit, a, { detail: 'high' });
        next.play('idle', { fade: 0 });
        if (char) {
          next.object.rotation.copy(char.object.rotation);
          char.dispose();
        }
        char = next;
        pivot.add(char.object);
        if (!ready) { ready = true; onState('ready'); }
      }
    } finally {
      building = false;
    }
  }

  return {
    get ready() { return ready; },
    /** Show this appearance (debounced; rebuilds the character). */
    setAppearance(appearance) {
      wanted = appearance;
      clearTimeout(timer);
      timer = setTimeout(build, char ? 60 : 0);
    },
    wave(seconds = 1.8) { char?.wave(seconds); },
    /** Face the camera for a moment (after a change). */
    face() { pivot.rotation.y = 0; vel = 0; },
    stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      char?.dispose();
      char = null;
      disc.geometry.dispose(); disc.material.dispose();
      ringGeo.dispose(); ring.material.dispose();
      shadow.geometry.dispose(); shadow.material.dispose(); shadowTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,0.42)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
