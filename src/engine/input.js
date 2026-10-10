// Player input: keyboard, mouse drag / wheel, and touch (floating joystick on the left
// half, drag-to-look and pinch on the right half, action buttons bottom-right).
// Game code reads `input.move`, `input.run`, `lookDelta()`, `zoomDelta()` and `consume(name)`.
import './input.css';

/** Action names and the keys that trigger them (KeyboardEvent.code, or `key:` for KeyboardEvent.key). */
const KEYMAP = {
  Space: 'jump', KeyC: 'sit', KeyP: 'kneel', KeyE: 'wave', KeyG: 'clap', KeyB: 'dance', KeyF: 'interact',
  Enter: 'chat', NumpadEnter: 'chat', KeyT: 'chat', KeyN: 'endday', Escape: 'escape',
};
const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** A press nobody consumed within this time (ms) is dropped (no surprise actions later). */
const PRESS_TTL = 750;

/** Key help for the controls panel (UI reads this; order = display order). */
export const KEY_BINDINGS = [
  { keys: ['W', 'S'], alt: '↑ ↓', action: 'Walk forward / back' },
  { keys: ['A', 'D'], alt: '← →', action: 'Turn left / right' },
  { keys: ['Shift'], action: 'Run (hold)' },
  { keys: ['Space'], action: 'Jump' },
  { keys: ['C'], action: 'Sit / stand' },
  { keys: ['P'], action: 'Kneel and pray' },
  { keys: ['E'], action: 'Wave' },
  { keys: ['G'], action: 'Clap' },
  { keys: ['B'], action: 'Dance' },
  { keys: ['F'], action: 'Interact' },
  { keys: ['Enter'], alt: 'T', action: 'Chat' },
  { keys: ['?'], action: 'Help' },
  { keys: ['N'], action: 'End the day' },
  { keys: ['Esc'], action: 'Close / menu' },
  { keys: ['Drag'], alt: 'Wheel to zoom', action: 'Look around' },
  { keys: ['V'], alt: 'eye button', action: 'Change camera view' },
  { keys: ['M'], action: 'Lagos map' },
  { keys: ['H'], action: 'Go home' },
];

// Lucide-style inline icons (24×24, stroke = currentColor).
const ICONS = {
  jump: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  interact: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  sit: '<path d="M7 18v3"/><path d="M17 18v3"/><path d="M5 11V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5"/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  wave: '<path d="M7.5 12.5 4.6 9.6a1.6 1.6 0 0 1 2.3-2.3l3.6 3.6"/><path d="m8.3 8.3-1-1a1.6 1.6 0 0 1 2.3-2.3l4.4 4.4"/><path d="m10.6 6 0-.1a1.6 1.6 0 0 1 2.3-2.3l4.3 4.3a6 6 0 0 1-8.5 8.5L5 12.6"/><path d="M18.5 2.5a4 4 0 0 1 3 3"/><path d="M2.5 15.5a4 4 0 0 0 3 3"/>',
  kneel: '<path d="M12 2.5c-1.1 1.3-2.5 3.7-2.5 6.9v3.4L6.4 16.2a1.8 1.8 0 0 0 0 2.5l2 2"/><path d="M12 2.5c1.1 1.3 2.5 3.7 2.5 6.9v3.4l3.1 3.4a1.8 1.8 0 0 1 0 2.5l-2 2"/><path d="M12 2.5v11.5"/><path d="M4.5 4.5 3 3"/><path d="M19.5 4.5 21 3"/>',
};

const BUTTONS = [
  // name, label, colour class
  ['jump', 'Jump', 'yellow'],
  ['interact', 'Interact', 'green'],
  ['sit', 'Sit', 'blue'],
  ['wave', 'Wave', 'pink'],
  ['kneel', 'Pray', 'purple'],
];

