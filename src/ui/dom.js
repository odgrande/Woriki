// Tiny DOM helpers for the UI. All user-facing text goes through textContent;
// only trusted icon markup (src/ui/icons.js) is set as HTML.
import { icon } from './icons.js';

/**
 * Create an element.
 * @param {string} tag e.g. 'div.card.is-open' (classes after dots)
 * @param {object|null} [props] {text, html, on: {click}, attrs, data, style, ...DOM props}
 * @param {...(Node|string|null|false|Array)} children
 */
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className += ` ${v}`;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'attrs') for (const [a, av] of Object.entries(v)) { if (av !== false && av != null) el.setAttribute(a, av === true ? '' : av); }
      else if (k === 'data') Object.assign(el.dataset, v);
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
      }
      else el[k] = v;
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** An icon as a DOM node. */
export function ic(name, o) {
  const t = document.createElement('template');
  t.innerHTML = icon(name, o);
  return t.content.firstElementChild;
}

/** Replace all children. */
export function setChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

/** Read / write localStorage safely. */
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
};

/** Elements that can take focus inside a container. */
export function focusables(root) {
  return [...root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((e) => e.offsetParent !== null || e === document.activeElement);
}

/** Keep Tab focus inside `root` while it is open. Returns an uninstall function. */
export function trapFocus(root) {
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const f = focusables(root);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

export const prefersReducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
