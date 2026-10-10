// Speech bubbles above characters' heads (NPC lines, player chat). DOM elements projected from
// the 3D position every frame, clamped to the screen, nearest first, at most MAX at once.
import * as THREE from 'three';
import './bubbles.css';

const MAX = 8;
const MAX_DIST = 32;
const v = new THREE.Vector3();

/**
 * @param {{camera: THREE.Camera, renderer: THREE.WebGLRenderer}} ctx
 * @param {{root?: HTMLElement}} [opts]
 */
export function createBubbles(ctx, opts = {}) {
  const layer = document.createElement('div');
  layer.className = 'amen-bubbles';
  layer.setAttribute('aria-live', 'polite');
  (opts.root || document.body).appendChild(layer);

  /** @type {{el: HTMLElement, obj: THREE.Object3D, until: number, born: number, kind: string, height: number}[]} */
  let list = [];

  function remove(b) {
    b.el.remove();
    list = list.filter((x) => x !== b);
  }

  return {
    /**
     * @param {THREE.Object3D} obj the character's root (feet at y = 0)
     * @param {string} text
     * @param {{seconds?: number, kind?: 'npc'|'chat'|'self', height?: number, name?: string}} [o]
     */
    show(obj, text, o = {}) {
      if (!obj || !text) return;
      // One bubble per speaker: replace the old line.
      for (const b of list) if (b.obj === obj) remove(b);
      const el = document.createElement('div');
      el.className = `amen-bubble is-${o.kind || 'npc'}`;
      if (o.name) {
        const n = document.createElement('b');
        n.textContent = o.name;
        el.append(n, ' ');
      }
      el.append(String(text).slice(0, 200));
      layer.appendChild(el);
      const now = performance.now();
      const seconds = o.seconds ?? Math.min(9, 2.5 + String(text).length / 14);
      list.push({ el, obj, born: now, until: now + seconds * 1000, kind: o.kind || 'npc', height: o.height ?? 2.05 });
    },
    update() {
      const now = performance.now();
      const cam = ctx.camera;
      const w = layer.clientWidth || window.innerWidth;
      const h = layer.clientHeight || window.innerHeight;
      for (const b of [...list]) if (now > b.until || !b.obj.parent) remove(b);
      // Nearest first; chat outranks NPC chatter.
      const ranked = list.map((b) => {
        b.obj.getWorldPosition(v);
        v.y += b.height;
        return { b, d: v.distanceTo(cam.position) - (b.kind === 'npc' ? 0 : 6), p: v.clone() };
      }).sort((a, b) => a.d - b.d);
      ranked.forEach(({ b, d, p }, i) => {
        p.project(cam);
        const visible = i < MAX && d < MAX_DIST && p.z < 1 && p.z > -1;
        if (!visible) { b.el.style.display = 'none'; return; }
        b.el.style.display = '';
        const x = Math.min(w - 12, Math.max(12, (p.x * 0.5 + 0.5) * w));
        const y = Math.min(h - 40, Math.max(40, (-p.y * 0.5 + 0.5) * h));
        const age = (now - b.born) / 1000;
        const left = (b.until - now) / 1000;
        const scale = Math.max(0.72, Math.min(1, 1.15 - d / 40));
        b.el.style.opacity = String(Math.min(1, age * 5, left * 2));
        b.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        b.el.style.zIndex = String(100 - i);
      });
    },
    clear() { for (const b of [...list]) remove(b); },
    get count() { return list.length; },
    dispose() { layer.remove(); list = []; },
  };
}
