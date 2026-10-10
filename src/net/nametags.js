// Name tags above remote players: small neo-brutalist pills projected from 3D each
// frame. Only the nearest few are shown. Also a fallback speech bubble for chat
// when the shared bubbles module (src/ui/bubbles.js) is not wired in.
import * as THREE from 'three';
import { ROLE_LABEL, ROLE_COLOR } from './roles.js';
import './nametags.css';

/**
 * @param {{camera: THREE.Camera, root?: HTMLElement, canvas?: HTMLElement, max?: number, maxDistance?: number}} o
 */
export function createNameTags({ camera, root, canvas, max = 12, maxDistance = 30 }) {
  const layer = document.createElement('div');
  layer.className = 'nt-layer';
  layer.setAttribute('aria-hidden', 'true');
  (root || document.body).appendChild(layer);
  /** @type {Map<string, any>} */
  const tags = new Map();
  const v = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  /** Width / height of a tag (pill + bubble), read once per content change. */
  function measure(t) {
    const wasShown = t.el.classList.contains('on');
    if (!wasShown) t.el.classList.add('on');
    const say = !t.sayEl.hidden;
    t.w = Math.max(t.pillEl.offsetWidth, say ? t.sayEl.offsetWidth : 0) || 90;
    t.h = (t.pillEl.offsetHeight || 20) + (say ? t.sayEl.offsetHeight + 10 : 0);
    if (!wasShown) t.el.classList.remove('on');
  }

  function setContent(tag, { name, role }) {
    tag.w = 0; // re-measure
    if (name !== undefined) tag.nameEl.textContent = name;
    if (role !== undefined) {
      tag.roleEl.style.setProperty('--role', ROLE_COLOR[role] || '#e4e4e7');
      tag.roleEl.textContent = ROLE_LABEL[role] || role;
    }
  }

  return {
    /**
     * @param {string} key
     * @param {THREE.Object3D} object anchor (feet)
     * @param {{name: string, role?: string, height?: number, self?: boolean}} info
     */
    add(key, object, { name, role = 'visitor', height = 2.05, self = false }) {
      const el = document.createElement('div');
      el.className = 'nt' + (self ? ' nt-self' : '');
      el.innerHTML = '<div class="nt-say" hidden></div><div class="nt-pill"><span class="nt-role"></span><span class="nt-name"></span></div>';
      const tag = {
        el, object, height, enabled: true, shown: false, sayUntil: 0, x: NaN, y: NaN, s: NaN, o: NaN, w: 0,
        nameEl: el.querySelector('.nt-name'), roleEl: el.querySelector('.nt-role'), sayEl: el.querySelector('.nt-say'),
        pillEl: el.querySelector('.nt-pill'), h: 20,
      };
      setContent(tag, { name, role });
      layer.appendChild(el);
      tags.set(key, tag);
      return tag;
    },
    set(key, info) { const t = tags.get(key); if (t) setContent(t, info); },
    setHeight(key, h) { const t = tags.get(key); if (t) t.height = h; },
    setEnabled(key, on) { const t = tags.get(key); if (t) t.enabled = on; },
    /** Fallback chat bubble above the tag. */
    say(key, text, seconds = 5) {
      const t = tags.get(key);
      if (!t) return;
      t.sayEl.textContent = text;
      t.sayEl.hidden = false;
      t.w = 0;
      t.el.classList.remove('nt-pop');
      void t.el.offsetWidth; // restart the pop animation
      t.el.classList.add('nt-pop');
      t.sayUntil = performance.now() + seconds * 1000;
    },
    remove(key) {
      const t = tags.get(key);
      if (!t) return;
      t.el.remove();
      tags.delete(key);
    },
    /** Project and place tags. Call once per frame after the camera moved. */
    update() {
      const w = (canvas && canvas.clientWidth) || window.innerWidth;
      const h = (canvas && canvas.clientHeight) || window.innerHeight;
      camera.getWorldPosition(camPos);
      const now = performance.now();
      const cands = [];
      for (const t of tags.values()) {
        if (t.sayUntil && now > t.sayUntil) { t.sayUntil = 0; t.sayEl.hidden = true; t.w = 0; }
        if (!t.enabled || !t.object.visible) { t.d = Infinity; continue; }
        t.object.getWorldPosition(v);
        v.y += t.height;
        t.d = v.distanceTo(camPos);
        const limit = t.sayUntil ? maxDistance * 1.6 : maxDistance;
        if (t.d > limit) continue;
        v.project(camera);
        if (v.z > 1 || v.z < -1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.3) continue;
        t.px = (v.x * 0.5 + 0.5) * w;
        t.py = (-v.y * 0.5 + 0.5) * h;
        cands.push(t);
      }
      // Speakers first, then nearest.
      cands.sort((a, b) => (b.sayUntil ? 1 : 0) - (a.sayUntil ? 1 : 0) || a.d - b.d);
      const shown = cands.slice(0, max);
      const show = new Set(shown);
      // Declutter: nearer tags keep their spot, farther ones step up above whatever they would overlap
      // (a tag's box is its pill plus its speech bubble, measured when the content changes).
      const placed = [];
      for (const t of shown) {
        if (!t.w) measure(t);
        const hw = t.w * 0.5 + 4;
        let y = t.py;
        for (let k = 0; k < 5; k++) {
          const hit = placed.find((p) => Math.abs(p.x - t.px) < p.hw + hw && y > p.top && y - t.h < p.y);
          if (!hit) break;
          y = hit.top - 3;
        }
        t.py = y;
        placed.push({ x: t.px, y, top: y - t.h, hw });
      }
      for (const t of tags.values()) {
        const on = show.has(t);
        if (on !== t.shown) { t.shown = on; t.el.classList.toggle('on', on); }
        if (!on) continue;
        const s = Math.max(0.72, Math.min(1, 1.12 - t.d / 28));
        const o = t.d > maxDistance * 0.7 && !t.sayUntil ? Math.max(0, 1 - (t.d - maxDistance * 0.7) / (maxDistance * 0.3)) : 1;
        // Keep the pill / bubble readable at the screen edges (width measured once per content change).
        if (!t.w) measure(t);
        const half = (t.w * s) / 2 + 6;
        const x = Math.round(Math.max(half, Math.min(w - half, t.px))), y = Math.round(Math.max(t.sayUntil ? 120 : 28, t.py));
        if (x !== t.x || y !== t.y || Math.abs(s - t.s) > 0.01) {
          t.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s.toFixed(2)})`;
          t.x = x; t.y = y; t.s = s;
        }
        if (Math.abs(o - t.o) > 0.02) { t.el.style.opacity = o.toFixed(2); t.o = o; }
        const z = 1000 - Math.round(t.d * 10);
        if (z !== t.z) { t.el.style.zIndex = String(z); t.z = z; }
      }
    },
    get count() { return tags.size; },
    get visibleCount() { let n = 0; for (const t of tags.values()) if (t.shown) n++; return n; },
    dispose() { layer.remove(); tags.clear(); },
  };
}
