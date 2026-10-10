// Chat UI: recent-lines feed over the 3D view, a chat panel (Enter / T to open,
// Esc to close) with the room log, quick phrases, report / block, and the
// online-count chip ("● 23 online"). Neo-brutalist, mobile first.
import { ROLE_LABEL, ROLE_COLOR } from '../net/roles.js';
import './chat.css';

export const QUICK_PHRASES = ['God bless you 🙏', 'Amen!', 'Good morning', 'Welcome!', 'How body?', 'Hallelujah! 🙌', 'Thank you', 'See you on Sunday'];

const ICON = {
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.02l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.93"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
};
const svg = (name) => `<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const clock = (ts) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
const typingTarget = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * @param {any} ctx engine context (uses ctx.bus and ctx.onUpdate)
 * @param {{net: ReturnType<typeof import('../net/client.js').createNet>, root?: HTMLElement, input?: any, roomLabel?: string}} o
 */
export function createChatUI(ctx, { net, root, input = null, roomLabel }) {
  const host = root || document.getElementById('ui') || document.body;
  const room = roomLabel || (net.room ? net.room.charAt(0).toUpperCase() + net.room.slice(1) : 'Chat');
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

  const wrap = el('section', 'chat');
  wrap.setAttribute('aria-label', 'Chat');
  wrap.innerHTML = `
    <div class="chat-feed" aria-hidden="true"></div>
    <button type="button" class="chat-toggle" aria-expanded="false" aria-controls="chat-panel" aria-keyshortcuts="Enter T">
      ${svg('chat')}<span class="chat-toggle-label">Chat</span>
      <span class="chat-count" title=""><i class="chat-dot"></i><b>0</b></span>
      <span class="chat-unread" hidden>0</span>
    </button>
    <div class="chat-panel" id="chat-panel" role="dialog" aria-label="Chat" hidden>
      <header class="chat-head">
        <div class="chat-title"><h2>Chat</h2><span class="chat-room"></span></div>
        <span class="chat-chip" role="status"><i class="chat-dot"></i><span class="chat-chip-text">Connecting…</span></span>
        <button type="button" class="chat-close" aria-label="Close chat">${svg('x')}</button>
      </header>
      <ol class="chat-log" role="log" aria-live="polite" aria-relevant="additions"></ol>
      <div class="chat-notice" role="alert" hidden></div>
      <div class="chat-quick" role="group" aria-label="Quick phrases"></div>
      <form class="chat-form" autocomplete="off">
        <label class="sr-only" for="chat-input">Message</label>
        <input id="chat-input" class="chat-input" type="text" maxlength="200" enterkeyhint="send" autocomplete="off"
          autocorrect="on" spellcheck="true" placeholder="Say something nice…" />
        <span class="chat-counter" aria-hidden="true" hidden></span>
        <button type="submit" class="chat-send" aria-label="Send">${svg('send')}</button>
      </form>
      <div class="chat-blocked" hidden><span></span><button type="button">Unblock all</button></div>
    </div>
    <div class="chat-menu" role="menu" hidden>
      <div class="chat-menu-title"></div>
      <button type="button" role="menuitem" data-act="report">${svg('flag')}<span>Report</span></button>
      <button type="button" role="menuitem" data-act="block">${svg('ban')}<span>Block</span></button>
      <button type="button" role="menuitem" data-act="cancel" class="chat-menu-cancel">Cancel</button>
    </div>`;
  host.appendChild(wrap);

  const $ = (s) => /** @type {HTMLElement} */ (wrap.querySelector(s));
  const feed = $('.chat-feed');
  const toggle = $('.chat-toggle');
  const countEl = $('.chat-count b');
  const countWrap = $('.chat-count');
  const unreadEl = $('.chat-unread');
  const panel = $('.chat-panel');
  const log = $('.chat-log');
  const notice = $('.chat-notice');
  const chipText = $('.chat-chip-text');
  const quick = $('.chat-quick');
  const form = /** @type {HTMLFormElement} */ ($('.chat-form'));
  const field = /** @type {HTMLInputElement} */ ($('.chat-input'));
  const counter = $('.chat-counter');
  const blockedBar = $('.chat-blocked');
  const menu = $('.chat-menu');
  $('.chat-room').textContent = room;

  for (const phrase of QUICK_PHRASES) {
    const b = el('button', 'chat-phrase', phrase);
    b.type = 'button';
    quick.appendChild(b);
  }

  /** id → {name, role} so leave lines and menus have names after a player is gone */
  const names = new Map();
  let isOpen = false;
  let openedByKey = false;
  let unread = 0;
  let quietUntil = 0;
  let noticeTimer = 0;
  let menuFor = null;

  // ------------------------------------------------------------ status / counts
  function renderStatus() {
    const mode = net.mode;
    wrap.dataset.mode = mode;
    const n = net.online || 1;
    let chip;
    let title;
    if (mode === 'ws') {
      chip = `${n} online`;
      title = net.total > n ? `${n} here · ${net.total} in Amen City` : `${n} online here`;
    } else if (mode === 'local') {
      chip = n > 1 ? `${n} on this device` : 'Offline · this device';
      title = 'Server unreachable — you can still chat with other tabs on this device. Reconnecting in the background.';
    } else if (mode === 'connecting') {
      chip = 'Connecting…';
      title = 'Connecting to the server…';
    } else {
      chip = 'Offline';
      title = 'You are offline.';
    }
    chipText.textContent = chip;
    countEl.textContent = mode === 'ws' || mode === 'local' ? String(n) : '…';
    countWrap.title = title;
    $('.chat-chip').title = title;
    toggle.setAttribute('aria-label', `Open chat. ${chip}`);
  }

  function renderBlocked() {
    const n = net.blocked.names.length + net.blocked.ids.filter((id) => !net.blocked.names.includes(names.get(id)?.name?.toLowerCase())).length;
    blockedBar.hidden = n === 0;
    blockedBar.querySelector('span').textContent = `${n} blocked on this device · `;
    for (const li of log.querySelectorAll('li[data-id]')) li.hidden = !li.classList.contains('self') && net.isBlocked(li.dataset.id);
  }

  function showNotice(text, kind = 'warn', ms = 4500) {
    notice.textContent = text;
    notice.dataset.kind = kind;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, ms);
    if (!isOpen && kind === 'warn') feedLine({ name: '', text, sys: true });
  }

  // ------------------------------------------------------------ log
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  function trimLog() { while (log.children.length > 120) log.firstElementChild.remove(); }

  function addLine(m, { scroll = true } = {}) {
    const stick = nearBottom();
    const prev = log.lastElementChild;
    // Consecutive lines from the same person within two minutes share one header.
    const cont = prev && prev.dataset.id === m.id && !prev.classList.contains('sys') && m.ts - Number(prev.dataset.ts || 0) < 120_000;
    const li = el('li', `msg${m.self ? ' self' : ''}${cont ? ' cont' : ''}`);
    li.dataset.id = m.id;
    li.dataset.ts = String(m.ts || Date.now());
    const meta = el('div', 'msg-meta');
    if (m.self) meta.appendChild(el('span', 'msg-you', 'You'));
    else {
      const who = el('button', 'msg-name', m.name);
      who.type = 'button';
      who.dataset.id = m.id;
      who.title = `${m.name} — report or block`;
      meta.appendChild(who);
    }
    if (!m.self) {
      const role = el('span', 'msg-role', ROLE_LABEL[m.role] || 'Visitor');
      role.style.setProperty('--role', ROLE_COLOR[m.role] || '#f4f4f5');
      meta.appendChild(role);
    }
    const time = el('time', 'msg-time', clock(m.ts));
    time.dateTime = new Date(m.ts || Date.now()).toISOString();
    meta.appendChild(time);
    li.append(meta, el('p', 'msg-text', m.text));
    if (!m.self && net.isBlocked(m.id)) li.hidden = true;
    log.appendChild(li);
    trimLog();
    if (scroll && (stick || m.self)) log.scrollTop = log.scrollHeight;
  }

  function addSystem(text) {
    const li = el('li', 'msg sys', text);
    const stick = nearBottom();
    log.appendChild(li);
    trimLog();
    if (stick) log.scrollTop = log.scrollHeight;
  }

  function renderHistory(history) {
    log.textContent = '';
    if (history.length) {
      for (const m of history) addLine(m, { scroll: false });
      addSystem('Earlier messages');
      log.insertBefore(log.lastElementChild, log.firstElementChild);
    }
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------------------ feed (closed state)
  function feedLine(m) {
    if (isOpen) return;
    const line = el('div', `feed-line${m.self ? ' self' : ''}${m.sys ? ' sys' : ''}`);
    if (m.name) line.appendChild(el('b', '', m.self ? 'You' : m.name));
    line.appendChild(el('span', '', m.text));
    feed.appendChild(line);
    while (feed.children.length > 3) feed.firstElementChild.remove();
    setTimeout(() => line.classList.add('out'), 9000);
    setTimeout(() => line.remove(), 9600);
  }

  // ------------------------------------------------------------ open / close
  function viewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    wrap.style.setProperty('--chat-kb', `${Math.round(kb)}px`);
    wrap.style.setProperty('--chat-vh', `${Math.round(vv.height)}px`);
    wrap.classList.toggle('kb', kb > 80);
  }

  function open(fromKey = false) {
    if (isOpen) { if (fromKey) field.focus(); return; }
    isOpen = true;
    openedByKey = fromKey;
    closeMenu();
    wrap.classList.add('open');
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    unread = 0;
    unreadEl.hidden = true;
    feed.textContent = '';
    log.scrollTop = log.scrollHeight;
    viewport();
    if (fromKey || !touch) field.focus({ preventScroll: true });
    ctx.bus?.emit('ui:chat', { open: true });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    closeMenu();
    wrap.classList.remove('open', 'kb');
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (document.activeElement && wrap.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur();
    ctx.bus?.emit('ui:chat', { open: false });
  }

  // ------------------------------------------------------------ report / block menu
  function openMenu(id, anchor) {
    const info = names.get(id);
    if (!info) return;
    menuFor = id;
    menu.querySelector('.chat-menu-title').textContent = info.name;
    menu.hidden = false;
    const a = anchor.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const mw = 200;
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - mw - 8, a.left)) - w.left}px`;
    menu.style.top = `${a.bottom + 6 - w.top}px`;
    // Flip above when there is no room below.
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8) menu.style.top = `${a.top - r.height - 6 - w.top}px`;
    });
    /** @type {HTMLElement} */ (menu.querySelector('[data-act="report"]')).focus();
  }
  function closeMenu() { menu.hidden = true; menuFor = null; }

  menu.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b || !menuFor) return;
    const id = menuFor;
    const name = names.get(id)?.name || 'This player';
    closeMenu();
    if (b.dataset.act === 'report') {
      net.report(id, 'chat');
      showNotice(`Thanks. ${name} has been reported to the moderators and hidden for you.`, 'ok');
    } else if (b.dataset.act === 'block') {
      net.block(id);
      showNotice(`${name} is blocked on this device. You won't see their messages.`, 'ok');
    }
    field.focus({ preventScroll: true });
  });

  // ------------------------------------------------------------ sending
  function send(text) {
    const t = text.trim();
    if (!t) return false;
    const ok = net.sendChat(t);
    if (ok) ctx.bus?.emit('chat:local', { text: t });
    return ok;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = field.value;
    if (!text.trim()) { close(); return; }
    if (send(text)) {
      field.value = '';
      counter.hidden = true;
      if (openedByKey && !touch) close();
    }
  });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    e.stopPropagation(); // keep game shortcuts out of the text field
  });
  field.addEventListener('input', () => {
    const n = Array.from(field.value).length;
    counter.hidden = n < 150;
    counter.textContent = `${n}/200`;
    counter.classList.toggle('max', n >= 200);
  });
  quick.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.chat-phrase');
    if (b) send(b.textContent || '');
  });
  toggle.addEventListener('click', () => open(false));
  $('.chat-close').addEventListener('click', close);
  blockedBar.querySelector('button').addEventListener('click', () => { net.unblockAll(); showNotice('Unblocked everyone.', 'ok', 2500); });
  log.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.msg-name');
    if (b) openMenu(b.dataset.id, b);
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); if (!menu.hidden) closeMenu(); else close(); } });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeMenu(); field.focus(); } });
  const onDocDown = (e) => { if (!menu.hidden && !menu.contains(/** @type {Node} */ (e.target))) closeMenu(); };
  document.addEventListener('pointerdown', onDocDown);

  // Keyboard shortcuts when no input module is wired: Enter / T open, Esc closes.
  const onKey = (e) => {
    if (input || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typingTarget(e.target)) return;
    if (!isOpen && (e.key === 'Enter' || e.key === 't' || e.key === 'T')) { e.preventDefault(); open(true); }
    else if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); }
  };
  window.addEventListener('keydown', onKey);
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);

  const offUpdate = input && ctx.onUpdate ? ctx.onUpdate(() => {
    if (input.consume('chat')) open(true);
    if (isOpen && input.consume('escape')) close();
  }) : null;

  // ------------------------------------------------------------ net events
  const offs = [
    net.on('status', renderStatus),
    net.on('online', renderStatus),
    net.on('welcome', (w) => {
      quietUntil = performance.now() + 1500;
      for (const p of w.players) names.set(p.id, { name: p.name, role: p.role });
      renderHistory(w.history || []);
      addSystem(w.mode === 'local'
        ? 'Server unreachable. Chatting with other tabs on this device.'
        : w.resumed ? 'Reconnected.' : `You joined ${room}. Be kind — this is God's house. 🙏`);
      renderStatus();
    }),
    net.on('join', (p) => {
      const known = names.has(p.id);
      names.set(p.id, { name: p.name, role: p.role });
      if (!p.update && !known && performance.now() > quietUntil) addSystem(`${p.name} joined`);
    }),
    net.on('leave', ({ id }) => {
      const info = names.get(id);
      if (info && performance.now() > quietUntil) addSystem(`${info.name} left`);
    }),
    net.on('chat', (m) => {
      names.set(m.id, { name: m.name, role: m.role });
      addLine(m);
      feedLine(m);
      if (!isOpen && !m.self) {
        unread++;
        unreadEl.textContent = unread > 9 ? '9+' : String(unread);
        unreadEl.hidden = false;
      }
      ctx.bus?.emit('chat:message', { from: m.name, text: m.text, id: m.id, self: m.self, role: m.role, ts: m.ts });
    }),
    net.on('error', (e) => showNotice(e.message, 'warn')),
    net.on('blocked', renderBlocked),
  ];

  renderStatus();
  renderHistory(net.history);
  renderBlocked();

  const chatUI = {
    element: wrap,
    open: () => open(true),
    close,
    toggle() { if (isOpen) close(); else open(true); },
    get isOpen() { return isOpen; },
    addSystem,
    dispose() {
      offs.forEach((off) => off());
      offUpdate?.();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDocDown);
      window.visualViewport?.removeEventListener('resize', viewport);
      window.visualViewport?.removeEventListener('scroll', viewport);
      wrap.remove();
    },
  };
  return chatUI;
}