function isEditable(el) {
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function svg(name) {
  return `<svg class="amen-tc__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/**
 * @param {HTMLElement} [domRoot] where the touch controls are created (e.g. #ui)
 * @param {{touch?: boolean, pressTTL?: number}} [opts] touch: force touch controls on/off (default:
 *   detect); pressTTL: ms an unconsumed press stays valid (default 750)
 */
export function createInput(domRoot = document.body, opts = {}) {
  const held = new Set();
  /** @type {Map<string, number>} name → time pressed */
  const pressed = new Map();
  const move = { x: 0, y: 0 };
  const look = { dx: 0, dy: 0 };
  let zoom = 0;
  let enabled = true;
  /** Mouse look (pointer lock) instead of drag-to-look. */
  let mouseLook = false;
  let shift = false;

  // ------------------------------------------------------------------ DOM
  const root = document.createElement('div');
  root.className = 'amen-tc';
  root.setAttribute('aria-label', 'Touch controls');
  root.innerHTML = `
    <div class="amen-tc__stick" aria-hidden="true">
      <div class="amen-tc__base">
        <span class="amen-tc__chev amen-tc__chev--n"></span><span class="amen-tc__chev amen-tc__chev--e"></span>
        <span class="amen-tc__chev amen-tc__chev--s"></span><span class="amen-tc__chev amen-tc__chev--w"></span>
      </div>
      <div class="amen-tc__knob"></div>
      <div class="amen-tc__run">Run</div>
    </div>
    <div class="amen-tc__pad" role="group" aria-label="Actions">
      ${BUTTONS.map(([name, label, color]) => `
        <button type="button" class="amen-tc__btn amen-tc__btn--${name} is-${color}" data-action="${name}" aria-label="${label}">
          ${svg(name)}<span class="amen-tc__label">${label}</span>
        </button>`).join('')}
    </div>`;
  domRoot.appendChild(root);
  const stickEl = /** @type {HTMLElement} */ (root.querySelector('.amen-tc__stick'));
  const knobEl = /** @type {HTMLElement} */ (root.querySelector('.amen-tc__knob'));
  /** @type {Record<string, HTMLButtonElement>} */
  const buttons = {};
  for (const b of root.querySelectorAll('button[data-action]')) buttons[b.dataset.action] = /** @type {HTMLButtonElement} */ (b);
  const defaultLabels = Object.fromEntries(BUTTONS.map(([n, l]) => [n, l]));

  // Canvases receive the drag gestures: stop the browser from panning / zooming on them.
  for (const c of document.querySelectorAll('canvas')) c.style.touchAction = 'none';

  // ------------------------------------------------------------------ touch detection
  const mq = (q) => { try { return window.matchMedia(q).matches; } catch { return false; } };
  let isTouch = opts.touch ?? (mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mq('(pointer: fine)')));
  function setTouch(on) {
    if (opts.touch !== undefined) on = opts.touch;
    isTouch = on;
    root.dataset.touch = on ? 'true' : 'false';
  }
  setTouch(isTouch);

  // ------------------------------------------------------------------ keyboard
  function press(name) {
    if (!enabled && name !== 'escape') return;
    pressed.set(name, performance.now());
  }
  function onKeyDown(e) {
    if (isEditable(e.target) || isEditable(document.activeElement)) return;
    shift = e.shiftKey;
    if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) { if (!e.repeat) press('help'); e.preventDefault(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!enabled && e.code !== 'Escape') return;
    if (MOVE_KEYS[e.code] || e.code === 'ShiftLeft' || e.code === 'ShiftRight') held.add(e.code);
    const name = KEYMAP[e.code];
    if (name && !e.repeat) press(name);
    if (PREVENT.has(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    shift = e.shiftKey;
    held.delete(e.code);
  }
  function clearHeld() { held.clear(); shift = false; }
  function onFocusIn(e) { if (isEditable(e.target)) clearHeld(); }

  // ------------------------------------------------------------------ pointers
  const STICK_TRAVEL = 46; // px
  const DEAD = 0.12;
  const stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, mag: 0 };
  /** @type {Map<number, {x: number, y: number}>} */
  const lookers = new Map();
  let pinchDist = 0;
  let mouseDrag = -1;
  let lastLookAt = -1e9;
  let gesture = false; // a look gesture is in progress

  const isGameTarget = (t) => {
    if (!t || !(t instanceof Element)) return false;
    if (t.tagName === 'CANVAS') return true;
    return t === document.body || t === document.documentElement || t === domRoot || t === root;
  };

  function placeStick(x, y) {
    const r = 70;
    const cx = Math.max(r + 8, Math.min(window.innerWidth / 2 - 20, x));
    const cy = Math.max(r + 8, Math.min(window.innerHeight - r - 8, y));
    stick.ox = cx; stick.oy = cy;
    stickEl.style.left = `${cx}px`;
    stickEl.style.top = `${cy}px`;
    stickEl.style.bottom = 'auto';
  }
  function updateStick(x, y) {
    let dx = x - stick.ox, dy = y - stick.oy;
    const d = Math.hypot(dx, dy);
    // Drag the base along when the thumb goes far past the rim (floating stick).
    const follow = STICK_TRAVEL * 1.6;
    if (d > follow) {
      const k = (d - follow) / d;
      placeStick(stick.ox + dx * k, stick.oy + dy * k);
      dx = x - stick.ox; dy = y - stick.oy;
    }
    const dd = Math.hypot(dx, dy);
    const cl = Math.min(dd, STICK_TRAVEL);
    const kx = dd > 0 ? (dx / dd) * cl : 0, ky = dd > 0 ? (dy / dd) * cl : 0;
    knobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    const raw = Math.min(1, dd / STICK_TRAVEL);
    const mag = raw < DEAD ? 0 : (raw - DEAD) / (1 - DEAD);
    stick.mag = mag;
    stick.x = dd > 0 ? (dx / dd) * mag : 0;
    stick.y = dd > 0 ? (-dy / dd) * mag : 0;
    stickEl.classList.toggle('is-run', mag > 0.9);
  }
  function releaseStick() {
    stick.id = -1; stick.x = 0; stick.y = 0; stick.mag = 0;
    knobEl.style.transform = '';
    stickEl.classList.remove('is-active', 'is-run');
    stickEl.style.left = ''; stickEl.style.top = ''; stickEl.style.bottom = '';
  }

  function onPointerDown(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { if (!isTouch) setTouch(true); }
    if (!enabled || !isGameTarget(e.target)) return;
    if (e.pointerType === 'mouse') {
      // Mouse look: a click locks the pointer, then moving the mouse turns the camera (Esc frees it).
      if (mouseLook && e.button === 0 && !document.pointerLockElement && e.target?.tagName === 'CANVAS') {
        try { const r = e.target.requestPointerLock?.(); r?.catch?.(() => {}); } catch { /* not allowed here */ }
        return;
      }
      if (document.pointerLockElement) return;
      if (e.button !== 0 && e.button !== 2) return;
      mouseDrag = e.pointerId;
      lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { e.target.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
      return;
    }
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.5 && stick.id === -1) {
      stick.id = e.pointerId;
      placeStick(e.clientX, e.clientY);
      stickEl.classList.add('is-active');
      updateStick(e.clientX, e.clientY);
      return;
    }
    lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (lookers.size === 2) {
      const [a, b] = [...lookers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function onPointerMove(e) {
    if (document.pointerLockElement && e.pointerType === 'mouse') {
      if (enabled && (e.movementX || e.movementY)) { look.dx += e.movementX * 0.8; look.dy += e.movementY * 0.8; lastLookAt = performance.now(); }
      return;
    }
    if (e.pointerType === 'mouse' && isTouch && opts.touch === undefined && (e.movementX || e.movementY) && stick.id === -1 && lookers.size === 0) setTouch(false);
    if (e.pointerId === stick.id) { updateStick(e.clientX, e.clientY); return; }
    const p = lookers.get(e.pointerId);
    if (!p) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 3)) { lookers.delete(e.pointerId); mouseDrag = -1; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!enabled) return;
    if (lookers.size >= 2) {
      const [a, b] = [...lookers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) zoom += (pinchDist - d) / 70;
      pinchDist = d;
      return;
    }
    if (dx || dy) {
      look.dx += dx; look.dy += dy;
      lastLookAt = performance.now();
      gesture = true;
    }
  }
  function onPointerUp(e) {
    if (e.pointerId === stick.id) releaseStick();
    if (lookers.delete(e.pointerId)) {
      if (e.pointerId === mouseDrag) mouseDrag = -1;
      if (lookers.size < 2) pinchDist = 0;
      if (lookers.size === 0) gesture = false;
    }
  }
  function onWheel(e) {
    if (!enabled || !isGameTarget(e.target)) return;
    e.preventDefault();
    // Laptop touchpads: pinch arrives as ctrl+wheel (zoom), a two-finger sideways swipe turns the
    // camera, a two-finger up/down swipe zooms. A mouse wheel zooms.
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaMode === 0) {
      look.dx += e.deltaX * 0.9;
      lastLookAt = performance.now();
      return;
    }
    const unit = e.deltaMode === 1 ? 1 / 3 : e.deltaMode === 2 ? 1 : e.ctrlKey ? 1 / 25 : 1 / 100;
    zoom += Math.max(-3, Math.min(3, e.deltaY * unit));
  }
  function onContextMenu(e) { if (isGameTarget(e.target)) e.preventDefault(); }
  function onBlur() { clearHeld(); releaseStick(); lookers.clear(); mouseDrag = -1; pinchDist = 0; gesture = false; }

  // Buttons: act on pointerdown (instant), keyboard clicks still work.
  for (const [name, btn] of Object.entries(buttons)) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!isTouch && e.pointerType !== 'mouse') setTouch(true);
      btn.classList.add('is-down');
      press(name);
      try { navigator.vibrate?.(8); } catch { /* no haptics */ }
    });
    const up = () => btn.classList.remove('is-down');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('click', (e) => { if (e.detail === 0) press(name); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const opt = { passive: false };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('focusin', onFocusIn);
  window.addEventListener('pointerdown', onPointerDown, opt);
  window.addEventListener('pointermove', onPointerMove, opt);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('wheel', onWheel, opt);
  window.addEventListener('contextmenu', onContextMenu);
  const onVis = () => { if (document.hidden) onBlur(); };
  document.addEventListener('visibilitychange', onVis);

  function readMove() {
    if (!enabled) { move.x = 0; move.y = 0; return move; }
    let x = 0, y = 0;
    for (const code of held) { const m = MOVE_KEYS[code]; if (m) { x += m[0]; y += m[1]; } }
    const kl = Math.hypot(x, y);
    if (kl > 0) { x /= kl; y /= kl; }
    if (stick.id !== -1 && stick.mag > 0) { x = stick.x; y = stick.y; }
    move.x = x; move.y = y;
    return move;
  }

  const input = {
    /** Movement {x, y} in −1..1 (x right, y forward). Read every frame. */
    get move() { return readMove(); },
    /** True while the movement comes from the keyboard (not the touch joystick): keys steer. */
    get keyboardMove() { return enabled && !(stick.id !== -1 && stick.mag > 0) && [...held].some((c) => MOVE_KEYS[c]); },
    /** Run modifier: Shift held, or the joystick pushed past 90 %. */
    get run() {
      if (!enabled) return false;
      if (stick.id !== -1) return stick.mag > 0.9;
      return shift || held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** Pixels dragged since the last call (mouse drag / right-half touch drag). */
    lookDelta() {
      const out = { dx: look.dx, dy: look.dy };
      look.dx = 0; look.dy = 0;
      return out;
    },
    /** Zoom steps since the last call (+ = out). One wheel notch ≈ 1. */
    zoomDelta() { const z = zoom; zoom = 0; return z; },
    /**
     * True once per press of an action: jump, sit, kneel, wave, clap, dance, interact,
     * chat, help, endday, escape.
     * @param {string} name
     */
    consume(name) {
      const t = pressed.get(name);
      if (t === undefined) return false;
      pressed.delete(name);
      return performance.now() - t <= (opts.pressTTL ?? PRESS_TTL);
    },
    /** Queue an action as if its key was pressed (for UI buttons elsewhere). */
    trigger(name) { press(name); },
    /** True while the player is dragging the view (camera pauses auto-follow). */
    get looking() { return gesture || mouseDrag !== -1 || performance.now() - lastLookAt < 120; },
    /** performance.now() of the last look drag. */
    get lastLookAt() { return lastLookAt; },
    /** Touch controls are showing. */
    get touch() { return isTouch; },
    /** The joystick (or keys) are being used this frame. */
    get moving() { const m = readMove(); return m.x !== 0 || m.y !== 0; },
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = !!v;
      root.classList.toggle('is-disabled', !enabled);
      if (!enabled) { clearHeld(); releaseStick(); lookers.clear(); mouseDrag = -1; look.dx = 0; look.dy = 0; zoom = 0; pressed.clear(); gesture = false; if (document.pointerLockElement) document.exitPointerLock?.(); }
    },
    /** Show or hide the touch controls (e.g. while a full-screen panel is open). */
    setVisible(v) { root.classList.toggle('is-hidden', !v); },
    /**
     * Change a touch button: a context label (e.g. interact → 'Buy food', sit → 'Stand'),
     * highlight it, or hide it. Pass label null to restore the default.
     * @param {'jump'|'interact'|'sit'|'wave'|'kneel'} name
     * @param {{label?: string|null, active?: boolean, hidden?: boolean}} s
     */
    setButton(name, s = {}) {
      const b = buttons[name];
      if (!b) return;
      if ('label' in s) {
        const text = s.label || defaultLabels[name];
        const span = b.querySelector('.amen-tc__label');
        if (span && span.textContent !== text) { span.textContent = text; b.setAttribute('aria-label', text); }
      }
      if ('active' in s) b.classList.toggle('is-hint', !!s.active);
      if ('hidden' in s) b.hidden = !!s.hidden;
    },
    /** Mouse look: click the 3D view to steer the camera with the mouse; Esc to stop. */
    get mouseLook() { return mouseLook; },
    set mouseLook(v) {
      mouseLook = !!v;
      if (!mouseLook && document.pointerLockElement) document.exitPointerLock?.();
    },
    /** True while the pointer is locked to the 3D view. */
    get pointerLocked() { return !!document.pointerLockElement; },
    /** Force touch controls on/off (settings). */
    setTouch(on) { opts.touch = on; setTouch(on); },
    /** The touch-controls root element. */
    element: root,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('pointerdown', onPointerDown, opt);
      window.removeEventListener('pointermove', onPointerMove, opt);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('wheel', onWheel, opt);
      window.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('visibilitychange', onVis);
      root.remove();
    },
  };
  return input;
}
